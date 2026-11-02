// Símbolos en el mapa: paleta (unidades, medidas de coordinación y
// cometidos), constructor guiado de unidades, recientes y fichas de edición.
//
// Los elementos del plan llevan `simbolo`:
//   unidad   {clase:'unidad', identidad, icono, mod1, mod2, escalon, cg, ft, finta, refuerzo, T, M, H}
//   medida   {clase:'medida', id, ancho?, escalon?, izq?, der?}
// El estado (presente/previsto) y el nombre siguen en `propiedades`.

import { svgUnidad, IDENTIDADES, ESCALONES, ENTIDADES } from '../simbolos/app6.js';
import { ARMAS, ORDEN_ESCALONES, nombreEscalon, nombreUnidad, especialidadDe, candidatosUnidad } from '../simbolos/catalogo.js';
import { MEDIDAS, GRUPOS, medida, geometria, svgPunto, puntosNecesarios } from '../simbolos/medidas.js';
import { buscar as buscarDifuso } from './difuso.js';
import { esc } from './formas.js';

const CLAVE = 'spa.simbolos';
const BANDO_DE = { amigo: 'propio', supuesto: 'propio', hostil: 'enemigo', sospechoso: 'enemigo', neutral: 'neutral', desconocido: 'desconocido', pendiente: 'desconocido' };
const IDENTIDAD_DE = { propio: 'amigo', enemigo: 'hostil', neutral: 'neutral', desconocido: 'desconocido' };
export const identidadDeBando = (b) => IDENTIDAD_DE[b] ?? 'amigo';

/** Miniatura de una unidad para listas y botones. */
export const miniUnidad = (s, tam = 26) => svgUnidad({ escalon: '', ...s }, { tam, sinTextos: true }).svg;

/** Miniatura de una medida o cometido (con anclas de ejemplo). */
const EJEMPLOS = {
  limite: [[5, 30], [95, 30]], pl: [[5, 30], [95, 30]], ld: [[5, 30], [95, 30]], ldlc: [[5, 30], [95, 30]], loa: [[5, 30], [95, 30]], fcl: [[5, 30], [95, 30]], pld: [[5, 30], [95, 30]], lc: [[5, 30], [95, 30]], feba: [[5, 30], [95, 30]],
  'ataque-principal': [[8, 20], [45, 30], [92, 30]], 'ataque-apoyo': [[8, 20], [45, 30], [92, 30]], contraataque: [[8, 20], [45, 30], [92, 30]],
  'dir-principal': [[8, 30], [92, 30]], 'dir-apoyo': [[8, 30], [92, 30]],
  sbf: [[30, 18], [70, 18], [25, 50], [75, 50]], abf: [[50, 52], [30, 18], [70, 18]],
  bloquear: [[75, 52], [75, 8], [10, 30]], penetrar: [[75, 52], [75, 8], [10, 30]],
  brecha: [[80, 52], [80, 8], [20, 30]], desbordar: [[80, 52], [80, 8], [20, 30]], canalizar: [[80, 52], [80, 8], [20, 30]], limpiar: [[80, 52], [80, 8], [15, 30]],
  contener: [[60, 54], [60, 6]], controlar: [[50, 30], [72, 30]], asegurar: [[50, 30], [72, 30]], ocupar: [[50, 30], [72, 30]], aislar: [[50, 30], [72, 30]],
  tomar: [[20, 40], [30, 40], [90, 20]], destruir: [[50, 30], [72, 52]], neutralizar: [[50, 30], [72, 52]], suprimir: [[50, 30], [72, 52]],
  fijar: [[92, 30], [8, 30]], retardar: [[10, 30], [70, 30], [70, 55]], retirarse: [[10, 30], [70, 30], [70, 55]], 'retirarse-presion': [[10, 30], [70, 30], [70, 55]], ruptura: [[10, 30], [70, 30], [70, 55]], demostracion: [[10, 30], [70, 30], [70, 55]],
  desorganizar: [[20, 55], [20, 5], [90, 30]], interdiccion: [[50, 30], [80, 30]], envolver: [[8, 25], [55, 25], [85, 25]], emboscada: [[90, 30], [20, 55], [20, 5]],
  cubrir: [[50, 30], [8, 30], [92, 30]], vigilar: [[50, 30], [8, 30], [92, 30]], observar: [[50, 30], [8, 30], [92, 30]],
  aa: [[10, 10], [90, 8], [92, 52], [8, 50]], obj: [[10, 10], [90, 8], [92, 52], [8, 50]],
};
export function miniMedida(m, color = '#1F5FA8', ancho = 64, alto = 38) {
  if (m.tipo === 'punto') return svgPunto(m, color);
  const ej = EJEMPLOS[m.id] ?? (m.tipo === 'area' ? EJEMPLOS.aa : [[8, 30], [92, 30]]);
  const K = 1 / 111320; // metros → grados en el ecuador
  const anclas = ej.map(([x, y]) => ({ lat: y * 10 * K, lon: x * 10 * K }));
  const g = geometria(m, anclas, { nombre: '', escalonMarca: 'II' });
  const pt = ([la, lo]) => [(lo / K / 10) * (ancho / 100), alto - (la / K / 10) * (alto / 60)];
  const ruta = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${pt(p).map((v) => v.toFixed(1)).join(',')}`).join(' ');
  const lineas = g.lineas.map((l) => `<path d="${ruta(l.pts)}" fill="none" stroke="${color}" stroke-width="1.6"${l.discontinua || m.discontinua ? ' stroke-dasharray="4 3"' : ''}/>`).join('');
  const textos = g.textos.filter((t) => t.texto && t.texto.length <= 4 && !t.extremo).map((t) => { const [x, y] = pt(t.pos); return `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" font-size="9" font-weight="bold" font-family="Arial" text-anchor="middle" fill="${color}" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(t.texto)}</text>`; }).join('');
  const sig = m.grupo === 'lineas' && m.sigla ? `<text x="${ancho / 2}" y="${alto / 2 - 4}" font-size="9" font-weight="bold" font-family="Arial" text-anchor="middle" fill="${color}">${esc(m.sigla)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="-4 -4 ${ancho + 8} ${alto + 8}">${lineas}${textos}${sig}</svg>`;
}

/**
 * @param {object} o
 * @param {*} o.L @param {*} o.mapa @param {*} o.dibujo
 * @param {(h:string)=>void} o.elegirHerramienta
 * @param {()=>{modo:'fijo'|'escala', px:number, metros:number}} o.tamano
 */
export function iniciarSimbolos({ L, mapa, elegirHerramienta, tamano }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel-simbolos');
  let dibujo = null;
  const est = {
    pestaña: 'unidades', busqueda: '',
    unidad: { identidad: 'amigo', icono: '121100', mod2: 'c100', escalon: 'seccion', T: '', M: '', H: '', cg: false, ft: false, finta: false, refuerzo: '' },
    arma: 'infanteria', masOpciones: false,
    recientes: [],
  };
  try { const g = JSON.parse(localStorage.getItem(CLAVE) || '{}'); Object.assign(est, g, { unidad: { ...est.unidad, ...g.unidad } }); } catch { /* nada */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify({ pestaña: est.pestaña, unidad: est.unidad, arma: est.arma, recientes: est.recientes })); } catch { /* nada */ } };

  // ---------------------------------------------------------- pintar en el mapa
  const metrosPx = () => (156543.03392804097 * Math.cos((mapa.getCenter().lat * Math.PI) / 180)) / 2 ** mapa.getZoom();
  const ladoPx = () => { const t = tamano(); return t.modo === 'escala' ? Math.max(10, Math.min(180, t.metros / metrosPx())) : t.px; };
  mapa.on('zoomend', () => { if (tamano().modo === 'escala') dibujo?.refrescar(); });

  /** Capa de un elemento con símbolo (o null si no tiene). */
  function pintar(el, puntos, { seleccionado, color, previsto, arrastrable }) {
    const s = el.simbolo; if (!s) return null;
    const g = L.layerGroup();
    if (s.clase === 'unidad') {
      const r = svgUnidad({ ...s, estado: previsto ? 'previsto' : 'presente' }, { tam: ladoPx() });
      const principal = L.marker([puntos[0].lat, puntos[0].lon], {
        pane: 'elementos', draggable: Boolean(arrastrable), keyboard: false, bubblingMouseEvents: true,
        icon: L.divIcon({ className: `simbolo-unidad${seleccionado ? ' sel' : ''}`, html: r.svg, iconSize: [r.ancho, r.alto], iconAnchor: [r.ancla.x, r.ancla.y] }),
      });
      g.addLayer(principal);
      if (el.propiedades.nombre && !s.T && !s.M) g.addLayer(L.marker([puntos[0].lat, puntos[0].lon], { pane: 'elementos', interactive: false, icon: L.divIcon({ className: 'etq-ancla', html: `<span class="etq-simbolo" style="--dy:${(r.alto - r.ancla.y + 4).toFixed(0)}px">${esc(el.propiedades.nombre)}</span>`, iconSize: null }) }));
      return { grupo: g, principal };
    }
    const m = medida(s.id); if (!m) return null;
    if (m.tipo === 'punto') {
      const html = svgPunto(m, color);
      const ancho = Number(/width="([\d.]+)"/.exec(html)[1]);
      const principal = L.marker([puntos[0].lat, puntos[0].lon], {
        pane: 'elementos', draggable: Boolean(arrastrable), keyboard: false,
        icon: L.divIcon({ className: `simbolo-punto${seleccionado ? ' sel' : ''}`, html: `${html}${el.propiedades.nombre ? `<span class="etq-pto-cm" style="color:${color}">${esc(el.propiedades.nombre)}</span>` : ''}`, iconSize: [ancho, m.id === 'op' ? 32 : 44], iconAnchor: [ancho / 2, m.id === 'op' ? 20 : 41] }),
      });
      g.addLayer(principal);
      return { grupo: g, principal };
    }
    const geo = geometria(m, puntos, { nombre: el.propiedades.nombre, ancho: s.ancho, izq: s.izq, der: s.der, escalonMarca: ESCALONES[s.escalon]?.marca });
    const discont = previsto || m.discontinua;
    for (const l of geo.lineas) {
      g.addLayer(L.polyline(l.pts, { pane: 'elementos', color: seleccionado ? '#E0B252' : '#fff', weight: seleccionado ? 8 : 6, opacity: seleccionado ? 0.9 : 0.7, interactive: false, lineJoin: 'round', lineCap: 'round' }));
    }
    for (const l of geo.lineas) {
      g.addLayer(L.polyline(l.pts, { pane: 'elementos', color, weight: 2.6, dashArray: discont || l.discontinua ? '10 7' : null, interactive: false, lineJoin: 'round' }));
    }
    for (const t of geo.textos) {
      let rot = t.rumbo ?? 0; rot = ((rot % 360) + 540) % 360 - 180; if (rot > 90) rot -= 180; if (rot < -90) rot += 180;
      const cls = `etq-cm${t.fondo ? ' fondo' : ''}${t.negrita ? ' negrita' : ''}${t.extremo ? ` extremo ${t.extremo}` : ''}`;
      const trans = t.extremo ? extremoTransform(t) : `translate(-50%,-50%) rotate(${rot.toFixed(1)}deg)`;
      g.addLayer(L.marker(t.pos, { pane: 'elementos', interactive: false, icon: L.divIcon({ className: 'etq-ancla', html: `<span class="${cls}" style="color:${color};transform:${trans};${t.tam ? `font-size:${t.tam}px` : ''}">${esc(t.texto)}</span>`, iconSize: null }) }));
    }
    // Zona de clic: el recorrido de los puntos de anclaje (invisible y ancho)
    const cerrar = m.tipo === 'area';
    const pts = puntos.map((p) => [p.lat, p.lon]);
    const principal = cerrar ? L.polygon(pts, { pane: 'elementos', color, weight: 14, opacity: 0, fillColor: color, fillOpacity: seleccionado ? 0.12 : 0.04, bubblingMouseEvents: true })
      : L.polyline(geo.lineas.length ? geo.lineas.flatMap((l) => l.pts) : pts, { pane: 'elementos', color, weight: 16, opacity: 0, bubblingMouseEvents: true });
    g.addLayer(principal);
    return { grupo: g, principal };
  }
  // Rótulo de extremo de línea (PL, LD…): fuera de la línea, en su prolongación
  function extremoTransform(t) {
    const dir = ((t.dir ?? 90) + 360) % 360; // rumbo de la línea en ese extremo
    const haciaFuera = t.extremo === 'inicio' ? (dir + 180) % 360 : dir;
    const dx = Math.sin((haciaFuera * Math.PI) / 180), dy = -Math.cos((haciaFuera * Math.PI) / 180);
    const ax = dx >= 0 ? 0 : -100, ay = -50;
    return `translate(${ax}%,${ay}%) translate(${(dx * 8).toFixed(1)}px,${(dy * 8).toFixed(1)}px)`;
  }

  /** Vista previa mientras se dibuja (puntos puestos + cursor). */
  function previsualizar(capa, simbolo, puntos, color) {
    const m = simbolo?.clase === 'medida' ? medida(simbolo.id) : null;
    if (!m || m.tipo === 'punto' || puntos.length < 2 || (m.n && puntos.length < m.n)) return false;
    const geo = geometria(m, puntos, { nombre: '', ancho: simbolo.ancho, escalonMarca: '' });
    for (const l of geo.lineas) L.polyline(l.pts, { pane: 'borrador', color, weight: 2.4, opacity: 0.85, dashArray: '6 5', interactive: false }).addTo(capa);
    return true;
  }

  // ---------------------------------------------------------- recientes
  function recordar(simbolo) {
    const clave = JSON.stringify(simbolo);
    est.recientes = [simbolo, ...est.recientes.filter((r) => JSON.stringify(r) !== clave)].slice(0, 10);
    guardar(); if (!panel.hidden) pintarPanel();
  }

  // ---------------------------------------------------------- colocar / dibujar
  function colocar(simbolo) {
    if (simbolo.clase === 'unidad') {
      elegirHerramienta('punto');
      dibujo.ponerSimboloBorrador({ ...simbolo }, 1, `Toca el mapa donde va: ${nombreUnidad(simbolo)}.`);
      return;
    }
    const m = medida(simbolo.id); if (!m) return;
    elegirHerramienta(m.tipo === 'area' ? 'area' : m.tipo === 'punto' ? 'punto' : 'linea');
    dibujo.ponerSimboloBorrador({ ...simbolo }, m.n ?? 0, m.ayuda ?? (m.tipo === 'area' ? 'Toca los vértices de la zona; toca el primero o doble clic para cerrar.' : m.tipo === 'punto' ? 'Toca el mapa donde va el punto.' : 'Toca los puntos de la línea; doble clic o Intro para terminar.'), m.nombre);
  }

  // ---------------------------------------------------------- paleta
  function abrir(pestaña, si = true) {
    if (pestaña) est.pestaña = pestaña;
    panel.hidden = !si;
    document.querySelectorAll('[data-simbolos]').forEach((b) => b.setAttribute('aria-pressed', String(si && b.dataset.simbolos === est.pestaña)));
    if (si) pintarPanel();
    guardar();
  }

  const u = () => est.unidad;
  function pintarPanel() {
    if (panel.hidden) return;
    const cab = `<div class="pm-cab"><strong>Símbolos</strong><button type="button" class="pm-x" data-s="cerrar" aria-label="Cerrar">×</button></div>
      <input class="sim-buscar" id="sim-buscar" placeholder="Buscar: «sección paracaidista», «PL», «bloquear»…" value="${esc(est.busqueda)}" autocomplete="off">
      <div class="seg sim-pestanas">${[['unidades', 'Unidades'], ['medidas', 'Medidas'], ['cometidos', 'Cometidos']].map(([k, n]) => `<button type="button" data-pestana="${k}" aria-pressed="${est.pestaña === k}">${n}</button>`).join('')}</div>
      ${est.recientes.length ? `<div class="sim-recientes"><span class="el-et">Recientes</span><div>${est.recientes.map((r, i) => `<button type="button" class="sim-chip" data-reciente="${i}" title="${esc(tituloSimbolo(r))}">${r.clase === 'unidad' ? miniUnidad(r, 18) : miniMedida(medida(r.id), '#1F5FA8', 34, 20)}</button>`).join('')}</div></div>` : ''}`;
    let cuerpo;
    if (est.busqueda.trim()) cuerpo = htmlBusqueda(est.busqueda.trim());
    else if (est.pestaña === 'unidades') cuerpo = htmlConstructor();
    else cuerpo = htmlMedidas(est.pestaña === 'cometidos' ? ['cometidos'] : ['lineas', 'ejes', 'areas', 'puntos']);
    panel.innerHTML = cab + cuerpo;
    const b = $('sim-buscar');
    if (b && document.activeElement?.id !== 'sim-buscar' && est._enfocar) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); est._enfocar = false; }
  }
  const tituloSimbolo = (s) => (s.clase === 'unidad' ? `${nombreUnidad(s)}${s.T ? ` ${s.T}` : ''}${s.M ? ` / ${s.M}` : ''}` : medida(s.id)?.nombre ?? '');

  function htmlConstructor() {
    const s = u();
    const arma = ARMAS.find((a) => a.id === est.arma) ?? ARMAS[0];
    const grande = svgUnidad(s, { tam: 46 });
    const ids = ['amigo', 'hostil', 'neutral', 'desconocido'];
    const masIds = ['supuesto', 'sospechoso', 'pendiente'];
    return `<div class="sim-vista">${grande.svg}<div><b>${esc(nombreUnidad(s))}</b><small>SIDC ${grande.sidc}</small></div></div>
      <div class="sim-paso"><span class="el-et">1 · Bando</span><div class="sim-rejilla sim-bandos">${[...ids, ...(est.masOpciones ? masIds : [])].map((id) => `<button type="button" class="sim-tile" data-identidad="${id}" aria-pressed="${s.identidad === id}">${miniUnidad({ ...s, identidad: id, escalon: '' }, 22)}<span>${IDENTIDADES[id].nombre}</span></button>`).join('')}</div></div>
      <div class="sim-paso"><span class="el-et">2 · Arma</span><div class="sim-rejilla">${ARMAS.map((a) => `<button type="button" class="sim-tile" data-arma="${a.id}" aria-pressed="${a.id === arma.id}">${miniUnidad({ identidad: s.identidad, icono: a.icono }, 20)}<span>${esc(a.nombre)}</span></button>`).join('')}</div></div>
      <div class="sim-paso"><span class="el-et">3 · Tipo</span><div class="sim-rejilla">${arma.tipos.map((t) => `<button type="button" class="sim-tile" data-tipo="${t.id}" aria-pressed="${t.icono === s.icono && (t.mod1 ?? '') === (s.mod1 ?? '') && (t.mod2 ?? '') === (s.mod2 ?? '')}">${miniUnidad({ identidad: s.identidad, icono: t.icono, mod1: t.mod1, mod2: t.mod2 }, 20)}<span>${esc(t.nombre)}</span></button>`).join('')}</div></div>
      <div class="sim-paso"><span class="el-et">4 · Escalón</span><div class="sim-escalones">${ORDEN_ESCALONES.slice(0, 9).map((k) => `<button type="button" data-escalon="${k}" aria-pressed="${s.escalon === k}" title="${esc(ESCALONES[k].nombre)}"><b>${ESCALONES[k].marca ?? '—'}</b><span>${esc(nombreEscalon(k, arma.id))}</span></button>`).join('')}</div></div>
      <div class="sim-paso sim-campos"><label>Designación <input data-campo-u="T" value="${esc(s.T)}" placeholder="1" maxlength="21"></label><label>Unidad superior <input data-campo-u="M" value="${esc(s.M)}" placeholder="II/RI4" maxlength="21"></label></div>
      <button type="button" class="sim-mas" data-s="mas">${est.masOpciones ? 'Menos opciones ▲' : 'Más opciones (CG, agrupación, refuerzo, finta…) ▼'}</button>
      ${est.masOpciones ? htmlExtras(s) : ''}
      <div class="pm-acciones"><button type="button" class="primario" data-s="colocar">Colocar en el mapa</button></div>`;
  }
  function htmlExtras(s, pref = 'u') {
    const chk = (k, n) => `<label class="sim-chk"><input type="checkbox" data-bool-${pref}="${k}" ${s[k] ? 'checked' : ''}>${n}</label>`;
    if (pref === 'f') {
      const activos = ['cg', 'ft', 'finta'].filter((k) => s[k]).length + (s.refuerzo ? 1 : 0) + (s.H ? 1 : 0);
      return `<details class="sim-det"${activos ? ' open' : ''}><summary>Más opciones${activos ? ` (${activos})` : ''}</summary>${htmlExtras(s, 'f2')}</details>`;
    }
    if (pref === 'f2') pref = 'f';
    return `<div class="sim-paso sim-extras">
      ${chk('cg', 'Cuartel general')}${chk('ft', 'Agrupación táctica')}${chk('finta', 'Finta / simulada')}
      <div class="seg" data-refuerzo-${pref}>${[['', 'Normal'], ['+', 'Reforzada (+)'], ['-', 'Disminuida (−)'], ['±', '±']].map(([v, n]) => `<button type="button" data-v="${v}" aria-pressed="${(s.refuerzo ?? '') === v}">${n}</button>`).join('')}</div>
      <label>Información adicional (H) <input data-campo-${pref}="H" value="${esc(s.H ?? '')}" placeholder="RECO, NASAMS…" maxlength="20"></label>
    </div>`;
  }
  function htmlMedidas(grupos) {
    return grupos.map((gk) => `<div class="sim-grupo"><span class="el-et">${GRUPOS[gk]}</span><div class="sim-lista-cm">${MEDIDAS.filter((m) => m.grupo === gk).map((m) => `<button type="button" class="sim-cm" data-medida="${m.id}" title="${esc(m.ayuda ?? m.nombre)}"><span class="sim-cm-ico">${miniMedida(m)}</span><span>${esc(m.nombre)}${m.sigla && gk !== 'cometidos' ? ` <small>${esc(m.sigla)}</small>` : ''}</span></button>`).join('')}</div></div>`).join('');
  }
  function htmlBusqueda(q) {
    const cands = [
      ...candidatosUnidad().map((c) => ({ ...c, grupo: 'Unidades' })),
      ...MEDIDAS.map((m) => ({ grupo: m.grupo === 'cometidos' ? 'Cometidos' : 'Medidas', texto: m.nombre, extra: `${m.sigla ?? ''} ${m.claves ?? ''}`, medida: m })),
    ];
    // «sección paracaidista»: el escalón dentro de la búsqueda
    const qn = q.toLowerCase();
    const escalon = ORDEN_ESCALONES.find((k) => k && qn.includes(nombreEscalon(k, 'infanteria').toLowerCase().split(' ')[0]))
      ?? (/\b(bia|bía|batería)\b/.test(qn) ? 'compania' : /\b(escuadrón|esc)\b/.test(qn) ? 'compania' : /\bgrupo\b/.test(qn) ? 'batallon' : null);
    const limpio = escalon ? qn.replace(nombreEscalon(escalon, 'infanteria').toLowerCase(), '').replace(/\b(de|del)\b/g, ' ').trim() || qn : qn;
    const r = buscarDifuso(limpio, cands, 45).slice(0, 16);
    if (!r.length) return '<p class="cat-vacio">Nada encontrado.</p>';
    return `<div class="sim-lista-cm">${r.map((c, i) => {
      if (c.medida) return `<button type="button" class="sim-cm" data-medida="${c.medida.id}"><span class="sim-cm-ico">${miniMedida(c.medida)}</span><span>${esc(c.texto)} <small>${esc(c.grupo)}</small></span></button>`;
      const s = { ...u(), icono: c.tipo.icono, mod1: c.tipo.mod1 ?? '', mod2: c.tipo.mod2 ?? '', ...(escalon ? { escalon } : {}) };
      est[`_res${i}`] = { s, arma: c.arma };
      return `<button type="button" class="sim-cm" data-resultado="${i}"><span class="sim-cm-ico">${miniUnidad(s, 22)}</span><span>${esc(nombreUnidad(s))} <small>Unidad</small></span></button>`;
    }).join('')}</div>`;
  }

  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const s = u();
    if (b.dataset.s === 'cerrar') { abrir(null, false); return; }
    if (b.dataset.pestana) { est.pestaña = b.dataset.pestana; est.busqueda = ''; abrir(est.pestaña); return; }
    if (b.dataset.identidad) s.identidad = b.dataset.identidad;
    if (b.dataset.arma) {
      est.arma = b.dataset.arma;
      const t = ARMAS.find((a) => a.id === est.arma).tipos[0];
      Object.assign(s, { icono: t.icono, mod1: t.mod1 ?? '', mod2: t.mod2 ?? '' });
    }
    if (b.dataset.tipo) { const t = ARMAS.find((a) => a.id === est.arma).tipos.find((x) => x.id === b.dataset.tipo); Object.assign(s, { icono: t.icono, mod1: t.mod1 ?? '', mod2: t.mod2 ?? '' }); }
    if (b.dataset.escalon !== undefined) s.escalon = b.dataset.escalon;
    if (b.closest('[data-refuerzo-u]')) s.refuerzo = b.dataset.v;
    if (b.dataset.s === 'mas') est.masOpciones = !est.masOpciones;
    if (b.dataset.s === 'colocar') { colocar({ clase: 'unidad', ...s }); return; }
    if (b.dataset.medida) { colocar({ clase: 'medida', id: b.dataset.medida }); return; }
    if (b.dataset.reciente !== undefined) { colocar({ ...est.recientes[Number(b.dataset.reciente)] }); return; }
    if (b.dataset.resultado !== undefined) {
      const r = est[`_res${b.dataset.resultado}`];
      Object.assign(s, r.s); est.arma = r.arma; est.busqueda = ''; est.pestaña = 'unidades';
    }
    guardar(); pintarPanel();
  });
  panel.addEventListener('input', (ev) => {
    if (ev.target.id === 'sim-buscar') { est.busqueda = ev.target.value; est._enfocar = true; pintarPanel(); return; }
    const k = ev.target.dataset.campoU;
    if (k) { u()[k] = ev.target.value; guardar(); const v = panel.querySelector('.sim-vista'); if (v) { const r = svgUnidad(u(), { tam: 46 }); v.innerHTML = `${r.svg}<div><b>${esc(nombreUnidad(u()))}</b><small>SIDC ${r.sidc}</small></div>`; } }
  });
  panel.addEventListener('change', (ev) => { const k = ev.target.dataset.boolU; if (k) { u()[k] = ev.target.checked; guardar(); pintarPanel(); } });
  panel.addEventListener('keydown', (ev) => {
    if (ev.target.id === 'sim-buscar' && ev.key === 'Enter') { panel.querySelector('.sim-lista-cm button')?.click(); }
    if (ev.key === 'Escape') { if (est.busqueda) { est.busqueda = ''; pintarPanel(); } else abrir(null, false); }
  });

  // ---------------------------------------------------------- ficha (panel del elemento)
  /** Partes de la ficha de un elemento con símbolo. */
  function ficha(el) {
    const s = el.simbolo; if (!s) return null;
    if (s.clase === 'unidad') {
      const e = especialidadDe(s);
      const armaId = e?.arma.id ?? 'generica';
      return {
        titulo: nombreUnidad(s), tipo: 'Unidad',
        html: `<div class="sim-vista sim-vista-ficha">${svgUnidad({ ...s, estado: el.propiedades.estado }, { tam: 40 }).svg}<div><b>${esc(nombreUnidad(s))}</b><small>SIDC ${svgUnidad(s).sidc}</small></div></div>
          <div class="el-fila"><span class="el-et">Bando</span><div class="seg sim-seg" data-f="identidad">${['amigo', 'hostil', 'neutral', 'desconocido', 'supuesto', 'sospechoso', 'pendiente'].map((id) => `<button type="button" data-v="${id}" aria-pressed="${s.identidad === id}" title="${IDENTIDADES[id].nombre}">${miniUnidad({ ...s, identidad: id }, 16)}</button>`).join('')}</div></div>
          ${selectorVisual('tipo', 'Tipo', ARMAS.flatMap((a) => a.tipos.map((t) => ({ v: `${a.id}/${t.id}`, grupo: a.nombre, nombre: t.nombre, ico: miniUnidad({ identidad: s.identidad, icono: t.icono, mod1: t.mod1, mod2: t.mod2 }, 18) }))), e ? `${e.arma.id}/${e.tipo.id}` : '')}
          ${selectorVisual('escalon', 'Escalón', ORDEN_ESCALONES.map((k) => ({ v: k, nombre: nombreEscalon(k, armaId), ico: `<b class="marca-esc">${ESCALONES[k].marca ?? '—'}</b>` })), s.escalon ?? '')}
          <div class="sim-campos"><label>Designación <input data-campo-f="T" value="${esc(s.T ?? '')}" maxlength="21" placeholder="1"></label><label>Superior <input data-campo-f="M" value="${esc(s.M ?? '')}" maxlength="21" placeholder="II/RI4"></label></div>
          ${htmlExtras(s, 'f')}`,
      };
    }
    const m = medida(s.id); if (!m) return null;
    const mismos = MEDIDAS.filter((x) => x.grupo === m.grupo && x.tipo === m.tipo && puntosNecesarios(x) === puntosNecesarios(m) || x.id === m.id);
    return {
      titulo: el.propiedades.nombre ? `${m.sigla ? `${m.sigla} ` : ''}${el.propiedades.nombre}` : m.nombre, tipo: GRUPOS[m.grupo],
      html: `${selectorVisual('medida', 'Tipo', mismos.map((x) => ({ v: x.id, nombre: x.nombre, ico: miniMedida(x, '#1F5FA8', 40, 24) })), m.id)}
        ${m.campos?.includes('ancho') ? `<form class="el-radio" id="sim-ancho"><label>Anchura <input type="number" min="10" step="any" id="sim-ancho-m" value="${s.ancho ? Math.round(s.ancho) : ''}" placeholder="auto"></label><span>m</span><button type="submit">Aplicar</button></form>` : ''}
        ${m.id === 'limite' ? `${selectorVisual('escalon', 'Escalón', ORDEN_ESCALONES.map((k) => ({ v: k, nombre: nombreEscalon(k, 'infanteria'), ico: `<b class="marca-esc">${ESCALONES[k].marca ?? '—'}</b>` })), s.escalon ?? '')}
          <div class="sim-campos"><label>Unidad a un lado <input data-campo-f="izq" value="${esc(s.izq ?? '')}" maxlength="20"></label><label>Al otro lado <input data-campo-f="der" value="${esc(s.der ?? '')}" maxlength="20"></label></div>` : ''}
        ${m.ayuda ? `<p class="el-ayuda">${esc(m.ayuda)} Arrastra los puntos para ajustarlo.</p>` : ''}`,
    };
  }
  function selectorVisual(campo, etiqueta, opciones, valor) {
    const act = opciones.find((o) => o.v === valor) ?? opciones[0];
    let grupoAnt = null;
    return `<div class="el-fila sel-vis" data-sel="${campo}"><span class="el-et">${etiqueta}</span>
      <button type="button" class="sel-vis-btn" data-abrir-sel="${campo}">${act?.ico ?? ''}<span>${esc(act?.nombre ?? '')}</span><i>▾</i></button>
      <div class="sel-vis-lista" hidden>${opciones.map((o) => { const cab = o.grupo && o.grupo !== grupoAnt ? `<div class="sel-vis-grupo">${esc(o.grupo)}</div>` : ''; grupoAnt = o.grupo; return `${cab}<button type="button" data-elegir="${esc(o.v)}" aria-pressed="${o.v === valor}">${o.ico ?? ''}<span>${esc(o.nombre)}</span></button>`; }).join('')}</div></div>`;
  }

  /** Clics y cambios en la ficha. Devuelve true si los ha atendido. */
  function manejarFicha(ev, el, cambio) {
    const s = el.simbolo; if (!s) return false;
    const t = ev.target;
    const recordarTras = () => recordar(copiaSimbolo(el));
    if (ev.type === 'click') {
      const abrirSel = t.closest('[data-abrir-sel]');
      if (abrirSel) { const lista = abrirSel.parentElement.querySelector('.sel-vis-lista'); const ab = lista.hidden; document.querySelectorAll('.sel-vis-lista').forEach((x) => { x.hidden = true; }); lista.hidden = !ab; if (ab) lista.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }); return true; }
      const elegir = t.closest('[data-elegir]');
      if (elegir) {
        const campo = elegir.closest('[data-sel]').dataset.sel, v = elegir.dataset.elegir;
        if (campo === 'tipo') { const [a, tp] = v.split('/'); const tt = ARMAS.find((x) => x.id === a).tipos.find((x) => x.id === tp); cambio('Cambiar tipo', () => { Object.assign(s, { icono: tt.icono, mod1: tt.mod1 ?? '', mod2: tt.mod2 ?? '' }); }); }
        if (campo === 'escalon') cambio('Cambiar escalón', () => { s.escalon = v; });
        if (campo === 'medida') cambio('Cambiar tipo', () => { s.id = v; });
        recordarTras(); return true;
      }
      const seg = t.closest('.sim-seg[data-f] button');
      if (seg) { const v = seg.dataset.v; cambio('Cambiar bando', () => { s.identidad = v; el.propiedades.bando = BANDO_DE[v] ?? 'propio'; el.propiedades.color = null; }); recordarTras(); return true; }
      const ref = t.closest('[data-refuerzo-f] button');
      if (ref) { cambio('Cambiar refuerzo', () => { s.refuerzo = ref.dataset.v; }); recordarTras(); return true; }
      return false;
    }
    if (ev.type === 'change') {
      const k = t.dataset.campoF;
      if (k) { cambio('Cambiar texto', () => { s[k] = t.value.trim(); }); recordarTras(); return true; }
      const b = t.dataset.boolF;
      if (b) { cambio('Cambiar símbolo', () => { s[b] = t.checked; }); recordarTras(); return true; }
    }
    if (ev.type === 'submit' && t.id === 'sim-ancho') {
      ev.preventDefault();
      const v = Number(String($('sim-ancho-m').value).replace(',', '.'));
      cambio('Cambiar anchura', () => { s.ancho = v > 0 ? v : null; });
      return true;
    }
    return false;
  }
  const copiaSimbolo = (el) => { const { ...c } = el.simbolo; if (c.clase === 'unidad') return c; return { clase: 'medida', id: c.id }; };
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.sel-vis')) document.querySelectorAll('.sel-vis-lista').forEach((x) => { x.hidden = true; }); });

  /** Al crear un elemento con símbolo: color de bando de la identidad y recientes. */
  function alCrear(el) {
    if (el.simbolo?.clase === 'unidad') el.propiedades.bando = BANDO_DE[el.simbolo.identidad] ?? 'propio';
    recordar(copiaSimbolo(el));
  }
  /** Miniatura para la lista del plan. */
  function icono(el) {
    const s = el.simbolo; if (!s) return null;
    if (s.clase === 'unidad') return miniUnidad(s, 16);
    const m = medida(s.id); return m ? miniMedida(m, '#1F5FA8', 30, 18) : null;
  }
  /** Número fijo de puntos (cometidos) o 0 si es libre. */
  const puntosFijos = (el) => (el.simbolo?.clase === 'medida' ? medida(el.simbolo.id)?.n ?? 0 : 0);
  /** Candidatos del buscador universal. */
  function candidatosBusqueda() {
    return [
      ...candidatosUnidad().map((c) => ({ grupo: 'Símbolos', texto: c.texto, extra: `unidad símbolo ${c.extra}`, detalle: 'Unidad · colocar', accion: () => { Object.assign(est.unidad, { icono: c.tipo.icono, mod1: c.tipo.mod1 ?? '', mod2: c.tipo.mod2 ?? '' }); est.arma = c.arma; abrir('unidades'); } })),
      ...MEDIDAS.map((m) => ({ grupo: 'Símbolos', texto: m.nombre, extra: `${m.sigla ?? ''} ${m.claves ?? ''} ${m.grupo === 'cometidos' ? 'cometido verbo' : 'medida de coordinación'}`, detalle: m.grupo === 'cometidos' ? 'Cometido · dibujar' : 'Medida · dibujar', accion: () => colocar({ clase: 'medida', id: m.id }) })),
    ];
  }

  return {
    conectar(d) { dibujo = d; },
    abrir, pintar, previsualizar, ficha, manejarFicha, alCrear, icono, puntosFijos, candidatosBusqueda,
    get abierto() { return !panel.hidden; },
    get entidades() { return ENTIDADES; },
  };
}
