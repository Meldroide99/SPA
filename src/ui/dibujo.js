// Dibujar y editar sobre el mapa: punto, línea, área y círculo.
//
// Mientras se dibuja:
//   - clic: añade un punto; si cae cerca (12 px) de otro punto existente
//     (del plan, de lo importado o de la propia línea) se une a él (imán)
//   - clic derecho: quita el último punto
//   - pulsar y arrastrar un punto ya puesto: lo mueve
//   - mantener pulsado un punto sin moverlo: menú para eliminarlo
//   - doble clic, Intro o clic en el último punto (área: en el primero): termina
//   - Esc: cancela
// Todo lo que se ve y se mide sale del motor geodésico verificado.

import { medir, destino, puntosGeodesica } from '../geo/index.js';
import {
  crearPlan, nuevoElemento, puntosDe, moverPuntos, medidasDe, puntosCirculo,
  Historial, formatearArea, esPlan, tocar, TIPOS, BANDOS, ESTADOS, estiloDe,
} from '../plan/plan.js';
import { capaForma, esc, ICONOS } from './formas.js';
import { esVisible, buscarPaquete, nombreRuta, asignar, paquetes, nuevoPaquete } from '../plan/operaciones.js';
import { preguntar } from './dialogo.js';
import { tomarFicha, alPerderFicha, htmlColor, htmlTrazo, htmlRelleno, htmlAltitud, rellenarAltitud, htmlLinea, rellenarPerfil } from './ficha.js';

const CLAVE_PLAN = 'spa.plan.actual';
const CLAVE_VISTA = 'spa.vista.paquetes';   // qué paquetes ve este usuario (no va en el plan)
const CLAVE_ACTIVO = 'spa.paquete.activo';  // dónde entra lo que pinta este usuario
const IMAN_PX = 12;
export const HERRAMIENTAS_DIBUJO = ['punto', 'linea', 'area', 'circulo'];

/**
 * @param {object} o
 * @param {*} o.L @param {*} o.mapa
 * @param {() => string} o.herramienta
 * @param {(h:string) => void} o.elegirHerramienta
 * @param {{metros, coord}} o.fmt
 * @param {*} o.alturas servicio de alturas (MDT)
 * @param {() => Array<{lat,lon}>} [o.puntosExternos] puntos de lo importado (imán)
 * @param {() => void} [o.alCambiarPaneles]
 */
export function iniciarDibujo({ L, mapa, herramienta, elegirHerramienta, fmt, alturas, puntosExternos = () => [], alCambiarPaneles = () => {}, simbolos = null }) {
  const $ = (id) => document.getElementById(id);
  const px = (p) => mapa.latLngToContainerPoint([p.lat, p.lon]);
  const DUENO = 'plan';

  // ---------------------------------------------------------- plan y guardado local
  let plan = null;
  try { const g = JSON.parse(localStorage.getItem(CLAVE_PLAN) || 'null'); if (esPlan(g)) plan = g; } catch { /* sin almacenamiento */ }
  plan ??= crearPlan('Plan de trabajo');
  const historial = new Historial(plan, {
    alCambiar: () => {
      try { localStorage.setItem(CLAVE_PLAN, JSON.stringify(plan)); } catch { /* nada */ }
      if (seleccion && !buscar(seleccion)) seleccion = null;
      if (activo && !buscarPaquete(plan, activo)) ponerActivo(null);
      pintarTodo(); pintarPanel(); avisar(); pintarBotones();
    },
  });
  plan.operaciones ??= [];

  // ---------------------------------------------------------- vista de cada usuario: qué ve y dónde pinta
  let vista = { ocultos: [], solo: null, sueltosOcultos: false };
  try { Object.assign(vista, JSON.parse(localStorage.getItem(CLAVE_VISTA) || '{}')); } catch { /* nada */ }
  let activo = null;
  try { activo = localStorage.getItem(CLAVE_ACTIVO) || null; } catch { /* nada */ }
  if (activo && !buscarPaquete(plan, activo)) activo = null;
  const guardarVista = () => { try { localStorage.setItem(CLAVE_VISTA, JSON.stringify(vista)); } catch { /* nada */ } };
  function ponerActivo(id) { activo = id && buscarPaquete(plan, id) ? id : null; try { if (activo) localStorage.setItem(CLAVE_ACTIVO, activo); else localStorage.removeItem(CLAVE_ACTIVO); } catch { /* nada */ } avisar(); }
  const visible = (el) => esVisible(plan, el, vista);
  // Avisos a quien escuche (paneles de Objetos, Operaciones, Lazo…)
  const oyentes = new Set();
  let tAvisar = 0;
  function avisar() { cancelAnimationFrame(tAvisar); tAvisar = requestAnimationFrame(() => { for (const f of oyentes) { try { f(); } catch (e) { console.error(e); } } }); }
  let resaltados = new Set(); // objetos marcados (lazo, selección múltiple)
  const buscar = (id) => plan.elementos.find((e) => e.id === id);
  const cambio = (desc, fn) => historial.hacer(desc, fn);

  // ---------------------------------------------------------- capas
  for (const [nombre, z] of [['elementos', 460], ['borrador', 470]]) {
    if (!mapa.getPane(nombre)) mapa.createPane(nombre).style.zIndex = z;
  }
  const capaElementos = L.layerGroup().addTo(mapa);
  const capaAsas = L.layerGroup().addTo(mapa);
  const capaBorrador = L.layerGroup().addTo(mapa);        // líneas provisionales
  const capaBorradorPuntos = L.layerGroup().addTo(mapa);  // puntos (arrastrables)
  const capaIman = L.layerGroup().addTo(mapa);
  const capaCursorPerfil = L.layerGroup().addTo(mapa);
  const capasDe = new Map();

  let seleccion = null;
  let borrador = null; // { tipo, puntos, cursor }
  const preferencias = { bando: 'propio', estado: 'presente' };
  let verticesAbiertos = false;

  const numero = (el) => plan.elementos.filter((e) => e.tipo === el.tipo).indexOf(el) + 1;
  const titulo = (el) => (el.simbolo && simbolos?.ficha(el)?.titulo) || el.propiedades.nombre || `${TIPOS[el.tipo].nombre} ${numero(el)}`;
  const fijos = (el) => simbolos?.puntosFijos(el) ?? 0;

  function pintarElemento(el, puntos = puntosDe(el), radio = el.propiedades.radio) {
    capasDe.get(el.id)?.remove();
    const est = estiloDe(el);
    const sel = el.id === seleccion;
    const conSimbolo = el.simbolo && simbolos?.pintar(el, puntos, { seleccionado: sel, color: est.color, relleno: el.propiedades.relleno, previsto: el.propiedades.estado === 'previsto', arrastrable: sel && el.tipo === 'punto' });
    const { grupo, principal } = conSimbolo || capaForma(L, {
      tipo: el.tipo, puntos, radio, color: est.color, trazo: est.trazo, grosor: est.grosor, relleno: est.relleno,
      nombre: el.propiedades.nombre, previsto: el.propiedades.estado === 'previsto', seleccionado: sel,
      arrastrable: sel && el.tipo === 'punto',
    });
    principal.on('click', (e) => {
      if (herramienta() !== 'consultar') return; // dibujando: el clic sigue al mapa (y el imán lo une)
      L.DomEvent.stopPropagation(e);
      seleccionar(el.id);
    });
    if (sel && el.tipo === 'punto') {
      principal.on('dragstart', () => document.body.classList.add('arrastrando'));
      principal.on('drag', () => { const ll = principal.getLatLng(); pintarPanel([{ lat: ll.lat, lon: ll.lng }]); });
      principal.on('dragend', () => {
        document.body.classList.remove('arrastrando');
        const q = iman(principal.getLatLng(), { excluir: el.id });
        cambio('Mover punto', () => moverPuntos(el, [q]));
      });
    }
    grupo.addTo(capaElementos);
    if (resaltados.has(el.id)) marcarHalo(grupo);
    capasDe.set(el.id, grupo);
  }

  /** Resalta en el mapa (halo azul) las capas de un objeto marcado. */
  function marcarHalo(capa) {
    if (capa.eachLayer) { capa.eachLayer(marcarHalo); return; }
    capa.getElement?.()?.classList.add('halo-sel');
  }

  function pintarTodo() {
    capaElementos.clearLayers(); capasDe.clear();
    if (seleccion && buscar(seleccion) && !visible(buscar(seleccion))) { seleccion = null; pintarPanel(); }
    for (const el of plan.elementos) if (visible(el)) pintarElemento(el);
    pintarAsas();
  }

  // ---------------------------------------------------------- imán
  /** Puntos a los que se puede unir uno nuevo. */
  function candidatos({ excluir, propios = [] } = {}) {
    const out = [...propios];
    for (const el of plan.elementos) { if (el.id !== excluir && visible(el)) out.push(...puntosDe(el)); }
    out.push(...puntosExternos());
    return out;
  }
  /** Devuelve el punto existente más cercano (≤ 12 px) o el propio punto. */
  function iman(ll, opc) {
    const p = { lat: ll.lat, lon: ll.lng ?? ll.lon };
    const q = px(p);
    let mejor = null, dMin = IMAN_PX;
    for (const c of candidatos(opc)) { const d = q.distanceTo(px(c)); if (d <= dMin) { dMin = d; mejor = c; } }
    return mejor ? { lat: mejor.lat, lon: mejor.lon } : p;
  }
  function mostrarIman(p, opc) {
    capaIman.clearLayers();
    if (!p) return;
    const q = iman({ lat: p.lat, lng: p.lon }, opc);
    if (q.lat !== p.lat || q.lon !== p.lon) {
      L.circleMarker([q.lat, q.lon], { pane: 'borrador', radius: 9, color: '#E0B252', weight: 3, fill: false, interactive: false }).addTo(capaIman);
    }
  }

  // ---------------------------------------------------------- asas de edición
  const asa = (cls) => L.divIcon({ className: `asa ${cls}`, iconSize: cls === 'asa-media' ? [11, 11] : [14, 14] });

  function pintarAsas() {
    capaAsas.clearLayers();
    const el = seleccion && buscar(seleccion);
    if (!el) return;
    if (simbolos?.girable(el)) asasGiro(el);
    if (el.tipo === 'punto') return;
    const pts = puntosDe(el);
    if (el.tipo === 'circulo') {
      const centro = L.marker([pts[0].lat, pts[0].lon], { icon: asa('asa-centro'), draggable: true, title: 'Arrastra para mover el círculo' });
      const borde = destino(pts[0], 90, el.propiedades.radio);
      const radio = L.marker([borde.lat, borde.lon], { icon: asa('asa-radio'), draggable: true, title: 'Arrastra para cambiar el radio' });
      centro.on('drag', () => {
        const ll = centro.getLatLng(); const c = { lat: ll.lat, lon: ll.lng };
        const b = destino(c, 90, el.propiedades.radio); radio.setLatLng([b.lat, b.lon]);
        pintarElemento(el, [c]);
      });
      centro.on('dragend', () => { const q = iman(centro.getLatLng(), { excluir: el.id }); cambio('Mover círculo', () => moverPuntos(el, [q])); });
      radio.on('drag', () => { const ll = radio.getLatLng(); pintarElemento(el, pts, medir(pts[0], { lat: ll.lat, lon: ll.lng }).distancia); });
      radio.on('dragend', () => { const ll = radio.getLatLng(); const r = medir(pts[0], { lat: ll.lat, lon: ll.lng }).distancia; cambio('Cambiar radio', () => { el.propiedades.radio = r; tocar(el); }); });
      capaAsas.addLayer(centro).addLayer(radio);
      return;
    }
    const actuales = pts.slice();
    pts.forEach((p, i) => {
      const m = L.marker([p.lat, p.lon], { icon: asa('asa-vert'), draggable: true, title: 'Arrastra para mover · clic derecho para quitar' });
      m.on('dragstart', () => document.body.classList.add('arrastrando'));
      m.on('drag', () => { const ll = m.getLatLng(); actuales[i] = { lat: ll.lat, lon: ll.lng }; pintarElemento(el, actuales); mostrarIman(actuales[i], { excluir: el.id }); });
      m.on('dragend', () => { document.body.classList.remove('arrastrando'); actuales[i] = iman(m.getLatLng(), { excluir: el.id }); capaIman.clearLayers(); cambio('Mover vértice', () => moverPuntos(el, actuales)); });
      m.on('contextmenu', (e) => { L.DomEvent.preventDefault(e.originalEvent); quitarVertice(el, i); });
      capaAsas.addLayer(m);
    });
    const n = fijos(el) ? 0 : el.tipo === 'area' ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const mid = puntosGeodesica(a, b, 2)[1];
      const m = L.marker([mid.lat, mid.lon], { icon: asa('asa-media'), draggable: true, title: 'Añadir vértice' });
      const insertar = (q) => cambio('Añadir vértice', () => { const nuevos = pts.slice(); nuevos.splice(i + 1, 0, q); moverPuntos(el, nuevos); });
      m.on('click', () => insertar(mid));
      m.on('dragend', () => insertar(iman(m.getLatLng(), { excluir: el.id })));
      capaAsas.addLayer(m);
    }
  }

  /** Centro de un símbolo (media de sus puntos). */
  const centroDe = (pts) => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length });
  /** Orientación (rumbo, 0–359°) de un símbolo girable: `giro` si es de un punto; si no, rumbo de su primer tramo. */
  function orientacion(el) {
    const pts = puntosDe(el);
    if (pts.length === 1) return Math.round((((el.simbolo?.giro ?? 0) % 360) + 360) % 360);
    return Math.round(((medir(pts[0], pts[1]).rumbo % 360) + 360) % 360);
  }
  /** Muestra el símbolo girado `d` grados (sin guardar). */
  function verGirado(el, pts, d, centro) {
    if (pts.length === 1) { const g0 = el.simbolo.giro ?? 0; el.simbolo.giro = g0 + d; pintarElemento(el); el.simbolo.giro = g0; } else pintarElemento(el, simbolos.girarPuntos(pts, d, centro));
  }
  /** Gira y guarda (se puede deshacer). */
  function girarGuardar(el, pts, d, centro) {
    d = ((Math.round(d) % 360) + 540) % 360 - 180; if (!d) { pintarTodo(); return; }
    if (pts.length === 1) cambio('Girar', () => { el.simbolo.giro = ((((el.simbolo.giro ?? 0) + d) % 360) + 360) % 360; tocar(el); });
    else cambio('Girar', () => moverPuntos(el, simbolos.girarPuntos(pts, d, centro)));
  }
  const iman5 = (d, fino) => (fino ? Math.round(d) : Math.round(d / 5) * 5);
  let burbuja = null;
  function ponerBurbuja(q, texto) {
    if (!burbuja) { burbuja = document.createElement('div'); burbuja.className = 'giro-burbuja'; mapa.getContainer().parentElement.append(burbuja); }
    const r = mapa.getContainer().getBoundingClientRect(), c = mapa.getContainer().parentElement.getBoundingClientRect();
    burbuja.style.left = `${q.x + r.left - c.left}px`; burbuja.style.top = `${q.y + r.top - c.top}px`; burbuja.textContent = texto;
  }
  const quitarBurbuja = () => { burbuja?.remove(); burbuja = null; };

  /**
   * Asas de un símbolo girable: ↻ encima para girarlo (se arrastra alrededor
   * del centro, de 5 en 5 grados; con Mayús, de 1 en 1) y ✥ en el centro para
   * moverlo entero. El giro se ve en directo y se guarda al soltar.
   */
  function asasGiro(el) {
    const pts = puntosDe(el);
    const centro = centroDe(pts);
    const cpx = px(centro);
    const arriba = pts.length > 1 ? Math.min(...pts.map((p) => px(p).y)) : cpx.y;
    const radioPx = Math.max(46, cpx.y - Math.min(arriba, cpx.y) + 40);
    const pGiro = mapa.containerPointToLatLng([cpx.x, cpx.y - radioPx]);
    const giro = L.marker(pGiro, { icon: L.divIcon({ className: 'asa asa-giro', html: '↻', iconSize: [26, 26] }), keyboard: false, title: 'Girar' });
    const guia = L.polyline([[centro.lat, centro.lon], pGiro], { pane: 'borrador', color: '#E0B252', weight: 1.5, dashArray: '3 4', interactive: false });
    const angulo = (x, y) => (Math.atan2(x - cpx.x, -(y - cpx.y)) * 180) / Math.PI;
    giro.on('add', () => {
      const dom = giro.getElement(); if (!dom) return;
      L.DomEvent.disableClickPropagation(dom);
      dom.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        mapa.dragging.disable(); dom.setPointerCapture(e.pointerId); dom.classList.add('girando');
        document.body.classList.add('girando');
        const rc = mapa.getContainer().getBoundingClientRect();
        const a0 = angulo(e.clientX - rc.left, e.clientY - rc.top), o0 = orientacion(el);
        let d = 0;
        const mover = (ev) => {
          d = iman5(angulo(ev.clientX - rc.left, ev.clientY - rc.top) - a0, ev.shiftKey);
          const rad = ((angulo(ev.clientX - rc.left, ev.clientY - rc.top)) * Math.PI) / 180;
          const q = L.point(cpx.x + radioPx * Math.sin(rad), cpx.y - radioPx * Math.cos(rad));
          const ll = mapa.containerPointToLatLng(q);
          giro.setLatLng(ll); guia.setLatLngs([[centro.lat, centro.lon], ll]);
          verGirado(el, pts, d, centro);
          ponerBurbuja(q, `${(((o0 + d) % 360) + 360) % 360}°`);
        };
        const soltar = () => {
          dom.removeEventListener('pointermove', mover); dom.removeEventListener('pointerup', soltar); dom.removeEventListener('pointercancel', soltar);
          mapa.dragging.enable(); document.body.classList.remove('girando'); quitarBurbuja();
          girarGuardar(el, pts, d, centro);
        };
        dom.addEventListener('pointermove', mover); dom.addEventListener('pointerup', soltar); dom.addEventListener('pointercancel', soltar);
      });
    });
    capaAsas.addLayer(guia).addLayer(giro);
    if (pts.length > 1) {
      const mover = L.marker([centro.lat, centro.lon], { icon: L.divIcon({ className: 'asa asa-mover', html: '✥', iconSize: [24, 24] }), draggable: true, title: 'Arrastra para mover el símbolo entero' });
      const desplazar = () => { const ll = mover.getLatLng(); const dlat = ll.lat - centro.lat, dlon = ll.lng - centro.lon; return pts.map((p) => ({ lat: p.lat + dlat, lon: p.lon + dlon })); };
      mover.on('dragstart', () => document.body.classList.add('arrastrando'));
      mover.on('drag', () => pintarElemento(el, desplazar()));
      mover.on('dragend', () => { document.body.classList.remove('arrastrando'); cambio('Mover', () => moverPuntos(el, desplazar())); });
      capaAsas.addLayer(mover);
    }
  }

  function quitarVertice(el, i) {
    const pts = puntosDe(el);
    if (fijos(el)) { avisoBreve('Puntos fijos'); return; }
    if (pts.length <= TIPOS[el.tipo].min) { avisoBreve(`Una ${TIPOS[el.tipo].nombre.toLowerCase()} necesita al menos ${TIPOS[el.tipo].min} vértices`); return; }
    pts.splice(i, 1);
    cambio('Quitar vértice', () => moverPuntos(el, pts));
  }

  // ---------------------------------------------------------- selección
  function seleccionar(id, { centrar = false } = {}) {
    if (borrador) cancelarBorrador();
    seleccion = id && buscar(id) ? id : null;
    if (seleccion) tomarFicha(DUENO);
    capaCursorPerfil.clearLayers();
    pintarTodo(); pintarPanel(); avisar();
    const el = seleccion && buscar(seleccion);
    if (el && centrar) {
      const pts = el.tipo === 'circulo' ? puntosCirculo(puntosDe(el)[0], el.propiedades.radio, 36) : puntosDe(el);
      const b = L.latLngBounds(pts.map((p) => [p.lat, p.lon]));
      if (pts.length === 1) mapa.flyTo(b.getCenter(), Math.max(mapa.getZoom(), 14), { duration: 0.6 });
      else mapa.flyToBounds(b, { padding: [80, 80], maxZoom: 16, duration: 0.6 });
    }
  }
  alPerderFicha(DUENO, () => { if (seleccion || borrador) { seleccion = null; if (borrador) cancelarBorrador(); pintarTodo(); avisar(); } });

  // ---------------------------------------------------------- dibujar
  function empezar(tipo) {
    seleccion = null; tomarFicha(DUENO); pintarTodo(); avisar();
    borrador = { tipo, puntos: [], cursor: null };
    pintarBorrador(); pintarPanel();
  }
  function cancelarBorrador() { cerrarMenuPunto(); borrador = null; capaBorrador.clearLayers(); capaBorradorPuntos.clearLayers(); capaIman.clearLayers(); pintarPanel(); }

  /** Clic en el mapa (o en un punto del borrador) con una herramienta de dibujo. */
  /** El borrador en curso dibuja un símbolo (unidad, medida o cometido). */
  function ponerSimboloBorrador(simbolo, n = 0, ayuda = '', nombre = '') {
    if (!borrador) empezar(herramienta());
    Object.assign(borrador, { simbolo, n, ayuda, nombreSimbolo: nombre });
    pintarBorrador(); pintarPanel();
  }
  function clic(p0) {
    if (!borrador) empezar(herramienta());
    const b = borrador;
    const min = TIPOS[b.tipo].min;
    if (b.n && b.tipo !== 'punto') {
      const p = iman({ lat: p0.lat, lng: p0.lon }, {});
      if (b.puntos.length && px(p).distanceTo(px(b.puntos.at(-1))) < 3) return;
      b.puntos.push(p);
      if (b.puntos.length >= b.n) { terminar(b.puntos); return; }
      pintarBorrador(); pintarPanel(); return;
    }
    // ¿Termina? (clic sobre el último punto en línea; sobre el primero en área)
    if ((b.tipo === 'linea' || b.tipo === 'area') && b.puntos.length >= min) {
      const fin = b.tipo === 'area' ? b.puntos[0] : b.puntos.at(-1);
      if (px(p0).distanceTo(px(fin)) < 9) { terminar(b.puntos); return; }
    }
    const p = iman({ lat: p0.lat, lng: p0.lon }, { propios: b.tipo === 'linea' ? b.puntos.slice(0, -1) : [] });
    if (b.tipo === 'punto') { terminar([p]); return; }
    if (b.tipo === 'circulo') {
      if (!b.puntos.length) { b.puntos.push(p); pintarBorrador(); pintarPanel(); return; }
      const r = medir(b.puntos[0], p).distancia;
      if (r > 0) terminar(b.puntos, r);
      return;
    }
    if (b.puntos.length && px(p).distanceTo(px(b.puntos.at(-1))) < 3) return; // doble clic: no duplicar
    b.puntos.push(p);
    pintarBorrador(); pintarPanel();
  }
  function dobleClic() { if (borrador && (borrador.tipo === 'linea' || borrador.tipo === 'area')) terminar(borrador.puntos); }
  function quitarUltimo() { if (!borrador?.puntos.length) return false; borrador.puntos.pop(); pintarBorrador(); pintarPanel(); return true; }

  function terminar(pts, radio) {
    const b = borrador; if (!b) return;
    if (pts.length < TIPOS[b.tipo].min) { avisoBreve(`Faltan puntos: una ${TIPOS[b.tipo].nombre.toLowerCase()} necesita al menos ${TIPOS[b.tipo].min}`); return; }
    if (b.n && pts.length < b.n) { avisoBreve(`Faltan puntos: este símbolo necesita ${b.n}`); return; }
    const el = cambio(b.simbolo ? `Colocar ${b.nombreSimbolo || 'símbolo'}` : `Dibujar ${TIPOS[b.tipo].nombre.toLowerCase()}`, (p) => {
      const e = nuevoElemento(b.tipo, pts.slice(), { radio, bando: preferencias.bando, estado: preferencias.estado, paquete: activoValido() });
      if (b.simbolo) { e.simbolo = JSON.parse(JSON.stringify(b.simbolo)); simbolos?.alCrear(e); }
      p.elementos.push(e); return e;
    });
    borrador = null; capaBorrador.clearLayers(); capaBorradorPuntos.clearLayers(); capaIman.clearLayers();
    elegirHerramienta('consultar');
    seleccionar(el.id);
  }

  /** Paquete donde entra lo nuevo (si sigue existiendo). Si está oculto, se vuelve a mostrar. */
  function activoValido() {
    if (!activo || !buscarPaquete(plan, activo)) return null;
    const cadena = new Set(nombreRutaIds(activo));
    if (vista.ocultos.some((id) => cadena.has(id)) || (vista.solo && !cadena.has(vista.solo))) {
      vista.ocultos = vista.ocultos.filter((id) => !cadena.has(id));
      if (vista.solo && !cadena.has(vista.solo)) vista.solo = null;
      guardarVista();
    }
    return activo;
  }
  const nombreRutaIds = (id) => { const out = []; for (let o = buscarPaquete(plan, id); o && !out.includes(o.id); o = buscarPaquete(plan, o.padre)) out.push(o.id); return out; };

  /** Crea un elemento con símbolo ya colocado (clic con unidad elegida o arrastrar y soltar). */
  function crearConSimbolo(simbolo, pts, tipo, nombre = 'símbolo') {
    if (borrador) cancelarBorrador();
    const el = cambio(`Colocar ${nombre}`, (p) => {
      const e = nuevoElemento(tipo, pts.slice(), { bando: preferencias.bando, estado: preferencias.estado, paquete: activoValido() });
      e.simbolo = JSON.parse(JSON.stringify(simbolo)); simbolos?.alCrear(e);
      p.elementos.push(e); return e;
    });
    seleccionar(el.id);
    return el;
  }

  function moverCursor(p) {
    if (!HERRAMIENTAS_DIBUJO.includes(herramienta())) { capaIman.clearLayers(); return; }
    mostrarIman(p, { propios: borrador?.tipo === 'linea' ? borrador.puntos.slice(0, -1) : [] });
    if (!borrador || !borrador.puntos.length || arrastrandoPunto) return;
    borrador.cursor = p; pintarLineasBorrador(); pintarPanel(true);
  }

  // Puntos del borrador: arrastrar para mover; mantener pulsado para eliminar
  let menuAbierto = null, arrastrandoPunto = false;
  function pintarBorrador() {
    pintarLineasBorrador();
    pintarPuntosBorrador();
  }
  function pintarLineasBorrador() {
    capaBorrador.clearLayers();
    const b = borrador; if (!b || !b.puntos.length) return;
    const c = BANDOS[preferencias.bando].color;
    const est = { pane: 'borrador', color: c, weight: 3, interactive: false, dashArray: preferencias.estado === 'previsto' ? '12 8' : null };
    if (b.tipo === 'circulo') {
      if (b.cursor) {
        const r = medir(b.puntos[0], b.cursor).distancia;
        if (r > 0) L.polygon(puntosCirculo(b.puntos[0], r, 120).map((q) => [q.lat, q.lon]), { ...est, fillColor: c, fillOpacity: 0.08 }).addTo(capaBorrador);
        L.polyline([[b.puntos[0].lat, b.puntos[0].lon], [b.cursor.lat, b.cursor.lon]], { ...est, weight: 1.5, dashArray: '4 4' }).addTo(capaBorrador);
      }
    } else {
      const vivos = b.cursor ? [...b.puntos, b.cursor] : b.puntos;
      if (b.simbolo && simbolos?.previsualizar(capaBorrador, b.simbolo, vivos, c)) {
        L.polyline(vivos.map((q) => [q.lat, q.lon]), { ...est, weight: 1, dashArray: '2 4', opacity: 0.6 }).addTo(capaBorrador);
        return;
      }
      if (b.puntos.length > 1) L.polyline(b.puntos.map((q) => [q.lat, q.lon]), est).addTo(capaBorrador);
      if (b.cursor) {
        L.polyline([[b.puntos.at(-1).lat, b.puntos.at(-1).lon], [b.cursor.lat, b.cursor.lon]], { ...est, weight: 2, dashArray: '5 5', opacity: 0.8 }).addTo(capaBorrador);
        if (b.tipo === 'area' && b.puntos.length > 1) L.polyline([[b.cursor.lat, b.cursor.lon], [b.puntos[0].lat, b.puntos[0].lon]], { ...est, weight: 1.5, dashArray: '3 6', opacity: 0.6 }).addTo(capaBorrador);
      }
    }
  }
  function pintarPuntosBorrador() {
    capaBorradorPuntos.clearLayers();
    const b = borrador; if (!b) return;
    const c = BANDOS[preferencias.bando].color;
    b.puntos.forEach((p, i) => {
      const grande = i === 0 && b.tipo === 'area' && b.puntos.length >= 3;
      const m = L.marker([p.lat, p.lon], {
        pane: 'borrador', draggable: true, keyboard: false,
        icon: L.divIcon({ className: `asa asa-borrador${grande ? ' grande' : ''}`, iconSize: grande ? [16, 16] : [12, 12], html: `<i style="background:${c}"></i>` }),
        title: 'Arrastra para moverlo · mantén pulsado para eliminarlo',
      });
      let temporizador = 0, arrastrado = false;
      let largo = false;
      const iniciar = () => { arrastrado = false; largo = false; clearTimeout(temporizador); temporizador = setTimeout(() => { if (!arrastrado) { largo = true; abrirMenuPunto(i, p); } }, 550); };
      m.on('mousedown', iniciar);
      m.on('dragstart', () => { arrastrado = true; arrastrandoPunto = true; clearTimeout(temporizador); b.cursor = null; });
      m.on('mouseup', () => clearTimeout(temporizador));
      m.on('drag', () => { const ll = m.getLatLng(); b.puntos[i] = { lat: ll.lat, lon: ll.lng }; mostrarIman(b.puntos[i], { propios: b.puntos.filter((_, k) => k !== i) }); pintarLineasBorrador(); });
      m.on('dragend', () => { arrastrandoPunto = false; b.puntos[i] = iman(m.getLatLng(), { propios: b.puntos.filter((_, k) => k !== i) }); capaIman.clearLayers(); pintarBorrador(); pintarPanel(); });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); if (largo || menuAbierto) { largo = false; return; } clic(p); });
      m.on('contextmenu', (e) => { L.DomEvent.preventDefault(e.originalEvent); quitarUltimo(); });
      m.addTo(capaBorradorPuntos);
    });
  }
  /** Menú flotante (fuera del mapa, para que ningún clic del mapa lo cierre). */
  function abrirMenuPunto(i, p) {
    cerrarMenuPunto();
    const q = px(p);
    const m = document.createElement('div');
    m.className = 'menu-punto';
    m.style.left = `${q.x}px`; m.style.top = `${q.y}px`;
    m.innerHTML = '<button type="button" data-menu="eliminar">Eliminar punto</button><button type="button" data-menu="cerrar">Cancelar</button>';
    m.addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-menu]')?.dataset.menu; if (!a) return;
      if (a === 'eliminar' && borrador) { borrador.puntos.splice(i, 1); pintarBorrador(); pintarPanel(); }
      cerrarMenuPunto();
    });
    mapa.getContainer().parentElement.append(m);
    menuAbierto = m;
    setTimeout(() => document.addEventListener('pointerdown', fueraDelMenu, true), 0);
  }
  function fueraDelMenu(ev) { if (menuAbierto && !menuAbierto.contains(ev.target)) cerrarMenuPunto(); }
  function cerrarMenuPunto() {
    document.removeEventListener('pointerdown', fueraDelMenu, true);
    const viejo = menuAbierto;
    viejo?.remove();
    // Se olvida un instante después, para que el clic que lo cierra no añada un punto
    setTimeout(() => { if (menuAbierto === viejo) menuAbierto = null; }, 0);
  }

  // ---------------------------------------------------------- panel lateral
  const panel = $('panel-elemento');
  const esMio = () => panel.dataset.dueno === DUENO;

  function pintarPanel(soloMedidas) {
    if (borrador) {
      const b = borrador;
      const vivos = b.cursor ? [...b.puntos, b.cursor] : b.puntos;
      let medidas = '';
      if (b.tipo === 'circulo' && b.puntos.length) {
        const r = b.cursor ? medir(b.puntos[0], b.cursor).distancia : 0;
        medidas = `<div class="pm-total"><div class="grande">${r ? fmt.metros(r) : '—'}</div><div class="peq">Radio · Centro <b>${esc(fmt.coord(b.puntos[0]))}</b></div></div>`;
      } else if ((b.tipo === 'linea' || b.tipo === 'area') && vivos.length >= 2) {
        const tmp = { tipo: b.tipo === 'area' && vivos.length >= 3 ? 'area' : 'linea', propiedades: {} };
        tmp.geometria = tmp.tipo === 'area' ? { type: 'Polygon', coordinates: [[...vivos, vivos[0]].map((p) => [p.lon, p.lat])] } : { type: 'LineString', coordinates: vivos.map((p) => [p.lon, p.lat]) };
        const m = medidasDe(tmp);
        medidas = m.tipo === 'linea'
          ? `<div class="pm-total"><div class="grande">${fmt.metros(m.longitud)}</div><div class="peq">${b.cursor ? 'Hasta el cursor' : 'Distancia total'}</div></div>`
          : `<div class="pm-total"><div class="grande">${formatearArea(m.area)}</div><div class="peq">Perímetro ${fmt.metros(m.perimetro)}</div></div>`;
      }
      if (soloMedidas && esMio() && panel.querySelector('#dib-medidas')) { $('dib-medidas').innerHTML = medidas; return; }
      panel.dataset.dueno = DUENO;
      const tituloB = b.simbolo ? esc(b.nombreSimbolo || 'Símbolo nuevo') : { punto: 'Punto nuevo', linea: 'Línea nueva', area: 'Área nueva', circulo: 'Círculo nuevo' }[b.tipo];
      const cuenta = b.n ? `${b.puntos.length} de ${b.n} puntos` : b.puntos.length ? `${b.puntos.length} punto${b.puntos.length > 1 ? 's' : ''}` : '';
      panel.innerHTML = `<div class="pm-cab"><strong>${tituloB}</strong><span>${cuenta}</span></div>
        ${htmlColor({ bando: preferencias.bando }, 'pref-bando')}
        ${b.tipo === 'punto' ? `<div class="el-fila"><div class="seg" data-campo="pref-estado">${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === preferencias.estado}">${v.nombre}</button>`).join('')}</div></div>` : ''}
        <div id="dib-medidas">${medidas}</div>
        ${b.tipo === 'circulo' && b.puntos.length ? '<form class="el-radio" id="dib-radio"><label>Radio exacto <input type="number" min="1" step="any" inputmode="decimal" placeholder="metros" id="dib-radio-m"></label><button type="submit">Crear</button></form>' : ''}
        <div class="pm-acciones">${(b.tipo === 'linea' || b.tipo === 'area') && !b.n ? '<button type="button" data-acc="terminar">Terminar</button>' : ''}${b.tipo === 'linea' || b.tipo === 'area' ? '<button type="button" data-acc="quitar-ultimo">Quitar último</button>' : ''}<button type="button" data-acc="cancelar">Cancelar</button></div>`;
      panel.querySelector('.color-libre')?.remove(); // al dibujar, solo colores de bando
      mostrarPanel(true);
      return;
    }
    const el = seleccion && buscar(seleccion);
    if (!el) { if (esMio()) mostrarPanel(false); return; }
    if (soloMedidas) return;
    const pts = puntosDe(el);
    const est = estiloDe(el);
    const m = medidasDe(el);
    let cuerpo = '';
    if (el.tipo === 'punto') {
      cuerpo = `<div class="el-fila"><div class="seg" data-campo="el-estado">${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === el.propiedades.estado}">${v.nombre}</button>`).join('')}</div></div>
        <div class="pm-total"><div class="grande mgrs">${esc(fmt.coord(pts[0]))}</div></div>${htmlAltitud()}`;
    } else if (el.tipo === 'linea') {
      cuerpo = `${htmlLinea(pts, fmt)}${htmlTrazo(est, 'el')}`;
    } else if (el.tipo === 'area') {
      cuerpo = `<div class="pm-total"><div class="grande">${formatearArea(m.area)}</div><div class="peq">Perímetro ${fmt.metros(m.perimetro)}</div></div>${htmlTrazo(est, 'el')}${htmlRelleno(est, 'el')}`;
    } else {
      cuerpo = `<form class="el-radio" id="el-radio"><label>Radio <input type="number" min="1" step="any" inputmode="decimal" id="el-radio-m" value="${Number(el.propiedades.radio.toFixed(1))}"></label><span>m</span><button type="submit">Aplicar</button></form>
        <dl class="el-datos"><dt>Superficie</dt><dd>${formatearArea(m.area)}</dd><dt>Centro</dt><dd>${esc(fmt.coord(pts[0]))}</dd></dl>${htmlTrazo(est, 'el')}${htmlRelleno(est, 'el')}`;
    }
    const nVert = el.tipo === 'linea' || el.tipo === 'area';
    const fs = el.simbolo && simbolos?.ficha(el);
    if (fs) {
      const estado = `<div class="el-fila"><div class="seg" data-campo="el-estado">${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === el.propiedades.estado}">${v.nombre}</button>`).join('')}</div></div>`;
      const pos = el.tipo === 'punto' ? `<div class="pm-total"><div class="grande mgrs">${esc(fmt.coord(pts[0]))}</div></div>${htmlAltitud()}` : '';
      panel.dataset.dueno = DUENO;
      panel.innerHTML = `<div class="pm-cab"><strong><span class="muestra-bando" style="--c:${est.color}"></span>${esc(fs.titulo)}</strong><span>${esc(fs.tipo)}</span></div>
        ${fs.html}
        ${el.simbolo.clase === 'medida' ? htmlColor({ bando: el.propiedades.bando, color: el.propiedades.color }, 'el-bando') : ''}
        ${el.simbolo.clase === 'medida' && (el.tipo === 'area' || el.tipo === 'circulo') ? htmlRelleno({ relleno: el.propiedades.relleno ?? 0 }, 'el') : ''}
        ${estado}
        <label class="el-nombre">Nombre <input id="el-nombre" value="${esc(el.propiedades.nombre)}" placeholder="${el.simbolo.clase === 'unidad' ? 'Opcional' : `${esc(simbolos?.siglaDe?.(el) || 'Ej.: PL ROJA')} (si lo dejas vacío)`}" maxlength="60"></label>
        ${htmlPaquete(el)}
        ${pos}
        ${nVert ? `<details class="el-vert" ${verticesAbiertos ? 'open' : ''}><summary>Puntos (${pts.length})</summary><ol>${pts.map((p, i) => `<li><span class="v-letra">${i + 1}</span><code>${esc(fmt.coord(p))}</code>${fijos(el) ? '' : `<button type="button" data-quitar-v="${i}" title="Quitar punto" aria-label="Quitar punto">×</button>`}</li>`).join('')}</ol></details>` : ''}
        <div class="pm-acciones"><button type="button" data-acc="centrar">Centrar</button><button type="button" data-acc="duplicar">Duplicar</button><button type="button" data-acc="borrar" class="peligro">Borrar</button><button type="button" data-acc="cerrar">Cerrar</button></div>`;
      mostrarPanel(true);
      if (el.tipo === 'punto') rellenarAltitud(alturas, pts[0]);
      return;
    }
    panel.dataset.dueno = DUENO;
    panel.innerHTML = `<div class="pm-cab"><strong><span class="muestra-bando" style="--c:${est.color}"></span>${esc(titulo(el))}</strong><span>${TIPOS[el.tipo].nombre}</span></div>
      <label class="el-nombre">Nombre <input id="el-nombre" value="${esc(el.propiedades.nombre)}" placeholder="Sin nombre (ej.: PL ROJA, OBJ 1)" maxlength="60"></label>
      ${htmlPaquete(el)}
      ${htmlColor({ bando: el.propiedades.bando, color: el.propiedades.color }, 'el-bando')}
      ${cuerpo}
      ${nVert ? `<details class="el-vert" ${verticesAbiertos ? 'open' : ''}><summary>Puntos (${pts.length})</summary><ol>${pts.map((p, i) => `<li><span class="v-letra">${i + 1}</span><code>${esc(fmt.coord(p))}</code><button type="button" data-quitar-v="${i}" title="Quitar punto" aria-label="Quitar punto">×</button></li>`).join('')}</ol></details>` : ''}
      <div class="pm-acciones"><button type="button" data-acc="centrar">Centrar</button><button type="button" data-acc="borrar" class="peligro">Borrar</button><button type="button" data-acc="cerrar">Cerrar</button></div>`;
    mostrarPanel(true);
    if (el.tipo === 'punto') rellenarAltitud(alturas, pts[0]);
    if (el.tipo === 'linea') rellenarPerfil(pts, alturas, `plan/${el.id}/${el.version}`, marcarPerfil).catch(() => {});
  }

  /** Desplegable «Operación» de la ficha: en qué paquete está el objeto. */
  function htmlPaquete(el) {
    const ops = [];
    const rec = (padre, niv) => { for (const o of paquetes(plan).filter((x) => (x.padre ?? null) === padre)) { ops.push({ o, niv }); rec(o.id, niv + 1); } };
    rec(null, 0);
    const actual = el.paquete && buscarPaquete(plan, el.paquete) ? el.paquete : '';
    return `<label class="el-op"><span class="el-et">Operación</span><select id="el-paquete" class="v-select">
      <option value="">Ninguna</option>
      ${ops.map(({ o }) => `<option value="${o.id}" ${o.id === actual ? 'selected' : ''}>${esc(nombreRuta(plan, o.id))}</option>`).join('')}
      <option value="__nueva">+ Nueva operación…</option></select></label>
      ${actual ? `<label class="el-perm"><input type="checkbox" id="el-permanente" ${el.propiedades.permanente ? 'checked' : ''}><span>Vigente en todas las fases</span></label>` : ''}`;
  }

  function marcarPerfil(p) {
    capaCursorPerfil.clearLayers();
    if (p) L.circleMarker([p.lat, p.lon], { pane: 'borrador', radius: 6, color: '#fff', weight: 2, fillColor: '#0C2E4B', fillOpacity: 1, interactive: false }).addTo(capaCursorPerfil);
  }

  function mostrarPanel(si) {
    const antes = !panel.hidden;
    panel.hidden = !si;
    if (!si) delete panel.dataset.dueno;
    if (antes !== si) alCambiarPaneles();
  }

  panel.addEventListener('toggle', (ev) => { if (esMio() && ev.target.matches('.el-vert')) verticesAbiertos = ev.target.open; }, true);
  const tocarYPintar = (el) => (desc, fn) => cambio(desc, () => { fn(); tocar(el); });
  panel.addEventListener('click', (ev) => {
    if (!esMio()) return;
    const el = seleccion && buscar(seleccion);
    if (el?.simbolo && simbolos?.manejarFicha(ev, el, tocarYPintar(el))) return;
    const seg = ev.target.closest('.seg[data-campo] button');
    if (seg) {
      const campo = seg.parentElement.dataset.campo, v = seg.dataset.v;
      if (campo === 'pref-bando') { preferencias.bando = v; pintarBorrador(); pintarPanel(); return; }
      if (campo === 'pref-estado') { preferencias.estado = v; pintarPanel(); return; }
      if (!el) return;
      if (campo === 'el-bando') { preferencias.bando = v; cambio('Cambiar color', () => { el.propiedades.bando = v; el.propiedades.color = null; tocar(el); }); }
      if (campo === 'el-estado') { preferencias.estado = v; cambio('Cambiar estado', () => { el.propiedades.estado = v; tocar(el); }); }
      if (campo === 'el-trazo') cambio('Cambiar trazo', () => { el.propiedades.trazo = v; tocar(el); });
      if (campo === 'el-grosor') cambio('Cambiar grosor', () => { el.propiedades.grosor = Number(v); tocar(el); });
      return;
    }
    const q = ev.target.closest('[data-quitar-v]');
    if (q && el) { quitarVertice(el, Number(q.dataset.quitarV)); return; }
    const acc = ev.target.closest('[data-acc]')?.dataset.acc;
    if (!acc) return;
    if (acc === 'cancelar') { cancelarBorrador(); elegirHerramienta('consultar'); }
    if (acc === 'terminar' && borrador) terminar(borrador.puntos);
    if (acc === 'quitar-ultimo') quitarUltimo();
    if (acc === 'centrar' && el) seleccionar(el.id, { centrar: true });
    if (acc === 'borrar' && el) borrarSeleccion();
    if (acc === 'duplicar' && el) duplicar(el);
    if (acc === 'cerrar') seleccionar(null);
  });
  // Relleno: se ve en vivo al mover el deslizador; al soltar queda un solo paso de deshacer
  let rellenoAntes = null;
  panel.addEventListener('input', (ev) => {
    if (!esMio() || ev.target.dataset.campo !== 'el-relleno') return;
    const el = seleccion && buscar(seleccion); if (!el) return;
    if (rellenoAntes === null) rellenoAntes = el.propiedades.relleno;
    el.propiedades.relleno = Number(ev.target.value);
    ev.target.nextElementSibling.textContent = `${ev.target.value} %`;
    pintarElemento(el);
  });
  panel.addEventListener('change', (ev) => {
    if (!esMio()) return;
    const el = seleccion && buscar(seleccion);
    if (ev.target.dataset.campo === 'el-relleno' && el) {
      const v = Number(ev.target.value); el.propiedades.relleno = rellenoAntes; rellenoAntes = null;
      cambio('Cambiar relleno', () => { el.propiedades.relleno = v; tocar(el); });
      return;
    }
    if (el?.simbolo && simbolos?.manejarFicha(ev, el, tocarYPintar(el))) return;
    if (ev.target.id === 'el-nombre' && el) { const v = ev.target.value.trim(); cambio('Cambiar nombre', () => { el.propiedades.nombre = v; tocar(el); }); }
    if (ev.target.id === 'el-permanente' && el) { const v = ev.target.checked; cambio(v ? 'Vigente en todas las fases' : 'Solo en su fase', () => { el.propiedades.permanente = v || undefined; tocar(el); }); }
    if (ev.target.id === 'el-paquete' && el) {
      const v = ev.target.value;
      if (v === '__nueva') {
        preguntar({ titulo: 'Nueva operación', campo: { ayuda: 'Nombre' }, opciones: [{ v: 'crear', texto: 'Crear', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] })
          .then((r) => {
            if (!r) { pintarPanel(); return; }
            const o = cambio(`Crear «${r.texto || 'Operación'}»`, (p) => { const n = nuevoPaquete(p, r.texto || 'Operación'); asignar(p, [el.id], n.id); return n; });
            ponerActivo(o.id); avisoBreve(`«${o.nombre}» creada`);
          });
        return;
      }
      cambio(v ? `Meter en «${buscarPaquete(plan, v)?.nombre}»` : 'Sacar de la operación', (p) => asignar(p, [el.id], v || null));
    }
    if (ev.target.dataset.campo === 'el-bando-libre' && el) { const v = ev.target.value; cambio('Cambiar color', () => { el.propiedades.color = v; tocar(el); }); }
  });
  panel.addEventListener('submit', (ev) => {
    if (!esMio()) return;
    ev.preventDefault();
    const elS = seleccion && buscar(seleccion);
    if (elS?.simbolo && simbolos?.manejarFicha(ev, elS, tocarYPintar(elS))) return;
    if (ev.target.id === 'dib-radio' && borrador?.tipo === 'circulo' && borrador.puntos.length) {
      const r = Number(String($('dib-radio-m').value).replace(',', '.'));
      if (r > 0) terminar(borrador.puntos, r); else avisoBreve('Escribe un radio mayor que 0');
    }
    if (ev.target.id === 'el-radio') {
      const el = seleccion && buscar(seleccion);
      const r = Number(String($('el-radio-m').value).replace(',', '.'));
      if (el && r > 0) cambio('Cambiar radio', () => { el.propiedades.radio = r; tocar(el); });
    }
  });

  /** Copia desplazada unos metros (para repetir una unidad o una medida). */
  function duplicar(el) {
    const copia = JSON.parse(JSON.stringify(el));
    const d = Math.max(30, 40 * (156543.03 * Math.cos((puntosDe(el)[0].lat * Math.PI) / 180)) / 2 ** mapa.getZoom());
    const pts = puntosDe(el).map((p) => destino(p, 135, d));
    const nuevo = nuevoElemento(el.tipo, pts.map((q) => ({ lat: q.lat, lon: q.lon })), { radio: el.propiedades.radio, bando: el.propiedades.bando, estado: el.propiedades.estado });
    nuevo.propiedades = { ...copia.propiedades }; if (copia.simbolo) nuevo.simbolo = copia.simbolo;
    nuevo.paquete = copia.paquete ?? null;
    cambio('Duplicar', (p) => { p.elementos.push(nuevo); });
    seleccionar(nuevo.id);
  }

  function borrarSeleccion() {
    const el = seleccion && buscar(seleccion); if (!el) return;
    borrar([el.id]);
  }

  /**
   * Borra objetos. Si alguno está en una operación pregunta antes: quitarlo
   * solo del paquete (sigue en el mapa, suelto) o borrarlo del todo.
   * `modo`: 'preguntar' | 'paquete' | 'todo'. Devuelve lo que se hizo.
   */
  async function borrar(ids, modo = 'preguntar') {
    const els = ids.map(buscar).filter(Boolean); if (!els.length) return null;
    const enPaquete = els.filter((e) => e.paquete && buscarPaquete(plan, e.paquete));
    if (modo === 'preguntar' && enPaquete.length) {
      const uno = els.length === 1;
      const donde = [...new Set(enPaquete.map((e) => nombreRuta(plan, e.paquete)))];
      modo = await preguntar({
        titulo: uno ? `¿Borrar «${titulo(els[0])}»?` : `¿Borrar ${els.length} objetos?`,
        texto: `${uno ? 'Está' : `${enPaquete.length} están`} en ${donde.length === 1 ? `«${donde[0]}»` : `${donde.length} operaciones`}.`,
        opciones: [
          { v: 'paquete', texto: 'Quitar solo de la operación', detalle: 'Sigue en el mapa, sin operación' },
          { v: 'todo', texto: 'Borrar del todo', detalle: 'Desaparece del mapa y de la operación', clase: 'peligro' },
          { v: 'cancelar', texto: 'Cancelar' },
        ],
      });
      if (!modo) return null;
    }
    if (modo === 'paquete') {
      cambio(els.length === 1 ? `Quitar «${titulo(els[0])}» de su operación` : `Quitar ${els.length} objetos de su operación`, (p) => asignar(p, els.map((e) => e.id), null));
      avisoBreve(els.length === 1 ? `«${titulo(els[0])}» fuera de su operación` : `${els.length} objetos fuera de su operación`, { deshacer: true });
      return 'paquete';
    }
    const nombre = els.length === 1 ? `«${titulo(els[0])}»` : `${els.length} objetos`;
    const set = new Set(els.map((e) => e.id));
    cambio(`Borrar ${nombre}`, (p) => { p.elementos = p.elementos.filter((e) => !set.has(e.id)); });
    if (set.has(seleccion)) seleccion = null;
    resaltados = new Set([...resaltados].filter((id) => !set.has(id)));
    pintarTodo(); pintarPanel(); avisar();
    avisoBreve(`${nombre[0].toUpperCase()}${nombre.slice(1)} borrado${els.length > 1 ? 's' : ''}`, { deshacer: true });
    return 'todo';
  }

  // ---------------------------------------------------------- resumen (para listas)
  function resumen(el) {
    const m = medidasDe(el);
    if (m.tipo === 'punto') return fmt.coord(m.posicion);
    if (m.tipo === 'linea') return fmt.metros(m.longitud);
    if (m.tipo === 'area') return formatearArea(m.area);
    return `r ${fmt.metros(m.radio)}`;
  }
  /** Icono pequeño (símbolo APP-6 o forma). */
  function iconoDe(el) {
    if (el.simbolo && simbolos?.icono(el)) return simbolos.icono(el);
    const est = estiloDe(el);
    return `<svg class="forma${est.trazo !== 'continuo' ? ' previsto' : ''}" viewBox="0 0 24 24" style="--c:${est.color}">${ICONOS[el.tipo]}</svg>`;
  }

  // ---------------------------------------------------------- deshacer / rehacer
  function pintarBotones() {
    const d = $('deshacer'), r = $('rehacer');
    if (d) { d.disabled = !historial.puedeDeshacer; d.title = historial.puedeDeshacer ? `Deshacer: ${historial.ultimo} (Ctrl+Z)` : 'Nada que deshacer'; }
    if (r) { r.disabled = !historial.puedeRehacer; r.title = historial.puedeRehacer ? `Rehacer: ${historial.siguiente} (Ctrl+Y)` : 'Nada que rehacer'; }
  }
  const deshacer = () => { if (borrador) { quitarUltimo(); return; } const d = historial.deshacer(); if (d) avisoBreve(`Deshecho: ${d}`); };
  const rehacer = () => { const d = historial.rehacer(); if (d) avisoBreve(`Rehecho: ${d}`); };
  $('deshacer')?.addEventListener('click', deshacer);
  $('rehacer')?.addEventListener('click', rehacer);

  let tAviso = 0;
  /** Aviso corto abajo; con `deshacer`, lleva el botón para deshacer lo último. */
  function avisoBreve(texto, { deshacer: conDeshacer = false } = {}) {
    const t = $('aviso-breve'); if (!t) return;
    t.innerHTML = `<span>${esc(texto)}</span>${conDeshacer ? '<button type="button" data-deshacer>Deshacer</button>' : ''}`;
    t.hidden = false; clearTimeout(tAviso);
    tAviso = setTimeout(() => { t.hidden = true; }, conDeshacer ? 5000 : 2600);
  }
  $('aviso-breve')?.addEventListener('click', (e) => { if (e.target.closest('[data-deshacer]')) { $('aviso-breve').hidden = true; historial.deshacer(); } });

  // ---------------------------------------------------------- teclado
  document.addEventListener('keydown', (e) => {
    const escribiendo = (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !escribiendo && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); return; }
    if (mod && !escribiendo && e.key.toLowerCase() === 'y') { e.preventDefault(); rehacer(); return; }
    if (escribiendo) return;
    if (borrador) {
      if (e.key === 'Enter') { e.preventDefault(); if (borrador.tipo === 'linea' || borrador.tipo === 'area') terminar(borrador.puntos); }
      if (e.key === 'Escape') { cancelarBorrador(); elegirHerramienta('consultar'); }
      if (e.key === 'Backspace') { e.preventDefault(); quitarUltimo(); }
      return;
    }
    if (seleccion && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); borrarSeleccion(); }
    if (seleccion && e.key === 'Escape') seleccionar(null);
  });

  pintarTodo(); avisar(); pintarBotones();
  const arrastrandoAlgo = () => document.body.classList.contains('arrastrando');

  return {
    plan: () => plan, historial,
    clic, dobleClic, moverCursor, quitarUltimo, ponerSimboloBorrador,
    herramientaCambiada(h) {
      if (HERRAMIENTAS_DIBUJO.includes(h)) { empezar(h); return; }
      if (borrador) cancelarBorrador();
      capaIman.clearLayers();
      if (h === 'medir' && seleccion) seleccionar(null);
    },
    quitarSeleccion() { if (!seleccion) return false; seleccionar(null); return true; },
    seleccionar, avisoBreve,
    /** Añade elementos al plan (p. ej. copiados de lo importado). */
    anadir(elementos, desc = 'Añadir al plan') {
      return cambio(desc, (p) => { for (const e of elementos) p.elementos.push(e); return elementos; });
    },
    refrescar() { pintarTodo(); pintarPanel(); avisar(); },
    /** Guarda el plan en este navegador sin repintar ni dejar paso de deshacer (lo usa la OPORD, que lleva su propio registro). */
    guardar() { try { localStorage.setItem(CLAVE_PLAN, JSON.stringify(plan)); } catch { /* sin sitio */ } },
    /** Vuelve a pintar el mapa (al cambiar el zoom: tamaños y rótulos). */
    repintar() { if (!arrastrandoAlgo()) pintarTodo(); },
    crearConSimbolo, puntosDe,
    moverTodo(el, pts, desc = 'Mover') { cambio(desc, () => moverPuntos(el, pts)); },
    get dibujando() { return Boolean(borrador); },
    get seleccion() { return seleccion; },
    // ---- operaciones, listas y selección múltiple
    /** Cambio que se puede deshacer (para otros paneles). */
    cambio,
    /** Llama a `f` cada vez que cambia algo (plan, selección, vista). Devuelve cómo dejar de escuchar. */
    suscribir(f) { oyentes.add(f); return () => oyentes.delete(f); },
    borrar, titulo, resumen, iconoDe, visible, orientacion,
    /** Vista de este usuario: { ocultos, solo, sueltosOcultos }. */
    get vista() { return vista; },
    ponerVista(cambios) { Object.assign(vista, cambios); vista.ocultos = [...new Set(vista.ocultos)]; guardarVista(); pintarTodo(); pintarPanel(); avisar(); },
    get activo() { return activo && buscarPaquete(plan, activo) ? activo : null; },
    ponerActivo,
    /** Marca objetos en el mapa con un halo (lazo, selección en Objetos). */
    resaltar(ids) { resaltados = new Set(ids); pintarTodo(); },
    get resaltados() { return [...resaltados]; },
    /** Encuadra unos objetos. */
    encuadrar(ids) {
      const pts = ids.map(buscar).filter(Boolean).flatMap((el) => (el.tipo === 'circulo' ? puntosCirculo(puntosDe(el)[0], el.propiedades.radio, 24) : puntosDe(el)));
      if (!pts.length) return;
      const b = L.latLngBounds(pts.map((p) => [p.lat, p.lon]));
      if (pts.length === 1) mapa.flyTo(b.getCenter(), Math.max(mapa.getZoom(), 14), { duration: 0.6 });
      else mapa.flyToBounds(b, { padding: [90, 90], maxZoom: 16, duration: 0.6 });
    },
  };
}
