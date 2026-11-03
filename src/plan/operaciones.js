// Operaciones: paquetes de datos anidados dentro del plan.
//
// Una operación agrupa objetos del plan y puede contener otras (fases,
// saltos, lo que el usuario quiera, con el nombre que quiera). Cada objeto
// está como mucho en un paquete (`el.paquete`); pertenece también a todos los
// paquetes por encima de ese. Los paquetes de primer nivel tienen estado:
// en curso, futura o pasada.
//
// Qué se ve (ojos, «ver solo esta») es de cada usuario y no se guarda en el
// plan: va aparte, en `vista` ({ ocultos: [ids], solo: id|null }).
//
// Preparado para varios usuarios: cada paquete lleva `origen` ('local' o el
// servidor del que vino), `autor` y `version`. Lo que se suba o se guarde
// solo para uno se decidirá con el servidor (fase de usuarios).
//
// No depende del mapa ni de la página: se prueba en Node.

import { puntosDe, puntosCirculo } from './plan.js';
import { medir, puntosGeodesica } from '../geo/index.js';

export const ESTADOS_OP = Object.freeze({
  curso: { nombre: 'En curso', corto: 'En curso' },
  futura: { nombre: 'Futuras', corto: 'Futura' },
  pasada: { nombre: 'Pasadas', corto: 'Pasada' },
});

/** Categorías para filtrar los objetos. */
export const CATEGORIAS = Object.freeze({
  unidad: { nombre: 'Unidades' },
  linea: { nombre: 'Líneas de coordinación' },
  cometido: { nombre: 'Cometidos' },
  dibujo: { nombre: 'Dibujos' },
});

const ahora = () => new Date().toISOString();
const uuid = () => (globalThis.crypto?.randomUUID?.()
  ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));

/** Lista de paquetes del plan (la crea si no existe: planes antiguos). */
export const paquetes = (plan) => (plan.operaciones ??= []);
export const buscarPaquete = (plan, id) => paquetes(plan).find((o) => o.id === id) ?? null;

/** Nuevo paquete. Sin padre es una operación (con estado); con padre, una fase, salto… */
export function nuevoPaquete(plan, nombre, { padre = null, estado = 'curso', autor = '' } = {}) {
  if (padre && !buscarPaquete(plan, padre)) throw new Error('El paquete padre no existe');
  const t = ahora();
  const o = {
    id: uuid(), nombre: String(nombre || '').trim() || (padre ? 'Fase' : 'Operación'), padre,
    estado: padre ? null : (ESTADOS_OP[estado] ? estado : 'curso'),
    notas: '', autor, origen: 'local', creado: t, modificado: t, version: 1,
  };
  paquetes(plan).push(o);
  return o;
}

/** Hijos directos (null: operaciones de primer nivel), en orden de creación. */
export const hijos = (plan, id = null) => paquetes(plan).filter((o) => (o.padre ?? null) === id);

/** Del primer nivel al paquete: [operación, fase, …]. */
export function ruta(plan, id) {
  const out = []; const vistos = new Set();
  for (let o = buscarPaquete(plan, id); o && !vistos.has(o.id); o = buscarPaquete(plan, o.padre)) { vistos.add(o.id); out.unshift(o); }
  return out;
}
export const raiz = (plan, id) => ruta(plan, id)[0] ?? null;
export const nombreRuta = (plan, id, sep = ' › ') => ruta(plan, id).map((o) => o.nombre).join(sep);

/** El paquete y todos los que cuelgan de él (ids). */
export function descendientes(plan, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const h of hijos(plan, out[i])) out.push(h.id);
  return out;
}

/** Objetos de un paquete (con los de sus fases si `recursivo`). id null: los que no están en ninguno. */
export function objetosDe(plan, id, { recursivo = true } = {}) {
  if (id === null) return plan.elementos.filter((e) => !e.paquete || !buscarPaquete(plan, e.paquete));
  const ids = new Set(recursivo ? descendientes(plan, id) : [id]);
  return plan.elementos.filter((e) => ids.has(e.paquete));
}

/** Mete objetos en un paquete (null: los saca de cualquiera). */
export function asignar(plan, idsObjetos, id) {
  if (id && !buscarPaquete(plan, id)) throw new Error('El paquete no existe');
  const ids = new Set(idsObjetos);
  for (const e of plan.elementos) if (ids.has(e.id)) { e.paquete = id || null; e.modificado = ahora(); }
}

/** Cambia de sitio un paquete (sin crear ciclos). Con padre null pasa a operación. */
export function moverPaquete(plan, id, nuevoPadre) {
  const o = buscarPaquete(plan, id); if (!o) return false;
  if (nuevoPadre && descendientes(plan, id).includes(nuevoPadre)) return false;
  o.padre = nuevoPadre || null;
  if (!o.padre && !o.estado) o.estado = 'curso';
  if (o.padre) o.estado = null;
  tocarPaquete(o);
  return true;
}

export function tocarPaquete(o) { o.modificado = ahora(); o.version = (o.version || 1) + 1; }

/**
 * Borra un paquete y sus fases. Con `conObjetos` borra también sus objetos;
 * si no, los objetos pasan al paquete de arriba (o quedan sueltos).
 */
export function borrarPaquete(plan, id, { conObjetos = false } = {}) {
  const o = buscarPaquete(plan, id); if (!o) return;
  const ids = new Set(descendientes(plan, id));
  if (conObjetos) plan.elementos = plan.elementos.filter((e) => !ids.has(e.paquete));
  else for (const e of plan.elementos) if (ids.has(e.paquete)) e.paquete = o.padre ?? null;
  plan.operaciones = paquetes(plan).filter((p) => !ids.has(p.id));
}

/** Duplica un paquete con sus fases y objetos (ids nuevos). */
export function duplicarPaquete(plan, id, { padre } = {}) {
  const o = buscarPaquete(plan, id); if (!o) return null;
  const mapa = new Map();
  const copiar = (p, nuevoPadre) => {
    const c = { ...JSON.parse(JSON.stringify(p)), id: uuid(), padre: nuevoPadre, creado: ahora(), modificado: ahora(), version: 1, origen: 'local' };
    if (!c.padre && !c.estado) c.estado = 'curso';
    paquetes(plan).push(c); mapa.set(p.id, c.id);
    for (const h of hijos(plan, p.id)) if (!mapa.has(h.id)) copiar(h, c.id);
    return c;
  };
  const c = copiar(o, padre === undefined ? o.padre : padre);
  if (c.padre === o.padre) c.nombre = `${o.nombre} (copia)`;
  const nuevos = plan.elementos.filter((e) => mapa.has(e.paquete)).map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: uuid(), paquete: mapa.get(e.paquete) }));
  plan.elementos.push(...nuevos);
  return c;
}

// ---------------------------------------------------------------- visibilidad (de cada usuario)
/**
 * ¿Se ve el objeto? Se oculta si su paquete o alguno de arriba está oculto,
 * o si hay un paquete en «ver solo» y el objeto no está dentro.
 */
export function esVisible(plan, el, vista = {}) {
  const ocultos = vista.ocultos instanceof Set ? vista.ocultos : new Set(vista.ocultos ?? []);
  const cadena = el.paquete ? ruta(plan, el.paquete).map((o) => o.id) : [];
  if (vista.sueltosOcultos && !cadena.length) return false;
  if (cadena.some((id) => ocultos.has(id))) return false;
  if (vista.solo && buscarPaquete(plan, vista.solo) && !cadena.includes(vista.solo)) return false;
  return true;
}

// ---------------------------------------------------------------- categorías y filtros
/** Categoría de un objeto según su símbolo. `medidaDe(id)` da la medida del catálogo. */
export function categoriaDe(el, medidaDe = () => null) {
  if (el.simbolo?.clase === 'unidad') return 'unidad';
  if (el.simbolo?.clase === 'medida') return medidaDe(el.simbolo.id)?.grupo === 'cometidos' ? 'cometido' : 'linea';
  return 'dibujo';
}

/**
 * Filtra objetos. `f`: { texto, categorias:Set, bandos:Set, estados:Set, paquete: id|''|null }
 * (paquete '' = todos; null = sin operación). `titulo(el)` da el nombre visible.
 */
export function filtrar(plan, f = {}, { titulo = (e) => e.propiedades?.nombre ?? '', medidaDe } = {}) {
  const q = norm(f.texto ?? '');
  const enPaquete = f.paquete === undefined || f.paquete === '' ? null : new Set(f.paquete === null ? [] : descendientes(plan, f.paquete));
  return plan.elementos.filter((e) => {
    if (f.categorias?.size && !f.categorias.has(categoriaDe(e, medidaDe))) return false;
    if (f.bandos?.size && !f.bandos.has(e.propiedades.bando)) return false;
    if (f.estados?.size && !f.estados.has(e.propiedades.estado)) return false;
    if (enPaquete) {
      if (f.paquete === null) { if (e.paquete && buscarPaquete(plan, e.paquete)) return false; } else if (!enPaquete.has(e.paquete)) return false;
    }
    if (q && !norm(`${titulo(e)} ${e.propiedades.nombre} ${e.paquete ? nombreRuta(plan, e.paquete, ' ') : ''}`).includes(q)) return false;
    return true;
  });
}
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// ---------------------------------------------------------------- lazo (círculo de selección)
/** Puntos representativos de un objeto: vértices y, en tramos, puntos intermedios. */
function puntosMuestra(tipo, pts, radio) {
  if (tipo === 'circulo') return puntosCirculo(pts[0], radio, 36);
  if (tipo === 'punto') return pts;
  const cerrado = tipo === 'area' ? [...pts, pts[0]] : pts;
  const out = [pts[0]];
  for (let i = 1; i < cerrado.length; i++) out.push(...puntosGeodesica(cerrado[i - 1], cerrado[i], 8).slice(1));
  return out;
}

/**
 * ¿Dónde queda una forma respecto a un círculo (geodésico)?
 * 'dentro' (entera), 'toca' (en parte) o null (fuera).
 */
export function enCirculo({ tipo, puntos, radio }, centro, r) {
  const m = puntosMuestra(tipo, puntos, radio);
  const dentro = m.map((p) => medir(centro, p).distancia <= r);
  if (dentro.every(Boolean)) return 'dentro';
  if (dentro.some(Boolean)) return 'toca';
  // Área o círculo que envuelve el lazo entero
  if (tipo === 'circulo' && medir(puntos[0], centro).distancia + r <= radio) return 'toca';
  return null;
}

/** Objetos del plan dentro del círculo: [{ el, como: 'dentro'|'toca' }]. */
export function objetosEnCirculo(plan, centro, r, { visible = () => true } = {}) {
  const out = [];
  for (const el of plan.elementos) {
    if (!visible(el)) continue;
    const como = enCirculo({ tipo: el.tipo, puntos: puntosDe(el), radio: el.propiedades.radio }, centro, r);
    if (como) out.push({ el, como });
  }
  return out;
}

// ---------------------------------------------------------------- paquetes para enviar y recibir
/**
 * Paquete SPA con unos objetos y los paquetes que los contienen (para
 * exportar, enviar o pasar a otro usuario). Se vuelve a abrir con
 * `abrirPaquete`, que lo mete en el plan como una operación editable.
 */
export function crearPaqueteSpa(plan, objetos, { nombre = 'Paquete SPA', autor = '' } = {}) {
  const ids = new Set();
  for (const e of objetos) for (const o of e.paquete ? ruta(plan, e.paquete) : []) ids.add(o.id);
  return {
    formato: 'spa-paquete', version: 1, nombre, autor, creado: ahora(), datum: 'WGS84',
    operaciones: paquetes(plan).filter((o) => ids.has(o.id)).map((o) => JSON.parse(JSON.stringify(o))),
    elementos: objetos.map((e) => JSON.parse(JSON.stringify(e))),
  };
}

export const esPaqueteSpa = (o) => Boolean(o && (o.formato === 'spa-paquete' || o.formato === 'spa-plan') && Array.isArray(o.elementos));

/**
 * Mete un paquete recibido en el plan: una operación nueva (con el nombre del
 * paquete) que contiene sus operaciones y objetos, con ids nuevos para no
 * pisar nada. Todo queda editable. Devuelve la operación creada.
 */
export function abrirPaquete(plan, pq, { estado = 'curso' } = {}) {
  if (!esPaqueteSpa(pq)) throw new Error('No es un paquete de SPA');
  const raizNueva = nuevoPaquete(plan, pq.nombre || 'Paquete recibido', { estado });
  raizNueva.origen = pq.autor ? `recibido de ${pq.autor}` : 'recibido';
  const mapa = new Map();
  const ops = (pq.operaciones ?? []).filter((o) => o && o.id);
  // Padres antes que hijos
  const pendientes = [...ops];
  let vueltas = 0;
  while (pendientes.length && vueltas++ < 1000) {
    const o = pendientes.shift();
    if (o.padre && ops.some((x) => x.id === o.padre) && !mapa.has(o.padre)) { pendientes.push(o); continue; }
    const padre = o.padre && mapa.has(o.padre) ? mapa.get(o.padre) : raizNueva.id;
    const c = { ...o, id: uuid(), padre, estado: null, origen: raizNueva.origen, modificado: ahora() };
    paquetes(plan).push(c); mapa.set(o.id, c.id);
  }
  for (const e of pq.elementos) {
    if (!e?.geometria) continue;
    plan.elementos.push({ ...JSON.parse(JSON.stringify(e)), id: uuid(), paquete: mapa.get(e.paquete) ?? raizNueva.id });
  }
  return raizNueva;
}
