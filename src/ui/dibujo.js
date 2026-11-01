// Fase 3: dibujar y editar sobre el mapa (punto, línea, área, círculo).
//
// Todo lo que se ve se calcula con el motor geodésico: las líneas siguen la
// geodésica entre vértices, el círculo es un polígono cuyos vértices están
// exactamente a la distancia del radio y las medidas salen de src/plan.
// Usa Leaflet (global L).

import { puntosGeodesica, destino, medir } from '../geo/index.js';
import {
  crearPlan, nuevoElemento, puntosDe, moverPuntos, medidasDe, puntosCirculo,
  Historial, formatearArea, esPlan, tocar, TIPOS, BANDOS, ESTADOS,
} from '../plan/plan.js';

const CLAVE_PLAN = 'spa.plan.actual';
export const HERRAMIENTAS_DIBUJO = ['punto', 'linea', 'area', 'circulo'];

/**
 * @param {object} o
 * @param {*} o.L Leaflet
 * @param {*} o.mapa mapa Leaflet
 * @param {() => string} o.herramienta herramienta activa
 * @param {(h:string) => void} o.elegirHerramienta
 * @param {{metros, rumbo, mgrs, unidadAngulo}} o.fmt formatos (según preferencias)
 * @param {() => void} o.alCambiarPaneles para recolocar etiquetas de cuadrícula
 */
export function iniciarDibujo({ L, mapa, herramienta, elegirHerramienta, fmt, alCambiarPaneles = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const px = (p) => mapa.latLngToContainerPoint([p.lat, p.lon]);

  // ---------------------------------------------------------- plan y guardado local
  let plan = null;
  try { const g = JSON.parse(localStorage.getItem(CLAVE_PLAN) || 'null'); if (esPlan(g)) plan = g; } catch { /* sin almacenamiento */ }
  plan ??= crearPlan('Plan de trabajo');
  const historial = new Historial(plan, {
    alCambiar: () => {
      try { localStorage.setItem(CLAVE_PLAN, JSON.stringify(plan)); } catch { /* nada */ }
      if (seleccion && !buscar(seleccion)) seleccion = null;
      pintarTodo(); pintarPanel(); pintarLista(); pintarBotones();
    },
  });
  const buscar = (id) => plan.elementos.find((e) => e.id === id);
  const cambio = (desc, fn) => historial.hacer(desc, fn);

  // ---------------------------------------------------------- capas
  for (const [nombre, z] of [['elementos', 460], ['borrador', 470]]) {
    if (!mapa.getPane(nombre)) mapa.createPane(nombre).style.zIndex = z;
  }
  const capaElementos = L.layerGroup().addTo(mapa);
  const capaAsas = L.layerGroup().addTo(mapa);
  const capaBorrador = L.layerGroup().addTo(mapa);
  const capasDe = new Map(); // id → layerGroup

  let seleccion = null;      // id del elemento seleccionado
  let borrador = null;       // { tipo, puntos, cursor }
  let preferencias = { bando: 'propio', estado: 'presente' };
  let verticesAbiertos = false;

  const color = (el) => BANDOS[el.propiedades.bando]?.color ?? BANDOS.propio.color;
  const discontinuo = (el) => (el.propiedades.estado === 'previsto' ? '10 7' : null);
  const numero = (el) => plan.elementos.filter((e) => e.tipo === el.tipo).indexOf(el) + 1;
  const titulo = (el) => el.propiedades.nombre || `${TIPOS[el.tipo].nombre} ${numero(el)}`;

  /** Coordenadas de dibujo (siguiendo la geodésica) de una lista de puntos. */
  function trazo(puntos, cerrar = false) {
    const pts = cerrar ? [...puntos, puntos[0]] : puntos;
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const seg = puntosGeodesica(pts[i - 1], pts[i], 16);
      (i === 1 ? seg : seg.slice(1)).forEach((q) => out.push([q.lat, q.lon]));
    }
    if (pts.length === 1) out.push([pts[0].lat, pts[0].lon]);
    return out;
  }

  /** Mitad del tramo más largo de una línea: ahí va el nombre, lejos de los vértices. */
  function centroTramoLargo(puntos) {
    let mejor = 1, max = -1;
    for (let i = 1; i < puntos.length; i++) {
      const d = medir(puntos[i - 1], puntos[i]).distancia;
      if (d > max) { max = d; mejor = i; }
    }
    const m = puntosGeodesica(puntos[mejor - 1], puntos[mejor], 2)[1];
    return [m.lat, m.lon];
  }

  function etiqueta(pos, texto, el) {
    return L.marker(pos, {
      pane: 'elementos', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'etq-ancla', html: `<span class="etq-elem" style="--c:${color(el)}">${esc(texto)}</span>`, iconSize: null }),
    });
  }

  /** Dibuja un elemento con los puntos dados (los del elemento o los provisionales al arrastrar). */
  function pintarElemento(el, puntos = puntosDe(el), radio = el.propiedades.radio) {
    capasDe.get(el.id)?.remove();
    const g = L.layerGroup();
    const sel = el.id === seleccion;
    const c = color(el);
    const base = { pane: 'elementos', color: c, weight: sel ? 4 : 3, opacity: 1, dashArray: discontinuo(el), lineJoin: 'round', bubblingMouseEvents: true };
    const halo = { pane: 'elementos', color: sel ? '#E0B252' : '#ffffff', weight: sel ? 9 : 7, opacity: sel ? 0.95 : 0.7, interactive: false, lineJoin: 'round' };

    if (el.tipo === 'punto') {
      const m = L.marker([puntos[0].lat, puntos[0].lon], {
        pane: 'elementos', bubblingMouseEvents: true, draggable: sel, keyboard: false,
        icon: L.divIcon({
          className: 'etq-ancla',
          html: `<span class="pto-elem${sel ? ' sel' : ''}${el.propiedades.estado === 'previsto' ? ' previsto' : ''}" style="--c:${c}"><i></i>${el.propiedades.nombre ? `<b>${esc(el.propiedades.nombre)}</b>` : ''}</span>`,
          iconSize: null,
        }),
      });
      if (sel) {
        m.on('drag', () => { const ll = m.getLatLng(); pintarPanel([{ lat: ll.lat, lon: ll.lng }]); });
        m.on('dragend', () => { const ll = m.getLatLng(); cambio('Mover punto', () => moverPuntos(el, [{ lat: ll.lat, lon: ll.lng }])); });
      }
      engancharClic(m, el);
      g.addLayer(m);
    } else {
      let coords;
      if (el.tipo === 'circulo') coords = puntosCirculo(puntos[0], radio, 180).map((q) => [q.lat, q.lon]);
      else coords = trazo(puntos, el.tipo === 'area');
      const relleno = el.tipo !== 'linea';
      g.addLayer(L.polyline(relleno ? [...coords, coords[0]] : coords, halo));
      const forma = relleno
        ? L.polygon(coords, { ...base, fillColor: c, fillOpacity: sel ? 0.18 : 0.1 })
        : L.polyline(coords, base);
      engancharClic(forma, el);
      g.addLayer(forma);
      if (el.tipo === 'circulo') g.addLayer(L.circleMarker([puntos[0].lat, puntos[0].lon], { pane: 'elementos', radius: 2.5, color: c, fillColor: c, fillOpacity: 1, weight: 1, interactive: false }));
      if (el.propiedades.nombre) {
        const pos = relleno ? (el.tipo === 'circulo' ? [puntos[0].lat, puntos[0].lon] : L.latLngBounds(coords).getCenter()) : centroTramoLargo(puntos);
        g.addLayer(etiqueta(pos, el.propiedades.nombre, el));
      }
    }
    g.addTo(capaElementos);
    capasDe.set(el.id, g);
  }

  function engancharClic(capa, el) {
    capa.on('click', (e) => {
      if (herramienta() !== 'consultar') return;  // dibujando: el clic sigue al mapa
      L.DomEvent.stopPropagation(e);
      seleccionar(el.id);
    });
  }

  function pintarTodo() {
    capaElementos.clearLayers(); capasDe.clear();
    for (const el of plan.elementos) pintarElemento(el);
    pintarAsas();
  }

  // ---------------------------------------------------------- asas de edición
  const asa = (cls) => L.divIcon({ className: `asa ${cls}`, iconSize: cls === 'asa-media' ? [11, 11] : [14, 14] });

  function pintarAsas() {
    capaAsas.clearLayers();
    const el = seleccion && buscar(seleccion);
    if (!el || el.tipo === 'punto') return;
    const pts = puntosDe(el);

    if (el.tipo === 'circulo') {
      const centro = L.marker([pts[0].lat, pts[0].lon], { icon: asa('asa-centro'), draggable: true, title: 'Arrastra para mover el círculo' });
      const borde = destino(pts[0], 90, el.propiedades.radio);
      const radio = L.marker([borde.lat, borde.lon], { icon: asa('asa-radio'), draggable: true, title: 'Arrastra para cambiar el radio' });
      centro.on('drag', () => {
        const ll = centro.getLatLng(); const c = { lat: ll.lat, lon: ll.lng };
        const b = destino(c, 90, el.propiedades.radio); radio.setLatLng([b.lat, b.lon]);
        pintarElemento(el, [c]); pintarPanel([c]);
      });
      centro.on('dragend', () => { const ll = centro.getLatLng(); cambio('Mover círculo', () => moverPuntos(el, [{ lat: ll.lat, lon: ll.lng }])); });
      radio.on('drag', () => {
        const ll = radio.getLatLng(); const r = medir(pts[0], { lat: ll.lat, lon: ll.lng }).distancia;
        pintarElemento(el, pts, r); pintarPanel(pts, r);
      });
      radio.on('dragend', () => {
        const ll = radio.getLatLng(); const r = medir(pts[0], { lat: ll.lat, lon: ll.lng }).distancia;
        cambio('Cambiar radio', () => { el.propiedades.radio = r; tocar(el); });
      });
      capaAsas.addLayer(centro).addLayer(radio);
      return;
    }

    const actuales = pts.slice();
    pts.forEach((p, i) => {
      const m = L.marker([p.lat, p.lon], { icon: asa('asa-vert'), draggable: true, title: 'Arrastra para mover · clic derecho para quitar' });
      m.on('drag', () => { const ll = m.getLatLng(); actuales[i] = { lat: ll.lat, lon: ll.lng }; pintarElemento(el, actuales); pintarPanel(actuales); });
      m.on('dragend', () => cambio('Mover vértice', () => moverPuntos(el, actuales)));
      m.on('contextmenu', (e) => { L.DomEvent.preventDefault(e.originalEvent); quitarVertice(el, i); });
      capaAsas.addLayer(m);
    });
    // Puntos medios: clic para añadir un vértice, o arrastrar para colocarlo
    const n = el.tipo === 'area' ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const mid = puntosGeodesica(a, b, 2)[1];
      const m = L.marker([mid.lat, mid.lon], { icon: asa('asa-media'), draggable: true, title: 'Clic o arrastra para añadir un vértice' });
      const insertar = (q) => cambio('Añadir vértice', () => { const nuevos = pts.slice(); nuevos.splice(i + 1, 0, q); moverPuntos(el, nuevos); });
      m.on('click', () => insertar(mid));
      m.on('dragend', () => { const ll = m.getLatLng(); insertar({ lat: ll.lat, lon: ll.lng }); });
      capaAsas.addLayer(m);
    }
  }

  function quitarVertice(el, i) {
    const pts = puntosDe(el);
    if (pts.length <= TIPOS[el.tipo].min) { avisoBreve(`Una ${TIPOS[el.tipo].nombre.toLowerCase()} necesita al menos ${TIPOS[el.tipo].min} vértices`); return; }
    pts.splice(i, 1);
    cambio('Quitar vértice', () => moverPuntos(el, pts));
  }

  // ---------------------------------------------------------- selección
  function seleccionar(id, { centrar = false } = {}) {
    if (borrador) cancelarBorrador();
    seleccion = id && buscar(id) ? id : null;
    pintarTodo(); pintarPanel(); pintarLista();
    const el = seleccion && buscar(seleccion);
    if (el && centrar) {
      const pts = el.tipo === 'circulo' ? puntosCirculo(puntosDe(el)[0], el.propiedades.radio, 36) : puntosDe(el);
      const b = L.latLngBounds(pts.map((p) => [p.lat, p.lon]));
      if (pts.length === 1) mapa.flyTo(b.getCenter(), Math.max(mapa.getZoom(), 14), { duration: 0.6 });
      else mapa.flyToBounds(b, { padding: [80, 80], maxZoom: 16, duration: 0.6 });
    }
  }

  // ---------------------------------------------------------- dibujar
  function empezar(tipo) {
    seleccion = null; pintarTodo(); pintarLista();
    borrador = { tipo, puntos: [], cursor: null };
    pintarBorrador(); pintarPanel();
  }

  function cancelarBorrador() {
    borrador = null; capaBorrador.clearLayers(); pintarPanel();
  }

  /** Clic en el mapa con una herramienta de dibujo. */
  function clic(p) {
    if (!borrador) empezar(herramienta());
    const b = borrador;
    if (b.tipo === 'punto') { terminar([p]); return; }
    if (b.tipo === 'circulo') {
      if (!b.puntos.length) { b.puntos.push(p); pintarBorrador(); pintarPanel(); return; }
      const r = medir(b.puntos[0], p).distancia;
      if (r > 0) terminar(b.puntos, r);
      return;
    }
    // Línea / área: clic sobre el último vértice (línea) o el primero (área) termina
    const min = TIPOS[b.tipo].min;
    if (b.puntos.length >= min) {
      const q = px(p);
      const fin = b.tipo === 'area' ? b.puntos[0] : b.puntos.at(-1);
      if (q.distanceTo(px(fin)) < 9) { terminar(b.puntos); return; }
    }
    b.puntos.push(p);
    pintarBorrador(); pintarPanel();
  }

  /** Doble clic: termina (Leaflet ya ha añadido los dos clics; se quitan duplicados). */
  function dobleClic() {
    if (!borrador || !['linea', 'area'].includes(borrador.tipo)) return;
    terminar(borrador.puntos);
  }

  function sinDuplicados(pts) {
    const out = [];
    for (const p of pts) if (!out.length || px(p).distanceTo(px(out.at(-1))) >= 5) out.push(p);
    return out;
  }

  function terminar(puntos, radio) {
    const b = borrador; if (!b) return;
    const pts = b.tipo === 'circulo' || b.tipo === 'punto' ? puntos : sinDuplicados(puntos);
    if (pts.length < TIPOS[b.tipo].min) { avisoBreve(`Faltan puntos: una ${TIPOS[b.tipo].nombre.toLowerCase()} necesita al menos ${TIPOS[b.tipo].min}`); return; }
    const el = cambio(`Dibujar ${TIPOS[b.tipo].nombre.toLowerCase()}`, (p) => {
      const e = nuevoElemento(b.tipo, pts, { radio, bando: preferencias.bando, estado: preferencias.estado });
      p.elementos.push(e); return e;
    });
    borrador = null; capaBorrador.clearLayers();
    elegirHerramienta('consultar');
    seleccionar(el.id);
  }

  function moverCursor(p) {
    if (!borrador || !borrador.puntos.length) return;
    borrador.cursor = p; pintarBorrador(); pintarPanel();
  }

  function pintarBorrador() {
    capaBorrador.clearLayers();
    const b = borrador; if (!b || !b.puntos.length) return;
    const c = BANDOS[preferencias.bando].color;
    const est = { pane: 'borrador', color: c, weight: 3, interactive: false, dashArray: preferencias.estado === 'previsto' ? '10 7' : null };
    if (b.tipo === 'circulo') {
      if (b.cursor) {
        const r = medir(b.puntos[0], b.cursor).distancia;
        if (r > 0) L.polygon(puntosCirculo(b.puntos[0], r, 120).map((q) => [q.lat, q.lon]), { ...est, fillColor: c, fillOpacity: 0.08 }).addTo(capaBorrador);
        L.polyline(trazo([b.puntos[0], b.cursor]), { ...est, weight: 1.5, dashArray: '4 4' }).addTo(capaBorrador);
      }
    } else {
      if (b.puntos.length > 1) L.polyline(trazo(b.puntos), est).addTo(capaBorrador);
      if (b.cursor) {
        L.polyline(trazo([b.puntos.at(-1), b.cursor]), { ...est, weight: 2, dashArray: '5 5', opacity: 0.8 }).addTo(capaBorrador);
        if (b.tipo === 'area' && b.puntos.length > 1) L.polyline(trazo([b.cursor, b.puntos[0]]), { ...est, weight: 1.5, dashArray: '3 6', opacity: 0.6 }).addTo(capaBorrador);
      }
    }
    b.puntos.forEach((p, i) => L.circleMarker([p.lat, p.lon], {
      pane: 'borrador', radius: i === 0 && b.tipo === 'area' && b.puntos.length >= 3 ? 7 : 5,
      color: '#fff', weight: 2, fillColor: c, fillOpacity: 1, interactive: false,
    }).addTo(capaBorrador));
  }

  // ---------------------------------------------------------- panel lateral
  const panel = $('panel-elemento');
  function tablaTramos(tramos, cerrada) {
    const letra = (i) => String.fromCharCode(65 + (i % 26));
    return `<table class="pm-tramos"><thead><tr><th>Tramo</th><th>Distancia</th><th>Rumbo geo</th><th>Rumbo cuad.</th></tr></thead><tbody>${
      tramos.map((t) => `<tr><td>${letra(t.de)}→${letra(cerrada && t.a === 0 ? 0 : t.a)}</td><td>${fmt.metros(t.distancia)}</td><td>${fmt.rumbo(t.rumbo)}</td><td>${fmt.rumbo(t.rumboCuadricula)}</td></tr>`).join('')
    }</tbody></table><p class="pm-nota">Rumbos en ${fmt.unidadAngulo()}. Rumbo magnético: pendiente.</p>`;
  }

  function bloqueMedidas(m) {
    if (m.tipo === 'punto') return `<div class="pm-total"><div class="grande mgrs">${fmt.mgrs(m.posicion)}</div><div class="peq">${esc(fmt.secundaria(m.posicion))}</div></div>`;
    if (m.tipo === 'circulo') {
      return `<div class="pm-total"><div class="grande">${fmt.metros(m.radio)}</div><div class="peq">Radio, sobre el elipsoide · Centro <b>${fmt.mgrs(m.centro)}</b></div></div>
        <dl class="el-datos"><dt>Diámetro</dt><dd>${fmt.metros(m.diametro)}</dd><dt>Superficie</dt><dd>${formatearArea(m.area)}</dd><dt>Perímetro</dt><dd>${fmt.metros(m.perimetro)}</dd></dl>`;
    }
    if (m.tipo === 'linea') {
      return `<div class="pm-total"><div class="grande">${fmt.metros(m.longitud)}</div><div class="peq">Real, sobre el elipsoide · Sobre el mapa: ${fmt.metros(m.longitudMapa)}</div></div>${tablaTramos(m.tramos, false)}`;
    }
    return `<div class="pm-total"><div class="grande">${formatearArea(m.area)}</div><div class="peq">Perímetro ${fmt.metros(m.perimetro)} · Sobre el mapa: ${fmt.metros(m.perimetroMapa)}</div></div>${tablaTramos(m.tramos, true)}`;
  }

  /** Repinta el panel. `puntos`/`radio` provisionales mientras se arrastra. */
  function pintarPanel(puntos, radio) {
    // 1) Dibujando
    if (borrador) {
      const b = borrador;
      const ayuda = {
        punto: 'Toca el mapa donde va el punto.',
        linea: b.puntos.length ? 'Sigue tocando para añadir vértices. Doble clic, Intro o tocar el último vértice para terminar.' : 'Toca el mapa para el primer vértice.',
        area: b.puntos.length >= 3 ? 'Toca el primer vértice, doble clic o Intro para cerrar el área.' : b.puntos.length ? 'Sigue tocando para añadir vértices.' : 'Toca el mapa para el primer vértice.',
        circulo: b.puntos.length ? 'Toca el borde, o escribe el radio exacto.' : 'Toca el mapa en el centro del círculo.',
      }[b.tipo];
      let medidas = '';
      const vivos = b.cursor ? [...b.puntos, b.cursor] : b.puntos;
      if (b.tipo === 'circulo' && b.puntos.length) {
        const r = b.cursor ? medir(b.puntos[0], b.cursor).distancia : 0;
        medidas = `<div class="pm-total"><div class="grande">${r ? fmt.metros(r) : '—'}</div><div class="peq">Radio · Centro <b>${fmt.mgrs(b.puntos[0])}</b></div></div>
          <form class="el-radio" id="dib-radio"><label>Radio exacto <input type="number" min="1" step="any" inputmode="decimal" placeholder="metros" id="dib-radio-m"></label><button type="submit">Crear</button></form>`;
      } else if ((b.tipo === 'linea' || b.tipo === 'area') && vivos.length >= 2) {
        const tmp = { tipo: b.tipo === 'area' && vivos.length >= 3 ? 'area' : 'linea', geometria: null, propiedades: {} };
        tmp.geometria = { type: tmp.tipo === 'area' ? 'Polygon' : 'LineString', coordinates: tmp.tipo === 'area' ? [[...vivos, vivos[0]].map((p) => [p.lon, p.lat])] : vivos.map((p) => [p.lon, p.lat]) };
        const m = medidasDe(tmp);
        medidas = m.tipo === 'linea'
          ? `<div class="pm-total"><div class="grande">${fmt.metros(m.longitud)}</div><div class="peq">${b.cursor ? 'Hasta el cursor · ' : ''}sobre el elipsoide</div></div>`
          : `<div class="pm-total"><div class="grande">${formatearArea(m.area)}</div><div class="peq">Perímetro ${fmt.metros(m.perimetro)}${b.cursor ? ' · con el cursor' : ''}</div></div>`;
      }
      panel.innerHTML = `<div class="pm-cab"><strong>${{ punto: 'Punto nuevo', linea: 'Línea nueva', area: 'Área nueva', circulo: 'Círculo nuevo' }[b.tipo]}</strong><span>${b.puntos.length ? `${b.puntos.length} punto${b.puntos.length > 1 ? 's' : ''}` : ''}</span></div>
        <p class="el-ayuda">${ayuda}</p>
        ${selectorBando(preferencias.bando, preferencias.estado, 'pref')}
        ${medidas}
        <div class="pm-acciones">${b.tipo === 'linea' || b.tipo === 'area' ? '<button type="button" data-acc="terminar">Terminar</button><button type="button" data-acc="quitar-ultimo">Quitar último</button>' : ''}<button type="button" data-acc="cancelar">Cancelar</button></div>`;
      mostrarPanel(true);
      return;
    }
    // 2) Elemento seleccionado
    const el = seleccion && buscar(seleccion);
    if (!el) { mostrarPanel(false); return; }
    let m;
    if (puntos) {
      const tmp = JSON.parse(JSON.stringify(el));
      tmp.geometria = { type: el.geometria.type, coordinates: el.tipo === 'area' ? [[...puntos, puntos[0]].map((p) => [p.lon, p.lat])] : el.tipo === 'linea' ? puntos.map((p) => [p.lon, p.lat]) : [puntos[0].lon, puntos[0].lat] };
      if (radio) tmp.propiedades.radio = radio;
      m = medidasDe(tmp);
    } else m = medidasDe(el);
    const pts = puntos ?? puntosDe(el);
    const nVert = el.tipo === 'linea' || el.tipo === 'area';
    panel.innerHTML = `<div class="pm-cab"><strong><span class="muestra-bando" style="--c:${color(el)}"></span>${esc(titulo(el))}</strong><span>${TIPOS[el.tipo].nombre}</span></div>
      <label class="el-nombre">Nombre <input id="el-nombre" value="${esc(el.propiedades.nombre)}" placeholder="Sin nombre (ej.: PL ROJA, OBJ 1)" maxlength="60"></label>
      ${selectorBando(el.propiedades.bando, el.propiedades.estado, 'el')}
      ${el.tipo === 'circulo' ? `<form class="el-radio" id="el-radio"><label>Radio <input type="number" min="1" step="any" inputmode="decimal" id="el-radio-m" value="${Number((radio ?? el.propiedades.radio).toFixed(2))}"></label><span>m</span><button type="submit">Aplicar</button></form>` : ''}
      ${bloqueMedidas(m)}
      ${nVert ? `<details class="el-vert" ${verticesAbiertos ? 'open' : ''}><summary>Vértices (${pts.length})</summary><ol>${pts.map((p, i) => `<li><span class="v-letra">${String.fromCharCode(65 + (i % 26))}</span><code>${fmt.mgrs(p)}</code><button type="button" data-quitar-v="${i}" title="Quitar vértice" aria-label="Quitar vértice">×</button></li>`).join('')}</ol></details>` : ''}
      <p class="pm-nota">${el.tipo === 'punto' ? 'Arrastra el punto para moverlo.' : el.tipo === 'circulo' ? 'Arrastra el centro para moverlo y el asa del borde para cambiar el radio.' : 'Arrastra los vértices. Clic en un punto medio para añadir uno; clic derecho en un vértice para quitarlo.'}</p>
      <div class="pm-acciones"><button type="button" data-acc="centrar">Centrar</button><button type="button" data-acc="borrar" class="peligro">Borrar</button><button type="button" data-acc="cerrar">Cerrar</button></div>`;
    mostrarPanel(true);
  }

  function selectorBando(bando, estado, prefijo) {
    return `<div class="el-fila"><div class="seg el-bando" data-campo="${prefijo}-bando">${Object.entries(BANDOS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === bando}" title="${v.nombre}" style="--c:${v.color}"><i></i>${v.nombre}</button>`).join('')}</div></div>
      <div class="el-fila"><div class="seg" data-campo="${prefijo}-estado">${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === estado}">${v.nombre}</button>`).join('')}</div><span class="el-trazo ${estado}" style="--c:${BANDOS[bando].color}"></span></div>`;
  }

  function mostrarPanel(si) {
    const antes = !panel.hidden;
    panel.hidden = !si;
    if (antes !== si) alCambiarPaneles();
  }

  panel.addEventListener('toggle', (ev) => { if (ev.target.matches('.el-vert')) verticesAbiertos = ev.target.open; }, true);
  panel.addEventListener('click', (ev) => {
    const el = seleccion && buscar(seleccion);
    const seg = ev.target.closest('.seg[data-campo] button');
    if (seg) {
      const campo = seg.parentElement.dataset.campo; const v = seg.dataset.v;
      if (campo.startsWith('pref')) { preferencias[campo.endsWith('bando') ? 'bando' : 'estado'] = v; pintarBorrador(); pintarPanel(); return; }
      if (el) {
        const prop = campo.endsWith('bando') ? 'bando' : 'estado';
        preferencias[prop] = v;
        cambio(prop === 'bando' ? 'Cambiar bando' : 'Cambiar estado', () => { el.propiedades[prop] = v; tocar(el); });
      }
      return;
    }
    const q = ev.target.closest('[data-quitar-v]');
    if (q && el) { quitarVertice(el, Number(q.dataset.quitarV)); return; }
    const acc = ev.target.closest('[data-acc]')?.dataset.acc;
    if (!acc) return;
    if (acc === 'cancelar') { cancelarBorrador(); elegirHerramienta('consultar'); }
    if (acc === 'terminar' && borrador) terminar(borrador.puntos);
    if (acc === 'quitar-ultimo' && borrador) { borrador.puntos.pop(); pintarBorrador(); pintarPanel(); }
    if (acc === 'centrar' && el) seleccionar(el.id, { centrar: true });
    if (acc === 'borrar' && el) borrarSeleccion();
    if (acc === 'cerrar') seleccionar(null);
  });
  panel.addEventListener('change', (ev) => {
    const el = seleccion && buscar(seleccion);
    if (ev.target.id === 'el-nombre' && el) {
      const v = ev.target.value.trim();
      cambio('Cambiar nombre', () => { el.propiedades.nombre = v; tocar(el); });
    }
  });
  panel.addEventListener('submit', (ev) => {
    ev.preventDefault();
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

  function borrarSeleccion() {
    const el = seleccion && buscar(seleccion); if (!el) return;
    const nombre = titulo(el);
    cambio(`Borrar ${nombre}`, (p) => { p.elementos = p.elementos.filter((e) => e.id !== el.id); });
    seleccion = null; pintarTodo(); pintarPanel(); pintarLista();
    avisoBreve(`«${nombre}» borrado. Ctrl+Z para recuperarlo.`);
  }

  // ---------------------------------------------------------- lista de elementos
  const ICONOS = {
    punto: '<circle cx="12" cy="12" r="4"/>',
    linea: '<path d="M3 18 9 9l6 5 6-9"/>',
    area: '<path d="M4 7 12 3l8 6-3 11H7z"/>',
    circulo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/>',
  };
  function resumen(el) {
    const m = medidasDe(el);
    if (m.tipo === 'punto') return fmt.mgrs(m.posicion);
    if (m.tipo === 'linea') return fmt.metros(m.longitud);
    if (m.tipo === 'area') return formatearArea(m.area);
    return `r ${fmt.metros(m.radio)}`;
  }
  function pintarLista() {
    const caja = $('plan-lista'); if (!caja) return;
    $('plan-cuenta').textContent = plan.elementos.length ? `(${plan.elementos.length})` : '';
    if (!plan.elementos.length) { caja.innerHTML = '<p class="plan-vacio">Aún no hay nada dibujado. Usa Punto, Línea, Área o Círculo.</p>'; return; }
    caja.innerHTML = plan.elementos.map((el) => `<button type="button" class="plan-el" data-el="${el.id}" aria-pressed="${el.id === seleccion}">
      <svg viewBox="0 0 24 24" style="--c:${color(el)}" ${el.propiedades.estado === 'previsto' ? 'class="previsto"' : ''}>${ICONOS[el.tipo]}</svg>
      <span class="pe-nom">${esc(titulo(el))}</span><span class="pe-med">${esc(resumen(el))}</span></button>`).join('');
  }
  $('plan-lista')?.addEventListener('click', (ev) => { const b = ev.target.closest('[data-el]'); if (b) seleccionar(b.dataset.el, { centrar: true }); });

  // ---------------------------------------------------------- deshacer / rehacer
  function pintarBotones() {
    const d = $('deshacer'), r = $('rehacer');
    if (d) { d.disabled = !historial.puedeDeshacer; d.title = historial.puedeDeshacer ? `Deshacer: ${historial.ultimo} (Ctrl+Z)` : 'Nada que deshacer'; }
    if (r) { r.disabled = !historial.puedeRehacer; r.title = historial.puedeRehacer ? `Rehacer: ${historial.siguiente} (Ctrl+Y)` : 'Nada que rehacer'; }
  }
  const deshacer = () => { if (borrador) { if (borrador.puntos.length) { borrador.puntos.pop(); pintarBorrador(); pintarPanel(); } return; } const d = historial.deshacer(); if (d) avisoBreve(`Deshecho: ${d}`); };
  const rehacer = () => { const d = historial.rehacer(); if (d) avisoBreve(`Rehecho: ${d}`); };
  $('deshacer')?.addEventListener('click', deshacer);
  $('rehacer')?.addEventListener('click', rehacer);

  // ---------------------------------------------------------- aviso breve
  let tAviso = 0;
  function avisoBreve(texto) {
    const t = $('aviso-breve'); if (!t) return;
    t.textContent = texto; t.hidden = false; clearTimeout(tAviso);
    tAviso = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------------------------------------------------------- teclado
  document.addEventListener('keydown', (e) => {
    const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !escribiendo && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); return; }
    if (mod && !escribiendo && e.key.toLowerCase() === 'y') { e.preventDefault(); rehacer(); return; }
    if (escribiendo) return;
    if (borrador) {
      if (e.key === 'Enter') { e.preventDefault(); if (borrador.tipo === 'linea' || borrador.tipo === 'area') terminar(borrador.puntos); }
      if (e.key === 'Escape') { cancelarBorrador(); elegirHerramienta('consultar'); }
      if (e.key === 'Backspace') { e.preventDefault(); borrador.puntos.pop(); pintarBorrador(); pintarPanel(); }
      return;
    }
    if (seleccion && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); borrarSeleccion(); }
    if (seleccion && e.key === 'Escape') seleccionar(null);
  });

  // ---------------------------------------------------------- arranque
  pintarTodo(); pintarLista(); pintarBotones();

  return {
    plan: () => plan, historial,
    clic, dobleClic, moverCursor,
    /** Se llama al cambiar de herramienta. */
    herramientaCambiada(h) {
      if (HERRAMIENTAS_DIBUJO.includes(h)) { empezar(h); return; }
      if (borrador) cancelarBorrador();
      if (h === 'medir' && seleccion) seleccionar(null);
    },
    /** Clic en el mapa vacío con «Consultar»: si hay selección, solo la quita. */
    quitarSeleccion() { if (!seleccion) return false; seleccionar(null); return true; },
    seleccionar,
    refrescar() { pintarPanel(); pintarLista(); },
    get dibujando() { return Boolean(borrador); },
    get seleccion() { return seleccion; },
  };
}
