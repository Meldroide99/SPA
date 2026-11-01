// Ángulos: conversiones y formatos de presentación.
//
// Regla del proyecto: internamente SIEMPRE grados sexagesimales decimales en
// doble precisión. Milésimas, grados-minutos-segundos, etc. son solo formas
// de MOSTRAR o de LEER lo que escribe el usuario. Nunca se guarda un valor
// ya redondeado.

import { MILESIMAS_VUELTA } from './constantes.js';

const GRAD = Math.PI / 180;

export const aRadianes = (g) => g * GRAD;
export const aGrados = (r) => r / GRAD;

/** Grados → milésimas OTAN (6400). */
export const gradosAMilesimas = (g) => g * (MILESIMAS_VUELTA / 360);
/** Milésimas OTAN (6400) → grados. */
export const milesimasAGrados = (m) => m * (360 / MILESIMAS_VUELTA);

/** Normaliza un rumbo a [0, 360). */
export function normalizarRumbo(g) {
  let r = g % 360;
  if (r < 0) r += 360;
  // -0 y 360 por redondeo → 0
  return r === 360 || Object.is(r, -0) ? 0 : r;
}

/** Normaliza una longitud a [-180, 180). */
export function normalizarLongitud(g) {
  let r = ((g + 180) % 360 + 360) % 360 - 180;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Formatea un RUMBO (azimut) según la preferencia del usuario.
 * @param {number} g  rumbo en grados (cualquier valor; se normaliza)
 * @param {'grados'|'gms'|'milesimas'} unidad
 * @param {number} [decimales]  solo para 'grados' y 'milesimas'
 */
export function formatearRumbo(g, unidad = 'grados', decimales) {
  const r = normalizarRumbo(g);
  if (unidad === 'milesimas') {
    const d = decimales ?? 0;
    // Se redondea SOLO al mostrar. 6400 se muestra como 0.
    let m = Number(gradosAMilesimas(r).toFixed(d));
    if (m >= MILESIMAS_VUELTA) m = 0;
    return `${m.toFixed(d).padStart(4 + (d ? d + 1 : 0), '0')} mils`;
  }
  if (unidad === 'gms') return formatearGMS(r, { segDecimales: decimales ?? 0 });
  const d = decimales ?? 2;
  let v = Number(r.toFixed(d));
  if (v >= 360) v = 0;
  return `${v.toFixed(d)}°`;
}

/**
 * Descompone grados decimales en grados, minutos y segundos, redondeando
 * los segundos a `segDecimales` y propagando el acarreo (evita 59.9999→60").
 */
export function aGMS(g, segDecimales = 0) {
  const signo = g < 0 || Object.is(g, -0) ? -1 : 1;
  const escala = 10 ** segDecimales;
  // Todo en unidades enteras de la última cifra de segundo para no arrastrar error.
  let total = Math.round(Math.abs(g) * 3600 * escala);
  const s = (total % (60 * escala)) / escala;
  total = Math.floor(total / (60 * escala));
  const m = total % 60;
  const gr = Math.floor(total / 60);
  return { signo, g: gr, m, s };
}

/** "40°24'59.3\"" (sin hemisferio). */
export function formatearGMS(g, { segDecimales = 0 } = {}) {
  const { signo, g: gr, m, s } = aGMS(g, segDecimales);
  const ss = s.toFixed(segDecimales).padStart(segDecimales ? 3 + segDecimales : 2, '0');
  return `${signo < 0 ? '-' : ''}${gr}°${String(m).padStart(2, '0')}'${ss}"`;
}

/** Latitud con hemisferio: 40°24'59"N */
export function formatearLatitud(lat, segDecimales = 1) {
  const t = formatearGMS(Math.abs(lat), { segDecimales });
  return `${t}${lat < 0 ? 'S' : 'N'}`;
}

/** Longitud con hemisferio: 3°42'13"W */
export function formatearLongitud(lon, segDecimales = 1) {
  const t = formatearGMS(Math.abs(lon), { segDecimales });
  return `${t}${lon < 0 ? 'W' : 'E'}`;
}

/**
 * Lee un ángulo escrito por el usuario. Acepta:
 *   40.4168 · -3.7038 · 40°24'59.3"N · 3 42 13.7 W · 40º 24,99' N · 3°42'13.7"O
 * Devuelve grados decimales o lanza un Error con mensaje en castellano.
 */
export function leerAngulo(texto) {
  if (typeof texto === 'number') return texto;
  let t = String(texto).trim().toUpperCase().replace(/,/g, '.');
  if (!t) throw new Error('Ángulo vacío');
  let signo = 1;
  const hem = t.match(/[NSEWO]$/) || t.match(/^[NSEWO]/);
  if (hem) {
    if ('SWO'.includes(hem[0])) signo = -1; // O = Oeste
    t = t.replace(/^[NSEWO]|[NSEWO]$/, '').trim();
  }
  if (t.startsWith('-')) { signo *= -1; t = t.slice(1); }
  else if (t.startsWith('+')) t = t.slice(1);
  const partes = t.split(/[°º˚'’′"”″\s]+/).filter(Boolean).map(Number);
  if (!partes.length || partes.length > 3 || partes.some((p) => !Number.isFinite(p))) {
    throw new Error(`No entiendo el ángulo «${texto}»`);
  }
  const [g, m = 0, s = 0] = partes;
  if (m >= 60 || s >= 60 || m < 0 || s < 0) throw new Error(`Minutos o segundos fuera de rango en «${texto}»`);
  return signo * (g + m / 60 + s / 3600);
}
