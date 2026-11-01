// Perfil de altura sencillo (SVG). Al pasar el ratón muestra distancia y
// altitud, y avisa para marcar ese punto en el mapa.

const fmtKm = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);

/**
 * Pinta el perfil en `caja`.
 * @param {HTMLElement} caja
 * @param {Array<{d:number, z:number|null, lat:number, lon:number}>} m muestras
 * @param {(p:{lat,lon,d,z}|null)=>void} alMover
 */
export function pintarPerfil(caja, m, alMover = () => {}) {
  const v = m.filter((x) => x.z !== null);
  if (v.length < 2) { caja.innerHTML = '<p class="perfil-vacio">Sin datos de altura en esta zona.</p>'; return; }
  const W = 320, H = 118, ml = 34, mr = 8, mt = 8, mb = 18;
  const dMax = m.at(-1).d || 1;
  let zMin = Math.min(...v.map((x) => x.z)), zMax = Math.max(...v.map((x) => x.z));
  const marg = Math.max(5, (zMax - zMin) * 0.12); zMin = Math.floor(zMin - marg); zMax = Math.ceil(zMax + marg);
  const X = (d) => ml + ((W - ml - mr) * d) / dMax;
  const Y = (z) => mt + ((H - mt - mb) * (zMax - z)) / (zMax - zMin);
  // Tramos continuos (se corta donde no hay datos)
  const tramos = []; let act = [];
  for (const x of m) { if (x.z === null) { if (act.length) tramos.push(act); act = []; } else act.push(x); }
  if (act.length) tramos.push(act);
  const linea = tramos.map((t) => `M${t.map((x) => `${X(x.d).toFixed(1)},${Y(x.z).toFixed(1)}`).join('L')}`).join('');
  const area = tramos.map((t) => `M${X(t[0].d).toFixed(1)},${H - mb}L${t.map((x) => `${X(x.d).toFixed(1)},${Y(x.z).toFixed(1)}`).join('L')}L${X(t.at(-1).d).toFixed(1)},${H - mb}Z`).join('');
  const marcas = [zMin, Math.round((zMin + zMax) / 2), zMax];
  caja.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="perfil-svg" role="img" aria-label="Perfil de altura">
    ${marcas.map((z) => `<line x1="${ml}" x2="${W - mr}" y1="${Y(z)}" y2="${Y(z)}" class="pf-rej"/><text x="${ml - 4}" y="${Y(z) + 3.5}" class="pf-z">${z}</text>`).join('')}
    <path d="${area}" class="pf-area"/><path d="${linea}" class="pf-linea"/>
    <text x="${ml}" y="${H - 4}" class="pf-d">0</text><text x="${W - mr}" y="${H - 4}" class="pf-d" text-anchor="end">${fmtKm(dMax)}</text>
    <g class="pf-cursor" visibility="hidden"><line y1="${mt}" y2="${H - mb}"/><circle r="3.5"/><text class="pf-lectura" y="${mt + 9}"></text></g>
    <rect x="${ml}" y="0" width="${W - ml - mr}" height="${H}" fill="transparent" class="pf-zona"/></svg>`;
  const svg = caja.querySelector('svg'), cur = svg.querySelector('.pf-cursor');
  const mover = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const d = ((x - ml) / (W - ml - mr)) * dMax;
    let mejor = null;
    for (const s of m) if (s.z !== null && (!mejor || Math.abs(s.d - d) < Math.abs(mejor.d - d))) mejor = s;
    if (!mejor) return;
    const cx = X(mejor.d), cy = Y(mejor.z);
    cur.setAttribute('visibility', 'visible');
    cur.querySelector('line').setAttribute('x1', cx); cur.querySelector('line').setAttribute('x2', cx);
    cur.querySelector('circle').setAttribute('cx', cx); cur.querySelector('circle').setAttribute('cy', cy);
    const t = cur.querySelector('text');
    t.textContent = `${fmtKm(mejor.d)} · ${Math.round(mejor.z)} m`;
    t.setAttribute('x', cx > W / 2 ? cx - 6 : cx + 6); t.setAttribute('text-anchor', cx > W / 2 ? 'end' : 'start');
    alMover(mejor);
  };
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerleave', () => { cur.setAttribute('visibility', 'hidden'); alMover(null); });
}
