// Importación de datos vectoriales: GPX, KML, KMZ, CoT (ATAK) y paquetes
// de datos de ATAK (.zip). Todo se convierte a una forma común:
//
//   { nombre, formato, elementos: [Elemento], mapas: [{nombre, blob}],
//     superposiciones: [Superposicion], avisos: [string] }
//
//   Elemento: { tipo: 'punto'|'linea'|'area'|'circulo', nombre, descripcion,
//               puntos: [{lat, lon, ele?}], radio?, bando?, color?, grosor?,
//               discontinuo?, origen, refAltura: 'archivo'|'hae' }
//   Superposicion (imagen georreferenciada de KML/KMZ):
//     { nombre, blob, norte, sur, este, oeste, rotacion }
//
// Las alturas que traen los archivos se guardan tal cual (`ele`) y se indica
// su referencia: en CoT son elipsoidales (HAE); en GPX/KML depende del
// programa que los generó. La altitud que muestra SPA sale del MDT del IGN.

import { leerXml, hijo, hijos, texto, buscarTodos } from './xml.js';
import { abrirZip } from './zip.js';

const EXT_MAPAS = /\.(sqlite|mbtiles|db|tif|tiff|jpg|jpeg|png|jgw|jpgw|pgw|pngw|tfw|tifw|wld|prj|aux\.xml|ecw|jp2|sid)$/i;
const extension = (n) => (/\.([^.\/]+)$/.exec(n)?.[1] ?? '').toLowerCase();
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : undefined; };

/** Bando a partir del tipo CoT (a-f-…, a-h-…). */
export function bandoCot(tipo) {
  const a = /^a-(\w)/.exec(tipo || '')?.[1];
  if (a === 'f' || a === 'a') return 'propio';
  if (a === 'h' || a === 's' || a === 'j' || a === 'k') return 'enemigo';
  if (a === 'n') return 'neutral';
  return 'desconocido';
}

/** Color ARGB con signo (ATAK) → '#rrggbb'. */
export function colorArgb(v) {
  const n = Number(v); if (!Number.isFinite(n)) return undefined;
  const u = n >>> 0;
  return `#${(u & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Color KML aabbggrr → '#rrggbb'. */
export function colorKml(v) {
  const s = String(v || '').trim().replace(/^#/, '');
  if (s.length !== 8) return undefined;
  return `#${s.slice(6, 8)}${s.slice(4, 6)}${s.slice(2, 4)}`;
}

// ---------------------------------------------------------------- GPX
export function leerGpx(xml, nombre = 'GPX') {
  const doc = leerXml(xml);
  const gpx = buscarTodos(doc, 'gpx')[0];
  if (!gpx) throw new Error('El archivo no es GPX');
  const pt = (n) => ({ lat: num(n.attrs.lat), lon: num(n.attrs.lon), ele: num(texto(n, 'ele')) });
  const valido = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const elementos = [];
  for (const w of hijos(gpx, 'wpt')) {
    const p = pt(w); if (!valido(p)) continue;
    elementos.push({ tipo: 'punto', nombre: texto(w, 'name'), descripcion: texto(w, 'cmt') || '', puntos: [p], origen: 'wpt', refAltura: 'archivo' });
  }
  for (const r of hijos(gpx, 'rte')) {
    const pts = hijos(r, 'rtept').map(pt).filter(valido);
    if (pts.length > 1) elementos.push({ tipo: 'linea', nombre: texto(r, 'name') || 'Ruta', descripcion: texto(r, 'desc'), puntos: pts, origen: 'rte', refAltura: 'archivo' });
  }
  for (const t of hijos(gpx, 'trk')) {
    const segs = hijos(t, 'trkseg');
    segs.forEach((s, i) => {
      const pts = hijos(s, 'trkpt').map(pt).filter(valido);
      if (pts.length > 1) elementos.push({ tipo: 'linea', nombre: (texto(t, 'name') || 'Track') + (segs.length > 1 ? ` (${i + 1})` : ''), descripcion: texto(t, 'desc'), puntos: pts, origen: 'trk', refAltura: 'archivo' });
    });
  }
  const nom = texto(hijo(gpx, 'metadata'), 'name') || nombre;
  return { nombre: nom, formato: 'GPX', elementos, mapas: [], superposiciones: [], avisos: [] };
}

// ---------------------------------------------------------------- KML / KMZ
function coordsKml(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).map((c) => {
    const [lon, lat, ele] = c.split(',').map(Number);
    return { lat, lon, ele: Number.isFinite(ele) ? ele : undefined };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/**
 * @param {string} xml
 * @param {(href:string)=>Promise<Blob|null>} [recurso] para imágenes de GroundOverlay (KMZ)
 */
export async function leerKml(xml, nombre = 'KML', recurso = async () => null) {
  const doc = leerXml(xml);
  const avisos = [];
  // Estilos por id (Style y StyleMap → normal)
  const estilos = {};
  for (const s of buscarTodos(doc, 'Style')) if (s.attrs.id) estilos[s.attrs.id] = s;
  for (const m of buscarTodos(doc, 'StyleMap')) {
    if (!m.attrs.id) continue;
    const par = hijos(m, 'Pair').find((p) => texto(p, 'key') === 'normal') ?? hijos(m, 'Pair')[0];
    const url = texto(par, 'styleUrl').replace(/^#/, '');
    if (estilos[url]) estilos[m.attrs.id] = estilos[url];
  }
  const estiloDe = (pm) => {
    const s = hijo(pm, 'Style') ?? estilos[texto(pm, 'styleUrl').replace(/^#/, '')];
    const ls = hijo(s, 'LineStyle');
    return { color: colorKml(texto(ls, 'color')), grosor: num(texto(ls, 'width')) };
  };
  const elementos = [];
  for (const pm of buscarTodos(doc, 'Placemark')) {
    const nom = texto(pm, 'name'); const desc = texto(pm, 'description').replace(/<[^>]+>/g, ' ').trim();
    const est = estiloDe(pm);
    const geoms = [];
    const recoger = (n) => {
      for (const h of n.hijos) {
        if (h.local === 'MultiGeometry' || h.local === 'MultiTrack') recoger(h);
        else if (['Point', 'LineString', 'Polygon', 'LinearRing', 'Track'].includes(h.local)) geoms.push(h);
      }
    };
    recoger(pm);
    for (const g of geoms) {
      if (g.local === 'Point') {
        const p = coordsKml(texto(g, 'coordinates'))[0];
        if (p) elementos.push({ tipo: 'punto', nombre: nom, descripcion: desc, puntos: [p], origen: 'kml', refAltura: 'archivo', ...est });
      } else if (g.local === 'LineString') {
        const pts = coordsKml(texto(g, 'coordinates'));
        if (pts.length > 1) elementos.push({ tipo: 'linea', nombre: nom, descripcion: desc, puntos: pts, origen: 'kml', refAltura: 'archivo', ...est });
      } else if (g.local === 'Polygon' || g.local === 'LinearRing') {
        const anillo = g.local === 'Polygon' ? buscarTodos(hijo(g, 'outerBoundaryIs') ?? g, 'coordinates')[0] : hijo(g, 'coordinates');
        let pts = coordsKml(anillo?.texto);
        if (pts.length > 1 && pts[0].lat === pts.at(-1).lat && pts[0].lon === pts.at(-1).lon) pts = pts.slice(0, -1);
        if (pts.length > 2) elementos.push({ tipo: 'area', nombre: nom, descripcion: desc, puntos: pts, origen: 'kml', refAltura: 'archivo', ...est });
      } else if (g.local === 'Track') {
        const pts = hijos(g, 'coord').map((c) => { const [lon, lat, ele] = c.texto.trim().split(/\s+/).map(Number); return { lat, lon, ele: Number.isFinite(ele) ? ele : undefined }; })
          .filter((p) => Number.isFinite(p.lat));
        if (pts.length > 1) elementos.push({ tipo: 'linea', nombre: nom, descripcion: desc, puntos: pts, origen: 'kml', refAltura: 'archivo', ...est });
      }
    }
  }
  const superposiciones = [];
  for (const go of buscarTodos(doc, 'GroundOverlay')) {
    const box = hijo(go, 'LatLonBox');
    const href = texto(hijo(go, 'Icon'), 'href');
    if (!box) { avisos.push(`Superposición «${texto(go, 'name')}» sin LatLonBox: no se puede colocar`); continue; }
    const blob = href ? await recurso(href) : null;
    if (!blob) { avisos.push(`Superposición «${texto(go, 'name')}»: imagen no disponible (${href || 'sin enlace'})`); continue; }
    superposiciones.push({
      nombre: texto(go, 'name') || href, blob,
      norte: num(texto(box, 'north')), sur: num(texto(box, 'south')), este: num(texto(box, 'east')), oeste: num(texto(box, 'west')),
      rotacion: num(texto(box, 'rotation')) ?? 0,
    });
  }
  const nomDoc = texto(buscarTodos(doc, 'Document')[0], 'name') || nombre;
  return { nombre: nomDoc, formato: 'KML', elementos, mapas: [], superposiciones, avisos };
}

// ---------------------------------------------------------------- CoT (ATAK)
/** Un evento CoT → elemento (o null si no es representable). */
export function leerCot(xml) {
  const doc = leerXml(xml);
  const ev = buscarTodos(doc, 'event')[0];
  if (!ev) return null;
  const tipo = ev.attrs.type || '';
  const p = hijo(ev, 'point');
  const det = hijo(ev, 'detail');
  const nombre = hijo(det, 'contact')?.attrs.callsign || texto(det, 'remarks') || tipo;
  const descripcion = texto(det, 'remarks');
  const centro = p ? { lat: num(p.attrs.lat), lon: num(p.attrs.lon), ele: num(p.attrs.hae) } : null;
  if (centro && centro.ele !== undefined && centro.ele > 9e6) centro.ele = undefined; // 9999999 = desconocida
  const color = colorArgb(hijo(det, 'strokeColor')?.attrs.value ?? hijo(det, 'color')?.attrs.argb ?? hijo(det, 'color')?.attrs.value);
  const grosor = num(hijo(det, 'strokeWeight')?.attrs.value);
  const discontinuo = /dash|dot/i.test(hijo(det, 'strokeStyle')?.attrs.value || '');
  const base = { nombre, descripcion, origen: `cot:${tipo}`, refAltura: 'hae', color, grosor, discontinuo };
  const enlaces = hijos(det, 'link').filter((l) => l.attrs.point).map((l) => {
    const [lat, lon, ele] = l.attrs.point.split(',').map(Number);
    return { lat, lon, ele: Number.isFinite(ele) ? ele : undefined };
  }).filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon));

  if (tipo.startsWith('a-')) return { ...base, tipo: 'punto', puntos: [centro], bando: bandoCot(tipo), color: undefined };
  const elipse = buscarTodos(det || { hijos: [] }, 'ellipse')[0];
  if (elipse && centro) {
    const r = (num(elipse.attrs.major) + num(elipse.attrs.minor)) / 2;
    return { ...base, tipo: 'circulo', puntos: [centro], radio: r };
  }
  if (enlaces.length >= 2) {
    const cerrada = tipo === 'u-d-r' || /closed/i.test(JSON.stringify(det?.attrs ?? {})) || hijo(det, 'closed')?.attrs.value === 'true'
      || (tipo === 'u-d-f' && enlaces.length > 2 && enlaces[0].lat === enlaces.at(-1).lat && enlaces[0].lon === enlaces.at(-1).lon);
    let pts = enlaces;
    if (cerrada && pts.length > 2 && pts[0].lat === pts.at(-1).lat && pts[0].lon === pts.at(-1).lon) pts = pts.slice(0, -1);
    return { ...base, tipo: cerrada && pts.length > 2 ? 'area' : 'linea', puntos: pts };
  }
  if (centro && Number.isFinite(centro.lat)) return { ...base, tipo: 'punto', puntos: [centro], bando: tipo.startsWith('b-') ? undefined : 'desconocido' };
  return null;
}

// ---------------------------------------------------------------- paquetes y despacho
const vacio = (nombre, formato) => ({ nombre, formato, elementos: [], mapas: [], superposiciones: [], avisos: [] });
function sumar(dest, r) {
  dest.elementos.push(...r.elementos); dest.mapas.push(...r.mapas);
  dest.superposiciones.push(...r.superposiciones); dest.avisos.push(...r.avisos);
}

async function leerKmz(blob, nombre) {
  const { entradas } = await abrirZip(blob);
  const kml = entradas.find((e) => /(^|\/)doc\.kml$/i.test(e.nombre)) ?? entradas.find((e) => /\.kml$/i.test(e.nombre));
  if (!kml) throw new Error('El KMZ no contiene ningún KML');
  const base = kml.nombre.includes('/') ? kml.nombre.replace(/[^/]+$/, '') : '';
  const recurso = async (href) => {
    const h = decodeURIComponent(href).replace(/^\.\//, '');
    const e = entradas.find((x) => x.nombre === base + h || x.nombre === h || x.nombre.endsWith(`/${h}`));
    return e ? e.comoBlob() : null;
  };
  const r = await leerKml(await kml.leerTexto(), nombre, recurso);
  r.formato = 'KMZ';
  return r;
}

async function leerPaqueteZip(blob, nombre) {
  const { entradas } = await abrirZip(blob);
  const res = vacio(nombre, 'Paquete');
  const man = entradas.find((e) => /manifest\.xml$/i.test(e.nombre));
  const nombres = {};
  if (man) {
    res.formato = 'Paquete ATAK';
    const m = leerXml(await man.leerTexto());
    const conf = buscarTodos(m, 'Configuration')[0];
    const nomPaq = hijos(conf, 'Parameter').find((x) => x.attrs.name === 'name')?.attrs.value;
    if (nomPaq) res.nombre = nomPaq;
    for (const c of buscarTodos(m, 'Content')) {
      const n = hijos(c, 'Parameter').find((x) => x.attrs.name === 'name')?.attrs.value;
      if (n) nombres[c.attrs.zipEntry] = n;
    }
  }
  for (const e of entradas) {
    if (e === man) continue;
    const ext = extension(e.nombre);
    const corto = e.nombre.replace(/^.*\//, '');
    try {
      if (ext === 'cot' || (ext === 'xml' && !/manifest/i.test(e.nombre))) {
        const el = leerCot(await e.leerTexto());
        if (el) { if (nombres[e.nombre] && (!el.nombre || el.nombre === el.origen.slice(4))) el.nombre = nombres[e.nombre]; res.elementos.push(el); }
      } else if (ext === 'gpx') sumar(res, leerGpx(await e.leerTexto(), corto));
      else if (ext === 'kml') sumar(res, await leerKml(await e.leerTexto(), corto));
      else if (ext === 'kmz') sumar(res, await leerKmz(await e.comoBlob(), corto));
      else if (ext === 'zip') sumar(res, await leerPaqueteZip(await e.comoBlob(), corto));
      else if (EXT_MAPAS.test(e.nombre)) res.mapas.push({ nombre: corto, blob: await e.comoBlob() });
      else res.avisos.push(`Sin usar: ${corto}`);
    } catch (err) {
      res.avisos.push(`${corto}: ${err.message}`);
    }
  }
  return res;
}

/** ¿Es un archivo de datos (no de mapa)? */
export const esDatos = (nombre) => /\.(gpx|kml|kmz|cot|zip)$/i.test(nombre);
export const esMapa = (nombre) => EXT_MAPAS.test(nombre);

/** Importa un archivo de datos (File o Blob con nombre). */
export async function importarDatos(archivo, nombre = archivo.name) {
  const ext = extension(nombre);
  const base = nombre.replace(/\.[^.]+$/, '');
  if (ext === 'gpx') return leerGpx(await archivo.text(), base);
  if (ext === 'kml') return leerKml(await archivo.text(), base);
  if (ext === 'kmz') return leerKmz(archivo, base);
  if (ext === 'cot') { const r = vacio(base, 'CoT'); const el = leerCot(await archivo.text()); if (el) r.elementos.push(el); return r; }
  if (ext === 'zip') return leerPaqueteZip(archivo, base);
  throw new Error(`Formato de datos no reconocido: .${ext}`);
}
