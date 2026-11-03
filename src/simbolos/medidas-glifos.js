// Iconos de las medidas de coordinación puntuales (APP-6(E) cap. 8: puntos de
// mando y control, observatorios, minas, puntos logísticos, NBQR…).
// Cada icono se dibuja en unidades «de octógono» (100 = lado L de un símbolo de
// unidad) para que tenga el mismo tamaño que las unidades en el mapa.

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ancho = (t, tam) => String(t ?? '').length * tam * 0.62;
const txt = (t, x, y, tam = 26, o = '') => `<text x="${x}" y="${y}" font-size="${tam}" font-family="Arial,Helvetica,sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" ${o}>${esc(t)}</text>`;

/** Iconos pequeños dentro de un marcador (centrados en 0,0, ~30 de alto). */
function iconoInterior(k, c) {
  switch (k) {
    case 'cruz': return `<path d="M-5,-15 h10 v10 h10 v10 h-10 v10 h-10 v-10 h-10 v-10 h10 z" fill="${c}"/>`;
    case 'cruz-fina': return `<path d="M0,-16 V16 M-16,0 H16" stroke="${c}" stroke-width="3" fill="none"/>`;
    case 'flechas4': return `<path d="M0,-16 V16 M-16,0 H16" stroke="${c}" stroke-width="3" fill="none"/><path d="M0,-18 l-5,7 h10z M0,18 l-5,-7 h10z M-18,0 l7,-5 v10z M18,0 l-7,-5 v10z" fill="${c}"/>`;
    case 'persona': return `<circle cx="0" cy="-12" r="5" fill="none" stroke="${c}" stroke-width="3"/><path d="M0,-7 V6 M-10,-3 H10 M0,6 L-8,16 M0,6 L8,16" stroke="${c}" stroke-width="3" fill="none"/>`;
    case 'embudo': return `<path d="M-12,-12 H12 L0,2 Z M0,2 V16" stroke="${c}" stroke-width="3" fill="none" stroke-linejoin="round"/>`;
    case 'municion': return `<path d="M-9,16 V-4 A9,9 0 0 1 9,-4 V16 M-12,16 H12" stroke="${c}" stroke-width="3" fill="none"/>`;
    case 'luna': return `<path d="M4,-15 A15,15 0 1 0 4,15 A11,11 0 1 1 4,-15 Z" fill="none" stroke="${c}" stroke-width="3"/>`;
    case 'puerta': return `<path d="M-14,14 V-12 H14 V14 M0,-12 V14" stroke="${c}" stroke-width="3" fill="none"/>`;
    case 'arco': return `<path d="M-14,6 Q0,-14 14,6" stroke="${c}" stroke-width="3" fill="none"/><circle cx="-14" cy="6" r="4" fill="${c}"/><circle cx="14" cy="6" r="4" fill="${c}"/>`;
    case 'sol': { let d = ''; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; d += `M${(9 * Math.cos(a)).toFixed(1)},${(9 * Math.sin(a)).toFixed(1)} L${(15 * Math.cos(a)).toFixed(1)},${(15 * Math.sin(a)).toFixed(1)} `; } return `<circle r="6" fill="none" stroke="${c}" stroke-width="3"/><path d="${d}" stroke="${c}" stroke-width="2.5"/>`; }
    case 'mortuorio': return `<rect x="-15" y="-7" width="30" height="14" fill="none" stroke="${c}" stroke-width="3"/><path d="M-9,0 H9 M0,-5 V5" stroke="${c}" stroke-width="2.5"/>`;
    default: return '';
  }
}

/** Marcador «chincheta» (punto de acción y derivados, APP-6(E) fig. 8-6). */
function marcador(g, c) {
  const t1 = g.texto ?? '', t2 = g.texto2 ?? '';
  const w = Math.max(56, ancho(t1, 24) + 18, ancho(t2, 22) + 18);
  const lineas = (t1 ? 1 : 0) + (t2 ? 1 : 0) + (g.icono ? 1 : 0);
  const h = Math.max(56, 14 + lineas * 30 + (g.abastecimiento ? 12 : 0));
  const x0 = -w / 2, cono = 34;
  let y = 14, cuerpo = '';
  if (t1) { cuerpo += txt(t1, 0, y + 12, 24, `fill="${c}"`); y += 30; }
  if (t2) { cuerpo += txt(t2, 0, y + 11, 22, `fill="${c}"`); y += 28; }
  if (g.icono) { cuerpo += `<g transform="translate(0,${y + 14})">${iconoInterior(g.icono, c)}</g>`; y += 32; }
  if (!lineas) cuerpo += '';
  const barra = g.abastecimiento ? `<path d="M${x0},${h - 10} H${-x0}" stroke="${c}" stroke-width="3"/>` : '';
  const d = `M${x0},0 H${-x0} V${h} L0,${h + cono} L${x0},${h} Z`;
  return { cajas: [x0 - 3, -3, w + 6, h + cono + 6], ancla: [0, h + cono], svg: `<path d="${d}" fill="#fff" stroke="${c}" stroke-width="3.5" stroke-linejoin="round"/>${barra}${cuerpo}` };
}

/**
 * Icono de una medida puntual.
 * @param {object} g especificación (campo `glifo` del catálogo)
 * @param {string} color
 * @param {number} tam px del lado L
 * @returns {{svg, ancho, alto, ancla:{x,y}}}
 */
export function glifoPunto(g, color = '#000', tam = 34) {
  const c = color;
  const tr = `stroke="${c}" stroke-width="4" fill="none"`;
  let r;
  switch (g?.tipo) {
    case 'marcador': r = marcador(g, c); break;
    case 'gota': r = { cajas: [-34, -34, 68, 112], ancla: [0, 74], svg: `<path d="M-30,0 A30,30 0 1 1 30,0 L0,74 Z" fill="${c}"/><circle r="22" fill="#fff"/>${txt(g.texto, 0, 1, 22, `fill="${c}"`)}` }; break;
    case 'circulo-texto': { const cc = g.color ?? c; const rr = Math.max(34, ancho(g.texto, 26) / 2 + 12); r = { cajas: [-rr - 4, -rr - 4, 2 * rr + 8, 2 * rr + 8], ancla: [0, 0], svg: `<circle r="${rr}" fill="#fff" fill-opacity=".85" stroke="${cc}" stroke-width="6"/>${txt(g.texto, 0, 1, 26, `fill="${cc}"`)}` }; break; }
    case 'texto': {
      const w = Math.max(40, ancho(g.texto, 40) + 10);
      let extra = '';
      if (g.sub) extra += txt(g.sub, 0, 48, 34, `fill="${c}"`);
      if (g.bajo === 'helice') extra += `<path d="M0,40 C-12,24 -34,28 -34,40 C-34,52 -12,56 0,40 C12,24 34,28 34,40 C34,52 12,56 0,40 Z" fill="${c}"/>`;
      if (g.bajo === 'lazo') extra += `<path d="M-30,28 L0,40 L-30,52 Z M30,28 L0,40 L30,52 Z" fill="${c}"/>`;
      r = { cajas: [-w / 2, -26, w, g.sub || g.bajo ? 92 : 52], ancla: [0, 0], svg: `${txt(g.texto, 0, 0, 40, `fill="${c}" stroke="#fff" stroke-width="5" paint-order="stroke"`)}${extra}` };
      break;
    }
    case 'triangulo': {
      let i = '';
      if (g.interior === 'diagonal') i = `<path d="M-30,24 L20,-8" ${tr}/>`;
      if (g.interior === 'punto') i = `<circle cy="8" r="10" fill="${c}"/>`;
      if (g.interior === 'estrella4') i = `<path d="M0,-10 Q3,5 16,8 Q3,11 0,26 Q-3,11 -16,8 Q-3,5 0,-10 Z" fill="${c}"/>`;
      if (g.interior === 'nbq') i = `<circle cx="-11" cy="-2" r="6" fill="${c}"/><circle cx="11" cy="-2" r="6" fill="${c}"/><path d="M-7,2 Q4,8 6,24 M7,2 Q-4,8 -6,24" stroke="${c}" stroke-width="3" fill="none"/>`;
      if (g.interior === 'puas') { let d = ''; for (let k = 0; k <= 4; k++) { const t = k / 4; d += `M${(-40 * t).toFixed(1)},${(-36 + 70 * t).toFixed(1)} l-10,-6 M${(40 * t).toFixed(1)},${(-36 + 70 * t).toFixed(1)} l10,-6 M${(-40 + 20 * k).toFixed(1)},34 l0,10 `; } i = `<path d="${d}" stroke="${c}" stroke-width="3"/>`; }
      r = { cajas: [-54, -46, 108, 96], ancla: [0, 10], svg: `<path d="M0,-38 L42,34 L-42,34 Z" fill="#fff" fill-opacity=".85" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>${i}` };
      break;
    }
    case 'cruz': r = { cajas: [-44, -44, g.texto ? 150 : 88, 88], ancla: [0, 0], svg: `<path d="M-40,0 H40 M0,-40 V40" ${tr}/>${g.punto ? `<circle r="9" fill="${c}"/>` : ''}${g.texto ? `<text x="18" y="-14" font-size="26" font-family="Arial" font-weight="bold" fill="${c}">${esc(g.texto)}</text>` : ''}` }; break;
    case 'x': r = { cajas: [-36, -36, g.texto ? 150 : 72, 72], ancla: [0, 0], svg: `<path d="M-30,-30 L30,30 M-30,30 L30,-30" ${tr}/>${g.texto ? `<text x="36" y="-10" font-size="26" font-family="Arial" font-weight="bold" fill="${c}">${esc(g.texto)}</text>` : ''}` }; break;
    case 'circulo-x': r = { cajas: [-40, -40, 80, 80], ancla: [0, 0], svg: `<circle r="35" fill="#fff" fill-opacity=".7" ${tr}/><path d="M-25,-25 L25,25 M-25,25 L25,-25" ${tr}/>` }; break;
    case 'contacto': r = { cajas: [-42, -42, 84, 84], ancla: [0, 0], svg: `<rect x="-38" y="-38" width="76" height="76" fill="#fff" fill-opacity=".8" stroke="${c}" stroke-width="5"/><rect x="-26" y="-26" width="52" height="52" fill="none" stroke="${c}" stroke-width="3"/>` }; break;
    case 'estrella': { let d = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 16 : 40; d += `${k ? 'L' : 'M'}${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`; } r = { cajas: [-44, -44, 88, 84], ancla: [0, 0], svg: `<path d="${d}Z" fill="#fff" fill-opacity=".8" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>` }; break; }
    case 'estrella4': r = { cajas: [-46, -46, 92, 92], ancla: [0, 0], svg: `<path d="M0,-42 Q8,-8 42,0 Q8,8 0,42 Q-8,8 -42,0 Q-8,-8 0,-42 Z" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="9 6"/>${txt(g.texto, 0, 1, 22, `fill="${c}"`)}` }; break;
    case 'especial': r = { cajas: [-40, -40, 80, 80], ancla: [0, 0], svg: `<path d="M-36,-36 L36,36 M-36,36 L36,-36 M0,-36 V36" ${tr}/><circle r="13" fill="${c}"/>` }; break;
    case 'aerodromo': r = { cajas: [-46, -30, 92, 60], ancla: [0, 0], svg: `<path d="M-44,0 H44 M-34,22 L34,-22" ${tr}/>` }; break;
    case 'peine': r = { cajas: [-46, -24, 92, 34], ancla: [0, 0], svg: `<path d="M-40,0 H40 M-40,0 V-16 M-24,0 V-16 M-8,0 V-16 M8,0 V-16 M24,0 V-16 M40,0 V-16" ${tr}/>` }; break;
    case 'rombo': r = { cajas: [-30, -30, 60, 60], ancla: [0, 0], svg: `<path d="M0,-24 L24,0 L0,24 L-24,0 Z" fill="${c}"/>` }; break;
    case 'pup': r = { cajas: [-40, -40, 160, 80], ancla: [0, 0], svg: `<circle r="36" fill="#fff" fill-opacity=".7" ${tr}/><path d="M-22,-12 L0,0 L-22,12 Z M22,-12 L0,0 L22,12 Z" fill="none" stroke="${c}" stroke-width="3"/><text x="42" y="10" font-size="28" font-family="Arial" font-weight="bold" fill="${c}">PUP</text>` }; break;
    case 'uas': r = { cajas: [-40, -24, 80, 48], ancla: [0, 0], svg: `<path d="M-36,-14 L0,6 L36,-14 L36,0 L0,20 L-36,0 Z" fill="${c}"/>` }; break;
    case 'vtol': r = { cajas: [-36, -36, 72, 72], ancla: [0, 0], svg: `<path d="M-30,-30 L0,-10 L30,-30 L30,30 L0,10 L-30,30 Z" fill="${c}"/><path d="M-30,-2 L0,16 L30,-2" stroke="#fff" stroke-width="4" fill="none"/>` }; break;
    case 'persona': r = { cajas: [-30, -40, 60, 80], ancla: [0, 0], svg: `<circle cy="-24" r="10" fill="${c}"/><path d="M0,-14 V14 M-22,-8 L0,0 L22,-8 M0,14 L-14,34 M0,14 L14,34" stroke="${c}" stroke-width="5" fill="none"/>` }; break;
    case 'mina': {
      const relleno = g.variante === '' ? '#fff' : c;
      let e = '';
      if (g.variante === 'ap' || g.variante === 'ap-dir') e += `<path d="M-14,-14 L-30,-36 M14,-14 L30,-36" ${tr}/>`;
      if (g.variante === 'ap-dir') e += `<path d="M24,0 H52" stroke="${c}" stroke-width="3" stroke-dasharray="6 4"/><path d="M60,0 l-10,-6 v12 z" fill="${c}"/>`;
      if (g.variante === 'cc-ahd') e += `<path d="M0,20 V40 L-6,34" ${tr}/>`;
      if (g.variante === 'cc-zona') e += `<path d="M-14,14 L-26,32 L-34,20 M14,14 L26,32 L34,20" ${tr}/>`;
      r = { cajas: [-40, -40, g.variante === 'ap-dir' ? 104 : 80, 84], ancla: [0, 0], svg: `<circle r="20" fill="${relleno}" stroke="${c}" stroke-width="4"/>${e}` };
      break;
    }
    case 'trampa': r = { cajas: [-30, -46, 60, 82], ancla: [0, 20], svg: `<path d="M-20,20 L0,-40 L20,20" ${tr}/><ellipse cy="20" rx="22" ry="10" ${tr}/>` }; break;
    case 'tetraedro': {
      const d = 'M-34,0 L-18,-28 L18,-28 L34,0 Z';
      const s = g.variante === 'fijo' ? `<path d="${d}" fill="${c}"/>` : g.variante === 'movil' ? `<path d="M-30,0 L-16,-28 L16,-28 L30,0" stroke="${c}" stroke-width="7" fill="none"/>` : `<path d="${d}" ${tr}/><path d="M0,-2 l-8,14 h16z" fill="${c}"/>`;
      r = { cajas: [-38, -32, 76, 46], ancla: [0, 0], svg: s };
      break;
    }
    case 'torre': r = { cajas: [-30, -48, 60, 64], ancla: [0, 8], svg: g.alta ? `<path d="M-22,8 Q-6,0 -2,-44 M22,8 Q6,0 2,-44" stroke="${c}" stroke-width="5" fill="none"/><circle cy="0" r="6" fill="${c}"/>` : `<path d="M-20,8 L0,-44 L20,8" stroke="${c}" stroke-width="5" fill="none"/><circle cy="0" r="6" fill="${c}"/>` }; break;
    case 'refugio': {
      let e = '';
      if (g.variante === 'superficie') e = `<path d="M-34,26 H34" stroke="${c}" stroke-width="4"/>`;
      if (g.variante === 'subterraneo') e = `<path d="M-34,-26 H34" stroke="${c}" stroke-width="4"/>`;
      r = { cajas: [-38, -30, 76, 60], ancla: [0, 0], svg: `<rect x="-24" y="-24" width="48" height="48" fill="${c}"/>${e}` };
      break;
    }
    case 'fuerte': r = { cajas: [-44, -44, 88, 88], ancla: [0, 0], svg: `<rect x="-26" y="-26" width="52" height="52" ${tr}/><path d="M-26,-26 L-40,-40 M26,-26 L40,-40 M26,26 L40,40 M-26,26 L-40,40" ${tr}/>` }; break;
    case 'campo-minas': {
      const marco = g.dinamico ? 'M-46,-10 L-30,-26 H30 L46,-10 V10 L30,26 H-30 L-46,10 Z' : 'M-46,-24 H46 V24 H-46 Z';
      r = { cajas: [-50, -30, 100, 60], ancla: [0, 0], svg: `<path d="${marco}" fill="#fff" fill-opacity=".85" stroke="${c}" stroke-width="4"/><circle cx="-22" r="9" fill="${c}"/><circle r="9" fill="${c}"/><circle cx="22" r="9" fill="${c}"/>` };
      break;
    }
    case 'nbq': {
      const hach = g.lluvia ? `<path d="M-28,-26 L-10,8 M-12,-26 L2,4 M4,-26 L14,-6 M20,-26 L24,-18" stroke="${c}" stroke-width="2"/>` : '';
      r = { cajas: [-46, -44, 92, 96], ancla: [0, 44], svg: `<path d="M-42,-36 H42 L0,44 Z" fill="#fff" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>${hach}<circle cx="-11" cy="-2" r="6" fill="${c}"/><circle cx="11" cy="-2" r="6" fill="${c}"/><path d="M-7,2 Q4,8 6,24 M7,2 Q-4,8 -6,24" stroke="${c}" stroke-width="3" fill="none"/>${txt(g.letra, 0, -22, 18, `fill="${c}"`)}${g.abajo ? txt(g.abajo, 0, 32, 14, `fill="${c}"`) : ''}` };
      break;
    }
    default: r = marcador({ texto: '?' }, c);
  }
  const [x, y, w, h] = r.cajas;
  const k = tam / 100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * k).toFixed(1)}" height="${(h * k).toFixed(1)}" viewBox="${x} ${y} ${w} ${h}">${r.svg}</svg>`;
  return { svg, ancho: w * k, alto: h * k, ancla: { x: (r.ancla[0] - x) * k, y: (r.ancla[1] - y) * k } };
}

/** Glifos que van dentro de una zona (aeródromo, NBQR, PSYOPS). */
export function glifoZona(m, color, tam = 34) {
  if (m.glifo === 'nbq') return glifoPunto({ tipo: 'nbq', letra: m.letra, abajo: m.letra2 }, color, tam);
  if (m.glifo === 'aerodromo') return glifoPunto({ tipo: 'aerodromo' }, color, tam);
  if (m.glifo === 'psyops') {
    const k = tam / 100;
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${(60 * k).toFixed(1)}" height="${(44 * k).toFixed(1)}" viewBox="-30 -22 60 44"><path d="M-24,-10 h12 l16,-10 v40 l-16,-10 h-12 z" fill="${color}"/><path d="M10,-12 l12,-6 M10,0 h14 M10,12 l12,6" stroke="${color}" stroke-width="3"/></svg>`;
    return { svg: s, ancho: 60 * k, alto: 44 * k, ancla: { x: 30 * k, y: 22 * k } };
  }
  return null;
}
