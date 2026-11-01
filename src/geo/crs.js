// Sistemas de coordenadas de los mapas que se importan (por código EPSG o
// por su descripción WKT). Todo se pasa a/desde WGS84 (≈ ETRS89) con el
// motor verificado; ED50 con la rejilla oficial del IGN.
//
//   crs.aGeo(x, y)    → {lat, lon} WGS84 (null si no se puede)
//   crs.deGeo(lat, lon) → {x, y} en el sistema del mapa (null si no se puede)

import { geoAUtm, utmAGeo } from './utm.js';
import { INTERNACIONAL_1924 } from './constantes.js';
import { ed50AEtrs89, etrs89AEd50 } from './rejillas.js';

const R = 6378137;
const GEO = (nombre, epsg) => ({ nombre, epsg, geografico: true, aGeo: (x, y) => ({ lat: y, lon: x }), deGeo: (lat, lon) => ({ x: lon, y: lat }) });

function utm(nombre, epsg, zona, hemisferio, { ed50 = false } = {}) {
  const opc = ed50 ? { elipsoide: INTERNACIONAL_1924 } : {};
  return {
    nombre, epsg, zona, hemisferio, ed50, requiereRejillas: ed50,
    aGeo(x, y) {
      const g = utmAGeo(zona, hemisferio, x, y, opc);
      return ed50 ? ed50AEtrs89(g.lat, g.lon) : { lat: g.lat, lon: g.lon };
    },
    deGeo(lat, lon) {
      const q = ed50 ? etrs89AEd50(lat, lon) : { lat, lon };
      if (!q) return null;
      const u = geoAUtm(q.lat, q.lon, { zona, ...opc });
      return { x: u.este, y: hemisferio === 'S' && u.hemisferio === 'N' ? u.norte + 10000000 : u.norte };
    },
  };
}

/** Sistema de coordenadas a partir de su código EPSG. null si no se conoce. */
export function crsDesdeEpsg(epsg) {
  const e = Number(epsg);
  if ([4326, 4258, 4937, 4979, 4080, 4081].includes(e)) {
    return GEO(e === 4258 ? 'ETRS89 geográficas' : e === 4081 || e === 4080 ? 'REGCAN95 geográficas' : 'WGS84 geográficas', e);
  }
  if (e === 4230) {
    return {
      nombre: 'ED50 geográficas', epsg: e, geografico: true, requiereRejillas: true,
      aGeo: (x, y) => ed50AEtrs89(y, x),
      deGeo: (lat, lon) => { const q = etrs89AEd50(lat, lon); return q && { x: q.lon, y: q.lat }; },
    };
  }
  if ([3857, 900913, 3785, 102100, 102113].includes(e)) {
    return {
      nombre: 'Web Mercator', epsg: 3857,
      aGeo: (x, y) => ({ lon: (x / R) * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI }),
      deGeo: (lat, lon) => ({ x: R * lon * Math.PI / 180, y: R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) }),
    };
  }
  if (e >= 32601 && e <= 32660) return utm(`WGS84 / UTM ${e - 32600}N`, e, e - 32600, 'N');
  if (e >= 32701 && e <= 32760) return utm(`WGS84 / UTM ${e - 32700}S`, e, e - 32700, 'S');
  if (e >= 25828 && e <= 25838) return utm(`ETRS89 / UTM ${e - 25800}N`, e, e - 25800, 'N');
  if (e >= 3040 && e <= 3051) return utm(`ETRS89 / UTM ${e - 3012}N`, e, e - 3012, 'N'); // ETRS-TM
  if (e >= 23028 && e <= 23038) return utm(`ED50 / UTM ${e - 23000}N`, e, e - 23000, 'N', { ed50: true });
  if (e === 4082) return utm('REGCAN95 / UTM 27N', e, 27, 'N');
  if (e === 4083) return utm('REGCAN95 / UTM 28N', e, 28, 'N');
  return null;
}

/**
 * Deduce el EPSG de un texto (WKT de un .prj, citas GeoTIFF, nombre).
 * Devuelve el código o null.
 */
export function epsgDesdeTexto(txt) {
  if (!txt) return null;
  const s = String(txt);
  // WKT1: la autoridad del sistema completo es la última de nivel superior
  const autoridades = [...s.matchAll(/AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/gi)].map((m) => Number(m[1]));
  const wkt2 = [...s.matchAll(/ID\s*\[\s*"EPSG"\s*,\s*(\d+)\s*\]/gi)].map((m) => Number(m[1]));
  const ultima = autoridades.at(-1) ?? wkt2.at(-1);
  if (ultima && crsDesdeEpsg(ultima) && /^(PROJCS|GEOGCS|PROJCRS|GEOGCRS)/i.test(s.trim())) return ultima;
  const m = /UTM[\s_]*zone[\s_]*(\d{1,2})\s*([NS])?/i.exec(s) || /UTM[\s_-]*(?:huso|h)?[\s_-]*(\d{1,2})\s*([NS])?/i.exec(s);
  const datum = /ED[\s_]?50|European[\s_]Datum[\s_]1950/i.test(s) ? 'ED50'
    : /ETRS[\s_]?(19)?89|ETRF/i.test(s) ? 'ETRS89' : /WGS[\s_]?84|WGS[\s_]1984/i.test(s) ? 'WGS84' : /REGCAN/i.test(s) ? 'REGCAN95' : null;
  if (m) {
    const z = Number(m[1]); const sur = (m[2] || 'N').toUpperCase() === 'S';
    if (datum === 'ED50') return 23000 + z;
    if (datum === 'ETRS89' && !sur) return 25800 + z;
    if (datum === 'REGCAN95') return z === 27 ? 4082 : 4083;
    return (sur ? 32700 : 32600) + z;
  }
  if (/Mercator_Auxiliary_Sphere|Pseudo[\s_-]?Mercator|Popular Visualisation|3857/i.test(s)) return 3857;
  if (/^GEOGCS|^GEOGCRS/i.test(s.trim())) return datum === 'ED50' ? 4230 : datum === 'ETRS89' ? 4258 : 4326;
  return ultima && crsDesdeEpsg(ultima) ? ultima : null;
}

/** Sistemas que se ofrecen en el selector cuando un mapa no trae el suyo. */
export const CRS_COMUNES = [25830, 25829, 25831, 25828, 23030, 23029, 23031, 32630, 4258, 4326, 4230, 3857];
