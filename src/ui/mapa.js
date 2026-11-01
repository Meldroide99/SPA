// Página del mapa: capas (IGN, Google, importadas), cuadrícula MGRS,
// coordenada y altitud bajo el cursor, ajustes, regla, dibujo (dibujo.js) e
// importación (importar.js). Usa Leaflet (global L).
import {
  formatearPosicion, leerPosicion, medir, puntosGeodesica, formatearRumbo,
} from '../geo/index.js';
import { FONDOS, SUPERPUESTAS, ALTERNATIVAS, ZONA_PILOTO, crearCapa } from '../mapa/capas.js';
import { capaCuadricula } from '../mapa/cuadricula.js';
import { iniciarDibujo, HERRAMIENTAS_DIBUJO } from './dibujo.js';
import { iniciarImportar } from './importar.js';
import { crearServicioAlturas } from '../datos/alturas.js';
import { prepararRejillas } from '../geo/rejillas.js';

const L = window.L;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- estado y ajustes
const CLAVE = 'spa.mapa.estado';
const estado = {
  angulo: 'grados', coordenadas: 'mgrs', fondo: 'mtn', fondoAuto: false, mtnDetalle: false, intensidadCuadricula: 35,
  superpuestas: { cuadricula: true, piloto: true }, vista: null,
};
try { Object.assign(estado, JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch { /* sin almacenamiento */ }
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* nada */ } };

const metros = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km` : `${m.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`);
const coord = (p) => formatearPosicion(p, { formato: estado.coordenadas, precisionMgrs: 5, separado: true });
const rumbo = (g) => formatearRumbo(g, estado.angulo, estado.angulo === 'grados' ? 1 : 0);

const alturas = crearServicioAlturas();
prepararRejillas().catch(() => {}); // ED50 y geoide (para mapas antiguos y alturas de ATAK)

// ---------------------------------------------------------------- mapa
const piloto = L.latLngBounds([ZONA_PILOTO.sur, ZONA_PILOTO.oeste], [ZONA_PILOTO.norte, ZONA_PILOTO.este]);
const mapa = L.map('mapa', { zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 21, doubleClickZoom: false, zoomSnap: 1 });
mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
L.control.scale({ metric: true, imperial: false, maxWidth: 160, position: 'bottomright' }).addTo(mapa);
if (estado.vista) mapa.setView(estado.vista.centro, estado.vista.zoom); else mapa.fitBounds(piloto, { padding: [20, 20] });
new ResizeObserver(() => mapa.invalidateSize({ pan: false })).observe($('mapa'));
mapa.on('moveend', () => { const c = mapa.getCenter(); estado.vista = { centro: [c.lat, c.lng], zoom: mapa.getZoom() }; guardar(); });

// ---------------------------------------------------------------- diagnóstico de capas
const diag = {};
const enVistaPrevia = (() => { try { return window.top !== window.self; } catch { return true; } })();
function vigilar(id, capa) {
  diag[id] = { ok: 0, err: 0, url: '' };
  capa.on('tileload', () => { diag[id].ok++; });
  capa.on('tileerror', (e) => { diag[id].err++; diag[id].url = e.tile?.src || diag[id].url; setTimeout(revisarCapas, 0); });
  return capa;
}

const defsFondo = [...FONDOS, ...ALTERNATIVAS];
const capasFondo = Object.fromEntries(defsFondo.map((f) => [f.id, vigilar(f.id, crearCapa(L, f))]));
capasFondo.mtn.ponerDetalle?.(Boolean(estado.mtnDetalle));
let fondoActual = null, fondoElegido = null;
const alternativasProbadas = new Set();
function ponerFondo(id, { automatico = false } = {}) {
  if (!capasFondo[id]) id = FONDOS[0].id;
  if (fondoActual) mapa.removeLayer(fondoActual);
  fondoActual = capasFondo[id].addTo(mapa);
  fondoActual.bringToBack();
  fondoActual.idSpa = id;
  if (!automatico) { fondoElegido = id; alternativasProbadas.clear(); ocultarAviso(); estado.fondo = id; guardar(); }
  const visible = FONDOS.some((f) => f.id === id) ? id : fondoElegido;
  document.querySelectorAll('.fondo').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === visible)));
}
function revisarCapas() {
  const id = fondoActual?.idSpa; if (!id) return;
  const d = diag[id];
  if (d.ok > 0 || d.err < 4) return;
  const def = defsFondo.find((f) => f.id === (fondoElegido || id));
  const sig = (def?.alternativas || []).find((a) => !alternativasProbadas.has(a) && a !== id);
  if (sig) {
    alternativasProbadas.add(sig);
    ponerFondo(sig, { automatico: true });
    mostrarAviso('aviso', `«${def.nombre}» no responde por su vía principal. Se está probando: <b>${esc(ALTERNATIVAS.find((a) => a.id === sig).nombre)}</b>.`, d.url);
    return;
  }
  mostrarAviso('error', `No llega ninguna imagen de «${esc(defsFondo.find((f) => f.id === id)?.nombre || id)}».`, d.url);
}
function mostrarAviso(tipo, texto, urlPrueba) {
  const causas = enVistaPrevia ? '<li><b>Estás viendo el mapa dentro de una vista previa.</b> Descarga el archivo y ábrelo con Chrome o Edge.</li>' : '';
  $('aviso').className = `aviso aviso-${tipo}`;
  $('aviso').innerHTML = `<div class="av-tit">${texto}</div><ul>${causas}
      <li>Si lo abres desde un visor (móvil, correo, app), descárgalo y ábrelo con <b>Chrome o Edge</b>.</li>
      <li>La red puede estar bloqueando el servicio (redes corporativas o de Defensa).</li></ul>
    <div class="av-acc">${urlPrueba ? `<a href="${esc(urlPrueba)}" target="_blank" rel="noopener">Abrir una tesela de prueba</a>` : ''}
      <button type="button" data-fondo-alt="satelite">Usar satélite</button><button type="button" id="aviso-cerrar">Cerrar</button></div>`;
  $('aviso').hidden = false;
}
function ocultarAviso() { $('aviso').hidden = true; }
$('aviso').addEventListener('click', (ev) => {
  if (ev.target.id === 'aviso-cerrar') ocultarAviso();
  const b = ev.target.closest('[data-fondo-alt]');
  if (b) { ponerFondo(b.dataset.fondoAlt); ocultarAviso(); }
});

$('fondos').innerHTML = FONDOS.map((f) => `<button type="button" class="fondo" data-id="${f.id}" title="${esc(f.detalle)}" aria-pressed="false">
  <span class="muestra muestra-${f.id}"></span><span class="nom">${esc(f.nombre)}</span></button>`).join('');
$('fondos').addEventListener('click', (ev) => { const b = ev.target.closest('.fondo'); if (b) ponerFondo(b.dataset.id); });
ponerFondo(estado.fondo);

// Cambio automático a ortofoto al acercarse (opcional)
const ZOOM_ORTOFOTO = 17;
let zoomPrevio = null;
function fondoPorZoom({ forzar = false } = {}) {
  const z = mapa.getZoom();
  const cerca = z >= ZOOM_ORTOFOTO, antes = zoomPrevio !== null && zoomPrevio >= ZOOM_ORTOFOTO;
  zoomPrevio = z;
  if (!estado.fondoAuto || (!forzar && cerca === antes)) return;
  const objetivo = cerca ? 'ortofoto' : estado.fondo;
  if (fondoActual?.idSpa === objetivo) return;
  ponerFondo(objetivo, { automatico: true }); fondoElegido = objetivo; alternativasProbadas.clear();
}
mapa.on('zoomend', () => fondoPorZoom());
$('fondo-auto').checked = Boolean(estado.fondoAuto);
$('fondo-auto').addEventListener('change', (ev) => {
  estado.fondoAuto = ev.target.checked; guardar();
  if (estado.fondoAuto) fondoPorZoom({ forzar: true }); else if (fondoActual?.idSpa !== estado.fondo) ponerFondo(estado.fondo);
});
fondoPorZoom({ forzar: true });
// MTN25 desde más arriba (opcional)
$('mtn-detalle').checked = Boolean(estado.mtnDetalle);
$('mtn-detalle').addEventListener('change', (ev) => { estado.mtnDetalle = ev.target.checked; guardar(); capasFondo.mtn.ponerDetalle?.(estado.mtnDetalle); });

// ---------------------------------------------------------------- superpuestas y cuadrícula
const SELECTORES_OBSTACULO = '.herramientas, .panel-capas, .panel-plan, .panel-medida, .aviso, .aviso-breve, .leaflet-control-zoom, .leaflet-control-scale, .leaflet-control-attribution';
function obstaculos() {
  const base = $('mapa').getBoundingClientRect();
  return [...document.querySelectorAll(SELECTORES_OBSTACULO)].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height)
    .map((r) => ({ x0: r.left - base.left - 4, y0: r.top - base.top - 4, x1: r.right - base.left + 4, y1: r.bottom - base.top + 4 }));
}
const cuadricula = capaCuadricula(L, mapa, { intensidad: () => estado.intensidadCuadricula / 100, obstaculos });
const recolocarEtiquetas = () => requestAnimationFrame(() => { if (mapa.hasLayer(cuadricula)) cuadricula.redibujar(); });
const zonaPiloto = L.layerGroup([
  L.rectangle(piloto, { color: '#9A7642', weight: 2, dashArray: '7 5', fill: false, interactive: false }),
  L.marker([ZONA_PILOTO.norte, ZONA_PILOTO.oeste], { interactive: false, icon: L.divIcon({ className: 'zona-piloto-etq', html: esc(ZONA_PILOTO.nombre), iconSize: null, iconAnchor: [0, 28] }) }),
]);
const listaSup = [
  { id: 'cuadricula', nombre: 'Cuadrícula MGRS', detalle: 'Calculada por SPA (100 km → 100 m según zoom)', capa: cuadricula },
  ...SUPERPUESTAS.map((s) => ({ ...s, capa: vigilar(s.id, crearCapa(L, s)) })),
  { id: 'piloto', nombre: 'Zona piloto', detalle: 'Guadarrama, unos 20 × 20 km', capa: zonaPiloto },
];
$('superpuestas').innerHTML = listaSup.map((s) => `<label class="sup"><input type="checkbox" data-id="${s.id}">
  <span class="txt"><b>${esc(s.nombre)}</b><small>${esc(s.detalle)}</small></span></label>${s.id === 'cuadricula'
  ? `<label class="intensidad" title="Intensidad de las líneas de la cuadrícula">Intensidad <input type="range" id="cuad-intensidad" min="10" max="100" step="5" value="${estado.intensidadCuadricula}"><output id="cuad-intensidad-v">${estado.intensidadCuadricula} %</output></label>` : ''}`).join('');
$('cuad-intensidad').addEventListener('input', (ev) => {
  estado.intensidadCuadricula = Number(ev.target.value); guardar();
  $('cuad-intensidad-v').textContent = `${estado.intensidadCuadricula} %`; cuadricula.redibujar();
});
function ponerSup(id, on) {
  const s = listaSup.find((x) => x.id === id); if (!s) return;
  if (on) s.capa.addTo(mapa); else mapa.removeLayer(s.capa);
  estado.superpuestas[id] = on; guardar();
  const caja = document.querySelector(`.sup input[data-id="${id}"]`); if (caja) caja.checked = on;
}
$('superpuestas').addEventListener('change', (ev) => { const i = ev.target.closest('input[data-id]'); if (i) ponerSup(i.dataset.id, i.checked); });
for (const s of listaSup) ponerSup(s.id, Boolean(estado.superpuestas[s.id]));

$('capas-toggle').addEventListener('click', () => {
  const cerrado = $('panel-capas').classList.toggle('cerrado');
  $('capas-toggle').setAttribute('aria-expanded', String(!cerrado)); recolocarEtiquetas();
});
if (window.matchMedia('(max-width: 760px)').matches) { $('panel-capas').classList.add('cerrado'); $('capas-toggle').setAttribute('aria-expanded', 'false'); }

// ---------------------------------------------------------------- herramientas, dibujo e importación
let herramienta = 'consultar';
let ultimaPos = null;
const fmt = { metros, coord };
// eslint-disable-next-line prefer-const
let importar = null;
const dibujo = iniciarDibujo({
  L, mapa, alturas, fmt,
  herramienta: () => herramienta,
  elegirHerramienta: (h) => elegirHerramienta(h),
  puntosExternos: () => importar?.puntosVisibles() ?? [],
  alCambiarPaneles: () => recolocarEtiquetas(),
});
importar = iniciarImportar({
  L, mapa, alturas, fmt, dibujo,
  herramienta: () => herramienta,
  alCambiarPaneles: () => recolocarEtiquetas(),
});

function elegirHerramienta(h) {
  herramienta = h;
  document.querySelectorAll('[data-herr]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.herr === h)));
  $('panel-medida').hidden = h !== 'medir';
  mapa.getContainer().classList.toggle('cursor-cruz', h === 'medir' || HERRAMIENTAS_DIBUJO.includes(h));
  if (h === 'medir') importar.cerrarFicha();
  pintarMedida();
  dibujo.herramientaCambiada(h);
  recolocarEtiquetas();
}
document.querySelectorAll('[data-herr]').forEach((b) => b.addEventListener('click', () => elegirHerramienta(b.dataset.herr)));
$('ir-piloto').addEventListener('click', () => mapa.flyToBounds(piloto, { padding: [20, 20], duration: 0.8 }));
function ponerPanelPlan(abierto) {
  // En pantallas estrechas no caben los dos paneles a la vez
  if (abierto && window.matchMedia('(max-width: 760px)').matches) { $('panel-capas').classList.add('cerrado'); $('capas-toggle').setAttribute('aria-expanded', 'false'); }
  $('panel-plan').hidden = !abierto;
  $('btn-plan').setAttribute('aria-pressed', String(abierto));
  document.body.classList.toggle('plan-abierto', abierto);
  try { localStorage.setItem('spa.panelPlan', abierto ? '1' : '0'); } catch { /* nada */ }
  recolocarEtiquetas();
}
$('btn-plan').addEventListener('click', () => ponerPanelPlan($('panel-plan').hidden));
$('plan-cerrar').addEventListener('click', () => ponerPanelPlan(false));
try { if (localStorage.getItem('spa.panelPlan') === '1') ponerPanelPlan(true); } catch { /* nada */ }

// ---------------------------------------------------------------- ajustes (icono arriba a la derecha)
$('btn-ajustes').addEventListener('click', (ev) => {
  ev.stopPropagation();
  const abrir = $('ajustes').hidden;
  $('ajustes').hidden = !abrir; $('btn-ajustes').setAttribute('aria-expanded', String(abrir));
});
document.addEventListener('click', (ev) => { if (!$('ajustes').hidden && !ev.target.closest('#ajustes, #btn-ajustes')) { $('ajustes').hidden = true; $('btn-ajustes').setAttribute('aria-expanded', 'false'); } });
for (const grupo of document.querySelectorAll('[data-pref]')) {
  const clave = grupo.dataset.pref;
  const pintar = () => grupo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(estado[clave]))));
  grupo.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    estado[clave] = b.dataset.v; guardar(); pintar();
    if (ultimaPos) mostrarPos(ultimaPos, $('be-et').textContent);
    pintarMedida(); dibujo.refrescar();
  });
  pintar();
}

mapa.on('click', (e) => {
  const p = { lat: e.latlng.lat, lon: e.latlng.lng };
  if (herramienta === 'medir') { medida.push(p); pintarMedida(); return; }
  if (HERRAMIENTAS_DIBUJO.includes(herramienta)) { dibujo.clic(p); return; }
  // Con «Mover», un clic en el mapa vacío solo quita la selección (no pone puntos)
  if (!dibujo.quitarSeleccion()) importar.cerrarFicha();
});
mapa.on('dblclick', () => { if (HERRAMIENTAS_DIBUJO.includes(herramienta)) dibujo.dobleClic(); });
mapa.on('contextmenu', (e) => {
  if (HERRAMIENTAS_DIBUJO.includes(herramienta)) { L.DomEvent.preventDefault(e.originalEvent); dibujo.quitarUltimo(); }
  else if (herramienta === 'medir') { L.DomEvent.preventDefault(e.originalEvent); medida.pop(); pintarMedida(); }
});

// ---------------------------------------------------------------- barra inferior: coordenada y altitud
const tactil = window.matchMedia('(hover: none)').matches;
if (tactil) { document.body.classList.add('tactil'); const c = document.createElement('div'); c.className = 'cruz'; $('contenido').append(c); }
let tAltura = 0, pedidaAltura = 0;
function mostrarPos(p, etiqueta) {
  ultimaPos = p;
  $('be-et').textContent = etiqueta;
  try { $('be-coord').textContent = coord(p); } catch { $('be-coord').textContent = 'Fuera del ámbito UTM'; }
  // Altitud: se pide al detenerse el cursor (y solo con zoom suficiente)
  clearTimeout(tAltura);
  $('be-alt').classList.add('pendiente');
  if (mapa.getZoom() < 9) { $('be-alt').textContent = ''; return; }
  const n = ++pedidaAltura;
  tAltura = setTimeout(async () => {
    try {
      const z = await alturas.altura(p.lat, p.lon);
      if (n !== pedidaAltura) return;
      $('be-alt').textContent = z === null ? '' : `${Math.round(z)} m`;
      $('be-alt').classList.remove('pendiente');
    } catch { if (n === pedidaAltura) $('be-alt').textContent = ''; }
  }, 120);
}
mapa.on('mousemove', (e) => {
  if (tactil) return;
  const p = { lat: e.latlng.lat, lon: e.latlng.lng };
  mostrarPos(p, 'Cursor');
  dibujo.moverCursor(p);
});
mapa.on('moveend', () => { if (tactil || !ultimaPos) { const c = mapa.getCenter(); mostrarPos({ lat: c.lat, lon: c.lng }, 'Centro'); } });
mapa.on('mouseout', () => { if (ultimaPos) $('be-et').textContent = 'Última'; });

// ---------------------------------------------------------------- regla de medida
const medida = [];
const capaMedida = L.layerGroup().addTo(mapa);
function pintarMedida() {
  capaMedida.clearLayers();
  for (let i = 1; i < medida.length; i++) {
    L.polyline(puntosGeodesica(medida[i - 1], medida[i], 16).map((q) => [q.lat, q.lon]), { color: '#A3362B', weight: 3, opacity: 0.9, interactive: false }).addTo(capaMedida);
  }
  medida.forEach((p, i) => L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 2, fillColor: '#A3362B', fillOpacity: 1, interactive: false })
    .bindTooltip(String.fromCharCode(65 + (i % 26)), { permanent: true, direction: 'right', className: 'etq-cuad', offset: [6, 0] }).addTo(capaMedida));
  const cuerpo = $('pm-cuerpo');
  if (medida.length < 2) {
    $('pm-ayuda').textContent = medida.length ? 'Toca el siguiente punto' : 'Toca el mapa para añadir puntos';
    cuerpo.innerHTML = medida.length ? `<p class="pm-nota">Origen A: <code>${esc(coord(medida[0]))}</code></p>` : '';
    return;
  }
  $('pm-ayuda').textContent = 'Clic derecho quita el último';
  let total = 0, totalMapa = 0;
  const filas = [];
  for (let i = 1; i < medida.length; i++) {
    const r = medir(medida[i - 1], medida[i]);
    total += r.distancia; totalMapa += r.distanciaCuadricula;
    const de = String.fromCharCode(65 + ((i - 1) % 26)), a = String.fromCharCode(65 + (i % 26));
    filas.push(`<tr><td>${de}→${a}</td><td>${metros(r.distancia)}</td><td>${rumbo(r.rumbo)}</td><td>${rumbo(r.rumboCuadricula)}</td></tr>`);
  }
  const unidad = { grados: 'grados', milesimas: 'milésimas', gms: 'G M S' }[estado.angulo];
  cuerpo.innerHTML = `<div class="pm-total"><div class="grande">${metros(total)}</div><div class="peq">Real, sobre el elipsoide · Sobre el mapa: ${metros(totalMapa)}</div></div>
    <table class="pm-tramos"><thead><tr><th>Tramo</th><th>Distancia</th><th>Rumbo geo</th><th>Rumbo cuad.</th></tr></thead><tbody>${filas.join('')}</tbody></table>
    <p class="pm-nota">Rumbos en ${unidad} (cámbialo en Ajustes). Rumbo magnético: pendiente.</p>`;
}
$('pm-deshacer').addEventListener('click', () => { medida.pop(); pintarMedida(); });
$('pm-nueva').addEventListener('click', () => { medida.length = 0; pintarMedida(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && herramienta === 'medir') { if (medida.length) { medida.length = 0; pintarMedida(); } else elegirHerramienta('consultar'); }
});

// ---------------------------------------------------------------- ir a una posición
const capaBusqueda = L.layerGroup().addTo(mapa);
$('buscar').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const txt = $('buscar-txt').value.trim();
  const err = $('buscar-error'); err.classList.remove('visible');
  if (!txt) return;
  try {
    const p = leerPosicion(txt);
    const zoom = p.lado >= 10000 ? 11 : p.lado >= 1000 ? 13 : 15;
    mapa.flyTo([p.lat, p.lon], Math.max(zoom, Math.min(mapa.getZoom(), 17)), { duration: 0.8 });
    // Señal temporal (desaparece sola): no es un punto del plan
    capaBusqueda.clearLayers();
    L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: 'etq-ancla', html: '<span class="senal-busqueda"></span>', iconSize: null }) }).addTo(capaBusqueda);
    setTimeout(() => capaBusqueda.clearLayers(), 5000);
  } catch (e) { err.textContent = e.message; err.classList.add('visible'); }
});
$('buscar-txt').addEventListener('input', () => $('buscar-error').classList.remove('visible'));

{ const c = mapa.getCenter(); mostrarPos({ lat: c.lat, lon: c.lng }, 'Centro'); }
elegirHerramienta('consultar');
// Para pruebas automáticas
window.__spa = { mapa, estado, medida, pintarMedida, diag, dibujo, importar, cuadricula, alturas, capasFondo };
