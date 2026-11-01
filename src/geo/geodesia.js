// Distancias, rumbos y áreas sobre el elipsoide WGS84.
//
// Se usa la librería de Karney (GeographicLib, licencia MIT), que resuelve
// el problema geodésico con precisión de nanómetros a cualquier distancia.
// Aquí solo se envuelve con nombres en castellano y se añaden las medidas
// "sobre cuadrícula" (las que se obtienen con regla y transportador sobre
// un mapa UTM).
//
// Puntos: objetos {lat, lon} en grados WGS84.

import { Geodesic, PolygonArea } from '../vendor/geographiclib-geodesic.js';
import { geoAUtm, utmAGeo } from './utm.js';
import { normalizarRumbo } from './angulos.js';

const G = Geodesic.WGS84;

/**
 * Medida completa entre dos puntos.
 * @param {{lat:number, lon:number}} p1  origen
 * @param {{lat:number, lon:number}} p2  destino
 * @param {{zona?:number}} [opc] zona UTM para las medidas de cuadrícula
 *        (por defecto, la del origen; las dos medidas se hacen en la misma zona)
 * @returns {{
 *   distancia:number,          // m, sobre el elipsoide (la "real" a nivel del mar)
 *   rumbo:number,              // grados, geográfico, en el origen
 *   rumboLlegada:number,       // grados, geográfico, con el que se llega al destino
 *   rumboInverso:number,       // grados, geográfico, desde el destino hacia el origen
 *   rumboCuadricula:number,    // grados, respecto al norte de cuadrícula, en el origen
 *   distanciaCuadricula:number,// m, sobre el plano UTM (lo que mide una regla en el mapa)
 *   rumboCuadriculaPlano:number,// grados, ángulo de la recta en el plano UTM
 *   convergencia:number,       // grados, en el origen
 *   zona:number
 * }}
 */
export function medir(p1, p2, opc = {}) {
  const r = G.Inverse(p1.lat, p1.lon, p2.lat, p2.lon);
  const u1 = geoAUtm(p1.lat, p1.lon, { zona: opc.zona });
  const u2 = geoAUtm(p2.lat, p2.lon, { zona: u1.zona });
  const dE = u2.este - u1.este;
  const dN = (u2.norte - (u2.hemisferio !== u1.hemisferio ? (u2.hemisferio === 'S' ? 10000000 : -10000000) : 0)) - u1.norte;
  return {
    distancia: r.s12,
    rumbo: normalizarRumbo(r.azi1),
    rumboLlegada: normalizarRumbo(r.azi2),
    rumboInverso: normalizarRumbo(r.azi2 + 180),
    rumboCuadricula: normalizarRumbo(r.azi1 - u1.convergencia),
    distanciaCuadricula: Math.hypot(dE, dN),
    rumboCuadriculaPlano: normalizarRumbo((Math.atan2(dE, dN) * 180) / Math.PI),
    convergencia: u1.convergencia,
    zona: u1.zona,
  };
}

/**
 * Punto de llegada partiendo de `p` con un rumbo y una distancia.
 * @param {{lat,lon}} p
 * @param {number} rumbo grados
 * @param {number} distancia m (sobre el elipsoide)
 * @param {{norte?:'geografico'|'cuadricula'}} [opc]
 *        Si el rumbo es de cuadrícula, se corrige con la convergencia en p.
 */
export function destino(p, rumbo, distancia, opc = {}) {
  let azi = rumbo;
  if (opc.norte === 'cuadricula') azi = rumbo + geoAUtm(p.lat, p.lon).convergencia;
  const r = G.Direct(p.lat, p.lon, azi, distancia);
  return { lat: r.lat2, lon: r.lon2, rumboLlegada: normalizarRumbo(r.azi2) };
}

/**
 * Destino medido "sobre el mapa": desplazamiento en el plano UTM
 * (rumbo de cuadrícula y distancia de cuadrícula). Es lo que hace quien
 * traza con regla y transportador sobre una carta UTM.
 */
export function destinoCuadricula(p, rumboCuadricula, distanciaCuadricula, opc = {}) {
  const u = geoAUtm(p.lat, p.lon, { zona: opc.zona });
  const a = (rumboCuadricula * Math.PI) / 180;
  const g = utmAGeo(u.zona, u.hemisferio,
    u.este + distanciaCuadricula * Math.sin(a),
    u.norte + distanciaCuadricula * Math.cos(a));
  return { lat: g.lat, lon: g.lon };
}

/**
 * Área y perímetro de un polígono (vértices en orden, sin repetir el primero).
 * Los lados son geodésicas. El área se da siempre positiva.
 * @returns {{area:number, perimetro:number}} m² y m
 */
export function areaPoligono(vertices) {
  if (vertices.length < 3) return { area: 0, perimetro: 0 };
  const pol = new PolygonArea.PolygonArea(G, false);
  for (const v of vertices) pol.AddPoint(v.lat, v.lon);
  const r = pol.Compute(false, true);
  return { area: Math.abs(r.area), perimetro: r.perimeter };
}

/** Longitud de una polilínea (suma de geodésicas), en m. */
export function longitudLinea(vertices) {
  let s = 0;
  for (let i = 1; i < vertices.length; i++) {
    s += G.Inverse(vertices[i - 1].lat, vertices[i - 1].lon, vertices[i].lat, vertices[i].lon).s12;
  }
  return s;
}

/**
 * Puntos intermedios sobre la geodésica entre p1 y p2 (para dibujar líneas
 * largas: en distancias tácticas la diferencia con la recta es mínima,
 * pero así queda exacto a cualquier escala).
 */
export function puntosGeodesica(p1, p2, n = 32) {
  const l = G.InverseLine(p1.lat, p1.lon, p2.lat, p2.lon);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const r = l.Position((l.s13 * i) / n);
    pts.push({ lat: r.lat2, lon: r.lon2 });
  }
  return pts;
}
