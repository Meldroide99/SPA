// Panel «Operaciones»: paquetes de datos con fases, saltos… (con el nombre
// que quiera el usuario), en tres pestañas: en curso, futuras y pasadas.
//   - Crear: lo que se pinte después entra en la operación activa (●).
//   - Ojo: mostrar u ocultar (cada usuario lo suyo). «Ver solo esta».
//     «Ocultar todo»: el mapa sin símbolos.
//   - Arrastrar objetos de un paquete a otro, o un paquete dentro de otro.
//   - Menú ⋯: fase nueva, renombrar, pasar a futura/pasada, encuadrar,
//     exportar o enviar, duplicar, borrar (con o sin sus objetos).

import {
  ESTADOS_OP, hijos, buscarPaquete, nuevoPaquete, objetosDe, asignar, moverPaquete, borrarPaquete,
  duplicarPaquete, descendientes, nombreRuta, tocarPaquete, paquetes,
} from '../plan/operaciones.js';
import { preguntar } from './dialogo.js';
import { abrirMenu } from './objetos.js';

const CLAVE = 'spa.operaciones.ui';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OJO = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const OJO_NO = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.6A10.6 10.6 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3 3.7M6.3 7.3A16.4 16.4 0 0 0 2 12s3.6 6.5 10 6.5a9.7 9.7 0 0 0 4.4-1"/></svg>';
const FLECHA = '<svg viewBox="0 0 10 10"><path d="M3 1.5 7.5 5 3 8.5z"/></svg>';

/**
 * @param {object} o
 * @param {*} o.dibujo API de dibujo.js
 * @param {(ids:string[], nombre:string) => void} o.exportar
 * @param {(id:string|null) => void} o.verEnObjetos abre Objetos filtrado por esa operación
 * @param {() => void} [o.alCambiarPaneles]
 */
export function iniciarPanelOperaciones({ dibujo, exportar, verEnObjetos, alCambiarPaneles = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel-operaciones'), cuerpo = $('operaciones-cuerpo');
  const plan = () => dibujo.plan();
  let ui = { pestana: 'curso', abiertos: {} };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch { /* nada */ }
  const guardarUi = () => { try { localStorage.setItem(CLAVE, JSON.stringify(ui)); } catch { /* nada */ } };
  const vista = () => dibujo.vista;
  const oculto = (id) => vista().ocultos.includes(id);

  // ---------------------------------------------------------- pintar
  function nodo(o, niv) {
    const hs = hijos(plan(), o.id);
    const propios = objetosDe(plan(), o.id, { recursivo: false });
    const total = objetosDe(plan(), o.id).length;
    const abierto = Boolean(ui.abiertos[o.id]);
    const activo = dibujo.activo === o.id;
    const solo = vista().solo === o.id;
    const sub = [activo ? '● pintando aquí' : '', hs.length ? `${hs.length} fase${hs.length > 1 ? 's' : ''}` : '', o.origen && o.origen !== 'local' ? o.origen : ''].filter(Boolean).join(' · ');
    let html = `<div class="op-nodo${activo ? ' activo' : ''}${solo ? ' solo' : ''}${oculto(o.id) ? ' oculto' : ''}" data-op="${o.id}" draggable="true" style="--niv:${niv}">
      <button type="button" class="op-flecha" data-acc="abrir" aria-expanded="${abierto}" ${hs.length || propios.length ? '' : 'style="visibility:hidden"'} aria-label="Abrir">${FLECHA}</button>
      <button type="button" class="op-ojo" data-acc="ojo" aria-pressed="${!oculto(o.id)}" title="${oculto(o.id) ? 'Mostrar' : 'Ocultar'}">${oculto(o.id) ? OJO_NO : OJO}</button>
      <button type="button" class="op-nom" data-acc="activar" title="Clic: pintar aquí · Doble clic: cambiar el nombre"><b>${esc(o.nombre)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>
      <span class="op-cuenta" title="Objetos (con los de sus fases)">${total}</span>
      <button type="button" class="op-mas" data-acc="menu" aria-label="Más opciones">⋯</button></div>`;
    if (abierto) {
      for (const h of hs) html += nodo(h, niv + 1);
      if (propios.length) html += `<div class="op-objetos" style="--niv:${niv}">${propios.map(filaObjeto).join('')}</div>`;
    }
    return html;
  }
  const filaObjeto = (el) => `<div class="obj-fila${dibujo.seleccion === el.id ? ' sel' : ''}" data-el="${el.id}" draggable="true" title="Arrástralo a otra operación o fase"><span class="obj-ico">${dibujo.iconoDe(el)}</span><span class="obj-nom">${esc(dibujo.titulo(el))}</span><span class="obj-med">${esc(dibujo.resumen(el))}</span></div>`;

  function pintar() {
    if (panel.hidden) return;
    const raices = hijos(plan(), null);
    const n = (k) => raices.filter((o) => (o.estado ?? 'curso') === k).length;
    $('op-cuenta').textContent = raices.length ? `${raices.length}` : '';
    const lista = raices.filter((o) => (o.estado ?? 'curso') === ui.pestana);
    const sueltos = objetosDe(plan(), null);
    const activo = dibujo.activo ? nombreRuta(plan(), dibujo.activo) : '';
    const scroll = cuerpo.scrollTop;
    cuerpo.innerHTML = `<div class="seg op-pestanas">${Object.entries(ESTADOS_OP).map(([k, e]) => `<button type="button" data-pestana="${k}" aria-pressed="${ui.pestana === k}">${e.nombre}${n(k) ? `<small>${n(k)}</small>` : ''}</button>`).join('')}</div>
      <form class="op-nueva" id="op-nueva"><input id="op-nueva-nombre" placeholder="${ui.pestana === 'curso' ? 'Nueva operación (ej.: OP NORTE)' : `Nueva operación ${ESTADOS_OP[ui.pestana].corto.toLowerCase()}`}" maxlength="60" autocomplete="off"><button type="submit" class="v-boton primario">Crear</button></form>
      <div class="op-arbol" id="op-arbol">${lista.map((o) => nodo(o, 0)).join('') || `<p class="op-vacio">${ui.pestana === 'curso' ? 'Crea una operación: lo que pintes después entrará en ella. Dentro puedes crear fases, saltos o lo que quieras.' : `No hay operaciones ${ESTADOS_OP[ui.pestana].nombre.toLowerCase()}.`}</p>`}</div>
      <div class="op-sueltos"><div class="op-nodo${vista().sueltosOcultos ? ' oculto' : ''}" data-op="" style="--niv:0">
        <button type="button" class="op-flecha" data-acc="abrir" aria-expanded="${Boolean(ui.abiertos.__sueltos)}" ${sueltos.length ? '' : 'style="visibility:hidden"'}>${FLECHA}</button>
        <button type="button" class="op-ojo" data-acc="ojo" aria-pressed="${!vista().sueltosOcultos}" title="Mostrar u ocultar lo que no está en ninguna operación">${vista().sueltosOcultos ? OJO_NO : OJO}</button>
        <button type="button" class="op-nom" data-acc="activar" title="Pintar sin operación"><b>Sin operación</b><small>${dibujo.activo ? 'Clic para pintar sin operación' : '● pintando aquí'}</small></button>
        <span class="op-cuenta">${sueltos.length}</span><span></span></div>
        ${ui.abiertos.__sueltos && sueltos.length ? `<div class="op-objetos" style="--niv:0">${sueltos.map(filaObjeto).join('')}</div>` : ''}</div>
      <div class="pm-acciones"><button type="button" data-acc="ver-todo">Ver todo</button><button type="button" data-acc="ocultar-todo" title="El mapa sin símbolos">Ocultar todo</button></div>
      <p class="op-ayuda">${activo ? `Lo que pintes entra en <b>${esc(activo)}</b>. ` : ''}Arrastra objetos entre operaciones y fases, o una fase dentro de otra. Lo que ves u ocultas es solo tuyo.</p>`;
    cuerpo.scrollTop = scroll;
  }

  // ---------------------------------------------------------- acciones
  const cambio = (d, fn) => dibujo.cambio(d, fn);
  function crear(nombre, { padre = null, estado = ui.pestana } = {}) {
    const o = cambio(`Crear «${nombre || (padre ? 'Fase' : 'Operación')}»`, (p) => nuevoPaquete(p, nombre, { padre, estado }));
    if (padre) ui.abiertos[padre] = true;
    guardarUi();
    dibujo.ponerActivo(o.id);
    dibujo.avisoBreve(`«${nombreRuta(plan(), o.id)}» creada. Lo que pintes entra en ella.`);
    return o;
  }
  function conmutarOjo(id) {
    if (!id) { dibujo.ponerVista({ sueltosOcultos: !vista().sueltosOcultos }); return; }
    const v = vista();
    dibujo.ponerVista({ ocultos: oculto(id) ? v.ocultos.filter((x) => x !== id) : [...v.ocultos, id], solo: v.solo && descendientes(plan(), id).includes(v.solo) && !oculto(id) ? null : v.solo });
  }
  async function renombrar(o) {
    const r = await preguntar({ titulo: 'Cambiar el nombre', campo: { valor: o.nombre }, opciones: [{ v: 'ok', texto: 'Guardar', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] });
    if (r?.texto) cambio('Cambiar nombre', () => { o.nombre = r.texto; tocarPaquete(o); });
  }
  async function borrarOp(o) {
    const n = objetosDe(plan(), o.id).length, f = descendientes(plan(), o.id).length - 1;
    const v = await preguntar({
      titulo: `¿Borrar «${o.nombre}»?`,
      texto: `${f ? `Tiene ${f} fase${f > 1 ? 's' : ''} dentro y ` : 'Tiene '}${n} objeto${n === 1 ? '' : 's'}.`,
      opciones: [
        { v: 'paquete', texto: 'Borrar solo la operación', detalle: 'Sus objetos se quedan en el mapa (pasan al nivel de arriba)' },
        { v: 'todo', texto: 'Borrar con sus objetos', detalle: 'Desaparece todo lo que hay dentro', clase: 'peligro' },
        { v: 'cancelar', texto: 'Cancelar' },
      ],
    });
    if (!v) return;
    cambio(`Borrar «${o.nombre}»`, (p) => borrarPaquete(p, o.id, { conObjetos: v === 'todo' }));
    dibujo.avisoBreve(`«${o.nombre}» borrada. Ctrl+Z para recuperarla.`);
  }
  function menu(boton, o) {
    const raiz = !o.padre;
    const estados = Object.entries(ESTADOS_OP).filter(([k]) => raiz && k !== (o.estado ?? 'curso'));
    abrirMenu(boton, `<div class="om-tit">${esc(o.nombre)}</div>
      <button type="button" data-v="activar">● Pintar aquí</button>
      <button type="button" data-v="solo">${dibujo.vista.solo === o.id ? 'Dejar de ver solo esta' : 'Ver solo esta'}</button>
      <button type="button" data-v="encuadrar">Encuadrar en el mapa</button>
      <button type="button" data-v="objetos">Ver sus objetos en Objetos</button>
      <div class="om-sep"></div>
      <button type="button" data-v="fase">+ Fase, salto… dentro</button>
      <button type="button" data-v="renombrar">Cambiar el nombre…</button>
      ${estados.map(([k, e]) => `<button type="button" data-v="estado:${k}">Pasar a ${e.nombre.toLowerCase()}</button>`).join('')}
      ${raiz ? '' : '<button type="button" data-v="subir">Sacar al primer nivel</button>'}
      <button type="button" data-v="duplicar">Duplicar</button>
      <button type="button" data-v="exportar">Exportar o enviar…</button>
      <div class="om-sep"></div>
      <button type="button" data-v="borrar" class="peligro">Borrar…</button>`, async (v) => {
      if (v === 'activar') dibujo.ponerActivo(o.id);
      if (v === 'solo') dibujo.ponerVista({ solo: dibujo.vista.solo === o.id ? null : o.id, ocultos: dibujo.vista.ocultos.filter((x) => !descendientes(plan(), o.id).includes(x) && !nombreRutaIds(o.id).includes(x)) });
      if (v === 'encuadrar') dibujo.encuadrar(objetosDe(plan(), o.id).map((e) => e.id));
      if (v === 'objetos') verEnObjetos(o.id);
      if (v === 'fase') {
        const r = await preguntar({ titulo: `Nueva dentro de «${o.nombre}»`, texto: 'Ponle el nombre que quieras: Fase 1, Salto 2, Reserva…', campo: { ayuda: 'Nombre' }, opciones: [{ v: 'crear', texto: 'Crear', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] });
        if (r) crear(r.texto || `Fase ${hijos(plan(), o.id).length + 1}`, { padre: o.id });
      }
      if (v === 'renombrar') renombrar(o);
      if (v?.startsWith('estado:')) { const k = v.slice(7); cambio(`Pasar a ${ESTADOS_OP[k].nombre.toLowerCase()}`, () => { o.estado = k; tocarPaquete(o); }); dibujo.avisoBreve(`«${o.nombre}» está ahora en ${ESTADOS_OP[k].nombre}.`); }
      if (v === 'subir') cambio('Sacar al primer nivel', (p) => moverPaquete(p, o.id, null));
      if (v === 'duplicar') cambio(`Duplicar «${o.nombre}»`, (p) => duplicarPaquete(p, o.id));
      if (v === 'exportar') exportar(objetosDe(plan(), o.id).map((e) => e.id), o.nombre);
      if (v === 'borrar') borrarOp(o);
    });
  }
  const nombreRutaIds = (id) => { const out = []; for (let x = buscarPaquete(plan(), id); x && !out.includes(x.id); x = buscarPaquete(plan(), x.padre)) out.push(x.id); return out; };

  cuerpo.addEventListener('click', (ev) => {
    const t = ev.target;
    const pest = t.closest('[data-pestana]');
    if (pest) { ui.pestana = pest.dataset.pestana; guardarUi(); pintar(); return; }
    const fila = t.closest('.obj-fila');
    if (fila) { dibujo.seleccionar(fila.dataset.el, { centrar: true }); return; }
    const acc = t.closest('[data-acc]')?.dataset.acc; if (!acc) return;
    if (acc === 'ver-todo') { dibujo.ponerVista({ ocultos: [], solo: null, sueltosOcultos: false }); return; }
    if (acc === 'ocultar-todo') { dibujo.ponerVista({ ocultos: hijos(plan(), null).map((o) => o.id), solo: null, sueltosOcultos: true }); dibujo.avisoBreve('Mapa sin símbolos. «Ver todo» los vuelve a mostrar.'); return; }
    const n = t.closest('.op-nodo'); if (!n) return;
    const id = n.dataset.op || null, o = id ? buscarPaquete(plan(), id) : null;
    if (acc === 'abrir') { const k = id ?? '__sueltos'; ui.abiertos[k] = !ui.abiertos[k]; guardarUi(); pintar(); }
    if (acc === 'ojo') conmutarOjo(id);
    if (acc === 'activar') { dibujo.ponerActivo(id); if (id) { ui.abiertos[id] = true; guardarUi(); } dibujo.avisoBreve(id ? `Pintando en «${nombreRuta(plan(), id)}».` : 'Pintando sin operación.'); }
    if (acc === 'menu' && o) menu(t.closest('button'), o);
  });
  cuerpo.addEventListener('dblclick', (ev) => { const n = ev.target.closest('.op-nom'); const id = n?.closest('.op-nodo')?.dataset.op; if (id) renombrar(buscarPaquete(plan(), id)); });
  cuerpo.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'op-nueva') return;
    ev.preventDefault();
    const nombre = $('op-nueva-nombre').value.trim();
    crear(nombre || `Operación ${paquetes(plan()).filter((o) => !o.padre).length + 1}`);
  });

  // ---------------------------------------------------------- arrastrar entre paquetes
  let arrastre = null; // { tipo: 'el'|'op', id }
  cuerpo.addEventListener('dragstart', (ev) => {
    const f = ev.target.closest('.obj-fila[data-el]'), n = ev.target.closest('.op-nodo[data-op]');
    if (f) arrastre = { tipo: 'el', id: f.dataset.el }; else if (n?.dataset.op) arrastre = { tipo: 'op', id: n.dataset.op }; else return;
    ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', arrastre.id);
  });
  cuerpo.addEventListener('dragover', (ev) => {
    if (!arrastre) return;
    const n = ev.target.closest('.op-nodo'); if (!n) return;
    const destino = n.dataset.op || null;
    if (arrastre.tipo === 'op' && destino && descendientes(plan(), arrastre.id).includes(destino)) return;
    ev.preventDefault();
    cuerpo.querySelectorAll('.soltar').forEach((x) => x !== n && x.classList.remove('soltar'));
    n.classList.add('soltar');
  });
  cuerpo.addEventListener('dragleave', (ev) => { ev.target.closest?.('.op-nodo')?.classList.remove('soltar'); });
  cuerpo.addEventListener('drop', (ev) => {
    const n = ev.target.closest('.op-nodo'); const a = arrastre; arrastre = null;
    cuerpo.querySelectorAll('.soltar').forEach((x) => x.classList.remove('soltar'));
    if (!n || !a) return;
    ev.preventDefault();
    const destino = n.dataset.op || null, o = destino ? buscarPaquete(plan(), destino) : null;
    if (a.tipo === 'el') { cambio(o ? `Meter en «${o.nombre}»` : 'Sacar de la operación', (p) => asignar(p, [a.id], destino)); if (destino) { ui.abiertos[destino] = true; guardarUi(); } }
    else if (a.id !== destino) { cambio(o ? `Meter «${buscarPaquete(plan(), a.id)?.nombre}» en «${o.nombre}»` : 'Sacar al primer nivel', (p) => moverPaquete(p, a.id, destino)); if (destino) { ui.abiertos[destino] = true; guardarUi(); } }
  });
  cuerpo.addEventListener('dragend', () => { arrastre = null; cuerpo.querySelectorAll('.soltar').forEach((x) => x.classList.remove('soltar')); });

  dibujo.suscribir(pintar);
  return {
    abrir(si) { panel.hidden = !si; if (si) pintar(); alCambiarPaneles(); },
    get abierto() { return !panel.hidden; },
    pintar, crear,
    /** Pestaña donde está una operación (al abrir un paquete recibido, etc.). */
    mostrar(id) { const r = nombreRutaIds(id).at(-1); const o = buscarPaquete(plan(), r); if (o) { ui.pestana = o.estado ?? 'curso'; ui.abiertos[o.id] = true; guardarUi(); } this.abrir(true); },
  };
}
