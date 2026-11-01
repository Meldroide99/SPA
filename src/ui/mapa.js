// Mapa piloto: capas del IGN, cuadrícula MGRS, coordenadas, consulta de
// puntos, regla de medida (fase 2) y dibujo de elementos (fase 3, en
// dibujo.js). Usa Leaflet (global L).
import {
  geoAMgrs, formatearPosicion, leerPosicion, geoAUtm, medir, puntosGeodesica,
  formatearRumbo, gradosAMilesimas, bandaLatitud,
} from '../geo/index.js';
import { FONDOS, SUPERPUESTAS, ALTERNATIVAS, ZONA_PILOTO, crearCapa } from '../mapa/capas.js';
import { capaCuadricula } from '../mapa/cuadricula.js';
import { iniciarDibujo, HERRAMIENTAS_DIBUJO } from './dibujo.js';

const L = window.L;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- estado y preferencias
const CLAVE = 'spa.mapa.estado';
const estado = {
  angulo: 'grados', precision: 5, fondo: 'mtn', fondoAuto: false, intensidadCuadricula: 35,
  superpuestas: { cuadricula: true, piloto: true },
  vista: null,
};
try { Object.assign(estado, JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch { /* sin almacenamiento */ }
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* nada */ } };

const rumbo = (g) => formatearRumbo(g, estado.angulo, estado.angulo === 'grados' ? 1 : 0);
const metros = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km` : `${m.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`);
const conv = (g) => (estado.angulo === 'milesimas'
  ? `${gradosAMilesimas(g).toLocaleString('es-ES', { maximumFractionDigits: 1, signDisplay: 'always' })} mils`
  : `${g.toLocaleString('es-ES', { maximumFractionDigits: 3, signDisplay: 'always' })}°`);

// ---------------------------------------------------------------- mapa
const piloto = L.latLngBounds([ZONA_PILOTO.sur, ZONA_PILOTO.oeste], [ZONA_PILOTO.norte, ZONA_PILOTO.este]);
const mapa = L.map('mapa', {
  zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 19,
  doubleClickZoom: false, zoomSnap: 1, worldCopyJump: false,
});
mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
L.control.scale({ metric: true, imperial: false, maxWidth: 160, position: 'bottomright' }).addTo(mapa);
if (estado.vista) mapa.setView(estado.vista.centro, estado.vista.zoom);
else mapa.fitBounds(piloto, { padding: [20, 20] });
// Si cambia el alto de las barras, el mapa recalcula su tamaño
new ResizeObserver(() => mapa.invalidateSize({ pan: false })).observe($('mapa'));
mapa.on('moveend', () => { const c = mapa.getCenter(); estado.vista = { centro: [c.lat, c.lng], zoom: mapa.getZoom() }; guardar(); });

// ---------------------------------------------------------------- diagnóstico de capas
// Cuenta teselas cargadas y fallidas de cada capa. Si una capa no carga
// ninguna, se avisa con la causa probable y, si tiene ruta alternativa,
// se cambia a ella automáticamente.
const diag = {};
const enVistaPrevia = (() => { try { return window.top !== window.self; } catch { return true; } })();
function vigilar(id, capa) {
  diag[id] = { ok: 0, err: 0, url: '' };
  capa.on('tileload', () => { diag[id].ok++; });
  capa.on('tileerror', (e) => { diag[id].err++; diag[id].url = e.tile?.src || diag[id].url; setTimeout(revisarCapas, 0); });
  return capa;
}

// Fondos (los del selector + las rutas alternativas)
const defsFondo = [...FONDOS, ...ALTERNATIVAS];
const capasFondo = Object.fromEntries(defsFondo.map((f) => [f.id, vigilar(f.id, crearCapa(L, f))]));
let fondoActual = null;
let fondoElegido = null;            // el que eligió el usuario (aunque se use una alternativa)
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

// Cambio automático de fondo con el zoom (opcional): al cruzar el umbral
// hacia dentro se pasa a la ortofoto; hacia fuera se vuelve al mapa elegido.
const ZOOM_ORTOFOTO = 17;
let zoomPrevio = null;
function fondoPorZoom({ forzar = false } = {}) {
  const z = mapa.getZoom();
  const cerca = z >= ZOOM_ORTOFOTO, antes = zoomPrevio !== null && zoomPrevio >= ZOOM_ORTOFOTO;
  zoomPrevio = z;
  if (!estado.fondoAuto || (!forzar && cerca === antes)) return;
  const objetivo = cerca ? 'ortofoto' : estado.fondo;
  if (fondoActual?.idSpa === objetivo) return;
  ponerFondo(objetivo, { automatico: true });
  fondoElegido = objetivo; alternativasProbadas.clear();
}
mapa.on('zoomend', () => fondoPorZoom());
$('fondo-auto').checked = Boolean(estado.fondoAuto);
$('fondo-auto').addEventListener('change', (ev) => {
  estado.fondoAuto = ev.target.checked; guardar();
  if (estado.fondoAuto) fondoPorZoom({ forzar: true });
  else if (fondoActual?.idSpa !== estado.fondo) ponerFondo(estado.fondo);
fondoPorZoom({ forzar: true });
});

function revisarCapas() {
  const id = fondoActual?.idSpa; if (!id) return;
  const d = diag[id];
  if (d.ok > 0 || d.err < 4) return;
  // El fondo no ha cargado ni una tesela: ¿hay alternativa sin probar?
  const def = defsFondo.find((f) => f.id === (fondoElegido || id));
  const sig = (def?.alternativas || []).find((a) => !alternativasProbadas.has(a) && a !== id);
  if (sig) {
    alternativasProbadas.add(sig);
    const alt = ALTERNATIVAS.find((a) => a.id === sig);
    ponerFondo(sig, { automatico: true });
    mostrarAviso('aviso', `«${def.nombre}» no responde por su vía principal. Se está probando: <b>${esc(alt.nombre)}</b>.`, d.url);
    return;
  }
  mostrarAviso('error', `No llega ninguna imagen de «${esc(defsFondo.find((f) => f.id === id)?.nombre || id)}».`, d.url);
}

function mostrarAviso(tipo, texto, urlPrueba) {
  const causas = enVistaPrevia
    ? '<li><b>Estás viendo el mapa dentro de una vista previa</b> (la app de Claude, el correo, Drive…). Esas vistas bloquean internet. <b>Descarga el archivo y ábrelo con Chrome o Edge.</b></li>'
    : '';
  $('aviso').className = `aviso aviso-${tipo}`;
  $('aviso').innerHTML = `<div class="av-tit">${texto}</div>
    <ul>${causas}
      <li>Si lo abres desde un visor (móvil, correo, app), descárgalo y ábrelo con <b>Chrome o Edge</b> en el ordenador.</li>
      <li>La red puede estar bloqueando <code>ign.es</code> (redes corporativas o de Defensa). Prueba con otra conexión.</li>
    </ul>
    <div class="av-acc">${urlPrueba ? `<a href="${esc(urlPrueba)}" target="_blank" rel="noopener">Abrir una tesela de prueba</a>` : ''}
      <button type="button" data-fondo-alt="satelite-esri">Usar satélite de Esri</button>
      <button type="button" id="aviso-cerrar">Cerrar</button></div>
    <div class="av-nota">Si la tesela de prueba se abre y se ve una imagen, el IGN funciona y el problema es el visor. Si da error, dime qué mensaje sale.</div>`;
  $('aviso').hidden = false;
}
function ocultarAviso() { $('aviso').hidden = true; }
$('aviso').addEventListener('click', (ev) => {
  if (ev.target.id === 'aviso-cerrar') ocultarAviso();
  const b = ev.target.closest('[data-fondo-alt]');
  if (b) { ponerFondo(b.dataset.fondoAlt, { automatico: true }); alternativasProbadas.add(b.dataset.fondoAlt); ocultarAviso(); }
});
if (enVistaPrevia) {
  setTimeout(() => { if (!Object.values(diag).some((d) => d.ok > 0)) mostrarAviso('aviso', 'Parece que el mapa se está viendo dentro de una vista previa.', ''); }, 4000);
}
$('fondos').innerHTML = FONDOS.map((f) => `<button type="button" class="fondo" data-id="${f.id}" title="${esc(f.detalle)}" aria-pressed="false">
  <span class="muestra muestra-${f.id}"></span><span class="nom">${esc(f.nombre)}</span></button>`).join('');
$('fondos').addEventListener('click', (ev) => { const b = ev.target.closest('.fondo'); if (b) ponerFondo(b.dataset.id); });
ponerFondo(estado.fondo);
fondoPorZoom({ forzar: true });

// Superpuestas: las del IGN + cuadrícula MGRS + zona piloto
// Rectángulos (en píxeles del mapa) que las etiquetas de la cuadrícula no deben tapar
const SELECTORES_OBSTACULO = '.herramientas, .panel-capas, .panel-medida, .aviso, .aviso-breve, .leaflet-control-zoom, .leaflet-control-scale, .leaflet-control-attribution';
function obstaculos() {
  const base = $('mapa').getBoundingClientRect();
  return [...document.querySelectorAll(SELECTORES_OBSTACULO)].map((el) => el.getBoundingClientRect())
    .filter((r) => r.width && r.height)
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
  $('cuad-intensidad-v').textContent = `${estado.intensidadCuadricula} %`;
  cuadricula.redibujar();
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
  const p = $('panel-capas'); const cerrado = p.classList.toggle('cerrado');
  $('capas-toggle').setAttribute('aria-expanded', String(!cerrado));
  recolocarEtiquetas();
});
if (window.matchMedia('(max-width: 760px)').matches) { $('panel-capas').classList.add('cerrado'); $('capas-toggle').setAttribute('aria-expanded', 'false'); }

// ---------------------------------------------------------------- dibujo (fase 3)
const dibujo = iniciarDibujo({
  L, mapa,
  herramienta: () => herramienta,
  elegirHerramienta: (h) => elegirHerramienta(h),
  alCambiarPaneles: () => recolocarEtiquetas(),
  fmt: {
    metros: (m) => metros(m),
    rumbo: (g) => rumbo(g),
    mgrs: (p) => geoAMgrs(p.lat, p.lon, estado.precision, { separado: true }),
    secundaria: (p) => formatearPosicion(p, { formato: 'gms' }),
    unidadAngulo: () => ({ grados: 'grados', milesimas: 'milésimas', gms: 'G M S' }[estado.angulo]),
  },
});

// ---------------------------------------------------------------- barra de estado
const tactil = window.matchMedia('(hover: none)').matches;
if (tactil) { document.body.classList.add('tactil'); const c = document.createElement('div'); c.className = 'cruz'; $('contenido').append(c); }
let ultimaPos = null;
function mostrarPos(latlng, etiqueta) {
  ultimaPos = { lat: latlng.lat, lon: latlng.lng };
  $('be-et').textContent = etiqueta;
  try {
    $('be-mgrs').textContent = geoAMgrs(ultimaPos.lat, ultimaPos.lon, estado.precision, { separado: true });
    const u = geoAUtm(ultimaPos.lat, ultimaPos.lon);
    $('be-sec').innerHTML = `<span>${formatearPosicion(ultimaPos, { formato: 'utm' })}</span><span>${formatearPosicion(ultimaPos, { formato: 'gms' })}</span><span>Conv. ${conv(u.convergencia)}</span>`;
  } catch { $('be-mgrs').textContent = '—'; $('be-sec').textContent = 'Fuera del ámbito UTM'; }
}
// Al salir del mapa (por ejemplo, para pulsar «Copiar») se conserva la
// última posición del cursor: es la que se copia.
let cursorDentro = false;
mapa.on('mousemove', (e) => { if (!tactil) { cursorDentro = true; mostrarPos(e.latlng, 'Cursor'); dibujo.moverCursor({ lat: e.latlng.lat, lon: e.latlng.lng }); } });
mapa.on('moveend', () => { if (tactil || !ultimaPos) mostrarPos(mapa.getCenter(), 'Centro'); });
mapa.on('mouseout', () => { cursorDentro = false; if (ultimaPos) $('be-et').textContent = 'Última'; });
mostrarPos(mapa.getCenter(), 'Centro');

/** Copia texto al portapapeles (con respaldo para navegadores sin permiso). */
async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* respaldo */ }
  const t = document.createElement('textarea');
  t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(t); t.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* nada */ }
  t.remove(); return ok;
}
function avisarCopia(boton, ok, texto) {
  const original = boton.dataset.original ?? boton.textContent; boton.dataset.original = original;
  boton.textContent = ok ? 'Copiado' : 'No se pudo';
  boton.title = ok ? `Copiado: ${texto}` : 'El navegador no deja copiar';
  setTimeout(() => { boton.textContent = original; }, 1400);
}
const mgrsActual = () => (ultimaPos ? geoAMgrs(ultimaPos.lat, ultimaPos.lon, estado.precision, { separado: true }) : '');
$('be-copiar').addEventListener('click', async () => { const t = mgrsActual(); if (t) avisarCopia($('be-copiar'), await copiarTexto(t), t); });
// Tecla C con el ratón sobre el mapa: copia la coordenada del cursor sin moverlo
document.addEventListener('keydown', async (e) => {
  if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey || !cursorDentro) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const t = mgrsActual(); if (t) avisarCopia($('be-copiar'), await copiarTexto(t), t);
});

for (const grupo of document.querySelectorAll('.seg[data-pref]')) {
  const clave = grupo.dataset.pref;
  const pintar = () => grupo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(estado[clave]))));
  grupo.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    estado[clave] = clave === 'precision' ? Number(b.dataset.v) : b.dataset.v;
    guardar(); pintar();
    if (ultimaPos) mostrarPos({ lat: ultimaPos.lat, lng: ultimaPos.lon }, $('be-et').textContent);
    pintarMedida();
    if (fichaAbierta) fichaAbierta();
    dibujo.refrescar();
  });
  pintar();
}

// ---------------------------------------------------------------- marcas y fichas de punto
const marcas = L.layerGroup().addTo(mapa);
const iconoPunto = L.divIcon({ className: '', html: '<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="6" fill="#9A7642" stroke="#fff" stroke-width="2.5"/><circle cx="11" cy="11" r="10" fill="none" stroke="#9A7642" stroke-width="1"/></svg>', iconSize: [22, 22], iconAnchor: [11, 11] });
let fichaAbierta = null;

function fichaPunto(p, titulo = '') {
  const u = geoAUtm(p.lat, p.lon);
  const mgrs = geoAMgrs(p.lat, p.lon, estado.precision, { separado: true });
  return `<div class="ficha">${titulo ? `<div style="font-weight:600;margin-bottom:4px">${esc(titulo)}</div>` : ''}
    <div class="f-mgrs">${mgrs}</div>
    <dl><dt>UTM</dt><dd>${formatearPosicion(p, { formato: 'utm' })}</dd>
      <dt>Geográficas</dt><dd>${formatearPosicion(p, { formato: 'gms' })}</dd>
      <dt>Grados</dt><dd>${formatearPosicion(p, { formato: 'gd' })}</dd>
      <dt>Huso / banda</dt><dd>${u.zona} / ${bandaLatitud(p.lat)}</dd>
      <dt>Convergencia</dt><dd>${conv(u.convergencia)}</dd></dl>
    <div class="f-acc"><button class="copiar" data-copiar="${esc(mgrs)}">Copiar MGRS</button><button class="copiar" data-medir-desde="${p.lat},${p.lon}">Medir desde aquí</button></div></div>`;
}
function ponerMarca(p, titulo) {
  const m = L.marker([p.lat, p.lon], { icon: iconoPunto }).addTo(marcas);
  const pintar = () => m.setPopupContent(fichaPunto(p, titulo));
  m.bindPopup(fichaPunto(p, titulo), { maxWidth: 320 });
  m.on('popupopen', () => { fichaAbierta = pintar; });
  m.on('popupclose', () => { fichaAbierta = null; });
  m.openPopup();
  return m;
}
document.addEventListener('click', async (ev) => {
  const c = ev.target.closest('[data-copiar]');
  if (c) avisarCopia(c, await copiarTexto(c.dataset.copiar), c.dataset.copiar);
  const d = ev.target.closest('[data-medir-desde]');
  if (d) {
    const [lat, lon] = d.dataset.medirDesde.split(',').map(Number);
    mapa.closePopup(); elegirHerramienta('medir'); medida.length = 0; medida.push({ lat, lon }); pintarMedida();
  }
});

// ---------------------------------------------------------------- herramientas
let herramienta = 'consultar';
function elegirHerramienta(h) {
  herramienta = h;
  document.querySelectorAll('[data-herr]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.herr === h)));
  $('panel-medida').hidden = h !== 'medir';
  mapa.getContainer().style.cursor = h === 'medir' || HERRAMIENTAS_DIBUJO.includes(h) ? 'crosshair' : '';
  pintarMedida();
  dibujo.herramientaCambiada(h);
  recolocarEtiquetas();
}
document.querySelectorAll('[data-herr]').forEach((b) => b.addEventListener('click', () => elegirHerramienta(b.dataset.herr)));
$('limpiar').addEventListener('click', () => { marcas.clearLayers(); medida.length = 0; pintarMedida(); });
$('ir-piloto').addEventListener('click', () => mapa.flyToBounds(piloto, { padding: [20, 20], duration: 0.8 }));

mapa.on('click', (e) => {
  const p = { lat: e.latlng.lat, lon: e.latlng.lng };
  if (herramienta === 'medir') { medida.push(p); pintarMedida(); return; }
  if (HERRAMIENTAS_DIBUJO.includes(herramienta)) { dibujo.clic(p); return; }
  if (dibujo.quitarSeleccion()) return;   // primer clic fuera: solo deselecciona
  ponerMarca(p);
});
mapa.on('dblclick', () => { if (HERRAMIENTAS_DIBUJO.includes(herramienta)) dibujo.dobleClic(); });

// ---------------------------------------------------------------- regla de medida
const medida = [];
const capaMedida = L.layerGroup().addTo(mapa);
function pintarMedida() {
  capaMedida.clearLayers();
  for (let i = 1; i < medida.length; i++) {
    L.polyline(puntosGeodesica(medida[i - 1], medida[i], 16).map((q) => [q.lat, q.lon]),
      { color: '#A3362B', weight: 3, opacity: 0.9, interactive: false }).addTo(capaMedida);
  }
  medida.forEach((p, i) => L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 2, fillColor: '#A3362B', fillOpacity: 1, interactive: false })
    .bindTooltip(String.fromCharCode(65 + (i % 26)), { permanent: true, direction: 'right', className: 'etq-cuad', offset: [6, 0] }).addTo(capaMedida));

  const cuerpo = $('pm-cuerpo');
  if (medida.length < 2) {
    $('pm-ayuda').textContent = medida.length ? 'Toca el siguiente punto' : 'Toca el mapa para añadir puntos';
    cuerpo.innerHTML = medida.length ? `<p style="font-size:13px;color:var(--gris);margin:8px 0 0">Origen A: <code>${geoAMgrs(medida[0].lat, medida[0].lon, estado.precision, { separado: true })}</code></p>` : '';
    return;
  }
  $('pm-ayuda').textContent = 'Sigue tocando para añadir tramos';
  let total = 0, totalMapa = 0;
  const filas = [];
  for (let i = 1; i < medida.length; i++) {
    const r = medir(medida[i - 1], medida[i]);
    total += r.distancia; totalMapa += r.distanciaCuadricula;
    const de = String.fromCharCode(65 + ((i - 1) % 26)), a = String.fromCharCode(65 + (i % 26));
    filas.push(`<tr><td>${de}→${a}</td><td>${metros(r.distancia)}</td><td>${rumbo(r.rumbo)}</td><td>${rumbo(r.rumboCuadricula)}</td></tr>`);
  }
  const unidad = { grados: 'grados', milesimas: 'milésimas', gms: 'G M S' }[estado.angulo];
  cuerpo.innerHTML = `<div class="pm-total"><div class="grande">${metros(total)}</div>
      <div class="peq">Real, sobre el elipsoide · Sobre el mapa: ${metros(totalMapa)}</div></div>
    <table class="pm-tramos"><thead><tr><th>Tramo</th><th>Distancia</th><th>Rumbo geo</th><th>Rumbo cuad.</th></tr></thead>
    <tbody>${filas.join('')}</tbody></table>
    <p style="font-size:11.5px;color:var(--gris);margin:6px 0 0">Rumbos en ${unidad}. Rumbo magnético: pendiente.</p>`;
}
$('pm-deshacer').addEventListener('click', () => { medida.pop(); pintarMedida(); });
$('pm-nueva').addEventListener('click', () => { medida.length = 0; pintarMedida(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && herramienta === 'medir') { if (medida.length) { medida.length = 0; pintarMedida(); } else elegirHerramienta('consultar'); }
});

// ---------------------------------------------------------------- buscar posición
$('buscar').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const txt = $('buscar-txt').value.trim();
  const err = $('buscar-error'); err.classList.remove('visible');
  if (!txt) return;
  try {
    const p = leerPosicion(txt);
    const zoom = p.lado >= 10000 ? 11 : p.lado >= 1000 ? 13 : 15;
    mapa.flyTo([p.lat, p.lon], Math.max(zoom, Math.min(mapa.getZoom(), 17)), { duration: 0.8 });
    mapa.once('moveend', () => ponerMarca(p, p.lado > 1 ? `Centro del cuadrado de ${metros(p.lado)}` : 'Posición buscada'));
  } catch (e) { err.textContent = e.message; err.classList.add('visible'); }
});
$('buscar-txt').addEventListener('input', () => $('buscar-error').classList.remove('visible'));

elegirHerramienta('consultar');
// Para pruebas automáticas
window.__spa = { mapa, estado, medida, pintarMedida, diag, dibujo, cuadricula };
