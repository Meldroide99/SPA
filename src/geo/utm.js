// Proyección UTM (Transversa de Mercator) con las series de Krüger de 6.º orden.
//
// Método: C. F. F. Karney, "Transverse Mercator with an accuracy of a few
// nanometers", J. Geodesy 85(8), 475-485 (2011). Es el mismo método que usa
// GeographicLib. Dentro de una zona UTM el error del método es del orden de
// nanómetros: cualquier diferencia que veamos viene de otra parte.
//
// Convenios:
//   - lat, lon en grados (WGS84). Este (E) y Norte (N) en metros.
//   - convergencia (gamma): ángulo del norte de cuadrícula medido desde el
//     norte geográfico, en sentido horario (grados). Rumbo de cuadrícula =
//     rumbo geográfico - gamma.
//   - escala (k): factor de escala puntual.

import { WGS84, UTM } from './constantes.js';

const GRAD = Math.PI / 180;

function coeficientes(elipsoide) {
  const { a, f } = elipsoide;
  const e = Math.sqrt(f * (2 - f));
  const n = f / (2 - f);
  const n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
  // Radio rectificante: A = a/(1+n) · (1 + n²/4 + n⁴/64 + n⁶/256)
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
  // α: directa (geográficas → cuadrícula). Índice 1..6.
  const alfa = [0,
    1 / 2 * n - 2 / 3 * n2 + 5 / 16 * n3 + 41 / 180 * n4 - 127 / 288 * n5 + 7891 / 37800 * n6,
    13 / 48 * n2 - 3 / 5 * n3 + 557 / 1440 * n4 + 281 / 630 * n5 - 1983433 / 1935360 * n6,
    61 / 240 * n3 - 103 / 140 * n4 + 15061 / 26880 * n5 + 167603 / 181440 * n6,
    49561 / 161280 * n4 - 179 / 168 * n5 + 6601661 / 7257600 * n6,
    34729 / 80640 * n5 - 3418889 / 1995840 * n6,
    212378941 / 319334400 * n6,
  ];
  // β: inversa (cuadrícula → geográficas).
  const beta = [0,
    1 / 2 * n - 2 / 3 * n2 + 37 / 96 * n3 - 1 / 360 * n4 - 81 / 512 * n5 + 96199 / 604800 * n6,
    1 / 48 * n2 + 1 / 15 * n3 - 437 / 1440 * n4 + 46 / 105 * n5 - 1118711 / 3870720 * n6,
    17 / 480 * n3 - 37 / 840 * n4 - 209 / 4480 * n5 + 5569 / 90720 * n6,
    4397 / 161280 * n4 - 11 / 504 * n5 - 830251 / 7257600 * n6,
    4583 / 161280 * n5 - 108847 / 3991680 * n6,
    20648693 / 638668800 * n6,
  ];
  return { a, e, e2: e * e, A, alfa, beta };
}

const C = coeficientes(WGS84);

// e·atanh(e·x), con x = sen φ (función auxiliar de la latitud conforme)
const eatanhe = (x) => C.e * Math.atanh(C.e * x);

/** Meridiano central de una zona UTM (grados). */
export const meridianoCentral = (zona) => (zona - 1) * 6 - 180 + 3;

/**
 * Zona UTM estándar para un punto, con las excepciones de Noruega y Svalbard.
 * España: 28 (Canarias), 29, 30 y 31.
 */
export function zonaUTM(lat, lon) {
  let lonN = ((lon + 180) % 360 + 360) % 360 - 180; // [-180, 180)
  let zona = Math.floor((lonN + 180) / 6) + 1;
  if (zona > 60) zona = 60;
  if (lat >= 56 && lat < 64 && lonN >= 3 && lonN < 12) zona = 32; // Noruega
  if (lat >= 72 && lat < 84 && lonN >= 0 && lonN < 42) {          // Svalbard
    zona = lonN < 9 ? 31 : lonN < 21 ? 33 : lonN < 33 ? 35 : 37;
  }
  return zona;
}

/**
 * Geográficas → UTM.
 * @param {number} lat grados
 * @param {number} lon grados
 * @param {object} [opc]
 * @param {number} [opc.zona] forzar zona (p. ej. para trabajar un plan entero en 30)
 * @returns {{zona:number, hemisferio:'N'|'S', este:number, norte:number,
 *            convergencia:number, escala:number}}
 */
export function geoAUtm(lat, lon, opc = {}) {
  if (!(lat >= UTM.latMin && lat <= UTM.latMax)) {
    throw new Error(`Latitud ${lat} fuera del ámbito UTM (−80° a 84°)`);
  }
  const zona = opc.zona ?? zonaUTM(lat, lon);
  if (!(zona >= 1 && zona <= 60)) throw new Error(`Zona UTM no válida: ${zona}`);
  let dlon = lon - meridianoCentral(zona);
  dlon = ((dlon + 180) % 360 + 360) % 360 - 180;

  const phi = lat * GRAD;
  const lam = dlon * GRAD;
  const cosLam = Math.cos(lam), sinLam = Math.sin(lam), tanLam = Math.tan(lam);

  // Latitud conforme (en forma de tangente) — Karney (2011) ec. 7-9
  const tau = Math.tan(phi);
  const sigma = Math.sinh(eatanhe(tau / Math.hypot(1, tau)));
  const taup = tau * Math.hypot(1, sigma) - sigma * Math.hypot(1, tau);

  const xip = Math.atan2(taup, cosLam);
  const etap = Math.asinh(sinLam / Math.hypot(taup, cosLam));

  let xi = xip, eta = etap;
  let pp = 1, qp = 0; // para convergencia y escala
  for (let j = 1; j <= 6; j++) {
    const s = Math.sin(2 * j * xip), c = Math.cos(2 * j * xip);
    const sh = Math.sinh(2 * j * etap), ch = Math.cosh(2 * j * etap);
    xi += C.alfa[j] * s * ch;
    eta += C.alfa[j] * c * sh;
    pp += 2 * j * C.alfa[j] * c * ch;
    qp += 2 * j * C.alfa[j] * s * sh;
  }

  let este = UTM.k0 * C.A * eta;
  let norte = UTM.k0 * C.A * xi;

  // Convergencia γ = γ' + γ''
  const gammap = Math.atan((taup / Math.hypot(1, taup)) * tanLam);
  const gammapp = Math.atan2(qp, pp);
  const gamma = (gammap + gammapp) / GRAD;

  // Escala k = k0 · k' · k''
  const sinPhi = Math.sin(phi);
  const kp = (Math.sqrt(1 - C.e2 * sinPhi * sinPhi) * Math.hypot(1, tau)) / Math.hypot(taup, cosLam);
  const kpp = (C.A / C.a) * Math.hypot(pp, qp);
  const escala = UTM.k0 * kp * kpp;

  este += UTM.falsoEste;
  const hemisferio = lat < 0 ? 'S' : 'N';
  if (hemisferio === 'S') norte += UTM.falsoNorteSur;

  return { zona, hemisferio, este, norte, convergencia: gamma, escala };
}

/**
 * UTM → geográficas.
 * @returns {{lat:number, lon:number, convergencia:number, escala:number}}
 */
export function utmAGeo(zona, hemisferio, este, norte) {
  if (!(zona >= 1 && zona <= 60)) throw new Error(`Zona UTM no válida: ${zona}`);
  const hem = String(hemisferio).toUpperCase();
  if (hem !== 'N' && hem !== 'S') throw new Error(`Hemisferio no válido: ${hemisferio}`);
  const x = este - UTM.falsoEste;
  const y = hem === 'S' ? norte - UTM.falsoNorteSur : norte;

  const eta = x / (UTM.k0 * C.A);
  const xi = y / (UTM.k0 * C.A);

  let xip = xi, etap = eta;
  let p = 1, q = 0;
  for (let j = 1; j <= 6; j++) {
    const s = Math.sin(2 * j * xi), c = Math.cos(2 * j * xi);
    const sh = Math.sinh(2 * j * eta), ch = Math.cosh(2 * j * eta);
    xip -= C.beta[j] * s * ch;
    etap -= C.beta[j] * c * sh;
    p -= 2 * j * C.beta[j] * c * ch;
    q -= 2 * j * C.beta[j] * s * sh;
  }

  const sinhEtap = Math.sinh(etap);
  const sinXip = Math.sin(xip), cosXip = Math.cos(xip);
  const taup = sinXip / Math.hypot(sinhEtap, cosXip);

  // Newton para pasar de latitud conforme a geográfica (Karney 2011, ec. 19-21)
  let tau = taup;
  for (let i = 0; i < 10; i++) {
    const sigma = Math.sinh(eatanhe(tau / Math.hypot(1, tau)));
    const taui = tau * Math.hypot(1, sigma) - sigma * Math.hypot(1, tau);
    const dtau = ((taup - taui) / Math.hypot(1, taui)) *
      ((1 + (1 - C.e2) * tau * tau) / ((1 - C.e2) * Math.hypot(1, tau)));
    tau += dtau;
    if (Math.abs(dtau) < 1e-14) break;
  }

  const phi = Math.atan(tau);
  const lam = Math.atan2(sinhEtap, cosXip);

  const gammap = Math.atan(Math.tan(xip) * Math.tanh(etap));
  const gammapp = Math.atan2(q, p);
  const gamma = (gammap + gammapp) / GRAD;

  const sinPhi = Math.sin(phi);
  const kp = Math.sqrt(1 - C.e2 * sinPhi * sinPhi) * Math.hypot(1, tau) * Math.hypot(sinhEtap, cosXip);
  const kpp = (C.A / C.a) / Math.hypot(p, q);
  const escala = UTM.k0 * kp * kpp;

  let lon = meridianoCentral(zona) + lam / GRAD;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return { lat: phi / GRAD, lon, convergencia: gamma, escala };
}
