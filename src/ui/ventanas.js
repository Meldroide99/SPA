// Ventanas flotantes (paneles con clase .ventana y data-ventana="id"):
//
//   - Se mueven arrastrando su cabecera (el primer hijo) y cambian de tamaño
//     desde cualquier borde o esquina (la zona de agarre sobresale un poco por
//     fuera, para no chocar con la barra de desplazamiento). Cada usuario
//     guarda lo suyo. Doble clic en la cabecera: a su sitio y tamaño.
//   - Sin usar unos segundos se recogen despacio (solo queda la cabecera; Capas,
//     solo su icono) y dejan ver el mapa; al pasar el ratón se abren. La
//     chincheta las deja fijas.
//   - Mientras se ponen objetos en el mapa se vuelven casi transparentes y
//     dejan pinchar el mapa a través; para usar una, ratón quieto encima.
//
// El contenido se adapta al tamaño con «container queries» (mapa.css).

const CLAVE = 'spa.ventanas';
const MIN_W = 200, MIN_H = 90;
const ESPERA_DESPERTAR = 420; // ms quieto encima para usar una ventana apartada
const ESPERA_ABRIR = 160;     // ms encima de una recogida para abrirla
const BORDE_FUERA = 8, BORDE_DENTRO = 4; // px de la zona para cambiar el tamaño
const T_DESVANECER = 650, T_ENCOGER = 900, T_ABRIR = 420; // recoger y abrir, suave
const CURVA = 'cubic-bezier(.22,.8,.24,1)';

/**
 * @param {object} o
 * @param {() => number} o.reposo segundos sin uso para recogerse (0: nunca)
 * @param {() => boolean} o.apartar ¿apartar al poner objetos?
 * @param {() => boolean} o.colocando ¿se está poniendo algo en el mapa?
 * @param {() => number} [o.escala] zoom de la interfaz (Ajustes › Tamaño)
 * @param {() => void} [o.alCambiar] tras mover, redimensionar, recoger o abrir
 */
export function iniciarVentanas({ reposo, apartar, colocando, escala = () => 1, alCambiar = () => {} }) {
  const cont = document.getElementById('contenido');
  let guardado = {};
  try { guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { guardado = {}; }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(guardado)); } catch { /* nada */ } };
  const ventanas = () => [...document.querySelectorAll('.ventana[data-ventana]')];
  const visibles = () => ventanas().filter((v) => !v.hidden && v.offsetParent !== null);
  const info = new WeakMap(); // ventana → { ultimo, tAbrir, tGracia, anim, tPlegar }
  const datos = (v) => { if (!info.has(v)) info.set(v, { ultimo: performance.now(), tAbrir: 0 }); return info.get(v); };
  const fijada = (v) => Boolean(guardado[v.dataset.ventana]?.fija);
  const cabecera = (v) => v.firstElementChild;
  const recogida = (v) => v.classList.contains('v-recogida') || v.classList.contains('v-plegando');

  // ---------------------------------------------------------- posición y tamaño guardados
  function limitar(v, g) {
    const c = cont.getBoundingClientRect();
    const w = Math.min(g.w ?? v.getBoundingClientRect().width, c.width - 8);
    const x = Math.max(4, Math.min(g.x, c.width - Math.min(w, 120)));
    const y = Math.max(4, Math.min(g.y, c.height - 40));
    return { ...g, x, y };
  }
  function aplicar(v) {
    const g = guardado[v.dataset.ventana];
    const k = escala();
    v.classList.toggle('v-fija', Boolean(g?.fija));
    if (!g || g.x === undefined) { v.classList.remove('v-movida'); v.style.left = v.style.top = v.style.right = v.style.bottom = ''; }
    else {
      const p = limitar(v, g);
      Object.assign(v.style, { left: `${p.x / k}px`, top: `${p.y / k}px`, right: 'auto', bottom: 'auto' });
      v.classList.add('v-movida');
    }
    if (v.classList.contains('v-recogida')) return; // recogida: su tamaño es el de la cabecera
    if (g?.w) { v.style.width = `${g.w / k}px`; v.style.maxWidth = 'none'; } else { v.style.width = ''; v.style.maxWidth = ''; }
    // El alto elegido es un tope: si el contenido es menor (desplegables cerrados), la ventana encoge sola
    if (g?.h) { v.style.height = ''; v.style.maxHeight = `${Math.min(g.h, cont.getBoundingClientRect().height - (limitar(v, g).y ?? 0) - 8) / k}px`; v.classList.add('v-alto'); }
    else {
      v.style.height = ''; v.classList.remove('v-alto');
      // Movida: que no se salga por abajo (el alto que quede hasta el borde)
      v.style.maxHeight = g?.x !== undefined ? `${Math.max(120, cont.getBoundingClientRect().height - limitar(v, g).y - 12) / k}px` : '';
    }
  }
  const aplicarTodas = () => { ventanas().forEach(aplicar); apilar(); };

  // ---------------------------------------------------------- colocación automática de las no movidas
  // Izquierda: una al lado de otra. Derecha: Capas arriba y la ficha y la regla debajo.
  // Izquierda: los paneles de la barra lateral (en su orden) y después el resto. Derecha: la ficha y la regla.
  const dock = document.getElementById('dock');
  const ordenIzq = () => [...(dock ? [...dock.querySelectorAll('[data-dock]')].map((b) => b.dataset.dock) : []), 'simbolos', 'lazo', 'creador'];
  const DER = ['ficha', 'regla'];
  let tApilar = 0;
  function apilar() {
    const c = cont.getBoundingClientRect(); const k = escala();
    if (c.width <= 760) { for (const v of ventanas()) if (!v.classList.contains('v-movida')) { v.style.left = v.style.top = v.style.right = v.style.maxHeight = ''; } return; }
    const sup = parseFloat(getComputedStyle(cont).getPropertyValue('--sup')) || 64;
    const supIzq = parseFloat(getComputedStyle(cont).getPropertyValue('--sup-izq')) || sup + 54;
    const libres = (lista) => lista.map((id) => document.querySelector(`.ventana[data-ventana="${id}"]`)).filter((v) => v && !v.hidden && !v.classList.contains('v-movida'));
    let x = dock ? dock.getBoundingClientRect().right - c.left + 8 : 12;
    // Ancho y alto reales, sin el encogimiento de la animación de apertura
    // (la posición sale de su left/top, no del dibujo: mientras se abre, el dibujo está desplazado y encogido)
    const caja = (v) => { const r = v.getBoundingClientRect(), e = parseFloat(getComputedStyle(v).scale) || 1, l = parseFloat(v.style.left), t = parseFloat(v.style.top); return { l: Number.isFinite(l) ? l * k : r.left - c.left, t: Number.isFinite(t) ? t * k : r.top - c.top, w: r.width / e, h: r.height / e }; };
    // Obstáculos: ventanas que el usuario dejó en un sitio (arrastradas). Las nuevas buscan hueco y nunca se ponen encima.
    const ocupado = ventanas().filter((v) => !v.hidden && v.classList.contains('v-movida')).map(caja);
    for (const v of libres(ordenIzq())) {
      // Los de la barra lateral salen de su botón: el giro de la animación nace a su altura
      const b = dock?.querySelector(`[data-dock="${v.dataset.ventana}"]`);
      if (b) { const rb = b.getBoundingClientRect(); v.style.setProperty('--origen-y', `${(rb.top + rb.height / 2 - c.top - supIzq) / k}px`); }
      if (!v.classList.contains('v-alto') && !recogida(v)) v.style.maxHeight = `${Math.max(160, c.height - supIzq - 64) / k}px`;
      const { w, h } = caja(v);
      for (let i = 0; i < 20; i++) {
        const choque = ocupado.find((o) => x < o.l + o.w + 4 && x + w > o.l - 4 && supIzq < o.t + o.h && supIzq + h > o.t);
        if (!choque) break;
        x = choque.l + choque.w + 8;
      }
      v.style.left = `${x / k}px`; v.style.top = `${supIzq / k}px`; v.style.right = 'auto';
      ocupado.push({ l: x, t: supIzq, w, h });
      x += w + 8;
    }
    let y = sup, derecha = 12, anchoCol = 0;
    for (const v of libres(DER)) {
      // Sin sitio debajo: otra columna a la izquierda, arriba
      if (y > sup && c.height - y - 64 < 260) { derecha += anchoCol + 10; y = sup; anchoCol = 0; }
      v.style.top = `${y / k}px`; v.style.right = `${derecha / k}px`; v.style.left = 'auto';
      if (!recogida(v) && !v.classList.contains('v-alto')) v.style.maxHeight = `${Math.max(140, c.height - y - 64) / k}px`;
      const r = v.getBoundingClientRect();
      y += r.height + 10; anchoCol = Math.max(anchoCol, r.width);
    }
  }
  const pedirApilar = () => { cancelAnimationFrame(tApilar); tApilar = requestAnimationFrame(apilar); };
  const ro = new ResizeObserver(pedirApilar);
  // Una ventana que se acaba de abrir se ve entera un momento aunque se esté poniendo algo en el mapa
  const recienAbierta = (v) => { v.classList.add('v-despierta'); clearTimeout(datos(v).tGracia); datos(v).tGracia = setTimeout(() => { datos(v).tGracia = 0; if (!v.matches(':hover')) v.classList.remove('v-despierta'); }, 2500); };
  for (const v of ventanas()) {
    ro.observe(v);
    let antes = v.hidden;
    new MutationObserver(() => {
      pedirApilar();
      if (!v.hidden) {
        datos(v).ultimo = performance.now();
        if (antes) {
          recoger(v, false, { sinAnimar: true }); recienAbierta(v);
        }
      }
      antes = v.hidden;
    }).observe(v, { attributes: true, attributeFilter: ['hidden'] });
  }

  // Al tocar una ventana, se pone delante
  let zMax = 1010;
  document.addEventListener('pointerdown', (e) => { const v = e.target.closest?.('.ventana[data-ventana]'); if (v) v.style.zIndex = String(++zMax); }, true);

  // ---------------------------------------------------------- chincheta (se inyecta en la cabecera)
  const PIN = '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>';
  function ponerChincheta(v) {
    const cab = cabecera(v);
    if (!cab || cab.querySelector('.v-pin') || v.dataset.ventana === 'creador') return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'v-pin'; b.innerHTML = PIN;
    b.setAttribute('aria-pressed', String(fijada(v)));
    b.setAttribute('aria-label', 'Fijar');
    const x = cab.querySelector('.v-x, .pm-x');
    if (x) x.before(b); else cab.append(b);
  }
  const vigilar = new MutationObserver((ms) => { for (const m of ms) { const v = m.target.closest?.('.ventana[data-ventana]'); if (v) ponerChincheta(v); } });
  for (const v of ventanas()) { ponerChincheta(v); vigilar.observe(v, { childList: true }); }

  // ---------------------------------------------------------- bordes para cambiar el tamaño
  /** ¿Está el puntero en el borde (o esquina) de alguna ventana? → { v, dir: 'n'|'s'|'e'|'w'|'ne'… } */
  function bordeEn(x, y) {
    const apartadas = document.body.classList.contains('v-apartadas');
    const lista = visibles().filter((v) => !recogida(v) && !(apartadas && !v.classList.contains('v-despierta')) && getComputedStyle(v).pointerEvents !== 'none').sort((a, b) => (Number(b.style.zIndex) || 1000) - (Number(a.style.zIndex) || 1000));
    for (const v of lista) {
      const r = v.getBoundingClientRect();
      if (x < r.left - BORDE_FUERA || x > r.right + BORDE_FUERA || y < r.top - BORDE_FUERA || y > r.bottom + BORDE_FUERA) continue;
      const n = y < r.top + BORDE_DENTRO, s = y > r.bottom - BORDE_DENTRO, w = x < r.left + BORDE_DENTRO, e = x > r.right - BORDE_DENTRO;
      if (!(n || s || w || e)) return null; // dentro de la ventana: no es borde
      // Solo si lo que hay bajo el puntero es la propia ventana o el mapa (no otra ventana, ni Ajustes, ni un menú)
      const bajo = document.elementFromPoint(x, y);
      if (!bajo || !(v.contains(bajo) || bajo.closest('#mapa'))) continue;
      return { v, dir: `${n ? 'n' : s ? 's' : ''}${w ? 'w' : e ? 'e' : ''}` };
    }
    return null;
  }
  const CURSOR = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' };
  let cursorActual = '';
  function ponerCursor(dir) {
    const c = dir ? CURSOR[dir] : '';
    if (c === cursorActual) return;
    if (cursorActual) document.body.classList.remove(`v-cursor-${cursorActual}`);
    if (c) document.body.classList.add(`v-cursor-${c}`);
    cursorActual = c;
  }

  // ---------------------------------------------------------- arrastrar y redimensionar
  // ---------------------------------------------------------- física (Apple): goma en los bordes, inercia al soltar y muelle
  const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const proyectar = (vel, tasa = 0.99) => (vel / 1000) * tasa / (1 - tasa);           // a dónde iría con esa velocidad
  const goma = (exceso, dim, c = 0.55) => (exceso * dim * c) / (dim + c * Math.abs(exceso)); // cuanto más te pasas, menos sigue
  const limites = (w, h) => { const c = cont.getBoundingClientRect(); return { x0: 4, x1: Math.max(4, c.width - w - 4), y0: 4, y1: Math.max(4, c.height - Math.min(h, 200)), cw: c.width, ch: c.height }; };
  const blando = (p, a, b, dim) => (p < a ? a - goma(a - p, dim) : p > b ? b + goma(p - b, dim) : p);
  const duro = (p, a, b) => Math.min(b, Math.max(a, p));
  function colocar(v, x, y) {
    const k = escala();
    Object.assign(v.style, { left: `${x / k}px`, top: `${y / k}px`, right: 'auto', bottom: 'auto' });
    v.classList.add('v-movida');
  }
  /** Muelle de 2 ejes independientes que parte de la posición y velocidad actuales. Se puede agarrar en cualquier momento. */
  function lanzar(v, desde, hasta, vel) {
    const d = datos(v), id = v.dataset.ventana; cancelAnimationFrame(d.raf);
    const fin = () => { d.raf = 0; v.classList.remove('v-activa'); colocar(v, hasta.x, hasta.y); guardado[id] = { ...guardado[id], x: hasta.x, y: hasta.y }; guardar(); alCambiar(); };
    if (sinMovimiento()) { fin(); return; }
    const z = Math.hypot(vel.x, vel.y) > 400 ? 0.8 : 1, resp = 0.4; // bote solo si venía lanzada
    const K = (2 * Math.PI / resp) ** 2, C = 4 * Math.PI * z / resp;
    const p = { ...desde }, u = { ...vel }; let t0 = performance.now();
    v.classList.add('v-activa');
    const paso = (t) => {
      const dt = Math.min(0.032, (t - t0) / 1000); t0 = t;
      for (const e of ['x', 'y']) { for (let i = 0; i < 2; i++) { const a = -K * (p[e] - hasta[e]) - C * u[e]; u[e] += a * dt / 2; p[e] += u[e] * dt / 2; } }
      if (Math.hypot(p.x - hasta.x, p.y - hasta.y) < 0.5 && Math.hypot(u.x, u.y) < 8) { fin(); return; }
      colocar(v, p.x, p.y);
      d.raf = requestAnimationFrame(paso);
    };
    d.raf = requestAnimationFrame(paso);
  }

  let gesto = null; // { v, modo: 'mover'|'tam', dir, x0, y0, r0, activo }
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const b = bordeEn(e.clientX, e.clientY);
    if (b) {
      e.preventDefault(); e.stopPropagation();
      if (datos(b.v).raf) { cancelAnimationFrame(datos(b.v).raf); datos(b.v).raf = 0; b.v.classList.remove('v-activa'); }
      const r = b.v.getBoundingClientRect(), c = cont.getBoundingClientRect();
      b.v.style.zIndex = String(++zMax);
      gesto = { v: b.v, modo: 'tam', dir: b.dir, x0: e.clientX, y0: e.clientY, r0: { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height }, activo: false };
      empezar(); document.body.dataset.vSoltado = '1';
      return;
    }
    const v = e.target.closest('.ventana[data-ventana]'); if (!v) return;
    const pin = e.target.closest('.v-pin');
    if (pin) {
      const id = v.dataset.ventana;
      guardado[id] = { ...guardado[id], fija: !fijada(v) }; guardar();
      pin.setAttribute('aria-pressed', String(fijada(v))); v.classList.toggle('v-fija', fijada(v));
      if (fijada(v)) abrirRecogida(v);
      e.preventDefault(); return;
    }
    if (e.target.closest('button, input, select, textarea, a, summary, label, [data-arrastrar], .perfil-svg') || !cabecera(v)?.contains(e.target)) return;
    if (datos(v).raf) { cancelAnimationFrame(datos(v).raf); datos(v).raf = 0; v.classList.remove('v-activa'); }
    const r = v.getBoundingClientRect(), c = cont.getBoundingClientRect();
    gesto = { v, modo: 'mover', hist: [], x0: e.clientX, y0: e.clientY, r0: { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height }, activo: false };
  }, true);
  function empezar() {
    gesto.activo = true;
    document.body.classList.add(gesto.modo === 'tam' ? 'v-redimensionando' : 'v-moviendo');
    gesto.v.classList.add('v-activa');
  }
  document.addEventListener('pointermove', (e) => {
    if (!gesto) { ponerCursor(bordeEn(e.clientX, e.clientY)?.dir); return; }
    const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
    if (!gesto.activo) { if (Math.hypot(dx, dy) < 5) return; empezar(); }
    const { v, r0, dir = '' } = gesto, id = v.dataset.ventana;
    if (gesto.modo === 'mover') {
      const L = limites(r0.w, r0.h);
      const x = blando(r0.x + dx, L.x0, L.x1, L.cw), y = blando(r0.y + dy, L.y0, L.y1, L.ch);
      gesto.hist.push({ t: performance.now(), x, y }); if (gesto.hist.length > 8) gesto.hist.shift();
      guardado[id] = { ...guardado[id], x, y };
      colocar(v, x, y); return;
    }
    {
      let { x, y, w, h } = r0;
      if (dir.includes('e')) w = Math.max(MIN_W, r0.w + dx);
      if (dir.includes('s')) h = Math.max(MIN_H, r0.h + dy);
      if (dir.includes('w')) { w = Math.max(MIN_W, r0.w - dx); x = r0.x + r0.w - w; }
      if (dir.includes('n')) { h = Math.max(MIN_H, r0.h - dy); y = r0.y + r0.h - h; }
      guardado[id] = { ...guardado[id], x, y, w, h };
    }
    aplicar(v);
  }, true);
  document.addEventListener('pointerup', () => {
    if (!gesto) return;
    const g = gesto; gesto = null;
    if (g.activo && g.modo === 'mover') document.body.dataset.vSoltado = '1';
    document.body.classList.remove('v-redimensionando', 'v-moviendo');
    g.v.classList.remove('v-activa');
    if (g.activo && g.modo === 'mover' && g.hist.length) {
      const h = g.hist, ult = h[h.length - 1], pri = h.find((m) => ult.t - m.t <= 100) ?? ult;
      const dt = (ult.t - pri.t) / 1000, vel = dt > 0.008 ? { x: (ult.x - pri.x) / dt, y: (ult.y - pri.y) / dt } : { x: 0, y: 0 };
      if (performance.now() - ult.t > 80) { vel.x = 0; vel.y = 0; } // se paró antes de soltar
      const L = limites(g.r0.w, g.r0.h);
      const hasta = { x: duro(ult.x + proyectar(vel.x), L.x0, L.x1), y: duro(ult.y + proyectar(vel.y), L.y0, L.y1) };
      datos(g.v).ultimo = performance.now();
      lanzar(g.v, { x: ult.x, y: ult.y }, hasta, vel);
    } else if (g.activo) { guardar(); datos(g.v).ultimo = performance.now(); alCambiar(); }
    setTimeout(() => { delete document.body.dataset.vSoltado; }, 0);
  }, true);
  // Al soltar tras arrastrar no debe saltar el clic (Capas, el mapa…)
  document.addEventListener('click', (e) => {
    if (document.body.dataset.vSoltado) { delete document.body.dataset.vSoltado; e.stopPropagation(); e.preventDefault(); }
  }, true);
  // Doble clic en la cabecera: a su sitio
  document.addEventListener('dblclick', (e) => {
    const v = e.target.closest('.ventana[data-ventana]'); if (!v || !cabecera(v)?.contains(e.target) || e.target.closest('button, input')) return;
    const { fija } = guardado[v.dataset.ventana] ?? {};
    guardado[v.dataset.ventana] = fija ? { fija } : {}; guardar(); aplicar(v); alCambiar();
  });
  window.addEventListener('resize', aplicarTodas);

  // ---------------------------------------------------------- recogerse sin uso (despacio) y abrirse
  function recoger(v, si, { sinAnimar = false } = {}) {
    const d = datos(v);
    if (si === recogida(v) && !d.anim) return;
    d.anim?.cancel(); d.anim = null; clearTimeout(d.tPlegar);
    const k = escala();
    const r0 = v.getBoundingClientRect();
    if (si) {
      // 1) el contenido se desvanece  2) la ventana encoge hasta su cabecera
      v.classList.add('v-plegando');
      d.tPlegar = setTimeout(() => {
        v.classList.remove('v-plegando'); v.classList.add('v-recogida');
        Object.assign(v.style, { width: '', height: '', maxHeight: '' });
        const r1 = v.getBoundingClientRect();
        d.anim = v.animate([{ width: `${r0.width / k}px`, height: `${r0.height / k}px` }, { width: `${r1.width / k}px`, height: `${r1.height / k}px` }], { duration: T_ENCOGER, easing: CURVA });
        d.anim.onfinish = () => { d.anim = null; alCambiar(); };
        alCambiar();
      }, sinAnimar ? 0 : T_DESVANECER);
      return;
    }
    v.classList.remove('v-plegando', 'v-recogida');
    aplicar(v); apilar();
    if (sinAnimar) { alCambiar(); return; }
    const r1 = v.getBoundingClientRect();
    v.classList.add('v-abriendo');
    d.anim = v.animate([{ width: `${r0.width / k}px`, height: `${r0.height / k}px` }, { width: `${r1.width / k}px`, height: `${r1.height / k}px` }], { duration: T_ABRIR, easing: CURVA });
    d.anim.onfinish = () => { d.anim = null; v.classList.remove('v-abriendo'); alCambiar(); };
    alCambiar();
  }
  function abrirRecogida(v) { datos(v).ultimo = performance.now(); recoger(v, false); }
  const enUso = (v) => v.matches(':hover') || (v.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) || v.querySelector('.sel-vis-lista:not([hidden])');
  for (const ev of ['pointerover', 'pointermove', 'focusin', 'keydown', 'wheel']) {
    document.addEventListener(ev, (e) => {
      const v = e.target.closest?.('.ventana[data-ventana]'); if (!v) return;
      const d = datos(v); d.ultimo = performance.now();
      if (v.classList.contains('v-plegando')) { recoger(v, false); return; } // se estaba yendo: vuelve
      if (v.classList.contains('v-recogida') && !d.tAbrir && ev !== 'focusin') d.tAbrir = setTimeout(() => { d.tAbrir = 0; if (v.matches(':hover')) recoger(v, false); }, ESPERA_ABRIR);
      if (ev === 'focusin') recoger(v, false);
    }, { passive: true });
  }
  document.addEventListener('pointerout', (e) => {
    const v = e.target.closest?.('.ventana[data-ventana]'); if (!v || v.contains(e.relatedTarget)) return;
    const d = datos(v); clearTimeout(d.tAbrir); d.tAbrir = 0; d.ultimo = performance.now();
  });
  setInterval(() => {
    const s = reposo(); if (!s || gesto || colocando()) return;
    const t = performance.now();
    for (const v of visibles()) {
      if (v.dataset.ventana === 'creador' || fijada(v) || recogida(v) || enUso(v)) continue;
      if (t - datos(v).ultimo > s * 1000) {
        if (v.hasAttribute('data-dock-panel')) v.hidden = true; // vuelve a su barra lateral, despacio
        else recoger(v, true);
      }
    }
  }, 500);

  // ---------------------------------------------------------- apartarse al poner objetos
  let sobreMapa = false, tDesp = 0, candidata = null;
  const mapaEl = document.getElementById('mapa');
  function estadoApartar() {
    const si = apartar() && colocando() && sobreMapa && !gesto;
    document.body.classList.toggle('v-apartadas', si);
    if (!si) { for (const v of document.querySelectorAll('.ventana.v-despierta')) if (!datos(v).tGracia) v.classList.remove('v-despierta'); clearTimeout(tDesp); candidata = null; }
    return si;
  }
  mapaEl.addEventListener('pointerenter', () => { sobreMapa = true; estadoApartar(); });
  mapaEl.addEventListener('pointerleave', () => { sobreMapa = false; estadoApartar(); });
  document.addEventListener('pointermove', (e) => {
    if (!estadoApartar()) return;
    // Ventana bajo el puntero (no recibe eventos: se mira por su rectángulo)
    const bajo = visibles().filter((v) => { const r = v.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }).at(-1) ?? null;
    for (const v of document.querySelectorAll('.ventana.v-despierta')) if (v !== bajo && !datos(v).tGracia) v.classList.remove('v-despierta');
    if (bajo !== candidata || Math.hypot(e.movementX || 0, e.movementY || 0) > 3) {
      clearTimeout(tDesp); candidata = bajo;
      if (bajo && !bajo.classList.contains('v-despierta')) tDesp = setTimeout(() => { bajo.classList.add('v-despierta'); datos(bajo).ultimo = performance.now(); }, ESPERA_DESPERTAR);
    }
  }, { passive: true });

  aplicarTodas();
  return {
    actualizar() { estadoApartar(); aplicarTodas(); },
    apilar: pedirApilar,
    abrir(id) { const v = document.querySelector(`.ventana[data-ventana="${id}"]`); if (v) abrirRecogida(v); },
    /** Recoger o abrir una ventana (Capas: clic en su título). */
    recoger(v, si) { if (si) recoger(v, true); else abrirRecogida(v); },
    recogida,
    recolocar() { for (const k of Object.keys(guardado)) guardado[k] = guardado[k]?.fija ? { fija: true } : {}; guardar(); aplicarTodas(); alCambiar(); },
    /** Ventana recién mostrada: cuenta como usada ahora. */
    usada(v) { if (v) abrirRecogida(v); },
  };
}
