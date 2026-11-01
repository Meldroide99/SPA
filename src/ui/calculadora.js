// Calculadora de coordenadas (fase 1): interfaz sobre el motor geodésico.
import {
  leerPosicion, formatearPosicion, geoAMgrs, geoAUtm, bandaLatitud, medir, destino,
  formatearRumbo, leerAngulo, milesimasAGrados, gradosAMilesimas,
} from '../geo/index.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- preferencias
const PREF_CLAVE = 'spa.calculadora.prefs';
const pref = { angulo: 'grados', precision: 5 };
try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_CLAVE) || '{}')); } catch { /* sin almacenamiento */ }
const guardarPref = () => { try { localStorage.setItem(PREF_CLAVE, JSON.stringify(pref)); } catch { /* nada */ } };

for (const grupo of document.querySelectorAll('.seg[data-pref]')) {
  const clave = grupo.dataset.pref;
  const pintar = () => grupo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(pref[clave]))));
  grupo.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const anterior = pref.angulo;
    pref[clave] = clave === 'precision' ? Number(b.dataset.v) : b.dataset.v;
    if (clave === 'angulo') convertirRumboEscrito(anterior, pref.angulo);
    guardarPref(); pintar(); todo();
  });
  pintar();
}

// ---------------------------------------------------------------- utilidades de pintado
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function dato(nombre, valor, { nota = '', principal = false, copiar = true } = {}) {
  const v = esc(valor);
  return `<div class="dato${principal ? ' principal' : ''}">
    <div class="nombre"><span>${esc(nombre)}</span>${copiar ? `<button class="copiar" data-copiar="${v}">Copiar</button>` : ''}</div>
    <div class="valor">${v}</div>${nota ? `<div class="nota">${nota}</div>` : ''}</div>`;
}
const rumbo = (g) => formatearRumbo(g, pref.angulo, pref.angulo === 'milesimas' ? 0 : pref.angulo === 'gms' ? 0 : 2);
const metros = (m) => (m >= 10000 ? `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 3 })} km` : `${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m`);
const angConv = (g) => pref.angulo === 'milesimas'
  ? `${gradosAMilesimas(g).toLocaleString('es-ES', { maximumFractionDigits: 2, signDisplay: 'always' })} mils`
  : `${g.toLocaleString('es-ES', { maximumFractionDigits: 4, signDisplay: 'always' })}°`;

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-copiar]'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1200); } catch { /* sin portapapeles */ }
});

/** Lee un campo de posición; muestra el error debajo. Devuelve null si vacío o mal. */
function leerCampo(id) {
  const txt = $(id).value.trim();
  $(`${id}-error`).textContent = '';
  if (!txt) return null;
  try { return leerPosicion(txt); } catch (e) { $(`${id}-error`).textContent = e.message; return null; }
}

// ---------------------------------------------------------------- 1. convertir
function convertir() {
  const p = leerCampo('pos');
  const caja = $('pos-res');
  if (!p) { caja.hidden = true; return; }
  const u = geoAUtm(p.lat, p.lon);
  const mgrs = geoAMgrs(p.lat, p.lon, pref.precision, { separado: true });
  const lado = ['100 km', '10 km', '1 km', '100 m', '10 m', '1 m'][pref.precision];
  const notaEntrada = p.formato === 'mgrs' && p.lado > 1
    ? `Has escrito una referencia de ${metros(p.lado)}: se toma el centro del cuadrado.` : '';
  caja.innerHTML = [
    dato('MGRS', mgrs, { principal: true, nota: `Precisión: cuadrado de ${lado} (truncado, no redondeado). ${notaEntrada}` }),
    dato('UTM', formatearPosicion(p, { formato: 'utm' }), { nota: `Huso ${u.zona}, banda ${bandaLatitud(p.lat)}` }),
    dato('Geográficas (grados)', formatearPosicion(p, { formato: 'gd' })),
    dato('Geográficas (G° M\' S")', formatearPosicion(p, { formato: 'gms' })),
    dato('Convergencia de meridianos', angConv(u.convergencia), { copiar: false, nota: 'Ángulo entre el norte de cuadrícula y el geográfico. Negativo: la cuadrícula apunta al oeste del norte geográfico.' }),
    dato('Factor de escala', u.escala.toFixed(6), { copiar: false, nota: `1 km real mide ${(u.escala * 1000).toFixed(2)} m sobre la cuadrícula.` }),
  ].join('');
  caja.hidden = false;
}

// ---------------------------------------------------------------- 2. medir
function medirAB() {
  const a = leerCampo('a'), b = leerCampo('b');
  const caja = $('med-res');
  if (!a || !b) { caja.hidden = true; return; }
  const r = medir(a, b);
  const inv = medir(b, a);
  const dif = r.distancia - r.distanciaCuadricula;
  caja.innerHTML = [
    dato('Distancia real', metros(r.distancia), { principal: true, nota: 'Sobre el elipsoide WGS84 (a nivel del mar, sin contar el relieve).' }),
    dato('Distancia sobre el mapa', metros(r.distanciaCuadricula), { nota: `Sobre la cuadrícula UTM (huso ${r.zona}): ${metros(Math.abs(dif))} ${dif >= 0 ? 'más corta' : 'más larga'} que la real.` }),
    dato('Rumbo geográfico A → B', rumbo(r.rumbo), { nota: 'Respecto al norte geográfico, en A.' }),
    dato('Rumbo de cuadrícula A → B', rumbo(r.rumboCuadricula), { nota: `Respecto al norte de cuadrícula. Convergencia en A: ${angConv(r.convergencia)}.` }),
    dato('Rumbo magnético A → B', '—', { copiar: false, nota: '<span class="pendiente">Pendiente</span> Necesita el modelo magnético mundial (WMM).' }),
    dato('Rumbo inverso B → A', `${rumbo(inv.rumbo)} geo · ${rumbo(inv.rumboCuadricula)} cuad.`, { nota: 'No es exactamente el de ida ± 180°: los meridianos convergen.' }),
  ].join('');
  caja.hidden = false;
}

// ---------------------------------------------------------------- 3. destino
function etiquetaRumbo() {
  $('d-rumbo-et').textContent = `Rumbo (${{ grados: 'grados', milesimas: 'milésimas', gms: 'G° M\' S"' }[pref.angulo]})`;
  $('d-rumbo').placeholder = { grados: '45.5', milesimas: '0809', gms: '45 30 00' }[pref.angulo];
}
function leerRumboEscrito(txt, unidad) {
  if (unidad === 'milesimas') {
    const m = Number(String(txt).replace(',', '.').replace(/\s*mils?$/i, ''));
    if (!Number.isFinite(m)) throw new Error('Escribe las milésimas como número (p. ej. 0809)');
    return milesimasAGrados(m);
  }
  return leerAngulo(txt);
}
/** Al cambiar de unidad, se convierte también lo que el usuario ya había escrito. */
function convertirRumboEscrito(de, a) {
  const campo = $('d-rumbo'); const txt = campo.value.trim();
  if (!txt || de === a) return;
  try { campo.value = formatearRumbo(leerRumboEscrito(txt, de), a, a === 'grados' ? 4 : a === 'milesimas' ? 1 : 1).replace(/ mils|°$/g, ''); } catch { /* se deja como estaba */ }
}
function calcularDestino() {
  etiquetaRumbo();
  const caja = $('des-res');
  const p = leerCampo('d-ori');
  $('d-rumbo-error').textContent = ''; $('d-dist-error').textContent = '';
  const tr = $('d-rumbo').value.trim(), td = $('d-dist').value.trim();
  if (!p || !tr || !td) { caja.hidden = true; return; }
  let az, dist;
  try { az = leerRumboEscrito(tr, pref.angulo); } catch (e) { $('d-rumbo-error').textContent = e.message; caja.hidden = true; return; }
  dist = Number(td.replace(',', '.'));
  if (!(dist >= 0)) { $('d-dist-error').textContent = 'Distancia no válida'; caja.hidden = true; return; }
  const norte = $('d-norte').value;
  const r = destino(p, az, dist, { norte });
  caja.innerHTML = [
    dato('Punto de llegada (MGRS)', geoAMgrs(r.lat, r.lon, pref.precision, { separado: true }), { principal: true, nota: `Rumbo ${rumbo(az)} ${norte === 'cuadricula' ? 'de cuadrícula' : 'geográfico'}, ${metros(dist)} sobre el elipsoide.` }),
    dato('UTM', formatearPosicion(r, { formato: 'utm' })),
    dato('Geográficas (grados)', formatearPosicion(r, { formato: 'gd' })),
    dato('Rumbo de llegada', rumbo(r.rumboLlegada), { copiar: false, nota: 'Geográfico, en el punto de llegada.' }),
  ].join('');
  caja.hidden = false;
}

// ---------------------------------------------------------------- ejemplos
// Coordenadas APROXIMADAS, solo para probar la herramienta. No son puntos de
// control oficiales (esos serán los vértices geodésicos del IGN).
const EJEMPLOS = [
  { nombre: 'Peñalara', lat: 40.8502, lon: -3.9561 },
  { nombre: 'Puerto de Navacerrada', lat: 40.7930, lon: -4.0105 },
  { nombre: 'Cercedilla', lat: 40.7406, lon: -4.0570 },
];
$('ejemplos').innerHTML = 'Ejemplos (aproximados): ' + EJEMPLOS.map((e, i) =>
  `<button class="chip" data-ej="${i}" data-f="mgrs">${esc(e.nombre)} · MGRS</button><button class="chip" data-ej="${i}" data-f="gms">${esc(e.nombre)} · G°M'S"</button>`).join('');
$('ejemplos').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-ej]'); if (!b) return;
  const e = EJEMPLOS[b.dataset.ej];
  $('pos').value = formatearPosicion(e, { formato: b.dataset.f, precisionMgrs: 5 });
  todo();
});
// Valores iniciales para que la página no salga vacía
$('a').value = formatearPosicion(EJEMPLOS[2], { formato: 'mgrs' });
$('b').value = formatearPosicion(EJEMPLOS[0], { formato: 'mgrs' });
$('d-ori').value = formatearPosicion(EJEMPLOS[1], { formato: 'mgrs' });

// ---------------------------------------------------------------- arranque
function todo() { convertir(); medirAB(); calcularDestino(); }
for (const id of ['pos', 'a', 'b', 'd-ori', 'd-rumbo', 'd-dist']) $(id).addEventListener('input', todo);
$('d-norte').addEventListener('change', todo);
todo();
