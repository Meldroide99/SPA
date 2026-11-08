// Editor de OPORD (y de sus anexos), unido a una operación.
//
// - La OPORD vive en el plan (plan.documentos), dentro de su operación; los
//   anexos son documentos aparte, enlazados con ella.
// - Todo es editable en el sitio: textos, títulos, tablas, organización
//   operativa (lista que se construye con Intro y Tab, y su organigrama),
//   matriz de misiones por fases, formularios de los anexos…
// - «Concepto»: la ventana se encoge y el mapa enseña la operación (o la fase
//   elegida, con lo que es «vigente en todas las fases»). Lo que se dibuje
//   entra en esa fase.
// - Cada cambio queda apuntado con su autor (documento.js), listo para
//   mandarlo a otros usuarios cuando haya servidor.

import { PLANTILLAS, ANEXOS, CLASIFICACIONES, RELACIONES, TABLAS } from '../opord/plantillas.js';
import {
  agregacionesAuto, anadirNodo, anadirRepetido, cambiarPlantilla, conContenido, crearAnexo, crearOpordCompleta, deshacer, editar, enlazarAnexo, esGdh, fasesDe, gdh, hijasDe, htmlALineas, letraAnexo, limpiarHtml, moverNodo, nodosVivos, normalizarGdh, numerar, padreDe, porClave, quitarNodo, recorrer, sincronizarFases, titulo, tituloDocumento, tituloFase, tocar, unidadesManiobra, uuid,
} from '../opord/documento.js';

const D = { agregacionesAuto, anadirNodo, anadirRepetido, cambiarPlantilla, conContenido, crearAnexo, crearOpordCompleta, deshacer, editar, enlazarAnexo, esGdh, fasesDe, gdh, hijasDe, htmlALineas, letraAnexo, limpiarHtml, moverNodo, nodosVivos, normalizarGdh, numerar, padreDe, porClave, quitarNodo, recorrer, sincronizarFases, titulo, tituloDocumento, tituloFase, tocar, unidadesManiobra, uuid };
import { archivosOpord, zipDe, baseArchivo, bloques as bloquesDoc, aPdf, aDocx } from '../opord/exportar.js';
import { crearVista } from './vista-opord.js';
import {
  hijos, buscarPaquete, nuevoPaquete, tocarPaquete, objetosDe, crearPaqueteSpa, documentos, paquetes, descendientes,
} from '../plan/operaciones.js';
import { geoAMgrs } from '../geo/index.js';
import { preguntar } from './dialogo.js';
import { abrirMenu } from './objetos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CLAVE_UI = 'spa.opord.ui';
const ICONO_MAPA = '<svg viewBox="0 0 24 24"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/></svg>';
const ICONO_DOC = '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 12h6M10 15.5h6M10 19h4"/></svg>';
const ICONO_EXP = '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>';

export function iniciarOpord({ L, mapa, dibujo, lazo, alCambiarPaneles = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel-opord'), hoja = $('opord-hoja'), indice = $('opord-indice');
  const plan = () => dibujo.plan();
  let ui = { idioma: null, autor: '', vista: true, exp: { docs: ['pdf', 'docx'], concepto: ['zip', 'spa'], zip: true } };
  try { ui = { ...ui, ...JSON.parse(localStorage.getItem(CLAVE_UI) || '{}') }; } catch { /* nada */ }
  const guardarUi = () => { try { localStorage.setItem(CLAVE_UI, JSON.stringify(ui)); } catch { /* nada */ } };
  const autor = () => ui.autor || 'Yo';
  let st = { op: null, doc: null, fase: null, concepto: false, vistaAntes: null, activoAntes: null, sucio: false };
  const pila = [], rehechos = []; // cambios propios (para deshacer)

  // ---------------------------------------------------------- datos
  const docs = () => documentos(plan());
  const opordDe = (opId) => docs().find((d) => d.tipo === 'opord' && d.operacion === opId) ?? null;
  const porId = (id) => docs().find((d) => d.id === id) ?? null;
  const opord = () => opordDe(st.op);
  const actual = () => porId(st.doc) ?? opord();
  const anexos = (o = opord()) => (o?.anexos ?? []).map(porId).filter(Boolean);
  const fases = () => D.fasesDe(paquetes(plan()), st.op);
  const idi = () => (actual()?.idioma === 'en' ? 'en' : 'es');
  const permanentes = () => (st.op ? objetosDe(plan(), st.op).filter((e) => e.propiedades?.permanente) : []);
  let tGuardar = 0;
  const guardarPronto = () => { clearTimeout(tGuardar); tGuardar = setTimeout(() => dibujo.guardar(), 350); vistaPronto(); };

  // ---------------------------------------------------------- el documento al lado (como en S1)
  const vista = crearVista($('opord-vista-hojas'), { alPinchar: (id) => irAlApartado(id) });
  let tVista = 0;
  function vistaPronto(ms = 120) { clearTimeout(tVista); tVista = setTimeout(pintarVista, ms); }
  function contexto(op) { return { anexos: anexos(op), opord: op, paquetes: paquetes(plan()), permanentes: permanentes().map((e) => ({ nombre: dibujo.titulo(e) })) }; }
  function pintarVista() {
    if (panel.hidden || !ui.vista || st.concepto) return;
    const d = actual(); if (!d) return;
    const op = opord();
    const en = d.idioma === 'en';
    const n = vista.pintar(bloquesDoc(d, contexto(op)), { titulo: D.tituloDocumento(d, op), pagina: en ? 'Page' : 'Página', de: en ? 'of' : 'de' });
    $('ov-paginas').textContent = `${n} ${n === 1 ? 'página' : 'páginas'}`;
    const luz = panel.querySelector('.ov-luz'); luz.classList.remove('latido'); void luz.offsetWidth; luz.classList.add('latido');
  }
  /** Pinchar en la hoja: lleva a ese apartado en el formulario y deja escribir. */
  function irAlApartado(id) {
    const s = hoja.querySelector(`.op-sec[data-id="${id}"]`); if (!s) return;
    s.scrollIntoView({ block: 'center', behavior: 'smooth' });
    s.classList.remove('destello'); void s.offsetWidth; s.classList.add('destello');
    const campo = s.querySelector(':scope > .op-sec-cuerpo :is(.op-texto, textarea, input, select)');
    campo?.focus({ preventScroll: true });
  }
  function ponerVista(si) {
    ui.vista = si; guardarUi();
    $('opord-vista-btn').setAttribute('aria-pressed', String(si));
    panel.classList.toggle('con-vista', si);
    if (si) vistaPronto(0);
    alCambiarPaneles();
  }

  /** Cambio propio: queda en el registro del documento, se puede deshacer y se guarda. */
  function editar(doc, nodo, campo, valor) {
    const cb = D.editar(doc, nodo, campo, valor, autor());
    if (cb) { pila.push({ doc: doc.id, cbs: [cb] }); rehechos.length = 0; guardarPronto(); }
    return cb;
  }
  function deshacerOpord() {
    const g = pila.pop(); if (!g) { avisar('Nada que deshacer'); return; }
    const d = porId(g.doc); if (!d) return;
    const vueltas = g.cbs.slice().reverse().map((cb) => D.deshacer(d, cb, autor())).filter(Boolean);
    rehechos.push({ doc: d.id, cbs: vueltas, originales: g.cbs });
    guardarPronto(); pintar();
  }
  function rehacerOpord() {
    const g = rehechos.pop(); if (!g) return;
    const d = porId(g.doc); if (!d) return;
    const cbs = g.originales.map((cb) => (cb.c === '+nodo' ? D.editar(d, cb.v.id, 'quitado', null, autor()) : D.editar(d, cb.n, cb.c, cb.v, autor()))).filter(Boolean);
    pila.push({ doc: d.id, cbs }); guardarPronto(); pintar();
  }

  // ---------------------------------------------------------- abrir y crear
  async function crearPara(opId) {
    const o = buscarPaquete(plan(), opId); if (!o) return null;
    const r = await preguntar({
      titulo: `OPORD de «${o.nombre}»`,
      html: `<div class="dlg-opord"><div class="seg dlg-idioma" id="dlg-idioma"><button type="button" data-v="es" aria-pressed="${(ui.idioma ?? 'es') === 'es'}">Español</button><button type="button" data-v="en" aria-pressed="${ui.idioma === 'en'}">English</button></div></div>`,
      opciones: [
        ...Object.values(PLANTILLAS).map((p) => ({ v: p.id, texto: p.nombre, detalle: p.origen })),
        { v: 'cancelar', texto: 'Cancelar' },
      ],
    });
    if (!r) return null;
    const idioma = document.querySelector('#dlg-idioma [aria-pressed="true"]')?.dataset.v ?? 'es';
    ui.idioma = idioma; guardarUi();
    const { opord: d, anexos: as } = D.crearOpordCompleta(r, { operacion: opId, nombre: o.nombre, autor: autor(), idioma });
    D.sincronizarFases(d, paquetes(plan()));
    docs().push(d, ...as);
    dibujo.guardar();
    return d;
  }
  // El selector de idioma del diálogo
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#dlg-idioma button'); if (!b) return;
    b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  async function abrir(opId, { doc = null } = {}) {
    const o = buscarPaquete(plan(), opId); if (!o) return;
    const raizId = o.padre ? descendientesInverso(opId) : opId;
    let d = opordDe(raizId);
    if (!d) { d = await crearPara(raizId); if (!d) return; }
    st = { ...st, op: raizId, doc: doc ?? d.id, fase: o.padre ? opId : st.op === raizId ? st.fase : null };
    if (D.sincronizarFases(d, paquetes(plan()))) guardarPronto();
    panel.hidden = false;
    pintar();
    alCambiarPaneles();
  }
  const descendientesInverso = (id) => { let o = buscarPaquete(plan(), id); while (o?.padre) o = buscarPaquete(plan(), o.padre); return o?.id ?? id; };
  function cerrar() {
    if (st.concepto) ponerConcepto(false);
    panel.hidden = true; alCambiarPaneles();
  }

  // ---------------------------------------------------------- pintar
  function pintar(forzar = false) {
    const d = actual(); if (!d || panel.hidden) return;
    // No se repinta mientras se escribe (se perdería el cursor): se hace al salir del campo
    if (escribiendo() && !forzar) { st.sucio = true; return; }
    st.sucio = false;
    const op = opord();
    if (op && D.sincronizarFases(op, paquetes(plan()))) guardarPronto();
    $('opord-tit').textContent = D.tituloDocumento(d, op);
    $('opord-sub').textContent = d.tipo === 'opord' ? PLANTILLAS[d.plantilla]?.nivel ?? '' : 'Anexo';
    pintarDocs(); pintarFases();
    panel.classList.toggle('en-concepto', st.concepto);
    $('opord-concepto').setAttribute('aria-pressed', String(st.concepto));
    const scroll = hoja.scrollTop;
    hoja.innerHTML = st.concepto ? htmlConcepto(d) : htmlDocumento(d);
    pintarIndice(d);
    panel.classList.toggle('con-vista', ui.vista);
    vistaPronto(40);
    hoja.scrollTop = scroll;
    autoAltura(hoja);
  }
  const escribiendo = () => { const a = document.activeElement; return Boolean(a && panel.contains(a) && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))); };
  panel.addEventListener('focusout', () => setTimeout(() => { if (st.sucio && !escribiendo()) pintar(); }, 0));

  function pintarDocs() {
    const op = opord(); if (!op) return;
    const lista = [op, ...anexos(op)];
    $('opord-docs').innerHTML = lista.map((x) => `<button type="button" data-doc="${x.id}" aria-pressed="${x.id === actual()?.id}" title="${esc(D.tituloDocumento(x, op))}">${x.tipo === 'opord' ? 'OPORD' : `${D.letraAnexo(op, x.id)} · ${esc(x.cabecera.titulo || ANEXOS[x.plantilla]?.nombre || 'Anexo')}`}</button>`).join('')
      + '<button type="button" class="opord-mas-anexo" data-acc="anexo-nuevo" aria-label="Añadir anexo" title="Añadir anexo">+</button>';
  }
  function pintarFases() {
    const fs = fases();
    $('opord-fases').innerHTML = `<button type="button" data-fase="" aria-pressed="${!st.fase}">Todas</button>${fs.map((f) => `<button type="button" data-fase="${f.id}" aria-pressed="${st.fase === f.id}" title="${esc(f.nombre)}${f.inicio ? ` · ${esc(f.inicio)}` : ''}">${esc(D.tituloFase(f, idi(), { corto: true }))}</button>`).join('')}`;
    $('opord-fases').hidden = !fs.length;
  }
  function pintarIndice(d) {
    if (st.concepto) { indice.innerHTML = ''; return; }
    const num = D.numerar(d);
    const out = [];
    D.recorrer(d, (n) => {
      if (n.plano) return;
      const r = num.get(n.id); if (!r) return;
      out.push(`<a href="#sec-${n.id}" data-ir="${n.id}" style="--n:${r.nivel}" class="${D.conContenido(n) ? 'lleno' : ''}"><span>${esc(r.rotulo)}</span>${esc(tituloNodo(d, n))}</a>`);
    });
    indice.innerHTML = out.join('');
  }
  const tituloNodo = (d, n) => {
    if (n.fase) { const f = fases().find((x) => x.id === n.fase); return f ? D.tituloFase(f, d.idioma === 'en' ? 'en' : 'es') : (n.titulo || 'Fase eliminada'); }
    return D.titulo(n, d.idioma === 'en' ? 'en' : 'es') || (d.idioma === 'en' ? 'Untitled' : 'Sin título');
  };

  // ---------------------------------------------------------- documento
  function htmlDocumento(d) {
    const num = D.numerar(d);
    let html = htmlCabecera(d);
    const rec = (ids, nivel) => {
      let s = '';
      for (const id of ids) {
        const n = d.nodos[id]; if (!n || n.quitado) continue;
        if (n.plano) { s += rec(n.hijos, nivel) + (n.tipo === 'fases' ? `<div class="op-fases-pie" style="--n:${nivel}"><button type="button" data-acc="nueva-fase">+ Fase</button></div>` : ''); continue; }
        s += htmlSeccion(d, n, num.get(n.id) ?? { rotulo: '', nivel }, () => rec(n.hijos, nivel + 1));
      }
      return s;
    };
    html += rec(d.raiz, 0);
    return html;
  }

  function htmlCabecera(d) {
    const c = d.cabecera;
    const sel = (campo, opciones, valor) => `<select data-cab="${campo}">${opciones.map((o) => `<option ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}${opciones.includes(valor) || !valor ? '' : `<option selected>${esc(valor)}</option>`}</select>`;
    if (d.tipo === 'anexo') {
      const op = opord();
      return `<div class="op-cab op-cab-anexo">
        <label class="op-c-ancho"><span>Título del anexo</span><input data-cab="titulo" value="${esc(c.titulo)}" placeholder="${esc(ANEXOS[d.plantilla]?.[idi()] ?? '')}"></label>
        <label><span>Clasificación</span>${sel('clasificacion', CLASIFICACIONES, c.clasificacion)}</label>
        ${op ? `<button type="button" class="op-volver" data-doc="${op.id}">↩ ${esc(D.tituloDocumento(op))}</button>` : ''}
        <button type="button" class="op-quitar-anexo peligro" data-acc="quitar-anexo">Quitar el anexo</button></div>`;
    }
    const campo = (k, et, extra = '') => `<label><span>${et}</span><input data-cab="${k}" value="${esc(c[k])}" ${extra}></label>`;
    return `<div class="op-cab">
      <label><span>Clasificación</span>${sel('clasificacion', CLASIFICACIONES, c.clasificacion)}</label>
      ${campo('numero', 'N.º de la orden', 'placeholder="01"')}
      ${campo('nombre', 'Nombre de la operación')}
      ${campo('emisor', 'Cuartel general', 'placeholder="6 BLB PC principal"')}
      <label class="op-c-ejemplar"><span>Ejemplar</span><span class="op-c-par"><input data-cab="copia" value="${esc(c.copia)}" placeholder="1" inputmode="numeric"> de <input data-cab="deCopias" value="${esc(c.deCopias)}" placeholder="12" inputmode="numeric"></span></label>
      ${campo('lugar', 'Lugar')}
      <label><span>GDH de la orden</span><span class="op-c-par"><input data-cab="gdh" class="op-gdh ${c.gdh && !D.esGdh(c.gdh) ? 'mal' : ''}" value="${esc(c.gdh)}" placeholder="290930Z APR 26"><button type="button" class="op-ahora" data-acc="gdh-ahora" title="Ahora">Ahora</button></span></label>
      <label><span>Huso horario</span>${sel('huso', ['Z', 'A', 'B', 'C'], c.huso || 'Z')}</label>
      ${campo('referencia', 'Ref. del mensaje', 'placeholder="pcp.blb6"')}
      <label class="op-c-ancho"><span>Referencias</span><input data-cab="referencias" value="${esc(c.referencias)}" placeholder="Mapas y documentos"></label>
    </div>`;
  }

  function htmlSeccion(d, n, r, hijosHtml) {
    const nivel = r.nivel ?? 0;
    const en = d.idioma === 'en' ? 'en' : 'es';
    const f = n.fase ? fases().find((x) => x.id === n.fase) : null;
    const tit = tituloNodo(d, n);
    const editable = n.propio || n.fase;
    const selFase = n.fase && st.fase === n.fase ? ' fase-sel' : '';
    let cab = `<div class="op-sec-cab"><span class="op-rot">${esc(r.rotulo)}</span><span class="op-tit${n.titulo ? ' renombrado' : ''}" data-campo="titulo" ${editable ? 'contenteditable="true" spellcheck="false"' : ''}>${esc(f ? f.nombre : tit)}</span>`;
    if (f) cab = `<div class="op-sec-cab"><span class="op-rot">${esc(r.rotulo)}</span><span class="op-fase-pre">${en === 'en' ? 'Step' : 'Fase'} ${f.i}:</span><span class="op-tit" data-campo="fase-nombre" contenteditable="true" spellcheck="false">${esc(f.nombre)}</span>
      <span class="op-dtg"><input data-fase-campo="inicio" data-fase="${f.id}" class="op-gdh ${f.inicio && !D.esGdh(f.inicio) ? 'mal' : ''}" value="${esc(f.inicio)}" placeholder="Inicio (GDH)"><i>–</i><input data-fase-campo="fin" data-fase="${f.id}" class="op-gdh ${f.fin && !D.esGdh(f.fin) ? 'mal' : ''}" value="${esc(f.fin)}" placeholder="Fin (GDH)"></span>
      <button type="button" class="op-ver-fase" data-acc="ver-fase" data-fase="${f.id}" title="Ver y editar en el mapa">${ICONO_MAPA}</button>`;
    cab += `<button type="button" class="op-sec-menu" data-acc="menu" aria-label="Opciones del apartado">⋯</button></div>`;
    let cuerpo = '';
    if (n.huerfano) cuerpo += '<p class="op-nota">Esta fase ya no existe en la operación. Lo escrito se conserva.</p>';
    if (n.intro) cuerpo += `<p class="op-intro">${esc(n.intro[en] ?? n.intro.es)}</p>`;
    const conTexto = n.texto != null && !['org', 'matriz', 'matrizFases', 'permanentes', 'anexos', 'firma', 'agregaciones'].includes(n.tipo);
    if (conTexto || D.htmlALineas(n.texto).length) cuerpo += `<div class="op-texto" contenteditable="true" data-campo="texto" data-ph="Escribe aquí">${n.texto ?? ''}</div>`;
    if (n.tipo === 'org') cuerpo += htmlOrg(d, n);
    if (n.tipo === 'agregaciones') cuerpo += htmlAgregaciones(d, n);
    else if (n.tabla) cuerpo += htmlTabla(d, n);
    if (n.tipo === 'matriz') cuerpo += htmlMatriz(d, n);
    if (n.tipo === 'matrizFases') cuerpo += htmlMatrizFases(d, n);
    if (n.tipo === 'permanentes') cuerpo += htmlPermanentes();
    if (n.tipo === 'anexos') cuerpo += htmlListaAnexos(d);
    if (n.tipo === 'firma') cuerpo += htmlFirma(n);
    if (n.tipo === 'formulario') cuerpo += htmlFormulario(d, n);
    if (n.enlaces?.length) cuerpo += `<div class="op-enlaces">${n.enlaces.map(porId).filter(Boolean).map((a) => `<button type="button" class="op-enlace" data-doc="${a.id}">→ ${esc(D.tituloDocumento(a, opord()).replace(/ TO OPORD .*? — | A LA OPORD .*? — /, ' — '))}</button>`).join('')}</div>`;
    if (n.repetible) cuerpo += `<button type="button" class="op-mas-rep" data-acc="repetir">+ ${esc((n.repetible[en] ?? n.repetible.es).replace('{n}', D.nodosVivos(d, n.hijos).length + 1))}</button>`;
    return `<section class="op-sec${selFase}${n.huerfano ? ' huerfano' : ''}" id="sec-${n.id}" data-id="${n.id}" style="--n:${nivel}">${cab}<div class="op-sec-cuerpo">${cuerpo}</div>${hijosHtml()}</section>`;
  }

  // ---------------------------------------------------------- piezas
  const area = (valor, attrs = '', ph = '') => `<textarea rows="1" ${attrs} placeholder="${esc(ph)}">${esc(valor ?? '')}</textarea>`;
  function celda(d, n, c, f, i) {
    const v = f.c?.[c.k];
    const ruta = `tabla.filas.${i}.c.${c.k}`;
    if (f.fija && c === n.tabla.cols[0]) return `<td class="op-fija">${esc(typeof v === 'object' ? v?.[idi()] ?? v?.es : v)}</td>`;
    if (c.campo === 'gdh') return `<td><input class="op-gdh ${v && !D.esGdh(v) ? 'mal' : ''}" data-ruta="${ruta}" value="${esc(v)}" placeholder="DDHHMMZ MMM AA"></td>`;
    if (c.campo === 'numero') return `<td><input type="number" min="0" class="op-num" data-ruta="${ruta}" value="${esc(v)}"></td>`;
    if (c.campo === 'mgrs') return `<td><span class="op-mgrs"><input data-ruta="${ruta}" value="${esc(v)}" placeholder="MGRS"><button type="button" data-acc="elegir-mgrs" data-ruta="${ruta}" title="Elegir en el mapa">⌖</button></span></td>`;
    if (c.campo === 'fase') return `<td><select data-ruta="${ruta}"><option value=""></option>${fases().map((x) => `<option value="${esc(D.tituloFase(x, idi(), { corto: true }))}" ${v === D.tituloFase(x, idi(), { corto: true }) ? 'selected' : ''}>${esc(D.tituloFase(x, idi(), { corto: true }))} · ${esc(x.nombre)}</option>`).join('')}</select></td>`;
    if (c.campo === 'relacion') return `<td><select data-ruta="${ruta}"><option value=""></option>${RELACIONES.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select></td>`;
    return `<td>${area(v, `data-ruta="${ruta}"`)}</td>`;
  }
  function htmlTabla(d, n) {
    const t = n.tabla; const en = idi();
    const libre = n.propio && !TABLAS[t.origen];
    const nums = t.cols.map((c) => c.campo === 'numero');
    const previo = t.previo ? `<div class="op-form op-form-fila">${t.previo.map((cp) => `<label><span>${esc(cp[en] ?? cp.es)}</span><input type="number" min="0" data-ruta="tabla.valoresPrevio.${cp.k}" value="${esc(t.valoresPrevio?.[cp.k])}"></label>`).join('')}</div>` : '';
    const total = (f) => { const vs = t.cols.map((c, i) => (nums[i] ? f.c?.[c.k] : null)).filter((v) => v !== null && v !== undefined && v !== ''); return vs.length ? vs.reduce((s, v) => s + (Number(v) || 0), 0) : ''; };
    const filasTot = t.totales ? `<tr class="op-total"><td>TOTAL</td>${t.cols.slice(1).map((c, j) => { const i = j + 1; if (!nums[i]) return '<td></td>'; const vs = t.filas.map((f) => f.c?.[c.k]).filter((v) => v !== undefined && v !== ''); return `<td>${vs.length ? vs.reduce((s, v) => s + (Number(v) || 0), 0) : ''}</td>`; }).join('')}<td>${t.filas.some((f) => total(f) !== '') ? t.filas.reduce((s, f) => s + (Number(total(f)) || 0), 0) : ''}</td><td></td></tr>` : '';
    return `${previo}<div class="op-tabla-caja"><table class="op-tabla" data-nodo="${n.id}"><thead><tr>${t.cols.map((c, i) => `<th ${libre ? `contenteditable="true" data-col-tit="${i}"` : ''}>${esc(c[en] ?? c.es)}</th>`).join('')}${t.totales ? '<th>TOTAL</th>' : ''}<th class="op-t-acc"></th></tr></thead>
      <tbody>${t.filas.map((f, i) => `<tr data-fila="${i}">${t.cols.map((c) => celda(d, n, c, f, i)).join('')}${t.totales ? `<td class="op-fija op-num-tot">${total(f)}</td>` : ''}<td class="op-t-acc">${f.fija ? '' : '<button type="button" data-acc="quitar-fila" title="Quitar la fila">×</button>'}</td></tr>`).join('')}${filasTot}</tbody></table>
      ${t.filas.some((f) => f.fija) ? '' : `<div class="op-t-pie"><button type="button" data-acc="fila">+ Fila</button>${libre ? '<button type="button" data-acc="columna">+ Columna</button>' : ''}</div>`}</div>`;
  }

  // Organización operativa: lista (Intro = otra unidad, Tab = dentro de la anterior) y organigrama
  function htmlOrg(d, n) {
    const us = n.org.unidades;
    const prof = (u) => { let k = 0, x = u; while (x?.padre) { x = us.find((y) => y.id === x.padre); k++; if (k > 12) break; } return k; };
    const orden = [];
    const rec = (padre) => { for (const u of D.hijasDe(us, padre)) { orden.push(u); rec(u.id); } };
    rec(null);
    const maniobra = new Set(D.unidadesManiobra(d).map((u) => u.id));
    const raices = D.hijasDe(us, null);
    const nivelManiobra = (u) => (raices.length === 1 ? u.padre === raices[0].id : !u.padre);
    const filas = orden.map((u) => `<div class="op-org-u" data-u="${u.id}" style="--p:${prof(u)}">
        <input class="op-org-nom" data-u-campo="nombre" value="${esc(u.nombre)}" placeholder="Unidad" spellcheck="false">
        <select data-u-campo="relacion" title="Relación de mando"><option value="">Orgánica</option>${RELACIONES.map((x) => `<option ${x === u.relacion ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <input class="op-org-de" data-u-campo="de" value="${esc(u.de)}" placeholder="Cedida por" title="Unidad que la cede (sale en «Agregaciones»)">
        ${nivelManiobra(u) ? `<label class="op-org-mat" title="Fila en la matriz de misiones"><input type="checkbox" data-u-campo="enMatriz" ${u.enMatriz === false ? '' : 'checked'}>Matriz</label>` : '<span class="op-org-mat"></span>'}
        <button type="button" data-acc="u-sub" title="Subunidad">+</button><button type="button" data-acc="u-quitar" title="Quitar">×</button></div>`).join('');
    const arbol = (padre) => { const hs = D.hijasDe(us, padre); return hs.length ? `<ul>${hs.map((u) => `<li><span class="op-org-caja${maniobra.has(u.id) ? ' maniobra' : ''}"><b>${esc(u.nombre || '—')}</b>${u.relacion || u.de ? `<small>${esc([u.relacion, u.de ? `de ${u.de}` : ''].filter(Boolean).join(' · '))}</small>` : ''}</span>${arbol(u.id)}</li>`).join('')}</ul>` : ''; };
    return `<div class="op-org" data-nodo="${n.id}">
      <div class="op-org-lista">${filas || '<p class="op-vacio">Sin unidades todavía.</p>'}
        <div class="op-org-pie"><button type="button" data-acc="u-nueva">+ Unidad</button><button type="button" data-acc="u-mapa" title="Las unidades dibujadas en la operación">Desde el mapa</button></div></div>
      ${us.length ? `<div class="op-org-grafico">${arbol(null)}</div>` : ''}</div>`;
  }
  function htmlAgregaciones(d, n) {
    const auto = D.agregacionesAuto(d);
    const en = idi();
    const t = n.tabla;
    const autoFilas = auto.map((a) => `<tr class="op-auto" data-u="${a.id}">${t.cols.map((c) => {
      if (c.k === 'relacion') return `<td><select data-u-campo="relacion" data-u="${a.id}"><option value=""></option>${RELACIONES.map((x) => `<option ${x === a.c.relacion ? 'selected' : ''}>${x}</option>`).join('')}</select></td>`;
      if (c.k === 'inicio' || c.k === 'fin') return `<td><input class="op-gdh ${a.c[c.k] && !D.esGdh(a.c[c.k]) ? 'mal' : ''}" data-u-campo="${c.k}" data-u="${a.id}" value="${esc(a.c[c.k])}" placeholder="DDHHMMZ MMM AA"></td>`;
      if (c.k === 'a') return `<td class="op-fija">${esc(a.c.a)}</td>`;
      return `<td>${area(a.c[c.k], `data-u-campo="${c.k === 'unidad' ? 'nombre' : c.k}" data-u="${a.id}"`)}</td>`;
    }).join('')}<td class="op-t-acc"><span class="op-auto-et" title="Sale de la organización operativa">org.</span></td></tr>`).join('');
    return `<div class="op-tabla-caja"><table class="op-tabla" data-nodo="${n.id}"><thead><tr>${t.cols.map((c) => `<th>${esc(c[en] ?? c.es)}</th>`).join('')}<th class="op-t-acc"></th></tr></thead>
      <tbody>${autoFilas}${t.filas.map((f, i) => `<tr data-fila="${i}">${t.cols.map((c) => celda(d, n, c, f, i)).join('')}<td class="op-t-acc"><button type="button" data-acc="quitar-fila" title="Quitar la fila">×</button></td></tr>`).join('')}</tbody></table>
      <div class="op-t-pie"><button type="button" data-acc="fila">+ Fila</button></div></div>`;
  }
  function htmlMatriz(d, n) {
    const fs = fases();
    const us = [...D.unidadesManiobra(d).map((u) => ({ id: u.id, nombre: u.nombre, org: true })), ...(n.matriz.filas ?? [])];
    if (!fs.length) return '<div class="op-vacio">La operación aún no tiene fases. <button type="button" data-acc="nueva-fase">+ Fase</button></div>';
    const en = idi();
    return `<div class="op-tabla-caja op-matriz-caja"><table class="op-tabla op-matriz" data-nodo="${n.id}"><thead><tr><th>${en === 'en' ? 'Unit' : 'Unidad'}</th>${fs.map((f) => `<th class="${st.fase === f.id ? 'fase-sel' : ''}"><b>${esc(D.tituloFase(f, en, { corto: true }))}</b> ${esc(f.nombre)}${f.inicio || f.fin ? `<small>${esc([f.inicio, f.fin].filter(Boolean).join(' – '))}</small>` : ''}</th>`).join('')}<th>${en === 'en' ? 'BPT' : 'ECD'}</th><th class="op-t-acc"></th></tr></thead>
      <tbody>${us.map((u, i) => `<tr>${u.org ? `<td class="op-fija"><b>${esc(u.nombre)}</b></td>` : `<td>${area(u.nombre, `data-ruta="matriz.filas.${i - D.unidadesManiobra(d).length}.nombre"`, 'Unidad')}</td>`}${fs.map((f) => `<td class="${st.fase === f.id ? 'fase-sel' : ''}">${area(n.matriz.celdas?.[u.id]?.[f.id], `data-ruta="matriz.celdas.${u.id}.${f.id}"`)}</td>`).join('')}<td>${area(n.matriz.bpt?.[u.id], `data-ruta="matriz.bpt.${u.id}"`)}</td><td class="op-t-acc">${u.org ? '' : `<button type="button" data-acc="quitar-fila-matriz" data-i="${i - D.unidadesManiobra(d).length}" title="Quitar">×</button>`}</td></tr>`).join('')}</tbody></table>
      <div class="op-t-pie">${us.length ? '' : '<span class="op-nota">Las filas salen de la organización operativa.</span>'}<button type="button" data-acc="fila-matriz">+ Fila</button></div></div>`;
  }
  function htmlMatrizFases(d, n) {
    const fs = fases(); const en = idi();
    if (!fs.length) return '<div class="op-vacio">La operación aún no tiene fases. <button type="button" data-acc="nueva-fase">+ Fase</button></div>';
    const cab = n.matriz.cabecera?.[en] ?? (en === 'en' ? 'Element' : 'Elemento');
    return `<div class="op-tabla-caja"><table class="op-tabla" data-nodo="${n.id}"><thead><tr><th>${esc(cab)}</th>${fs.map((f) => `<th class="${st.fase === f.id ? 'fase-sel' : ''}"><b>${esc(D.tituloFase(f, en, { corto: true }))}</b> ${esc(f.nombre)}</th>`).join('')}<th class="op-t-acc"></th></tr></thead>
      <tbody>${(n.matriz.filas ?? []).map((fl, i) => `<tr><td>${area(fl.nombre, `data-ruta="matriz.filas.${i}.nombre"`)}</td>${fs.map((f) => `<td class="${st.fase === f.id ? 'fase-sel' : ''}">${area(n.matriz.celdas?.[fl.id]?.[f.id], `data-ruta="matriz.celdas.${fl.id}.${f.id}"`)}</td>`).join('')}<td class="op-t-acc"><button type="button" data-acc="quitar-fila-matriz" data-i="${i}" title="Quitar">×</button></td></tr>`).join('')}</tbody></table>
      <div class="op-t-pie"><button type="button" data-acc="fila-matriz">+ Fila</button></div></div>`;
  }
  function htmlPermanentes() {
    const ps = permanentes();
    return `<div class="op-perm">${ps.length ? `<ul>${ps.map((e) => `<li><button type="button" class="op-obj" data-obj="${e.id}">${esc(dibujo.titulo(e))}</button><button type="button" class="op-perm-x" data-acc="no-permanente" data-obj="${e.id}" title="Quitar de todas las fases">×</button></li>`).join('')}</ul>` : '<p class="op-vacio">Ninguno.</p>'}
      <button type="button" data-acc="elegir-permanentes">Elegir…</button></div>`;
  }
  function htmlListaAnexos(d) {
    const op = d.tipo === 'opord' ? d : opord();
    const as = anexos(op);
    return `<div class="op-anexos">${as.map((a) => `<button type="button" class="op-enlace" data-doc="${a.id}"><b>${D.letraAnexo(op, a.id)}</b> ${esc(a.cabecera.titulo || ANEXOS[a.plantilla]?.[idi()] || '')}</button>`).join('')}
      <button type="button" data-acc="anexo-nuevo">+ Anexo</button></div>`;
  }
  function htmlFirma(n) {
    const f = n.firma ?? {};
    return `<div class="op-form op-firma"><label><span>Jefe</span><input data-ruta="firma.jefe" value="${esc(f.jefe)}" placeholder="Nombre"></label><label><span>Empleo</span><input data-ruta="firma.empleo" value="${esc(f.empleo)}"></label><label><span>Cargo</span><input data-ruta="firma.cargo" value="${esc(f.cargo)}"></label></div>`;
  }
  function htmlFormulario(d, n) {
    const en = idi();
    return `<div class="op-form">${n.campos.map((cp) => {
      const v = n.valores?.[cp.k];
      const et = `<span>${esc(cp[en] ?? cp.es)}</span>`;
      if (cp.cuentas) return `<div class="op-f-campo">${et}<span class="op-cuentas">${cp.cuentas.map((o) => `<label title="${esc(o[en] ?? o.es)}"><i>${esc(o.k.toUpperCase())}</i><input type="number" min="0" data-ruta="valores.${cp.k}.${o.k}" value="${esc(v?.[o.k])}"></label>`).join('')}</span></div>`;
      if (cp.marcas) return `<div class="op-f-campo">${et}<span class="op-marcas">${cp.marcas.map((o) => `<label><input type="checkbox" data-ruta="valores.${cp.k}.${o.k}" ${v?.[o.k] ? 'checked' : ''}>${esc(o[en] ?? o.es)}</label>`).join('')}</span></div>`;
      if (cp.opciones) return `<div class="op-f-campo">${et}<span class="seg op-opciones" data-ruta="valores.${cp.k}">${cp.opciones.map((o) => `<button type="button" data-v="${esc(o.k)}" aria-pressed="${v === o.k}" title="${esc(o[en] ?? o.es)}">${esc(o[en] ?? o.es)}</button>`).join('')}</span></div>`;
      if (cp.campo === 'mgrs') return `<label class="op-f-campo">${et}<span class="op-mgrs"><input data-ruta="valores.${cp.k}" value="${esc(v)}" placeholder="MGRS"><button type="button" data-acc="elegir-mgrs" data-ruta="valores.${cp.k}" title="Elegir en el mapa">⌖</button></span></label>`;
      if (cp.campo === 'gdh') return `<label class="op-f-campo">${et}<input class="op-gdh ${v && !D.esGdh(v) ? 'mal' : ''}" data-ruta="valores.${cp.k}" value="${esc(v)}" placeholder="DDHHMMZ MMM AA"></label>`;
      if (cp.campo === 'numero') return `<label class="op-f-campo">${et}<input type="number" min="0" data-ruta="valores.${cp.k}" value="${esc(v)}"></label>`;
      return `<label class="op-f-campo${cp.largo ? ' largo' : ''}">${et}${area(v, `data-ruta="valores.${cp.k}"`)}</label>`;
    }).join('')}</div>`;
  }

  // ---------------------------------------------------------- concepto (vista compacta junto al mapa)
  function htmlConcepto(d) {
    const op = opord(); if (!op) return '';
    const en = op.idioma === 'en' ? 'en' : 'es';
    const f = fases().find((x) => x.id === st.fase);
    const activo = buscarPaquete(plan(), dibujo.activo);
    let s = `<div class="op-conc"><div class="op-conc-cab"><b>${f ? esc(D.tituloFase(f, en)) : esc(buscarPaquete(plan(), st.op)?.nombre ?? '')}</b>${activo ? `<span class="op-pintando">● ${esc(activo.nombre)}</span>` : ''}</div>`;
    if (f) {
      const n = Object.values(op.nodos).find((x) => x.fase === f.id && !x.quitado);
      if (n) s += `<div class="op-sec" data-id="${n.id}" data-doc-id="${op.id}"><div class="op-texto" contenteditable="true" data-campo="texto" data-ph="Concepto de esta fase">${n.texto ?? ''}</div></div>`;
      const m = D.porClave(op, 'ejec.misiones');
      const us = m ? [...D.unidadesManiobra(op), ...(m.matriz.filas ?? [])] : [];
      if (m && us.length) s += `<div class="op-sec" data-id="${m.id}" data-doc-id="${op.id}"><table class="op-tabla op-conc-tabla"><tbody>${us.map((u) => `<tr><td class="op-fija"><b>${esc(u.nombre)}</b></td><td>${area(m.matriz.celdas?.[u.id]?.[f.id], `data-ruta="matriz.celdas.${u.id}.${f.id}"`, 'Cometido')}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      const mi = D.porClave(op, 'mision'), de = D.porClave(op, 'ejec.maniobra.descripcion');
      for (const n of [mi, de].filter(Boolean)) s += `<div class="op-sec" data-id="${n.id}" data-doc-id="${op.id}"><h5>${esc(D.titulo(n, en))}</h5><div class="op-texto" contenteditable="true" data-campo="texto" data-ph="Escribe aquí">${n.texto ?? ''}</div></div>`;
    }
    const ps = permanentes();
    if (ps.length) s += `<div class="op-conc-perm"><small>${en === 'en' ? 'In force in all phases' : 'Vigentes en todas las fases'}</small>${ps.map((e) => `<button type="button" class="op-obj" data-obj="${e.id}">${esc(dibujo.titulo(e))}</button>`).join('')}</div>`;
    return `${s}</div>`;
  }
  function ponerConcepto(si) {
    if (si === st.concepto) return;
    st.concepto = si;
    if (si) {
      st.vistaAntes = JSON.parse(JSON.stringify(dibujo.vista)); st.activoAntes = dibujo.activo;
      aplicarConcepto(true);
    } else {
      if (st.vistaAntes) dibujo.ponerVista(st.vistaAntes);
      dibujo.ponerActivo(st.activoAntes);
      st.vistaAntes = null;
    }
    pintar(); alCambiarPaneles();
  }
  function aplicarConcepto(encuadrar = false) {
    if (!st.concepto) return;
    const id = st.fase || st.op;
    const sub = new Set([st.op, ...descendientes(plan(), st.op)]);
    dibujo.ponerVista({ solo: id, ocultos: dibujo.vista.ocultos.filter((x) => !sub.has(x)), sueltosOcultos: true });
    dibujo.ponerActivo(id);
    if (encuadrar) dibujo.encuadrar(objetosDe(plan(), st.op).map((e) => e.id));
  }

  // ---------------------------------------------------------- textos que crecen solos
  function autoAltura(raiz) { for (const t of raiz.querySelectorAll('textarea')) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }
  hoja.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; } });

  // ---------------------------------------------------------- escribir (con espera: se guarda al parar)
  const pendientes = new Map();
  function programar(clave, fn, ms = 450) { clearTimeout(pendientes.get(clave)?.t); const t = setTimeout(() => { pendientes.delete(clave); fn(); }, ms); pendientes.set(clave, { t, fn }); }
  function vaciarPendientes() { for (const [k, p] of pendientes) { clearTimeout(p.t); pendientes.delete(k); p.fn(); } }
  const docDe = (el) => porId(el.closest('[data-doc-id]')?.dataset.docId) ?? actual();
  const nodoDe = (el) => el.closest('[data-id]')?.dataset.id;

  hoja.addEventListener('input', (e) => {
    const el = e.target;
    const d = docDe(el); if (!d) return;
    // Cabecera
    if (el.dataset.cab) { const k = el.dataset.cab; programar(`cab.${k}`, () => { editar(d, '_cab', k, el.value.trim()); if (k === 'titulo' || k === 'numero' || k === 'nombre') { $('opord-tit').textContent = D.tituloDocumento(d, opord()); pintarDocs(); } }); if (el.classList.contains('op-gdh')) el.classList.toggle('mal', Boolean(el.value.trim()) && !D.esGdh(el.value)); return; }
    // Fechas de una fase (van en la operación)
    if (el.dataset.faseCampo) { el.classList.toggle('mal', Boolean(el.value.trim()) && !D.esGdh(el.value)); programar(`fase.${el.dataset.fase}.${el.dataset.faseCampo}`, () => ponerFase(el.dataset.fase, el.dataset.faseCampo, D.normalizarGdh(el.value))); return; }
    // Unidades (organización operativa y agregaciones)
    if (el.dataset.uCampo) { programar(`u.${el.closest('[data-u]')?.dataset.u ?? el.dataset.u}.${el.dataset.uCampo}`, () => cambiarUnidad(d, el.closest('[data-u]')?.dataset.u ?? el.dataset.u, el.dataset.uCampo, el.type === 'checkbox' ? el.checked : el.value)); return; }
    const id = nodoDe(el); if (!id) return;
    if (el.dataset.campo === 'texto') { programar(`t.${id}`, () => editar(d, id, 'texto', D.limpiarHtml(el.innerHTML)), 220); return; }
    if (el.dataset.ruta) {
      if (el.classList.contains('op-gdh')) el.classList.toggle('mal', Boolean(el.value.trim()) && !D.esGdh(el.value));
      const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
      programar(`r.${id}.${el.dataset.ruta}`, () => { editar(d, id, el.dataset.ruta, v); if (el.closest('.op-tabla')?.querySelector('.op-total')) refrescarTotales(el.closest('.op-tabla'), d.nodos[id]); }, el.type === 'checkbox' || el.tagName === 'SELECT' ? 0 : 450);
    }
  });
  hoja.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  hoja.addEventListener('focusout', (e) => {
    const el = e.target;
    // Títulos (propios) y nombre de las fases: al salir
    if (el.dataset?.campo === 'titulo' && el.isContentEditable) { const d = docDe(el); const id = nodoDe(el); if (d && id) editar(d, id, 'titulo', el.textContent.trim()); el.removeAttribute('contenteditable'); }
    if (el.dataset?.campo === 'fase-nombre') { const id = nodoDe(el); const n = actual()?.nodos[id]; const t = el.textContent.trim(); if (n?.fase && t) ponerFase(n.fase, 'nombre', t); }
    if (el.classList?.contains('op-gdh') && el.value && D.esGdh(el.value) && el.value !== D.normalizarGdh(el.value)) { el.value = D.normalizarGdh(el.value); el.dispatchEvent(new Event('input', { bubbles: true })); }
    // Se guarda lo pendiente cuando el foco ya ha llegado a su nuevo sitio: si se repintara ahora, el campo
    // al que se va se quedaría suelto y lo que se escribiera en él se perdería
    setTimeout(vaciarPendientes, 0);
  });
  hoja.addEventListener('keydown', (e) => {
    const el = e.target;
    if ((el.dataset?.campo === 'titulo' || el.dataset?.campo === 'fase-nombre') && e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (el.classList?.contains('op-org-nom')) teclaOrg(e);
  });
  // Pegar: solo texto con formato sencillo
  hoja.addEventListener('paste', (e) => {
    const el = e.target.closest?.('[contenteditable="true"]'); if (!el) return;
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const texto = e.clipboardData.getData('text/plain');
    if (el.dataset.campo === 'texto' && html) document.execCommand('insertHTML', false, D.limpiarHtml(html));
    else document.execCommand('insertText', false, texto);
  });
  // Doble clic en un título de la plantilla: cambiarle el nombre
  hoja.addEventListener('dblclick', (e) => {
    const t = e.target.closest('.op-tit[data-campo="titulo"]'); if (!t || t.isContentEditable) return;
    t.setAttribute('contenteditable', 'true'); t.focus();
    const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  function refrescarTotales(tabla, n) {
    if (!n?.tabla?.totales) return;
    const i = hoja.scrollTop; const caja = tabla.closest('.op-sec-cuerpo');
    const d = actual(); if (!caja || !d) return;
    const tmp = document.createElement('div'); tmp.innerHTML = htmlTabla(d, n);
    tabla.querySelectorAll('.op-num-tot').forEach((c, k) => { c.textContent = tmp.querySelectorAll('.op-num-tot')[k]?.textContent ?? ''; });
    const tot = tabla.querySelector('.op-total'), tnew = tmp.querySelector('.op-total');
    if (tot && tnew) tot.innerHTML = tnew.innerHTML;
    hoja.scrollTop = i;
  }

  // ---------------------------------------------------------- fases y unidades
  function ponerFase(faseId, campo, valor) {
    const o = buscarPaquete(plan(), faseId); if (!o || o[campo] === valor) return;
    dibujo.cambio(campo === 'nombre' ? `Renombrar «${o.nombre}»` : `Fechas de «${o.nombre}»`, () => { o[campo] = valor; tocarPaquete(o); });
    pintarFases();
  }
  function nuevaFase() {
    const o = buscarPaquete(plan(), st.op); if (!o) return;
    const n = hijos(plan(), st.op).length;
    const f = dibujo.cambio(`Nueva fase en «${o.nombre}»`, (p) => nuevoPaquete(p, `Fase ${n}`, { padre: st.op, autor: autor() }));
    st.fase = f.id;
    pintar();
  }
  const orgNodo = (d) => D.porClave(d, 'orgop') ?? Object.values(d.nodos).find((x) => x.tipo === 'org' && !x.quitado);
  function ponerUnidades(d, us, enfocar = null) {
    const n = orgNodo(d); if (!n) return;
    editar(d, n.id, 'org.unidades', us);
    pintar(true); // aunque se esté escribiendo: la lista cambia de forma
    if (enfocar) { const i = hoja.querySelector(`.op-org-u[data-u="${enfocar}"] .op-org-nom`); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  function cambiarUnidad(d, uid, campo, valor) {
    const n = orgNodo(d); if (!n) return;
    const us = JSON.parse(JSON.stringify(n.org.unidades));
    const u = us.find((x) => x.id === uid); if (!u) return;
    u[campo] = campo === 'inicio' || campo === 'fin' ? D.normalizarGdh(valor) : valor;
    if (campo === 'enMatriz' && valor) delete u.enMatriz;
    editar(d, n.id, 'org.unidades', us);
    // El organigrama y las tablas que dependen de las unidades se ponen al día sin perder el cursor
    if (campo !== 'nombre' || !escribiendo()) pintar(); else st.sucio = true;
  }
  function teclaOrg(e) {
    const fila = e.target.closest('.op-org-u'); const d = actual(); const n = orgNodo(d); if (!fila || !n) return;
    const us = JSON.parse(JSON.stringify(n.org.unidades));
    const u = us.find((x) => x.id === fila.dataset.u); if (!u) return;
    u.nombre = e.target.value;
    const hermanas = D.hijasDe(us, u.padre ?? null);
    const i = hermanas.indexOf(u);
    if (e.key === 'Enter') {
      e.preventDefault();
      const nu = { id: D.uuid(), nombre: '', padre: u.padre ?? null };
      us.splice(us.indexOf(u) + 1, 0, nu); ponerUnidades(d, us, nu.id);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault(); if (i <= 0) return;
      u.padre = hermanas[i - 1].id; ponerUnidades(d, us, u.id);
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault(); if (!u.padre) return;
      const padre = us.find((x) => x.id === u.padre); u.padre = padre?.padre ?? null; ponerUnidades(d, us, u.id);
    } else if (e.key === 'Backspace' && !e.target.value && us.length > 1) {
      e.preventDefault();
      const prev = fila.previousElementSibling?.dataset.u;
      for (const h of us) if (h.padre === u.id) h.padre = u.padre ?? null;
      us.splice(us.indexOf(u), 1); ponerUnidades(d, us, prev);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const otra = e.key === 'ArrowDown' ? fila.nextElementSibling : fila.previousElementSibling;
      otra?.querySelector('.op-org-nom')?.focus();
    }
  }

  // ---------------------------------------------------------- botones de la hoja
  hoja.addEventListener('click', async (e) => {
    const docB = e.target.closest('[data-doc]'); if (docB && !e.target.closest('[data-acc]')) { st.doc = docB.dataset.doc; hoja.scrollTop = 0; pintar(); return; }
    const objB = e.target.closest('.op-obj'); if (objB) { dibujo.encuadrar([objB.dataset.obj]); dibujo.seleccionar(objB.dataset.obj); return; }
    const opc = e.target.closest('.op-opciones button');
    if (opc) { const d = docDe(opc); const id = nodoDe(opc); const ruta = opc.parentElement.dataset.ruta; const v = opc.getAttribute('aria-pressed') === 'true' ? '' : opc.dataset.v; editar(d, id, ruta, v); opc.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); return; }
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const acc = b.dataset.acc; const d = docDe(b); const id = nodoDe(b); const n = d?.nodos[id];
    if (acc === 'menu') { menuSeccion(b, d, n); return; }
    if (acc === 'gdh-ahora') { const v = D.gdh(new Date(), d.cabecera.huso || 'Z'); editar(d, '_cab', 'gdh', v); pintar(); return; }
    if (acc === 'nueva-fase') { nuevaFase(); return; }
    if (acc === 'ver-fase') { st.fase = b.dataset.fase; if (!st.concepto) ponerConcepto(true); else { aplicarConcepto(); pintar(); } return; }
    if (acc === 'repetir') { const h = D.anadirRepetido(d, id, autor()); if (h) pila.push({ doc: d.id, cbs: [d.cambios.at(-1)] }); guardarPronto(); pintar(); return; }
    if (acc === 'fila') {
      const filas = [...n.tabla.filas, { id: D.uuid(), c: {} }];
      editar(d, id, 'tabla.filas', filas); pintar(); return;
    }
    if (acc === 'quitar-fila') { const i = Number(b.closest('tr').dataset.fila); const filas = n.tabla.filas.filter((_, k) => k !== i); editar(d, id, 'tabla.filas', filas); pintar(); return; }
    if (acc === 'columna') {
      const k = `c${n.tabla.cols.length + 1}`;
      editar(d, id, 'tabla.cols', [...n.tabla.cols, { k: `${k}_${D.uuid().slice(0, 4)}`, en: `Column ${n.tabla.cols.length + 1}`, es: `Columna ${n.tabla.cols.length + 1}` }]); pintar(); return;
    }
    if (acc === 'fila-matriz') { editar(d, id, 'matriz.filas', [...(n.matriz.filas ?? []), { id: D.uuid(), nombre: '' }]); pintar(); return; }
    if (acc === 'quitar-fila-matriz') { const i = Number(b.dataset.i); editar(d, id, 'matriz.filas', (n.matriz.filas ?? []).filter((_, k) => k !== i)); pintar(); return; }
    if (acc === 'u-nueva') {
      const us = JSON.parse(JSON.stringify(n.org.unidades));
      const raices = D.hijasDe(us, null);
      const nu = { id: D.uuid(), nombre: us.length ? '' : (d.cabecera.emisor || '').split(/\s+(PC|CP|Main|principal)\b/i)[0] || '', padre: raices.length === 1 ? raices[0].id : null };
      us.push(nu); ponerUnidades(d, us, nu.id); return;
    }
    if (acc === 'u-sub') { const us = JSON.parse(JSON.stringify(n.org.unidades)); const pu = b.closest('.op-org-u').dataset.u; const nu = { id: D.uuid(), nombre: '', padre: pu }; const ult = Math.max(us.findIndex((x) => x.id === pu), ...us.map((x, k) => (x.padre === pu ? k : -1))); us.splice(ult + 1, 0, nu); ponerUnidades(d, us, nu.id); return; }
    if (acc === 'u-quitar') { const us = JSON.parse(JSON.stringify(n.org.unidades)); const uid = b.closest('.op-org-u').dataset.u; const u = us.find((x) => x.id === uid); for (const h of us) if (h.padre === uid) h.padre = u?.padre ?? null; ponerUnidades(d, us.filter((x) => x.id !== uid)); return; }
    if (acc === 'u-mapa') { unidadesDelMapa(d, n); return; }
    if (acc === 'elegir-mgrs') { elegirEnMapa(d, id, b.dataset.ruta, b.closest('.op-mgrs')?.querySelector('input')); return; }
    if (acc === 'elegir-permanentes') { elegirPermanentes(b); return; }
    if (acc === 'no-permanente') { const el = plan().elementos.find((x) => x.id === b.dataset.obj); if (el) dibujo.cambio('Solo en su fase', () => { delete el.propiedades.permanente; el.modificado = new Date().toISOString(); el.version = (el.version || 1) + 1; }); pintar(); return; }
    if (acc === 'anexo-nuevo') { menuAnexoNuevo(b, null); return; }
    if (acc === 'quitar-anexo') { quitarAnexo(d); }
  });

  function unidadesDelMapa(d, n) {
    const ya = new Set(n.org.unidades.map((u) => u.nombre.trim().toLowerCase()));
    const nuevas = objetosDe(plan(), st.op).filter((e) => e.simbolo?.clase === 'unidad').map((e) => dibujo.titulo(e)).filter((t) => t && !ya.has(t.trim().toLowerCase()));
    if (!nuevas.length) { avisar('No hay unidades nuevas dibujadas en la operación'); return; }
    const us = JSON.parse(JSON.stringify(n.org.unidades));
    let raices = D.hijasDe(us, null);
    if (!raices.length) { const r = { id: D.uuid(), nombre: (d.cabecera.emisor || buscarPaquete(plan(), st.op)?.nombre || 'Unidad').split(/\s+(PC|CP|Main)\b/i)[0], padre: null }; us.push(r); raices = [r]; }
    const padre = raices.length === 1 ? raices[0].id : null;
    for (const nombre of [...new Set(nuevas)]) us.push({ id: D.uuid(), nombre, padre });
    ponerUnidades(d, us); avisar(`${nuevas.length} unidad${nuevas.length === 1 ? '' : 'es'} añadida${nuevas.length === 1 ? '' : 's'}`);
  }

  // Coordenada MGRS pinchando en el mapa
  let eligiendo = null;
  function elegirEnMapa(d, nodo, ruta, input) {
    eligiendo = { d, nodo, ruta, input };
    panel.classList.add('eligiendo'); document.body.classList.add('eligiendo-punto');
    avisar('Pincha en el mapa', 0);
  }
  mapa.on('click', (e) => {
    if (!eligiendo) return;
    const { d, nodo, ruta, input } = eligiendo; eligiendo = null;
    panel.classList.remove('eligiendo'); document.body.classList.remove('eligiendo-punto');
    const v = geoAMgrs(e.latlng.lat, e.latlng.lng, 5, { separado: true });
    if (input) input.value = v;
    editar(d, nodo, ruta, v); avisar(v);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && eligiendo) { eligiendo = null; panel.classList.remove('eligiendo'); document.body.classList.remove('eligiendo-punto'); } });

  function elegirPermanentes(boton) {
    const els = objetosDe(plan(), st.op);
    if (!els.length) { avisar('La operación aún no tiene objetos'); return; }
    abrirMenu(boton, `<div class="om-tit">Vigentes en todas las fases</div>${els.map((e) => `<button type="button" data-v="${e.id}">${e.propiedades?.permanente ? '✓ ' : ' '}${esc(dibujo.titulo(e))}</button>`).join('')}`, (id) => {
      const el = plan().elementos.find((x) => x.id === id); if (!el) return;
      const si = !el.propiedades.permanente;
      dibujo.cambio(si ? 'Vigente en todas las fases' : 'Solo en su fase', () => { if (si) el.propiedades.permanente = true; else delete el.propiedades.permanente; el.modificado = new Date().toISOString(); el.version = (el.version || 1) + 1; });
      pintar();
    });
  }

  // ---------------------------------------------------------- menús
  function menuSeccion(boton, d, n) {
    if (!n) return;
    const padre = D.padreDe(d, n.id);
    const lista = padre ? padre.hijos : d.raiz;
    const i = lista.indexOf(n.id);
    const en = idi();
    abrirMenu(boton, `<div class="om-tit">${esc(tituloNodo(d, n))}</div>
      <button type="button" data-v="sub">+ Subapartado</button>
      <button type="button" data-v="debajo">+ Apartado debajo</button>
      <div class="om-sep"></div>
      <button type="button" data-v="tabla:libre">+ Tabla</button>
      <button type="button" data-v="tabla:fuegos">+ ${esc(TABLAS.fuegos[en])}</button>
      <button type="button" data-v="tabla:pace">+ ${esc(TABLAS.pace[en])}</button>
      <button type="button" data-v="tabla:pc">+ ${esc(TABLAS.pc[en])}</button>
      <button type="button" data-v="fases">+ Tabla por fases</button>
      <button type="button" data-v="anexo">+ Anexo enlazado…</button>
      <div class="om-sep"></div>
      ${n.propio || n.fase ? '' : '<button type="button" data-v="renombrar">Cambiar el título</button>'}
      ${n.titulo && !n.propio ? '<button type="button" data-v="titulo-original">Volver al título de la plantilla</button>' : ''}
      ${i > 0 ? '<button type="button" data-v="subir">Subir</button>' : ''}
      ${i < lista.length - 1 ? '<button type="button" data-v="bajar">Bajar</button>' : ''}
      ${n.fase ? '' : '<div class="om-sep"></div><button type="button" data-v="quitar" class="peligro">Quitar el apartado</button>'}`, (v) => {
      if (v === 'sub') { const h = D.anadirNodo(d, { padre: n.id, autor: autor() }); pila.push({ doc: d.id, cbs: [d.cambios.at(-1)] }); despues(h); }
      if (v === 'debajo') { const h = D.anadirNodo(d, { padre: padre?.id ?? null, i: i + 1, autor: autor() }); pila.push({ doc: d.id, cbs: [d.cambios.at(-1)] }); despues(h); }
      if (v.startsWith('tabla:')) { const h = D.anadirNodo(d, { padre: n.id, tipo: 'tabla', tabla: v.slice(6), autor: autor() }); h.tabla.origen = v.slice(6) === 'libre' ? undefined : v.slice(6); pila.push({ doc: d.id, cbs: [d.cambios.at(-1)] }); despues(h); }
      if (v === 'fases') { const h = D.anadirNodo(d, { padre: n.id, tipo: 'matrizFases', titulo: en === 'en' ? 'By phase' : 'Por fases', autor: autor() }); pila.push({ doc: d.id, cbs: [d.cambios.at(-1)] }); despues(h); }
      if (v === 'anexo') menuAnexoNuevo(boton, n);
      if (v === 'renombrar') { const t = hoja.querySelector(`#sec-${n.id} > .op-sec-cab .op-tit`); t?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }
      if (v === 'titulo-original') { editar(d, n.id, 'titulo', ''); pintar(); }
      if (v === 'subir' || v === 'bajar') { const cb = D.moverNodo(d, n.id, v === 'subir' ? -1 : 1, autor()); if (cb) { pila.push({ doc: d.id, cbs: [cb] }); guardarPronto(); } pintar(); }
      if (v === 'quitar') { const cb = D.quitarNodo(d, n.id, autor()); if (cb) { pila.push({ doc: d.id, cbs: [cb] }); guardarPronto(); } pintar(); avisar(`Quitado «${tituloNodo(d, n)}»`, 5000, true); }
    });
  }
  function despues(h) {
    guardarPronto(); pintar();
    requestAnimationFrame(() => {
      const s = hoja.querySelector(`#sec-${h.id}`); if (!s) return;
      s.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const t = s.querySelector('.op-tit[contenteditable]');
      if (t) { t.focus(); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); }
    });
  }
  function menuAnexoNuevo(boton, nodo) {
    abrirMenu(boton, `<div class="om-tit">Nuevo anexo</div>${Object.values(ANEXOS).map((a) => `<button type="button" data-v="${a.id}">${esc(a.nombre)}</button>`).join('')}`, (tipo) => {
      const op = opord(); if (!op) return;
      const a = D.crearAnexo(tipo, { autor: autor(), idioma: op.idioma, operacion: op.operacion });
      D.enlazarAnexo(op, a, { nodo: nodo?.id ?? null });
      docs().push(a); dibujo.guardar();
      st.doc = a.id; hoja.scrollTop = 0; pintar();
      avisar(`Anexo ${D.letraAnexo(op, a.id)} creado`);
    });
  }
  async function quitarAnexo(a) {
    const op = opord(); if (!op || a.tipo !== 'anexo') return;
    const r = await preguntar({ titulo: `Quitar el anexo ${D.letraAnexo(op, a.id)}`, texto: 'Se borra el anexo y su contenido. Las letras de los demás se ponen al día.', opciones: [{ v: 'si', texto: 'Quitar', clase: 'peligro' }, { v: 'cancelar', texto: 'Cancelar' }] });
    if (r !== 'si') return;
    op.anexos = op.anexos.filter((x) => x !== a.id);
    for (const n of Object.values(op.nodos)) if (n.enlaces) n.enlaces = n.enlaces.filter((x) => x !== a.id);
    const lista = docs(); lista.splice(lista.indexOf(a), 1);
    D.tocar(op); dibujo.guardar();
    st.doc = op.id; pintar();
  }

  // ---------------------------------------------------------- cabecera de la ventana
  $('opord-docs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.acc === 'anexo-nuevo') { menuAnexoNuevo(b, null); return; }
    vaciarPendientes(); st.doc = b.dataset.doc; hoja.scrollTop = 0; pintar();
  });
  $('opord-fases').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fase]'); if (!b) return;
    vaciarPendientes();
    st.fase = b.dataset.fase || null;
    if (st.concepto) aplicarConcepto();
    pintar();
    if (!st.concepto && st.fase) requestAnimationFrame(() => hoja.querySelector(`.op-sec[data-id] .op-dtg [data-fase="${st.fase}"]`)?.closest('.op-sec')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  });
  indice.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ir]'); if (!a) return;
    e.preventDefault();
    hoja.querySelector(`#sec-${a.dataset.ir}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('opord-concepto').addEventListener('click', () => { vaciarPendientes(); ponerConcepto(!st.concepto); });
  $('opord-vista-btn').setAttribute('aria-pressed', String(ui.vista));
  $('opord-vista-btn').addEventListener('click', () => { vaciarPendientes(); ponerVista(!ui.vista); });
  // El apartado que se escribe se resalta en la hoja
  hoja.addEventListener('focusin', (e) => { const id = nodoDe(e.target); if (id) vista.activar(id); });
  panel.querySelector('.ov-zoom').addEventListener('click', (e) => { const b = e.target.closest('[data-z]'); if (!b) return; $('ov-zoom-txt').textContent = vista.zoom(b.dataset.z === 'a' ? 'ajustar' : b.dataset.z === '+' ? 0.1 : -0.1); });
  // Exportar solo el documento que se ve (OPORD o anexo)
  panel.querySelector('.ov-acc').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-exp]'); if (!b) return;
    vaciarPendientes();
    const d = actual(); const op = opord(); if (!d) return;
    const ext = b.dataset.exp;
    const ctx = { ...contexto(op), archivoDe: (x) => `${baseArchivo(x, op)}.${ext}` };
    const blob = ext === 'pdf' ? await aPdf(d, ctx) : await aDocx(d, ctx);
    descargar({ blob, nombre: `${baseArchivo(d, op)}.${ext}` });
    avisar(`«${baseArchivo(d, op)}.${ext}» descargado`);
  });
  $('opord-cerrar').addEventListener('click', () => { vaciarPendientes(); cerrar(); });
  $('opord-exportar').addEventListener('click', () => { vaciarPendientes(); exportar(); });
  $('opord-mas').addEventListener('click', (e) => {
    vaciarPendientes();
    const op = opord(); if (!op) return;
    abrirMenu(e.currentTarget, `<div class="om-tit">OPORD</div>
      ${Object.values(PLANTILLAS).map((p) => `<button type="button" data-v="pl:${p.id}">${p.id === op.plantilla ? '✓' : ' '} ${esc(p.nombre)}</button>`).join('')}
      <div class="om-sep"></div>
      <button type="button" data-v="id:es">${op.idioma !== 'en' ? '✓' : ' '} En español</button>
      <button type="button" data-v="id:en">${op.idioma === 'en' ? '✓' : ' '} In English</button>
      <div class="om-sep"></div>
      <button type="button" data-v="autor">Tu nombre en los cambios: ${esc(autor())}…</button>
      <button type="button" data-v="deshacer">Deshacer</button>
      <div class="om-sep"></div>
      <button type="button" data-v="borrar" class="peligro">Borrar la OPORD…</button>`, async (v) => {
      if (v.startsWith('pl:')) cambiarPlantilla(v.slice(3));
      if (v.startsWith('id:')) { const l = v.slice(3); for (const d of [op, ...anexos(op)]) editar(d, '_doc', 'idioma', l); ui.idioma = l; guardarUi(); pintar(); }
      if (v === 'autor') { const r = await preguntar({ titulo: 'Tu nombre', texto: 'Así se firma cada cambio (útil cuando varios trabajen en la misma operación).', campo: { valor: ui.autor, ayuda: 'Ej.: Tte. Balú' }, opciones: [{ v: 'ok', texto: 'Guardar', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] }); if (r) { ui.autor = r.texto; guardarUi(); } }
      if (v === 'deshacer') deshacerOpord();
      if (v === 'borrar') borrarOpord();
    });
  });
  async function cambiarPlantilla(id) {
    const op = opord(); if (!op || op.plantilla === id) return;
    const r = await preguntar({ titulo: `Pasar a «${PLANTILLAS[id].nombre}»`, texto: 'Todo lo escrito pasa a su apartado en la plantilla nueva. Lo que no tenga sitio queda al final, en «Sin sitio en esta plantilla». Los anexos siguen enlazados.', opciones: [{ v: 'si', texto: 'Cambiar', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] });
    if (r !== 'si') return;
    const nuevo = D.cambiarPlantilla(op, id, { autor: autor() });
    D.sincronizarFases(nuevo, paquetes(plan()));
    const lista = docs(); lista[lista.indexOf(op)] = nuevo;
    pila.length = 0; dibujo.guardar(); st.doc = nuevo.id; pintar();
    avisar(`Ahora es una ${PLANTILLAS[id].nombre}`);
  }
  async function borrarOpord() {
    const op = opord(); if (!op) return;
    const r = await preguntar({ titulo: 'Borrar la OPORD', texto: `Se borran la OPORD y sus ${op.anexos.length} anexos. Lo dibujado en el mapa no se toca.`, opciones: [{ v: 'si', texto: 'Borrar', clase: 'peligro' }, { v: 'cancelar', texto: 'Cancelar' }] });
    if (r !== 'si') return;
    const quitar = new Set([op.id, ...op.anexos]);
    plan().documentos = docs().filter((d) => !quitar.has(d.id));
    dibujo.guardar(); cerrar();
  }

  // ---------------------------------------------------------- exportar
  async function exportar() {
    const op = opord(); if (!op) return;
    const chips = (grupo, lista, marcados) => `<div class="dlg-chips" data-grupo="${grupo}">${lista.map(([k, t, det]) => `<label title="${esc(det ?? '')}"><input type="checkbox" value="${k}" ${marcados.includes(k) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`;
    const r = await preguntar({
      titulo: 'Exportar la OPORD',
      html: `<div class="dlg-exp">
        <h4>OPORD y anexos</h4>${chips('docs', [['pdf', 'PDF'], ['docx', 'Word'], ['xlsx', 'Excel'], ['txt', 'Texto']], ui.exp.docs)}
        <h4>Concepto de la operación (lo dibujado)</h4>${chips('concepto', [['zip', 'Paquete de datos (ATAK)', 'ZIP con KML para ATAK'], ['kmz', 'KMZ', 'Google Earth'], ['spa', 'Paquete SPA', 'Para otro usuario de SPA: abre la operación y la OPORD editables, y las actualiza si ya las tenía']], ui.exp.concepto)}
        <label class="dlg-zip"><input type="checkbox" id="exp-zip" ${ui.exp.zip ? 'checked' : ''}> Todo junto en un ZIP</label></div>`,
      opciones: [{ v: 'descargar', texto: 'Descargar', clase: 'primario' }, { v: 'enviar', texto: 'Enviar…' }, { v: 'cancelar', texto: 'Cancelar' }],
    });
    if (!r) return;
    const leer = (g) => [...document.querySelectorAll(`#dialogo [data-grupo="${g}"] input:checked`)].map((x) => x.value);
    ui.exp = { docs: leer('docs'), concepto: leer('concepto'), zip: document.getElementById('exp-zip')?.checked ?? true }; guardarUi();
    if (!ui.exp.docs.length && !ui.exp.concepto.length) return;
    avisar('Preparando…', 0);
    try {
      const archivos = await archivosOpord(op, { anexos: anexos(op), paquetes: paquetes(plan()), permanentes: permanentes().map((e) => ({ nombre: dibujo.titulo(e) })), formatos: ui.exp.docs });
      const base = baseArchivo(op);
      const ids = objetosDe(plan(), st.op).map((e) => e.id);
      for (const f of ui.exp.concepto) {
        const a = await lazo.archivoDe(ids, f, `${base} - Concepto`, f === 'spa' ? paqueteSpa(op) : null);
        archivos.push({ nombre: f === 'spa' ? `${base}.spa.json` : a.nombre, blob: a.blob });
      }
      const salida = ui.exp.zip && archivos.length > 1 ? [{ nombre: `${base}.zip`, blob: await zipDe(archivos, base) }] : archivos;
      if (r === 'enviar') {
        const files = salida.map((a) => new File([a.blob], a.nombre, { type: a.blob.type || 'application/octet-stream' }));
        try { if (navigator.canShare?.({ files })) { await navigator.share({ files, title: base }); avisar('Enviado'); return; } } catch (err) { if (err?.name === 'AbortError') return; }
      }
      for (const [k, a] of salida.entries()) setTimeout(() => descargar(a), k * 350);
      avisar(salida.length === 1 ? `«${salida[0].nombre}» descargado` : `${salida.length} archivos descargados`);
    } catch (err) {
      avisar(`No se pudo exportar: ${err.message}`, 6000);
    }
  }
  /** Paquete SPA con toda la operación (fases incluidas aunque estén vacías), su OPORD y sus anexos. */
  function paqueteSpa(op) {
    const sub = new Set([st.op, ...descendientes(plan(), st.op)]);
    const pq = crearPaqueteSpa(plan(), objetosDe(plan(), st.op), { nombre: buscarPaquete(plan(), st.op)?.nombre ?? 'Operación', autor: autor() });
    const ya = new Set(pq.operaciones.map((o) => o.id));
    for (const o of paquetes(plan())) if (sub.has(o.id) && !ya.has(o.id)) pq.operaciones.push(JSON.parse(JSON.stringify(o)));
    const dIds = new Set(pq.documentos.map((d) => d.id));
    for (const d of [op, ...anexos(op)]) if (!dIds.has(d.id)) pq.documentos.push(JSON.parse(JSON.stringify(d)));
    return pq;
  }
  function descargar({ blob, nombre }) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }

  // ---------------------------------------------------------- avisos y teclado
  let tAviso = 0;
  function avisar(texto, ms = 2600, conDeshacer = false) {
    const t = $('opord-aviso'); if (!t) return;
    t.innerHTML = `<span>${esc(texto)}</span>${conDeshacer ? '<button type="button" data-deshacer>Deshacer</button>' : ''}`;
    t.hidden = false; clearTimeout(tAviso);
    if (ms) tAviso = setTimeout(() => { t.hidden = true; }, ms);
  }
  $('opord-aviso').addEventListener('click', (e) => { if (e.target.closest('[data-deshacer]')) { $('opord-aviso').hidden = true; deshacerOpord(); } });
  panel.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.key.toLowerCase() !== 'z' || escribiendo()) return;
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey) rehacerOpord(); else deshacerOpord();
  });

  // Cuando cambia el plan (fases renombradas, objetos…), se pone al día
  dibujo.suscribir(() => { if (!panel.hidden) { if (st.op && !buscarPaquete(plan(), st.op)) { cerrar(); return; } pintar(); } });

  return {
    abrir, cerrar, refrescar: () => pintar(),
    get abierto() { return !panel.hidden; },
    /** ¿Tiene OPORD esta operación? */
    tiene: (opId) => Boolean(opordDe(opId)),
    /** Abre la OPORD de la operación activa (o pregunta cuál). */
    async abrirDesdeBoton(boton) {
      if (!panel.hidden) { cerrar(); return; }
      const act = dibujo.activo ? descendientesInverso(dibujo.activo) : null;
      if (act) { abrir(act); return; }
      const raices = hijos(plan(), null);
      if (raices.length === 1) { abrir(raices[0].id); return; }
      abrirMenu(boton, `<div class="om-tit">OPORD de…</div>${raices.map((o) => `<button type="button" data-v="${o.id}">${opordDe(o.id) ? '📄 ' : ''}${esc(o.nombre)}</button>`).join('')}<div class="om-sep"></div><button type="button" data-v="__nueva">+ Nueva operación…</button>`, async (v) => {
        if (v === '__nueva') {
          const r = await preguntar({ titulo: 'Nueva operación', campo: { ayuda: 'Nombre' }, opciones: [{ v: 'crear', texto: 'Crear', clase: 'primario' }, { v: 'cancelar', texto: 'Cancelar' }] });
          if (!r) return;
          const o = dibujo.cambio(`Crear «${r.texto || 'Operación'}»`, (p) => nuevoPaquete(p, r.texto || 'Operación', { autor: autor() }));
          dibujo.ponerActivo(o.id); abrir(o.id); return;
        }
        abrir(v);
      });
    },
  };
}
