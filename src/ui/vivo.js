// Interfaz «viva» (como el Dock del Mac y el iPhone):
//   - Lupa: al pasar el ratón por una barra, los iconos crecen con suavidad;
//     el de debajo más y los vecinos un poco.
//   - Etiqueta: el nombre de cada botón solo aparece al pasar el ratón, en una
//     píldora de vidrio que entra con un pequeño bote.
//   - Reordenar: mantener pulsado un botón y arrastrarlo a lo largo de su
//     barra. Los demás se apartan; al soltar, se queda (y se recuerda).

const SOBRE = 1.42;     // los iconos se dibujan a este tamaño y se encogen: así nunca salen borrosos al crecer
const RADIO = 92;      // px de alcance de la lupa
const ESPERA_REORDENAR = 380;

/**
 * Lupa sobre los botones de una barra.
 * @param {HTMLElement} barra
 * @param {{eje:'x'|'y', max?:number, selector?:string}} o
 */
export function lupa(barra, { eje = 'x', max = 1.42, selector = 'button' } = {}) {
  let raf = 0, ultimo = null;
  const pintar = () => {
    raf = 0;
    const botones = [...barra.querySelectorAll(selector)];
    for (const b of botones) {
      const ico = b.querySelector('svg'); if (!ico) continue;
      if (!ultimo || barra.classList.contains('reordenando')) { ico.style.transform = ''; continue; }
      const r = b.getBoundingClientRect();
      const c = eje === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
      const d = (eje === 'x' ? ultimo.x : ultimo.y) - c;
      const f = Math.exp(-(d * d) / (2 * (RADIO / 2.2) ** 2));
      ico.style.transform = `scale(${((1 + (max - 1) * f) / SOBRE).toFixed(3)})`;
    }
  };
  const pedir = () => { if (!raf) raf = requestAnimationFrame(pintar); };
  barra.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; ultimo = { x: e.clientX, y: e.clientY }; pedir(); });
  barra.addEventListener('pointerleave', () => { ultimo = null; pedir(); });
}

// ---------------------------------------------------------- etiqueta flotante (una para toda la página)
let etiqueta = null, tEtq = 0;
function crearEtiqueta() {
  etiqueta = document.createElement('div');
  etiqueta.className = 'etiqueta-flotante vidrio';
  etiqueta.setAttribute('role', 'tooltip');
  document.body.append(etiqueta);
}
/**
 * Nombre del botón al pasar el ratón: debajo (barra de arriba) o a la derecha (barra lateral).
 * El texto sale de su <span> o de aria-label.
 */
export function etiquetas(barra, { lado = 'abajo', selector = 'button' } = {}) {
  barra.addEventListener('pointerover', (e) => {
    const b = e.target.closest(selector); if (!b || !barra.contains(b) || e.pointerType !== 'mouse') return;
    if (barra.classList.contains('reordenando')) return;
    const texto = b.querySelector('span')?.textContent?.trim() || b.getAttribute('aria-label') || '';
    if (!texto) return;
    if (!etiqueta) crearEtiqueta();
    clearTimeout(tEtq);
    etiqueta.textContent = texto;
    etiqueta.dataset.lado = lado;
    const r = b.getBoundingClientRect();
    const k = Number(getComputedStyle(document.documentElement).getPropertyValue('--escala-ui')) || 1;
    if (lado === 'abajo') { etiqueta.style.left = `${(r.left + r.width / 2) / k}px`; etiqueta.style.top = `${(r.bottom + 8) / k}px`; }
    else { etiqueta.style.left = `${(r.right + 10) / k}px`; etiqueta.style.top = `${(r.top + r.height / 2) / k}px`; }
    etiqueta.classList.remove('visible'); void etiqueta.offsetWidth; etiqueta.classList.add('visible');
  });
  barra.addEventListener('pointerout', (e) => {
    const b = e.target.closest(selector); if (!b || b.contains(e.relatedTarget)) return;
    tEtq = setTimeout(() => etiqueta?.classList.remove('visible'), 80);
  });
  barra.addEventListener('pointerdown', () => etiqueta?.classList.remove('visible'));
}

/**
 * Reordenar manteniendo pulsado. `clave`: dónde se guarda el orden.
 * Los botones se identifican por data-herr, data-dock o id.
 * Con grupos (la barra de herramientas), un botón puede pasar de un grupo a otro.
 */
export function reordenable(barra, { clave, eje = 'x', grupos = null, alCambiar = () => {} }) {
  const idDe = (b) => b.dataset.herr || b.dataset.dock || b.id;
  const contenedores = () => (grupos ? [...barra.querySelectorAll(grupos)] : [barra]);
  // Orden guardado
  try {
    const g = JSON.parse(localStorage.getItem(clave) || 'null');
    if (Array.isArray(g)) {
      const todos = new Map([...barra.querySelectorAll('button')].map((b) => [idDe(b), b]));
      const cs = contenedores();
      g.forEach((lista, i) => { const c = cs[i]; if (!c || !Array.isArray(lista)) return; for (const id of lista) { const b = todos.get(id); if (b) c.append(b); } });
      for (const c of cs) if (!c.querySelector('button')) c.hidden = true;
    }
  } catch { /* nada */ }
  const guardar = () => { try { localStorage.setItem(clave, JSON.stringify(contenedores().map((c) => [...c.querySelectorAll('button')].map(idDe)))); } catch { /* nada */ } };

  let pulsado = null; // { b, p0, L0, t, activo }
  // Posición «de maqueta» (sin translate ni animaciones): offsetLeft/Top respecto a la barra
  const pos = (el) => (eje === 'x' ? el.offsetLeft : el.offsetTop);
  const tam = (el) => (eje === 'x' ? el.offsetWidth : el.offsetHeight);
  barra.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button'); if (!b || e.button !== 0 || !barra.contains(b)) return;
    pulsado = { b, x0: e.clientX, y0: e.clientY, p0: eje === 'x' ? e.clientX : e.clientY, L0: pos(b), activo: false };
    pulsado.t = setTimeout(() => empezar(e.pointerId), ESPERA_REORDENAR);
  });
  function empezar(id) {
    if (!pulsado) return;
    pulsado.activo = true;
    barra.classList.add('reordenando');
    pulsado.b.classList.add('levantado');
    try { pulsado.b.setPointerCapture(id); } catch { /* nada */ }
    navigator.vibrate?.(8);
  }
  window.addEventListener('pointermove', (e) => {
    if (!pulsado) return;
    if (!pulsado.activo) { if (Math.hypot(e.clientX - pulsado.x0, e.clientY - pulsado.y0) > 6) { clearTimeout(pulsado.t); pulsado = null; } return; }
    const { b } = pulsado;
    const k = Number(getComputedStyle(document.documentElement).getPropertyValue('--escala-ui')) || 1;
    const deseado = pulsado.L0 + ((eje === 'x' ? e.clientX : e.clientY) - pulsado.p0) / k; // dónde debería estar (px de maqueta)
    const centro = deseado + tam(b) / 2;
    const lista = [...barra.querySelectorAll('button')].filter((x) => !x.closest('[hidden]') || x === b);
    const otros = lista.filter((x) => x !== b);
    const destino = otros.find((o) => pos(o) + tam(o) / 2 > centro) ?? null;
    const iB = lista.indexOf(b), iD = destino ? lista.indexOf(destino) : lista.length;
    if (iD !== iB + 1 && !(destino === null && iB === lista.length - 1)) {
      const antes = new Map(otros.map((x) => [x, pos(x)]));
      if (destino) destino.before(b); else otros.at(-1)?.after(b);
      for (const [x, p0] of antes) { const dd = p0 - pos(x); if (dd) x.animate([{ translate: eje === 'x' ? `${dd}px 0` : `0 ${dd}px` }, { translate: '0 0' }], { duration: 280, easing: 'cubic-bezier(.34,1.45,.64,1)' }); }
    }
    const t = deseado - pos(b);
    b.style.translate = eje === 'x' ? `${t}px 0` : `0 ${t}px`;
  });
  const soltar = () => {
    if (!pulsado) return;
    clearTimeout(pulsado.t);
    const { b, activo } = pulsado; pulsado = null;
    if (!activo) return;
    const t = b.style.translate || '0 0';
    b.style.translate = '';
    b.animate([{ translate: t }, { translate: '0 0' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    b.classList.remove('levantado');
    barra.classList.remove('reordenando');
    for (const c of contenedores()) c.hidden = !c.querySelector('button');
    guardar(); alCambiar();
    // Que el soltar no cuente como clic
    const parar = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', parar, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', parar, { capture: true }), 50);
  };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
}

/**
 * Selector segmentado: la pastilla blanca se desliza desde el botón anterior al nuevo
 * (muelle, sin duración fija). La pastilla es el ::before del botón pulsado.
 */
export function deslizador(raiz = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SEL = '.seg, .sim-pestanas';
  const previo = new WeakMap();
  const marcar = (e) => { const g = e.target.closest?.(SEL); if (!g) return; previo.set(g, g.querySelector('button[aria-pressed="true"]')?.getBoundingClientRect() ?? null); };
  raiz.addEventListener('pointerdown', marcar, true);
  new MutationObserver((lista) => {
    for (const m of lista) {
      const b = m.target; if (b.getAttribute('aria-pressed') !== 'true') continue;
      const g = b.closest(SEL); const antes = g && previo.get(g); if (!antes) continue;
      previo.delete(g);
      const ahora = b.getBoundingClientRect(); if (!ahora.width) continue;
      const dx = antes.left - ahora.left, sx = antes.width / ahora.width;
      b.animate([{ transform: `translateX(${dx}px) scaleX(${sx})` }, { transform: 'none' }],
        { duration: 420, easing: 'linear(0 0%, .1141 8.3%, .3199 16.7%, .5154 25%, .67 33.3%, .7822 41.7%, .8594 50%, .9107 58.3%, .9441 66.7%, .9653 75%, .9787 83.3%, .987 91.7%, 1)', pseudoElement: '::before' });
    }
  }).observe(raiz.body ?? raiz, { attributes: true, attributeFilter: ['aria-pressed'], subtree: true });
}
