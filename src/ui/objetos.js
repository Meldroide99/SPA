// Panel «Objetos»: todo lo pintado (y los archivos importados).
//   - Filtros: texto, categoría (unidades, líneas de coordinación, cometidos,
//     dibujos), bando, operación y estado. Se recuerdan.
//   - Selección múltiple con casillas (Mayús: un tramo). Lo marcado se
//     resalta en el mapa.
//   - Acciones sobre lo marcado: ver, meter en una operación, exportar o
//     enviar, y borrar (si está en una operación, pregunta si quitarlo solo
//     de ella o borrarlo del todo).

import { BANDOS, ESTADOS } from '../plan/plan.js';
import { CATEGORIAS, categoriaDe, filtrar, buscarPaquete, nombreRuta, asignar, nuevoPaquete, hijos } from '../plan/operaciones.js';
import { preguntar } from './dialogo.js';

const CLAVE = 'spa.objetos.filtros';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {object} o
 * @param {*} o.dibujo API de dibujo.js
 * @param {*} o.simbolos API de simbolos.js (medidaDe)
 * @param {(ids:string[], nombre:string) => void} o.exportar abre el Lazo con estos objetos para exportarlos o enviarlos
 * @param {() => void} [o.alCambiarPaneles]
 */
export function iniciarObjetos({ dibujo, simbolos, exportar, alCambiarPaneles = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel-objetos'), cuerpo = $('objetos-lista');
  const medidaDe = (id) => simbolos?.medidaDe?.(id);
  const plan = () => dibujo.plan();

  let f = { texto: '', categorias: [], bandos: [], estados: [], paquete: '' };
  try { Object.assign(f, JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch { /* nada */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify({ ...f, texto: '' })); } catch { /* nada */ } };
  f.texto = '';
  const marcados = new Set();
  let ultimoMarcado = null;

  // Esqueleto (la parte de archivos importados está en mapa.html: la rellena importar.js)
  cuerpo.innerHTML = `<input class="obj-buscar" id="obj-buscar" type="search" placeholder="Buscar" autocomplete="off">
    <div class="obj-chips" id="obj-cat" aria-label="Categoría"></div>
    <div class="obj-filtros-mas"><select id="obj-op" class="v-select" aria-label="Operación"></select><select id="obj-bando" class="v-select" aria-label="Bando"></select><select id="obj-estado" class="v-select" aria-label="Estado"></select></div>
    <div class="obj-cab"><label><input type="checkbox" id="obj-todos"><span id="obj-n"></span></label><button type="button" class="v-boton" id="obj-limpiar" hidden>Quitar filtros</button></div>
    <div class="obj-lista" id="obj-lista"></div>
    <div class="obj-acciones" id="obj-acciones" hidden><b id="obj-marcados"></b>
      <button type="button" data-a="ver" title="Encuadrar en el mapa">Ver</button>
      <button type="button" data-a="meter" title="Meter en una operación">Meter en…</button>
      <button type="button" data-a="exportar" title="Exportar a KMZ, KML, GeoJSON, GPX, CSV o enviar">Exportar…</button>
      <button type="button" data-a="borrar" class="peligro">Borrar</button></div>`;

  // ---------------------------------------------------------- pintar
  function pintarFiltros(todos) {
    const cuenta = (k, fn) => todos.filter(fn).length;
    $('obj-cat').innerHTML = Object.entries(CATEGORIAS).map(([k, c]) => {
      const n = cuenta(k, (e) => categoriaDe(e, medidaDe) === k);
      return `<button type="button" class="obj-chip" data-cat="${k}" aria-pressed="${f.categorias.includes(k)}">${c.nombre} <small>${n}</small></button>`;
    }).join('');
    const bd = f.bandos.length === 1 ? f.bandos[0] : '';
    $('obj-bando').innerHTML = `<option value="">Bando</option>${Object.entries(BANDOS).map(([k, b]) => `<option value="${k}" ${k === bd ? 'selected' : ''}>${b.nombre}</option>`).join('')}`;
    // En el filtro, solo las operaciones (sin sus fases): filtrar una incluye todo lo de dentro
    const ops = hijos(plan(), null).map((o) => ({ o, niv: 0 }));
    if (f.paquete && f.paquete !== '__sin' && !ops.some(({ o }) => o.id === f.paquete)) f.paquete = '';
    $('obj-op').innerHTML = `<option value="">Operación</option><option value="__sin" ${f.paquete === '__sin' ? 'selected' : ''}>Sin operación</option>${ops.map(({ o }) => `<option value="${o.id}" ${o.id === f.paquete ? 'selected' : ''}>${esc(nombreRuta(plan(), o.id))}</option>`).join('')}`;
    const est = f.estados.length === 1 ? f.estados[0] : '';
    $('obj-estado').innerHTML = `<option value="">Estado</option>${Object.entries(ESTADOS).map(([k, e]) => `<option value="${k}" ${k === est ? 'selected' : ''}>${e.nombre}s</option>`).join('')}`;
    $('obj-limpiar').hidden = !(f.texto || f.categorias.length || f.bandos.length || f.estados.length || f.paquete);
  }

  function lista() {
    return filtrar(plan(), {
      texto: f.texto, categorias: new Set(f.categorias), bandos: new Set(f.bandos), estados: new Set(f.estados),
      paquete: f.paquete === '__sin' ? null : f.paquete,
    }, { titulo: dibujo.titulo, medidaDe });
  }

  function pintar() {
    if (panel.hidden) return;
    const todos = plan().elementos;
    for (const id of [...marcados]) if (!todos.some((e) => e.id === id)) marcados.delete(id);
    pintarFiltros(todos);
    const vis = lista();
    $('obj-cuenta').textContent = vis.length === todos.length ? `${todos.length}` : `${vis.length} de ${todos.length}`;
    $('obj-n').textContent = `${vis.length} objeto${vis.length === 1 ? '' : 's'}`;
    const nMarc = vis.filter((e) => marcados.has(e.id)).length;
    $('obj-todos').checked = vis.length > 0 && nMarc === vis.length;
    $('obj-todos').indeterminate = nMarc > 0 && nMarc < vis.length;
    const sel = dibujo.seleccion;
    $('obj-lista').innerHTML = !todos.length
      ? '<p class="obj-vacio">Nada pintado</p>'
      : !vis.length ? '<p class="obj-vacio">Nada</p>'
        : vis.map((el) => {
          const ruta = el.paquete && buscarPaquete(plan(), el.paquete) ? nombreRuta(plan(), el.paquete) : '';
          const cat = CATEGORIAS[categoriaDe(el, medidaDe)].nombre;
          return `<div class="obj-fila${el.id === sel ? ' sel' : ''}${marcados.has(el.id) ? ' marcada' : ''}${dibujo.visible(el) ? '' : ' oculta'}" data-el="${el.id}" role="option" aria-selected="${el.id === sel}">
            <input type="checkbox" data-marcar="${el.id}" ${marcados.has(el.id) ? 'checked' : ''} aria-label="Marcar">
            <span class="obj-ico">${dibujo.iconoDe(el)}</span>
            <span class="obj-nom">${esc(dibujo.titulo(el))}${ruta ? `<small>${esc(ruta)}</small>` : ''}</span>
            <span class="obj-col-ancha">${esc(cat)}</span>
            <span class="obj-col" style="color:${BANDOS[el.propiedades.bando]?.color ?? 'inherit'}">${esc(BANDOS[el.propiedades.bando]?.nombre ?? '')}</span>
            <span class="obj-med">${esc(dibujo.resumen(el))}</span></div>`;
        }).join('');
    const n = marcados.size;
    $('obj-acciones').hidden = !n;
    $('obj-marcados').textContent = `${n} marcado${n === 1 ? '' : 's'}`;
  }

  function marcar(ids, si) {
    for (const id of ids) { if (si) marcados.add(id); else marcados.delete(id); }
    dibujo.resaltar([...marcados]);
    pintar();
  }

  // ---------------------------------------------------------- eventos
  cuerpo.addEventListener('input', (ev) => { if (ev.target.id === 'obj-buscar') { f.texto = ev.target.value; pintar(); } });
  cuerpo.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'obj-op') { f.paquete = t.value; guardar(); pintar(); return; }
    if (t.id === 'obj-estado') { f.estados = t.value ? [t.value] : []; guardar(); pintar(); return; }
    if (t.id === 'obj-bando') { f.bandos = t.value ? [t.value] : []; guardar(); pintar(); return; }
    if (t.id === 'obj-todos') { marcar(lista().map((e) => e.id), t.checked); return; }
  });
  cuerpo.addEventListener('click', (ev) => {
    const t = ev.target;
    const chip = t.closest('.obj-chip');
    if (chip) {
      const v = chip.dataset.cat;
      f.categorias = f.categorias.includes(v) ? f.categorias.filter((x) => x !== v) : [...f.categorias, v];
      guardar(); pintar(); return;
    }
    if (t.id === 'obj-limpiar') { f = { texto: '', categorias: [], bandos: [], estados: [], paquete: '' }; $('obj-buscar').value = ''; guardar(); pintar(); return; }
    const caja = t.closest('[data-marcar]');
    if (caja) {
      const id = caja.dataset.marcar;
      if (ev.shiftKey && ultimoMarcado) {
        const ids = lista().map((e) => e.id); const a = ids.indexOf(ultimoMarcado), b = ids.indexOf(id);
        if (a >= 0 && b >= 0) { marcar(ids.slice(Math.min(a, b), Math.max(a, b) + 1), caja.checked); ultimoMarcado = id; return; }
      }
      ultimoMarcado = id; marcar([id], caja.checked); return;
    }
    const fila = t.closest('.obj-fila');
    if (fila) {
      const el = plan().elementos.find((e) => e.id === fila.dataset.el);
      if (el && !dibujo.visible(el)) { dibujo.avisoBreve('Oculto'); return; }
      dibujo.seleccionar(fila.dataset.el, { centrar: true }); return;
    }
    const a = t.closest('[data-a]')?.dataset.a; if (!a) return;
    const ids = [...marcados];
    if (a === 'ver') dibujo.encuadrar(ids);
    if (a === 'meter') menuMeter(t.closest('button'), ids);
    if (a === 'exportar') exportar(ids, ids.length === 1 ? dibujo.titulo(plan().elementos.find((e) => e.id === ids[0])) : 'Objetos SPA');
    if (a === 'borrar') dibujo.borrar(ids).then((r) => { if (r === 'todo') { marcados.clear(); dibujo.resaltar([]); pintar(); } });
  });
  cuerpo.addEventListener('dblclick', (ev) => { const fila = ev.target.closest('.obj-fila'); if (fila) dibujo.encuadrar([fila.dataset.el]); });

  // Menú «Meter en…» (operaciones y fases)
  function menuMeter(boton, ids) {
    const ops = [];
    const rec = (padre, niv) => { for (const o of hijos(plan(), padre)) { ops.push({ o, niv }); rec(o.id, niv + 1); } };
    rec(null, 0);
    abrirMenu(boton, `<div class="om-tit">Meter ${ids.length} en…</div>
      ${ops.map(({ o, niv }) => `<button type="button" data-meter="${o.id}" style="padding-left:${9 + niv * 14}px">${niv ? '› ' : ''}${esc(o.nombre)}</button>`).join('') || '<div class="om-tit" style="text-transform:none;font-weight:400">Aún no hay operaciones</div>'}
      <div class="om-sep"></div><button type="button" data-meter="__nueva">+ Nueva operación con estos…</button><button type="button" data-meter="">Sacar de su operación</button>`, (v) => {
      if (v === '__nueva') {
        preguntar({ titulo: 'Nueva operación', campo: { ayuda: 'Nombre' }, opciones: [{ v: 'crear', texto: 'Crear', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] })
          .then((r) => { if (!r) return; dibujo.cambio(`Crear «${r.texto || 'Operación'}»`, (p) => { const o = nuevoPaquete(p, r.texto || 'Operación'); asignar(p, ids, o.id); }); });
        return;
      }
      const o = v ? buscarPaquete(plan(), v) : null;
      dibujo.cambio(o ? `Meter ${ids.length} en «${o.nombre}»` : `Sacar ${ids.length} de su operación`, (p) => asignar(p, ids, v || null));
      dibujo.avisoBreve(o ? `${ids.length} en «${nombreRuta(plan(), o.id)}»` : 'Fuera de su operación', { deshacer: true });
    });
  }

  dibujo.suscribir(pintar);
  return {
    abrir(si) { panel.hidden = !si; if (si) pintar(); else { marcados.clear(); dibujo.resaltar([]); } alCambiarPaneles(); },
    get abierto() { return !panel.hidden; },
    pintar,
    /** Filtra por una operación (desde el panel Operaciones). */
    filtrarPaquete(id) { f.paquete = id ?? '__sin'; guardar(); pintar(); },
  };
}

// ---------------------------------------------------------- menú flotante de cristal
let menuAbierto = null;
/** Menú junto a un botón. `elegir(valor)` con el data-meter/data-v del botón pulsado. */
export function abrirMenu(boton, html, elegir) {
  cerrarMenu();
  const m = document.createElement('div');
  m.className = 'obj-menu'; m.innerHTML = html; m.setAttribute('role', 'menu');
  document.body.append(m);
  const r = boton.getBoundingClientRect();
  const alto = m.offsetHeight, ancho = m.offsetWidth;
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - ancho - 8))}px`;
  m.style.top = `${r.bottom + 6 + alto > innerHeight - 8 ? Math.max(8, r.top - alto - 6) : r.bottom + 6}px`;
  m.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const v = b.dataset.meter ?? b.dataset.v;
    cerrarMenu(); elegir(v);
  });
  menuAbierto = m;
  setTimeout(() => document.addEventListener('pointerdown', fuera, true), 0);
}
function fuera(ev) { if (menuAbierto && !menuAbierto.contains(ev.target)) cerrarMenu(); }
export function cerrarMenu() { document.removeEventListener('pointerdown', fuera, true); menuAbierto?.remove(); menuAbierto = null; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
