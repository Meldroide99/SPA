// Documento OPORD (y sus anexos): modelo, numeración, fases, cambios y paso
// de una plantilla a otra.
//
// Dónde vive: en el plan (`plan.documentos`), unido a una operación
// (`doc.operacion` = id del paquete). Los anexos son documentos aparte, dentro
// de la misma operación, enlazados con su OPORD en los dos sentidos
// (`opord.anexos` ↔ `anexo.padre`).
//
// Preparado para varios usuarios editando a la vez: todo cambio pasa por
// `editar()`, que lo apunta en `doc.cambios` con autor, hora y un reloj
// lógico (Lamport). Cada campo guarda el sello del último cambio que lo tocó
// (`nodo._v`), y `fusionar()` aplica los cambios que lleguen de otro usuario
// quedándose con el más reciente de cada campo (el último que escribe gana).
// Así, el día que haya servidor solo hay que mandar y recibir `cambios`.
//
// No depende de la página: se prueba en Node.

import { PLANTILLAS, ANEXOS, TABLAS } from './plantillas.js';

const ahora = () => new Date().toISOString();
export const uuid = () => (globalThis.crypto?.randomUUID?.()
  ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));
const copia = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_CAMBIOS = 5000;

// ---------------------------------------------------------------- crear
function filasIniciales(t) {
  if (t.filasFijas?.length) return t.filasFijas.map((f) => ({ id: uuid(), fija: true, c: { [t.cols[0].k]: f } }));
  return Array.from({ length: t.filas ?? 3 }, () => ({ id: uuid(), c: {} }));
}
function tablaDe(t) {
  return { cols: copia(t.cols), filas: filasIniciales(t), ...(t.totales ? { totales: true } : {}), ...(t.formularioPrevio ? { previo: copia(t.formularioPrevio), valoresPrevio: {} } : {}) };
}

/** Crea un nodo (y sus hijos) a partir de la plantilla. Devuelve su id. */
function crearNodo(doc, t, { autor = '' } = {}) {
  const n = {
    id: uuid(), k: t.k, en: t.en, es: t.es, tipo: t.tipo ?? 'texto', hijos: [], texto: '',
    autor, t: ahora(), _v: {},
  };
  if (t.intro) n.intro = copia(t.intro);
  if (t.plano) n.plano = true;
  if (t.sinNumero) n.sinNumero = true;
  if (n.tipo === 'tabla') { n.tabla = tablaDe(t); delete n.texto; }
  if (t.tabla && TABLAS[t.tabla]) n.tabla = tablaDe(TABLAS[t.tabla]);
  if (n.tipo === 'org') n.org = { unidades: [] };
  if (n.tipo === 'agregaciones') n.tabla = tablaDe({ cols: COLS_AGREGACIONES, filas: 0 });
  if (n.tipo === 'matriz') n.matriz = { celdas: {}, bpt: {}, filas: [] };
  if (n.tipo === 'matrizFases') n.matriz = { celdas: {}, filas: [], cabecera: copia(t.cabecera) ?? null };
  if (n.tipo === 'firma') n.firma = { jefe: '', empleo: '', cargo: '' };
  if (n.tipo === 'formulario') { n.campos = copia(t.campos); n.valores = {}; delete n.texto; }
  if (t.repetible) {
    n.repetible = copia(t.repetible);
    for (let i = 1; i <= (t.repetible.n ?? 1); i++) n.hijos.push(crearNodo(doc, { k: `${t.k}.${i}`, en: t.repetible.en.replace('{n}', i), es: t.repetible.es.replace('{n}', i) }, { autor }));
  }
  doc.nodos[n.id] = n;
  for (const h of t.hijos ?? []) n.hijos.push(crearNodo(doc, h, { autor }));
  if (t.anexos) n.pideAnexos = [...t.anexos];
  return n.id;
}

/** Columnas de «Agregaciones y segregaciones» (como en el modelo, completas). */
export const COLS_AGREGACIONES = Object.freeze([
  { k: 'unidad', en: 'Attachments/Detachments', es: 'Agregaciones/Segregaciones' },
  { k: 'de', en: 'Losing unit', es: 'Unidad que cede' },
  { k: 'a', en: 'Receiving unit', es: 'Unidad que recibe' },
  { k: 'relacion', en: 'Command relationship', es: 'Relación de mando', campo: 'relacion' },
  { k: 'inicio', en: 'Start (DTG)', es: 'Inicio (GDH)', campo: 'gdh' },
  { k: 'fin', en: 'End (DTG)', es: 'Fin (GDH)', campo: 'gdh' },
]);

function docVacio(tipo, plantilla, { operacion = null, autor = '', idioma = 'es' } = {}) {
  const t = ahora();
  return {
    formato: 'spa-opord', version: 1, id: uuid(), tipo, plantilla, idioma, operacion,
    cabecera: {}, raiz: [], nodos: {}, anexos: [], padre: null,
    autor, creado: t, modificado: t, rev: 1, reloj: 0, cambios: [], _v: {},
  };
}

/**
 * OPORD nueva para una operación.
 * @param {string} plantillaId
 * @param {{operacion?:string|null, nombre?:string, autor?:string, idioma?:'en'|'es', numero?:string}} [o]
 */
export function crearOpord(plantillaId, { operacion = null, nombre = '', autor = '', idioma, numero = '' } = {}) {
  const pl = PLANTILLAS[plantillaId]; if (!pl) throw new Error(`Plantilla desconocida: ${plantillaId}`);
  const doc = docVacio('opord', plantillaId, { operacion, autor, idioma: idioma ?? pl.idioma });
  doc.cabecera = {
    clasificacion: 'EJERCICIO', copia: '', deCopias: '', emisor: '', lugar: '', gdh: '', huso: 'Z',
    numero, nombre, referencia: '', referencias: '',
  };
  for (const t of pl.nodos) doc.raiz.push(crearNodo(doc, t, { autor }));
  for (const t of pl.cierre ?? []) doc.raiz.push(crearNodo(doc, { ...t, sinNumero: true }, { autor }));
  return doc;
}

/** Anexo nuevo (todavía sin enlazar: ver `enlazarAnexo`). */
export function crearAnexo(tipo, { autor = '', idioma = 'es', operacion = null } = {}) {
  const a = ANEXOS[tipo]; if (!a) throw new Error(`Anexo desconocido: ${tipo}`);
  const doc = docVacio('anexo', tipo, { operacion, autor, idioma });
  doc.cabecera = { titulo: '', clasificacion: 'EJERCICIO' };
  for (const t of a.nodos) doc.raiz.push(crearNodo(doc, t, { autor }));
  return doc;
}

/** Une un anexo a su OPORD (en los dos sentidos) y, si se da, a un apartado. */
export function enlazarAnexo(opord, anexo, { nodo = null } = {}) {
  anexo.padre = opord.id; anexo.operacion = opord.operacion; anexo.idioma = opord.idioma; anexo.cabecera.clasificacion ||= opord.cabecera.clasificacion;
  if (!opord.anexos.includes(anexo.id)) opord.anexos.push(anexo.id);
  if (nodo && opord.nodos[nodo]) { const n = opord.nodos[nodo]; n.enlaces = [...new Set([...(n.enlaces ?? []), anexo.id])]; }
  tocar(opord); tocar(anexo);
}

/** Letra de un anexo (A, B, C…, por orden en su OPORD). */
export function letraAnexo(opord, anexoId) {
  const i = opord?.anexos.indexOf(anexoId) ?? -1;
  return i < 0 ? '?' : i < 26 ? LETRAS[i] : `${LETRAS[Math.floor(i / 26) - 1]}${LETRAS[i % 26]}`;
}

/** Crea la OPORD y los anexos que pide su plantilla (MEDEVAC, MEDSITREP…), ya enlazados. */
export function crearOpordCompleta(plantillaId, o = {}) {
  const opord = crearOpord(plantillaId, o);
  const anexos = [];
  for (const n of Object.values(opord.nodos)) {
    for (const tipo of n.pideAnexos ?? []) {
      const a = crearAnexo(tipo, { autor: o.autor, idioma: opord.idioma, operacion: opord.operacion });
      enlazarAnexo(opord, a, { nodo: n.id }); anexos.push(a);
    }
    delete n.pideAnexos;
  }
  return { opord, anexos };
}

// ---------------------------------------------------------------- leer
export const titulo = (n, idioma = 'es') => (n?.titulo || n?.[idioma] || n?.en || n?.es || '');
export const nodosVivos = (doc, ids) => ids.map((id) => doc.nodos[id]).filter((n) => n && !n.quitado);

/** Recorre el árbol (en orden). `fn(nodo, nivel, padre)`. Los nodos «plano» (fases) no cuentan como nivel. */
export function recorrer(doc, fn, { ids = doc.raiz, nivel = 0, padre = null, conQuitados = false } = {}) {
  for (const id of ids) {
    const n = doc.nodos[id]; if (!n || (n.quitado && !conQuitados)) continue;
    fn(n, nivel, padre);
    recorrer(doc, fn, { ids: n.hijos, nivel: n.plano ? nivel : nivel + 1, padre: n, conQuitados });
  }
}

const ROMANOS = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
/** Rótulo de numeración OTAN por nivel: 1. · a. · (1) · (a) · 1) · a) · i. */
export function rotulo(nivel, i) {
  const letra = (x) => (x < 26 ? LETRAS[x] : `${LETRAS[Math.floor(x / 26) - 1]}${LETRAS[x % 26]}`).toLowerCase();
  switch (nivel) {
    case 0: return `${i + 1}.`;
    case 1: return `${letra(i)}.`;
    case 2: return `(${i + 1})`;
    case 3: return `(${letra(i)})`;
    case 4: return `${i + 1})`;
    case 5: return `${letra(i)})`;
    default: return `${ROMANOS[i + 1] ?? i + 1}.`;
  }
}

/**
 * Numeración de todos los apartados: Map id → { rotulo, nivel }.
 * Los nodos «plano» (la lista de fases) no llevan número: sus hijos se
 * numeran seguidos con sus hermanos. Los de cierre (acuse, anexos) no llevan.
 */
export function numerar(doc) {
  const out = new Map();
  const rec = (ids, nivel) => {
    let i = 0;
    const plana = [];
    for (const n of nodosVivos(doc, ids)) { if (n.plano) plana.push(...nodosVivos(doc, n.hijos).map((h) => [h, n])); else plana.push([n, null]); }
    for (const [n, contenedor] of plana) {
      if (contenedor && !out.has(contenedor.id)) out.set(contenedor.id, { rotulo: '', nivel, plano: true });
      if (n.sinNumero) { out.set(n.id, { rotulo: '', nivel }); } else { out.set(n.id, { rotulo: rotulo(nivel, i++), nivel }); }
      rec(n.hijos, nivel + 1);
    }
    for (const n of nodosVivos(doc, ids)) if (n.plano && !nodosVivos(doc, n.hijos).length) out.set(n.id, { rotulo: '', nivel, plano: true });
  };
  rec(doc.raiz, 0);
  return out;
}

/** Busca el primer nodo vivo con esa clave. */
export const porClave = (doc, k) => Object.values(doc.nodos).find((n) => n.k === k && !n.quitado) ?? null;
/** Padre de un nodo (o null si está en la raíz). */
export const padreDe = (doc, id) => Object.values(doc.nodos).find((n) => n.hijos.includes(id)) ?? null;

// ---------------------------------------------------------------- fases (de la operación)
/**
 * Fases de la operación: los paquetes que cuelgan directamente de ella, en
 * su orden. Cada una con su inicio y fin (GDH), guardados en el paquete.
 * `paquetes`: la lista del plan (plan.operaciones).
 */
export function fasesDe(paquetes, operacionId) {
  return (paquetes ?? []).filter((o) => o.padre === operacionId && operacionId)
    .map((o, i) => ({ id: o.id, nombre: o.nombre, inicio: o.inicio ?? '', fin: o.fin ?? '', i }));
}

/** Título de una fase en el documento: «Step 1: RECCE TO NEMAN 050901Z MAY 26 – 051800Z MAY 26». */
export function tituloFase(f, idioma = 'es', { corto = false } = {}) {
  const dtg = [f.inicio, f.fin].filter(Boolean).join(' – ');
  if (corto) return `T${f.i}`;
  return `${idioma === 'en' ? 'Step' : 'Fase'} ${f.i}: ${String(f.nombre || '').toUpperCase()}${dtg ? ` ${dtg}` : ''}`;
}

/**
 * Pone un apartado por fase dentro de cada nodo «fases» (en el orden de la
 * operación). Los apartados de fases que ya no existen no se borran: quedan
 * marcados (`huerfano`) para no perder lo escrito. Devuelve si cambió algo.
 */
export function sincronizarFases(doc, paquetes) {
  const fases = fasesDe(paquetes, doc.operacion);
  let cambio = false;
  for (const n of Object.values(doc.nodos)) {
    if (n.tipo !== 'fases' || n.quitado) continue;
    const propios = new Map(n.hijos.map((id) => doc.nodos[id]).filter(Boolean).filter((h) => h.fase).map((h) => [h.fase, h]));
    const orden = [];
    for (const f of fases) {
      let h = propios.get(f.id);
      if (!h) {
        h = { id: uuid(), k: `fase:${f.id}`, en: '', es: '', tipo: 'texto', fase: f.id, hijos: [], texto: '', autor: doc.autor, t: ahora(), _v: {} };
        doc.nodos[h.id] = h; cambio = true;
      }
      if (h.huerfano) { delete h.huerfano; cambio = true; }
      orden.push(h.id);
    }
    for (const id of n.hijos) {
      const h = doc.nodos[id]; if (!h || orden.includes(id)) continue;
      if (h.fase && !h.huerfano) { h.huerfano = true; cambio = true; }
      orden.push(id); // lo que no es de una fase (añadido a mano) se queda al final
    }
    if (orden.join() !== n.hijos.join()) { n.hijos = orden; cambio = true; }
  }
  return cambio;
}

// ---------------------------------------------------------------- organización operativa
/** Unidades de la organización operativa (del primer nodo «org»). */
export const unidadesOrg = (doc) => (porClave(doc, 'orgop') ?? Object.values(doc.nodos).find((n) => n.tipo === 'org' && !n.quitado))?.org?.unidades ?? [];
export const hijasDe = (unidades, id) => unidades.filter((u) => (u.padre ?? null) === id);

/** Unidades de maniobra (filas de la matriz): las que cuelgan de la unidad que manda; si hay varias raíces, las raíces. */
export function unidadesManiobra(doc) {
  const us = unidadesOrg(doc);
  const raices = hijasDe(us, null);
  const base = raices.length === 1 ? hijasDe(us, raices[0].id) : raices;
  return base.filter((u) => u.enMatriz !== false);
}

/** Filas automáticas de «Agregaciones y segregaciones»: unidades con «cedida por». */
export function agregacionesAuto(doc) {
  const us = unidadesOrg(doc);
  const nombre = (id) => us.find((u) => u.id === id)?.nombre ?? '';
  return us.filter((u) => u.de).map((u) => ({ id: u.id, auto: true, c: { unidad: u.nombre, de: u.de, a: u.a || nombre(u.padre), relacion: u.relacion ?? '', inicio: u.inicio ?? '', fin: u.fin ?? '' } }));
}

/** Árbol de la organización operativa en texto (para TXT, Word y PDF). */
export function orgEnLineas(doc) {
  const us = unidadesOrg(doc);
  const out = [];
  const rec = (padre, nivel) => {
    for (const u of hijasDe(us, padre)) {
      const extra = [u.relacion, u.de ? `de ${u.de}` : ''].filter(Boolean).join(', ');
      out.push({ nivel, texto: `${u.nombre || '—'}${extra ? ` (${extra})` : ''}`, unidad: u });
      rec(u.id, nivel + 1);
    }
  };
  rec(null, 0);
  return out;
}

// ---------------------------------------------------------------- cambios (con autor, hora y reloj lógico)
const leer = (o, ruta) => ruta.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function escribir(o, ruta, v) {
  const ks = ruta.split('.'); let x = o;
  for (const k of ks.slice(0, -1)) { x[k] ??= {}; x = x[k]; }
  x[ks.at(-1)] = v;
}
const mayor = (a, b) => (!b || a[0] > b[0] || (a[0] === b[0] && String(a[1]) > String(b[1])));
export function tocar(doc) { doc.modificado = ahora(); doc.rev = (doc.rev || 1) + 1; }

/**
 * Aplica un cambio (propio o recibido) si es más reciente que lo que hay en
 * ese campo. Cambios: { id, n: nodo|'_cab'|'_doc', c: campo (ruta con puntos), v, a: autor, r: reloj, t }
 * y los de estructura: c = '+nodo' (v: nodo nuevo, p: padre|null, i: posición).
 * Devuelve true si se aplicó.
 */
export function aplicar(doc, cb) {
  doc.reloj = Math.max(doc.reloj || 0, cb.r || 0);
  if (cb.c === '+nodo') {
    if (doc.nodos[cb.v.id]) return false;
    doc.nodos[cb.v.id] = copia(cb.v);
    const lista = cb.p ? doc.nodos[cb.p]?.hijos : doc.raiz;
    if (!lista) return false;
    lista.splice(Math.min(cb.i ?? lista.length, lista.length), 0, cb.v.id);
    tocar(doc); return true;
  }
  const destino = cb.n === '_cab' ? doc.cabecera : cb.n === '_doc' ? doc : doc.nodos[cb.n];
  if (!destino) return false;
  const sellos = cb.n === '_cab' ? (doc._v.cab ??= {}) : cb.n === '_doc' ? (doc._v.doc ??= {}) : (destino._v ??= {});
  const sello = [cb.r, cb.a];
  if (!mayor(sello, sellos[cb.c])) return false;
  escribir(destino, cb.c, copia(cb.v));
  sellos[cb.c] = sello;
  if (destino !== doc && destino !== doc.cabecera) { destino.autor = cb.a; destino.t = cb.t; }
  tocar(doc); return true;
}

/**
 * Cambia un campo dejando constancia (para deshacer y para mandar a otros usuarios).
 * @returns el cambio (o null si no cambió nada)
 */
export function editar(doc, nodo, campoRuta, valor, autor = '') {
  const destino = nodo === '_cab' ? doc.cabecera : nodo === '_doc' ? doc : doc.nodos[nodo];
  if (!destino) return null;
  const antes = leer(destino, campoRuta);
  if (JSON.stringify(antes) === JSON.stringify(valor)) return null;
  const cb = { id: uuid(), n: nodo, c: campoRuta, v: copia(valor), antes: copia(antes), a: autor, r: (doc.reloj || 0) + 1, t: ahora() };
  aplicar(doc, cb);
  anotar(doc, cb);
  return cb;
}
function anotar(doc, cb) { doc.cambios.push(cb); if (doc.cambios.length > MAX_CAMBIOS) doc.cambios.splice(0, doc.cambios.length - MAX_CAMBIOS); }

/** Añade un apartado nuevo (de texto, tabla…) dentro de `padre` (null = raíz) en la posición `i`. */
export function anadirNodo(doc, { padre = null, i, tipo = 'texto', titulo: tit = '', tabla = null, autor = '' } = {}) {
  const n = { id: uuid(), k: `propio:${uuid().slice(0, 8)}`, en: '', es: '', titulo: tit, tipo: tipo === 'matrizFases' ? 'matrizFases' : tipo === 'texto' ? 'texto' : 'tabla', propio: true, hijos: [], texto: '', autor, t: ahora(), _v: {} };
  if (n.tipo === 'tabla') { const t = TABLAS[tabla] ?? TABLAS.libre; n.tabla = tablaDe(t); if (!tit) n.titulo = t[doc.idioma] ?? t.es; delete n.texto; }
  if (n.tipo === 'matrizFases') n.matriz = { celdas: {}, filas: [], cabecera: null };
  const lista = padre ? doc.nodos[padre]?.hijos : doc.raiz;
  const cb = { id: uuid(), n: null, c: '+nodo', v: n, p: padre, i: i ?? lista?.length ?? 0, a: autor, r: (doc.reloj || 0) + 1, t: ahora() };
  aplicar(doc, cb); anotar(doc, cb);
  return n;
}

/** Añade otro apartado repetible (PLAE 3…). */
export function anadirRepetido(doc, id, autor = '') {
  const n = doc.nodos[id]; if (!n?.repetible) return null;
  const k = nodosVivos(doc, n.hijos).length + 1;
  const h = anadirNodo(doc, { padre: id, autor });
  editar(doc, h.id, 'titulo', '', autor);
  h.k = `${n.k}.${k}`; h.en = n.repetible.en.replace('{n}', k); h.es = n.repetible.es.replace('{n}', k); delete h.propio;
  return h;
}

/** Quita un apartado (se puede deshacer: solo se marca). */
export const quitarNodo = (doc, id, autor = '') => editar(doc, id, 'quitado', true, autor);

/** Mueve un apartado entre sus hermanos (`delta` = −1 sube, +1 baja). */
export function moverNodo(doc, id, delta, autor = '') {
  const p = padreDe(doc, id);
  const lista = (p ? p.hijos : doc.raiz).slice();
  const i = lista.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return null;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return p ? editar(doc, p.id, 'hijos', lista, autor) : editar(doc, '_doc', 'raiz', lista, autor);
}

/** Deshace un cambio propio (vuelve el valor anterior, como un cambio nuevo). */
export function deshacer(doc, cb, autor = '') {
  if (!cb) return null;
  if (cb.c === '+nodo') return quitarNodo(doc, cb.v.id, autor);
  return editar(doc, cb.n, cb.c, cb.antes ?? null, autor);
}

/**
 * Mete los cambios de otro usuario. Los repetidos se ignoran; en cada campo
 * gana el cambio con el reloj más alto (y, si empatan, el autor «mayor»).
 * @returns cuántos se aplicaron
 */
export function fusionar(doc, cambios) {
  const vistos = new Set(doc.cambios.map((c) => c.id));
  let n = 0;
  for (const cb of [...cambios].sort((a, b) => (a.r - b.r) || String(a.a).localeCompare(String(b.a)))) {
    if (vistos.has(cb.id)) continue;
    vistos.add(cb.id);
    if (aplicar(doc, cb)) n++;
    anotar(doc, cb);
  }
  return n;
}

/** Cambios desde un reloj dado (para mandar solo lo nuevo). */
export const cambiosDesde = (doc, reloj = 0) => doc.cambios.filter((c) => c.r > reloj);

// ---------------------------------------------------------------- pasar el contenido a otra plantilla
const tieneTexto = (html) => Boolean(String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
/** ¿Tiene algo escrito este nodo? */
export function conContenido(n) {
  if (!n) return false;
  if (tieneTexto(n.texto)) return true;
  if (n.tabla?.filas?.some((f) => !f.fija && Object.values(f.c ?? {}).some((v) => String(v ?? '').trim())) || n.tabla?.filas?.some((f) => f.fija && Object.entries(f.c ?? {}).some(([k, v]) => k !== n.tabla.cols[0]?.k && String(v ?? '').trim()))) return true;
  if (n.org?.unidades?.length) return true;
  if (n.matriz && (Object.values(n.matriz.celdas ?? {}).some((f) => Object.values(f).some((v) => String(v ?? '').trim())) || Object.values(n.matriz.bpt ?? {}).some((v) => String(v ?? '').trim()))) return true;
  if (n.valores && Object.values(n.valores).some((v) => (typeof v === 'object' ? Object.values(v ?? {}).some(Boolean) : String(v ?? '').trim()))) return true;
  if (n.firma && Object.values(n.firma).some((v) => String(v ?? '').trim())) return true;
  return false;
}

/** Copia una tabla en otra emparejando columnas por clave. Lo que no tiene columna se devuelve aparte. */
function pasarTabla(origen, destino) {
  const claves = new Set(destino.cols.map((c) => c.k));
  const sobra = origen.cols.filter((c) => !claves.has(c.k)).map((c) => c.k);
  const filas = origen.filas.filter((f) => !f.fija || Object.values(f.c ?? {}).some(Boolean));
  if (destino.filas.some((f) => f.fija)) {
    // Filas fijas (categorías): se emparejan por su primera celda
    const k0 = destino.cols[0].k;
    for (const f of destino.filas) {
      const o = origen.filas.find((x) => JSON.stringify(x.c?.[origen.cols[0].k]) === JSON.stringify(f.c[k0]));
      if (o) for (const c of destino.cols.slice(1)) if (o.c?.[c.k] != null) f.c[c.k] = o.c[c.k];
    }
  } else {
    destino.filas = filas.map((f) => ({ id: f.id, c: Object.fromEntries(Object.entries(f.c ?? {}).filter(([k]) => claves.has(k))) }));
    while (destino.filas.length < 2) destino.filas.push({ id: uuid(), c: {} });
  }
  return sobra.length && filas.some((f) => sobra.some((k) => String(f.c?.[k] ?? '').trim())) ? sobra : [];
}

/**
 * Pasa una OPORD a otra plantilla: crea la estructura nueva y mete en cada
 * apartado lo que había en el apartado de la misma clave (texto, tablas,
 * organización, matriz, firma y lo añadido a mano dentro de él). Lo que no
 * tiene sitio no se pierde: va a un apartado final «Sin sitio en esta plantilla».
 * Conserva el id, la operación, la cabecera, los anexos y el registro de cambios.
 */
export function cambiarPlantilla(doc, plantillaId, { autor = '' } = {}) {
  const nuevo = crearOpord(plantillaId, { operacion: doc.operacion, autor, idioma: doc.idioma });
  Object.assign(nuevo, { id: doc.id, cabecera: copia(doc.cabecera), anexos: [...doc.anexos], autor: doc.autor, creado: doc.creado, cambios: doc.cambios, reloj: doc.reloj, _v: copia(doc._v) });
  const viejos = new Map();
  recorrer(doc, (n) => { if (!viejos.has(n.k)) viejos.set(n.k, n); });
  const usados = new Set();
  const pasarNodo = (n, v) => {
    usados.add(v.id);
    if (v.titulo) n.titulo = v.titulo;
    if (tieneTexto(v.texto)) n.texto = v.texto;
    if (v.tabla && n.tabla && !(n.tipo === 'agregaciones')) { const sobra = pasarTabla(v.tabla, n.tabla); if (sobra.length) usados.delete(v.id); }
    else if (v.tabla && !n.tabla && (v.tabla.filas ?? []).length) { n.tabla = copia(v.tabla); }
    if (v.tipo === 'agregaciones' && n.tipo === 'agregaciones') n.tabla = copia(v.tabla);
    if (v.org && n.org) n.org = copia(v.org);
    if (v.matriz && n.matriz) n.matriz = copia(v.matriz);
    if (v.firma && n.firma) n.firma = copia(v.firma);
    if (v.valores && n.valores) n.valores = copia(v.valores);
    if (v.enlaces) n.enlaces = [...v.enlaces];
    // Hijos añadidos a mano y fases: se llevan tal cual
    for (const id of v.hijos) {
      const h = doc.nodos[id]; if (!h || h.quitado) continue;
      if (h.propio || h.fase) { copiarRama(doc, nuevo, h, n); marcarUsados(doc, h, usados); }
    }
    // Repetibles (PLAE 3, 4…) que la plantilla nueva no tiene
    if (v.repetible && n.repetible) {
      const ya = new Set(n.hijos.map((id) => nuevo.nodos[id]?.k));
      for (const id of v.hijos) { const h = doc.nodos[id]; if (h && !h.quitado && !h.propio && !ya.has(h.k)) { copiarRama(doc, nuevo, h, n); marcarUsados(doc, h, usados); } }
    }
  };
  recorrer(nuevo, (n) => { const v = viejos.get(n.k); if (v && !usados.has(v.id)) pasarNodo(n, v); });
  // Lo que se queda sin sitio
  const sobrantes = [];
  recorrer(doc, (v) => { if (!usados.has(v.id) && conContenido(v) && !v.fase) sobrantes.push(v); });
  if (sobrantes.length) {
    const s = { id: uuid(), k: '__sobrantes', en: 'Not placed in this template', es: 'Sin sitio en esta plantilla', tipo: 'texto', texto: '', hijos: [], sinNumero: true, autor, t: ahora(), _v: {} };
    nuevo.nodos[s.id] = s;
    for (const v of sobrantes) {
      const c = { ...copia(v), id: uuid(), hijos: [], titulo: v.titulo || '', propio: true };
      nuevo.nodos[c.id] = c; s.hijos.push(c.id);
    }
    const i = nuevo.raiz.findIndex((id) => nuevo.nodos[id].sinNumero);
    nuevo.raiz.splice(i < 0 ? nuevo.raiz.length : i, 0, s.id);
  }
  nuevo.plantilla = plantillaId; tocar(nuevo);
  return nuevo;
}
function copiarRama(origen, destino, n, padreNuevo) {
  const c = { ...copia(n), hijos: [] };
  destino.nodos[c.id] = c; padreNuevo.hijos.push(c.id);
  for (const id of n.hijos) { const h = origen.nodos[id]; if (h && !h.quitado) copiarRama(origen, destino, h, c); }
}
function marcarUsados(doc, n, usados) { usados.add(n.id); for (const id of n.hijos) { const h = doc.nodos[id]; if (h) marcarUsados(doc, h, usados); } }

// ---------------------------------------------------------------- texto
/** HTML del editor (párrafos, negrita, cursiva, subrayado, listas) → líneas de texto con sangría de lista. */
export function htmlALineas(html) {
  const s = String(html ?? '')
    .replace(/\r/g, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h\d)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
}

/** Limpia el HTML pegado o escrito: solo párrafos, saltos, negrita, cursiva, subrayado y listas. */
export function limpiarHtml(html) {
  const permitidas = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'div']);
  return String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, t) => (permitidas.has(t.toLowerCase()) ? m.replace(/\s[^>]*/, '').replace(/^<\/?[a-z0-9]+/i, (x) => x.toLowerCase()) : ''));
}

// ---------------------------------------------------------------- GDH
const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** Grupo fecha-hora OTAN: «031500Z MAY 26». */
export function gdh(fecha = new Date(), huso = 'Z') {
  const d = new Date(fecha); const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${huso} ${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}
/** ¿Es un GDH válido? Acepta «031500Z MAY 26», «031500ZMAY26» y los meses en castellano (ENE, ABR, AGO, DIC). */
export function esGdh(s) {
  const m = String(s ?? '').trim().toUpperCase().match(/^(\d{2})(\d{2})(\d{2})([A-Z])\s?([A-Z]{3})\s?(\d{2})$/);
  if (!m) return false;
  const [, d, h, mi, , mes] = m;
  const meses = new Set([...MESES, 'ENE', 'ABR', 'AGO', 'DIC']);
  return +d >= 1 && +d <= 31 && +h <= 23 && +mi <= 59 && meses.has(mes);
}
/** Normaliza a «DDHHMMZ MMM AA». */
export function normalizarGdh(s) {
  const m = String(s ?? '').trim().toUpperCase().match(/^(\d{6}[A-Z])\s?([A-Z]{3})\s?(\d{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(s ?? '').trim().toUpperCase();
}

/** Nombre de archivo seguro. */
export const nombreArchivo = (s) => String(s || 'OPORD').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'OPORD';

/** Título del documento: «OPERATION ORDER (OPORD) 01 – WINGO3» / «ANNEX B TO OPORD 01 – WINGO3». */
export function tituloDocumento(doc, opord = null) {
  const en = doc.idioma === 'en';
  if (doc.tipo === 'anexo') {
    const base = opord ? tituloDocumento(opord).replace(/^(OPERATION ORDER \(OPORD\)|ORDEN DE OPERACIONES \(OPORD\))\s*/, '') : '';
    const letra = opord ? letraAnexo(opord, doc.id) : '?';
    const nombre = doc.cabecera.titulo || ANEXOS[doc.plantilla]?.[doc.idioma] || '';
    return `${en ? 'ANNEX' : 'ANEXO'} ${letra}${base ? ` ${en ? 'TO OPORD' : 'A LA OPORD'} ${base}` : ''}${nombre ? ` — ${nombre.toUpperCase()}` : ''}`;
  }
  const c = doc.cabecera;
  const resto = [c.numero, c.nombre].filter(Boolean).join(' – ');
  return `${en ? 'OPERATION ORDER (OPORD)' : 'ORDEN DE OPERACIONES (OPORD)'}${resto ? ` ${resto}` : ''}`;
}
