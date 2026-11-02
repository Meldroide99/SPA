// Mapas ráster georreferenciados (GeoTIFF, imagen + archivo de mundo, KMZ)
// pintados sobre el mapa web con REPROYECCIÓN EXACTA:
//
// para cada tesela de 256 px se calcula con el motor la posición en el mapa
// de origen de una malla de 17 × 17 puntos (cada 16 px) y se interpola
// dentro de cada celdilla. El error de esa interpolación es muy inferior a
// un píxel (prueba en pruebas/datos.test.mjs). Se elige el nivel de detalle
// del archivo que corresponde al zoom (las reducciones internas del GeoTIFF).

import { abrirTiff, lectorBlob, aRgba } from './tiff.js';
import { crsDesdeEpsg, epsgDesdeTexto } from '../geo/crs.js';

const lonX = (X, z) => (X / (256 * 2 ** z)) * 360 - 180;
const latY = (Y, z) => { const n = Math.PI - (2 * Math.PI * Y) / (256 * 2 ** z); return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

/** Inversa de un afín [a,b,c,d,e,f] (x = a·i + b·j + c ; y = d·i + e·j + f). */
export function invertirAfin([a, b, c, d, e, f]) {
  const det = a * e - b * d;
  return [e / det, -b / det, (b * f - e * c) / det, -d / det, a / det, (d * c - a * f) / det];
}
const aplicar = ([a, b, c, d, e, f], x, y) => [a * x + b * y + c, d * x + e * y + f];

/** Límites WGS84 de un mapa (recorriendo su borde). */
export function limitesFuente(f) {
  let s = Infinity, n = -Infinity, o = Infinity, e = -Infinity;
  const N = 32;
  for (let k = 0; k <= N; k++) {
    for (const [i, j] of [[k / N, 0], [k / N, 1], [0, k / N], [1, k / N]]) {
      const [x, y] = aplicar(f.afin, i * f.ancho, j * f.alto);
      const g = f.crs.aGeo(x, y); if (!g) continue;
      s = Math.min(s, g.lat); n = Math.max(n, g.lat); o = Math.min(o, g.lon); e = Math.max(e, g.lon);
    }
  }
  return Number.isFinite(s) ? { sur: s, norte: n, oeste: o, este: e } : null;
}

// ---------------------------------------------------------------- fuentes
/**
 * GeoTIFF → fuente. `epsgForzado` si el archivo no trae su sistema.
 */
export async function fuenteGeoTiff(blob, { epsgForzado, prj } = {}) {
  const tif = await abrirTiff(lectorBlob(blob));
  const g = tif.geo;
  if (!g.afin) throw new Error('El TIFF no está georreferenciado (no tiene GeoTIFF ni archivo .tfw)');
  const epsg = epsgForzado ?? g.epsg ?? epsgDesdeTexto(prj) ?? epsgDesdeTexto(g.citas);
  const crs = epsg && crsDesdeEpsg(epsg);
  const principal = tif.imagenes[0];
  const niveles = tif.imagenes.map((im) => ({ im, factor: principal.ancho / im.ancho }));
  // Estiramiento para datos de 16 bits / flotantes (con el nivel más pequeño)
  let rango = null;
  if (!(principal.bits === 8 && principal.formato !== 3) && !principal.colormap) {
    const pequeno = tif.imagenes.at(-1);
    const b = await pequeno.leerBloque(Math.floor(pequeno.bloquesX / 2), Math.floor(pequeno.bloquesY / 2));
    const v = Array.from(b.datos).filter((x) => Number.isFinite(x) && x !== g.nodata && x > -1e30).sort((p, q) => p - q);
    rango = v.length ? { min: v[Math.floor(v.length * 0.02)], max: v[Math.floor(v.length * 0.98)] } : { min: 0, max: 255 };
  }
  const cacheBloques = cacheLimitada(160 * 1048576);
  return {
    tipo: 'GeoTIFF', ancho: principal.ancho, alto: principal.alto, afin: g.afin, epsg, crs, nodata: g.nodata,
    sinSistema: !crs,
    descripcion: `${principal.ancho} × ${principal.alto} px · ${principal.muestras} banda${principal.muestras > 1 ? 's' : ''} · ${principal.bits} bits · ${tif.imagenes.length} nivel${tif.imagenes.length > 1 ? 'es' : ''}`,
    niveles: niveles.map(({ im, factor }, nivel) => ({
      factor, ancho: im.ancho, alto: im.alto, bloqueAncho: im.bloqueAncho, bloqueAlto: im.bloqueAlto,
      /** Tanda de filas de bloques (para las vistas reducidas): [[bloques de la fila by0], …] */
      async tanda(by0, n) {
        const lista = [];
        for (let by = by0; by < by0 + n; by++) for (let bx = 0; bx < im.bloquesX; bx++) lista.push([bx, by]);
        const bs = await im.leerBloques(lista);
        const filas = [];
        for (let k = 0; k < n; k++) filas.push(bs.slice(k * im.bloquesX, (k + 1) * im.bloquesX).map((b) => ({ rgba: aRgba(im, b, rango, g.nodata), ancho: b.ancho, alto: b.alto })));
        return filas;
      },
      async bloque(bx, by) {
        const k = `${nivel}/${bx}/${by}`;
        let p = cacheBloques.get(k);
        if (!p) {
          p = im.leerBloque(bx, by).then((b) => ({ rgba: aRgba(im, b, rango, g.nodata), ancho: b.ancho, alto: b.alto }));
          cacheBloques.poner(k, p, im.bloqueAncho * im.bloqueAlto * 4);
          p.catch(() => cacheBloques.delete(k));
        }
        return p;
      },
    })),
  };
}

/** Imagen normal (JPG/PNG) con su archivo de mundo y, si hay, .prj. */
export async function fuenteImagen(blob, mundo, { epsg, prj } = {}) {
  const v = String(mundo).trim().split(/\s+/).map(Number);
  if (v.length < 6 || v.some((x) => !Number.isFinite(x))) throw new Error('Archivo de mundo (.jgw/.pgw/.tfw) no válido');
  // A D B E C F ; C,F = centro del píxel superior izquierdo
  const [A, D, B, E, C, F] = v;
  const afin = [A, B, C - A / 2 - B / 2, D, E, F - D / 2 - E / 2];
  const cod = epsg ?? epsgDesdeTexto(prj);
  return fuenteBitmap(blob, afin, cod, 'Imagen georreferenciada');
}

/** Superposición de KML (LatLonBox con rotación, en grados WGS84). */
export async function fuenteSuperposicion(sup) {
  const bmp = await createImageBitmap(sup.blob);
  const W = bmp.width, H = bmp.height; bmp.close?.();
  const cx = (sup.este + sup.oeste) / 2, cy = (sup.norte + sup.sur) / 2;
  const sx = (sup.este - sup.oeste) / W, sy = (sup.norte - sup.sur) / H;
  const t = ((sup.rotacion || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  // píxel → desplazamiento sin rotar → rotación antihoraria alrededor del centro
  const a = sx * c, b = sy * s, d = sx * s, e = -sy * c;
  const x0 = -W / 2 * sx, y0 = H / 2 * sy;
  const afin = [a, b, cx + x0 * c - y0 * s, d, e, cy + x0 * s + y0 * c];
  return fuenteBitmap(sup.blob, afin, 4326, 'Superposición KML');
}

async function fuenteBitmap(blob, afin, epsg, tipo) {
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height;
  // Pirámide: nivel 0 hasta 8192 px de lado; cada nivel, la mitad
  const MAX = 8192;
  const niveles = [];
  let f = Math.max(1, Math.max(W, H) / MAX);
  for (;;) {
    const w = Math.max(1, Math.round(W / f)), h = Math.max(1, Math.round(H / f));
    const cv = new OffscreenCanvas(w, h); const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high'; cx.drawImage(bmp, 0, 0, w, h);
    const rgba = cx.getImageData(0, 0, w, h).data;
    const b = { rgba, ancho: w, alto: h };
    niveles.push({ factor: W / w, ancho: w, alto: h, bloqueAncho: w, bloqueAlto: h, bloque: async () => b });
    if (Math.max(w, h) <= 512) break;
    f *= 2;
  }
  bmp.close?.();
  const crs = epsg && crsDesdeEpsg(epsg);
  return { tipo, ancho: W, alto: H, afin, epsg, crs, sinSistema: !crs, descripcion: `${W} × ${H} px`, niveles };
}

// ---------------------------------------------------------------- capa Leaflet
/**
 * Capa que pinta una fuente ráster reproyectada.
 * @param {*} L Leaflet
 */
export function capaRaster(L, fuente, opciones = {}) {
  const inv = invertirAfin(fuente.afin);
  const lim = limitesFuente(fuente);
  const Capa = L.GridLayer.extend({
    createTile(coords, hecho) {
      const lienzo = document.createElement('canvas');
      lienzo.width = lienzo.height = 256;
      pintarTesela(fuente, inv, coords, lienzo).then(() => hecho(null, lienzo), (e) => hecho(e, lienzo));
      return lienzo;
    },
  });
  return new Capa({
    tileSize: 256, maxZoom: 22, minZoom: 3, updateWhenZooming: false, keepBuffer: 1,
    bounds: lim ? L.latLngBounds([lim.sur, lim.oeste], [lim.norte, lim.este]) : undefined,
    ...opciones,
  });
}

/** Pinta una tesela (exportado para las pruebas). */
export async function pintarTesela(fuente, inv, coords, lienzo) {
  const z = coords.z, N = 16, paso = 256 / N;
  // 1) Malla de control: píxel del mapa de origen (nivel completo) para cada nodo
  const mx = new Float64Array((N + 1) * (N + 1)), my = new Float64Array((N + 1) * (N + 1));
  let validos = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const lat = latY(coords.y * 256 + j * paso, z), lon = lonX(coords.x * 256 + i * paso, z);
      const q = fuente.crs.deGeo(lat, lon);
      const k = j * (N + 1) + i;
      if (!q) { mx[k] = my[k] = NaN; continue; }
      const [px, py] = aplicar(inv, q.x, q.y);
      mx[k] = px; my[k] = py; validos++;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
  }
  if (!validos || x1 < 0 || y1 < 0 || x0 > fuente.ancho || y0 > fuente.alto) return;
  // 2) Nivel de detalle: píxeles de origen por píxel de pantalla
  const ratio = Math.max((x1 - x0), (y1 - y0)) / 256;
  let nivel = fuente.niveles[0];
  for (const n of fuente.niveles) if (n.factor <= ratio * 1.01) nivel = n;
  // 3) Bloques necesarios
  const f = nivel.factor;
  const bx0 = Math.max(0, Math.floor(x0 / f / nivel.bloqueAncho)), bx1 = Math.min(Math.ceil(nivel.ancho / nivel.bloqueAncho) - 1, Math.floor(x1 / f / nivel.bloqueAncho));
  const by0 = Math.max(0, Math.floor(y0 / f / nivel.bloqueAlto)), by1 = Math.min(Math.ceil(nivel.alto / nivel.bloqueAlto) - 1, Math.floor(y1 / f / nivel.bloqueAlto));
  // Demasiado alejado para este nivel (no hay uno más reducido): no se pinta.
  // Se mide en píxeles a leer, no en bloques (los TIFF por filas tienen bloques de 1 fila).
  const nb = (bx1 - bx0 + 1) * (by1 - by0 + 1);
  if (nb > 2048 || nb * nivel.bloqueAncho * nivel.bloqueAlto > 24e6) return;
  const bloques = new Map();
  const tareas = [];
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    tareas.push(nivel.bloque(bx, by).then((b) => bloques.set(`${bx},${by}`, b), () => {}));
  }
  await Promise.all(tareas);
  // 4) Muestreo (vecino más próximo) con interpolación de la malla de control
  const ctx = lienzo.getContext('2d');
  const img = ctx.createImageData(256, 256);
  const out = img.data;
  for (let cj = 0; cj < N; cj++) for (let ci = 0; ci < N; ci++) {
    const k00 = cj * (N + 1) + ci, k10 = k00 + 1, k01 = k00 + N + 1, k11 = k01 + 1;
    if (Number.isNaN(mx[k00] + mx[k10] + mx[k01] + mx[k11])) continue;
    for (let v = 0; v < paso; v++) {
      const ty = (v + 0.5) / paso;
      const ax = mx[k00] + (mx[k01] - mx[k00]) * ty, ay = my[k00] + (my[k01] - my[k00]) * ty;
      const bxx = mx[k10] + (mx[k11] - mx[k10]) * ty, byy = my[k10] + (my[k11] - my[k10]) * ty;
      for (let u = 0; u < paso; u++) {
        const tx = (u + 0.5) / paso;
        const sx = (ax + (bxx - ax) * tx) / f, sy = (ay + (byy - ay) * tx) / f;
        if (sx < 0 || sy < 0 || sx >= nivel.ancho || sy >= nivel.alto) continue;
        const ix = Math.floor(sx), iy = Math.floor(sy);
        const bl = bloques.get(`${Math.floor(ix / nivel.bloqueAncho)},${Math.floor(iy / nivel.bloqueAlto)}`);
        if (!bl) continue;
        const lx = ix % nivel.bloqueAncho, ly = iy % nivel.bloqueAlto;
        if (lx >= bl.ancho || ly >= bl.alto) continue;
        const o = (ly * bl.ancho + lx) * 4, d = ((cj * paso + v) * 256 + ci * paso + u) * 4;
        out[d] = bl.rgba[o]; out[d + 1] = bl.rgba[o + 1]; out[d + 2] = bl.rgba[o + 2]; out[d + 3] = bl.rgba[o + 3];
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- caché limitada por tamaño
function cacheLimitada(maxBytes) {
  const m = new Map(); let bytes = 0;
  return {
    get: (k) => { const v = m.get(k); if (v) { m.delete(k); m.set(k, v); } return v?.p; },
    poner(k, p, tam) {
      m.set(k, { p, tam }); bytes += tam;
      while (bytes > maxBytes && m.size > 1) { const [k0, v0] = m.entries().next().value; m.delete(k0); bytes -= v0.tam; }
    },
    delete(k) { const v = m.get(k); if (v) { bytes -= v.tam; m.delete(k); } },
    get size() { return m.size; },
  };
}

// ---------------------------------------------------------------- vistas reducidas
// Muchos GeoTIFF militares no traen reducciones internas (p. ej. Alijares:
// 19 996 × 24 008 px a 25 cm, por filas de 1 px). Sin ellas, de lejos habría
// que leer cientos de MB por pantalla y no se pintaba hasta el zoom máximo.
// Se crean una vez, leyendo el archivo de arriba abajo: cada nivel es la
// mitad del anterior (media de 2 × 2 píxeles), en teselas de 256 px
// comprimidas (JPEG; PNG si tienen transparencia).

/** ¿Le hacen falta vistas reducidas? (su nivel más pequeño es grande) */
export function necesitaPiramide(fuente) {
  const n = fuente.niveles.at(-1);
  return Math.max(n.ancho, n.alto) > 1024;
}

/**
 * Calcula las vistas reducidas. Devuelve { niveles: [{factor, ancho, alto}], teselas: Map('n/x/y' → Blob) }.
 * @param {(f:number)=>void} alProgreso fracción 0–1
 */
export async function calcularPiramide(fuente, { alProgreso = () => {}, cancelado = () => false } = {}) {
  const base = fuente.niveles.at(-1);
  const W = base.ancho, H = base.alto;
  const niveles = [];
  for (let w = W, h = H, f = base.factor; Math.max(w, h) > 512;) {
    w = Math.ceil(w / 2); h = Math.ceil(h / 2); f *= 2;
    niveles.push({ factor: f, ancho: w, alto: h, pendiente: null, banda: new Uint8ClampedArray(w * 256 * 4), filas: 0, ty: 0 });
  }
  const teselas = new Map();
  const tareas = [];
  // JPEG si la tesela es opaca (rápido y ligero), PNG si tiene transparencia
  const codificar = async (n, k, rgba, w, h) => {
    let opaca = true;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) { opaca = false; break; }
    const tipo = opaca ? 'image/jpeg' : 'image/png';
    let blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
      blob = await c.convertToBlob({ type: tipo, quality: 0.92 });
    } else {
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
      blob = await new Promise((ok) => c.toBlob(ok, tipo, 0.92));
    }
    teselas.set(k, blob);
  };
  const vaciarBanda = (i) => {
    const n = niveles[i];
    if (!n.filas) return;
    const h = n.filas;
    for (let tx = 0; tx * 256 < n.ancho; tx++) {
      const w = Math.min(256, n.ancho - tx * 256);
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) rgba.set(n.banda.subarray((y * n.ancho + tx * 256) * 4, (y * n.ancho + tx * 256 + w) * 4), y * w * 4);
      tareas.push(codificar(n, `${i}/${tx}/${n.ty}`, rgba, w, h));
    }
    n.ty++; n.filas = 0;
  };
  // Una fila del nivel i-1 (o de la base) entra en el nivel i
  const meterFila = (i, fila, anchoFila) => {
    const n = niveles[i]; if (!n) return;
    if (!n.pendiente) { n.pendiente = fila.slice(); return; }
    const a = n.pendiente, b = fila, out = new Uint8ClampedArray(n.ancho * 4);
    for (let x = 0; x < n.ancho; x++) {
      const x0 = 2 * x * 4, x1 = Math.min(2 * x + 1, anchoFila - 1) * 4, o = x * 4;
      for (let c = 0; c < 4; c++) out[o + c] = (a[x0 + c] + a[x1 + c] + b[x0 + c] + b[x1 + c] + 2) >> 2;
    }
    n.pendiente = null;
    n.banda.set(out, n.filas * n.ancho * 4); n.filas++;
    if (n.filas === 256) vaciarBanda(i);
    meterFila(i + 1, out, n.ancho);
  };
  const filasBloque = base.bloqueAlto, porX = Math.ceil(W / base.bloqueAncho), porY = Math.ceil(H / filasBloque);
  const fila = new Uint8ClampedArray(W * 4);
  // Se leen por tandas de ~2 MB de imagen en paralelo (en un TIFF por filas, cientos de filas a la vez)
  const tanda = Math.max(1, Math.min(256, Math.floor(2e6 / (W * filasBloque))));
  let siguientes = null, actual = null;
  const pedirTanda = (by0) => {
    const n = Math.min(tanda, porY - by0);
    if (base.tanda) { const p = base.tanda(by0, n); return Array.from({ length: n }, (_, k) => p.then((f) => f[k])); }
    return Array.from({ length: n }, (_, k) => Promise.all(Array.from({ length: porX }, (_, bx) => base.bloque(bx, by0 + k).catch(() => null))));
  };
  for (let by = 0; by < porY; by++) {
    if (cancelado()) throw new Error('cancelado');
    if (by % tanda === 0) { siguientes = siguientes ?? pedirTanda(by); actual = siguientes; siguientes = by + tanda < porY ? pedirTanda(by + tanda) : null; }
    const bloques = await actual[by % tanda];
    const alto = Math.min(filasBloque, H - by * filasBloque);
    for (let y = 0; y < alto; y++) {
      fila.fill(0);
      bloques.forEach((bl, bx) => {
        if (!bl || y >= bl.alto) return;
        const w = Math.min(bl.ancho, W - bx * base.bloqueAncho);
        fila.set(bl.rgba.subarray(y * bl.ancho * 4, (y * bl.ancho + w) * 4), bx * base.bloqueAncho * 4);
      });
      meterFila(0, fila, W);
    }
    if (by % 64 === 0) { alProgreso(by / porY); await new Promise((ok) => setTimeout(ok, 0)); }
  }
  // Cierre: filas impares sueltas y bandas a medias
  for (let i = 0; i < niveles.length; i++) {
    const n = niveles[i];
    if (n.pendiente) meterFila(i, n.pendiente, i ? niveles[i - 1].ancho : W); // fila impar final: se empareja consigo misma
    vaciarBanda(i);
  }
  await Promise.all(tareas);
  alProgreso(1);
  return { niveles: niveles.map(({ factor, ancho, alto }) => ({ factor, ancho, alto })), teselas };
}

/** Añade a la fuente los niveles de una pirámide ya calculada (o leída del almacén). */
export function ponerPiramide(fuente, piramide) {
  const cache = cacheLimitada(64 * 1048576);
  piramide.niveles.forEach((n, i) => {
    fuente.niveles.push({
      factor: n.factor, ancho: n.ancho, alto: n.alto, bloqueAncho: 256, bloqueAlto: 256, reducido: true,
      bloque(bx, by) {
        const k = `${i}/${bx}/${by}`;
        let p = cache.get(k);
        if (!p) {
          const b = piramide.teselas.get(k);
          if (!b) return Promise.reject(new Error('sin tesela'));
          p = createImageBitmap(b).then((bm) => {
            const w = bm.width, h = bm.height;
            const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
            const ctx = c.getContext('2d'); ctx.drawImage(bm, 0, 0); bm.close?.();
            return { rgba: ctx.getImageData(0, 0, w, h).data, ancho: w, alto: h };
          });
          cache.poner(k, p, 256 * 256 * 4);
          p.catch(() => cache.delete(k));
        }
        return p;
      },
    });
  });
  fuente.niveles.sort((a, b) => a.factor - b.factor);
}
