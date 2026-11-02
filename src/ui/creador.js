// Creador de mapas: eliges una zona (irregular, del plan o la vista), las
// capas y sus zooms, y SPA descarga las teselas en el navegador y escribe el
// archivo (ATAK .sqlite, MBTiles, ZIP de teselas o GeoTIFF). Nada pasa por
// ningún servidor propio: el navegador pide las teselas a cada servicio.

import { FONDOS, IMAGENES, ROTULOS, urlTesela } from '../mapa/capas.js';
import { urlRelieve, pintarRelieve } from '../mapa/relieve.js';
import { leerAsc } from '../datos/alturas.js';
import {
  CAPAS_CREADOR, LIMITE_TESELAS, AVISO_TESELAS, recorrerTeselas, contarTeselas, repartirZooms, textoReparto,
  estimar, metrosPixel, limitesDe, areaAproximada, poligonoEnTesela,
} from '../datos/creador.js';
import { escribirAtak, escribirMbtiles, escribirZipXyz, escribirGeoTiff } from '../datos/escritores.js';
import { puntosDe, puntosCirculo, formatearArea, TIPOS } from '../plan/plan.js';
import { esc } from './formas.js';

const CLAVE = 'spa.creador';
const FORMATOS = {
  atak: { nombre: 'ATAK (.sqlite)', ext: 'sqlite', detalle: 'Caché de mapa para ATAK y para SPA' },
  mbtiles: { nombre: 'MBTiles', ext: 'mbtiles', detalle: 'QGIS, OruxMaps, Locus, Gaia…' },
  zip: { nombre: 'ZIP de teselas', ext: 'zip', detalle: 'Carpetas {z}/{x}/{y} (hasta 65 535 teselas)' },
  geotiff: { nombre: 'GeoTIFF', ext: 'tif', detalle: 'Una imagen por capa, al zoom «hasta»; recortada a la zona' },
};
const CALIDADES = { alta: 0.9, media: 0.8, ligera: 0.65 };
const SIMULTANEAS = 6;

export function iniciarCreador({ L, mapa, estado, dibujo, importar, elegirHerramienta, herramienta, avisar = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel-creador');
  const conf = {
    capas: Object.fromEntries(CAPAS_CREADOR.map((c) => [c.id, { on: c.id === 'mtn' || c.id === 'hibrido', zMin: { mtn: 13, hibrido: 17, base: 12, relieve: 11 }[c.id], zMax: { mtn: 16, hibrido: 18, base: 16, relieve: 15 }[c.id] }])),
    orden: CAPAS_CREADOR.map((c) => c.id),
    formato: 'atak', modo: 'junto', calidad: 'alta', nombre: 'Mapa SPA', abrir: true,
  };
  try { const g = JSON.parse(localStorage.getItem(CLAVE) || '{}'); Object.assign(conf, g, { capas: { ...conf.capas, ...g.capas } }); } catch { /* nada */ }
  const guardarConf = () => { try { localStorage.setItem(CLAVE, JSON.stringify(conf)); } catch { /* nada */ } };

  // ---------------------------------------------------------- zona
  if (!mapa.getPane('zonaCreador')) { const p = mapa.createPane('zonaCreador'); p.style.zIndex = 475; p.style.pointerEvents = 'none'; }
  const capaZona = L.layerGroup().addTo(mapa);
  let zona = [];          // polígono {lat,lon}
  let dibujando = false;
  let cursor = null;
  let origen = '';        // texto: de dónde salió la zona
  function pintarZona() {
    capaZona.clearLayers();
    if (!zona.length) return;
    const ll = zona.map((p) => [p.lat, p.lon]);
    if (dibujando) {
      L.polyline(cursor ? [...ll, [cursor.lat, cursor.lon]] : ll, { pane: 'zonaCreador', color: '#ff2bd6', weight: 2.5, dashArray: '6 5' }).addTo(capaZona);
      for (const p of ll) L.circleMarker(p, { pane: 'zonaCreador', radius: 4, color: '#fff', weight: 2, fillColor: '#ff2bd6', fillOpacity: 1 }).addTo(capaZona);
    } else if (zona.length >= 3) {
      L.polygon(ll, { pane: 'zonaCreador', color: '#ff2bd6', weight: 3, fillColor: '#ff2bd6', fillOpacity: 0.08 }).addTo(capaZona);
    }
  }
  function empezarDibujo() {
    zona = []; dibujando = true; origen = 'dibujada'; cursor = null;
    elegirHerramienta('zona-mapa');
    pintarZona(); pintar();
  }
  function terminarDibujo() {
    if (zona.length < 3) { avisar('La zona necesita al menos 3 vértices'); return; }
    dibujando = false; cursor = null;
    if (herramienta() === 'zona-mapa') elegirHerramienta('consultar');
    pintarZona(); pintar();
  }
  function ponerZona(pts, de) {
    dibujando = false; zona = pts; origen = de; cursor = null;
    if (herramienta() === 'zona-mapa') elegirHerramienta('consultar');
    pintarZona(); pintar();
    if (zona.length >= 3) mapa.flyToBounds(L.latLngBounds(zona.map((p) => [p.lat, p.lon])), { padding: [60, 60], duration: 0.6 });
  }
  mapa.on('mousemove', (e) => { if (dibujando && zona.length) { cursor = { lat: e.latlng.lat, lon: e.latlng.lng }; pintarZona(); } });

  // ---------------------------------------------------------- panel
  const latRef = () => (zona.length ? (limitesDe(zona).sur + limitesDe(zona).norte) / 2 : mapa.getCenter().lat);
  const mpx = (z) => { const m = metrosPixel(latRef(), z); return m >= 10 ? `${Math.round(m)} m/px` : `${m.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m/px`; };
  const zMaxDe = (id) => (id === 'hibrido' ? Math.min(CAPAS_CREADOR.find((c) => c.id === 'hibrido').zMax, IMAGENES[estado.imagen].maxNativo ?? 19) : CAPAS_CREADOR.find((c) => c.id === id).zMax);
  const opciones = (id, sel) => Array.from({ length: zMaxDe(id) - 4 }, (_, i) => i + 5).map((z) => `<option value="${z}" ${z === sel ? 'selected' : ''}>${z} · ${mpx(z)}</option>`).join('');
  const nombreCapa = (id) => (id === 'hibrido' ? `Híbrido (${IMAGENES[estado.imagen].nombre}${estado.rotulos ? ' + nombres' : ''})` : CAPAS_CREADOR.find((c) => c.id === id).nombre);

  function plan() {
    const capas = conf.orden.filter((id) => conf.capas[id].on).map((id) => ({ id, zMin: conf.formato === 'geotiff' ? conf.capas[id].zMax : conf.capas[id].zMin, zMax: conf.capas[id].zMax }));
    const modo = conf.formato === 'geotiff' ? 'separado' : conf.modo;
    const r = repartirZooms(capas, modo);
    const archivos = r.archivos.map((a) => ({ ...a, est: zona.length >= 3 ? estimar(zona, a.zooms, { conRotulos: estado.rotulos }) : null }));
    return { ...r, archivos, modo };
  }

  let trabajo = null; // descarga en curso
  function pintar() {
    if (panel.hidden) return;
    const p = plan();
    const total = p.archivos.reduce((s, a) => s + (a.est?.teselas ?? 0), 0);
    const megas = p.archivos.reduce((s, a) => s + (a.est?.megas ?? 0), 0);
    const seg = p.archivos.reduce((s, a) => s + (a.est?.segundos ?? 0), 0);
    const varias = conf.orden.filter((id) => conf.capas[id].on).length > 1;
    const areasPlan = dibujo.plan().elementos.filter((e) => e.tipo === 'area' || e.tipo === 'circulo');
    const nombres = Object.fromEntries(CAPAS_CREADOR.map((c) => [c.id, c.id === 'hibrido' ? 'Híbrido' : c.nombre]));
    const textoZona = zona.length >= 3 && !dibujando
      ? `Zona ${esc(origen)}: <b>${formatearArea(areaAproximada(zona))}</b> · ${zona.length} vértices`
      : dibujando ? `Haz clic en el mapa para marcar los vértices (${zona.length}). Clic derecho quita el último.` : 'Sin zona elegida';
    const ocupado = Boolean(trabajo);
    panel.innerHTML = `<div class="pm-cab"><strong>Creador de mapas</strong><button type="button" class="pm-x" id="cr-cerrar" aria-label="Cerrar">×</button></div>
      <fieldset class="cr-paso" ${ocupado ? 'disabled' : ''}><legend>1 · Zona</legend>
        <div class="cr-botones">
          ${dibujando ? `<button type="button" id="cr-terminar" class="primario" ${zona.length >= 3 ? '' : 'disabled'}>Terminar zona</button><button type="button" id="cr-cancelar-zona">Cancelar</button>`
            : `<button type="button" id="cr-dibujar">Dibujar en el mapa</button><button type="button" id="cr-vista">Vista actual</button>`}
        </div>
        ${!dibujando && areasPlan.length ? `<select id="cr-del-plan"><option value="">Usar un área o círculo del plan…</option>${areasPlan.map((e) => `<option value="${e.id}">${esc(e.propiedades.nombre || TIPOS[e.tipo].nombre)}</option>`).join('')}</select>` : ''}
        <p class="cr-zona">${textoZona}</p>
      </fieldset>
      <fieldset class="cr-paso" ${ocupado ? 'disabled' : ''}><legend>2 · Capas y zooms</legend>
        ${conf.orden.map((id, k) => { const c = conf.capas[id]; return `<div class="cr-capa ${c.on ? '' : 'off'}" data-capa="${id}">
          <label class="cr-nom"><input type="checkbox" data-c="on" ${c.on ? 'checked' : ''}><span>${esc(nombreCapa(id))}</span></label>
          ${p.modo === 'junto' && varias ? `<span class="cr-orden"><button type="button" data-c="subir" ${k ? '' : 'disabled'} title="Subir: gana si dos capas piden el mismo zoom">▲</button></span>` : ''}
          <div class="cr-zooms">${conf.formato === 'geotiff' ? '' : `<label>desde <select data-c="zMin">${opciones(id, c.zMin)}</select></label>`}
            <label>${conf.formato === 'geotiff' ? 'zoom' : 'hasta'} <select data-c="zMax">${opciones(id, c.zMax)}</select></label></div></div>`; }).join('')}
        ${conf.formato !== 'geotiff' && varias ? `<div class="seg cr-modo"><button type="button" data-modo="junto" aria-pressed="${conf.modo === 'junto'}">Un solo archivo</button><button type="button" data-modo="separado" aria-pressed="${conf.modo === 'separado'}">Un archivo por capa</button></div>` : ''}
        ${p.modo === 'junto' && p.archivos[0] ? `<p class="cr-nota">En el archivo: ${esc(textoReparto(p.archivos[0].zooms, nombres))}</p>` : ''}
        ${p.solapes.length ? `<p class="cr-nota cr-aviso">Zoom ${[...new Set(p.solapes.map((s) => s.z))].join(', ')}: lo piden dos capas; se usa la de más arriba.</p>` : ''}
        <p class="cr-nota">El híbrido usa la imagen y los nombres elegidos en Ajustes.</p>
      </fieldset>
      <fieldset class="cr-paso" ${ocupado ? 'disabled' : ''}><legend>3 · Archivo</legend>
        <div class="aj-opc cr-formatos">${Object.entries(FORMATOS).map(([k, f]) => `<button type="button" data-formato="${k}" aria-pressed="${conf.formato === k}">${f.nombre}<small>${f.detalle}</small></button>`).join('')}</div>
        <label class="cr-campo">Nombre <input id="cr-nombre" value="${esc(conf.nombre)}" maxlength="60"></label>
        <label class="cr-campo">Calidad de imagen (híbrido y relieve) <select id="cr-calidad">${Object.keys(CALIDADES).map((q) => `<option value="${q}" ${conf.calidad === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></label>
        <label class="sup cr-abrir"><input type="checkbox" id="cr-abrir" ${conf.abrir ? 'checked' : ''}><span class="txt"><b>Abrirlo en SPA al terminar</b></span></label>
      </fieldset>
      <div class="cr-resumen">${zona.length >= 3 && !dibujando ? `${p.archivos.length} archivo${p.archivos.length === 1 ? '' : 's'} · <b>${total.toLocaleString('es-ES')}</b> teselas · ≈ ${megas < 1 ? '<1' : Math.round(megas).toLocaleString('es-ES')} MB · ≈ ${tiempo(seg)}`
        : 'Elige una zona para ver el tamaño'}${total > LIMITE_TESELAS ? `<div class="cr-aviso">Demasiadas teselas (máximo ${LIMITE_TESELAS.toLocaleString('es-ES')}): reduce la zona o el zoom.</div>` : total > AVISO_TESELAS ? '<div class="cr-aviso">Descarga larga: deja la pestaña abierta hasta que termine.</div>' : ''}</div>
      <div id="cr-progreso" class="cr-progreso" ${ocupado ? '' : 'hidden'}><div class="cr-barra"><span id="cr-barra"></span></div><div id="cr-prog-txt"></div></div>
      <div class="pm-acciones">${ocupado ? '<button type="button" id="cr-parar">Cancelar</button>'
        : `<button type="button" id="cr-crear" class="primario" ${zona.length >= 3 && !dibujando && total > 0 && total <= LIMITE_TESELAS ? '' : 'disabled'}>Crear mapa</button>`}</div>`;
    if (trabajo) trabajo.pintarProgreso?.();
  }
  const tiempo = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`);

  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.id === 'cr-cerrar') { abrir(false); return; }
    if (b.id === 'cr-dibujar') { empezarDibujo(); return; }
    if (b.id === 'cr-terminar') { terminarDibujo(); return; }
    if (b.id === 'cr-cancelar-zona') { zona = []; dibujando = false; if (herramienta() === 'zona-mapa') elegirHerramienta('consultar'); pintarZona(); pintar(); return; }
    if (b.id === 'cr-vista') { const v = mapa.getBounds(); ponerZona([{ lat: v.getNorth(), lon: v.getWest() }, { lat: v.getNorth(), lon: v.getEast() }, { lat: v.getSouth(), lon: v.getEast() }, { lat: v.getSouth(), lon: v.getWest() }], 'de la vista'); return; }
    if (b.dataset.modo) { conf.modo = b.dataset.modo; guardarConf(); pintar(); return; }
    if (b.dataset.formato) { conf.formato = b.dataset.formato; guardarConf(); pintar(); return; }
    if (b.dataset.c === 'subir') { const id = b.closest('[data-capa]').dataset.capa; const i = conf.orden.indexOf(id); conf.orden.splice(i, 1); conf.orden.splice(i - 1, 0, id); guardarConf(); pintar(); return; }
    if (b.id === 'cr-crear') { crear(); return; }
    if (b.id === 'cr-parar') { trabajo?.parar.abort(); }
  });
  panel.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'cr-nombre') return; // se guarda al escribir; repintar aquí se comería el clic en «Crear mapa»
    const fila = t.closest('[data-capa]');
    if (fila) {
      const c = conf.capas[fila.dataset.capa];
      if (t.dataset.c === 'on') c.on = t.checked;
      if (t.dataset.c === 'zMin') { c.zMin = Number(t.value); if (c.zMax < c.zMin) c.zMax = c.zMin; }
      if (t.dataset.c === 'zMax') { c.zMax = Number(t.value); if (c.zMin > c.zMax) c.zMin = c.zMax; }
    }
    if (t.id === 'cr-del-plan' && t.value) {
      const el = dibujo.plan().elementos.find((e) => e.id === t.value);
      if (el) ponerZona(el.tipo === 'circulo' ? puntosCirculo(puntosDe(el)[0], el.propiedades.radio, 72) : puntosDe(el), `«${el.propiedades.nombre || TIPOS[el.tipo].nombre}»`);
      return;
    }
    if (t.id === 'cr-calidad') conf.calidad = t.value;
    if (t.id === 'cr-abrir') conf.abrir = t.checked;
    guardarConf(); pintar();
  });
  panel.addEventListener('input', (ev) => { if (ev.target.id === 'cr-nombre') { conf.nombre = ev.target.value; guardarConf(); } });

  function abrir(si = panel.hidden) {
    panel.hidden = !si;
    if (!si) {
      if (dibujando) { dibujando = false; zona = []; }
      if (herramienta() === 'zona-mapa') elegirHerramienta('consultar');
      if (!trabajo) { zona = []; capaZona.clearLayers(); }
    }
    pintar();
  }

  // ---------------------------------------------------------- descarga de teselas
  async function pedir(url, señal, { texto = false } = {}) {
    for (let intento = 0; intento < 4; intento++) {
      try {
        const r = await fetch(url, { signal: señal });
        if (r.status === 404 || r.status === 204) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (texto) return await r.text();
        const tipo = r.headers.get('content-type') || '';
        const b = await r.blob();
        if (!b.size || (tipo && !/^image\//.test(tipo))) return null; // excepciones WMTS (XML) fuera de cobertura
        return b;
      } catch (e) {
        if (señal.aborted) throw e;
        if (intento === 3) throw e;
        await new Promise((ok) => setTimeout(ok, 400 * 2 ** intento));
      }
    }
    return null;
  }
  const lienzo = () => { const c = document.createElement('canvas'); c.width = c.height = 256; return c; };
  const aJpeg = (c, q) => new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo codificar la imagen'))), 'image/jpeg', q));
  const extDe = (b) => (/png/.test(b.type) ? 'png' : 'jpg');

  /** Tesela de una capa → { datos: Blob, ext } o null si el servicio no tiene nada ahí. */
  async function teselaDe(capa, z, x, y, señal, q) {
    if (capa === 'mtn' || capa === 'base') {
      const b = await pedir(urlTesela(FONDOS.find((f) => f.id === capa), z, x, y), señal);
      return b && { datos: b, ext: extDe(b) };
    }
    if (capa === 'hibrido') {
      const [img, rot] = await Promise.all([pedir(urlTesela(IMAGENES[estado.imagen], z, x, y), señal), estado.rotulos ? pedir(urlTesela(ROTULOS, z, x, y), señal).catch(() => null) : null]);
      if (!img) return null;
      if (!rot) return { datos: img, ext: extDe(img) };
      const c = lienzo(), ctx = c.getContext('2d');
      for (const b of [img, rot]) { const bm = await createImageBitmap(b); ctx.drawImage(bm, 0, 0, 256, 256); bm.close?.(); }
      return { datos: await aJpeg(c, q), ext: 'jpg' };
    }
    if (capa === 'relieve') {
      const t = await pedir(urlRelieve(z, x, y), señal, { texto: true });
      if (!t) return null;
      const m = leerAsc(t);
      const c = lienzo(), ctx = c.getContext('2d'), im = ctx.createImageData(256, 256);
      pintarRelieve(m, { z, x, y }, 'fondo', im.data);
      ctx.putImageData(im, 0, 0);
      return { datos: await aJpeg(c, q), ext: 'jpg' };
    }
    throw new Error(`Capa desconocida: ${capa}`);
  }

  // ---------------------------------------------------------- guardar
  const tiposArchivo = { atak: { 'application/vnd.sqlite3': ['.sqlite'] }, mbtiles: { 'application/vnd.sqlite3': ['.mbtiles'] }, zip: { 'application/zip': ['.zip'] }, geotiff: { 'image/tiff': ['.tif'] } };
  const limpio = (s) => (s || 'Mapa SPA').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Mapa SPA';
  function nombreArchivo(a, p) {
    const sufijo = p.archivos.length > 1 || conf.formato === 'geotiff' ? `_${a.capas[0]}${conf.formato === 'geotiff' ? `_z${a.zooms.at(-1).z}` : ''}` : '';
    return `${limpio(conf.nombre)}${sufijo}.${FORMATOS[conf.formato].ext}`;
  }
  async function destino(p) {
    // Se pide dónde guardar ANTES de descargar (el navegador solo deja abrir el selector tras un clic)
    try {
      if (p.archivos.length === 1 && window.showSaveFilePicker) {
        const nombre = nombreArchivo(p.archivos[0], p);
        return { archivo: await window.showSaveFilePicker({ suggestedName: nombre, id: 'spa-creador', types: [{ description: FORMATOS[conf.formato].nombre, accept: tiposArchivo[conf.formato] }] }) };
      }
      if (p.archivos.length > 1 && window.showDirectoryPicker) return { carpeta: await window.showDirectoryPicker({ id: 'spa-creador', mode: 'readwrite' }) };
    } catch (e) {
      if (e.name === 'AbortError') return null; // canceló el selector
    }
    return { descarga: true };
  }
  async function escribirEn(dest, nombre, blob) {
    let handle = null;
    if (dest.archivo) handle = dest.archivo;
    else if (dest.carpeta) handle = await dest.carpeta.getFileHandle(nombre, { create: true });
    if (handle) { const w = await handle.createWritable(); await w.write(blob); await w.close(); return handle; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return null;
  }

  // ---------------------------------------------------------- crear
  async function crear() {
    const p = plan();
    if (zona.length < 3 || !p.archivos.length) return;
    const dest = await destino(p);
    if (!dest) return;
    const q = CALIDADES[conf.calidad] ?? 0.9;
    const pol = zona.slice();
    const lim = limitesDe(pol);
    const parar = new AbortController();
    const total = p.archivos.reduce((s, a) => s + a.zooms.reduce((t, { z }) => t + contarTeselas(pol, z), 0), 0);
    const inicio = performance.now();
    trabajo = { parar, hechas: 0, total, bytes: 0, fallos: 0, archivo: '' };
    trabajo.pintarProgreso = () => {
      const t = trabajo; if (!t || !$('cr-barra')) return;
      $('cr-progreso').hidden = false;
      $('cr-barra').style.width = `${(100 * t.hechas) / Math.max(1, t.total)}%`;
      const seg = (performance.now() - inicio) / 1000, resta = t.hechas ? (seg / t.hechas) * (t.total - t.hechas) : 0;
      $('cr-prog-txt').textContent = t.fase || `${t.archivo} · ${t.hechas.toLocaleString('es-ES')} de ${t.total.toLocaleString('es-ES')} teselas · ${(t.bytes / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB${t.hechas > 20 ? ` · quedan ≈ ${tiempo(resta)}` : ''}${t.fallos ? ` · ${t.fallos} sin descargar` : ''}`;
    };
    pintar();
    const hechos = [];
    try {
      for (const a of p.archivos) {
        const nombre = nombreArchivo(a, p);
        trabajo.archivo = nombre; trabajo.fase = '';
        // Cola de teselas del archivo
        const cola = [];
        for (const { z, capa } of a.zooms) for (const t of recorrerTeselas(pol, z)) cola.push({ ...t, capa });
        const teselas = [];
        let i = 0;
        const obrero = async () => {
          while (i < cola.length) {
            const t = cola[i++];
            try {
              const r = await teselaDe(t.capa, t.z, t.x, t.y, parar.signal, q);
              if (r) { teselas.push({ z: t.z, x: t.x, y: t.y, datos: r.datos, ext: r.ext }); trabajo.bytes += r.datos.size; }
            } catch (e) {
              if (parar.signal.aborted) throw e;
              trabajo.fallos++;
            }
            trabajo.hechas++;
            if (trabajo.hechas % 8 === 0) trabajo.pintarProgreso();
          }
        };
        await Promise.all(Array.from({ length: SIMULTANEAS }, obrero));
        if (!teselas.length) throw new Error(`${nombre}: ningún servicio devolvió teselas para esta zona`);
        trabajo.fase = `Escribiendo ${nombre}…`; trabajo.pintarProgreso();
        let blob;
        if (conf.formato === 'atak') blob = await escribirAtak(teselas, { nombre: limpio(conf.nombre) });
        else if (conf.formato === 'mbtiles') {
          const png = teselas.filter((t) => t.ext === 'png').length;
          blob = await escribirMbtiles(teselas, { nombre: limpio(conf.nombre), formato: png > teselas.length / 2 ? 'png' : 'jpg', limites: lim, descripcion: `Creado con SPA: ${a.capas.map(nombreCapa).join(', ')}` });
        } else if (conf.formato === 'zip') {
          if (teselas.length > 65535) throw new Error('El ZIP admite hasta 65 535 teselas: elige ATAK o MBTiles');
          blob = await escribirZipXyz(teselas, { extension: (t) => t.ext });
        } else {
          const z = a.zooms.at(-1).z;
          blob = await escribirGeoTiff(teselas, { z, conAlfa: true, rgbaDe: (t) => rgbaRecortado(t, pol) });
        }
        const handle = await escribirEn(dest, nombre, blob);
        hechos.push({ nombre, blob, handle, teselas: teselas.length });
      }
      const fallos = trabajo.fallos;
      trabajo = null;
      pintar();
      const sin = fallos ? ` · ${fallos.toLocaleString('es-ES')} teselas no se pudieron descargar` : '';
      avisar(`Mapa creado: ${hechos.map((h) => `${h.nombre} (${(h.blob.size / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB)`).join(', ')}${sin}`);
      if (conf.abrir) await importar.procesar(hechos.map((h) => ({ archivo: new File([h.blob], h.nombre), handle: h.handle ?? undefined })));
    } catch (e) {
      const cancelado = parar.signal.aborted;
      trabajo = null; pintar();
      avisar(cancelado ? 'Creación cancelada' : `No se pudo crear el mapa: ${e.message}`);
    }
  }

  /** RGBA de una tesela con lo que cae fuera de la zona transparente (GeoTIFF). */
  async function rgbaRecortado(t, pol) {
    const c = lienzo(), ctx = c.getContext('2d');
    const bm = await createImageBitmap(t.datos); ctx.drawImage(bm, 0, 0, 256, 256); bm.close?.();
    const px = poligonoEnTesela(pol, t.z, t.x, t.y);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath(); px.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    return ctx.getImageData(0, 0, 256, 256).data;
  }

  return {
    abrir,
    clic(p) {
      if (!dibujando) return;
      const u = zona.at(-1);
      if (u && Math.abs(u.lat - p.lat) < 1e-9 && Math.abs(u.lon - p.lon) < 1e-9) return; // segundo clic del doble clic
      zona.push(p); pintarZona(); pintar();
    },
    dobleClic() { if (dibujando && zona.length >= 3) terminarDibujo(); },
    quitarUltimo() { if (dibujando) { zona.pop(); pintarZona(); pintar(); } },
    herramientaCambiada(h) { if (h !== 'zona-mapa' && dibujando) { dibujando = false; if (zona.length < 3) zona = []; pintarZona(); pintar(); } },
    refrescar: pintar,
    get zona() { return zona; },
    get conf() { return conf; },
  };
}
