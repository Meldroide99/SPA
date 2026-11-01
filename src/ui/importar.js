// Importar: arrastrar y soltar (o elegir) archivos.
//   - Datos (GPX, KML, KMZ, CoT, paquetes .zip de ATAK) → grupo en el panel
//     «Plan · Archivos importados», con visibilidad, nombres, centrar, pasar
//     al plan y borrar.
//   - Mapas (.sqlite/.mbtiles de ATAK o MBTiles, GeoTIFF, JPG/PNG con su
//     archivo de mundo) → capa en «Capas · Mapas importados», colocada sola.
//   - Buscador: se elige una vez la carpeta de mapas (Chrome/Edge); se leen
//     solo las cabeceras para saber qué zona cubre cada mapa, y se carga solo
//     el que se elige.
// Todo se guarda en el navegador (IndexedDB) para la próxima vez.

import { importarDatos, esDatos } from '../datos/vectorial.js';
import { abrirMapaTeselas } from '../datos/teselas.js';
import { lectorBlob } from '../datos/tiff.js';
import { fuenteGeoTiff, fuenteImagen, fuenteSuperposicion, capaRaster, limitesFuente } from '../datos/raster.js';
import { guardar, borrar, todos, leer } from '../datos/almacen.js';
import { crsDesdeEpsg, CRS_COMUNES } from '../geo/crs.js';
import { haeAAltitud, rejillasListas, prepararRejillas } from '../geo/rejillas.js';
import { nuevoElemento, BANDOS, formatearArea } from '../plan/plan.js';
import { longitudLinea, areaPoligono } from '../geo/index.js';
import { capaForma, esc, ICONOS } from './formas.js';
import { tomarFicha, alPerderFicha, htmlAltitud, rellenarAltitud, htmlLinea, rellenarPerfil } from './ficha.js';

const EXT_TESELAS = /\.(sqlite|mbtiles|db|sqlitedb)$/i;
const EXT_TIFF = /\.(tif|tiff)$/i;
const EXT_IMAGEN = /\.(jpe?g|png)$/i;
const EXT_MUNDO = /\.(jgw|jpgw|pgw|pngw|tfw|tifw|wld)$/i;
const EXT_NO = /\.(ecw|jp2|sid)$/i;
const base = (n) => n.replace(/\.[^./]+$/, '').toLowerCase();
const uid = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2));
const tam = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export function iniciarImportar({ L, mapa, fmt, alturas, dibujo, herramienta, alCambiarPaneles = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const DUENO = 'importados';
  if (!mapa.getPane('importados')) mapa.createPane('importados').style.zIndex = 455;
  if (!mapa.getPane('mapasImportados')) mapa.createPane('mapasImportados').style.zIndex = 250;

  const grupos = [];   // datos importados
  const mapas = [];    // mapas importados
  let seleccion = null; // { grupo, i }

  // ================================================================ DATOS
  function capaGrupo(g) {
    g.capa?.remove();
    const capa = L.layerGroup();
    g.elementos.forEach((e, i) => {
      const color = e.color || BANDOS[e.bando]?.color || g.color || '#5b3a8c';
      const sel = seleccion?.grupo === g && seleccion.i === i;
      const { grupo, principal } = capaForma(L, {
        tipo: e.tipo, puntos: e.puntos, radio: e.radio, color, trazo: e.discontinuo ? 'discontinuo' : 'continuo',
        grosor: Math.min(8, Math.max(2, e.grosor || 3)), nombre: g.nombres ? e.nombre : '', seleccionado: sel, pane: 'importados', importado: true,
      });
      principal.on('click', (ev) => { if (herramienta() !== 'consultar') return; L.DomEvent.stopPropagation(ev); seleccionar(g, i); });
      capa.addLayer(grupo);
    });
    g.capa = capa;
    if (g.visible) capa.addTo(mapa);
  }

  function limitesGrupo(g) {
    const pts = g.elementos.flatMap((e) => e.puntos);
    return pts.length ? L.latLngBounds(pts.map((p) => [p.lat, p.lon])) : null;
  }

  async function anadirDatos(r, { sinCentrar = false } = {}) {
    const g = { id: uid(), nombre: r.nombre, formato: r.formato, fecha: new Date().toISOString(), visible: true, nombres: true, elementos: r.elementos, avisos: r.avisos, abierto: false };
    grupos.push(g); capaGrupo(g);
    await guardar('datos', sinCapa(g));
    pintarGrupos();
    const b = limitesGrupo(g);
    if (b && !sinCentrar) mapa.flyToBounds(b, { padding: [60, 60], maxZoom: 15, duration: 0.7 });
    return g;
  }
  const sinCapa = ({ capa, ...g }) => g;

  function pintarGrupos() {
    const caja = $('importados-lista'); if (!caja) return;
    $('importados-cuenta').textContent = grupos.length ? `(${grupos.length})` : '';
    if (!grupos.length) { caja.innerHTML = '<p class="plan-vacio">Arrastra aquí (o a cualquier parte del mapa) archivos GPX, KML/KMZ o paquetes .zip de ATAK.</p>'; return; }
    caja.innerHTML = grupos.map((g) => `<div class="grupo-imp${g.visible ? '' : ' oculto'}" data-g="${g.id}">
      <div class="gi-cab">
        <button type="button" class="gi-ojo" data-acc="ver" aria-pressed="${g.visible}" title="${g.visible ? 'Ocultar' : 'Mostrar'}">${g.visible ? '◉' : '○'}</button>
        <button type="button" class="gi-nom" data-acc="abrir" aria-expanded="${g.abierto}"><b>${esc(g.nombre)}</b><small>${esc(g.formato)} · ${g.elementos.length} elemento${g.elementos.length === 1 ? '' : 's'}</small></button>
        <button type="button" class="gi-mini" data-acc="centrar" title="Centrar en el mapa">⌖</button>
      </div>
      ${g.abierto ? `<div class="gi-cuerpo">
        <label class="gi-opc"><input type="checkbox" data-acc="nombres" ${g.nombres ? 'checked' : ''}> Mostrar nombres</label>
        <div class="gi-lista">${g.elementos.map((e, i) => `<button type="button" class="plan-el" data-acc="elem" data-i="${i}" aria-pressed="${seleccion?.grupo === g && seleccion.i === i}">
          <svg viewBox="0 0 24 24" style="--c:${e.color || BANDOS[e.bando]?.color || '#5b3a8c'}">${ICONOS[e.tipo]}</svg><span class="pe-nom">${esc(e.nombre || '(sin nombre)')}</span><span class="pe-med">${e.tipo === 'linea' ? fmt.metros(longitudLinea(e.puntos)) : ''}</span></button>`).join('')}</div>
        ${g.avisos?.length ? `<details class="gi-avisos"><summary>${g.avisos.length} aviso${g.avisos.length > 1 ? 's' : ''}</summary><ul>${g.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
        <div class="pm-acciones"><button type="button" data-acc="al-plan" title="Copia todos los elementos al plan para poder editarlos">Pasar al plan</button><button type="button" data-acc="borrar" class="peligro">Quitar</button></div>
      </div>` : ''}</div>`).join('');
  }

  $('importados-lista')?.addEventListener('click', async (ev) => {
    const caja = ev.target.closest('[data-g]'); if (!caja) return;
    const g = grupos.find((x) => x.id === caja.dataset.g); if (!g) return;
    const acc = ev.target.closest('[data-acc]')?.dataset.acc;
    if (acc === 'ver') { g.visible = !g.visible; if (g.visible) g.capa.addTo(mapa); else g.capa.remove(); guardar('datos', sinCapa(g)); pintarGrupos(); }
    if (acc === 'abrir') { g.abierto = !g.abierto; pintarGrupos(); }
    if (acc === 'centrar') { const b = limitesGrupo(g); if (b) mapa.flyToBounds(b, { padding: [60, 60], maxZoom: 15, duration: 0.7 }); }
    if (acc === 'elem') seleccionar(g, Number(ev.target.closest('[data-i]').dataset.i), { centrar: true });
    if (acc === 'al-plan') pasarAlPlan(g.elementos, `Pasar «${g.nombre}» al plan`);
    if (acc === 'borrar') {
      g.capa.remove(); grupos.splice(grupos.indexOf(g), 1); borrar('datos', g.id);
      if (seleccion?.grupo === g) cerrarFicha();
      pintarGrupos(); dibujo.avisoBreve(`«${g.nombre}» quitado`);
    }
  });
  $('importados-lista')?.addEventListener('change', (ev) => {
    if (ev.target.dataset.acc !== 'nombres') return;
    const g = grupos.find((x) => x.id === ev.target.closest('[data-g]').dataset.g);
    g.nombres = ev.target.checked; capaGrupo(g); guardar('datos', sinCapa(g));
  });

  function aElementoPlan(e) {
    const opc = { nombre: e.nombre || '', notas: e.descripcion || '', bando: e.bando || 'propio', radio: e.radio };
    if (e.color && e.tipo !== 'punto') opc.color = e.color;
    if (e.grosor) opc.grosor = [2, 3, 5, 8].reduce((a, b) => (Math.abs(b - e.grosor) < Math.abs(a - e.grosor) ? b : a));
    if (e.discontinuo) opc.trazo = 'discontinuo';
    return nuevoElemento(e.tipo, e.puntos.map((p) => ({ lat: p.lat, lon: p.lon })), opc);
  }
  function pasarAlPlan(elementos, desc) {
    const nuevos = elementos.map(aElementoPlan);
    dibujo.anadir(nuevos, desc);
    dibujo.avisoBreve(`${nuevos.length} elemento${nuevos.length > 1 ? 's' : ''} pasado${nuevos.length > 1 ? 's' : ''} al plan (editable)`);
    return nuevos;
  }

  // ---------------------------------------------------------- ficha de un elemento importado
  const panel = $('panel-elemento');
  const capaCursor = L.layerGroup().addTo(mapa);
  function seleccionar(g, i, { centrar = false } = {}) {
    tomarFicha(DUENO);
    const antes = seleccion?.grupo;
    seleccion = { grupo: g, i };
    if (antes && antes !== g) capaGrupo(antes);
    capaGrupo(g); pintarGrupos(); pintarFicha();
    const e = g.elementos[i];
    if (centrar) {
      if (e.puntos.length === 1) mapa.flyTo([e.puntos[0].lat, e.puntos[0].lon], Math.max(mapa.getZoom(), 14), { duration: 0.6 });
      else mapa.flyToBounds(L.latLngBounds(e.puntos.map((p) => [p.lat, p.lon])), { padding: [80, 80], maxZoom: 16, duration: 0.6 });
    }
  }
  function cerrarFicha() {
    const g = seleccion?.grupo; seleccion = null; capaCursor.clearLayers();
    if (g) capaGrupo(g);
    if (panel.dataset.dueno === DUENO) { panel.hidden = true; delete panel.dataset.dueno; alCambiarPaneles(); }
    pintarGrupos();
  }
  alPerderFicha(DUENO, () => { if (seleccion) { const g = seleccion.grupo; seleccion = null; capaCursor.clearLayers(); capaGrupo(g); pintarGrupos(); } });

  function pintarFicha() {
    const { grupo: g, i } = seleccion; const e = g.elementos[i];
    const color = e.color || BANDOS[e.bando]?.color || '#5b3a8c';
    const tipoN = { punto: 'Punto', linea: 'Línea', area: 'Área', circulo: 'Círculo' }[e.tipo];
    let cuerpo = '';
    if (e.tipo === 'punto') {
      const p = e.puntos[0];
      let deArchivo = '';
      if (Number.isFinite(p.ele)) {
        if (e.refAltura === 'hae') {
          const h = rejillasListas() ? haeAAltitud(p.lat, p.lon, p.ele) : null;
          deArchivo = `${Math.round(p.ele)} m elipsoidal (HAE)${h !== null ? ` ≈ ${Math.round(h)} m sobre el nivel del mar` : ''}`;
        } else deArchivo = `${Math.round(p.ele)} m`;
      }
      cuerpo = `<div class="pm-total"><div class="grande mgrs">${esc(fmt.coord(p))}</div></div>${htmlAltitud()}
        ${deArchivo ? `<div class="el-altitud secundaria"><span class="el-et">En el archivo</span><span>${deArchivo}</span></div>` : ''}
        ${e.bando ? `<div class="el-fila"><span class="el-et">Bando</span><span class="chip-bando" style="--c:${color}">${BANDOS[e.bando].nombre}</span></div>` : ''}`;
    } else if (e.tipo === 'linea') {
      cuerpo = htmlLinea(e.puntos, fmt);
    } else if (e.tipo === 'area') {
      const a = areaPoligono(e.puntos);
      cuerpo = `<div class="pm-total"><div class="grande">${formatearArea(a.area)}</div><div class="peq">Perímetro ${fmt.metros(a.perimetro)}</div></div>`;
    } else {
      cuerpo = `<div class="pm-total"><div class="grande">${fmt.metros(e.radio)}</div><div class="peq">Radio · Centro ${esc(fmt.coord(e.puntos[0]))}</div></div>`;
    }
    panel.dataset.dueno = DUENO;
    panel.innerHTML = `<div class="pm-cab"><strong><span class="muestra-bando" style="--c:${color}"></span>${esc(e.nombre || '(sin nombre)')}</strong><span>${tipoN} importado</span></div>
      <p class="el-ayuda">De «${esc(g.nombre)}» (${esc(g.formato)}).${e.descripcion ? ` ${esc(e.descripcion)}` : ''}</p>
      ${cuerpo}
      <div class="pm-acciones"><button type="button" data-imp="al-plan" title="Copiar al plan para poder editarlo">Pasar al plan</button><button type="button" data-imp="centrar">Centrar</button><button type="button" data-imp="cerrar">Cerrar</button></div>`;
    panel.hidden = false; alCambiarPaneles();
    if (e.tipo === 'punto') rellenarAltitud(alturas, e.puntos[0]);
    if (e.tipo === 'linea') {
      rellenarPerfil(e.puntos, alturas, `imp/${g.id}/${i}`, (p) => {
        capaCursor.clearLayers();
        if (p) L.circleMarker([p.lat, p.lon], { pane: 'borrador', radius: 6, color: '#fff', weight: 2, fillColor: '#0C2E4B', fillOpacity: 1, interactive: false }).addTo(capaCursor);
      }).catch(() => {});
    }
  }
  panel.addEventListener('click', (ev) => {
    if (panel.dataset.dueno !== DUENO || !seleccion) return;
    const a = ev.target.closest('[data-imp]')?.dataset.imp; if (!a) return;
    const { grupo: g, i } = seleccion;
    if (a === 'cerrar') cerrarFicha();
    if (a === 'centrar') seleccionar(g, i, { centrar: true });
    if (a === 'al-plan') { const [n] = pasarAlPlan([g.elementos[i]], 'Pasar al plan'); cerrarFicha(); dibujo.seleccionar(n.id); }
  });

  /** Puntos de lo importado visible (para el imán del dibujo). */
  const puntosVisibles = () => grupos.filter((g) => g.visible).flatMap((g) => g.elementos.flatMap((e) => e.puntos));

  // ================================================================ MAPAS
  async function crearCapaMapa(m) {
    if (m.tipo === 'superposicion') {
      const f = await fuenteSuperposicion(m.superposicion);
      m.capa = capaRaster(L, f, { pane: 'mapasImportados' }); m.limites = limitesFuente(f); m.info = 'Superposición KML'; m.error = null;
      m.capa.setOpacity(m.opacidad ?? 1);
      if (m.visible) m.capa.addTo(mapa);
      return;
    }
    const archivo = m.archivo ?? (m.handle ? await m.handle.getFile() : null);
    if (!archivo) throw new Error('No se encuentra el archivo');
    let capa, limites, info;
    if (m.tipo === 'teselas') {
      const t = await abrirMapaTeselas(lectorBlob(archivo), m.nombre);
      limites = t.limites;
      info = `${t.tipo} · zoom ${t.minZoom}–${t.maxZoom}`;
      const Capa = L.GridLayer.extend({
        createTile(c, hecho) {
          const img = document.createElement('img');
          img.alt = '';
          t.tesela(c.z, c.x, c.y).then((b) => {
            if (!b) { hecho(null, img); return; }
            const url = URL.createObjectURL(b);
            img.onload = () => { URL.revokeObjectURL(url); hecho(null, img); };
            img.onerror = () => { URL.revokeObjectURL(url); hecho(null, img); };
            img.src = url;
          }, (e) => hecho(e, img));
          return img;
        },
      });
      capa = new Capa({
        pane: 'mapasImportados', minNativeZoom: t.minZoom, maxNativeZoom: t.maxZoom, maxZoom: 22, minZoom: Math.max(3, t.minZoom - 3),
        bounds: L.latLngBounds([limites.sur, limites.oeste], [limites.norte, limites.este]),
      });
    } else {
      let f;
      if (m.tipo === 'geotiff') f = await fuenteGeoTiff(archivo, { epsgForzado: m.epsg, prj: m.prj });
      else f = await fuenteImagen(archivo, m.mundo, { epsg: m.epsg, prj: m.prj });
      if (f.sinSistema) { const e = new Error('sin-sistema'); e.sinSistema = true; throw e; }
      if (f.crs.requiereRejillas) await prepararRejillas(); // ED50: rejilla oficial del IGN
      m.epsg = f.epsg;
      limites = limitesFuente(f);
      info = `${f.tipo} · ${f.crs.nombre} · ${f.descripcion}`;
      capa = capaRaster(L, f, { pane: 'mapasImportados' });
    }
    capa.setOpacity?.(m.opacidad ?? 1);
    m.capa = capa; m.limites = limites; m.info = info; m.error = null;
    if (m.visible) capa.addTo(mapa);
  }

  async function anadirMapa(m, { centrar = true } = {}) {
    m.id ??= uid(); m.visible ??= true; m.opacidad ??= 1;
    mapas.push(m);
    try {
      await crearCapaMapa(m);
      if (centrar && m.limites) mapa.flyToBounds([[m.limites.sur, m.limites.oeste], [m.limites.norte, m.limites.este]], { padding: [30, 30], duration: 0.7 });
    } catch (e) {
      if (e.sinSistema) {
        const epsg = await preguntarSistema(m.nombre);
        if (!epsg) { mapas.splice(mapas.indexOf(m), 1); pintarMapas(); return null; }
        m.epsg = epsg; mapas.splice(mapas.indexOf(m), 1);
        return anadirMapa(m, { centrar });
      }
      m.error = e.message;
    }
    await guardar('mapas', guardable(m));
    pintarMapas();
    return m;
  }
  const guardable = ({ capa, info, error, ...m }) => m;

  function pintarMapas() {
    const caja = $('mapas-importados'); if (!caja) return;
    if (!mapas.length) { caja.innerHTML = '<p class="plan-vacio">Ninguno. Arrastra un mapa (.sqlite, .mbtiles, .tif o .jpg con su .jgw) o usa los botones.</p>'; return; }
    caja.innerHTML = mapas.map((m) => `<div class="mapa-imp" data-m="${m.id}">
      <label class="sup"><input type="checkbox" data-acc="ver" ${m.visible ? 'checked' : ''} ${m.error ? 'disabled' : ''}>
        <span class="txt"><b>${esc(m.nombre)}</b><small>${m.error ? `<span class="error-txt">${esc(m.error)}</span>` : esc(m.info || 'Cargando…')}</small></span></label>
      ${m.error && m.handle ? '<button type="button" class="mi-btn" data-acc="permiso">Dar acceso de nuevo</button>' : ''}
      <div class="mi-fila"><span>Opacidad</span><input type="range" min="10" max="100" step="5" value="${Math.round((m.opacidad ?? 1) * 100)}" data-acc="opacidad" ${m.error ? 'disabled' : ''}>
        <button type="button" class="gi-mini" data-acc="centrar" title="Centrar en el mapa" ${m.limites ? '' : 'disabled'}>⌖</button>
        <button type="button" class="gi-mini peligro" data-acc="quitar" title="Quitar">×</button></div></div>`).join('');
  }
  $('mapas-importados')?.addEventListener('click', async (ev) => {
    const caja = ev.target.closest('[data-m]'); if (!caja) return;
    const m = mapas.find((x) => x.id === caja.dataset.m); const acc = ev.target.closest('[data-acc]')?.dataset.acc;
    if (!m || !acc) return;
    if (acc === 'centrar' && m.limites) mapa.flyToBounds([[m.limites.sur, m.limites.oeste], [m.limites.norte, m.limites.este]], { padding: [30, 30], duration: 0.7 });
    if (acc === 'quitar') { m.capa?.remove(); mapas.splice(mapas.indexOf(m), 1); borrar('mapas', m.id); pintarMapas(); }
    if (acc === 'permiso' && m.handle) {
      if ((await m.handle.requestPermission?.({ mode: 'read' })) === 'granted') { try { await crearCapaMapa(m); } catch (e) { m.error = e.message; } pintarMapas(); }
    }
  });
  $('mapas-importados')?.addEventListener('change', (ev) => {
    const m = mapas.find((x) => x.id === ev.target.closest('[data-m]')?.dataset.m); if (!m) return;
    if (ev.target.dataset.acc === 'ver') { m.visible = ev.target.checked; if (m.visible) m.capa?.addTo(mapa); else m.capa?.remove(); guardar('mapas', guardable(m)); }
  });
  $('mapas-importados')?.addEventListener('input', (ev) => {
    const m = mapas.find((x) => x.id === ev.target.closest('[data-m]')?.dataset.m); if (!m || ev.target.dataset.acc !== 'opacidad') return;
    m.opacidad = Number(ev.target.value) / 100; m.capa?.setOpacity?.(m.opacidad); guardar('mapas', guardable(m));
  });

  // ---------------------------------------------------------- sistema de coordenadas (si el mapa no lo trae)
  function preguntarSistema(nombre) {
    return new Promise((ok) => {
      const d = $('dialogo');
      d.innerHTML = `<form method="dialog" class="dlg"><h3>¿En qué sistema está «${esc(nombre)}»?</h3>
        <p>El archivo no dice su sistema de coordenadas. Elige el correcto (si dudas: los mapas modernos de España suelen ser ETRS89 UTM 30; los antiguos militares, ED50 UTM 30).</p>
        <select id="dlg-crs">${CRS_COMUNES.map((c) => `<option value="${c}">${esc(crsDesdeEpsg(c).nombre)} (EPSG ${c})</option>`).join('')}</select>
        <div class="pm-acciones"><button value="cancelar">Cancelar</button><button value="ok" class="primario">Colocar el mapa</button></div></form>`;
      d.onclose = () => ok(d.returnValue === 'ok' ? Number($('dlg-crs').value) : null);
      d.showModal();
    });
  }

  // ================================================================ ENTRADA DE ARCHIVOS
  /**
   * @param {Array<{archivo: File, handle?: FileSystemFileHandle}>} entradas
   */
  async function procesar(entradas) {
    const porBase = new Map();
    for (const e of entradas) { const k = base(e.archivo.name); if (!porBase.has(k)) porBase.set(k, []); porBase.get(k).push(e); }
    const avisos = [];
    let hechos = 0;
    for (const e of entradas) {
      const n = e.archivo.name;
      try {
        if (esDatos(n)) {
          const r = await importarDatos(e.archivo, n);
          for (const s of r.superposiciones) await anadirMapa({ nombre: s.nombre, tipo: 'superposicion', superposicion: s }, { centrar: false }).catch(() => {});
          if (r.mapas.length) await procesar(r.mapas.map((mp) => ({ archivo: new File([mp.blob], mp.nombre) })));
          if (r.elementos.length) { await anadirDatos(r); hechos++; } else if (!r.superposiciones.length && !r.mapas.length) avisos.push(`${n}: no contiene elementos que se puedan mostrar`);
        } else if (EXT_TESELAS.test(n)) { await anadirMapa({ nombre: n, tipo: 'teselas', archivo: e.handle ? undefined : e.archivo, handle: e.handle }); hechos++; }
        else if (EXT_TIFF.test(n)) {
          const hermanos = porBase.get(base(n)) || [];
          const prj = hermanos.find((h) => /\.prj$/i.test(h.archivo.name));
          await anadirMapa({ nombre: n, tipo: 'geotiff', archivo: e.handle ? undefined : e.archivo, handle: e.handle, prj: prj ? await prj.archivo.text() : undefined }); hechos++;
        } else if (EXT_IMAGEN.test(n)) {
          const hermanos = porBase.get(base(n)) || [];
          const mundo = hermanos.find((h) => EXT_MUNDO.test(h.archivo.name));
          if (!mundo) { avisos.push(`${n}: falta su archivo de georreferencia (.jgw/.pgw/.wld). Arrástralos juntos.`); continue; }
          const prj = hermanos.find((h) => /\.prj$/i.test(h.archivo.name));
          await anadirMapa({ nombre: n, tipo: 'imagen', archivo: e.handle ? undefined : e.archivo, handle: e.handle, mundo: await mundo.archivo.text(), prj: prj ? await prj.archivo.text() : undefined }); hechos++;
        } else if (EXT_NO.test(n)) {
          avisos.push(`${n}: el formato ${n.split('.').pop().toUpperCase()} no se puede leer en un navegador. Conviértelo una vez a GeoTIFF (en QGIS: botón derecho sobre la capa → Exportar → Guardar como… → GeoTIFF; o con GDAL: gdal_translate -of COG -co COMPRESS=JPEG "${n}" "${base(n)}.tif").`);
        } else if (EXT_MUNDO.test(n) || /\.(prj|aux\.xml|xml|ovr)$/i.test(n)) { /* acompañantes */ }
        else avisos.push(`${n}: formato no reconocido`);
      } catch (err) {
        avisos.push(`${n}: ${err.message}`);
      }
    }
    if (avisos.length) mostrarAvisos(avisos);
    return hechos;
  }

  function mostrarAvisos(avisos) {
    const d = $('dialogo');
    d.innerHTML = `<form method="dialog" class="dlg"><h3>Importación</h3><ul class="dlg-avisos">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul><div class="pm-acciones"><button value="ok" class="primario">Entendido</button></div></form>`;
    d.onclose = null; d.showModal();
  }

  // Arrastrar y soltar en toda la página
  const velo = $('velo-soltar');
  let dentro = 0;
  window.addEventListener('dragenter', (e) => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; dentro++; velo.hidden = false; });
  window.addEventListener('dragleave', () => { dentro = Math.max(0, dentro - 1); if (!dentro) velo.hidden = true; });
  window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); dentro = 0; velo.hidden = true;
    // En Chrome/Edge se pide un acceso directo al archivo (no se copia); hay que pedirlo ya, antes de cualquier espera
    const items = [...e.dataTransfer.items].filter((it) => it.kind === 'file');
    const handles = items.map((it) => (it.getAsFileSystemHandle ? it.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null)));
    const archivos = [...e.dataTransfer.files];
    Promise.all(handles).then((hs) => procesar(archivos.map((archivo, i) => ({ archivo, handle: hs[i]?.kind === 'file' ? hs[i] : undefined }))));
  });
  // Botones de elegir archivo
  for (const [boton, entrada] of [['btn-importar-datos', 'entrada-datos'], ['btn-importar-mapa', 'entrada-mapa']]) {
    $(boton)?.addEventListener('click', () => $(entrada).click());
    $(entrada)?.addEventListener('change', (ev) => { procesar([...ev.target.files].map((archivo) => ({ archivo }))); ev.target.value = ''; });
  }

  // ================================================================ CATÁLOGO (buscador en carpeta)
  let catalogo = null; // { id:'carpeta', handle, archivos: [...] }
  const soportaCarpeta = typeof window.showDirectoryPicker === 'function';

  async function indexar(handle, alProgreso) {
    await prepararRejillas().catch(() => {}); // por si hay mapas en ED50
    const archivos = [], acompanantes = [];
    async function rec(dir, ruta, prof) {
      if (prof > 6 || archivos.length > 5000) return;
      for await (const [nombre, h] of dir.entries()) {
        if (h.kind === 'directory') { await rec(h, `${ruta}${nombre}/`, prof + 1); continue; }
        if (EXT_TESELAS.test(nombre) || EXT_TIFF.test(nombre) || EXT_IMAGEN.test(nombre) || EXT_NO.test(nombre)) archivos.push({ ruta: ruta + nombre, nombre, handle: h });
        else if (EXT_MUNDO.test(nombre) || /\.prj$/i.test(nombre)) acompanantes.push({ ruta: ruta + nombre, nombre, handle: h });
      }
    }
    await rec(handle, '', 0);
    // Cabeceras: zona que cubre cada mapa
    let i = 0;
    for (const a of archivos) {
      alProgreso(++i, archivos.length, a.nombre);
      try {
        const f = await a.handle.getFile();
        a.tamano = f.size;
        if (EXT_TESELAS.test(a.nombre)) { const t = await abrirMapaTeselas(lectorBlob(f), a.nombre); a.tipo = t.tipo; a.limites = t.limites; }
        else if (EXT_TIFF.test(a.nombre)) { const fu = await fuenteGeoTiff(f); a.tipo = 'GeoTIFF'; a.limites = fu.crs ? limitesFuente(fu) : null; a.sistema = fu.crs?.nombre; }
        else if (EXT_NO.test(a.nombre)) { a.tipo = a.nombre.split('.').pop().toUpperCase(); a.convertir = true; }
        else {
          a.tipo = 'Imagen';
          const m = acompanantes.find((x) => EXT_MUNDO.test(x.nombre) && base(x.ruta) === base(a.ruta));
          if (!m) { a.error = 'sin archivo de mundo'; a.convertir = false; }
        }
      } catch (e) { a.error = e.message; }
    }
    return { archivos: archivos.filter((a) => !(a.tipo === 'Imagen' && a.error)), acompanantes };
  }

  async function abrirBuscador() {
    const d = $('dialogo');
    const pintar = (filtro = '', enVista = false) => {
      const v = mapa.getBounds();
      const lista = (catalogo?.archivos || []).filter((a) => (!filtro || a.ruta.toLowerCase().includes(filtro.toLowerCase()))
        && (!enVista || (a.limites && v.intersects([[a.limites.sur, a.limites.oeste], [a.limites.norte, a.limites.este]]))));
      $('cat-lista').innerHTML = lista.length ? lista.slice(0, 300).map((a, k) => `<li><div><b>${esc(a.nombre)}</b><small>${esc(a.ruta)} · ${esc(a.tipo || '')}${a.tamano ? ` · ${tam(a.tamano)}` : ''}${a.sistema ? ` · ${esc(a.sistema)}` : ''}${a.limites ? '' : ' · zona desconocida'}</small></div>
        ${a.convertir ? '<span class="cat-no">convertir a GeoTIFF</span>' : `<button type="button" data-cat="${catalogo.archivos.indexOf(a)}">Mostrar</button>`}</li>`).join('')
        : '<li class="cat-vacio">Ningún mapa coincide.</li>';
    };
    d.innerHTML = `<div class="dlg dlg-ancho"><h3>Buscar en mis mapas</h3>
      ${soportaCarpeta ? '' : '<p class="error-txt">Este navegador no deja elegir una carpeta. Usa Chrome o Edge, o arrastra los mapas uno a uno.</p>'}
      <div class="cat-cab"><span id="cat-carpeta">${catalogo ? `Carpeta: <b>${esc(catalogo.nombre)}</b> · ${catalogo.archivos.length} mapas` : 'Ninguna carpeta elegida'}</span>
        <button type="button" id="cat-elegir" ${soportaCarpeta ? '' : 'disabled'}>${catalogo ? 'Cambiar o volver a leer' : 'Elegir carpeta de mapas'}</button></div>
      <div class="cat-filtro"><input id="cat-buscar" placeholder="Buscar por nombre…" autocomplete="off"><label><input type="checkbox" id="cat-vista"> Solo los que cubren la vista actual</label></div>
      <div id="cat-progreso" class="cat-progreso" hidden></div>
      <ul id="cat-lista" class="cat-lista"></ul>
      <div class="pm-acciones"><button type="button" id="cat-cerrar">Cerrar</button></div></div>`;
    d.onclose = null; d.showModal();
    pintar();
    $('cat-buscar').addEventListener('input', () => pintar($('cat-buscar').value, $('cat-vista').checked));
    $('cat-vista').addEventListener('change', () => pintar($('cat-buscar').value, $('cat-vista').checked));
    $('cat-cerrar').addEventListener('click', () => d.close());
    $('cat-elegir').addEventListener('click', async () => {
      let h;
      try { h = await window.showDirectoryPicker({ id: 'spa-mapas', mode: 'read' }); } catch { return; }
      const prog = $('cat-progreso'); prog.hidden = false;
      const { archivos, acompanantes } = await indexar(h, (i, n, nom) => { prog.textContent = `Leyendo ${i} de ${n}: ${nom}`; });
      prog.hidden = true;
      catalogo = { id: 'carpeta', nombre: h.name, handle: h, archivos, acompanantes, fecha: new Date().toISOString() };
      await guardar('catalogo', catalogo);
      $('cat-carpeta').innerHTML = `Carpeta: <b>${esc(h.name)}</b> · ${archivos.length} mapas`;
      pintar($('cat-buscar').value, $('cat-vista').checked);
    });
    $('cat-lista').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-cat]'); if (!b) return;
      const a = catalogo.archivos[Number(b.dataset.cat)];
      if (catalogo.handle.queryPermission && (await catalogo.handle.queryPermission({ mode: 'read' })) !== 'granted') {
        if ((await catalogo.handle.requestPermission({ mode: 'read' })) !== 'granted') return;
      }
      b.disabled = true; b.textContent = 'Cargando…';
      const f = await a.handle.getFile();
      const entradas = [{ archivo: f, handle: a.handle }];
      if (EXT_IMAGEN.test(a.nombre) || EXT_TIFF.test(a.nombre)) {
        // Sus acompañantes (.jgw/.pgw/.tfw/.prj) en la misma carpeta
        const dir = a.ruta.replace(/[^/]+$/, '');
        for (const x of (catalogo.acompanantes || [])) if (x.ruta.startsWith(dir) && base(x.nombre) === base(a.nombre)) entradas.push({ archivo: await x.handle.getFile() });
      }
      await procesar(entradas);
      d.close();
    });
  }
  $('btn-buscar-mapas')?.addEventListener('click', abrirBuscador);

  // ================================================================ arranque: recuperar lo guardado
  (async () => {
    for (const g of await todos('datos')) { const gg = { ...g, abierto: false }; grupos.push(gg); capaGrupo(gg); }
    pintarGrupos();
    for (const m of await todos('mapas')) {
      mapas.push(m);
      try {
        if (m.handle?.queryPermission && (await m.handle.queryPermission({ mode: 'read' })) !== 'granted') { m.error = 'Hay que volver a dar acceso al archivo'; continue; }
        await crearCapaMapa(m);
      } catch (e) { m.error = e.message; }
    }
    pintarMapas();
    catalogo = await leer('catalogo', 'carpeta');
  })();

  return { procesar, puntosVisibles, grupos, mapas, abrirBuscador, cerrarFicha };
}
