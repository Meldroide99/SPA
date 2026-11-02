// Búsqueda aproximada (tolerante a erratas, acentos y sinónimos) y lectura
// flexible de coordenadas, para el buscador universal.

import { leerPosicion, geoAUtm, bandaLatitud } from '../geo/index.js';

/** Minúsculas, sin acentos ni signos raros, espacios simples. */
export function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ.,:/\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Distancia de Damerau-Levenshtein (transposiciones adyacentes). */
export function distancia(a, b, max = 99) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Grupos de palabras equivalentes (se buscan como si fueran la misma). */
export const SINONIMOS = [
  ['linea', 'track', 'ruta', 'itinerario', 'recorrido', 'camino', 'traza', 'polilinea'],
  ['punto', 'waypoint', 'wpt', 'marca', 'pv', 'cp', 'hito'],
  ['area', 'zona', 'poligono', 'superficie', 'recinto'],
  ['circulo', 'radio', 'alcance', 'circunferencia'],
  ['hibrido', 'satelite', 'foto', 'ortofoto', 'imagen', 'aerea', 'pnoa', 'google', 'esri', 'bing', 'orto'],
  ['topografico', 'mtn', 'mapa', 'carta', '25k', '25000', 'raster'],
  ['relieve', 'sombreado', 'sombra', 'mdt', 'terreno', 'altura', 'altitud', 'elevacion', 'cota'],
  ['curvas', 'nivel', 'isohipsas'],
  ['cuadricula', 'malla', 'grid', 'mgrs', 'reticula', 'reticulo'],
  ['milesimas', 'mils', 'mil', '6400'],
  ['grados', 'sexagesimales', 'gms'],
  ['medir', 'regla', 'distancia', 'rumbo', 'azimut', 'acimut'],
  ['importar', 'abrir', 'cargar', 'subir', 'gpx', 'kml', 'kmz', 'zip', 'atak', 'paquete'],
  ['ajustes', 'opciones', 'configuracion', 'preferencias'],
  ['borrar', 'eliminar', 'quitar', 'suprimir'],
  ['deshacer', 'atras', 'volver'],
  ['coordenadas', 'coordenada', 'posicion', 'formato'],
];
const mapaSin = new Map();
for (const g of SINONIMOS) for (const w of g) mapaSin.set(w, g);

/** Puntuación de una palabra de la consulta contra una del texto (0–100). */
function palabra(q, t) {
  if (t === q) return 100;
  if (t.startsWith(q)) return 92 - Math.min(10, t.length - q.length);
  if (q.length >= 3 && t.includes(q)) return 80;
  const max = q.length <= 3 ? (q.length === 3 ? 1 : 0) : q.length <= 6 ? 1 : 2;
  if (max) {
    const d = distancia(q, t.slice(0, q.length + max), max);
    const d2 = distancia(q, t, max);
    const dm = Math.min(d, d2);
    if (dm <= max) return 72 - dm * 12;
  }
  return 0;
}

/**
 * Puntuación (0–100) de un texto para una consulta. Todas las palabras de la
 * consulta tienen que encajar (exactas, prefijo, con erratas o por sinónimo).
 * @param {string} texto  texto principal (nombre)
 * @param {string} [extra] palabras clave adicionales
 */
export function puntuar(consulta, texto, extra = '') {
  const q = normalizar(consulta).split(' ').filter(Boolean);
  if (!q.length) return 0;
  const tN = normalizar(texto), palabras = `${tN} ${normalizar(extra)}`.split(' ').filter(Boolean);
  if (tN === normalizar(consulta)) return 100;
  let total = 0;
  for (const w of q) {
    let mejor = 0;
    for (const t of palabras) mejor = Math.max(mejor, palabra(w, t));
    if (mejor < 60) {
      // ¿Sinónimo?
      const grupo = mapaSin.get(w) ?? [...mapaSin.keys()].filter((k) => k.length > 3 && palabra(w, k) >= 60).map((k) => mapaSin.get(k))[0];
      if (grupo) for (const t of palabras) if (grupo.includes(t)) mejor = Math.max(mejor, 58);
    }
    if (!mejor) return 0;
    total += mejor;
  }
  // Pequeña ventaja si la consulta aparece seguida en el nombre
  const seguido = tN.includes(normalizar(consulta)) ? 4 : 0;
  return Math.min(99, total / q.length + seguido);
}

/** Ordena candidatos {texto, extra, ...} por puntuación (descarta < umbral). */
export function buscar(consulta, candidatos, umbral = 55) {
  return candidatos.map((c) => ({ ...c, puntos: puntuar(consulta, c.texto, c.extra) }))
    .filter((c) => c.puntos >= umbral).sort((a, b) => b.puntos - a.puntos);
}

/**
 * Lee una coordenada escrita de muchas formas. Si falta la zona (MGRS o UTM
 * sin huso), usa la del centro de la vista. Devuelve {lat, lon, lado, como}
 * o null.
 * @param {{lat:number, lon:number}} centro centro de la vista
 * @param {(epsg:number)=>{aGeo:Function}|null} [crs] para ED50
 */
export function leerCoordenadaFlexible(texto, centro, crs) {
  const t0 = String(texto).trim();
  if (!t0) return null;
  const intentos = [];
  const t = t0.replace(/[;|]/g, ' ').replace(/\s+/g, ' ');
  intentos.push([t, 'tal cual']);
  // Coma decimal: "40,84 -3,42" → "40.84 -3.42"
  if (/^-?\d+,\d+\s+-?\d+,\d+$/.test(t)) intentos.push([t.replace(/,/g, '.'), 'coma decimal']);
  // Sin letras sueltas tipo E/N: "E440290 N4474257"
  const sinEN = t.replace(/\b([EN])\s*(?=\d)/gi, '').replace(/(\d)\s*([EN])\b/gi, '$1');
  if (sinEN !== t) intentos.push([sinEN, 'UTM']);
  let zona = null, banda = null;
  try { const u = geoAUtm(centro.lat, centro.lon); zona = u.zona; banda = bandaLatitud(centro.lat); } catch { /* fuera */ }
  // MGRS sin zona: "VK 4029 7425" / "vk40297425"
  if (zona && /^[a-z]{2}\s*\d/i.test(t)) intentos.push([`${zona}${banda} ${t}`, `MGRS (zona ${zona}${banda} de la vista)`]);
  // UTM sin huso: "440290 4474257"
  const dos = /^(\d{6}(?:\.\d+)?)\s+(\d{7}(?:\.\d+)?)$/.exec(sinEN.trim());
  if (zona && dos) intentos.push([`${zona}N ${dos[1]} ${dos[2]}`, `UTM (huso ${zona} de la vista)`]);
  for (const [s, como] of intentos) {
    try {
      const p = leerPosicion(s);
      if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { ...p, como, texto: s };
    } catch { /* siguiente */ }
  }
  // ED50: "ED50 30 440400 4474465"
  const ed = /ed\s*50/i.test(t) && /(\d{2})?\D*(\d{6}(?:\.\d+)?)\D+(\d{7}(?:\.\d+)?)/.exec(t.replace(/ed\s*50/i, ''));
  if (ed && crs) {
    const z = Number(ed[1] || zona);
    const c = crs(23000 + z);
    const g = c?.aGeo(Number(ed[2]), Number(ed[3]));
    if (g) return { lat: g.lat, lon: g.lon, lado: 1, como: `ED50 UTM ${z} (rejilla del IGN)`, texto: t };
  }
  return null;
}

/** Texto MGRS de la zona de cuadrícula (p. ej. «30T») de un punto. */
export function zonaMgrs(p) {
  try { const u = geoAUtm(p.lat, p.lon); return `${u.zona}${bandaLatitud(p.lat)}`; } catch { return ''; }
}
