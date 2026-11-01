// Rejillas oficiales del IGN (CC BY 4.0):
//   - ED50 → ETRS89: SPED2ETV2 (NTv2; EPSG:15932). Península y Baleares.
//   - Geoide EGM08-REDNAP: altitud ortométrica = altura elipsoidal − N.
//
// Interpolación bilineal entre nodos, como hacen NTv2 y PROJ. Fuera de la
// zona cubierta las funciones devuelven null (no se inventa nada).
// Hay que llamar una vez a `prepararRejillas()` (descomprime las rejillas).

import { abrirTiff, lectorBlob } from '../datos/tiff.js';
import { SPED2ETV2, EGM08_REDNAP } from '../vendor/ign-rejillas.js';

let ed50 = null;   // [{oeste, norte, paso:[dx,dy], ancho, alto, dlat, dlon}]
let geoide = null; // {oeste, norte, dx, dy, ancho, alto, n}
let preparando = null;

const desdeBase64 = (b64) => {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u]);
};

async function leerRejilla({ imagen, geo }) {
  const b = await imagen.leerBloque(0, 0);
  let datos = b.datos;
  if (imagen.bloquesX * imagen.bloquesY > 1) {
    // Rejilla en teselas: montar entera
    const n = imagen.ancho * imagen.alto * imagen.muestras;
    datos = new Float32Array(n);
    for (let by = 0; by < imagen.bloquesY; by++) for (let bx = 0; bx < imagen.bloquesX; bx++) {
      const t = await imagen.leerBloque(bx, by);
      for (let y = 0; y < t.alto; y++) {
        const fy = by * imagen.bloqueAlto + y; if (fy >= imagen.alto) break;
        for (let x = 0; x < t.ancho; x++) {
          const fx = bx * imagen.bloqueAncho + x; if (fx >= imagen.ancho) break;
          for (let s = 0; s < imagen.muestras; s++) datos[(fy * imagen.ancho + fx) * imagen.muestras + s] = t.datos[(y * t.ancho + x) * imagen.muestras + s];
        }
      }
    }
  }
  const [a, , c, , e, f] = geo.afin;
  // Nodos en el centro de cada celda (el afín está referido a la esquina)
  return { oeste: c + a / 2, norte: f + e / 2, dx: a, dy: -e, ancho: imagen.ancho, alto: imagen.alto, muestras: imagen.muestras, datos };
}

/** Descomprime las rejillas (una sola vez). */
export function prepararRejillas() {
  preparando ??= (async () => {
    const t1 = await abrirTiff(lectorBlob(desdeBase64(SPED2ETV2)));
    ed50 = [];
    for (const s of t1.subimagenes) ed50.push(await leerRejilla(s));
    const t2 = await abrirTiff(lectorBlob(desdeBase64(EGM08_REDNAP)));
    geoide = await leerRejilla(t2.subimagenes[0]);
  })();
  return preparando;
}
export const rejillasListas = () => Boolean(ed50 && geoide);

/** Interpolación bilineal de la muestra `s` en (lat, lon). null si fuera. */
function interpolar(r, lat, lon, s) {
  const fx = (lon - r.oeste) / r.dx, fy = (r.norte - lat) / r.dy;
  if (fx < 0 || fy < 0 || fx > r.ancho - 1 || fy > r.alto - 1) return null;
  const x0 = Math.min(Math.floor(fx), r.ancho - 2), y0 = Math.min(Math.floor(fy), r.alto - 2);
  const tx = fx - x0, ty = fy - y0;
  const v = (x, y) => r.datos[(y * r.ancho + x) * r.muestras + s];
  return (1 - ty) * ((1 - tx) * v(x0, y0) + tx * v(x0 + 1, y0)) + ty * ((1 - tx) * v(x0, y0 + 1) + tx * v(x0 + 1, y0 + 1));
}

function exigir() { if (!rejillasListas()) throw new Error('Rejillas del IGN sin preparar: llama antes a prepararRejillas()'); }

/** Desplazamiento (grados) a sumar a ED50 para obtener ETRS89 en (lat, lon) ED50. */
function desplazamiento(lat, lon) {
  for (const r of ed50) { // la primera subrejilla que contiene el punto (Baleares va primero)
    const dlat = interpolar(r, lat, lon, 0);
    if (dlat === null) continue;
    return { dlat: dlat / 3600, dlon: interpolar(r, lat, lon, 1) / 3600 };
  }
  return null;
}

/** ED50 → ETRS89 (≈ WGS84). Geográficas en grados. null fuera de la rejilla. */
export function ed50AEtrs89(lat, lon) {
  exigir();
  const d = desplazamiento(lat, lon);
  return d ? { lat: lat + d.dlat, lon: lon + d.dlon } : null;
}

/** ETRS89 → ED50 (inversa por iteración; converge al nanogrado). */
export function etrs89AEd50(lat, lon) {
  exigir();
  let la = lat, lo = lon;
  for (let i = 0; i < 10; i++) {
    const d = desplazamiento(la, lo); if (!d) return null;
    const nla = lat - d.dlat, nlo = lon - d.dlon;
    if (Math.abs(nla - la) < 1e-12 && Math.abs(nlo - lo) < 1e-12) { la = nla; lo = nlo; break; }
    la = nla; lo = nlo;
  }
  return { lat: la, lon: lo };
}

/** Ondulación del geoide EGM08-REDNAP (m). null fuera de la Península y Baleares. */
export function ondulacionGeoide(lat, lon) {
  exigir();
  return interpolar(geoide, lat, lon, 0);
}

/** Altura elipsoidal (HAE, la de GPS y ATAK) → altitud sobre el nivel del mar. */
export function haeAAltitud(lat, lon, hae) {
  const n = ondulacionGeoide(lat, lon);
  return n === null ? null : hae - n;
}
