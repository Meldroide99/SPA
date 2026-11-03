// Geometría de las medidas de coordinación y de los cometidos tácticos
// (APP-6(E) cap. 8 y su apéndice A). El catálogo está en medidas-catalogo.js y
// los iconos puntuales en medidas-glifos.js.
//
// Cada gráfico se construye a partir de sus puntos de anclaje (los que define
// la norma), en un plano local en metros alrededor del primer punto, y se
// devuelve en lat/lon. Los puntos de anclaje son exactos; el dibujo intermedio
// (puntas, arcos, motivos) es solo gráfico. Los motivos repetidos (dientes,
// alambradas, rayados…) se dimensionan en píxeles de pantalla (props.mpp =
// metros por píxel) para que se vean igual a cualquier zoom.

import { MEDIDAS, GRUPOS, medida, puntosNecesarios, tipoElemento } from './medidas-catalogo.js';
import { glifoPunto, glifoZona } from './medidas-glifos.js';

export { MEDIDAS, GRUPOS, medida, puntosNecesarios, tipoElemento, glifoPunto, glifoZona };

const R = 6378137;
/** Plano local (metros, x este / y norte) alrededor de p0. */
export function plano(p0) {
  const k = Math.cos((p0.lat * Math.PI) / 180);
  const a = (p) => [((p.lon - p0.lon) * Math.PI / 180) * R * k, ((p.lat - p0.lat) * Math.PI / 180) * R];
  const g = ([x, y]) => [p0.lat + (y / R) * (180 / Math.PI), p0.lon + (x / (R * k)) * (180 / Math.PI)];
  const gp = (q) => { const [lat, lon] = g(q); return { lat, lon }; };
  return { a, g, gp };
}
const sum = (p, q) => [p[0] + q[0], p[1] + q[1]];
const res = (p, q) => [p[0] - q[0], p[1] - q[1]];
const mul = (p, k) => [p[0] * k, p[1] * k];
const lon = (p) => Math.hypot(p[0], p[1]);
const uni = (p) => { const l = lon(p) || 1; return [p[0] / l, p[1] / l]; };
const perp = (p) => [-p[1], p[0]]; // 90° a la izquierda
const med = (p, q) => mul(sum(p, q), 0.5);
const rot = (p, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const angulo = (v) => (Math.atan2(v[0], v[1]) * 180) / Math.PI; // rumbo de un vector
const angDe = (v) => Math.atan2(v[1], v[0]);
const longitud = (P) => P.slice(1).reduce((t, p, i) => t + lon(res(p, P[i])), 0);

/** Punta de flecha abierta en `tip` llegando desde `dir` (unitario). */
const punta = (tip, dir, t, ang = 0.5) => [sum(tip, mul(rot(dir, Math.PI - ang), t)), tip, sum(tip, mul(rot(dir, Math.PI + ang), t))];
/** Arco (centro, radio, ángulos en radianes). */
function arco(c, r, a0, a1, n = 36) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return pts;
}
const bezier = (p0, c, p1, n = 20) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return sum(sum(mul(p0, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(p1, t * t)); });

export function centroide(P) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) return mul(P.reduce((s, p) => sum(s, p), [0, 0]), 1 / P.length);
  return [cx / (3 * a), cy / (3 * a)];
}
const areaFirmada = (P) => P.reduce((t, p, i) => { const q = P[(i + 1) % P.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/** Recorre una polilínea cada `paso` metros: [{p, t (tangente), n (normal izquierda), d}] */
function muestrear(P, paso, desde = paso / 2) {
  const out = [];
  let acum = 0, sig = desde;
  for (let i = 0; i < P.length - 1; i++) {
    const v = res(P[i + 1], P[i]), l = lon(v); if (!l) continue;
    const t = uni(v);
    while (sig <= acum + l) { const p = sum(P[i], mul(t, sig - acum)); out.push({ p, t, n: perp(t), d: sig }); sig += paso; }
    acum += l;
  }
  return out;
}

/** Corta la recta a→b con un polígono: tramos interiores. */
function recortar(poly, a, b) {
  const v = res(b, a), ts = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], w = res(q, p);
    const den = v[0] * w[1] - v[1] * w[0]; if (Math.abs(den) < 1e-12) continue;
    const ap = res(p, a), t = (ap[0] * w[1] - ap[1] * w[0]) / den, u = (ap[0] * v[1] - ap[1] * v[0]) / den;
    if (u >= 0 && u < 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([sum(a, mul(v, ts[i])), sum(a, mul(v, ts[i + 1]))]);
  return out;
}
/** Rayado de un polígono (líneas paralelas a `ang` cada `sep` metros). */
function rayado(poly, sep, ang) {
  const c = centroide(poly), u = [Math.cos(ang), Math.sin(ang)], n = perp(u);
  const R0 = Math.max(...poly.map((p) => lon(res(p, c)))) + sep;
  const out = [];
  for (let s = -R0; s <= R0; s += sep) {
    const o = sum(c, mul(n, s));
    out.push(...recortar(poly, sum(o, mul(u, -R0)), sum(o, mul(u, R0))));
  }
  return out;
}

/** Flecha ancha a lo largo de un eje (ataques). Devuelve polilíneas. */
function flechaAncha(P, ancho, doble) {
  const h = ancho / 2;
  const izq = [], der = [];
  const n = P.length;
  for (let i = 0; i < n - 1; i++) {
    const dPrev = i > 0 ? uni(res(P[i], P[i - 1])) : null, dNext = uni(res(P[i + 1], P[i]));
    const dir = dPrev ? uni(sum(dPrev, dNext)) : dNext;
    const nn = perp(dir);
    izq.push(sum(P[i], mul(nn, h))); der.push(sum(P[i], mul(nn, -h)));
  }
  const fin = P[n - 1], dFin = uni(res(fin, P[n - 2])), nFin = perp(dFin);
  const largoPunta = Math.min(ancho * 0.9, longitud(P) * 0.3);
  const base = sum(fin, mul(dFin, -largoPunta));
  izq.push(sum(base, mul(nFin, h))); der.push(sum(base, mul(nFin, -h)));
  const alas = [sum(base, mul(nFin, h * 1.6)), fin, sum(base, mul(nFin, -h * 1.6))];
  const cuerpo = { izq, der, alas, base, fin, dFin, nFin, largoPunta, h };
  const lineas = [[...izq, alas[0], alas[1], alas[2], ...der.slice().reverse()]];
  if (doble) {
    const atras = mul(dFin, -largoPunta * 0.32);
    lineas.push([sum(sum(base, atras), mul(nFin, h * 1.25)), sum(fin, atras), sum(sum(base, atras), mul(nFin, -h * 1.25))]);
  }
  return { lineas, cuerpo };
}

/**
 * Gráfico de una medida.
 * @param {object} m definición (MEDIDAS)
 * @param {Array<{lat,lon}>} anclas puntos de anclaje
 * @param {object} props {nombre, ancho (m), escalonMarca, izq, der, mpp (m/px), tam (m, símbolos estáticos), giro (°)}
 * @returns {{lineas, rellenos, textos, rotulos, glifos}}
 *   lineas   [{pts:[[lat,lon]], discontinua?, grosor? (×), color?}]
 *   rellenos [{pts, color?, opacidad?}]
 *   textos   [{pos, texto, rumbo?, tam?, fondo?, negrita?}]      fijos (zonas, cometidos)
 *   rotulos  [{pts, texto, lados?:{izq,der}}]                    flotantes sobre la línea (los coloca el mapa según el zoom)
 *   glifos   [{pos, g? | zona?, giro?}]                           iconos (puntos, minas…)
 */
export function geometria(m, anclas, props = {}) {
  const out = { lineas: [], rellenos: [], textos: [], rotulos: [], glifos: [] };
  if (!m || !anclas.length) return out;
  const { a, g } = plano(anclas[0]);
  let P = anclas.map(a);
  const mpp = props.mpp > 0 ? props.mpp : Math.max(0.5, (longitud(P) || 300) / 160);
  const px = (k) => k * mpp;
  const L = (pts, opc = {}) => { if (pts.length >= 2) out.lineas.push({ pts: pts.map(g), ...opc }); };
  const F = (pts, opc = {}) => out.rellenos.push({ pts: pts.map(g), ...opc });
  const T = (p, texto, opc = {}) => { if (texto) out.textos.push({ pos: g(p), texto, ...opc }); };
  const RT = (pts, texto, opc = {}) => { if (texto || opc.lados) out.rotulos.push({ pts: pts.map(g), texto, ...opc }); };
  const G = (p, gl, opc = {}) => out.glifos.push({ pos: g(p), ...gl, ...opc });
  const nombre = props.nombre ?? '';
  const etiqueta = [m.sigla, nombre].filter(Boolean).join(' ');
  const color = m.color ?? props.color;
  const disc = Boolean(m.discontinua);

  switch (m.forma) {
    case 'punto':
      G(P[0], { g: m.glifo }, { giro: props.giro ?? 0 });
      return out;
    case 'linea':
      lineaConPatron(P);
      if (m.rotulo === 'limite') RT(P, props.escalonMarca || '', { lados: { izq: props.izq, der: props.der }, escalon: true });
      else if (m.rotulo !== false) RT(P, etiqueta);
      if (m.estrellas) for (const q of [P[0], P.at(-1)]) G(q, { g: { tipo: 'estrella' } });
      if (m.trafico) trafico(P);
      return out;
    case 'area': zona(P); return out;
    case 'rect': {
      if (P.length < 2) return out;
      const [p1, p2] = P, v = res(p2, p1), n = uni(perp(v)), w = props.ancho > 0 ? props.ancho : lon(v) * 0.5;
      zona([sum(p1, mul(n, w / 2)), sum(p2, mul(n, w / 2)), sum(p2, mul(n, -w / 2)), sum(p1, mul(n, -w / 2))]);
      return out;
    }
    case 'circulo': {
      if (P.length < 2) return out;
      const r = lon(res(P[1], P[0])) || 1;
      zona(arco(P[0], r, 0, 2 * Math.PI, 90).slice(0, -1), { centro: P[0] });
      return out;
    }
    case 'corredor': {
      if (P.length < 2) return out;
      const w = props.ancho > 0 ? props.ancho : px(36);
      L(paralela(P, w / 2), { discontinua: disc }); L(paralela(P, -w / 2), { discontinua: disc });
      RT(P, etiqueta, { sinLinea: true });
      return out;
    }
    case 'eje': eje(P); return out;
    case 'dir': direccion(P); return out;
    default: especial(); return out;
  }

  // ---------------------------------------------------------- líneas y sus motivos
  function paralela(Q, d) {
    return Q.map((p, i) => {
      const dPrev = i > 0 ? uni(res(p, Q[i - 1])) : null, dNext = i < Q.length - 1 ? uni(res(Q[i + 1], p)) : null;
      const dir = uni(sum(dPrev ?? dNext, dNext ?? dPrev));
      return sum(p, mul(perp(dir), d));
    });
  }
  function lineaConPatron(Q, patron = m.patron, cerrada = false) {
    const s = 1;
    switch (patron) {
      case 'flot': {
        const r = px(7) * s;
        const pts = [];
        for (const q of muestrear(Q, 2 * r, r)) { const c = q.p, a0 = angDe(mul(q.t, -1)); pts.push(...arco(c, r, a0, a0 - Math.PI, 8)); }
        L(pts);
        return;
      }
      case 'almenas': {
        // onda cuadrada tramo a tramo, con un número entero de almenas en cada lado
        const QQ = cerrada ? [...Q, Q[0]] : Q, alto = px(8), pts = [];
        for (let i = 0; i < QQ.length - 1; i++) {
          const a0 = QQ[i], v = res(QQ[i + 1], a0), l = lon(v); if (!l) continue;
          const t = uni(v), n = perp(t), k = Math.max(1, Math.round(l / px(18))), w = l / k;
          for (let j = 0; j < k; j++) {
            const b = sum(a0, mul(t, j * w));
            pts.push(b, sum(b, mul(t, w * 0.25)), sum(sum(b, mul(t, w * 0.25)), mul(n, alto)), sum(sum(b, mul(t, w * 0.75)), mul(n, alto)), sum(b, mul(t, w * 0.75)));
          }
        }
        pts.push(QQ.at(-1));
        L(pts, { discontinua: disc });
        return;
      }
      default: break;
    }
    if (!m.sinLinea) L(cerrada ? [...Q, Q[0]] : Q, { discontinua: disc });
    if (!patron) return;
    const ms = (paso, desde) => muestrear(cerrada ? [...Q, Q[0]] : Q, paso, desde);
    switch (patron) {
      case 'dientes': for (const q of ms(px(16))) L([sum(q.p, mul(q.t, -px(5))), sum(q.p, mul(q.n, px(9))), sum(q.p, mul(q.t, px(5)))]); break;
      case 'puas': for (const q of ms(px(9))) L([q.p, sum(q.p, mul(q.n, px(8)))]); break;
      case 'zanja': case 'zanja-llena': case 'zanja-minas': {
        for (const q of ms(px(20))) {
          const tri = [sum(q.p, mul(q.t, -px(7))), sum(q.p, mul(q.n, px(12))), sum(q.p, mul(q.t, px(7)))];
          if (patron === 'zanja') L(tri); else F(tri, { opacidad: 1 });
          if (patron === 'zanja-minas') G(sum(sum(q.p, mul(q.t, px(10))), mul(q.n, px(5))), { g: { tipo: 'mina', variante: 'cc' }, escala: 0.35 });
        }
        break;
      }
      case 'x': case 'xx': case 'x-denso': {
        const paso = patron === 'x-denso' ? px(11) : px(22), r = px(4.5);
        for (const q of ms(paso)) {
          for (const dx of patron === 'xx' ? [-r * 1.1, r * 1.1] : [0]) {
            const c = sum(q.p, mul(q.t, dx));
            L([sum(c, sum(mul(q.t, -r), mul(q.n, -r))), sum(c, sum(mul(q.t, r), mul(q.n, r)))]);
            L([sum(c, sum(mul(q.t, -r), mul(q.n, r))), sum(c, sum(mul(q.t, r), mul(q.n, -r)))]);
          }
        }
        break;
      }
      case 'x-baja': case 'x-alta': {
        const r = px(4), h = px(patron === 'x-alta' ? 10 : 8);
        if (patron === 'x-alta') L(paralela(Q, h));
        for (const q of ms(px(10))) {
          const c = sum(q.p, mul(q.n, h / 2));
          L([sum(c, sum(mul(q.t, -r), mul(q.n, -h / 2))), sum(c, sum(mul(q.t, r), mul(q.n, h / 2)))]);
          L([sum(c, sum(mul(q.t, -r), mul(q.n, h / 2))), sum(c, sum(mul(q.t, r), mul(q.n, -h / 2)))]);
        }
        break;
      }
      case 'concertina': case 'concertina-2': case 'concertina-3': {
        const r = px(5);
        if (patron === 'concertina-3') L(paralela(Q, r * 2));
        for (const q of ms(px(12))) { const c = sum(q.p, mul(q.n, r)); L(arco(c, r, 0, 2 * Math.PI, 14)); }
        break;
      }
      case 'valla': for (const q of ms(px(26))) { const c = sum(q.p, mul(q.n, px(-6))), r = px(3.5); L([sum(c, [-r, -r]), sum(c, [r, r])]); L([sum(c, [-r, r]), sum(c, [r, -r])]); } break;
      case 'mina': { const ms2 = muestrear(Q, longitud(Q) / 2, longitud(Q) / 2); if (ms2[0]) G(ms2[0].p, { g: { tipo: 'campo-minas' } }); break; }
      default: break;
    }
  }
  function trafico(Q) {
    const ms2 = muestrear(Q, longitud(Q) / 2, longitud(Q) / 2)[0]; if (!ms2) return;
    const l = px(34), o = px(16), c = sum(ms2.p, mul(ms2.n, o));
    const ini = sum(c, mul(ms2.t, -l / 2)), fin = sum(c, mul(ms2.t, l / 2));
    if (m.trafico === 'uno') { L([ini, fin]); L(punta(fin, ms2.t, px(6))); }
    if (m.trafico === 'dos') {
      L([ini, fin]); L(punta(fin, ms2.t, px(6)));
      const c2 = sum(c, mul(ms2.n, px(7))), i2 = sum(c2, mul(ms2.t, l / 2)), f2 = sum(c2, mul(ms2.t, -l / 2));
      L([i2, f2]); L(punta(f2, mul(ms2.t, -1), px(6)));
    }
    if (m.trafico === 'alt') {
      L([ini, sum(c, mul(ms2.t, -px(10)))]); L(punta(ini, mul(ms2.t, -1), px(6)));
      L([sum(c, mul(ms2.t, px(10))), fin]); L(punta(fin, ms2.t, px(6)));
      T(c, 'ALT', { rumbo: angulo(ms2.t) - 90, tam: 11, negrita: true });
    }
  }

  // ---------------------------------------------------------- zonas
  function zona(Q, { centro } = {}) {
    if (Q.length < 3) { L(Q, { discontinua: disc, color }); return; }
    const ccw = areaFirmada(Q) > 0; // en sentido antihorario la normal izquierda mira hacia dentro
    const fuera = ccw ? Q.slice().reverse() : Q; // así la normal izquierda mira hacia fuera
    if (m.borde === 'almenas') lineaConPatron(fuera, 'almenas', true);
    else {
      L([...Q, Q[0]], { discontinua: disc, color });
      if (m.borde) lineaConPatron(fuera, m.borde, true);
    }
    const c = centro ?? centroide(Q);
    if (m.relleno === 'gris') F(Q, { color: '#7a7a7a', opacidad: 0.35 });
    if (m.relleno === 'amarillo') F(Q, { color: '#FFE34D', opacidad: 0.35 });
    if (m.relleno === 'rayado' || m.relleno === 'amarillo') for (const [p, q] of rayado(Q, px(m.relleno === 'amarillo' ? 7 : 10), Math.PI / 4)) L([p, q], { grosor: 0.45, color });
    if (m.relleno === 'cuadriculado') for (const ang of [Math.PI / 4, -Math.PI / 4]) for (const [p, q] of rayado(Q, px(10), ang)) L([p, q], { grosor: 0.45, color });
    if (m.glifo) G(c, { zona: m });
    const texto = m.glifo === 'nbq' ? nombre : m.rotuloAbajo ? nombre : etiqueta;
    if (texto) T(m.glifo ? sum(c, [0, -px(m.glifo === 'nbq' ? 34 : 24)]) : c, texto, { tam: 14, negrita: true, fondo: Boolean(m.relleno), color });
    if (m.rotuloAbajo) { const y0 = Math.min(...Q.map((p) => p[1])); const pAbajo = Q.find((p) => p[1] === y0); T(sum(pAbajo, [0, -px(10)]), m.sigla, { tam: 11, negrita: true, color }); }
    if (m.bordes) {
      const lados = Q.map((p, i) => [p, Q[(i + 1) % Q.length]]).sort((x, y) => lon(res(y[1], y[0])) - lon(res(x[1], x[0]))).slice(0, centro ? 0 : 4);
      if (centro) { const r = lon(res(Q[0], centro)); for (const ang of [0, 90, 180, 270]) { const v = [Math.sin((ang * Math.PI) / 180), Math.cos((ang * Math.PI) / 180)]; T(sum(centro, mul(v, r - px(9))), m.bordes, { rumbo: ang + 90, tam: 10, negrita: true, color }); } }
      for (const [p, q] of lados) { const v = res(q, p), n = uni(perp(v)), dentro = ccw ? n : mul(n, -1); T(sum(med(p, q), mul(dentro, px(9))), m.bordes, { rumbo: angulo(v) - 90, tam: 10, negrita: true, color }); }
    }
    if (m.escalonBorde && props.escalonMarca) {
      const i = Q.reduce((b, p, k) => (med(p, Q[(k + 1) % Q.length])[1] < med(Q[b], Q[(b + 1) % Q.length])[1] ? k : b), 0); // el lado más al sur
      const p = Q[i], q = Q[(i + 1) % Q.length];
      T(med(p, q), props.escalonMarca, { rumbo: angulo(res(q, p)) - 90, tam: 13, negrita: true, fondo: true, color });
    }
  }

  // ---------------------------------------------------------- ejes de avance
  function eje(Q) {
    if (Q.length < 2) return;
    const ancho = props.ancho > 0 ? props.ancho : Math.max(px(26), longitud(Q) * 0.14);
    const v = m.variante;
    const { lineas, cuerpo } = flechaAncha(Q, ancho, v === 'principal');
    const dashed = v === 'contraataque' || v === 'contraataque-fuego';
    if (v === 'finta') {
      const [contorno] = lineas;
      const k = cuerpo.izq.length;
      L(contorno.slice(0, k)); L(contorno.slice(k + 3), {});
      L([cuerpo.alas[0], cuerpo.alas[1], cuerpo.alas[2]], { discontinua: true });
    } else for (const l of lineas) L(l, { discontinua: dashed || disc });
    const i = Math.max(0, Q.length - 2), cMed = med(Q[i], Q[i + 1]), dir = uni(res(Q[i + 1], Q[i]));
    if (v === 'helicoptero') {
      const c = med(cuerpo.base, Q[i]), n = perp(dir), w = ancho * 0.35;
      L([sum(c, mul(n, w)), sum(c, mul(n, -w))]);
      L([sum(sum(c, mul(dir, -w * 0.6)), mul(n, w * 0.6)), sum(sum(c, mul(dir, w * 0.6)), mul(n, -w * 0.6)), sum(sum(c, mul(dir, w * 0.6)), mul(n, w * 0.6)), sum(sum(c, mul(dir, -w * 0.6)), mul(n, -w * 0.6)), sum(sum(c, mul(dir, -w * 0.6)), mul(n, w * 0.6))]);
    }
    if (v === 'frontal') { const n = cuerpo.nFin, f = sum(cuerpo.fin, mul(cuerpo.dFin, px(4))); L([sum(f, mul(n, ancho)), sum(f, mul(n, -ancho))]); }
    if (v === 'envolvente') { const c = Q[0], d0 = uni(res(Q[1], Q[0])), n0 = perp(d0), w = ancho; const cc = sum(c, mul(d0, w)); L([sum(cc, sum(mul(d0, -w * 0.8), mul(n0, w))), sum(cc, sum(mul(d0, w * 0.8), mul(n0, -w)))]); L([sum(cc, sum(mul(d0, -w * 0.8), mul(n0, -w))), sum(cc, sum(mul(d0, w * 0.8), mul(n0, w)))]); }
    if (v === 'contraataque-fuego') { const f = cuerpo.fin, d = cuerpo.dFin, l = ancho * 0.9; L([f, sum(f, mul(d, l))]); L(punta(sum(f, mul(d, l)), d, ancho * 0.3)); }
    const txt = [m.sigla, nombre].filter(Boolean).join(' ');
    T(cMed, txt, { rumbo: angulo(dir) - 90, negrita: true, tam: 13 });
  }
  function direccion(Q) {
    if (Q.length < 2) return;
    const v = m.variante, t = Math.max(px(12), Math.min(longitud(Q) * 0.08, px(26)));
    const dir = uni(res(Q.at(-1), Q.at(-2)));
    L(Q, { discontinua: disc });
    L(punta(Q.at(-1), dir, t), { discontinua: v === 'finta' });
    if (v === 'principal') L(punta(sum(Q.at(-1), mul(dir, -t * 0.5)), dir, t));
    if (v === 'aviacion') {
      const ms = muestrear(Q, longitud(Q) / 2, longitud(Q) / 2)[0];
      if (ms) { const c = ms.p, w = px(8); L([sum(c, sum(mul(ms.t, -w), mul(ms.n, w))), sum(c, sum(mul(ms.t, w), mul(ms.n, -w))), sum(c, sum(mul(ms.t, w), mul(ms.n, w))), sum(c, sum(mul(ms.t, -w), mul(ms.n, -w))), sum(c, sum(mul(ms.t, -w), mul(ms.n, w)))]); }
    }
    RT(Q, nombre, { arriba: true });
  }

  // ---------------------------------------------------------- símbolos con puntos fijos
  function especial() {
    const s = m.sigla ?? '';
    const n = puntosNecesarios(m);
    // Rellenar puntos que falten (planes antiguos o vista previa) con valores razonables
    if (P.length < n) {
      const base = P[0] ?? [0, 0], l = P[1] ? lon(res(P[1], P[0])) : px(60);
      while (P.length < n) P.push(sum(base, rot([l, 0], (P.length * Math.PI) / 2)));
    }
    const tam = props.tam > 0 ? props.tam : px(70);
    const giro = ((props.giro ?? 0) * Math.PI) / 180;
    const E = (v) => sum(P[0], rot(v, -giro)); // para los estáticos de un punto
    const etq = (p, t = s, o = {}) => T(p, t, { fondo: true, negrita: true, ...o });
    switch (m.id) {
      case 'bloquear': case 'penetrar': case 'efecto-bloqueo': {
        const [p1, p2, p3] = P, c = med(p1, p2);
        L([p1, p2]); L([p3, c]);
        if (m.id === 'penetrar') L(punta(c, uni(res(c, p3)), lon(res(p2, p1)) * 0.18));
        if (m.id !== 'efecto-bloqueo') etq(med(c, p3));
        break;
      }
      case 'brecha': case 'desbordar': case 'canalizar': case 'rodeo-facil': case 'rodeo-dificil': case 'rodeo-imposible': {
        const [p1, p2, p3] = P, ab = res(p2, p1), nn = uni(perp(ab));
        const prof = dot(res(p3, p1), nn), atras = mul(nn, prof);
        const q1 = sum(p1, atras), q2 = sum(p2, atras);
        const t = lon(ab) * 0.12, fuera = uni(ab), delante = mul(nn, -Math.sign(prof) || 1);
        if (m.id === 'rodeo-dificil') {
          const zz = [q1]; const k = 8; for (let i = 1; i < k; i++) zz.push(sum(sum(q1, mul(res(q2, q1), i / k)), mul(delante, (i % 2 ? 1 : -1) * t * 0.5))); zz.push(q2);
          L([p1, q1]); L(zz); L([q2, p2]);
        } else if (m.id === 'rodeo-imposible') {
          const c = med(q1, q2), h = lon(ab) * 0.08;
          L([p1, q1, sum(c, mul(fuera, -h))]); L([sum(c, mul(fuera, h)), q2, p2]);
          L([sum(sum(c, mul(fuera, -h)), mul(delante, t * 0.5)), sum(sum(c, mul(fuera, -h)), mul(delante, -t * 0.5))]);
          L([sum(sum(c, mul(fuera, h)), mul(delante, t * 0.5)), sum(sum(c, mul(fuera, h)), mul(delante, -t * 0.5))]);
        } else L([p1, q1, q2, p2]);
        if (m.id === 'desbordar' || m.id.startsWith('rodeo')) { L(punta(p1, delante, t)); L(punta(p2, delante, t)); }
        else {
          const sg = m.id === 'brecha' ? -1 : 1;
          L([sum(p1, sum(mul(fuera, sg * t * 0.7), mul(delante, t * 0.7))), sum(p1, sum(mul(fuera, -sg * t * 0.7), mul(delante, -t * 0.7)))]);
          L([sum(p2, sum(mul(fuera, -sg * t * 0.7), mul(delante, t * 0.7))), sum(p2, sum(mul(fuera, sg * t * 0.7), mul(delante, -t * 0.7)))]);
        }
        if (s) etq(med(q1, q2));
        break;
      }
      case 'limpiar': {
        const [p1, p2, p3] = P, ab = res(p2, p1), nn = uni(perp(ab));
        const prof = dot(res(p3, p1), nn);
        L([p1, p2]);
        const t = lon(ab) * 0.1, dir = mul(nn, -Math.sign(prof) || 1);
        for (const k of [0.2, 0.5, 0.8]) {
          const tip = sum(p1, mul(ab, k)), cola = sum(tip, mul(nn, prof));
          L([cola, tip]); L(punta(tip, dir, t));
          if (k === 0.5) etq(med(cola, tip));
        }
        break;
      }
      case 'contener': {
        const [p1, p2] = P, c = med(p1, p2), r = lon(res(p2, p1)) / 2, a0 = angDe(res(p1, c));
        const arc = arco(c, r, a0, a0 + Math.PI, 30);
        L(arc);
        for (let i = 1; i < 10; i++) { const q = arc[i * 3]; L([q, sum(q, mul(uni(res(q, c)), r * 0.18))]); }
        etq(sum(c, mul(uni(res(arc[15], c)), r * 1.32)));
        break;
      }
      case 'controlar': case 'asegurar': case 'ocupar': case 'aislar': case 'negar': case 'localizar':
      case 'cerco-llamada': case 'cerco-registro': case 'retener': case 'defensa-zona': {
        const [p1, p2] = P, r = lon(res(p2, p1)) || 1, a0 = angDe(res(p2, p1));
        const arc = arco(p1, r, a0, a0 + (330 * Math.PI) / 180, 44);
        L(arc);
        const fin = arc.at(-1), tg = uni(res(fin, arc.at(-2)));
        if (m.id === 'ocupar') { const d = r * 0.14; L([sum(fin, [-d, -d]), sum(fin, [d, d])]); L([sum(fin, [-d, d]), sum(fin, [d, -d])]); }
        else if (m.id === 'asegurar') { const t = r * 0.2; const b = sum(fin, mul(tg, -t)); L([sum(b, mul(perp(tg), t * 0.6)), fin]); }
        else if (m.id === 'defensa-zona') { for (let i = 4; i <= 44; i += 8) { const q = arc[i], v = uni(res(q, p1)), t2 = uni(res(arc[i], arc[i - 1])); F([sum(q, mul(t2, -r * 0.08)), sum(q, mul(v, r * 0.2)), sum(q, mul(t2, r * 0.08))], { opacidad: 1 }); } L(punta(fin, tg, r * 0.18)); }
        else L(punta(fin, tg, r * 0.18));
        if (['aislar', 'cerco-llamada', 'cerco-registro'].includes(m.id)) for (let i = 4; i < 40; i += 6) { const q = arc[i], q2 = arc[i + 2]; L([q, sum(med(q, q2), mul(uni(res(p1, q)), r * 0.2)), q2]); }
        if (m.id === 'negar') for (let i = 4; i < 40; i += 6) { const q = arc[i], q2 = arc[i + 2]; L([q, sum(med(q, q2), mul(uni(res(q, p1)), r * 0.2)), q2]); }
        if (m.id === 'retener') for (let i = 2; i < 42; i += 2) { const q = arc[i]; L([q, sum(q, mul(uni(res(q, p1)), r * 0.12))]); }
        etq(arc[Math.round(arc.length * 0.25)]);
        break;
      }
      case 'tomar': case 'capturar': case 'evacuar': case 'recuperar': {
        const [p1, p2, p3, p4] = P, r = lon(res(p2, p1)) || 1;
        L(arco(p1, r, 0, 2 * Math.PI, 48));
        const ini = sum(p1, mul(uni(res(p3, p1)), r));
        const ctrl = sum(mul(p3, 2), mul(sum(ini, p4), -0.5)); // la curva pasa por el punto 3
        const curva = bezier(ini, ctrl, p4);
        L(curva); L(punta(p4, uni(res(p4, curva.at(-2))), lon(res(p4, ini)) * 0.1), { discontinua: false });
        etq(curva[10]);
        break;
      }
      case 'destruir': case 'neutralizar': case 'suprimir': {
        const d = tam / 2, hueco = d * 0.28;
        for (const v of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const u = uni(v);
          const dd = m.id === 'suprimir' || (m.id === 'neutralizar' && v[0] * v[1] < 0);
          L([E(mul(u, hueco)), E(mul(u, d))], { discontinua: dd });
        }
        etq(P[0]);
        break;
      }
      case 'interdiccion': {
        const d = tam / 2;
        for (const ang of [0, Math.PI / 4]) {
          const u = rot([1, 0], ang), a1 = E(mul(u, -d)), b1 = E(mul(u, d));
          L([a1, b1]); L(punta(b1, uni(res(b1, a1)), d * 0.25));
        }
        etq(P[0]);
        break;
      }
      case 'derrotar': {
        const d = tam / 2;
        for (const v of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const u = uni(v), a1 = E(mul(u, d)), b1 = E(mul(u, d * 0.35));
          L([a1, b1], { grosor: 2 }); L(punta(b1, uni(res(b1, a1)), d * 0.18), { grosor: 2 });
        }
        etq(P[0]);
        break;
      }
      case 'fijar': case 'efecto-fijar': {
        const [p1, p2] = P, v = res(p1, p2), u = uni(v), nn = perp(u), Lt = lon(v);
        const pts = [p2, sum(p2, mul(u, Lt * 0.18))];
        const nz = 8, a0 = Lt * 0.18, a1 = Lt * 0.85, amp = Lt * 0.06;
        for (let i = 1; i <= nz; i++) pts.push(sum(sum(p2, mul(u, a0 + ((a1 - a0) * (i - 0.5)) / nz)), mul(nn, i % 2 ? amp : -amp)));
        pts.push(sum(p2, mul(u, a1)), p1);
        L(pts); L(punta(p1, u, Lt * 0.1));
        if (s) etq(sum(p2, mul(u, Lt * 0.08)));
        break;
      }
      case 'retardar': case 'retirada': case 'replegarse': case 'replegarse-presion': case 'ruptura': case 'paso-adelante': case 'paso-atras': case 'defensa-movil': {
        const [p1, p2, p3] = P, u = uni(res(p1, p2)), nn = perp(u);
        const lado = Math.sign(dot(res(p3, p2), nn)) || 1;
        const diam = Math.abs(dot(res(p3, p2), nn)) || lon(res(p1, p2)) * 0.3;
        const c = sum(p2, mul(nn, (lado * diam) / 2));
        const a0 = angDe(res(p2, c));
        const arc = arco(c, diam / 2, a0, a0 - lado * Math.PI, 24);
        L([p1, p2]); L(arc);
        L(punta(p1, u, lon(res(p1, p2)) * 0.1));
        if (m.id === 'defensa-movil') {
          const q = arc.at(-1), q2 = sum(q, mul(u, lon(res(p1, p2))));
          L([q, q2]); L(punta(q2, u, lon(res(p1, p2)) * 0.1));
          for (const k of [0.35, 0.7]) for (const [aa, bb, sg] of [[p2, p1, 1], [q, q2, -1]]) { const b = sum(aa, mul(res(bb, aa), k)), t2 = lon(res(p1, p2)) * 0.05; F([sum(b, mul(u, -t2)), sum(b, mul(nn, -lado * sg * t2 * 1.6)), sum(b, mul(u, t2))], { opacidad: 1 }); }
        }
        etq(med(p1, p2));
        break;
      }
      case 'perseguir': {
        const [p1, p2, p3] = P, u = uni(res(p2, p1)), nn = perp(u);
        const lado = Math.sign(dot(res(p3, p2), nn)) || 1, diam = Math.abs(dot(res(p3, p2), nn)) || lon(res(p2, p1)) * 0.3;
        const c = sum(p2, mul(nn, (lado * diam) / 2)), a0 = angDe(res(p2, c));
        const arc = arco(c, diam / 2, a0, a0 + lado * Math.PI, 24);
        L([p1, p2]); L(arc); L(punta(arc.at(-1), uni(res(arc.at(-1), arc.at(-2))), diam * 0.3));
        etq(med(p1, p2));
        break;
      }
      case 'desorganizar': case 'efecto-desorganizar': {
        const [p1, p2, p3] = P, base = res(p2, p1), nn = uni(perp(base));
        const largo = dot(res(p3, p1), nn);
        L([p1, p2]);
        const t = Math.abs(largo) * 0.1;
        for (const [k, f] of [[0.08, 0.45], [0.5, 0.3], [0.92, 1]]) {
          const o = sum(p1, mul(base, k)), tip = sum(o, mul(nn, largo * f));
          L([o, tip]); L(punta(tip, mul(nn, Math.sign(largo) || 1), t));
          if (k === 0.5 && s) etq(sum(o, mul(nn, largo * f * 0.5)));
        }
        const c = med(p1, p2); L([c, sum(c, mul(nn, -largo * 0.25))]);
        break;
      }
      case 'envolver': {
        const [p1, p2, p3, p4] = P, u = uni(res(p2, p1)), nn = perp(u);
        const diam = Math.abs(dot(res(p3, p2), u)) || lon(res(p2, p1)) * 0.4;
        const lado = Math.sign(dot(res(p4, p2), nn)) || 1;
        const c = sum(p2, mul(nn, (lado * diam) / 2)), a0 = angDe(res(p2, c));
        const arc = arco(c, diam / 2, a0, a0 + lado * Math.PI, 24);
        L([p1, p2]); L(arc); L(punta(arc.at(-1), uni(res(arc.at(-1), arc.at(-2))), diam * 0.35));
        etq(med(p1, p2));
        break;
      }
      case 'emboscada': {
        const [p1, p2, p3] = P, c = med(p2, p3), dir = uni(res(p1, c)), r = lon(res(p3, p2)) / 2;
        const curva = bezier(p2, sum(c, mul(dir, -r * 0.5)), p3, 16);
        L(curva);
        for (let i = 1; i < 16; i += 2) L([curva[i], sum(curva[i], mul(dir, r * 0.2))]);
        L([curva[8], p1]); L(punta(p1, dir, r * 0.25));
        break;
      }
      case 'cubrir': case 'vigilar': case 'observar': {
        let [p1, p2, p3, p4] = P;
        if (anclas.length === 3) { const c = P[0]; p1 = P[1]; p2 = c; p3 = c; p4 = P[2]; } // planes antiguos (3 puntos)
        const flecha = (tip, cola) => {
          const v = res(tip, cola), u = uni(v), nn = perp(u), d = lon(v);
          const z0 = sum(cola, mul(u, d * 0.55)), z1 = sum(cola, mul(u, d * 0.62));
          L([cola, z0, sum(med(z0, z1), mul(nn, d * 0.06)), z1, tip]);
          L(punta(tip, u, d * 0.08));
        };
        flecha(p1, sum(p2, mul(uni(res(p1, p2)), lon(res(p1, p2)) * 0.12)));
        flecha(p4, sum(p3, mul(uni(res(p4, p3)), lon(res(p4, p3)) * 0.12)));
        etq(sum(p2, mul(uni(res(p1, p2)), lon(res(p1, p2)) * 0.06))); etq(sum(p3, mul(uni(res(p4, p3)), lon(res(p4, p3)) * 0.06)));
        break;
      }
      case 'relevo': case 'demostracion': {
        const [p1, p2, p3, p4] = P;
        const u1 = uni(res(p1, p2)), u2 = uni(res(p3, p4));
        const d = lon(res(p3, p2));
        const c1 = sum(p2, mul(u1, -d * 0.6)), c2 = sum(p3, mul(m.id === 'relevo' ? u2 : mul(u2, -1), -d * 0.6));
        const curva = Array.from({ length: 21 }, (_, i) => { const t = i / 20; return sum(sum(sum(mul(p2, (1 - t) ** 3), mul(c1, 3 * t * (1 - t) ** 2)), mul(c2, 3 * t * t * (1 - t))), mul(p3, t ** 3)); });
        L([p1, p2]); L(curva); L([p3, p4]);
        L(punta(p1, u1, lon(res(p1, p2)) * 0.12));
        if (m.id === 'relevo') L(punta(p3, uni(res(p3, p4)), lon(res(p3, p4)) * 0.12));
        etq(curva[10]);
        break;
      }
      case 'seguir-asumir': case 'seguir-apoyar': {
        const [p1, p2] = P, v = res(p1, p2), u = uni(v), nn = perp(u), d = lon(v), h = d * 0.08, b = d * 0.18;
        L([sum(p2, mul(nn, h)), sum(sum(p2, mul(u, b)), mul(nn, h)), sum(p2, mul(u, b + h)), sum(sum(p2, mul(u, b)), mul(nn, -h)), sum(p2, mul(nn, -h)), sum(p2, mul(nn, h))]);
        const ini = sum(p2, mul(u, b + h));
        if (m.id === 'seguir-asumir') { L([ini, sum(p1, mul(u, -d * 0.08))], { discontinua: true }); L(punta(p1, u, d * 0.12)); L(punta(sum(p1, mul(u, -d * 0.07)), u, d * 0.12), { discontinua: true }); }
        else { L([ini, sum(p1, mul(u, -d * 0.1))]); F([sum(sum(p1, mul(u, -d * 0.12)), mul(nn, d * 0.06)), p1, sum(sum(p1, mul(u, -d * 0.12)), mul(nn, -d * 0.06))], { opacidad: 1 }); }
        break;
      }
      case 'explotar': {
        const [p1, p2, p3] = P, u = uni(res(p1, p2)), l = lon(res(p3, p2)) || lon(res(p1, p2)) * 0.2;
        L([p1, p2]);
        L(punta(p1, u, l, Math.PI / 4));
        L(punta(sum(p2, mul(u, l * 0.7)), u, l, Math.PI / 4), { discontinua: true });
        break;
      }
      case 'escoltar': {
        const [p1, p2, p3] = P, v = res(p3, p2), u = uni(v), nn = perp(u), h = lon(v) * 0.1;
        const arriba = Math.sign(dot(res(p1, p2), nn)) >= 0 ? nn : mul(nn, -1);
        const q2 = sum(p2, mul(arriba, h * 2)), q3 = sum(p3, mul(arriba, h * 2));
        L([p2, q2, q3, p3]);
        etq(sum(med(p2, q2), mul(u, h * 1.4))); etq(sum(med(p3, q3), mul(u, -h * 1.4)));
        break;
      }
      case 'exfiltrar': case 'infiltrar': {
        const [p1, p2, p3] = P, v = res(p3, p1), u = uni(v), nn = perp(u);
        const r = Math.abs(dot(res(p2, p1), nn)) || lon(v) * 0.1;
        const k = dot(res(p2, p1), u), lado = Math.sign(dot(res(p2, p1), nn)) || 1;
        const a1 = sum(p1, mul(u, k - r)), c1 = sum(a1, mul(nn, lado * r)), a2c = sum(p1, sum(mul(u, k + r), mul(nn, lado * r)));
        const arc1 = arco(c1, r, angDe(res(a1, c1)), angDe(res(a1, c1)) + lado * Math.PI / 2, 10);
        const fin1 = arc1.at(-1);
        const arc2 = arco(a2c, r, angDe(res(fin1, a2c)), angDe(res(fin1, a2c)) - lado * Math.PI / 2, 10);
        const q3 = sum(arc2.at(-1), mul(u, lon(res(p3, p1)) - k - r));
        L([p1, a1, ...arc1, ...arc2, q3]); L(punta(q3, u, lon(v) * 0.08));
        etq(med(p1, a1));
        break;
      }
      case 'desviar': case 'efecto-desviar': {
        const [p1, p2, p3] = P;
        const ctrl = sum(mul(p3, 2), mul(sum(p2, p1), -0.5));
        const curva = bezier(p2, ctrl, p1);
        const d = lon(res(p1, p2));
        L(curva.slice(0, -2));
        const u = uni(res(p1, curva.at(-3)));
        F([sum(curva.at(-3), mul(perp(u), d * 0.06)), p1, sum(curva.at(-3), mul(perp(u), -d * 0.06))], { opacidad: 1 });
        if (s) etq(curva[10]);
        break;
      }
      case 'sbf': {
        const [p1, p2, p3, p4] = P, base = res(p2, p1), t = lon(base) * 0.18;
        const nn = uni(perp(base)), haciaDelante = Math.sign(dot(res(p3, p1), nn)) || 1, atras = mul(nn, -haciaDelante * t);
        L([sum(p1, sum(atras, mul(uni(base), -t * 0.6))), p1, p2, sum(p2, sum(atras, mul(uni(base), t * 0.6)))]);
        L([p1, p3]); L(punta(p3, uni(res(p3, p1)), t * 0.5));
        L([p2, p4]); L(punta(p4, uni(res(p4, p2)), t * 0.5));
        etq(med(p1, p2), nombre || '');
        break;
      }
      case 'abf': {
        const [p1, p2, p3] = P, base = res(p3, p2), nn = uni(perp(base)), t = lon(base) * 0.18;
        const haciaFuera = mul(nn, Math.sign(dot(res(p1, p2), nn)) || 1);
        L([sum(p2, sum(mul(haciaFuera, -t), mul(uni(base), -t * 0.6))), p2, p3, sum(p3, sum(mul(haciaFuera, -t), mul(uni(base), t * 0.6)))]);
        const c = med(p2, p3); L([c, p1]); L(punta(p1, uni(res(p1, c)), t * 0.5));
        etq(c, nombre || '');
        break;
      }
      case 'campo-tiro': {
        const [p1, p2, p3] = P;
        for (const q of [p2, p3]) { L([p1, q]); L(punta(q, uni(res(q, p1)), lon(res(q, p1)) * 0.1)); }
        break;
      }
      case 'zona-busqueda': {
        const [p1, p2, p3] = P;
        for (const q of [p2, p3]) {
          const v = res(q, p1), u = uni(v), nn = perp(u), d = lon(v);
          const a1 = sum(p1, sum(mul(u, d * 0.45), mul(nn, d * 0.08))), b1 = sum(p1, sum(mul(u, d * 0.55), mul(nn, -d * 0.08)));
          L([p1, a1, b1, q]); L(punta(q, uni(res(q, b1)), d * 0.1));
        }
        break;
      }
      case 'objetivo-lineal': case 'humo-lineal': case 'fpf': {
        L(P);
        const h = px(10);
        for (const [q, o] of [[P[0], P[1]], [P.at(-1), P.at(-2)]]) { const nn = uni(perp(res(o, q))); L([sum(q, mul(nn, h)), sum(q, mul(nn, -h))]); }
        RT(P, [s, nombre].filter(Boolean).join(' '));
        break;
      }
      case 'abanico-circ': {
        const [p1, p2] = P, r = lon(res(p2, p1)) || 1;
        for (const k of [1 / 3, 2 / 3, 1]) L(arco(p1, r * k, 0, 2 * Math.PI, 72));
        G(p1, { g: { tipo: 'cruz' }, escala: 0.4 });
        break;
      }
      case 'abanico-sector': {
        const [p1, p2, p3] = P, r = lon(res(p2, p1)) || 1;
        let a0 = angDe(res(p2, p1)), a1 = angDe(res(p3, p1));
        if (a1 > a0) a1 -= 2 * Math.PI; // sentido horario de 2 a 3
        if (a0 - a1 > 2 * Math.PI) a1 += 2 * Math.PI;
        for (const k of [1 / 3, 2 / 3, 1]) L(arco(p1, r * k, a0, a1, 40));
        L([p1, sum(p1, [r * Math.cos(a0), r * Math.sin(a0)])]); L([p1, sum(p1, [r * Math.cos(a1), r * Math.sin(a1)])]);
        break;
      }
      case 'distancia-seguridad': {
        const [p1, p2] = P, r = lon(res(p2, p1)) || 1;
        L(arco(p1, r, 0, 2 * Math.PI, 72)); L(arco(p1, r * 0.55, 0, 2 * Math.PI, 72));
        T(sum(p1, [r * 0.55, 0]), '1', { tam: 11 }); T(sum(p1, [r, 0]), '2', { tam: 11 });
        break;
      }
      case 'abatis': {
        L(P);
        const u = uni(res(P[1], P[0])), nn = perp(u), d = px(10);
        L([P[0], sum(sum(P[0], mul(u, d * 0.6)), mul(nn, d * 1.6)), sum(P[0], mul(u, d * 1.2))]);
        break;
      }
      case 'cable-trampa': {
        const [p1, p2] = P, u = uni(res(p2, p1)), nn = perp(u), d = lon(res(p2, p1));
        L([p1, p2]);
        L([sum(p1, mul(nn, d * 0.25)), sum(p1, mul(nn, -d * 0.25))]);
        L(arco(sum(p2, mul(nn, -d * 0.2)), d * 0.2, angDe(nn), angDe(nn) - Math.PI / 2, 10));
        break;
      }
      case 'racimo-minas': {
        const [p1, p2] = P, c = med(p1, p2), r = lon(res(p2, p1)) / 2, a0 = angDe(res(p1, c));
        L([p1, p2], { discontinua: true }); L(arco(c, r, a0, a0 - Math.PI, 30), { discontinua: true });
        break;
      }
      case 'cable-aereo': {
        L(P);
        for (const q of [P[0], P.at(-1)]) G(q, { g: { tipo: 'torre' }, escala: 0.5 });
        break;
      }
      case 'puente': case 'cruce-asalto': case 'vado-facil': case 'vado-dificil': case 'corte-previsto': case 'corte-sr1': case 'corte-sr2': case 'corte-ejecutado': {
        const [p1, p2, p3] = P, v = res(p2, p1), nn = uni(perp(v)), w = dot(res(p3, p1), nn) || lon(v) * 0.3;
        const q1 = sum(p1, mul(nn, w)), q2 = sum(p2, mul(nn, w)), u = uni(v), f = lon(v) * 0.12;
        if (m.id === 'puente' || m.id === 'cruce-asalto') {
          const sg = Math.sign(w) || 1;
          L([sum(sum(p1, mul(u, -f)), mul(nn, -sg * f)), p1, p2, sum(sum(p2, mul(u, f)), mul(nn, -sg * f))]);
          L([sum(sum(q1, mul(u, -f)), mul(nn, sg * f)), q1, q2, sum(sum(q2, mul(u, f)), mul(nn, sg * f))]);
        } else if (m.id.startsWith('vado')) {
          L([p1, p2], { discontinua: true }); L([q1, q2], { discontinua: true });
          if (m.id === 'vado-dificil') { const c = med(p1, p2), zz = []; for (let i = 0; i <= 6; i++) zz.push(sum(sum(c, mul(nn, (w * i) / 6)), mul(u, (i % 2 ? 1 : -1) * f * 0.4))); L(zz); }
        } else if (m.id === 'corte-ejecutado') { L([p1, q2]); L([q1, p2]); L([sum(p1, mul(u, f * 0.4)), sum(q2, mul(u, f * 0.4))]); L([sum(q1, mul(u, f * 0.4)), sum(p2, mul(u, f * 0.4))]); }
        else { L([p1, p2], { discontinua: m.id !== 'corte-sr2' }); L([q1, q2], { discontinua: m.id === 'corte-previsto' }); }
        break;
      }
      case 'transbordador': { const [p1, p2] = P, u = uni(res(p2, p1)), d = lon(res(p2, p1)); L([p1, p2]); L(punta(p2, u, d * 0.1)); L(punta(p1, mul(u, -1), d * 0.1)); break; }
      case 'balsas': case 'paso-seguro': case 'corredor-movilidad': {
        const Q = P; L(Q);
        for (const [q, o] of [[Q[0], Q[1]], [Q.at(-1), Q.at(-2)]]) {
          const u = uni(res(q, o)), nn = perp(u), d = px(12);
          L([sum(sum(q, mul(u, d)), mul(nn, d)), q, sum(sum(q, mul(u, d)), mul(nn, -d))]);
        }
        if (m.id === 'corredor-movilidad') RT(Q, props.escalonMarca || '', { escalon: true });
        break;
      }
      case 'posicion-fortificada': {
        const [p1, p2] = P, v = res(p2, p1), nn = uni(perp(v)), d = lon(v) * 0.25;
        L([p1, sum(p1, mul(nn, d)), sum(p2, mul(nn, d)), p2]);
        break;
      }
      case 'convoy': case 'convoy-detenido': {
        const [p1, p2] = P, v = res(p1, p2), u = uni(v), nn = perp(u), d = lon(v), h = d * 0.12;
        const b = sum(p2, mul(u, d * 0.78));
        if (m.id === 'convoy') L([sum(p2, mul(nn, h)), sum(b, mul(nn, h)), sum(b, mul(nn, h * 1.8)), p1, sum(b, mul(nn, -h * 1.8)), sum(b, mul(nn, -h)), sum(p2, mul(nn, -h)), sum(p2, mul(nn, h))]);
        else L([sum(p2, mul(nn, h)), sum(p1, mul(nn, h)), sum(b, [0, 0]), sum(p1, mul(nn, -h)), sum(p2, mul(nn, -h)), sum(p2, mul(nn, h))]);
        if (nombre) T(med(p1, p2), nombre, { rumbo: angulo(u) - 90, tam: 12, negrita: true });
        break;
      }
      case 'senuelo': case 'finta': {
        const [p1, p2, p3] = P;
        L([p2, p1, p3], { discontinua: true });
        if (m.id === 'senuelo' && nombre) T(med(p2, p3), nombre, { negrita: true });
        break;
      }
      default: L(P);
    }
  }
}

/** Número de puntos fijos (0 si es libre). */
export const puntosFijosDe = (m) => m?.n ?? 0;
