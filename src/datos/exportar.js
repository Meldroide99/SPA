// Exportar objetos a otros formatos: GeoJSON, KML, KMZ, GPX y CSV.
//
// Entrada común («objeto exportable»):
//   { nombre, tipo: 'punto'|'linea'|'area'|'circulo', puntos: [{lat,lon}],
//     radio?, color?, categoria?, paquete? (ruta: «OP NORTE › Fase 1»),
//     bando?, estado?, sidc?, notas? }
// Los círculos se exportan como polígono geodésico (cada vértice a `radio`
// metros exactos del centro) y guardan el radio en sus propiedades.
// Coordenadas siempre en WGS84 (EPSG:4326), como piden los formatos.
//
// No depende de la página: se prueba en Node.

import { puntosCirculo } from '../plan/plan.js';
import { formatearPosicion } from '../geo/index.js';
import { crc32 } from './escritores.js';

export const FORMATOS_EXPORTAR = Object.freeze({
  kmz: { nombre: 'KMZ', ext: 'kmz', tipo: 'application/vnd.google-earth.kmz', detalle: 'Google Earth y ATAK (con carpetas por operación)' },
  kml: { nombre: 'KML', ext: 'kml', tipo: 'application/vnd.google-earth.kml+xml', detalle: 'Google Earth, ATAK, QGIS' },
  geojson: { nombre: 'GeoJSON', ext: 'geojson', tipo: 'application/geo+json', detalle: 'QGIS, ArcGIS y webs' },
  gpx: { nombre: 'GPX', ext: 'gpx', tipo: 'application/gpx+xml', detalle: 'GPS de mano (Garmin), apps de rutas' },
  csv: { nombre: 'CSV', ext: 'csv', tipo: 'text/csv', detalle: 'Excel: una fila por objeto, con MGRS' },
  spa: { nombre: 'Paquete SPA', ext: 'spa.json', tipo: 'application/json', detalle: 'Para otro usuario de SPA: se abre como operación editable' },
});

const r7 = (v) => Math.round(v * 1e7) / 1e7; // ~1 cm
const anillo = (o) => (o.tipo === 'circulo' ? puntosCirculo(o.puntos[0], o.radio, 72) : o.puntos);
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** Propiedades comunes (sin vacíos). */
function props(o) {
  const p = { nombre: o.nombre || '', tipo: o.tipo };
  for (const k of ['categoria', 'paquete', 'bando', 'estado', 'sidc', 'notas', 'color']) if (o[k]) p[k] = o[k];
  if (o.tipo === 'circulo') p.radio_m = Math.round(o.radio * 100) / 100;
  return p;
}

// ---------------------------------------------------------------- GeoJSON (RFC 7946)
export function aGeoJSON(objetos, { nombre = 'SPA' } = {}) {
  const features = objetos.map((o) => {
    let geometry;
    if (o.tipo === 'punto') geometry = { type: 'Point', coordinates: [r7(o.puntos[0].lon), r7(o.puntos[0].lat)] };
    else if (o.tipo === 'linea') geometry = { type: 'LineString', coordinates: o.puntos.map((p) => [r7(p.lon), r7(p.lat)]) };
    else {
      const a = anillo(o).map((p) => [r7(p.lon), r7(p.lat)]);
      geometry = { type: 'Polygon', coordinates: [[...a, a[0]]] };
    }
    return { type: 'Feature', properties: props(o), geometry };
  });
  return JSON.stringify({ type: 'FeatureCollection', name: nombre, features }, null, 1);
}

// ---------------------------------------------------------------- KML 2.2
/** Color CSS #rrggbb → KML aabbggrr. */
export function colorKml(c = '#1F5FA8', alfa = 'ff') {
  const h = /^#?([0-9a-f]{6})$/i.exec(c)?.[1] ?? '1f5fa8';
  return `${alfa}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase();
}
const coordKml = (pts) => pts.map((p) => `${r7(p.lon)},${r7(p.lat)},0`).join(' ');

function placemark(o) {
  const color = o.color || '#1F5FA8';
  const datos = Object.entries(props(o)).filter(([k]) => k !== 'nombre').map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join('');
  let geom;
  if (o.tipo === 'punto') geom = `<Point><coordinates>${coordKml(o.puntos)}</coordinates></Point>`;
  else if (o.tipo === 'linea') geom = `<LineString><tessellate>1</tessellate><coordinates>${coordKml(o.puntos)}</coordinates></LineString>`;
  else { const a = anillo(o); geom = `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coordKml([...a, a[0]])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`; }
  const estilo = `<Style><IconStyle><color>${colorKml(color)}</color></IconStyle><LineStyle><color>${colorKml(color)}</color><width>3</width></LineStyle><PolyStyle><color>${colorKml(color, '33')}</color></PolyStyle></Style>`;
  return `<Placemark><name>${xml(o.nombre)}</name>${o.notas ? `<description>${xml(o.notas)}</description>` : ''}${estilo}<ExtendedData>${datos}</ExtendedData>${geom}</Placemark>`;
}

/** KML con una carpeta por paquete (operación › fase), en el orden en que llegan. */
export function aKML(objetos, { nombre = 'SPA' } = {}) {
  const raiz = { carpetas: new Map(), objetos: [] };
  for (const o of objetos) {
    let nodo = raiz;
    for (const parte of (o.paquete ? String(o.paquete).split(' › ') : [])) {
      if (!nodo.carpetas.has(parte)) nodo.carpetas.set(parte, { carpetas: new Map(), objetos: [] });
      nodo = nodo.carpetas.get(parte);
    }
    nodo.objetos.push(o);
  }
  const pinta = (n) => [...[...n.carpetas].map(([k, v]) => `<Folder><name>${xml(k)}</name>${pinta(v)}</Folder>`), ...n.objetos.map(placemark)].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(nombre)}</name>\n${pinta(raiz)}\n</Document></kml>\n`;
}

/** KMZ: el KML comprimido en un ZIP (doc.kml), como lo leen Google Earth y ATAK. */
export async function aKMZ(objetos, opc = {}) {
  return escribirZip([{ nombre: 'doc.kml', datos: new TextEncoder().encode(aKML(objetos, opc)) }], 'application/vnd.google-earth.kmz');
}

// ---------------------------------------------------------------- GPX 1.1
export function aGPX(objetos, { nombre = 'SPA' } = {}) {
  const wpt = [], trk = [];
  for (const o of objetos) {
    if (o.tipo === 'punto') { wpt.push(`<wpt lat="${r7(o.puntos[0].lat)}" lon="${r7(o.puntos[0].lon)}"><name>${xml(o.nombre)}</name>${o.paquete ? `<desc>${xml(o.paquete)}</desc>` : ''}</wpt>`); continue; }
    const pts = o.tipo === 'linea' ? o.puntos : [...anillo(o), anillo(o)[0]];
    trk.push(`<trk><name>${xml(o.nombre)}</name>${o.paquete ? `<desc>${xml(o.paquete)}</desc>` : ''}<trkseg>${pts.map((p) => `<trkpt lat="${r7(p.lat)}" lon="${r7(p.lon)}"/>`).join('')}</trkseg></trk>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="SPA" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(nombre)}</name></metadata>\n${[...wpt, ...trk].join('\n')}\n</gpx>\n`;
}

// ---------------------------------------------------------------- CSV (Excel en español: separador «;»)
export function aCSV(objetos) {
  const c = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = [['Nombre', 'Tipo', 'Categoría', 'Operación', 'Bando', 'MGRS', 'Latitud', 'Longitud', 'Radio (m)', 'Puntos (lat lon)']];
  for (const o of objetos) {
    const ref = o.tipo === 'punto' || o.tipo === 'circulo' ? o.puntos[0] : centro(o.puntos);
    let mgrs = ''; try { mgrs = formatearPosicion(ref, { formato: 'mgrs', precisionMgrs: 5, separado: true }); } catch { /* fuera de UTM */ }
    filas.push([o.nombre, o.tipo, o.categoria, o.paquete, o.bando, mgrs, r7(ref.lat), r7(ref.lon), o.tipo === 'circulo' ? Math.round(o.radio * 100) / 100 : '', o.puntos.map((p) => `${r7(p.lat)} ${r7(p.lon)}`).join(', ')]);
  }
  return `﻿${filas.map((f) => f.map(c).join(';')).join('\r\n')}\r\n`;
}
const centro = (pts) => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length });

// ---------------------------------------------------------------- ZIP sencillo (sin comprimir)
export function escribirZip(archivos, tipo = 'application/zip') {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let off = 0;
  for (const a of archivos) {
    const d = a.datos instanceof Uint8Array ? a.datos : enc.encode(String(a.datos));
    const nombre = enc.encode(a.nombre);
    const crc = crc32(d);
    const loc = new Uint8Array(30 + nombre.length); const v = new DataView(loc.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true); v.setUint32(18, d.length, true); v.setUint32(22, d.length, true); v.setUint16(26, nombre.length, true);
    loc.set(nombre, 30);
    const cen = new Uint8Array(46 + nombre.length); const w = new DataView(cen.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x800, true);
    w.setUint32(16, crc, true); w.setUint32(20, d.length, true); w.setUint32(24, d.length, true); w.setUint16(28, nombre.length, true);
    w.setUint32(42, off, true); cen.set(nombre, 46);
    partes.push(loc, d); central.push(cen);
    off += loc.length + d.length;
  }
  const tamDir = central.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22); const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, central.length, true); f.setUint16(10, central.length, true);
  f.setUint32(12, tamDir, true); f.setUint32(16, off, true);
  return new Blob([...partes, ...central, fin], { type: tipo });
}

/** Archivo listo para descargar o compartir. `paquete`: el paquete SPA (solo para formato 'spa'). */
export async function crearArchivo(formato, objetos, { nombre = 'SPA', paquete = null } = {}) {
  const f = FORMATOS_EXPORTAR[formato]; if (!f) throw new Error(`Formato desconocido: ${formato}`);
  const base = (nombre || 'SPA').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'SPA';
  let blob;
  if (formato === 'kmz') blob = await aKMZ(objetos, { nombre });
  else if (formato === 'kml') blob = new Blob([aKML(objetos, { nombre })], { type: f.tipo });
  else if (formato === 'geojson') blob = new Blob([aGeoJSON(objetos, { nombre })], { type: f.tipo });
  else if (formato === 'gpx') blob = new Blob([aGPX(objetos, { nombre })], { type: f.tipo });
  else if (formato === 'csv') blob = new Blob([aCSV(objetos)], { type: f.tipo });
  else blob = new Blob([JSON.stringify(paquete, null, 1)], { type: f.tipo });
  return { blob, nombre: `${base}.${f.ext}`, tipo: f.tipo };
}
