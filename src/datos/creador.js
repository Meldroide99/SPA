// Creador de mapas: cálculos puros (sin navegador).
//
//   · Qué teselas de la malla web (EPSG:3857) toca una zona irregular.
//   · Qué capa se usa en cada zoom cuando se juntan varias en un archivo.
//   · Estimación de teselas, tamaño y tiempo.
//
// Las zonas se dan como polígonos {lat, lon}; sus lados son rectos en la
// proyección web, igual que se ven dibujados en el mapa.

export const LIMITE_TESELAS = 250000;   // por encima no se crea (horas de descarga)
export const AVISO_TESELAS = 30000;     // por encima se avisa del tiempo

/** Capas que se pueden descargar, con su zoom máximo útil y su peso medio por tesela. */
export const CAPAS_CREADOR = [
  { id: 'mtn', nombre: 'Topográfico', detalle: 'MTN del IGN (PNG)', zMax: 17, kb: 70, porSeg: 25, ext: 'png' },
  { id: 'hibrido', nombre: 'Híbrido', detalle: 'Imagen + nombres y carreteras (JPEG)', zMax: 20, kb: 32, porSeg: 22, ext: 'jpg' },
  { id: 'base', nombre: 'Mapa base', detalle: 'IGN Base (PNG)', zMax: 17, kb: 30, porSeg: 25, ext: 'png' },
  { id: 'relieve', nombre: 'Relieve', detalle: 'Sombreado del MDT del IGN (JPEG)', zMax: 17, kb: 15, porSeg: 6, ext: 'jpg' },
];

export const teselaX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export function teselaY(lat, z) {
  const f = Math.max(-85.05112878, Math.min(85.05112878, lat)) * (Math.PI / 180);
  return ((1 - Math.log(Math.tan(f) + 1 / Math.cos(f)) / Math.PI) / 2) * 2 ** z;
}
export const lonDeX = (x, z) => (x / 2 ** z) * 360 - 180;
export const latDeY = (y, z) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** z));

/** Metros por píxel de una tesela de 256 px a esa latitud y zoom. */
export const metrosPixel = (lat, z) => (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** Límites geográficos de un polígono. */
export function limitesDe(pol) {
  return {
    sur: Math.min(...pol.map((p) => p.lat)), norte: Math.max(...pol.map((p) => p.lat)),
    oeste: Math.min(...pol.map((p) => p.lon)), este: Math.max(...pol.map((p) => p.lon)),
  };
}

/** Área aproximada (m²) de un polígono pequeño (proyección local). */
export function areaAproximada(pol) {
  if (pol.length < 3) return 0;
  const lat0 = pol.reduce((s, p) => s + p.lat, 0) / pol.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  let a = 0;
  for (let i = 0; i < pol.length; i++) {
    const p = pol[i], q = pol[(i + 1) % pol.length];
    a += p.lon * kx * q.lat * ky - q.lon * kx * p.lat * ky;
  }
  return Math.abs(a) / 2;
}

/**
 * Filas de teselas que toca el polígono a zoom z:
 * [{ y, tramos: [[x0, x1], …] }] con x0..x1 inclusivos, ordenados y sin solapes.
 * Una tesela entra si el polígono la toca, aunque sea un poco.
 */
export function filasPoligono(pol, z) {
  if (pol.length < 3) return [];
  const n = 2 ** z;
  const P = pol.map((p) => [teselaX(p.lon, z), teselaY(p.lat, z)]);
  const yMin = Math.max(0, Math.floor(Math.min(...P.map((p) => p[1]))));
  const yMax = Math.min(n - 1, Math.floor(Math.max(...P.map((p) => p[1]))));
  const filas = [];
  for (let y = yMin; y <= yMax; y++) {
    const tramos = [];
    // 1) Bordes: cada lado recortado a la franja [y, y+1] toca las teselas de su recorrido
    for (let i = 0; i < P.length; i++) {
      let [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      if (Math.max(y1, y2) < y || Math.min(y1, y2) > y + 1) continue;
      if (y1 !== y2) {
        const t = (v) => (v - y1) / (y2 - y1);
        let ta = t(y), tb = t(y + 1);
        if (ta > tb) [ta, tb] = [tb, ta];
        ta = Math.max(0, ta); tb = Math.min(1, tb);
        const xa = x1 + ta * (x2 - x1), xb = x1 + tb * (x2 - x1);
        x1 = xa; x2 = xb;
      }
      tramos.push([Math.floor(Math.min(x1, x2)), Math.floor(Math.max(x1, x2))]);
    }
    // 2) Interior: cruces con la línea media de la franja (par-impar)
    const ym = y + 0.5, cruces = [];
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      if ((y1 <= ym) !== (y2 <= ym)) cruces.push(x1 + ((ym - y1) / (y2 - y1)) * (x2 - x1));
    }
    cruces.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cruces.length; k += 2) tramos.push([Math.floor(cruces[k]), Math.floor(cruces[k + 1])]);
    // Unir y recortar a la malla
    const unidos = [];
    for (const [a, b] of tramos.map(([a, b]) => [Math.max(0, a), Math.min(n - 1, b)]).filter(([a, b]) => a <= b).sort((p, q) => p[0] - q[0])) {
      const u = unidos.at(-1);
      if (u && a <= u[1] + 1) u[1] = Math.max(u[1], b); else unidos.push([a, b]);
    }
    if (unidos.length) filas.push({ y, tramos: unidos });
  }
  return filas;
}

export function contarTeselas(pol, z) {
  return filasPoligono(pol, z).reduce((s, f) => s + f.tramos.reduce((t, [a, b]) => t + b - a + 1, 0), 0);
}

export function* recorrerTeselas(pol, z) {
  for (const { y, tramos } of filasPoligono(pol, z)) for (const [a, b] of tramos) for (let x = a; x <= b; x++) yield { z, x, y };
}

/**
 * Reparto de zooms entre capas.
 * @param {Array<{id, zMin, zMax}>} capas en orden de preferencia
 * @param {'junto'|'separado'} modo
 * @returns {{ archivos: Array<{capas: string[], zooms: Array<{z, capa}>}>, solapes: Array<{z, gana, pierde}> }}
 */
export function repartirZooms(capas, modo) {
  const activas = capas.filter((c) => c.zMin <= c.zMax);
  if (modo === 'separado') {
    return { archivos: activas.map((c) => ({ capas: [c.id], zooms: rango(c.zMin, c.zMax).map((z) => ({ z, capa: c.id })) })), solapes: [] };
  }
  const porZoom = new Map(), solapes = [];
  for (const c of activas) {
    for (const z of rango(c.zMin, c.zMax)) {
      if (porZoom.has(z)) solapes.push({ z, gana: porZoom.get(z), pierde: c.id });
      else porZoom.set(z, c.id);
    }
  }
  const zooms = [...porZoom.entries()].sort((a, b) => a[0] - b[0]).map(([z, capa]) => ({ z, capa }));
  return { archivos: zooms.length ? [{ capas: [...new Set(zooms.map((x) => x.capa))], zooms }] : [], solapes };
}
const rango = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/** Resumen legible del reparto: «13–15 Topográfico · 16–18 Híbrido». */
export function textoReparto(zooms, nombres) {
  const tramos = [];
  for (const { z, capa } of zooms) {
    const u = tramos.at(-1);
    if (u && u.capa === capa && u.z1 === z - 1) u.z1 = z; else tramos.push({ capa, z0: z, z1: z });
  }
  return tramos.map((t) => `${t.z0 === t.z1 ? t.z0 : `${t.z0}–${t.z1}`} ${nombres[t.capa] ?? t.capa}`).join(' · ');
}

/** Teselas, megas y segundos estimados de un archivo. */
export function estimar(pol, zooms, { conRotulos = true } = {}) {
  let teselas = 0, kb = 0, seg = 0;
  for (const { z, capa } of zooms) {
    const def = CAPAS_CREADOR.find((c) => c.id === capa);
    const n = contarTeselas(pol, z);
    teselas += n;
    kb += n * (def.kb + (capa === 'hibrido' && conRotulos ? 6 : 0));
    seg += n / def.porSeg;
  }
  return { teselas, megas: kb / 1024, segundos: seg };
}

/** Píxeles (en la tesela z/x/y) de los vértices del polígono, para recortar la imagen. */
export function poligonoEnTesela(pol, z, x, y) {
  return pol.map((p) => [(teselaX(p.lon, z) - x) * 256, (teselaY(p.lat, z) - y) * 256]);
}
