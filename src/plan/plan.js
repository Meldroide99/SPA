// Modelo del plan (fase 3): elementos dibujados, sus medidas e historial.
//
// No depende del mapa ni de la página: se prueba en Node.
// Formato según docs/ESPECIFICACION.md §4. Las geometrías son GeoJSON
// (orden [longitud, latitud]); el círculo se guarda como un Point con
// `propiedades.radio` en metros (GeoJSON no tiene círculos), y al dibujarlo
// o exportarlo se convierte en polígono geodésico.
//
// Todas las medidas salen del motor geodésico verificado (src/geo).

import { longitudLinea, areaPoligono, medir, destino } from '../geo/index.js';

export const TIPOS = Object.freeze({
  punto: { nombre: 'Punto', min: 1 },
  linea: { nombre: 'Línea', min: 2 },
  area: { nombre: 'Área', min: 3 },
  circulo: { nombre: 'Círculo', min: 1 },
});

/** Bandos (colores de afiliación de APP-6 para gráficos tácticos). */
export const BANDOS = Object.freeze({
  propio: { nombre: 'Propio', color: '#1F5FA8' },
  enemigo: { nombre: 'Enemigo', color: '#C0392B' },
  neutral: { nombre: 'Neutral', color: '#2E7D32' },
  desconocido: { nombre: 'Desconocido', color: '#B8860B' },
});

/** Estado: presente (trazo continuo) o previsto (discontinuo), como en APP-6. */
export const ESTADOS = Object.freeze({
  presente: { nombre: 'Presente' },
  previsto: { nombre: 'Previsto' },
});

const ahora = () => new Date().toISOString();
const uuid = () => (globalThis.crypto?.randomUUID?.()
  ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));

/** Plan vacío. */
export function crearPlan(nombre = 'Plan sin nombre') {
  const t = ahora();
  return {
    formato: 'spa-plan', version: 1, id: uuid(), nombre,
    creado: t, modificado: t, datum: 'WGS84',
    capas: [{ id: 'principal', nombre: 'Principal', visible: true, orden: 0 }],
    elementos: [], opord: {},
  };
}

/** Convierte puntos {lat,lon} en geometría GeoJSON del tipo dado. */
export function geometria(tipo, puntos) {
  const c = puntos.map((p) => [p.lon, p.lat]);
  if (tipo === 'punto' || tipo === 'circulo') return { type: 'Point', coordinates: c[0] };
  if (tipo === 'linea') return { type: 'LineString', coordinates: c };
  if (tipo === 'area') return { type: 'Polygon', coordinates: [[...c, c[0]]] }; // anillo cerrado
  throw new Error(`Tipo desconocido: ${tipo}`);
}

/** Puntos {lat,lon} de un elemento (sin repetir el cierre del área). */
export function puntosDe(el) {
  const g = el.geometria;
  if (g.type === 'Point') return [{ lat: g.coordinates[1], lon: g.coordinates[0] }];
  if (g.type === 'LineString') return g.coordinates.map(([lon, lat]) => ({ lat, lon }));
  if (g.type === 'Polygon') return g.coordinates[0].slice(0, -1).map(([lon, lat]) => ({ lat, lon }));
  return [];
}

/** Nuevo elemento. `puntos` en {lat,lon}; para el círculo, el centro y `radio`. */
export function nuevoElemento(tipo, puntos, opc = {}) {
  if (!TIPOS[tipo]) throw new Error(`Tipo desconocido: ${tipo}`);
  if (puntos.length < TIPOS[tipo].min) throw new Error(`${TIPOS[tipo].nombre}: hacen falta al menos ${TIPOS[tipo].min} puntos`);
  const t = ahora();
  const propiedades = {
    nombre: opc.nombre ?? '', notas: '',
    bando: opc.bando ?? 'propio', estado: opc.estado ?? 'presente',
  };
  if (tipo === 'circulo') {
    if (!(opc.radio > 0)) throw new Error('Círculo: el radio debe ser mayor que 0');
    propiedades.radio = opc.radio;
  }
  return {
    id: uuid(), tipo, geometria: geometria(tipo, puntos), simbolo: null, propiedades,
    capa: 'principal', creado: t, modificado: t, autor: '', fuente: 'manual', hora: null, version: 1,
  };
}

/** Cambia los puntos de un elemento (mismo tipo). */
export function moverPuntos(el, puntos) {
  if (puntos.length < TIPOS[el.tipo].min) throw new Error(`${TIPOS[el.tipo].nombre}: hacen falta al menos ${TIPOS[el.tipo].min} puntos`);
  el.geometria = geometria(el.tipo, puntos);
  tocar(el);
}

/** Marca un elemento como modificado. */
export function tocar(el) { el.modificado = ahora(); el.version = (el.version || 1) + 1; }

/**
 * Polígono geodésico que representa un círculo: cada vértice está
 * exactamente a `radio` metros del centro (sobre el elipsoide).
 */
export function puntosCirculo(centro, radio, n = 180) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const d = destino(centro, (360 * i) / n, radio);
    pts.push({ lat: d.lat, lon: d.lon });
  }
  return pts;
}

/**
 * Medidas de un elemento, con el motor geodésico.
 * - línea: longitud (elipsoide) y longitud sobre el mapa (cuadrícula UTM), tramos
 * - área: superficie y perímetro (lados geodésicos)
 * - círculo: radio, diámetro, superficie y perímetro
 */
export function medidasDe(el) {
  const pts = puntosDe(el);
  if (el.tipo === 'punto') return { tipo: 'punto', posicion: pts[0] };
  if (el.tipo === 'circulo') {
    const r = el.propiedades.radio;
    const { area, perimetro } = areaPoligono(puntosCirculo(pts[0], r, 720));
    return { tipo: 'circulo', centro: pts[0], radio: r, diametro: 2 * r, area, perimetro };
  }
  const tramos = [];
  const cerrado = el.tipo === 'area' ? [...pts, pts[0]] : pts;
  let mapaTotal = 0;
  for (let i = 1; i < cerrado.length; i++) {
    const m = medir(cerrado[i - 1], cerrado[i]);
    tramos.push({ de: i - 1, a: i % pts.length, distancia: m.distancia, rumbo: m.rumbo, rumboCuadricula: m.rumboCuadricula, distanciaCuadricula: m.distanciaCuadricula });
    mapaTotal += m.distanciaCuadricula;
  }
  if (el.tipo === 'linea') return { tipo: 'linea', longitud: longitudLinea(pts), longitudMapa: mapaTotal, tramos };
  const { area, perimetro } = areaPoligono(pts);
  return { tipo: 'area', area, perimetro, perimetroMapa: mapaTotal, tramos };
}

/** Superficie legible: m², ha o km². */
export function formatearArea(m2) {
  const n = (v, d) => v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (m2 < 10000) return `${n(m2, 0)} m²`;
  if (m2 < 1e6) return `${n(m2 / 10000, 2)} ha`;
  return `${n(m2 / 1e6, 3)} km² (${n(m2 / 10000, 0)} ha)`;
}

/**
 * Historial de cambios del plan, con deshacer y rehacer.
 * Guarda copias de la lista de elementos (los planes tácticos son pequeños).
 */
export class Historial {
  constructor(plan, { limite = 200, alCambiar = () => {} } = {}) {
    this.plan = plan; this.limite = limite; this.alCambiar = alCambiar;
    this.atras = []; this.adelante = [];
  }

  /** Ejecuta `fn(plan)` como un cambio que se puede deshacer. */
  hacer(descripcion, fn) {
    const antes = JSON.stringify(this.plan.elementos);
    const r = fn(this.plan);
    if (JSON.stringify(this.plan.elementos) === antes) return r; // nada cambió
    this.atras.push({ descripcion, elementos: antes });
    if (this.atras.length > this.limite) this.atras.shift();
    this.adelante.length = 0;
    this.plan.modificado = ahora();
    this.alCambiar(this);
    return r;
  }

  get puedeDeshacer() { return this.atras.length > 0; }
  get puedeRehacer() { return this.adelante.length > 0; }
  get ultimo() { return this.atras.at(-1)?.descripcion ?? ''; }
  get siguiente() { return this.adelante.at(-1)?.descripcion ?? ''; }

  deshacer() {
    const paso = this.atras.pop(); if (!paso) return false;
    this.adelante.push({ descripcion: paso.descripcion, elementos: JSON.stringify(this.plan.elementos) });
    this.plan.elementos = JSON.parse(paso.elementos);
    this.alCambiar(this);
    return paso.descripcion;
  }

  rehacer() {
    const paso = this.adelante.pop(); if (!paso) return false;
    this.atras.push({ descripcion: paso.descripcion, elementos: JSON.stringify(this.plan.elementos) });
    this.plan.elementos = JSON.parse(paso.elementos);
    this.alCambiar(this);
    return paso.descripcion;
  }
}

/** Comprueba que un objeto tiene forma de plan (al leerlo del almacenamiento). */
export function esPlan(o) {
  return Boolean(o && o.formato === 'spa-plan' && Array.isArray(o.elementos));
}
