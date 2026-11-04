// Página del mapa: fondos (IGN, híbrido con imagen elegible, relieve propio),
// mapas importados, visualización (cuadrícula, sombreado, curvas), buscador
// universal, ajustes, regla, dibujo (dibujo.js) e importación (importar.js).
// Usa Leaflet (global L).
import { formatearPosicion, formatearRumbo } from '../geo/index.js';
import { FONDOS, IMAGENES, ROTULOS, SUPERPUESTAS, ZONA_PILOTO, ATRIBUCION_MDT, crearCapa, fechaImagen } from '../mapa/capas.js';
import { capaRelieve } from '../mapa/relieve.js';
import { capaCuadricula } from '../mapa/cuadricula.js';
import { iniciarDibujo, HERRAMIENTAS_DIBUJO } from './dibujo.js';
import { iniciarImportar } from './importar.js';
import { iniciarCreador } from './creador.js';
import { iniciarSimbolos } from './simbolos.js';
import { crearServicioAlturas } from '../datos/alturas.js';
import { prepararRejillas } from '../geo/rejillas.js';
import { crsDesdeEpsg } from '../geo/crs.js';
import { buscar, leerCoordenadaFlexible } from './difuso.js';
import { TIPOS } from '../plan/plan.js';
import { esPaqueteSpa, abrirPaquete } from '../plan/operaciones.js';
import { iniciarVentanas } from './ventanas.js';
import { iniciarApariencia } from './apariencia.js';
import { iniciarObjetos } from './objetos.js';
import { iniciarPanelOperaciones } from './panel-operaciones.js';
import { iniciarLazo } from './lazo.js';
import { iniciarRegla } from './regla.js';
import { lupa, etiquetas, reordenable, deslizador, brinco } from './vivo.js';
import { zoomSuave } from '../mapa/zoom-suave.js';
import { crearBuscadorLugares } from '../datos/lugares.js';
import { FORMATOS_EXPORTAR } from '../datos/exportar.js';

const L = window.L;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- estado y ajustes
const CLAVE = 'spa.mapa.estado';
const estado = {
  angulo: 'grados', coordenadas: 'mgrs', fondo: 'mtn', imagen: 'google', rotulos: true,
  fondoAuto: false, mtnDetalle: false, intensidadCuadricula: 35, simTam: { px: 34 },
  superpuestas: { cuadricula: true }, secciones: {}, ajustesAbiertos: {}, vista: null,
};
try { Object.assign(estado, JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch { /* sin almacenamiento */ }
if (!FONDOS.some((f) => f.id === estado.fondo)) estado.fondo = ['ortofoto', 'satelite'].includes(estado.fondo) ? 'hibrido' : 'mtn';
if (!IMAGENES[estado.imagen] || !(estado.version >= 6)) estado.imagen = 'google'; // v0.6: Google por defecto
// v0.9.3: los desplegables empiezan cerrados (Capas y Ajustes)
if (!(estado.version >= 7)) { estado.secciones = {}; estado.ajustesAbiertos = {}; }
estado.version = 7;
delete estado.superpuestas.vertices;
delete estado.superpuestas.piloto; // v0.9: sin zona piloto
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* nada */ } };

const metros = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km` : `${m.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`);
const coord = (p) => formatearPosicion(p, { formato: estado.coordenadas, precisionMgrs: 5, separado: true });
const rumbo = (g) => formatearRumbo(g, estado.angulo, estado.angulo === 'grados' ? 1 : 0);

const alturas = crearServicioAlturas();
prepararRejillas().catch(() => {}); // ED50 y geoide (mapas antiguos, alturas de ATAK, búsqueda en ED50)

// ---------------------------------------------------------------- mapa
// Vista de la primera vez (sin nada guardado): la zona de Guadarrama
const vistaInicial = L.latLngBounds([ZONA_PILOTO.sur, ZONA_PILOTO.oeste], [ZONA_PILOTO.norte, ZONA_PILOTO.este]);
// Movimiento fluido: el arrastre sigue con inercia y frena poco a poco; la rueda acerca con suavidad (zoom-suave.js)
const mapa = L.map('mapa', {
  zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 21, doubleClickZoom: false, zoomSnap: 1,
  scrollWheelZoom: false, inertia: true, inertiaDeceleration: 1500, inertiaMaxSpeed: 4000, easeLinearity: 0.18,
  zoomAnimationThreshold: 6,
});
zoomSuave(L, mapa);
mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
L.control.scale({ metric: true, imperial: false, maxWidth: 160, position: 'bottomright' }).addTo(mapa);
if (estado.vista) mapa.setView(estado.vista.centro, estado.vista.zoom); else mapa.fitBounds(vistaInicial, { padding: [20, 20] });
new ResizeObserver(() => mapa.invalidateSize({ pan: false })).observe($('mapa'));
mapa.on('moveend', () => { const c = mapa.getCenter(); estado.vista = { centro: [c.lat, c.lng], zoom: mapa.getZoom() }; guardar(); });
const centro = () => { const c = mapa.getCenter(); return { lat: c.lat, lon: c.lng }; };

// ---------------------------------------------------------------- diagnóstico de capas
const diag = {};
const enVistaPrevia = (() => { try { return window.top !== window.self; } catch { return true; } })();
function vigilar(id, capa) {
  diag[id] = { ok: 0, err: 0, url: '' };
  capa.on('tileload', () => { diag[id].ok++; });
  capa.on('tileerror', (e) => { diag[id].err++; diag[id].url = e.tile?.src || diag[id].url; setTimeout(revisarCapas, 0); });
  return capa;
}
function revisarCapas() {
  const id = fondoActual?.idDiag; if (!id) return;
  const d = diag[id];
  if (!d || d.ok > 0 || d.err < 4) return;
  const nombre = id.startsWith('img-') ? `la imagen ${IMAGENES[id.slice(4)].nombre}` : FONDOS.find((f) => f.id === id)?.nombre || id;
  const causas = enVistaPrevia ? '<li><b>Estás viendo el mapa dentro de una vista previa.</b> Descarga el archivo y ábrelo con Chrome o Edge.</li>' : '';
  $('aviso').className = 'aviso aviso-error';
  $('aviso').innerHTML = `<div class="av-tit">No llega ninguna imagen de ${esc(nombre)}.</div><ul>${causas}
      <li>Si lo abres desde un visor (móvil, correo, app), descárgalo y ábrelo con <b>Chrome o Edge</b>.</li>
      <li>La red puede estar bloqueando el servicio (redes corporativas o de Defensa).</li>
      ${id.startsWith('img-') ? '<li>Prueba otra imagen del híbrido (Capas → Fondo).</li>' : ''}</ul>
    <div class="av-acc">${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">Abrir una tesela de prueba</a>` : ''}<button type="button" id="aviso-cerrar">Cerrar</button></div>`;
  $('aviso').hidden = false;
}
$('aviso').addEventListener('click', (ev) => { if (ev.target.id === 'aviso-cerrar') $('aviso').hidden = true; });

// ---------------------------------------------------------------- fondos
const capasImagen = Object.fromEntries(Object.entries(IMAGENES).map(([id, def]) => [id, vigilar(`img-${id}`, crearCapa(L, { ...def, zIndex: 1 }))]));
const capaRotulos = crearCapa(L, { ...ROTULOS, zIndex: 3 });
const capasFondo = {
  mtn: vigilar('mtn', crearCapa(L, FONDOS.find((f) => f.id === 'mtn'))),
  base: vigilar('base', crearCapa(L, FONDOS.find((f) => f.id === 'base'))),
  relieve: vigilar('relieve', capaRelieve(L, 'fondo', { atribucion: ATRIBUCION_MDT })),
  hibrido: L.layerGroup(),
  ...Object.fromEntries(FONDOS.filter((f) => f.url && !['mtn', 'base'].includes(f.id)).map((f) => [f.id, vigilar(f.id, crearCapa(L, f))])),
};
capasFondo.mtn.ponerDetalle?.(Boolean(estado.mtnDetalle));
function montarHibrido() {
  const g = capasFondo.hibrido;
  g.clearLayers();
  g.addLayer(capasImagen[estado.imagen]);
  if (estado.rotulos && !IMAGENES[estado.imagen].conRotulos) g.addLayer(capaRotulos);
  g.idDiag = `img-${estado.imagen}`;
}
montarHibrido();

let fondoActual = null;
let alCambiarFondo = () => {}; // la cuadrícula se pinta en blanco sobre el híbrido
// eslint-disable-next-line prefer-const
let importar = null;
const VERSION = '0.9.4';
function ponerFondo(id, { automatico = false } = {}) {
  if (!capasFondo[id]) id = 'mtn';
  if (fondoActual) mapa.removeLayer(fondoActual);
  if (id === 'hibrido') montarHibrido();
  fondoActual = capasFondo[id].addTo(mapa);
  fondoActual.bringToBack?.();
  fondoActual.idSpa = id;
  fondoActual.idDiag = id === 'hibrido' ? `img-${estado.imagen}` : id;
  if (!automatico) { estado.fondo = id; guardar(); $('aviso').hidden = true; }
  document.querySelectorAll('.fondo').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('fondo-actual').textContent = FONDOS.find((f) => f.id === id).nombre + (id === 'hibrido' ? ` · ${IMAGENES[estado.imagen].nombre}` : '');
  actualizarFecha();
  alCambiarFondo();
  apariencia?.refrescar(); // tema automático: oscuro sobre el híbrido
  if ($('capas-resumen')) $('capas-resumen').textContent = FONDOS.find((f) => f.id === id).nombre;
}
// eslint-disable-next-line prefer-const
let apariencia = null;
$('fondos').innerHTML = FONDOS.map((f) => `<button type="button" class="fondo" data-id="${f.id}" title="${esc(f.detalle)}" aria-pressed="false">
  <span class="muestra muestra-${f.id}"></span><span class="nom">${esc(f.nombre)}</span></button>`).join('');
$('fondos').addEventListener('click', (ev) => { const b = ev.target.closest('.fondo'); if (b) ponerFondo(b.dataset.id); });

// Imagen del híbrido y su fecha
$('imagen-fuente').innerHTML = Object.entries(IMAGENES).map(([id, d]) => `<button type="button" data-v="${id}" title="${esc(d.detalle)}">${esc(d.nombre)}</button>`).join('');
function ponerImagen(id) {
  estado.imagen = id; guardar();
  $('imagen-fuente').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === id)));
  if (fondoActual?.idSpa === 'hibrido') ponerFondo('hibrido', { automatico: true });
  else actualizarFecha();
}
$('imagen-fuente').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-v]'); if (b) { ponerImagen(b.dataset.v); if (fondoActual?.idSpa !== 'hibrido') ponerFondo('hibrido'); } });
$('rotulos').checked = estado.rotulos;
$('rotulos').addEventListener('change', (ev) => { estado.rotulos = ev.target.checked; guardar(); if (fondoActual?.idSpa === 'hibrido') ponerFondo('hibrido', { automatico: true }); });
let tFecha = 0, nFecha = 0;
function actualizarFecha() {
  clearTimeout(tFecha);
  const caja = $('imagen-fecha');
  const def = IMAGENES[estado.imagen];
  if (!def.fecha) { caja.textContent = `${def.nombre} no publica la fecha de sus imágenes.`; return; }
  if (fondoActual?.idSpa !== 'hibrido') { caja.textContent = ''; return; }
  caja.textContent = 'Fecha de la imagen: consultando…';
  const n = ++nFecha;
  tFecha = setTimeout(async () => {
    const c = centro();
    try {
      const f = await fechaImagen(def.fecha, c.lat, c.lon);
      if (n === nFecha) caja.innerHTML = f ? `Imagen en el centro del mapa: <b>${esc(f)}</b>` : 'Sin fecha para esta zona.';
    } catch { if (n === nFecha) caja.textContent = 'No se pudo consultar la fecha.'; }
  }, 500);
}
mapa.on('moveend', () => { if (fondoActual?.idSpa === 'hibrido') actualizarFecha(); });
ponerImagen(estado.imagen);
ponerFondo(estado.fondo);

// Híbrido al acercarse (opcional)
const ZOOM_HIBRIDO = 17;
let zoomPrevio = null;
function fondoPorZoom({ forzar = false } = {}) {
  const z = mapa.getZoom();
  const cerca = z >= ZOOM_HIBRIDO, antes = zoomPrevio !== null && zoomPrevio >= ZOOM_HIBRIDO;
  zoomPrevio = z;
  if (!estado.fondoAuto || (!forzar && cerca === antes)) return;
  const objetivo = cerca ? 'hibrido' : estado.fondo;
  if (fondoActual?.idSpa !== objetivo) ponerFondo(objetivo, { automatico: true });
}
mapa.on('zoomend', () => fondoPorZoom());
$('fondo-auto').checked = Boolean(estado.fondoAuto);
$('fondo-auto').addEventListener('change', (ev) => {
  estado.fondoAuto = ev.target.checked; guardar();
  if (estado.fondoAuto) fondoPorZoom({ forzar: true }); else if (fondoActual?.idSpa !== estado.fondo) ponerFondo(estado.fondo);
});
fondoPorZoom({ forzar: true });
$('mtn-detalle').checked = Boolean(estado.mtnDetalle);
$('mtn-detalle').addEventListener('change', (ev) => { estado.mtnDetalle = ev.target.checked; guardar(); capasFondo.mtn.ponerDetalle?.(estado.mtnDetalle); });

// ---------------------------------------------------------------- visualización
const SELECTORES_OBSTACULO = '.brujula, .barra-sup, .herramientas.visible, .herr-pista, .ventana, .pildora, .aviso, .aviso-breve, .leaflet-control-zoom, .leaflet-control-scale, .leaflet-control-attribution';
function obstaculos() {
  const base = $('mapa').getBoundingClientRect();
  return [...document.querySelectorAll(SELECTORES_OBSTACULO)].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height)
    .map((r) => ({ x0: r.left - base.left - 4, y0: r.top - base.top - 4, x1: r.right - base.left + 4, y1: r.bottom - base.top + 4 }));
}
const cuadricula = capaCuadricula(L, mapa, { intensidad: () => estado.intensidadCuadricula / 100, obstaculos, claro: () => fondoActual?.idSpa === 'hibrido' });
alCambiarFondo = () => { cuadricula.redibujar(); importar?.pintarMapas(); };
let ventanas = null;
const recolocarEtiquetas = () => { ventanas?.apilar(); requestAnimationFrame(() => { if (mapa.hasLayer(cuadricula)) cuadricula.redibujar(); }); };
const VISUAL = [
  { id: 'cuadricula', nombre: 'Cuadrícula MGRS', detalle: 'Calculada por SPA (100 km → 100 m según zoom)', capa: cuadricula },
  { id: 'sombreado', nombre: 'Sombreado', detalle: 'Relieve del MDT del IGN sobre cualquier fondo (5 m al acercarse)', capa: vigilar('sombreado', capaRelieve(L, 'sombreado', { atribucion: ATRIBUCION_MDT, zIndex: 2 })) },
  ...SUPERPUESTAS.map((s) => ({ ...s, capa: vigilar(s.id, crearCapa(L, s)) })),
];
const todasSup = VISUAL;
$('superpuestas').innerHTML = VISUAL.map((s) => `<label class="sup"><input type="checkbox" data-id="${s.id}">
  <span class="txt"><b>${esc(s.nombre)}</b><small>${esc(s.detalle)}</small></span></label>`).join('');
$('cuad-intensidad').value = estado.intensidadCuadricula;
$('cuad-intensidad-v').textContent = `${estado.intensidadCuadricula} %`;
$('cuad-intensidad').addEventListener('input', (ev) => {
  estado.intensidadCuadricula = Number(ev.target.value); guardar();
  $('cuad-intensidad-v').textContent = `${estado.intensidadCuadricula} %`; cuadricula.redibujar();
});
function ponerSup(id, on) {
  const s = todasSup.find((x) => x.id === id); if (!s) return;
  if (on) s.capa.addTo(mapa); else mapa.removeLayer(s.capa);
  estado.superpuestas[id] = on; guardar();
  document.querySelectorAll(`input[data-id="${id}"]`).forEach((c) => { c.checked = on; });
  const n = VISUAL.filter((v) => estado.superpuestas[v.id]).length;
  $('visual-cuenta').textContent = n ? `${n} activa${n > 1 ? 's' : ''}` : '';
}
$('capas-cuerpo').addEventListener('change', (ev) => { const i = ev.target.closest('input[data-id]'); if (i) ponerSup(i.dataset.id, i.checked); });
for (const s of todasSup) ponerSup(s.id, Boolean(estado.superpuestas[s.id]));

// Desplegables (recuerdan si estaban abiertos)
for (const d of document.querySelectorAll('.seccion')) {
  if (estado.secciones?.[d.dataset.sec] !== undefined) d.open = estado.secciones[d.dataset.sec];
  d.addEventListener('toggle', () => { estado.secciones = { ...estado.secciones, [d.dataset.sec]: d.open }; guardar(); recolocarEtiquetas(); });
}
const abrirSeccion = (sec) => { const d = document.querySelector(`.seccion[data-sec="${sec}"]`); if (d) d.open = true; ponerPanelCapas(true); };
// Capas: se recoge sola sin uso (ventanas.js); clic en el título la abre o la recoge
// Capas sale de la barra lateral (como Operaciones y Objetos)
function ponerPanelCapas(abierto) {
  $('panel-capas').hidden = !abierto;
  if (abierto) ventanas?.usada($('panel-capas'));
  recolocarEtiquetas();
}

// ---------------------------------------------------------------- herramientas, dibujo e importación
let herramienta = 'consultar';
let ultimaPos = null;
const fmt = { metros, coord };
const simbolos = iniciarSimbolos({
  L, mapa,
  elegirHerramienta: (h) => elegirHerramienta(h),
  herramienta: () => herramienta,
  tamano: () => estado.simTam,
});
const dibujo = iniciarDibujo({
  L, mapa, alturas, fmt, simbolos,
  herramienta: () => herramienta,
  elegirHerramienta: (h) => elegirHerramienta(h),
  puntosExternos: () => importar?.puntosVisibles() ?? [],
  alCambiarPaneles: () => recolocarEtiquetas(),
});
simbolos.conectar(dibujo);
function abrirSimbolos(pestana) {
  const abierto = simbolos.abierto && $('panel-simbolos').dataset.pestana === pestana;
  simbolos.abrir(pestana, !abierto);
  $('panel-simbolos').dataset.pestana = pestana;
  document.body.classList.toggle('simbolos-abierto', simbolos.abierto);
  recolocarEtiquetas();
}
document.querySelectorAll('[data-simbolos]').forEach((b) => b.addEventListener('click', () => { cerrarMenuApp6(); abrirSimbolos(b.dataset.simbolos); }));

// Botón APP-6: al pasar el ratón aparecen Unidades, Líneas de coordinación y Cometidos; al irse, desaparecen
const menuApp6 = $('menu-app6');
let tMenuApp6 = 0;
function abrirMenuApp6() {
  clearTimeout(tMenuApp6);
  if (!menuApp6.hidden) return;
  const b = $('btn-app6').getBoundingClientRect(), c = $('contenido').getBoundingClientRect();
  const k = Number(getComputedStyle(document.documentElement).getPropertyValue('--escala-ui')) || 1;
  menuApp6.style.left = `${(b.left - c.left) / k}px`; menuApp6.style.top = `${(b.bottom - c.top + 6) / k}px`;
  menuApp6.hidden = false; $('btn-app6').setAttribute('aria-expanded', 'true');
  mostrarHerramientas(true);
}
function cerrarMenuApp6(espera = 0) {
  clearTimeout(tMenuApp6);
  const cerrar = () => { menuApp6.hidden = true; $('btn-app6').setAttribute('aria-expanded', 'false'); };
  if (espera) tMenuApp6 = setTimeout(cerrar, espera); else cerrar();
}
$('btn-app6').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') abrirMenuApp6(); });
$('btn-app6').addEventListener('pointerleave', () => cerrarMenuApp6(260));
menuApp6.addEventListener('pointerenter', () => clearTimeout(tMenuApp6));
menuApp6.addEventListener('pointerleave', () => cerrarMenuApp6(220));
$('btn-app6').addEventListener('click', () => { if (menuApp6.hidden) abrirMenuApp6(); else cerrarMenuApp6(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenuApp6(); });
new MutationObserver(() => { document.body.classList.toggle('simbolos-abierto', !$('panel-simbolos').hidden); recolocarEtiquetas(); }).observe($('panel-simbolos'), { attributes: true, attributeFilter: ['hidden'] });
// Tamaño de los símbolos (Ajustes): al ponerlos; crecen al acercar hasta un tope y encogen al alejar
function ponerTamSim() {
  $('sim-tam').min = 20; $('sim-tam').max = 70; $('sim-tam').step = 2;
  $('sim-tam').value = estado.simTam.px;
  $('sim-tam-v').textContent = `${estado.simTam.px} px`;
}
$('sim-tam').addEventListener('input', (ev) => {
  estado.simTam.px = Number(ev.target.value);
  guardar(); ponerTamSim(); dibujo.refrescar();
});
ponerTamSim();
importar = iniciarImportar({
  L, mapa, alturas, fmt, dibujo,
  alPaqueteSpa: (texto, nombreArchivo) => {
    let pq; try { pq = JSON.parse(texto); } catch { return false; }
    if (!esPaqueteSpa(pq)) return false;
    pq.nombre ||= nombreArchivo.replace(/\.(spa\.json|json|spa)$/i, '');
    const o = dibujo.cambio(`Abrir paquete «${pq.nombre}»`, (p) => abrirPaquete(p, pq));
    dibujo.avisoBreve(`«${o.nombre}» abierto`);
    setTimeout(() => { ponerPanel('operaciones', true); operaciones.mostrar(o.id); dibujo.encuadrar(dibujo.plan().elementos.filter((e) => e.paquete && e.paquete === o.id || dibujo.plan().operaciones.some((x) => x.id === e.paquete && x.padre === o.id)).map((e) => e.id)); }, 0);
    return true;
  },
  fondo: () => fondoActual?.idSpa ?? '',
  herramienta: () => herramienta,
  alCambiarPaneles: () => recolocarEtiquetas(),
});
const creador = iniciarCreador({
  L, mapa, estado, dibujo, importar,
  herramienta: () => herramienta,
  elegirHerramienta: (h) => elegirHerramienta(h),
  avisar: (t) => dibujo.avisoBreve(t),
});
function abrirCreador() {
  if (herramienta === 'medir' || HERRAMIENTAS_DIBUJO.includes(herramienta)) elegirHerramienta('consultar');
  dibujo.quitarSeleccion(); importar.cerrarFicha();
  creador.abrir(true);
}
$('btn-crear-mapa').addEventListener('click', abrirCreador);
// Cuenta de mapas en el título del desplegable
new MutationObserver(() => { const n = document.querySelectorAll('#mapas-importados .mapa-imp').length; $('mapas-cuenta').textContent = n ? `${n} importado${n > 1 ? 's' : ''}` : ''; })
  .observe($('mapas-importados'), { childList: true });

const NOMBRE_HERR = { consultar: 'Mover', punto: 'Punto', linea: 'Línea', area: 'Área', circulo: 'Círculo', medir: 'Medir', lazo: 'Lazo', 'zona-mapa': 'Zona del mapa' };
/** ¿Se está poniendo algo en el mapa? (las ventanas se apartan) */
const colocando = () => herramienta !== 'consultar' || simbolos.armado || dibujo.dibujando;
function elegirHerramienta(h) {
  herramienta = h;
  document.querySelectorAll('[data-herr]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.herr === h)));
  $('herr-actual').textContent = NOMBRE_HERR[h] ?? h;
  $('herr-pista').classList.toggle('activa', h !== 'consultar');
  $('panel-medida').hidden = h !== 'medir';
  mapa.getContainer().classList.toggle('cursor-cruz', h === 'medir' || h === 'zona-mapa' || h === 'lazo' || HERRAMIENTAS_DIBUJO.includes(h));
  if (h === 'medir') importar.cerrarFicha();
  regla?.herramientaCambiada(h);
  dibujo.herramientaCambiada(h);
  creador?.herramientaCambiada(h);
  lazo?.herramientaCambiada(h);
  simbolos.actualizarAviso();
  ventanas?.actualizar();
  recolocarEtiquetas();
}
document.querySelectorAll('[data-herr]').forEach((b) => b.addEventListener('click', () => elegirHerramienta(b.dataset.herr)));
// ---------------------------------------------------------------- Objetos, Operaciones y Lazo
const lazo = iniciarLazo({
  L, mapa, dibujo, simbolos, fmt, importar: () => importar,
  herramienta: () => herramienta,
  elegirHerramienta: (h) => elegirHerramienta(h),
  alCambiarPaneles: () => recolocarEtiquetas(),
});
const objetos = iniciarObjetos({ dibujo, simbolos, exportar: (ids, nombre) => lazo.exportar(ids, nombre), alCambiarPaneles: () => recolocarEtiquetas() });
const operaciones = iniciarPanelOperaciones({
  dibujo, simbolos, exportar: (ids, nombre) => lazo.exportar(ids, nombre),
  verEnObjetos: (id) => { ponerPanel('objetos', true); objetos.filtrarPaquete(id); },
  alCambiarPaneles: () => recolocarEtiquetas(),
});
const capas = { abrir: (si) => ponerPanelCapas(si), get abierto() { return !$('panel-capas').hidden; } };
const PANELES = { capas: { api: capas, boton: 'btn-capas' }, operaciones: { api: operaciones, boton: 'btn-operaciones' }, objetos: { api: objetos, boton: 'btn-objetos' } };
function ponerPanel(id, abierto) {
  const p = PANELES[id];
  if (abierto && window.matchMedia('(max-width: 760px)').matches) { for (const k of Object.keys(PANELES)) if (k !== id) PANELES[k].api.abrir(false); }
  p.api.abrir(abierto);
  $(p.boton).setAttribute('aria-pressed', String(abierto));
  if (abierto) { const b = $(p.boton); b.classList.remove('bote'); void b.offsetWidth; b.classList.add('bote'); b.addEventListener('animationend', () => b.classList.remove('bote'), { once: true }); }
  if (abierto) ventanas?.usada(document.querySelector(`.ventana[data-ventana="${id}"]`));
  try { localStorage.setItem(`spa.panel.${id}`, abierto ? '1' : '0'); } catch { /* nada */ }
  recolocarEtiquetas();
}
for (const id of Object.keys(PANELES)) {
  $(PANELES[id].boton).addEventListener('click', () => ponerPanel(id, !PANELES[id].api.abierto));
  $(`${id}-cerrar`).addEventListener('click', () => ponerPanel(id, false));
  try { if (localStorage.getItem(`spa.panel.${id}`) === '1') ponerPanel(id, true); } catch { /* nada */ }
  // El botón de la barra lateral sigue a su panel (se puede cerrar solo, al recogerse)
  const panel = document.querySelector(`.ventana[data-ventana="${id}"]`);
  new MutationObserver(() => $(PANELES[id].boton).setAttribute('aria-pressed', String(!panel.hidden))).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
}
// Barras vivas: los iconos crecen al pasar el ratón, el nombre sale al pasar y se reordenan manteniendo pulsado
deslizador(document);
brinco($('dock'), { tipo: 'salto', eje: 'x' });
brinco($('herramientas'), { tipo: 'pop' });
lupa($('herramientas'), { eje: 'x' });
etiquetas($('herramientas'), { lado: 'abajo' });
reordenable($('herramientas'), { clave: 'spa.orden.herramientas', eje: 'x', grupos: '.h-grupo' });
lupa($('dock'), { eje: 'y', max: 1.35 });
etiquetas($('dock'), { lado: 'derecha' });
reordenable($('dock'), { clave: 'spa.orden.dock', eje: 'y', alCambiar: () => recolocarEtiquetas() });

// Píldora de la operación activa (abajo, junto a las coordenadas)
function pintarPildoraOp() {
  const id = dibujo.activo, b = $('pildora-op');
  b.hidden = !id;
  if (id) b.innerHTML = `<i></i><span>${esc(nombreRutaOp(id))}</span>`;
}
const nombreRutaOp = (id) => { const out = []; const pl = dibujo.plan(); for (let o = pl.operaciones.find((x) => x.id === id); o && !out.includes(o.nombre); o = pl.operaciones.find((x) => x.id === o.padre)) out.unshift(o.nombre); return out.join(' › '); };
$('pildora-op').addEventListener('click', () => { ponerPanel('operaciones', true); operaciones.mostrar(dibujo.activo); });
dibujo.suscribir(pintarPildoraOp); pintarPildoraOp();

// Ventanas: mover, redimensionar, recogerse sin uso y apartarse al poner objetos
apariencia = iniciarApariencia({ fondoOscuro: () => fondoActual?.idSpa === 'hibrido', alCambiar: () => { ventanas?.actualizar(); recolocarEtiquetas(); } });
ventanas = iniciarVentanas({
  reposo: () => apariencia.valores.reposo,
  apartar: () => apariencia.valores.apartar,
  colocando,
  escala: () => apariencia.valores.escala / 100,
  alCambiar: () => recolocarEtiquetas(),
});
$('ap-recolocar').addEventListener('click', () => ventanas.recolocar());
// Pinchar un objeto (aunque sea el mismo otra vez): su ficha siempre se ve, aunque se hubiera recogido
document.addEventListener('spa:ficha', () => requestAnimationFrame(() => { const f = $('panel-elemento'); if (!f.hidden) ventanas.usada(f); }));

// Barra de herramientas: aparece al acercar el ratón arriba (en táctil, siempre)
const tactil = window.matchMedia('(hover: none)').matches;
let tOcultar = 0;
function mostrarHerramientas(si) {
  clearTimeout(tOcultar);
  if (si) { $('herramientas').classList.add('visible'); document.body.classList.add('herr-visibles'); recolocarEtiquetas(); return; }
  tOcultar = setTimeout(() => { $('herramientas').classList.remove('visible'); document.body.classList.remove('herr-visibles'); recolocarEtiquetas(); }, 700);
}
// Cabecera: sin usarla se esconde hacia arriba; vuelve al acercar el ratón al borde de arriba
let tCabecera = 0;
const cabeceraEnUso = () => $('barra-sup').matches(':hover') || $('barra-sup').contains(document.activeElement) || !$('ajustes').hidden || !$('buscar-res').hidden;
function mostrarCabecera(si) {
  clearTimeout(tCabecera); tCabecera = 0;
  if (si) { document.body.classList.remove('sup-oculta'); return; }
  tCabecera = setTimeout(() => { tCabecera = 0; if (!cabeceraEnUso()) document.body.classList.add('sup-oculta'); recolocarEtiquetas(); }, 2200);
}
if (tactil) mostrarHerramientas(true);
else {
  document.addEventListener('mousemove', (e) => {
    const cerca = e.clientY < 66 || cabeceraEnUso();
    if (cerca) mostrarCabecera(true); else if (!document.body.classList.contains('sup-oculta') && !tCabecera) mostrarCabecera(false);
  }, { passive: true });
  document.addEventListener('focusin', (e) => { if (e.target.closest?.('#barra-sup')) mostrarCabecera(true); });
  document.addEventListener('focusout', () => mostrarCabecera(false));
  mostrarCabecera(false);
  $('contenido').addEventListener('mousemove', (e) => {
    const r = $('contenido').getBoundingClientRect(), b = $('herramientas').getBoundingClientRect();
    const sup = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sup')) || 64;
    const cerca = e.clientY - r.top < sup + 50 && e.clientX - r.left < Math.max(b.right - r.left, 240) + 40;
    const encima = $('herramientas').matches(':hover') || !menuApp6.hidden;
    if (cerca || encima) mostrarHerramientas(true);
    else if ($('herramientas').classList.contains('visible')) mostrarHerramientas(false);
  });
  $('contenido').addEventListener('mouseleave', () => mostrarHerramientas(false));
  $('herr-pista').addEventListener('mouseenter', () => mostrarHerramientas(true));
}
$('herr-pista').addEventListener('click', () => mostrarHerramientas(!$('herramientas').classList.contains('visible')));

// ---------------------------------------------------------------- ajustes (icono arriba a la derecha)
function abrirAjustes(si = $('ajustes').hidden, seccion = null) {
  $('ajustes').hidden = !si; $('btn-ajustes').setAttribute('aria-expanded', String(si));
  if (si && seccion) {
    const d = document.querySelector(`.aj-sec[data-aj="${seccion}"]`);
    if (d) { d.open = true; requestAnimationFrame(() => d.scrollIntoView({ block: 'nearest' })); }
  }
}
// Apartados desplegables de Ajustes (recuerdan si estaban abiertos)
for (const d of document.querySelectorAll('.aj-sec')) {
  if (estado.ajustesAbiertos?.[d.dataset.aj] !== undefined) d.open = estado.ajustesAbiertos[d.dataset.aj];
  d.addEventListener('toggle', () => { estado.ajustesAbiertos = { ...estado.ajustesAbiertos, [d.dataset.aj]: d.open }; guardar(); });
}
$('btn-ajustes').addEventListener('click', (ev) => { ev.stopPropagation(); abrirAjustes(); });
$('aj-version').textContent = `SPA v${VERSION}`;
document.addEventListener('click', (ev) => { if (!$('ajustes').hidden && !ev.target.closest('#ajustes, #btn-ajustes, #buscar')) abrirAjustes(false); });
function ponerPref(clave, v) {
  estado[clave] = v; guardar();
  document.querySelectorAll(`[data-pref="${clave}"] button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  if (ultimaPos) mostrarPos(ultimaPos, $('be-et').textContent);
  regla?.pintar(); dibujo.refrescar();
}
for (const grupo of document.querySelectorAll('[data-pref]')) {
  grupo.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) ponerPref(grupo.dataset.pref, b.dataset.v); });
  grupo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(estado[grupo.dataset.pref]))));
}

mapa.on('click', (e) => {
  const p = { lat: e.latlng.lat, lon: e.latlng.lng };
  if (herramienta === 'lazo' || lazo.recienTerminado) return; // el lazo maneja sus gestos
  if (herramienta === 'medir') { regla.clic(p); return; }
  if (herramienta === 'zona-mapa') { creador.clic(p); return; }
  if (HERRAMIENTAS_DIBUJO.includes(herramienta)) { dibujo.clic(p); return; }
  if (simbolos.colocarEn(e.latlng)) return; // paleta de unidades abierta: cada clic pone la unidad elegida
  if (!dibujo.quitarSeleccion()) importar.cerrarFicha();
});
mapa.on('dblclick', () => { if (HERRAMIENTAS_DIBUJO.includes(herramienta)) dibujo.dobleClic(); else if (herramienta === 'medir') regla.terminar(); else if (herramienta === 'zona-mapa') creador.dobleClic(); });
mapa.on('contextmenu', (e) => {
  if (HERRAMIENTAS_DIBUJO.includes(herramienta)) { L.DomEvent.preventDefault(e.originalEvent); dibujo.quitarUltimo(); }
  else if (herramienta === 'medir') { L.DomEvent.preventDefault(e.originalEvent); regla.quitarUltimo(); }
  else if (herramienta === 'zona-mapa') { L.DomEvent.preventDefault(e.originalEvent); creador.quitarUltimo(); }
  else if (simbolos.armado) { L.DomEvent.preventDefault(e.originalEvent); simbolos.desarmar(); } // botón derecho = Esc: dejar de poner la unidad
});

// ---------------------------------------------------------------- barra inferior: coordenada y altitud
if (tactil) { document.body.classList.add('tactil'); const c = document.createElement('div'); c.className = 'cruz'; $('contenido').append(c); }
let tAltura = 0, pedidaAltura = 0;
function mostrarPos(p, etiqueta) {
  ultimaPos = p;
  $('be-et').textContent = etiqueta;
  try { $('be-coord').textContent = coord(p); } catch { $('be-coord').textContent = 'Fuera del ámbito UTM'; }
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
  regla?.moverCursor(p);
});
mapa.on('moveend', () => { if (tactil || !ultimaPos) mostrarPos(centro(), 'Centro'); });
mapa.on('mouseout', () => { if (ultimaPos) $('be-et').textContent = 'Última'; });

// ---------------------------------------------------------------- regla de medida (regla.js)
const regla = iniciarRegla({ L, mapa, alturas, dibujo, fmt: { metros, coord, rumbo }, herramienta: () => herramienta, elegirHerramienta: (h) => elegirHerramienta(h), alCambiarPaneles: () => recolocarEtiquetas() });
$('pm-deshacer').addEventListener('click', () => regla.quitarUltimo());
$('pm-nueva').addEventListener('click', () => regla.nueva());
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  if (e.key === 'Escape' && herramienta === 'zona-mapa') { elegirHerramienta('consultar'); return; }
  if (e.key === 'Escape' && herramienta === 'medir') regla.escape();
  if (e.key === 'Enter' && herramienta === 'medir') regla.terminar();
});

// ---------------------------------------------------------------- buscador universal
const capaBusqueda = L.layerGroup().addTo(mapa);
function irA(p) {
  const zoom = p.lado >= 10000 ? 11 : p.lado >= 1000 ? 13 : 15;
  mapa.flyTo([p.lat, p.lon], Math.max(zoom, Math.min(mapa.getZoom(), 17)), { duration: 0.8 });
  capaBusqueda.clearLayers();
  L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: 'etq-ancla', html: '<span class="senal-busqueda"></span>', iconSize: null }) }).addTo(capaBusqueda);
  setTimeout(() => capaBusqueda.clearLayers(), 6000);
}
const conmutar = (id) => ({ accion: () => { ponerSup(id, !estado.superpuestas[id]); abrirSeccion('visual'); } });
const caja = (id, ajuste) => ({ accion: () => { const c = $(id); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); abrirAjustes(true, ajuste); } });
const ACCIONES = [
  ...FONDOS.map((f) => ({ texto: `Fondo ${f.nombre.toLowerCase()}`, extra: `${f.detalle} mapa fondo`, detalle: f.detalle, accion: () => { ponerFondo(f.id); abrirSeccion('fondo'); } })),
  ...Object.entries(IMAGENES).map(([id, d]) => ({ texto: `Imagen ${d.nombre}`, extra: `híbrido satélite ortofoto foto ${d.detalle}`, detalle: d.detalle, accion: () => { ponerImagen(id); ponerFondo('hibrido'); abrirAjustes(true, 'imagen'); } })),
  { texto: 'Nombres y carreteras del híbrido', extra: 'rótulos etiquetas', detalle: 'Activar o quitar', ...caja('rotulos', 'imagen') },
  { texto: 'Mantener detalle 1:25.000', extra: 'mtn25 topográfico zoom', detalle: 'Activar o quitar', ...caja('mtn-detalle', 'fondos') },
  { texto: 'Híbrido al acercarte', extra: 'automático zoom satélite', detalle: 'Activar o quitar', ...caja('fondo-auto', 'fondos') },
  { texto: 'Cuadrícula MGRS', extra: 'mostrar ocultar malla grid', detalle: 'Mostrar u ocultar', ...conmutar('cuadricula') },
  { texto: 'Intensidad de la cuadrícula', extra: 'malla grid tenue opacidad', detalle: 'Ajustar', accion: () => { abrirAjustes(true, 'cuadricula'); $('cuad-intensidad').focus(); } },
  { texto: 'Sombreado', extra: 'relieve mdt sombra', detalle: 'Mostrar u ocultar', ...conmutar('sombreado') },
  { texto: 'Curvas de nivel', extra: 'altura mdt', detalle: 'Mostrar u ocultar', ...conmutar('curvas') },
  ...[['mgrs', 'MGRS'], ['utm', 'UTM'], ['gms', 'geográficas (G M S)'], ['gd', 'grados decimales']].map(([v, n]) => ({ texto: `Coordenadas en ${n}`, extra: 'formato ajustes coordenada', detalle: 'Ajustes', accion: () => { ponerPref('coordenadas', v); abrirAjustes(true, 'coordenadas'); } })),
  ...[['grados', 'grados'], ['milesimas', 'milésimas'], ['gms', 'G M S']].map(([v, n]) => ({ texto: `Rumbos en ${n}`, extra: 'ángulos ajustes regla azimut', detalle: 'Ajustes', accion: () => { ponerPref('angulo', v); abrirAjustes(true, 'coordenadas'); } })),
  ...['punto', 'linea', 'area', 'circulo'].map((h) => ({ texto: `Dibujar ${TIPOS[h].nombre.toLowerCase()}`, extra: 'herramienta nuevo crear', detalle: 'Herramienta', accion: () => elegirHerramienta(h) })),
  { texto: 'Medir', extra: 'regla distancia rumbo herramienta', detalle: 'Herramienta', accion: () => elegirHerramienta('medir') },
  { texto: 'Mover', extra: 'seleccionar herramienta', detalle: 'Herramienta', accion: () => elegirHerramienta('consultar') },
  { texto: 'Deshacer', extra: 'ctrl z', detalle: 'Ctrl+Z', accion: () => $('deshacer').click() },
  { texto: 'Rehacer', extra: 'ctrl y', detalle: 'Ctrl+Y', accion: () => $('rehacer').click() },
  { texto: 'Objetos', extra: 'plan dibujado pintado archivos importados panel lista filtros borrar', detalle: 'Todo lo pintado e importado', accion: () => ponerPanel('objetos', true) },
  { texto: 'Operaciones', extra: 'paquetes fases saltos operación en curso futuras pasadas', detalle: 'Paquetes de datos', accion: () => ponerPanel('operaciones', true) },
  { texto: 'Crear operación', extra: 'nueva operación paquete fase', detalle: 'Lo que pintes entra en ella', accion: () => { ponerPanel('operaciones', true); setTimeout(() => $('op-nueva-nombre')?.focus(), 50); } },
  { texto: 'Lazo', extra: 'seleccionar círculo exportar enviar kmz kml gpx geojson csv zip compartir', detalle: 'Seleccionar y exportar', accion: () => elegirHerramienta('lazo') },
  { texto: 'Lazo en círculo', extra: 'seleccionar redondo radio', detalle: 'Herramienta', accion: () => lazo.ponerForma('circulo') },
  { texto: 'Lazo a mano', extra: 'seleccionar libre dibujar contorno polígono', detalle: 'Herramienta', accion: () => lazo.ponerForma('mano') },
  ...Object.entries(FORMATOS_EXPORTAR).map(([k, f]) => ({ texto: `Exportar en ${f.nombre}`, extra: `lazo enviar compartir archivo ${k} ${f.detalle}`, detalle: f.detalle.split(/[,(:]/)[0], accion: () => { lazo.ponerFormato(k); elegirHerramienta('lazo'); } })),
  { texto: 'Capas', extra: 'fondo mapas imagen cuadrícula sombreado curvas panel', detalle: 'Fondo, mapas y visualización', accion: () => ponerPanel('capas', true) },
  { texto: 'Regla', extra: 'medir distancia rumbo perfil tramos', detalle: 'Herramienta', accion: () => elegirHerramienta('medir') },
  { texto: 'Recolocar ventanas', extra: 'paneles posición tamaño restablecer', detalle: 'A su sitio y tamaño de siempre', accion: () => ventanas.recolocar() },
  { texto: 'Pantalla y ventanas', extra: 'tema oscuro claro transparencia desenfoque tamaño personalizar', detalle: 'Ajustes', accion: () => abrirAjustes(true, 'apariencia') },
  { texto: 'Ajustes', extra: 'opciones configuración', detalle: 'Abrir', accion: () => abrirAjustes(true) },
  { texto: 'Importar archivo', extra: 'gpx kml kmz zip atak paquete datos', detalle: 'GPX, KML/KMZ, paquetes de ATAK', accion: () => $('btn-importar-datos').click() },
  { texto: 'Importar mapa', extra: 'sqlite mbtiles tif geotiff jpg', detalle: 'Mapas propios', accion: () => $('btn-importar-mapa').click() },
  { texto: 'Símbolos de unidad', extra: 'app-6 app6 unidad símbolo paleta constructor', detalle: 'Abrir la paleta', accion: () => abrirSimbolos('unidades') },
  { texto: 'Líneas de coordinación', extra: 'medidas de coordinación app-6 líneas zonas puntos paleta', detalle: 'Abrir la paleta', accion: () => abrirSimbolos('medidas') },
  { texto: 'Cometidos tácticos', extra: 'verbos app-6 paleta', detalle: 'Abrir la paleta', accion: () => abrirSimbolos('cometidos') },
  { texto: 'Tamaño de los símbolos', extra: 'tamaño unidades ajustes', detalle: 'Ajustes', accion: () => abrirAjustes(true, 'simbolos') },
  { texto: 'Crear mapa', extra: 'creador de mapas descargar zona teselas atak sqlite mbtiles geotiff offline sin conexión', detalle: 'Descargar una zona en ATAK, MBTiles, ZIP o GeoTIFF', accion: abrirCreador },
  { texto: 'Buscar en mis mapas', extra: 'carpeta catálogo', detalle: 'Mapas de tu carpeta', accion: () => importar.abrirBuscador() },
].map((a) => ({ grupo: 'Ajustes y acciones', ...a }));

function candidatos() {
  const nomTipo = { punto: 'punto', linea: 'línea track ruta', area: 'área zona', circulo: 'círculo' };
  const plan = dibujo.plan().elementos.map((el) => {
    const n = el.propiedades.nombre || `${TIPOS[el.tipo].nombre} ${dibujo.plan().elementos.filter((e) => e.tipo === el.tipo).indexOf(el) + 1}`;
    return { grupo: 'Objetos', texto: dibujo.titulo(el) || n, extra: `${nomTipo[el.tipo]} dibujado ${el.propiedades.bando}`, detalle: TIPOS[el.tipo].nombre, accion: () => { if (!dibujo.visible(el)) dibujo.ponerVista({ ocultos: [], solo: null, sueltosOcultos: false }); dibujo.seleccionar(el.id, { centrar: true }); } };
  });
  const ops = dibujo.plan().operaciones.map((o) => ({ grupo: 'Operaciones', texto: o.nombre, extra: 'operación fase paquete', detalle: o.padre ? nombreRutaOp(o.id) : 'Operación', accion: () => { ponerPanel('operaciones', true); operaciones.mostrar(o.id); dibujo.encuadrar(dibujo.plan().elementos.filter((e) => e.paquete === o.id).map((e) => e.id)); } }));
  return [...plan, ...ops, ...importar.candidatosBusqueda(), ...ACCIONES, ...simbolos.candidatosBusqueda()];
}
// Lugares: se pregunta al IGN (y si no, a OpenStreetMap) un rato después de dejar de escribir
const buscadorLugares = crearBuscadorLugares();
let tLugares = 0, lugaresEnCamino = false;
function lugaresDe(q) {
  const t = q.trim();
  lugaresEnCamino = false;
  if (t.length < 3 || /^\d+([.,]\d+)?$/.test(t)) return null;
  const ya = buscadorLugares.enMemoria(t);
  if (ya) return ya;
  lugaresEnCamino = true;
  clearTimeout(tLugares);
  tLugares = setTimeout(() => buscadorLugares.buscar(t).then(() => { if ($('buscar-txt').value.trim() === t && !$('buscar-res').hidden) pintarResultados(t); }).catch(() => {}), 320);
  return null;
}
async function situarLugar(l) {
  try { const s = await buscadorLugares.situar(l); if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) irA({ lat: s.lat, lon: s.lon, lado: s.lado }); } catch { dibujo.avisoBreve('No se pudo situar el lugar'); }
}
let resultados = [], marcado = 0;
function pintarResultados(q) {
  const res = $('buscar-res');
  if (!q.trim()) { res.hidden = true; resultados = []; return; }
  const lista = [];
  const p = leerCoordenadaFlexible(q, centro(), crsDesdeEpsg);
  if (p) lista.push({ grupo: 'Coordenada', texto: coord(p), detalle: p.como === 'tal cual' ? (p.lado > 1 ? `centro del cuadrado de ${metros(p.lado)}` : '') : p.como, accion: () => irA(p), puntos: 101 });
  // Los mejores 14, agrupados (cada grupo en el orden de su mejor resultado)
  const mejores = buscar(q, candidatos()).slice(0, 14);
  // Lugares (pueblos, ciudades, parajes): del nomenclátor del IGN, cuando ya han llegado
  const lugares = p ? null : lugaresDe(q);
  if (lugares?.length) {
    const tope = mejores[0]?.puntos ?? 0;
    mejores.push(...lugares.map((l, i) => ({ grupo: 'Lugares', texto: l.nombre, detalle: l.detalle, puntos: (tope >= 90 ? 70 : 100) - i * 0.01, accion: () => situarLugar(l) })));
    mejores.sort((a, b) => b.puntos - a.puntos);
  }
  const ordenGrupo = [...new Set(mejores.map((r) => r.grupo))];
  lista.push(...mejores.sort((a, b) => ordenGrupo.indexOf(a.grupo) - ordenGrupo.indexOf(b.grupo)));
  resultados = lista; marcado = 0;
  if (!lista.length) { res.innerHTML = `<div class="br-vacio">${lugaresEnCamino ? 'Buscando lugares…' : 'Nada encontrado'}</div>`; res.hidden = false; return; }
  let grupoPrev = '';
  res.innerHTML = lista.map((r, i) => {
    const cab = r.grupo !== grupoPrev ? `<div class="br-grupo">${esc(r.grupo)}</div>` : '';
    grupoPrev = r.grupo;
    return `${cab}<button type="button" class="br-item" role="option" data-i="${i}" aria-selected="${i === 0}"><b>${esc(r.texto)}</b>${r.detalle ? `<small>${esc(r.detalle)}</small>` : ''}</button>`;
  }).join('');
  res.hidden = false;
}
function ejecutar(i) {
  const r = resultados[i]; if (!r) return;
  $('buscar-res').hidden = true;
  $('buscar-txt').blur();
  r.accion();
}
let tBuscar = 0;
$('buscar-txt').addEventListener('input', () => { clearTimeout(tBuscar); tBuscar = setTimeout(() => pintarResultados($('buscar-txt').value), 70); });
$('buscar-txt').addEventListener('focus', () => { if ($('buscar-txt').value.trim()) pintarResultados($('buscar-txt').value); });
$('buscar-txt').addEventListener('keydown', (e) => {
  if ($('buscar-res').hidden) return;
  const items = [...document.querySelectorAll('#buscar-res .br-item')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    marcado = (marcado + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((b, k) => b.setAttribute('aria-selected', String(k === marcado)));
    items[marcado]?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Escape') $('buscar-res').hidden = true;
});
$('buscar').addEventListener('submit', (ev) => { ev.preventDefault(); clearTimeout(tBuscar); pintarResultados($('buscar-txt').value); ejecutar(marcado); });
$('buscar-res').addEventListener('mousedown', (ev) => { const b = ev.target.closest('.br-item'); if (b) { ev.preventDefault(); ejecutar(Number(b.dataset.i)); } });
document.addEventListener('click', (ev) => { if (!ev.target.closest('#buscar')) $('buscar-res').hidden = true; });

mostrarPos(centro(), 'Centro');
elegirHerramienta('consultar');
// Para pruebas automáticas
window.__spa = { creador, mapa, estado, regla, simbolos, diag, dibujo, importar, cuadricula, alturas, capasFondo, capasImagen, objetos, operaciones, lazo, ventanas, apariencia };
