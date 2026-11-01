// Altitudes del terreno: Modelo Digital del Terreno del IGN (MDT05, malla de
// 5 m, altitud ortométrica sobre el nivel medio del mar en Alicante).
//
// Servicio: WCS 2.0.1 de la IDEE, cobertura Elevacion4258_5 (ETRS89
// geográficas). Permite peticiones desde cualquier página (CORS *), también
// desde el archivo abierto con doble clic.
//
// Se pide por bloques fijos de 0,004° (≈ 450 × 340 m) con 2 celdas de margen,
// que se guardan en memoria: el cursor, los puntos y los perfiles reutilizan
// lo ya descargado. Interpolación bilineal entre centros de celda.
// Fuera de España (sin datos) se prueba el MDT25 y luego se devuelve null.

export const SERVICIO_MDT = 'https://servicios.idee.es/wcs-inspire/mdt';
const BLOQUE = 0.004;

/** Lee la respuesta (multipart con un ASCII Grid de ESRI). */
export function leerAsc(texto) {
  const i = texto.search(/ncols/i);
  if (i < 0) throw new Error('Respuesta del MDT sin datos');
  const lineas = texto.slice(i).split(/\r?\n/);
  const cab = {};
  let k = 0;
  for (; k < lineas.length; k++) {
    const m = /^\s*([a-z_]+)\s+(-?[\d.eE+-]+)\s*$/i.exec(lineas[k]);
    if (!m) break;
    cab[m[1].toLowerCase()] = Number(m[2]);
  }
  const ncols = cab.ncols, nrows = cab.nrows;
  const dx = cab.dx ?? cab.cellsize, dy = cab.dy ?? cab.cellsize;
  const valores = new Float32Array(ncols * nrows);
  let n = 0;
  for (; k < lineas.length && n < valores.length; k++) {
    if (lineas[k].startsWith('--')) break;
    for (const t of lineas[k].trim().split(/\s+/)) { if (t !== '') valores[n++] = Number(t); }
  }
  if (n < valores.length) throw new Error('ASCII Grid incompleto');
  return {
    ncols, nrows, dx, dy, nodata: cab.nodata_value ?? null, valores,
    // centro de la celda superior izquierda
    oeste: (cab.xllcorner ?? cab.xllcenter - dx / 2) + dx / 2,
    norte: (cab.yllcorner ?? cab.yllcenter - dy / 2) + nrows * dy - dy / 2,
  };
}

/** Interpolación bilineal en una malla ASC. null si cae fuera o en «sin datos». */
export function interpolarAsc(m, lat, lon) {
  const fx = (lon - m.oeste) / m.dx, fy = (m.norte - lat) / m.dy;
  if (fx < 0 || fy < 0 || fx > m.ncols - 1 || fy > m.nrows - 1) return null;
  const x0 = Math.min(Math.floor(fx), m.ncols - 2), y0 = Math.min(Math.floor(fy), m.nrows - 2);
  const tx = fx - x0, ty = fy - y0;
  const v = (x, y) => m.valores[y * m.ncols + x];
  const c = [v(x0, y0), v(x0 + 1, y0), v(x0, y0 + 1), v(x0 + 1, y0 + 1)];
  if (c.some((z) => z === m.nodata || !Number.isFinite(z) || z < -1000)) return null;
  return (1 - ty) * ((1 - tx) * c[0] + tx * c[1]) + ty * ((1 - tx) * c[2] + tx * c[3]);
}

/**
 * @param {{fetch?:Function, cobertura?:string, servicio?:string, maxParalelo?:number}} [opc]
 */
export function crearServicioAlturas(opc = {}) {
  const pedir = opc.fetch ?? ((...a) => fetch(...a));
  const servicio = opc.servicio ?? SERVICIO_MDT;
  const coberturas = opc.coberturas ?? ['Elevacion4258_5', 'Elevacion4258_25'];
  const maxParalelo = opc.maxParalelo ?? 6;
  const cache = new Map();       // clave → Promise<malla|null>
  let activas = 0; const cola = [];
  const turno = () => new Promise((r) => { if (activas < maxParalelo) { activas++; r(); } else cola.push(r); });
  const liberar = () => { const s = cola.shift(); if (s) s(); else activas--; };

  async function descargar(cob, bx, by) {
    const margen = 0.00012; // ≈ 2 celdas del MDT05
    const s = by * BLOQUE - margen, n = (by + 1) * BLOQUE + margen;
    const o = bx * BLOQUE - margen, e = (bx + 1) * BLOQUE + margen;
    const url = `${servicio}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&CoverageId=${cob}`
      + `&SUBSET=Lat(${s.toFixed(6)},${n.toFixed(6)})&SUBSET=Long(${o.toFixed(6)},${e.toFixed(6)})&FORMAT=application/asc`;
    await turno();
    try {
      const r = await pedir(url);
      if (!r.ok) throw new Error(`MDT: respuesta ${r.status}`);
      return leerAsc(await r.text());
    } finally { liberar(); }
  }

  function bloque(cob, bx, by) {
    const clave = `${cob}/${bx}/${by}`;
    if (!cache.has(clave)) {
      const p = descargar(cob, bx, by).catch((err) => { cache.delete(clave); throw err; });
      cache.set(clave, p);
      if (cache.size > 4000) cache.delete(cache.keys().next().value);
    }
    return cache.get(clave);
  }

  /** Altitud (m, sin redondear) o null si no hay datos. */
  async function altura(lat, lon) {
    const bx = Math.floor(lon / BLOQUE), by = Math.floor(lat / BLOQUE);
    for (const cob of coberturas) {
      const m = await bloque(cob, bx, by);
      const v = interpolarAsc(m, lat, lon);
      if (v !== null) return v;
    }
    return null;
  }

  /** Altitudes de muchos puntos (en paralelo, reutilizando bloques). */
  const alturas = (puntos) => Promise.all(puntos.map((p) => altura(p.lat, p.lon).catch(() => null)));

  return { altura, alturas, cache };
}

/** Redondeo al metro (como se muestra siempre). */
export const alMetro = (v) => (v === null || v === undefined ? null : Math.round(v));

/**
 * Resumen de un perfil: desnivel acumulado de subida y bajada, mínimo y máximo.
 * Para no sumar el «ruido» de la malla se usa un umbral de histéresis (por
 * defecto 1 m): solo cuenta un cambio cuando supera el umbral.
 * @param {Array<{d:number, z:number|null}>} muestras
 */
export function resumenPerfil(muestras, umbral = 1) {
  const v = muestras.filter((m) => m.z !== null);
  if (!v.length) return { subida: 0, bajada: 0, min: null, max: null, inicio: null, fin: null };
  let subida = 0, bajada = 0, ref = v[0].z, min = Infinity, max = -Infinity;
  for (const m of v) {
    min = Math.min(min, m.z); max = Math.max(max, m.z);
    const d = m.z - ref;
    if (d >= umbral) { subida += d; ref = m.z; } else if (d <= -umbral) { bajada -= d; ref = m.z; }
  }
  return { subida, bajada, min, max, inicio: v[0].z, fin: v.at(-1).z };
}
