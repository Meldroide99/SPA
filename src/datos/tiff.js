// Lector TIFF / GeoTIFF propio, por trozos (sirve para archivos de varios GB:
// solo se lee lo que se pinta). Clásico y BigTIFF, en teselas o en bandas.
//
// Compresiones: ninguna, LZW, Deflate, PackBits; JPEG y WebP se decodifican
// con el navegador. Predictores 2 (horizontal) y 3 (coma flotante).
// Georreferencia: ModelTiepoint + ModelPixelScale o ModelTransformation, y
// las claves GeoTIFF (EPSG del sistema de coordenadas).

const T = {
  NewSubfileType: 254, ImageWidth: 256, ImageLength: 257, BitsPerSample: 258, Compression: 259,
  Photometric: 262, StripOffsets: 273, SamplesPerPixel: 277, RowsPerStrip: 278, StripByteCounts: 279,
  PlanarConfig: 284, Predictor: 317, ColorMap: 320, TileWidth: 322, TileLength: 323, TileOffsets: 324,
  TileByteCounts: 325, ExtraSamples: 338, SampleFormat: 339, JPEGTables: 347,
  ModelPixelScale: 33550, ModelTiepoint: 33922, ModelTransformation: 34264,
  GeoKeyDirectory: 34735, GeoDoubleParams: 34736, GeoAsciiParams: 34737, GdalNoData: 42113, GdalMetadata: 42112,
};
const TAM_TIPO = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8, 17: 8, 18: 8 };

/** Lector por trozos sobre un Blob/File. */
export function lectorBlob(blob) {
  return { tamano: blob.size, leer: async (o, n) => new Uint8Array(await blob.slice(o, o + n).arrayBuffer()) };
}

/**
 * Abre un TIFF. Devuelve las imágenes (la principal y sus reducciones) y la
 * georreferencia.
 */
export async function abrirTiff(lector) {
  const cab = await lector.leer(0, 16);
  const le = cab[0] === 0x49 && cab[1] === 0x49;
  if (!le && !(cab[0] === 0x4d && cab[1] === 0x4d)) throw new Error('No es un archivo TIFF');
  const dv = new DataView(cab.buffer);
  const ver = dv.getUint16(2, le);
  const big = ver === 43;
  if (ver !== 42 && !big) throw new Error('TIFF no reconocido');
  let off = big ? Number(dv.getBigUint64(8, le)) : dv.getUint32(4, le);

  const ifds = [];
  while (off && ifds.length < 64) {
    const n0 = await lector.leer(off, big ? 8 : 2);
    const nd = new DataView(n0.buffer);
    const n = big ? Number(nd.getBigUint64(0, le)) : nd.getUint16(0, le);
    const tamE = big ? 20 : 12;
    const cuerpo = await lector.leer(off + (big ? 8 : 2), n * tamE + (big ? 8 : 4));
    const cd = new DataView(cuerpo.buffer);
    const tags = {};
    for (let k = 0; k < n; k++) {
      const b = k * tamE;
      const tag = cd.getUint16(b, le), tipo = cd.getUint16(b + 2, le);
      const cuenta = big ? Number(cd.getBigUint64(b + 4, le)) : cd.getUint32(b + 4, le);
      const tam = (TAM_TIPO[tipo] || 1) * cuenta;
      const enLinea = tam <= (big ? 8 : 4);
      const pos = b + (big ? 12 : 8);
      let bytes;
      if (enLinea) bytes = cuerpo.slice(pos, pos + tam);
      else {
        const o = big ? Number(cd.getBigUint64(pos, le)) : cd.getUint32(pos, le);
        bytes = await lector.leer(o, tam);
      }
      tags[tag] = valores(bytes, tipo, cuenta, le);
    }
    ifds.push(tags);
    const p = n * tamE;
    off = big ? Number(cd.getBigUint64(p, le)) : cd.getUint32(p, le);
  }
  const imagenes = ifds.filter((t) => !((t[T.NewSubfileType]?.[0] ?? 0) & 4)).map((t) => crearImagen(t, lector, le));
  const principal = imagenes[0];
  const reducciones = imagenes.filter((im, i) => i > 0 && im.muestras === principal.muestras && im.ancho < principal.ancho)
    .sort((a, b) => b.ancho - a.ancho);
  return {
    le, imagenes: [principal, ...reducciones], geo: leerGeo(ifds[0]),
    // Cada IFD por separado (subrejillas de las rejillas de transformación)
    subimagenes: ifds.map((t) => ({ imagen: crearImagen(t, lector, le), geo: leerGeo(t), metadatos: t[T.GdalMetadata] ?? '' })),
  };
}

function valores(b, tipo, n, le) {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Array(n);
  switch (tipo) {
    case 2: return new TextDecoder('latin1').decode(b).replace(/\0+$/, '');
    case 1: case 7: return Array.from(b.subarray(0, n));
    case 6: for (let i = 0; i < n; i++) out[i] = d.getInt8(i); return out;
    case 3: for (let i = 0; i < n; i++) out[i] = d.getUint16(i * 2, le); return out;
    case 8: for (let i = 0; i < n; i++) out[i] = d.getInt16(i * 2, le); return out;
    case 4: case 13: for (let i = 0; i < n; i++) out[i] = d.getUint32(i * 4, le); return out;
    case 9: for (let i = 0; i < n; i++) out[i] = d.getInt32(i * 4, le); return out;
    case 5: for (let i = 0; i < n; i++) out[i] = d.getUint32(i * 8, le) / d.getUint32(i * 8 + 4, le); return out;
    case 10: for (let i = 0; i < n; i++) out[i] = d.getInt32(i * 8, le) / d.getInt32(i * 8 + 4, le); return out;
    case 11: for (let i = 0; i < n; i++) out[i] = d.getFloat32(i * 4, le); return out;
    case 12: for (let i = 0; i < n; i++) out[i] = d.getFloat64(i * 8, le); return out;
    case 16: case 18: for (let i = 0; i < n; i++) out[i] = Number(d.getBigUint64(i * 8, le)); return out;
    case 17: for (let i = 0; i < n; i++) out[i] = Number(d.getBigInt64(i * 8, le)); return out;
    default: return Array.from(b);
  }
}

// ---------------------------------------------------------------- georreferencia
function leerGeo(t) {
  const g = { epsg: null, modelo: null, rasterPunto: false, afin: null, nodata: null, citas: '' };
  if (t[T.GdalNoData] !== undefined) { const v = Number(String(t[T.GdalNoData]).trim()); if (Number.isFinite(v)) g.nodata = v; }
  if (t[T.ModelTransformation]) {
    const m = t[T.ModelTransformation];
    g.afin = [m[0], m[1], m[3], m[4], m[5], m[7]]; // x = a*c + b*f + c0 ; y = d*c + e*f + f0
  } else if (t[T.ModelTiepoint] && t[T.ModelPixelScale]) {
    const [i, j, , x, y] = t[T.ModelTiepoint]; const [sx, sy] = t[T.ModelPixelScale];
    g.afin = [sx, 0, x - i * sx, 0, -sy, y + j * sy];
  }
  const dir = t[T.GeoKeyDirectory];
  if (dir) {
    const dobles = t[T.GeoDoubleParams] || [], asc = t[T.GeoAsciiParams] || '';
    const claves = {};
    for (let k = 0; k < dir[3]; k++) {
      const [id, loc, cuenta, val] = dir.slice(4 + k * 4, 8 + k * 4);
      claves[id] = loc === 0 ? val : loc === T.GeoDoubleParams ? dobles[val] : loc === T.GeoAsciiParams ? asc.slice(val, val + cuenta).replace(/\|$/, '') : val;
    }
    g.modelo = claves[1024] === 2 ? 'geografico' : claves[1024] === 1 ? 'proyectado' : claves[1024] === 3 ? 'geocentrico' : null;
    g.rasterPunto = claves[1025] === 2;
    const proj = claves[3072], geog = claves[2048];
    if (g.modelo === 'proyectado' && proj && proj !== 32767) g.epsg = proj;
    else if (g.modelo === 'geografico' && geog && geog !== 32767) g.epsg = geog;
    g.citas = [claves[1026], claves[2049], claves[3073]].filter(Boolean).join(' | ');
    g.claves = claves;
  }
  // PixelIsPoint: el origen del afín es el centro del píxel (0,0) → pasar a esquina
  if (g.afin && g.rasterPunto) {
    const [a, b, c, d, e, f] = g.afin;
    g.afin = [a, b, c - (a + b) / 2, d, e, f - (d + e) / 2];
  }
  return g;
}

// ---------------------------------------------------------------- imagen
function crearImagen(t, lector, le) {
  const ancho = t[T.ImageWidth][0], alto = t[T.ImageLength][0];
  const enTeselas = Boolean(t[T.TileWidth]);
  const bloqueAncho = enTeselas ? t[T.TileWidth][0] : ancho;
  const bloqueAlto = enTeselas ? t[T.TileLength][0] : Math.min(t[T.RowsPerStrip]?.[0] ?? alto, alto);
  const muestras = t[T.SamplesPerPixel]?.[0] ?? 1;
  const bits = t[T.BitsPerSample]?.[0] ?? 1;
  const formato = t[T.SampleFormat]?.[0] ?? 1; // 1 uint, 2 int, 3 float
  const im = {
    ancho, alto, enTeselas, bloqueAncho, bloqueAlto, muestras, bits, formato,
    compresion: t[T.Compression]?.[0] ?? 1,
    fotometria: t[T.Photometric]?.[0] ?? (muestras >= 3 ? 2 : 1),
    planar: t[T.PlanarConfig]?.[0] ?? 1,
    predictor: t[T.Predictor]?.[0] ?? 1,
    colormap: t[T.ColorMap] ?? null,
    extra: t[T.ExtraSamples] ?? [],
    offsets: t[enTeselas ? T.TileOffsets : T.StripOffsets],
    cuentas: t[enTeselas ? T.TileByteCounts : T.StripByteCounts],
    tablasJpeg: t[T.JPEGTables] ? new Uint8Array(t[T.JPEGTables]) : null,
    bloquesX: Math.ceil(ancho / bloqueAncho), bloquesY: Math.ceil(alto / bloqueAlto),
  };
  /**
   * Lee y decodifica un bloque. Devuelve { datos, ancho, alto, rgba? }:
   * `datos` son las muestras intercaladas (Uint8/16/32, Int, Float32/64);
   * para JPEG/WebP se devuelve directamente `rgba` (Uint8ClampedArray).
   */
  im.leerBloque = async (bx, by) => {
    const i = by * im.bloquesX + bx;
    const anchoB = im.bloqueAncho;
    const altoB = enTeselas ? im.bloqueAlto : Math.min(im.bloqueAlto, alto - by * im.bloqueAlto);
    if (im.planar === 2 && im.muestras > 1) {
      // Planos separados: un bloque por banda
      const por = im.bloquesX * im.bloquesY;
      const bandas = [];
      for (let s = 0; s < im.muestras; s++) bandas.push(await decodificar(im, lector, le, i + s * por, anchoB, altoB, 1));
      const n = anchoB * altoB;
      const datos = new bandas[0].constructor(n * im.muestras);
      for (let p = 0; p < n; p++) for (let s = 0; s < im.muestras; s++) datos[p * im.muestras + s] = bandas[s][p];
      return { datos, ancho: anchoB, alto: altoB };
    }
    const r = await decodificar(im, lector, le, i, anchoB, altoB, im.muestras);
    return r instanceof Uint8ClampedArray ? { rgba: r, ancho: anchoB, alto: altoB } : { datos: r, ancho: anchoB, alto: altoB };
  };
  /**
   * Varios bloques de una vez [[bx, by], …]: si están seguidos en el archivo
   * se leen con UNA lectura (mucho más rápido en TIFF por filas de 1 px).
   */
  im.leerBloques = async (lista) => {
    if (im.planar === 2 && im.muestras > 1) return Promise.all(lista.map(([bx, by]) => im.leerBloque(bx, by)));
    const idx = lista.map(([bx, by]) => by * im.bloquesX + bx);
    const con = idx.filter((i) => im.cuentas[i]);
    let sub = lector;
    if (con.length > 1) {
      const ini = Math.min(...con.map((i) => im.offsets[i])), fin = Math.max(...con.map((i) => im.offsets[i] + im.cuentas[i]));
      const util = con.reduce((t, i) => t + im.cuentas[i], 0);
      if (fin - ini <= 64e6 && fin - ini <= 2 * util + 65536) {
        const buf = await lector.leer(ini, fin - ini);
        sub = { tamano: lector.tamano, leer: (o, n) => (o >= ini && o + n <= fin ? Promise.resolve(buf.subarray(o - ini, o - ini + n)) : lector.leer(o, n)) };
      }
    }
    return Promise.all(lista.map(async ([bx, by], k) => {
      const altoB = enTeselas ? im.bloqueAlto : Math.min(im.bloqueAlto, alto - by * im.bloqueAlto);
      const r = await decodificar(im, sub, le, idx[k], im.bloqueAncho, altoB, im.muestras);
      return r instanceof Uint8ClampedArray ? { rgba: r, ancho: im.bloqueAncho, alto: altoB } : { datos: r, ancho: im.bloqueAncho, alto: altoB };
    }));
  };
  return im;
}

async function decodificar(im, lector, le, i, w, h, muestras) {
  const off = im.offsets[i], n = im.cuentas[i];
  const bytesMuestra = im.bits / 8;
  const total = w * h * muestras;
  if (!n) { // bloque vacío (GDAL "sparse")
    return nuevoTipado(im, total);
  }
  const crudo = await lector.leer(off, n);
  let b;
  switch (im.compresion) {
    case 1: b = crudo; break;
    case 5: b = lzw(crudo, total * bytesMuestra); break;
    case 8: case 32946: b = await inflar(crudo, 'deflate'); break;
    case 32773: b = packbits(crudo, total * bytesMuestra); break;
    case 7: case 6: return jpeg(im, crudo, w, h);
    case 50001: return imagenNavegador(crudo, 'image/webp', w, h);
    default: throw new Error(`Compresión TIFF no soportada (${im.compresion}). Conviértelo a GeoTIFF con compresión JPEG, Deflate o LZW.`);
  }
  if (im.bits === 1) { // binario → 0/255
    const out = new Uint8Array(w * h); const fila = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = (b[y * fila + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
    return im.fotometria === 0 ? out.map((v) => 255 - v) : out;
  }
  if (im.bits === 4) {
    const out = new Uint8Array(w * h); const fila = Math.ceil(w / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = (b[y * fila + (x >> 1)] >> (x & 1 ? 0 : 4)) & 15;
    return out;
  }
  if (im.predictor === 3) b = desPredecirFlotante(b, w, h, muestras, bytesMuestra, le);
  const arr = aTipado(im, b, total, le);
  if (im.predictor === 2) {
    for (let y = 0; y < h; y++) {
      const base = y * w * muestras;
      for (let x = muestras; x < w * muestras; x++) arr[base + x] += arr[base + x - muestras];
    }
  }
  return arr;
}

function nuevoTipado(im, n) {
  if (im.formato === 3) return im.bits === 64 ? new Float64Array(n) : new Float32Array(n);
  if (im.bits === 16) return im.formato === 2 ? new Int16Array(n) : new Uint16Array(n);
  if (im.bits === 32) return im.formato === 2 ? new Int32Array(n) : new Uint32Array(n);
  return new Uint8Array(n);
}

function aTipado(im, b, n, le) {
  if (im.bits === 8) return im.formato === 2 ? new Int8Array(b.buffer, b.byteOffset, n) : new Uint8Array(b.buffer, b.byteOffset, n);
  const out = nuevoTipado(im, n);
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const lect = {
    16: im.formato === 2 ? (o) => d.getInt16(o, le) : (o) => d.getUint16(o, le),
    32: im.formato === 3 ? (o) => d.getFloat32(o, le) : im.formato === 2 ? (o) => d.getInt32(o, le) : (o) => d.getUint32(o, le),
    64: (o) => d.getFloat64(o, le),
  }[im.bits];
  if (!lect) throw new Error(`Profundidad de bits no soportada: ${im.bits}`);
  const paso = im.bits / 8;
  const lim = Math.min(n, Math.floor(b.byteLength / paso));
  for (let k = 0; k < lim; k++) out[k] = lect(k * paso);
  return out;
}

/** Predictor 3: bytes reordenados por plano y diferenciados. */
function desPredecirFlotante(b, w, h, muestras, bpm, le) {
  const fila = w * muestras * bpm;
  const out = new Uint8Array(b.length);
  for (let y = 0; y < h; y++) {
    const f = b.subarray(y * fila, (y + 1) * fila).slice();
    for (let k = 1; k < fila; k++) f[k] = (f[k] + f[k - 1]) & 255;
    const n = w * muestras;
    for (let k = 0; k < n; k++) {
      for (let byte = 0; byte < bpm; byte++) {
        // el plano 0 tiene el byte más significativo
        const dest = le ? bpm - 1 - byte : byte;
        out[y * fila + k * bpm + dest] = f[byte * n + k];
      }
    }
  }
  return out;
}

export function lzw(entrada, esperado) {
  const out = new Uint8Array(esperado || entrada.length * 4);
  let o = 0, bits = 9, bitPos = 0;
  const dic = []; // cada entrada: Uint8Array
  const reiniciar = () => { dic.length = 258; bits = 9; };
  for (let i = 0; i < 256; i++) dic[i] = new Uint8Array([i]);
  reiniciar();
  const leerCodigo = () => {
    const byte = bitPos >> 3; if (byte >= entrada.length) return 257;
    const v = ((entrada[byte] << 16) | ((entrada[byte + 1] ?? 0) << 8) | (entrada[byte + 2] ?? 0)) >>> 0;
    const c = (v >>> (24 - (bitPos & 7) - bits)) & ((1 << bits) - 1);
    bitPos += bits; return c;
  };
  let prev = null;
  const escribir = (s) => { if (o + s.length > out.length) return false; out.set(s, o); o += s.length; return true; };
  for (;;) {
    const c = leerCodigo();
    if (c === 257) break;
    if (c === 256) {
      reiniciar();
      const c2 = leerCodigo(); if (c2 === 257) break;
      prev = dic[c2]; if (!escribir(prev)) break; continue;
    }
    let s;
    if (c < dic.length) { s = dic[c]; const n = new Uint8Array(prev.length + 1); n.set(prev); n[prev.length] = s[0]; dic.push(n); }
    else { s = new Uint8Array(prev.length + 1); s.set(prev); s[prev.length] = prev[0]; dic.push(s); }
    if (!escribir(s)) break;
    prev = s;
    if (dic.length + 1 >= (1 << bits) && bits < 12) bits++;
  }
  return out;
}

function packbits(b, esperado) {
  const out = new Uint8Array(esperado); let o = 0, i = 0;
  while (i < b.length && o < esperado) {
    const n = (b[i] << 24) >> 24; i++;
    if (n >= 0) { out.set(b.subarray(i, i + n + 1), o); o += n + 1; i += n + 1; }
    else if (n !== -128) { out.fill(b[i], o, o + 1 - n); o += 1 - n; i++; }
  }
  return out;
}

async function inflar(b, formato) {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream(formato));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function imagenNavegador(bytes, tipo, w, h) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: tipo }));
  const c = new OffscreenCanvas(w, h); const x = c.getContext('2d');
  x.drawImage(bmp, 0, 0); bmp.close?.();
  return x.getImageData(0, 0, w, h).data;
}

/** JPEG dentro de TIFF: se antepone la tabla común (JPEGTables). */
function jpeg(im, datos, w, h) {
  let jpg = datos;
  if (im.tablasJpeg && im.tablasJpeg.length > 4) {
    const tablas = im.tablasJpeg.subarray(0, im.tablasJpeg.length - 2); // sin EOI
    jpg = new Uint8Array(tablas.length + datos.length - 2);
    jpg.set(tablas, 0); jpg.set(datos.subarray(2), tablas.length); // sin el SOI del bloque
  }
  return imagenNavegador(jpg, 'image/jpeg', w, h);
}

/**
 * Convierte un bloque decodificado a RGBA (para pintar).
 * @param {{min:number,max:number}} [rango] estiramiento para datos de 16 bits o flotantes
 */
export function aRgba(im, bloque, rango, nodata) {
  if (bloque.rgba) return bloque.rgba;
  const { datos, ancho, alto } = bloque;
  const n = ancho * alto, s = im.muestras;
  const out = new Uint8ClampedArray(n * 4);
  const esc8 = im.bits === 8 && im.formato !== 3;
  const min = rango?.min ?? 0, max = rango?.max ?? 255, k = 255 / ((max - min) || 1);
  const v8 = esc8 ? (v) => v : (v) => (v - min) * k;
  const alfa = s === 4 || (s === 2 && im.extra.length) ? s - 1 : -1;
  for (let p = 0; p < n; p++) {
    const o = p * 4, b = p * s;
    if (im.fotometria === 3 && im.colormap) {
      const idx = datos[b]; const cm = im.colormap, tam = cm.length / 3;
      out[o] = cm[idx] >> 8; out[o + 1] = cm[tam + idx] >> 8; out[o + 2] = cm[2 * tam + idx] >> 8; out[o + 3] = 255;
    } else if (s >= 3) {
      out[o] = v8(datos[b]); out[o + 1] = v8(datos[b + 1]); out[o + 2] = v8(datos[b + 2]);
      out[o + 3] = alfa >= 0 ? (esc8 ? datos[b + alfa] : 255) : 255;
    } else {
      let v = v8(datos[b]); if (im.fotometria === 0) v = 255 - v;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = alfa >= 0 ? datos[b + alfa] : 255;
    }
    if (nodata !== null && nodata !== undefined && datos[b] === nodata) out[o + 3] = 0;
  }
  return out;
}

/** Lee un valor (banda 0) en un píxel: para rejillas y modelos de elevación. */
export async function valorEnPixel(im, x, y, cache) {
  const bx = Math.floor(x / im.bloqueAncho), by = Math.floor(y / im.bloqueAlto);
  const clave = `${bx},${by}`;
  let b = cache?.get(clave);
  if (!b) { b = await im.leerBloque(bx, by); cache?.set(clave, b); }
  const px = x - bx * im.bloqueAncho, py = y - by * im.bloqueAlto;
  return b.datos[(py * b.ancho + px) * im.muestras];
}
