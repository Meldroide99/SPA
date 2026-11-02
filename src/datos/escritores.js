// Formatos de salida del creador de mapas.
//   escribirAtak     caché de ATAK/osmdroid (.sqlite, EPSG:3857), como las de Balú
//   escribirMbtiles  MBTiles 1.3 (tabla tiles + índice)
//   escribirZipXyz   carpeta de teselas {z}/{x}/{y}.ext en un .zip
//   escribirGeoTiff  mosaico de un zoom en GeoTIFF (EPSG:3857, teselas de 256 px, Deflate)
//
// Teselas: { z, x, y, datos: Blob|Uint8Array } con x, y de la malla web (XYZ).

import { escribirSqlite } from './sqlite-escritor.js';

const bytes = async (d) => (d instanceof Uint8Array ? d : new Uint8Array(await d.arrayBuffer()));
const claveOsmdroid = (z, x, y) => (z * 2 ** z + x) * 2 ** z + y;

export async function escribirAtak(teselas, { nombre = 'SPA' } = {}) {
  const orden = teselas.map((t) => ({ t, k: claveOsmdroid(t.z, t.x, t.y) })).sort((a, b) => a.k - b.k);
  const ahora = Date.now();
  return escribirSqlite([
    { nombre: 'tiles', sql: 'CREATE TABLE tiles (key INTEGER PRIMARY KEY, provider TEXT, tile BLOB)', filas: orden.map(({ t, k }) => ({ rowid: k, valores: [null, nombre, t.datos] })) },
    { nombre: 'ATAK_catalog', sql: 'CREATE TABLE ATAK_catalog (key INTEGER PRIMARY KEY, access INTEGER, expiration INTEGER, size INTEGER)', filas: orden.map(({ k }) => ({ rowid: k, valores: [null, null, ahora, null] })) },
    { nombre: 'ATAK_metadata', sql: 'CREATE TABLE ATAK_metadata (key TEXT, value TEXT)', filas: [{ rowid: 1, valores: ['srid', '3857'] }] },
  ]);
}

export async function escribirMbtiles(teselas, { nombre = 'SPA', formato = 'png', limites, descripcion = 'Creado con SPA' } = {}) {
  const orden = teselas.map((t) => ({ t, yt: 2 ** t.z - 1 - t.y })).sort((a, b) => a.t.z - b.t.z || a.t.x - b.t.x || a.yt - b.yt);
  const zooms = teselas.map((t) => t.z);
  const meta = [
    ['name', nombre], ['type', 'baselayer'], ['version', '1.3'], ['description', descripcion], ['format', formato],
    ['minzoom', String(Math.min(...zooms))], ['maxzoom', String(Math.max(...zooms))],
  ];
  if (limites) {
    meta.push(['bounds', [limites.oeste, limites.sur, limites.este, limites.norte].map((v) => +v.toFixed(6)).join(',')]);
    meta.push(['center', `${+((limites.oeste + limites.este) / 2).toFixed(6)},${+((limites.sur + limites.norte) / 2).toFixed(6)},${Math.min(...zooms)}`]);
  }
  return escribirSqlite([
    { nombre: 'metadata', sql: 'CREATE TABLE metadata (name text, value text)', filas: meta.map((v, i) => ({ rowid: i + 1, valores: v })) },
    { nombre: 'tiles', sql: 'CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)', filas: orden.map(({ t, yt }, i) => ({ rowid: i + 1, valores: [t.z, t.x, yt, t.datos] })) },
  ], [
    { nombre: 'tile_index', tabla: 'tiles', sql: 'CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)', entradas: orden.map(({ t, yt }, i) => [t.z, t.x, yt, i + 1]) },
  ]);
}

// ---------------------------------------------------------------- ZIP (sin comprimir: las teselas ya lo están)
const TABLA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export async function escribirZipXyz(teselas, { extension = () => 'png', raiz = '' } = {}) {
  const partes = [], central = [];
  let off = 0;
  const enc = new TextEncoder();
  for (const t of teselas) {
    const d = await bytes(t.datos);
    const nombre = enc.encode(`${raiz}${t.z}/${t.x}/${t.y}.${extension(t)}`);
    const crc = crc32(d);
    const loc = new Uint8Array(30 + nombre.length); const v = new DataView(loc.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(8, 0, true);
    v.setUint32(14, crc, true); v.setUint32(18, d.length, true); v.setUint32(22, d.length, true); v.setUint16(26, nombre.length, true);
    loc.set(nombre, 30);
    const cen = new Uint8Array(46 + nombre.length); const w = new DataView(cen.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x800, true);
    w.setUint32(16, crc, true); w.setUint32(20, d.length, true); w.setUint32(24, d.length, true); w.setUint16(28, nombre.length, true);
    w.setUint32(42, off, true); cen.set(nombre, 46);
    partes.push(loc, d); central.push(cen);
    off += loc.length + d.length;
    if (off > 0xfffffff0) throw new Error('ZIP de más de 4 GB: usa ATAK o MBTiles');
  }
  const tamDir = central.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22); const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, central.length, true); f.setUint16(10, central.length, true);
  f.setUint32(12, tamDir, true); f.setUint32(16, off, true);
  if (central.length > 0xffff) throw new Error('Más de 65 535 teselas: usa ATAK o MBTiles para el ZIP');
  return new Blob([...partes, ...central, fin], { type: 'application/zip' });
}

// ---------------------------------------------------------------- GeoTIFF
async function deflate(b) {
  const s = new Blob([b]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/**
 * Mosaico de un zoom en GeoTIFF (EPSG:3857). Cada tesela web es una tesela
 * del TIFF (256 × 256), comprimida con Deflate. Las que faltan van vacías
 * (transparentes si hay canal alfa).
 * @param {Array} teselas todas del mismo zoom
 * @param {{z:number, conAlfa?:boolean, rgbaDe:(t)=>Promise<Uint8ClampedArray>}} opc
 */
export async function escribirGeoTiff(teselas, { z, conAlfa = true, rgbaDe }) {
  const xs = teselas.map((t) => t.x), ys = teselas.map((t) => t.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  if (nx * ny > 40000) throw new Error('GeoTIFF demasiado grande para un solo archivo: reduce el zoom o el área');
  const S = conAlfa ? 4 : 3;
  const porClave = new Map(teselas.map((t) => [`${t.x},${t.y}`, t]));
  const partes = [new Uint8Array(8)]; // cabecera (se rellena al final)
  let off = 8;
  const offsets = [], cuentas = [];
  let vacia = null;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = porClave.get(`${tx},${ty}`);
      if (!t) {
        if (!vacia) { vacia = { datos: await deflate(new Uint8Array(256 * 256 * S)) }; vacia.off = off; partes.push(vacia.datos); off += vacia.datos.length; }
        offsets.push(vacia.off); cuentas.push(vacia.datos.length); continue;
      }
      const rgba = await rgbaDe(t);
      let px;
      if (S === 4) px = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length);
      else { px = new Uint8Array(256 * 256 * 3); for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { px[j] = rgba[i]; px[j + 1] = rgba[i + 1]; px[j + 2] = rgba[i + 2]; } }
      const d = await deflate(px);
      offsets.push(off); cuentas.push(d.length); partes.push(d); off += d.length;
      if (off > 0xfff00000) throw new Error('GeoTIFF de más de 4 GB: reduce el zoom o el área');
    }
  }
  if (off % 2) { partes.push(new Uint8Array(1)); off++; }
  // IFD
  const R = 6378137, tam = (2 * Math.PI * R) / 2 ** z / 256;
  const X0 = -Math.PI * R + x0 * 256 * tam, Y0 = Math.PI * R - y0 * 256 * tam;
  const tags = [
    [256, 4, [nx * 256]], [257, 4, [ny * 256]], [258, 3, Array(S).fill(8)], [259, 3, [8]], [262, 3, [2]],
    [277, 3, [S]], [284, 3, [1]], [305, 2, 'SPA (Planeamiento S3)'],
    [322, 3, [256]], [323, 3, [256]], [324, 4, offsets], [325, 4, cuentas],
    ...(conAlfa ? [[338, 3, [2]]] : []), [339, 3, Array(S).fill(1)],
    [33550, 12, [tam, tam, 0]], [33922, 12, [0, 0, 0, X0, Y0, 0]],
    [34735, 3, [1, 1, 0, 4, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3857, 3076, 0, 1, 9001]],
  ].sort((a, b) => a[0] - b[0]);
  const TAM_T = { 2: 1, 3: 2, 4: 4, 12: 8 };
  const ifdOff = off, nTags = tags.length;
  let extraOff = ifdOff + 2 + nTags * 12 + 4;
  const ifd = new Uint8Array(2 + nTags * 12 + 4); const dv = new DataView(ifd.buffer);
  const extras = [];
  dv.setUint16(0, nTags, true);
  tags.forEach(([tag, tipo, val], i) => {
    const vals = typeof val === 'string' ? [...new TextEncoder().encode(`${val}\0`)] : val;
    const n = vals.length, tamB = n * TAM_T[tipo];
    const b = 2 + i * 12;
    dv.setUint16(b, tag, true); dv.setUint16(b + 2, tipo, true); dv.setUint32(b + 4, n, true);
    const escribir = (v, o) => {
      vals.forEach((x, k) => {
        if (tipo === 2) v.setUint8(o + k, x);
        else if (tipo === 3) v.setUint16(o + 2 * k, x, true);
        else if (tipo === 4) v.setUint32(o + 4 * k, x, true);
        else v.setFloat64(o + 8 * k, x, true);
      });
    };
    if (tamB <= 4) escribir(dv, b + 8);
    else {
      const e = new Uint8Array(tamB + (tamB % 2)); escribir(new DataView(e.buffer), 0);
      dv.setUint32(b + 8, extraOff, true); extras.push(e); extraOff += e.length;
    }
  });
  const cab = partes[0]; const cv = new DataView(cab.buffer);
  cab[0] = 0x49; cab[1] = 0x49; cv.setUint16(2, 42, true); cv.setUint32(4, ifdOff, true);
  return new Blob([...partes, ifd, ...extras], { type: 'image/tiff' });
}
