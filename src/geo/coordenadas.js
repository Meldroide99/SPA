// Posiciones: mostrar y leer en el formato que elija el usuario.
//
// El dato guardado es SIEMPRE {lat, lon} WGS84 en grados con doble
// precisión. Estas funciones solo traducen para la pantalla o para leer lo
// que el usuario escribe.

import { geoAMgrs, mgrsAGeo } from './mgrs.js';
import { geoAUtm, utmAGeo } from './utm.js';
import { formatearLatitud, formatearLongitud, leerAngulo } from './angulos.js';

/**
 * @param {{lat:number, lon:number}} p
 * @param {object} pref
 * @param {'mgrs'|'utm'|'gd'|'gms'} [pref.formato='mgrs']
 * @param {number} [pref.precisionMgrs=5]  0..5 (5 = 1 m)
 * @param {boolean} [pref.separado=true]   MGRS con espacios: 30T VK 40290 74257
 */
export function formatearPosicion(p, pref = {}) {
  const formato = pref.formato ?? 'mgrs';
  switch (formato) {
    case 'mgrs':
      return geoAMgrs(p.lat, p.lon, pref.precisionMgrs ?? 5, { separado: pref.separado ?? true });
    case 'utm': {
      // UTM se TRUNCA al metro, igual que MGRS, para que ambos digan lo mismo.
      const u = geoAUtm(p.lat, p.lon);
      return `${u.zona}${u.hemisferio} ${Math.floor(u.este)} E ${Math.floor(u.norte)} N`;
    }
    case 'gd':
      return `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
    case 'gms':
      return `${formatearLatitud(p.lat, 1)} ${formatearLongitud(p.lon, 1)}`;
    default:
      throw new Error(`Formato de posición desconocido: ${formato}`);
  }
}

/**
 * Lee una posición escrita en cualquiera de los formatos admitidos y la
 * devuelve como {lat, lon, formato, lado}. `lado` es la incertidumbre de la
 * referencia en metros (p. ej. 100 si era un MGRS de 100 m), o 0 si exacta.
 *
 * Admite:
 *   MGRS:  30TVK4029074257 · 30T VK 402 742 · 30tvk4074
 *   UTM:   30N 440290 4474257 · 30T 440290 4474257 · 30 440290E 4474257N
 *   GD:    40.4168, -3.7038 · 40.4168 -3.7038
 *   GMS:   40°24'59.3"N 3°42'13.7"W · 40 24 59.3 N, 3 42 13.7 O
 */
export function leerPosicion(texto) {
  const t = String(texto).trim();
  if (!t) throw new Error('Posición vacía');
  const compacto = t.toUpperCase().replace(/\s+/g, '');

  // MGRS
  if (/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z][A-HJ-NP-V]\d*$/.test(compacto)) {
    const g = mgrsAGeo(compacto);
    return { lat: g.lat, lon: g.lon, formato: 'mgrs', lado: g.lado };
  }

  // UTM: zona + (N|S|banda) opcional + E + N
  const mu = t.toUpperCase().match(/^(\d{1,2})\s*([A-Z])?\s+(\d+(?:[.,]\d+)?)\s*E?\s*[ ,;]\s*(\d+(?:[.,]\d+)?)\s*N?$/);
  if (mu) {
    const zona = Number(mu[1]);
    // La letra se interpreta como BANDA de latitud: C–M → sur, N–X → norte.
    // Ojo: "30S" podría leerse como "hemisferio Sur", pero en España la
    // banda S (32°–40° N, Andalucía, Murcia, Valencia sur) es muy habitual,
    // así que aquí S = banda S = hemisferio NORTE. Sin letra: norte.
    const hem = mu[2] && mu[2] < 'N' ? 'S' : 'N';
    const g = utmAGeo(zona, hem, Number(mu[3].replace(',', '.')), Number(mu[4].replace(',', '.')));
    return { lat: g.lat, lon: g.lon, formato: 'utm', lado: 0 };
  }

  // Geográficas: separar latitud y longitud
  let partes = null;
  const conHem = t.toUpperCase().match(/^(.*?[NS])\s*[, ;]?\s*(.*[EWO])$/);
  if (conHem) partes = [conHem[1], conHem[2]];
  else if (t.includes(',') && t.split(',').length === 2) partes = t.split(',');
  else if (t.includes(';')) partes = t.split(';');
  else {
    const p = t.split(/\s+/);
    if (p.length === 2) partes = p;
  }
  if (!partes) throw new Error(`No reconozco el formato de «${texto}»`);
  const lat = leerAngulo(partes[0]);
  const lon = leerAngulo(partes[1]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`Coordenadas fuera de rango en «${texto}»`);
  return { lat, lon, formato: /[°º'"NSEWO]/i.test(t) ? 'gms' : 'gd', lado: 0 };
}
