// MGRS (Military Grid Reference System) sobre UTM / WGS84.
//
// Reglas que se cumplen aquí (y que es fácil hacer mal):
//   1. La coordenada se TRUNCA, no se redondea. "30TVK4074" (Puerta del
//      Sol, a 1 km) designa el cuadrado de 1 km cuya esquina SW es
//      440 000 E / 4 474 000 N, y vale para cualquier punto dentro de él.
//   2. La banda de latitud (letra tras la zona) va de C a X, 8° cada una,
//      salvo X (72°–84°, 12°). Sin I ni O.
//   3. Las letras del cuadrado de 100 km siguen el esquema AA (WGS84):
//      columnas en tres series según zona; filas desplazadas 5 en zonas pares.
//   4. Al leer, la fila de 100 km se repite cada 2 000 km: se resuelve con
//      la banda de latitud.
//
// Precisión (dígitos por coordenada): 0 → 100 km, 1 → 10 km, 2 → 1 km,
// 3 → 100 m, 4 → 10 m, 5 → 1 m.

import { geoAUtm, utmAGeo } from './utm.js';

const BANDAS = 'CDEFGHJKLMNPQRSTUVWX';           // 20 bandas desde −80°
const COLUMNAS = ['STUVWXYZ', 'ABCDEFGH', 'JKLMNPQR']; // índice: zona % 3
const FILAS = 'ABCDEFGHJKLMNPQRSTUV';            // 20 letras, ciclo de 2 000 km

/** Letra de banda de latitud. */
export function bandaLatitud(lat) {
  if (!(lat >= -80 && lat <= 84)) throw new Error(`Latitud ${lat} fuera del ámbito MGRS/UTM`);
  let i = Math.floor((lat + 80) / 8);
  if (i > 19) i = 19; // X cubre 72°–84°
  return BANDAS[i];
}

/** Límites (sur, norte) de una banda. */
function limitesBanda(letra) {
  const i = BANDAS.indexOf(letra);
  if (i < 0) throw new Error(`Banda de latitud no válida: ${letra}`);
  const sur = -80 + 8 * i;
  return { sur, norte: i === 19 ? 84 : sur + 8 };
}

// Truncado hacia abajo (regla MGRS). Sin tolerancias artificiales: el banco
// de pruebas compara contra GeographicLib, incluidos puntos en los bordes.
const truncar = (v, paso) => Math.floor(v / paso);

/**
 * Geográficas → MGRS.
 * @param {number} lat
 * @param {number} lon
 * @param {number} [precision=5] dígitos por coordenada (0–5)
 * @param {{separado?:boolean, zona?:number}} [opc]
 * @returns {string} p. ej. "30TVK4029074257" o "30T VK 40290 74257"
 */
export function geoAMgrs(lat, lon, precision = 5, opc = {}) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 5) {
    throw new Error('La precisión MGRS va de 0 (100 km) a 5 (1 m)');
  }
  const u = geoAUtm(lat, lon, { zona: opc.zona });
  return utmAMgrs(u.zona, bandaLatitud(lat), u.este, u.norte, precision, opc);
}

/** UTM (+ banda) → MGRS. Útil cuando ya se tienen E/N. */
export function utmAMgrs(zona, banda, este, norte, precision = 5, opc = {}) {
  const colSerie = COLUMNAS[zona % 3];
  const col = truncar(este, 100000);              // 1..8
  if (col < 1 || col > 8) throw new Error(`Este ${este} fuera de la zona`);
  const fila = truncar(norte, 100000) % 20;
  const desplaz = zona % 2 === 0 ? 5 : 0;
  const letras = colSerie[col - 1] + FILAS[(fila + desplaz) % 20];

  const paso = 10 ** (5 - precision);
  const e = truncar(este - col * 100000, paso);
  const n = truncar(norte - truncar(norte, 100000) * 100000, paso);
  const ee = precision ? String(e).padStart(precision, '0') : '';
  const nn = precision ? String(n).padStart(precision, '0') : '';
  const z = String(zona).padStart(2, '0');
  return opc.separado
    ? [`${z}${banda}`, letras, ee, nn].filter(Boolean).join(' ')
    : `${z}${banda}${letras}${ee}${nn}`;
}

/**
 * Lee una referencia MGRS escrita por el usuario (con o sin espacios,
 * mayúsculas o minúsculas, zona con o sin cero inicial).
 * @returns {{zona, banda, letras, precision, e, n}}
 */
export function analizarMgrs(texto) {
  const t = String(texto).toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/);
  if (!m) throw new Error(`Referencia MGRS no válida: «${texto}»`);
  const zona = Number(m[1]);
  if (zona < 1 || zona > 60) throw new Error(`Zona no válida en «${texto}»`);
  const digitos = m[5];
  if (digitos.length % 2 !== 0 || digitos.length > 10) {
    throw new Error(`«${texto}»: debe haber el mismo número de cifras para Este y Norte (máx. 5 + 5)`);
  }
  const precision = digitos.length / 2;
  return {
    zona, banda: m[2], letras: m[3] + m[4], precision,
    e: precision ? Number(digitos.slice(0, precision)) : 0,
    n: precision ? Number(digitos.slice(precision)) : 0,
  };
}

/**
 * MGRS → UTM. Por defecto devuelve el CENTRO del cuadrado designado
 * (lo correcto para "¿dónde está esto?"). Con {esquina:true}, la esquina SW.
 * @returns {{zona, hemisferio, este, norte, precision, lado}}
 *          lado = tamaño del cuadrado en metros (incertidumbre de la referencia)
 */
export function mgrsAUtm(texto, opc = {}) {
  const r = analizarMgrs(texto);
  const colSerie = COLUMNAS[r.zona % 3];
  const col = colSerie.indexOf(r.letras[0]) + 1;
  if (col < 1) throw new Error(`La letra de columna «${r.letras[0]}» no existe en la zona ${r.zona}`);
  const desplaz = r.zona % 2 === 0 ? 5 : 0;
  const filaIdx = (FILAS.indexOf(r.letras[1]) - desplaz + 20) % 20;

  const lado = 10 ** (5 - r.precision);
  const centro = opc.esquina ? 0 : lado / 2;
  const este = col * 100000 + r.e * lado + centro;
  const norteEnCiclo = filaIdx * 100000 + r.n * lado + centro;

  // Resolver el ciclo de 2 000 km con la banda de latitud.
  const { sur, norte: nor } = limitesBanda(r.banda);
  const hemisferio = r.banda >= 'N' ? 'N' : 'S';
  const latMedia = (sur + nor) / 2;
  let mejor = null;
  for (let k = 0; k <= 5; k++) {
    const norte = norteEnCiclo + k * 2000000;
    if (norte > 10000000) break;
    const g = utmAGeo(r.zona, hemisferio, este, norte);
    // Margen de ±1° alrededor de la banda: los cuadrados de 100 km pueden
    // asomar un poco por encima o por debajo de los límites de la banda.
    if (g.lat >= sur - 1 && g.lat <= nor + 1) {
      const d = Math.abs(g.lat - latMedia);
      if (!mejor || d < mejor.d) mejor = { d, norte };
    }
  }
  if (!mejor) throw new Error(`«${texto}»: el cuadrado ${r.letras} no cae en la banda ${r.banda}`);
  return { zona: r.zona, hemisferio, este, norte: mejor.norte, precision: r.precision, lado };
}

/** MGRS → geográficas (centro del cuadrado por defecto). */
export function mgrsAGeo(texto, opc = {}) {
  const u = mgrsAUtm(texto, opc);
  const g = utmAGeo(u.zona, u.hemisferio, u.este, u.norte);
  return { lat: g.lat, lon: g.lon, precision: u.precision, lado: u.lado };
}
