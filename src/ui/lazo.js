// Herramienta «Lazo»: se pinta un círculo en el mapa (pulsar en el centro y
// arrastrar hasta el borde, o clic en el centro y clic en el borde) y se
// selecciona todo lo que queda dentro, agrupado por operación (paquete) y
// por archivo importado. Lo elegido se exporta (KMZ, KML, GeoJSON, GPX,
// CSV o paquete SPA) o se envía con el «Compartir» del sistema.
// El círculo es geodésico: el radio es exacto sobre el elipsoide.

import { medir } from '../geo/index.js';
import { puntosCirculo, estiloDe, nuevoElemento } from '../plan/plan.js';
import { objetosEnCirculo, enCirculo, objetosEnPoligono, enPoligono, buscarPaquete, nombreRuta, ruta, CATEGORIAS, categoriaDe, crearPaqueteSpa, asignar, nuevoPaquete, hijos } from '../plan/operaciones.js';
import { FORMATOS_EXPORTAR, crearArchivo } from '../datos/exportar.js';
import { preguntar } from './dialogo.js';
import { abrirMenu } from './objetos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CLAVE = 'spa.lazo';

/**
 * @param {object} o
 * @param {*} o.L @param {*} o.mapa
 * @param {*} o.dibujo API de dibujo.js
 * @param {*} o.simbolos API de simbolos.js
 * @param {() => *} o.importar API de importar.js (grupos importados)
 * @param {{metros, coord}} o.fmt
 * @param {() => string} o.herramienta
 * @param {(h:string) => void} o.elegirHerramienta
 * @param {() => void} [o.alCambiarPaneles]
 */
export function iniciarLazo({ L, mapa, dibujo, simbolos, importar, fmt, herramienta, elegirHerramienta, alCambiarPaneles = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel-lazo'), cuerpo = $('lazo-cuerpo');
  const capa = L.layerGroup().addTo(mapa);
  const plan = () => dibujo.plan();
  let pref = { formato: 'kmz', modo: 'toca', forma: 'circulo' }; // forma: 'circulo' | 'mano'
  try { Object.assign(pref, JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch { /* nada */ }
  const guardarPref = () => { try { localStorage.setItem(CLAVE, JSON.stringify(pref)); } catch { /* nada */ } };

  // Estado: círculo y lo encontrado
  let circulo = null;        // { centro, radio } o { poligono: [{lat,lon}] } (a mano)
  let trazo = null;          // pintando: { centro, arrastre, x0, y0 }
  let resultado = null;      // { titulo, items: [{ clave, grupo, nombre, ico, como, obj, plan:id? }] }
  const marcados = new Set();
  let nombreArchivo = '';

  // ---------------------------------------------------------- pintar el círculo
  function pintarCirculo(c, r, { fijo = false } = {}) {
    capa.clearLayers();
    if (!c) return;
    L.circleMarker([c.lat, c.lon], { radius: 4, color: '#fff', weight: 2, fillColor: '#0C5FA8', fillOpacity: 1, interactive: false }).addTo(capa);
    if (!(r > 0)) return;
    const pts = puntosCirculo(c, r, 144).map((p) => [p.lat, p.lon]);
    L.polygon(pts, { color: '#0C5FA8', weight: 2, dashArray: fijo ? '6 6' : '4 4', fillColor: '#3E82CF', fillOpacity: fijo ? 0.06 : 0.1, interactive: false }).addTo(capa);
    const borde = pts[Math.round(pts.length * 0.125)];
    L.marker(borde, { interactive: false, icon: L.divIcon({ className: 'etq-ancla', html: `<span class="etq-lazo">r ${esc(fmt.metros(r))}</span>`, iconSize: null }) }).addTo(capa);
  }

  // ---------------------------------------------------------- gesto en el mapa
  const cont = mapa.getContainer();
  const latlon = (e) => { const ll = mapa.mouseEventToLatLng(e); return { lat: ll.lat, lon: ll.lng }; };
  // A mano: se pinta mientras se mantiene pulsado y se cierra al soltar
  function pintarMano(pts, { fijo = false } = {}) {
    capa.clearLayers();
    if (pts.length < 2) return;
    const ll = pts.map((p) => [p.lat, p.lon]);
    if (fijo) L.polygon(ll, { color: '#0C5FA8', weight: 2, dashArray: '6 6', fillColor: '#3E82CF', fillOpacity: 0.06, interactive: false }).addTo(capa);
    else L.polyline(ll, { color: '#0C5FA8', weight: 2.5, opacity: 0.9, interactive: false, lineJoin: 'round' }).addTo(capa);
  }
  cont.addEventListener('pointerdown', (e) => {
    if (herramienta() !== 'lazo' || e.button !== 0 || e.target.closest('.leaflet-control')) return;
    e.preventDefault();
    if (pref.forma === 'mano') { cont.setPointerCapture?.(e.pointerId); trazo = { mano: [latlon(e)], x: e.clientX, y: e.clientY, pulsado: true }; return; }
    if (trazo && !trazo.arrastre && trazo.esperandoBorde) { terminar(latlon(e)); return; }
    trazo = { centro: latlon(e), x0: e.clientX, y0: e.clientY, arrastre: false, pulsado: true };
    pintarCirculo(trazo.centro, 0);
  });
  cont.addEventListener('pointermove', (e) => {
    if (herramienta() !== 'lazo' || !trazo) return;
    if (trazo.mano) {
      if (!trazo.pulsado || Math.hypot(e.clientX - trazo.x, e.clientY - trazo.y) < 4) return;
      trazo.x = e.clientX; trazo.y = e.clientY; trazo.mano.push(latlon(e)); pintarMano(trazo.mano); return;
    }
    if (trazo.pulsado && !trazo.arrastre && Math.hypot(e.clientX - trazo.x0, e.clientY - trazo.y0) > 6) trazo.arrastre = true;
    if (trazo.arrastre || trazo.esperandoBorde) {
      const r = medir(trazo.centro, latlon(e)).distancia;
      pintarCirculo(trazo.centro, r);
    }
  });
  cont.addEventListener('pointerup', (e) => {
    if (herramienta() !== 'lazo' || !trazo?.pulsado) return;
    trazo.pulsado = false;
    if (trazo.mano) { terminarMano(); return; }
    if (trazo.arrastre) terminar(latlon(e));
    else trazo.esperandoBorde = true;
  });
  let finLazo = 0;
  function terminarMano() {
    finLazo = performance.now();
    const pts = trazo.mano; trazo = null;
    if (pts.length < 3) { pintarMano([]); return; }
    circulo = { poligono: pts };
    pintarMano(pts, { fijo: true });
    elegirHerramienta('consultar');
    buscarEnCirculo();
  }
  function terminar(borde) {
    finLazo = performance.now();
    const r = medir(trazo.centro, borde).distancia;
    const c = trazo.centro; trazo = null;
    if (!(r > 0)) { pintarCirculo(null); return; }
    circulo = { centro: c, radio: r };
    pintarCirculo(c, r, { fijo: true });
    elegirHerramienta('consultar');
    buscarEnCirculo();
  }

  // ---------------------------------------------------------- qué hay dentro
  const medidaDe = (id) => simbolos?.medidaDe?.(id);
  function itemPlan(el, como) {
    const raiz = el.paquete && buscarPaquete(plan(), el.paquete) ? ruta(plan(), el.paquete)[0] : null;
    return { clave: `p:${el.id}`, grupo: raiz ? `op:${raiz.id}` : 'op:', grupoNombre: raiz ? raiz.nombre : 'Sin operación', nombre: dibujo.titulo(el), sub: el.paquete && raiz && el.paquete !== raiz.id ? nombreRuta(plan(), el.paquete).split(' › ').slice(1).join(' › ') : '', ico: dibujo.iconoDe(el), como, plan: el.id };
  }
  function buscarEnCirculo() {
    const { centro, radio, poligono } = circulo;
    const dentroDe = (forma) => (poligono ? enPoligono(forma, poligono) : enCirculo(forma, centro, radio));
    const items = (poligono ? objetosEnPoligono(plan(), poligono, { visible: dibujo.visible }) : objetosEnCirculo(plan(), centro, radio, { visible: dibujo.visible })).map(({ el, como }) => itemPlan(el, como));
    for (const g of importar()?.grupos ?? []) {
      if (!g.visible) continue;
      g.elementos.forEach((e, i) => {
        const como = dentroDe({ tipo: e.tipo, puntos: e.puntos, radio: e.radio });
        if (como) items.push({ clave: `i:${g.id}:${i}`, grupo: `imp:${g.id}`, grupoNombre: `Archivo · ${g.nombre}`, nombre: e.nombre || '(sin nombre)', sub: '', ico: '', como, imp: { g, e } });
      });
    }
    mostrar({ titulo: 'Dentro del lazo', items, circulo: true });
  }
  function mostrar(r) {
    resultado = r;
    marcados.clear();
    for (const it of r.items) if (pref.modo === 'toca' || it.como !== 'toca') marcados.add(it.clave);
    nombreArchivo = r.nombre || nombreArchivo || 'Lazo SPA';
    panel.hidden = false; alCambiarPaneles();
    pintarPanel(); resaltar();
  }
  function resaltar() { dibujo.resaltar(resultado ? resultado.items.filter((it) => it.plan && marcados.has(it.clave)).map((it) => it.plan) : []); }

  // ---------------------------------------------------------- panel
  function pintarPanel() {
    if (panel.hidden) return;
    if (!resultado) {
      $('lazo-sub').textContent = '';
      cuerpo.innerHTML = `${htmlForma()}${herramienta() === 'lazo' ? '' : '<div class="pm-acciones"><button type="button" data-a="otra">Pintar un lazo</button></div>'}`;
      return;
    }
    const items = resultado.items;
    const grupos = new Map();
    for (const it of items) { if (!grupos.has(it.grupo)) grupos.set(it.grupo, { nombre: it.grupoNombre, items: [] }); grupos.get(it.grupo).items.push(it); }
    const n = marcados.size, tocan = items.filter((it) => it.como === 'toca').length;
    $('lazo-sub').textContent = `${n} de ${items.length}`;
    const scroll = cuerpo.scrollTop;
    const datoLazo = circulo?.poligono ? 'lazo a mano' : circulo ? `radio ${esc(fmt.metros(circulo.radio))}<br>centro ${esc(fmt.coord(circulo.centro))}` : '';
    cuerpo.innerHTML = `${resultado.circulo ? `<div class="lazo-resumen"><span class="grande">${items.length}</span><small>objeto${items.length === 1 ? '' : 's'} · ${datoLazo}</small></div>
      ${tocan ? `<div class="seg lazo-modo"><button type="button" data-modo="dentro" aria-pressed="${pref.modo === 'dentro'}">Solo los de dentro</button><button type="button" data-modo="toca" aria-pressed="${pref.modo === 'toca'}">También los que tocan el borde (${tocan})</button></div>` : ''}` : `<div class="lazo-resumen"><span class="grande">${items.length}</span><small>objeto${items.length === 1 ? '' : 's'} elegido${items.length === 1 ? '' : 's'}</small></div>`}
      ${items.length ? [...grupos].map(([k, g]) => {
        const nm = g.items.filter((it) => marcados.has(it.clave)).length;
        return `<div class="lazo-grupo"><label><input type="checkbox" data-grupo="${esc(k)}" ${nm === g.items.length ? 'checked' : ''} ${nm && nm < g.items.length ? 'data-medio="1"' : ''}>${esc(g.nombre)}<small>${nm}/${g.items.length}</small></label>
          <div class="lazo-items">${g.items.map((it) => `<label><input type="checkbox" data-item="${esc(it.clave)}" ${marcados.has(it.clave) ? 'checked' : ''}><span class="obj-ico">${it.ico}</span><span class="obj-nom">${esc(it.nombre)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.como === 'toca' ? '<span class="toca">borde</span>' : '<span></span>'}</label>`).join('')}</div></div>`;
      }).join('') : '<p class="obj-vacio">No hay nada dentro. Prueba con un círculo más grande o muestra las operaciones ocultas.</p>'}
      ${items.length ? `<div class="el-et" style="margin-top:8px">Formato</div>
      <div class="lazo-formatos">${Object.entries(FORMATOS_EXPORTAR).map(([k, f]) => `<button type="button" data-formato="${k}" aria-pressed="${pref.formato === k}" title="${esc(f.detalle)}">${esc(f.nombre)}<small>${esc(f.detalle.split(/[,(:]/)[0])}</small></button>`).join('')}</div>
      <label class="el-nombre" style="margin:4px 0 0">Nombre del archivo <input id="lazo-nombre" value="${esc(nombreArchivo)}" maxlength="60"></label>
      <div class="lazo-acciones"><button type="button" class="v-boton primario" data-a="descargar" ${n ? '' : 'disabled'}>Descargar</button><button type="button" class="v-boton" data-a="enviar" ${n ? '' : 'disabled'}>Enviar…</button></div>
      <div class="lazo-mas">
        <button type="button" class="v-boton" data-a="meter" ${plMarcados().length ? '' : 'disabled'}>Meter en operación…</button>
        <button type="button" class="v-boton" data-a="ver" ${plMarcados().length ? '' : 'disabled'}>Ver</button>
        <button type="button" class="v-boton peligro" data-a="borrar" ${plMarcados().length ? '' : 'disabled'}>Borrar</button>
        ${resultado.circulo ? '<button type="button" class="v-boton" data-a="otra">Otro lazo</button>' : ''}
      </div>` : `${resultado.circulo ? '<div class="pm-acciones"><button type="button" data-a="otra">Otro lazo</button></div>' : ''}`}`;
    cuerpo.querySelectorAll('[data-medio]').forEach((c) => { c.indeterminate = true; });
    cuerpo.scrollTop = scroll;
  }
  /** Círculo o a mano. */
  const htmlForma = () => `<div class="seg lazo-modo"><button type="button" data-forma="circulo" aria-pressed="${pref.forma !== 'mano'}">Círculo</button><button type="button" data-forma="mano" aria-pressed="${pref.forma === 'mano'}">A mano</button></div>`;
  const plMarcados = () => (resultado?.items ?? []).filter((it) => it.plan && marcados.has(it.clave)).map((it) => it.plan);

  // Objetos exportables (formato común de exportar.js)
  function exportables() {
    const out = [];
    for (const it of resultado.items) {
      if (!marcados.has(it.clave)) continue;
      if (it.plan) {
        const el = plan().elementos.find((e) => e.id === it.plan); if (!el) continue;
        const pts = dibujo.puntosDe(el);
        out.push({
          nombre: dibujo.titulo(el), tipo: el.tipo, puntos: pts, radio: el.propiedades.radio, color: estiloDe(el).color,
          categoria: CATEGORIAS[categoriaDe(el, medidaDe)].nombre, paquete: el.paquete && buscarPaquete(plan(), el.paquete) ? nombreRuta(plan(), el.paquete) : '',
          bando: el.propiedades.bando, estado: el.propiedades.estado, sidc: simbolos?.sidcDe?.(el) ?? '', notas: el.propiedades.notas,
        });
      } else if (it.imp) {
        const { g, e } = it.imp;
        out.push({ nombre: e.nombre || '', tipo: e.tipo, puntos: e.puntos, radio: e.radio, color: e.color || '#5b3a8c', categoria: 'Importado', paquete: `Importado › ${g.nombre}` });
      }
    }
    return out;
  }
  async function archivo() {
    const nombre = ($('lazo-nombre')?.value || nombreArchivo || 'Lazo SPA').trim();
    nombreArchivo = nombre;
    let paquete = null;
    if (pref.formato === 'spa') {
      const els = plMarcados().map((id) => plan().elementos.find((e) => e.id === id)).filter(Boolean);
      paquete = crearPaqueteSpa(plan(), els, { nombre });
      for (const it of resultado.items) if (it.imp && marcados.has(it.clave)) {
        const { e } = it.imp;
        try { paquete.elementos.push({ ...nuevoElemento(e.tipo, e.puntos, { radio: e.radio, nombre: e.nombre, color: e.color || null }), fuente: 'importado' }); } catch { /* forma no válida */ }
      }
    }
    return crearArchivo(pref.formato, exportables(), { nombre, paquete });
  }
  function descargar({ blob, nombre }) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function enviar() {
    const f = await archivo();
    const file = new File([f.blob], f.nombre, { type: f.tipo });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: f.nombre, text: 'Enviado desde SPA' }); return; }
    } catch (err) { if (err?.name === 'AbortError') return; }
    descargar(f);
    await preguntar({ titulo: 'Archivo listo para enviar', texto: `Este navegador no deja compartir archivos ${FORMATOS_EXPORTAR[pref.formato].nombre} directamente. Se ha descargado «${f.nombre}»: adjúntalo en el correo, la mensajería o ATAK.`, opciones: [{ v: 'ok', texto: 'Entendido', clase: 'primario' }] });
  }

  cuerpo.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.item) { if (t.checked) marcados.add(t.dataset.item); else marcados.delete(t.dataset.item); pintarPanel(); resaltar(); return; }
    if (t.dataset.grupo !== undefined) { for (const it of resultado.items) if (it.grupo === t.dataset.grupo) { if (t.checked) marcados.add(it.clave); else marcados.delete(it.clave); } pintarPanel(); resaltar(); return; }
    if (t.id === 'lazo-nombre') nombreArchivo = t.value.trim();
  });
  cuerpo.addEventListener('click', async (ev) => {
    const t = ev.target;
    const fm = t.closest('[data-formato]'); if (fm) { pref.formato = fm.dataset.formato; guardarPref(); pintarPanel(); return; }
    const fo = t.closest('[data-forma]');
    if (fo) { pref.forma = fo.dataset.forma; guardarPref(); trazo = null; if (!resultado) pintarCirculo(null); if (herramienta() !== 'lazo') elegirHerramienta('lazo'); pintarPanel(); return; }
    const md = t.closest('[data-modo]');
    if (md) { pref.modo = md.dataset.modo; guardarPref(); for (const it of resultado.items) if (it.como === 'toca') { if (pref.modo === 'toca') marcados.add(it.clave); else marcados.delete(it.clave); } pintarPanel(); resaltar(); return; }
    const a = t.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'otra') { resultado = null; circulo = null; pintarCirculo(null); dibujo.resaltar([]); elegirHerramienta('lazo'); pintarPanel(); return; }
    if (a === 'descargar') { descargar(await archivo()); dibujo.avisoBreve('Archivo descargado.'); return; }
    if (a === 'enviar') { enviar(); return; }
    const ids = plMarcados();
    if (a === 'ver') dibujo.encuadrar(ids);
    if (a === 'borrar') { const r = await dibujo.borrar(ids); if (r === 'todo') { resultado.items = resultado.items.filter((it) => !it.plan || !ids.includes(it.plan)); for (const id of ids) marcados.delete(`p:${id}`); pintarPanel(); resaltar(); } }
    if (a === 'meter') {
      const ops = []; const rec = (padre, niv) => { for (const o of hijos(plan(), padre)) { ops.push({ o, niv }); rec(o.id, niv + 1); } }; rec(null, 0);
      abrirMenu(t.closest('button'), `<div class="om-tit">Meter ${ids.length} en…</div>${ops.map(({ o, niv }) => `<button type="button" data-v="${o.id}" style="padding-left:${9 + niv * 14}px">${niv ? '› ' : ''}${esc(o.nombre)}</button>`).join('')}<div class="om-sep"></div><button type="button" data-v="__nueva">+ Nueva operación con estos…</button>`, async (v) => {
        if (v === '__nueva') {
          const r = await preguntar({ titulo: 'Nueva operación', texto: `Con los ${ids.length} objetos del lazo.`, campo: { valor: nombreArchivo === 'Lazo SPA' ? '' : nombreArchivo, ayuda: 'Nombre (ej.: OP NORTE)' }, opciones: [{ v: 'crear', texto: 'Crear', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] });
          if (r) dibujo.cambio(`Crear «${r.texto || 'Operación'}»`, (p) => { const o = nuevoPaquete(p, r.texto || 'Operación'); asignar(p, ids, o.id); });
        } else if (v) dibujo.cambio(`Meter ${ids.length} en «${buscarPaquete(plan(), v)?.nombre}»`, (p) => asignar(p, ids, v));
        if (resultado) { resultado.items = resultado.items.map((it) => (it.plan ? itemPlan(plan().elementos.find((e) => e.id === it.plan), it.como) : it)); pintarPanel(); }
      });
    }
  });
  $('lazo-cerrar').addEventListener('click', () => cerrar());
  function cerrar() {
    panel.hidden = true; resultado = null; circulo = null; trazo = null; pintarCirculo(null); dibujo.resaltar([]);
    if (herramienta() === 'lazo') elegirHerramienta('consultar');
    alCambiarPaneles();
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (herramienta() === 'lazo') { trazo = null; if (!circulo) pintarCirculo(null); elegirHerramienta('consultar'); }
  });

  return {
    /** Al elegir o dejar la herramienta. */
    herramientaCambiada(h) {
      if (h === 'lazo') {
        mapa.dragging.disable(); cont.classList.add('cursor-lazo');
        trazo = null;
        panel.hidden = false; pintarPanel(); alCambiarPaneles();
      } else {
        mapa.dragging.enable(); cont.classList.remove('cursor-lazo');
        if (trazo) { trazo = null; if (!circulo) pintarCirculo(null); }
        if (!resultado && !panel.hidden) { panel.hidden = true; alCambiarPaneles(); }
      }
    },
    /** Abre el panel para exportar o enviar unos objetos del plan (desde Objetos u Operaciones). */
    exportar(ids, nombre = 'Objetos SPA') {
      circulo = null; pintarCirculo(null);
      const items = ids.map((id) => plan().elementos.find((e) => e.id === id)).filter(Boolean).map((el) => itemPlan(el, 'dentro'));
      mostrar({ titulo: nombre, items, nombre });
    },
    cerrar,
    get abierto() { return !panel.hidden; },
    /** Acaba de terminar un lazo (el clic que sigue no es para el mapa). */
    get recienTerminado() { return performance.now() - finLazo < 400; },
  };
}
