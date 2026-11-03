// Regla (herramienta Medir): distancias y rumbos sin guardar en el plan.
//   - Clic: punto. Botón derecho: deshace el último. Doble clic: termina.
//   - Sobre cada tramo, en su mitad, la distancia en una píldora de vidrio.
//   - Una medida terminada se queda en el mapa; al pincharla sale su ficha
//     como la de un track: distancia, desnivel, perfil y tramos. Desde ahí se
//     guarda como línea o se quita.
// Todas las medidas salen del motor geodésico (elipsoide WGS84).

import { medir, puntosGeodesica, longitudLinea } from '../geo/index.js';
import { nuevoElemento } from '../plan/plan.js';
import { tomarFicha, alPerderFicha, htmlLinea, rellenarPerfil } from './ficha.js';

const ROJO = '#A3362B';
const DUENO = 'regla';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {object} o
 * @param {*} o.L @param {*} o.mapa @param {*} o.alturas @param {*} o.dibujo
 * @param {{metros, coord, rumbo}} o.fmt
 * @param {() => string} o.herramienta
 * @param {(h:string) => void} o.elegirHerramienta
 * @param {() => void} [o.alCambiarPaneles]
 */
export function iniciarRegla({ L, mapa, alturas, dibujo, fmt, herramienta, elegirHerramienta, alCambiarPaneles = () => {} }) {
  const $ = (id) => document.getElementById(id);
  if (!mapa.getPane('rotulos')) { const p = mapa.createPane('rotulos'); p.style.zIndex = 466; p.style.pointerEvents = 'none'; }
  if (!mapa.getPane('regla')) mapa.createPane('regla').style.zIndex = 462;
  const capa = L.layerGroup().addTo(mapa);
  const medida = [];          // la que se está midiendo
  const terminadas = [];      // [{ id, puntos }]
  let cursor = null, sel = null;
  const px = (p) => mapa.latLngToContainerPoint([p.lat, p.lon]);

  // ---------------------------------------------------------- pintar
  /** Distancia de un tramo encima de la línea, en su mitad, girada con ella. */
  function rotulo(a, b, texto, { tenue = false } = {}) {
    const pa = px(a), pb = px(b);
    if (pa.distanceTo(pb) < 46) return null;
    const m = puntosGeodesica(a, b, 2)[1], pm = px(m);
    let ang = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const r = (ang * Math.PI) / 180, n = L.point(Math.sin(r), -Math.cos(r)); // normal hacia «arriba» del texto
    const q = mapa.containerPointToLatLng(pm.add(n.multiplyBy(13)));
    return L.marker(q, { pane: 'rotulos', interactive: false, keyboard: false, icon: L.divIcon({ className: 'etq-ancla', html: `<span class="etq-linea etq-regla${tenue ? ' tenue' : ''}" style="color:${ROJO};transform:translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)">${esc(texto)}</span>`, iconSize: null }) });
  }
  function tramos(pts, g, opc = {}) {
    for (let i = 1; i < pts.length; i++) {
      const linea = L.polyline(puntosGeodesica(pts[i - 1], pts[i], 16).map((q) => [q.lat, q.lon]), { pane: 'regla', color: ROJO, weight: opc.sel ? 4 : 3, opacity: 0.92, interactive: false, dashArray: opc.provisional ? '6 6' : null });
      g.addLayer(linea);
      const t = rotulo(pts[i - 1], pts[i], fmt.metros(medir(pts[i - 1], pts[i]).distancia), { tenue: opc.provisional });
      if (t) g.addLayer(t);
    }
  }
  function pintar() {
    capa.clearLayers();
    for (const t of terminadas) {
      const g = L.layerGroup();
      if (t.id === sel) g.addLayer(L.polyline(t.puntos.map((p) => [p.lat, p.lon]), { pane: 'regla', color: '#E0B252', weight: 9, opacity: 0.6, interactive: false }));
      tramos(t.puntos, g, { sel: t.id === sel });
      t.puntos.forEach((p) => g.addLayer(L.circleMarker([p.lat, p.lon], { pane: 'regla', radius: 4, color: '#fff', weight: 2, fillColor: ROJO, fillOpacity: 1, interactive: false })));
      // Zona de clic (ancha e invisible)
      const clic = L.polyline(t.puntos.map((p) => [p.lat, p.lon]), { pane: 'regla', color: ROJO, weight: 16, opacity: 0, bubblingMouseEvents: false });
      clic.on('click', (e) => { if (herramienta() !== 'consultar') return; L.DomEvent.stopPropagation(e); seleccionar(t.id); });
      g.addLayer(clic);
      g.addTo(capa);
    }
    if (!medida.length) return;
    const g = L.layerGroup().addTo(capa);
    tramos(medida, g);
    if (cursor && herramienta() === 'medir') tramos([medida.at(-1), cursor], g, { provisional: true });
    medida.forEach((p) => g.addLayer(L.circleMarker([p.lat, p.lon], { pane: 'regla', radius: 5, color: '#fff', weight: 2, fillColor: ROJO, fillOpacity: 1, interactive: false })));
    pintarVentana();
  }
  mapa.on('zoomend', pintar);

  // Ventana «Regla» mientras se mide: el total y los tramos
  function pintarVentana() {
    const cuerpo = $('pm-cuerpo'); if (!cuerpo) return;
    const vivos = cursor && herramienta() === 'medir' && medida.length ? [...medida, cursor] : medida;
    if (vivos.length < 2) { cuerpo.innerHTML = ''; $('pm-ayuda').textContent = ''; return; }
    $('pm-ayuda').textContent = `${medida.length} punto${medida.length === 1 ? '' : 's'}`;
    cuerpo.innerHTML = `<div class="pm-total"><div class="grande">${fmt.metros(longitudLinea(vivos))}</div></div>${tablaTramos(medida)}`;
  }
  function tablaTramos(pts) {
    if (pts.length < 2) return '';
    const filas = [];
    for (let i = 1; i < pts.length; i++) {
      const r = medir(pts[i - 1], pts[i]);
      filas.push(`<tr><td>${i}</td><td>${fmt.metros(r.distancia)}</td><td>${fmt.rumbo(r.rumbo)}</td><td>${fmt.rumbo(r.rumboCuadricula)}</td></tr>`);
    }
    return `<table class="pm-tramos"><thead><tr><th>Tramo</th><th>Distancia</th><th>Rumbo geo</th><th>Rumbo cuad.</th></tr></thead><tbody>${filas.join('')}</tbody></table>`;
  }

  // ---------------------------------------------------------- medir
  function clic(p) {
    if (medida.length && px(p).distanceTo(px(medida.at(-1))) < 4) return; // el doble clic manda dos clics
    medida.push(p); pintar();
  }
  function quitarUltimo() { if (!medida.length) return false; medida.pop(); pintar(); return true; }
  function terminar() {
    if (medida.length < 2) { medida.length = 0; pintar(); return; }
    const t = { id: `m${Date.now()}`, puntos: medida.splice(0) };
    terminadas.push(t);
    cursor = null;
    elegirHerramienta('consultar');
    pintar();
  }
  function moverCursor(p) {
    if (herramienta() !== 'medir' || !medida.length) return;
    cursor = p; pintar();
  }

  // ---------------------------------------------------------- ficha de una medida terminada
  const panel = $('panel-elemento');
  const esMio = () => panel.dataset.dueno === DUENO;
  function seleccionar(id) {
    sel = id;
    const t = terminadas.find((x) => x.id === id);
    if (!t) { cerrarFicha(); return; }
    dibujo.quitarSeleccion();
    tomarFicha(DUENO);
    panel.dataset.dueno = DUENO;
    panel.innerHTML = `<div class="pm-cab v-cab"><strong><span class="muestra-bando" style="--c:${ROJO}"></span>Medida</strong><span class="v-sub">${t.puntos.length} puntos</span><button type="button" class="pm-x" data-regla="cerrar" aria-label="Cerrar">×</button></div>
      ${htmlLinea(t.puntos, fmt)}
      ${tablaTramos(t.puntos)}
      <div class="pm-acciones"><button type="button" data-regla="guardar">Guardar como línea</button><button type="button" data-regla="quitar" class="peligro">Quitar</button></div>`;
    panel.hidden = false; alCambiarPaneles();
    pintar();
    rellenarPerfil(t.puntos, alturas, `regla/${t.id}`, marcarPerfil).catch(() => {});
  }
  const capaCursor = L.layerGroup().addTo(mapa);
  function marcarPerfil(p) {
    capaCursor.clearLayers();
    if (p) L.circleMarker([p.lat, p.lon], { pane: 'regla', radius: 6, color: '#fff', weight: 2, fillColor: '#0C2E4B', fillOpacity: 1, interactive: false }).addTo(capaCursor);
  }
  function cerrarFicha() {
    capaCursor.clearLayers();
    if (sel) { sel = null; pintar(); }
    if (esMio()) { panel.hidden = true; delete panel.dataset.dueno; alCambiarPaneles(); }
  }
  alPerderFicha(DUENO, () => { capaCursor.clearLayers(); if (sel) { sel = null; pintar(); } });
  panel.addEventListener('click', (ev) => {
    if (!esMio()) return;
    const a = ev.target.closest('[data-regla]')?.dataset.regla; if (!a) return;
    const t = terminadas.find((x) => x.id === sel);
    if (a === 'cerrar') cerrarFicha();
    if (a === 'quitar' && t) { terminadas.splice(terminadas.indexOf(t), 1); cerrarFicha(); pintar(); }
    if (a === 'guardar' && t) {
      const el = nuevoElemento('linea', t.puntos.map((p) => ({ lat: p.lat, lon: p.lon })), { nombre: 'Medida', paquete: dibujo.activo ?? null });
      dibujo.anadir([el], 'Guardar medida como línea');
      terminadas.splice(terminadas.indexOf(t), 1); sel = null; pintar();
      dibujo.seleccionar(el.id);
    }
  });

  return {
    clic, quitarUltimo, terminar, moverCursor, pintar,
    get medida() { return medida; },
    get terminadas() { return terminadas; },
    /** Al cambiar de herramienta: lo que se estaba midiendo sin terminar se descarta. */
    herramientaCambiada(h) {
      if (h === 'medir') { cerrarFicha(); pintar(); return; }
      if (medida.length >= 2) { terminadas.push({ id: `m${Date.now()}`, puntos: medida.splice(0) }); }
      medida.length = 0; cursor = null; pintar();
    },
    /** Esc: borra lo que se está midiendo; si no hay nada, deja la herramienta. */
    escape() { if (medida.length) { medida.length = 0; cursor = null; pintar(); } else elegirHerramienta('consultar'); },
    nueva() { medida.length = 0; cursor = null; pintar(); },
    seleccionar,
  };
}
