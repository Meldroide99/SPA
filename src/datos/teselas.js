// Mapas en teselas guardados en SQLite: cachés de ATAK/osmdroid y MBTiles.
// Se colocan solos: cada tesela lleva su posición (zoom, columna, fila) en
// la malla web estándar (EPSG:3857), la misma que usa el mapa.

import { abrirSqlite } from './sqlite.js';

const lonDeX = (x, z) => (x / 2 ** z) * 360 - 180;
const latDeY = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

/** Clave de osmdroid/ATAK: ((z << z) + x) << z) + y, en aritmética exacta. */
export const claveOsmdroid = (z, x, y) => (z * 2 ** z + x) * 2 ** z + y;
export function desdeClaveOsmdroid(k) {
  for (let z = 0; z <= 29; z++) {
    const n = 2 ** z;
    if (k < (z + 1) * n * n) {
      const resto = k - z * n * n;
      return { z, x: Math.floor(resto / n), y: resto % n };
    }
  }
  return null;
}

/** Columnas de un CREATE TABLE (en orden) y cuál es INTEGER PRIMARY KEY. */
function columnas(sql) {
  const cuerpo = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  const partes = []; let prof = 0, act = '';
  for (const c of cuerpo) { if (c === '(') prof++; if (c === ')') prof--; if (c === ',' && !prof) { partes.push(act); act = ''; } else act += c; }
  partes.push(act);
  const cols = [];
  for (const p of partes) {
    const t = p.trim(); if (!t) continue;
    if (/^(primary|unique|check|foreign|constraint)\b/i.test(t)) continue;
    const nom = t.split(/\s+/)[0].replace(/^["'`[]|["'`\]]$/g, '');
    cols.push({ nombre: nom.toLowerCase(), ipk: /integer\s+primary\s+key/i.test(t) });
  }
  return cols;
}

/**
 * Abre un mapa en teselas (SQLite). Devuelve:
 *   { tipo, nombre, minZoom, maxZoom, limites:{sur,norte,oeste,este}, tesela(z,x,y) → Promise<Blob|null> }
 */
export async function abrirMapaTeselas(lector, nombreArchivo = 'Mapa') {
  const db = await abrirSqlite(lector);
  const tTiles = db.tabla('tiles');
  const sqlTiles = tTiles?.sql ?? '';
  const mime = (b) => (b[0] === 0x89 ? 'image/png' : b[0] === 0xff ? 'image/jpeg' : b[0] === 0x52 ? 'image/webp' : 'application/octet-stream');
  const comoBlob = (b) => (b ? new Blob([b], { type: mime(b) }) : null);

  // ---------------------------------------------------------- ATAK / osmdroid
  if (tTiles && /\bprovider\b/i.test(sqlTiles) && /\bkey\b/i.test(sqlTiles)) {
    const cols = columnas(sqlTiles);
    const iTile = cols.findIndex((c) => c.nombre === 'tile');
    const meta = db.tabla('ATAK_metadata') ? Object.fromEntries((await db.filas(db.tabla('ATAK_metadata').raiz)).map((f) => [f.valores[0], f.valores[1]])) : {};
    if (meta.srid && String(meta.srid) !== '3857' && String(meta.srid) !== '900913') throw new Error(`Caché de ATAK en SRID ${meta.srid}: solo se admite 3857`);
    const existe = async (z) => { let si = false; await db.recorrerRowids(tTiles.raiz, z * 4 ** z, (z + 1) * 4 ** z - 1, () => { si = true; return false; }); return si; };
    const zooms = [];
    for (let z = 0; z <= 22; z++) if (await existe(z)) zooms.push(z);
    if (!zooms.length) throw new Error('La caché de ATAK no tiene teselas');
    // Límites: el zoom con más teselas (hasta 600, para leer poco); un zoom
    // casi vacío (p. ej. unas pocas teselas sueltas a z17) no los decide.
    let limites = null, mejor = -1;
    for (const z of zooms) {
      const ks = [];
      await db.recorrerRowids(tTiles.raiz, z * 4 ** z, (z + 1) * 4 ** z - 1, (k) => { ks.push(k); return ks.length <= 600; });
      if (ks.length > 600 && limites) continue;
      if (ks.length <= mejor) continue;
      mejor = ks.length;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const k of ks) { const t = desdeClaveOsmdroid(k); x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y); }
      limites = { oeste: lonDeX(x0, z), este: lonDeX(x1 + 1, z), norte: latDeY(y0, z), sur: latDeY(y1 + 1, z), zoomLimites: z };
    }
    const proveedor = (await db.filaPorRowid(tTiles.raiz, (await primerRowid(db, tTiles.raiz))))?.[cols.findIndex((c) => c.nombre === 'provider')];
    return {
      tipo: 'ATAK', nombre: nombreArchivo, proveedor: proveedor || '', minZoom: zooms[0], maxZoom: zooms.at(-1), zooms, limites,
      async tesela(z, x, y) {
        const f = await db.filaPorRowid(tTiles.raiz, claveOsmdroid(z, x, y));
        return f ? comoBlob(f[iTile]) : null;
      },
    };
  }

  // ---------------------------------------------------------- MBTiles
  const tMeta = db.tabla('metadata');
  if (tMeta || db.esquema.some((e) => e.nombre === 'tiles')) {
    const meta = tMeta ? Object.fromEntries((await db.filas(tMeta.raiz)).map((f) => [String(f.valores[0]).toLowerCase(), f.valores[1]])) : {};
    let buscar;
    if (tTiles) {
      const cols = columnas(sqlTiles);
      const idx = db.indicesDe('tiles').find((i) => /zoom_level/i.test(i.sql || '') || (i.sql === null));
      if (!idx) throw new Error('MBTiles sin índice de teselas');
      const iDato = cols.findIndex((c) => c.nombre === 'tile_data');
      buscar = async (z, x, yTms) => {
        const r = await db.buscarIndice(idx.raiz, [z, x, yTms]); if (!r) return null;
        const f = await db.filaPorRowid(tTiles.raiz, r.at(-1));
        return f?.[iDato] ?? null;
      };
    } else {
      // Esquema normalizado: map(zoom_level, tile_column, tile_row, tile_id) + images(tile_data, tile_id)
      const tMap = db.tabla('map'), tImg = db.tabla('images');
      if (!tMap || !tImg) throw new Error('MBTiles con un esquema no reconocido');
      const cMap = columnas(tMap.sql), cImg = columnas(tImg.sql);
      const iMap = db.indicesDe('map')[0], iImg = db.indicesDe('images')[0];
      if (!iMap || !iImg) throw new Error('MBTiles sin índices');
      const iId = cMap.findIndex((c) => c.nombre === 'tile_id'), iDato = cImg.findIndex((c) => c.nombre === 'tile_data');
      buscar = async (z, x, yTms) => {
        const r = await db.buscarIndice(iMap.raiz, [z, x, yTms]); if (!r) return null;
        const fm = await db.filaPorRowid(tMap.raiz, r.at(-1)); if (!fm) return null;
        const ri = await db.buscarIndice(iImg.raiz, [fm[iId]]); if (!ri) return null;
        const fi = await db.filaPorRowid(tImg.raiz, ri.at(-1));
        return fi?.[iDato] ?? null;
      };
    }
    const [o, s, e, n] = String(meta.bounds || '-180,-85,180,85').split(',').map(Number);
    const minZoom = Number(meta.minzoom ?? 0), maxZoom = Number(meta.maxzoom ?? 18);
    return {
      tipo: 'MBTiles', nombre: meta.name || nombreArchivo, minZoom, maxZoom, limites: { oeste: o, sur: s, este: e, norte: n },
      async tesela(z, x, y) { const b = await buscar(z, x, 2 ** z - 1 - y); return comoBlob(b); },
    };
  }
  throw new Error('Base de datos SQLite sin teselas reconocibles (ni ATAK ni MBTiles)');
}

async function primerRowid(db, raiz) {
  let r = null; await db.recorrerRowids(raiz, -Infinity, Infinity, (k) => { r = k; return false; }); return r;
}
