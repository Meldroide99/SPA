// Organización operativa en gráfico, como el organigrama de los modelos de Balú
// (OPORD_NIVEL_CIA): la unidad que manda arriba, sus subordinadas en columnas
// unidas por una raya, y lo que cuelga de cada una apilado debajo, un poco
// metido, con su línea de dependencia. Cada unidad es su símbolo APP-6 con el
// nombre al lado (y la relación de mando debajo, si no es orgánica).
//
// La misma disposición sirve para el editor, la vista del documento y el PDF.
// También pasa los trazados SVG de los símbolos a órdenes de PDF.
// No depende de la página: se prueba en Node.

/** Medidas (en las unidades de quien dibuja: px o pt). Marco amigo de 40 × 26,7 y 10 encima para el escalón. */
export const CAJA = Object.freeze({ w: 40, h: 26.67, marca: 10, hueco: 9, sangria: 16, entre: 16, letra: 9 });

/** Símbolo por defecto de una unidad del organigrama. */
export const SIMBOLO_BASE = Object.freeze({ conjunto: '10', identidad: 'amigo', icono: '', escalon: '' });

const hijasDe = (us, id) => us.filter((u) => (u.padre ?? null) === id);
/** Texto pequeño bajo el nombre: relación de mando y quién la cede. */
export const subtituloUnidad = (u) => [u.relacion, u.de ? `de ${u.de}` : ''].filter(Boolean).join(' · ');

/**
 * Coloca las unidades.
 * @param {{id:string, nombre:string, padre?:string|null, relacion?:string, de?:string}[]} unidades
 * @param {{medir?:(t:string, tam:number, negrita:boolean)=>number}} [o]
 * @returns {{ancho:number, alto:number, cajas:object[], lineas:number[][]}}
 *   cajas: { u, x, y (esquina del marco), w, h, raiz, nombre:{x, y, texto, ancla:'start'|'end'}, sub:{x, y, texto}|null }
 *   lineas: [x1, y1, x2, y2]
 */
export function disponer(unidades, { medir = (t, tam) => String(t).length * tam * 0.56 } = {}) {
  const { w: W, h: H, marca: M, hueco: GY, sangria: S, entre: GX, letra: T } = CAJA;
  const SLOT = M + H;
  const us = unidades ?? [];
  const cajas = [], lineas = [];
  if (!us.length) return { ancho: 0, alto: 0, cajas, lineas };
  const raices = hijasDe(us, null);
  const raiz = raices.length === 1 ? raices[0] : null;
  const columnas = raiz ? hijasDe(us, raiz.id) : raices;
  const anchoEtiqueta = (u) => Math.max(u.nombre ? medir(u.nombre, T, true) : 0, subtituloUnidad(u) ? medir(subtituloUnidad(u), T * 0.78, false) : 0);
  const etiquetas = (u, fx, fy, izquierda) => {
    const sub = subtituloUnidad(u);
    const yc = fy + H / 2;
    const x = izquierda ? fx - 4 : fx + W + 4;
    return {
      nombre: u.nombre ? { x, y: sub ? yc - T * 0.45 : yc, texto: u.nombre, ancla: izquierda ? 'end' : 'start', tam: T } : null,
      sub: sub ? { x, y: yc + T * 0.62, texto: sub, ancla: izquierda ? 'end' : 'start', tam: T * 0.78 } : null,
    };
  };
  const arriba = raiz ? SLOT + 20 : 0;
  let x = 0, alto = arriba;
  const cabezas = [];
  for (const c of columnas) {
    const items = [];
    const rec = (u, d, vistos) => { if (vistos.has(u.id)) return; vistos.add(u.id); items.push({ u, d }); for (const h of hijasDe(us, u.id)) rec(h, d + 1, vistos); };
    rec(c, 0, new Set());
    let y = arriba, ancho = W;
    const pos = new Map();
    for (const { u, d } of items) {
      const fx = x + d * S, fy = y + M;
      pos.set(u.id, { fx, fy });
      cajas.push({ u, x: fx, y: fy, w: W, h: H, raiz: false, ...etiquetas(u, fx, fy, false) });
      const lw = anchoEtiqueta(u);
      ancho = Math.max(ancho, d * S + W + (lw ? 4 + lw : 0));
      y += SLOT + GY;
    }
    // Líneas de dependencia dentro de la columna: tronco bajo el padre y un tramo a cada hija
    for (const { u } of items) {
      const hs = hijasDe(us, u.id).map((h) => pos.get(h.id)).filter(Boolean);
      if (!hs.length) continue;
      const p = pos.get(u.id);
      const tx = p.fx + S / 2;
      const ult = hs.at(-1);
      lineas.push([tx, p.fy + H, tx, ult.fy + H / 2]);
      for (const h of hs) lineas.push([tx, h.fy + H / 2, h.fx, h.fy + H / 2]);
    }
    cabezas.push(pos.get(c.id).fx + W / 2);
    alto = Math.max(alto, y - GY);
    x += ancho + GX;
  }
  let ancho = Math.max(0, x - GX);
  if (raiz) {
    const lw = anchoEtiqueta(raiz);
    const centro = cabezas.length ? (cabezas[0] + cabezas.at(-1)) / 2 : W / 2 + (lw ? lw + 4 : 0);
    let rx = centro - W / 2;
    // El nombre de la que manda va a su izquierda (como «II/4»): si no cabe, todo se corre a la derecha
    const falta = (lw ? lw + 4 : 0) - rx;
    if (falta > 0) {
      for (const k of cajas) { k.x += falta; for (const e of [k.nombre, k.sub]) if (e) e.x += falta; }
      for (const l of lineas) { l[0] += falta; l[2] += falta; }
      for (let i = 0; i < cabezas.length; i++) cabezas[i] += falta;
      rx += falta; ancho += falta;
    }
    cajas.unshift({ u: raiz, x: rx, y: M, w: W, h: H, raiz: true, ...etiquetas(raiz, rx, M, true) });
    ancho = Math.max(ancho, rx + W);
    if (cabezas.length) {
      const yb = SLOT + 10;
      lineas.push([rx + W / 2, SLOT, rx + W / 2, yb]);
      const a = Math.min(rx + W / 2, ...cabezas), b = Math.max(rx + W / 2, ...cabezas);
      if (b > a) lineas.push([a, yb, b, yb]);
      for (const cx of cabezas) lineas.push([cx, yb, cx, arriba + 2]);
    }
    alto = Math.max(alto, SLOT);
  }
  return { ancho, alto, cajas, lineas };
}

// ---------------------------------------------------------------- SVG → PDF
const num = (v) => (Math.abs(v) < 1e-6 ? '0' : v.toFixed(2));
function color(c) {
  if (!c || c === 'none') return null;
  let m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(c);
  if (m) return [m[1], m[2], m[3]].map((v) => (Number(v) / 255).toFixed(3)).join(' ');
  m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' '); }
  if (/^(white|#fff)$/i.test(c)) return '1 1 1';
  return '0 0 0';
}
/** Arco SVG (forma de extremos) → curvas de Bézier cúbicas [[c1x,c1y,c2x,c2y,x,y]…]. */
function arco(x1, y1, rx, ry, giro, grande, barrido, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  const fi = (giro * Math.PI) / 180, cf = Math.cos(fi), sf = Math.sin(fi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cf * dx + sf * dy, yp = -sf * dx + cf * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sg = grande === barrido ? -1 : 1;
  const k = sg * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = cf * cxp - sf * cyp + (x1 + x2) / 2, cy = sf * cxp + cf * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!barrido && dt > 0) dt -= 2 * Math.PI; else if (barrido && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const d = dt / n, a = (4 / 3) * Math.tan(d / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cf - ry * Math.sin(t) * sf, cy + rx * Math.cos(t) * sf + ry * Math.sin(t) * cf];
  const der = (t) => [-rx * Math.sin(t) * cf - ry * Math.cos(t) * sf, -rx * Math.sin(t) * sf + ry * Math.cos(t) * cf];
  const out = [];
  for (let i = 0; i < n; i++) {
    const ta = t1 + i * d, tb = ta + d;
    const [ax, ay] = pt(ta), [bx, by] = pt(tb), [dax, day] = der(ta), [dbx, dby] = der(tb);
    out.push([ax + a * dax, ay + a * day, bx - a * dbx, by - a * dby, bx, by]);
  }
  return out;
}
/** Trazado SVG («d») → órdenes de trazado PDF, con `tf(x, y)` → [x, y] en el PDF. */
export function trazadoPdf(d, tf) {
  const tok = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx2 = null, cy2 = null, qx = null, qy = null;
  const n = () => Number(tok[i++]);
  const P = (px, py) => tf(px, py).map(num).join(' ');
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { out.push('h'); x = sx; y = sy; cx2 = qx = null; continue; }
    if (i >= tok.length || /[a-zA-Z]/.test(tok[i])) continue; // orden sin números

    if (C === 'M') { x = (rel ? x : 0) + n(); y = (rel ? y : 0) + n(); sx = x; sy = y; out.push(`${P(x, y)} m`); cmd = rel ? 'l' : 'L'; cx2 = qx = null; continue; }
    if (C === 'L') { x = (rel ? x : 0) + n(); y = (rel ? y : 0) + n(); out.push(`${P(x, y)} l`); cx2 = qx = null; continue; }
    if (C === 'H') { x = (rel ? x : 0) + n(); out.push(`${P(x, y)} l`); cx2 = qx = null; continue; }
    if (C === 'V') { y = (rel ? y : 0) + n(); out.push(`${P(x, y)} l`); cx2 = qx = null; continue; }
    if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = (rel ? x : 0) + n(); y1 = (rel ? y : 0) + n(); } else { x1 = cx2 === null ? x : 2 * x - cx2; y1 = cy2 === null ? y : 2 * y - cy2; }
      const x2 = (rel ? x : 0) + n(), y2 = (rel ? y : 0) + n(), xe = (rel ? x : 0) + n(), ye = (rel ? y : 0) + n();
      out.push(`${P(x1, y1)} ${P(x2, y2)} ${P(xe, ye)} c`);
      cx2 = x2; cy2 = y2; x = xe; y = ye; qx = null; continue;
    }
    if (C === 'Q' || C === 'T') {
      let x1, y1;
      if (C === 'Q') { x1 = (rel ? x : 0) + n(); y1 = (rel ? y : 0) + n(); } else { x1 = qx === null ? x : 2 * x - qx; y1 = qy === null ? y : 2 * y - qy; }
      const xe = (rel ? x : 0) + n(), ye = (rel ? y : 0) + n();
      out.push(`${P(x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y))} ${P(xe + (2 / 3) * (x1 - xe), ye + (2 / 3) * (y1 - ye))} ${P(xe, ye)} c`);
      qx = x1; qy = y1; x = xe; y = ye; cx2 = null; continue;
    }
    if (C === 'A') {
      const rx = n(), ry = n(), g = n(), la = n(), sw = n();
      const xe = (rel ? x : 0) + n(), ye = (rel ? y : 0) + n();
      for (const s of arco(x, y, rx, ry, g, la, sw, xe, ye)) out.push(`${P(s[0], s[1])} ${P(s[2], s[3])} ${P(s[4], s[5])} c`);
      x = xe; y = ye; cx2 = qx = null; continue;
    }
    i++; // orden desconocida: se salta
  }
  return out.join(' ');
}

/**
 * Un SVG sencillo (los símbolos APP-6: solo <path>) → órdenes de PDF.
 * `tf(x, y)` pasa del sistema del SVG al del PDF; `k` es la escala (para el grosor).
 */
export function svgAPdf(svg, tf, k = 1) {
  const ops = ['q'];
  for (const m of String(svg).matchAll(/<path\b([^>]*?)\/?>/g)) {
    if (/<clipPath[^>]*>[^<]*$/.test(String(svg).slice(0, m.index))) continue; // trazados de recorte
    const at = {};
    for (const a of m[1].matchAll(/([a-z-]+)="([^"]*)"/g)) at[a[1]] = a[2];
    if (!at.d) continue;
    const relleno = color(at.fill ?? '#000'), trazo = color(at.stroke);
    if (!relleno && !trazo) continue;
    const p = trazadoPdf(at.d, tf);
    if (!p) continue;
    const par = /evenodd/.test(at['fill-rule'] ?? '') ? '*' : '';
    let op;
    if (relleno && trazo) op = `B${par}`; else if (relleno) op = `f${par}`; else op = 'S';
    const est = [];
    if (relleno) est.push(`${relleno} rg`);
    if (trazo) est.push(`${trazo} RG ${num(Number(at['stroke-width'] ?? 1) * k)} w ${{ round: 1, square: 2 }[at['stroke-linecap']] ?? 0} J ${{ round: 1, bevel: 2 }[at['stroke-linejoin']] ?? 0} j`);
    if (at['stroke-dasharray']) est.push(`[${at['stroke-dasharray'].split(/[ ,]+/).map((v) => num(Number(v) * k)).join(' ')}] 0 d`); else if (trazo) est.push('[] 0 d');
    ops.push(`${est.join(' ')} ${p} ${op}`);
  }
  ops.push('Q');
  return ops.join('\n');
}
