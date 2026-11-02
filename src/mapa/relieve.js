// Relieve propio: sombreado calculado en el navegador con el Modelo Digital
// del Terreno del IGN (WCS de la IDEE), con más detalle que el sombreado
// publicado por el IGN (que en zoom alto viene de una malla de ~25 m).
//
//   zoom ≥ 16  MDT05 a su resolución original (malla de 5 m)
//   zoom 14–15 MDT05 reducido (≈ 200 puntos por tesela)
//   zoom 11–13 MDT25 · zoom 8–10 MDT200 · zoom < 8 MDT1000
//
// Cada tesela: una petición (ASCII Grid, con decimales) con margen, se calcula
// el sombreado en la malla (método de Horn, luz del NO a 45°) y se interpola
// bilinealmente a los 256 × 256 píxeles. Modos:
//   'fondo'     gris opaco
//   'sombreado' transparente: oscurece las laderas en sombra y aclara poco
//               las iluminadas (para ponerlo encima de cualquier fondo)

import { leerAsc } from '../datos/alturas.js';

const SERVICIO = 'https://servicios.idee.es/wcs-inspire/mdt';
const R = 6378137 * Math.PI / 180;
const lonX = (X, z) => (X / 2 ** z) * 360 - 180;
const latY = (Y, z) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * Y) / 2 ** z));

/** Cobertura y tamaño de petición según el zoom. */
export function planRelieve(z) {
  if (z >= 16) return { cobertura: 'Elevacion4258_5', n: null, exageracion: 1 };
  if (z === 15) return { cobertura: 'Elevacion4258_5', n: 200, exageracion: 1 };
  if (z === 14) return { cobertura: 'Elevacion4258_5', n: 192, exageracion: 1.2 };
  if (z >= 11) return { cobertura: 'Elevacion4258_25', n: 160, exageracion: 1.5 };
  if (z >= 8) return { cobertura: 'Elevacion4258_200', n: 128, exageracion: 2.5 };
  return { cobertura: 'Elevacion4258_1000', n: 96, exageracion: 4 };
}

export function urlRelieve(z, x, y) {
  const p = planRelieve(z);
  const o = lonX(x, z), e = lonX(x + 1, z), n = latY(y, z), s = latY(y + 1, z);
  const mx = (e - o) * 0.04, my = (n - s) * 0.04; // margen para el borde
  const tam = p.n ? `&SCALESIZE=Long(${Math.round(p.n * 1.08)}),Lat(${Math.round(p.n * 1.08)})` : '';
  return `${SERVICIO}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&CoverageId=${p.cobertura}`
    + `&SUBSET=Lat(${(s - my).toFixed(7)},${(n + my).toFixed(7)})&SUBSET=Long(${(o - mx).toFixed(7)},${(e + mx).toFixed(7)})&FORMAT=application/asc${tam}`;
}

/**
 * Sombreado en cada nodo de la malla (0 = sombra total, 1 = luz de frente).
 * Método de Horn (8 vecinos). Devuelve Float32Array (NaN sin datos).
 */
export function sombrearMalla(m, { azimut = 315, altura = 45, exageracion = 1 } = {}) {
  const { ncols: W, nrows: H, valores: v } = m;
  const latC = m.norte - (H / 2) * m.dy;
  const cx = m.dx * R * Math.cos((latC * Math.PI) / 180), cy = m.dy * R;
  const az = (azimut * Math.PI) / 180, al = (altura * Math.PI) / 180;
  const out = new Float32Array(W * H).fill(NaN);
  const malo = (z) => z === m.nodata || !Number.isFinite(z) || z < -1000;
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const Z = (a, b) => v[(j + b) * W + (i + a)];
      const c = [Z(-1, -1), Z(0, -1), Z(1, -1), Z(-1, 0), Z(1, 0), Z(-1, 1), Z(0, 1), Z(1, 1)];
      if (c.some(malo)) continue;
      const [a, b, cc, d, f, g, h, k] = c;
      // Pendientes hacia el este y hacia el norte (las filas crecen hacia el sur)
      const ze = ((cc + 2 * f + k) - (a + 2 * d + g)) / (8 * cx) * exageracion;
      const zn = -((g + 2 * h + k) - (a + 2 * b + cc)) / (8 * cy) * exageracion;
      // Normal del terreno (−ze, −zn, 1) · dirección del sol (sen A cos h, cos A cos h, sen h)
      const luz = (-ze * Math.sin(az) * Math.cos(al) - zn * Math.cos(az) * Math.cos(al) + Math.sin(al)) / Math.sqrt(1 + ze * ze + zn * zn);
      out[j * W + i] = Math.max(0, luz);
    }
  }
  return out;
}

/** Interpolación bilineal del sombreado en (lat, lon). NaN si no hay datos. */
function muestrear(m, s, lat, lon) {
  const fx = (lon - m.oeste) / m.dx, fy = (m.norte - lat) / m.dy;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  if (x0 < 1 || y0 < 1 || x0 >= m.ncols - 2 || y0 >= m.nrows - 2) return NaN;
  const tx = fx - x0, ty = fy - y0, W = m.ncols;
  const a = s[y0 * W + x0], b = s[y0 * W + x0 + 1], c = s[(y0 + 1) * W + x0], d = s[(y0 + 1) * W + x0 + 1];
  return (1 - ty) * ((1 - tx) * a + tx * b) + ty * ((1 - tx) * c + tx * d);
}

/** Pinta una tesela de relieve en un array RGBA de 256 × 256. */
export function pintarRelieve(m, coords, modo, rgba) {
  const p = planRelieve(coords.z);
  const s = sombrearMalla(m, { exageracion: p.exageracion });
  const plano = Math.sin((45 * Math.PI) / 180); // brillo del terreno llano (sol a 45°)
  for (let j = 0; j < 256; j++) {
    const lat = latY(coords.y + (j + 0.5) / 256, coords.z);
    for (let i = 0; i < 256; i++) {
      const lon = lonX(coords.x + (i + 0.5) / 256, coords.z);
      const h = muestrear(m, s, lat, lon);
      const q = (j * 256 + i) * 4;
      if (Number.isNaN(h)) { rgba[q + 3] = 0; continue; }
      if (modo === 'fondo') {
        // gris con un toque cálido en las luces
        const v = 70 + h * 185;
        rgba[q] = Math.min(255, v + 4); rgba[q + 1] = Math.min(255, v + 2); rgba[q + 2] = v; rgba[q + 3] = 255;
      } else if (h < plano) {
        rgba[q] = 20; rgba[q + 1] = 28; rgba[q + 2] = 40; rgba[q + 3] = Math.min(170, (plano - h) * 330);
      } else {
        rgba[q] = rgba[q + 1] = rgba[q + 2] = 255; rgba[q + 3] = Math.min(90, (h - plano) * 260);
      }
    }
  }
}

/**
 * Capa Leaflet de relieve.
 * @param {'fondo'|'sombreado'} modo
 */
export function capaRelieve(L, modo, { pedir = (u) => fetch(u), atribucion = '', zIndex = 1, opacidad = 1 } = {}) {
  const cache = new Map();
  const Capa = L.GridLayer.extend({
    createTile(c, hecho) {
      const lienzo = document.createElement('canvas');
      lienzo.width = lienzo.height = 256;
      const clave = `${c.z}/${c.x}/${c.y}`;
      let p = cache.get(clave);
      if (!p) {
        p = pedir(urlRelieve(c.z, c.x, c.y)).then((r) => { if (!r.ok) throw new Error(`MDT ${r.status}`); return r.text(); }).then(leerAsc);
        cache.set(clave, p);
        p.catch(() => cache.delete(clave));
        if (cache.size > 160) cache.delete(cache.keys().next().value);
      }
      p.then((m) => {
        const ctx = lienzo.getContext('2d');
        const img = ctx.createImageData(256, 256);
        pintarRelieve(m, c, modo, img.data);
        ctx.putImageData(img, 0, 0);
        hecho(null, lienzo);
      }, (e) => hecho(e, lienzo));
      return lienzo;
    },
  });
  return new Capa({ tileSize: 256, minZoom: 5, maxZoom: 21, maxNativeZoom: 18, attribution: atribucion, zIndex, opacity: opacidad, updateWhenZooming: false });
}
