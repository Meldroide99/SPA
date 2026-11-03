// Piezas comunes de la ficha lateral (panel del elemento): selector de color
// y trazo, altitud de un punto y perfil de una línea.

import { BANDOS, TRAZOS, GROSORES, muestrasPerfil } from '../plan/plan.js';
import { resumenPerfil } from '../datos/alturas.js';
import { longitudLinea } from '../geo/index.js';
import { pintarPerfil } from './perfil.js';
import { esc } from './formas.js';

/** Solo un «dueño» (lo dibujado o lo importado) usa la ficha a la vez. */
export function tomarFicha(dueno) { document.dispatchEvent(new CustomEvent('spa:ficha', { detail: dueno })); }
export function alPerderFicha(dueno, fn) { document.addEventListener('spa:ficha', (e) => { if (e.detail !== dueno) fn(); }); }

/** Botones de bando (color) + color libre. */
export function htmlColor({ bando, color }, campo) {
  const libre = color && !Object.values(BANDOS).some((b) => b.color.toLowerCase() === color.toLowerCase());
  return `<div class="el-fila"><div class="seg el-bando" data-campo="${campo}">${Object.entries(BANDOS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${!libre && k === bando}" title="${v.nombre}" style="--c:${v.color}"><i></i>${v.nombre}</button>`).join('')}</div>
    <label class="color-libre${libre ? ' activo' : ''}" title="Otro color"><input type="color" data-campo="${campo}-libre" value="${libre ? color : '#7a3db8'}"><span>Otro</span></label></div>`;
}

/** Tipo de trazo y grosor. */
export function htmlTrazo({ trazo, grosor }, campo) {
  return `<div class="el-fila"><span class="el-et">Trazo</span><div class="seg" data-campo="${campo}-trazo">${Object.entries(TRAZOS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === trazo}">${v.nombre}</button>`).join('')}</div></div>
    <div class="el-fila"><span class="el-et">Grosor</span><div class="seg" data-campo="${campo}-grosor">${GROSORES.map((g) => `<button type="button" data-v="${g}" aria-pressed="${g === grosor}"><span class="muestra-grosor" style="height:${g}px"></span></button>`).join('')}</div></div>`;
}

/** Línea de altitud de un punto (se rellena cuando llega el dato). */
export function htmlAltitud(id = 'el-altitud') {
  return `<div class="el-altitud"><span class="el-et">Altitud</span><b id="${id}">…</b></div>`;
}
export async function rellenarAltitud(alturas, p, id = 'el-altitud') {
  const caja = () => document.getElementById(id);
  try {
    const z = await alturas.altura(p.lat, p.lon);
    if (caja()) caja().textContent = z === null ? 'sin datos' : `${Math.round(z)} m`;
    return z;
  } catch {
    if (caja()) caja().textContent = 'sin conexión con el IGN';
    return null;
  }
}

/** Bloque de distancia + desnivel + perfil para una línea. */
export function htmlLinea(puntos, fmt) {
  return `<div class="pm-total"><div class="grande">${fmt.metros(longitudLinea(puntos))}</div><div class="peq">Distancia</div></div>
    <div class="el-desnivel" id="el-desnivel"><span>…</span></div>
    <div class="perfil" id="el-perfil"></div>`;
}

const cachePerfiles = new Map();
/**
 * Calcula y pinta el perfil (MDT05 del IGN).
 * @param {string} clave identifica la geometría (para no repetir el cálculo)
 */
export async function rellenarPerfil(puntos, alturas, clave, alMover) {
  let r = cachePerfiles.get(clave);
  if (!r) {
    const m = muestrasPerfil(puntos);
    const zs = await alturas.alturas(m);
    m.forEach((s, i) => { s.z = zs[i]; });
    r = { m, resumen: resumenPerfil(m) };
    cachePerfiles.set(clave, r);
    if (cachePerfiles.size > 50) cachePerfiles.delete(cachePerfiles.keys().next().value);
  }
  const des = document.getElementById('el-desnivel'), caja = document.getElementById('el-perfil');
  if (!des || !caja) return r;
  const s = r.resumen;
  if (s.min === null) { des.innerHTML = '<span>Sin datos de altura</span>'; caja.innerHTML = ''; return r; }
  des.innerHTML = `<span title="Desnivel acumulado de subida">↗ <b>${Math.round(s.subida)} m</b></span><span title="Desnivel acumulado de bajada">↘ <b>${Math.round(s.bajada)} m</b></span>
    <span title="Altitud mínima y máxima">${Math.round(s.min)}–${Math.round(s.max)} m</span><span title="Altitud inicial y final">${Math.round(s.inicio)} → ${Math.round(s.fin)} m</span>`;
  pintarPerfil(caja, r.m, alMover);
  return r;
}


