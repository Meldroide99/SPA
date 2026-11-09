// Organización operativa en gráfico (editor, vista del documento y Word):
// símbolos APP-6 colocados con la disposición de opord/organigrama.js.

import { svgUnidad, ESCALONES } from '../simbolos/app6.js';
import { ARMAS } from '../simbolos/catalogo.js';
import { CAJA, SIMBOLO_BASE, disponer } from '../opord/organigrama.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LETRA = 'Arial, Helvetica, sans-serif';
let lienzo = null;
function medir(t, tam, negrita) {
  lienzo ??= document.createElement('canvas').getContext('2d');
  lienzo.font = `${negrita ? '700 ' : ''}${tam}px ${LETRA}`;
  return lienzo.measureText(String(t)).width;
}

/** Símbolo de una unidad del organigrama (amigo, sin textos). */
export const simboloDe = (u) => ({ ...SIMBOLO_BASE, ...(u.simbolo ?? {}) });

/** Escalones que tiene sentido elegir en una organización operativa. */
export const ESCALONES_ORG = ['', 'equipo', 'escuadra', 'peloton', 'seccion', 'compania', 'batallon', 'regimiento', 'brigada', 'division'].map((k) => ({ k, nombre: ESCALONES[k].nombre }));
/** Armas y tipos (del constructor de símbolos) para elegir el icono. */
export const TIPOS_ORG = ARMAS.flatMap((a) => a.tipos.map((t) => ({ k: `${a.id}/${t.id}`, grupo: a.nombre, nombre: t.nombre, icono: t.icono, mod1: t.mod1 ?? '', mod2: t.mod2 ?? '' })));
export const tipoDe = (u) => { const s = u.simbolo ?? {}; return TIPOS_ORG.find((t) => t.icono === s.icono && (t.mod1 || '') === (s.mod1 || '') && (t.mod2 || '') === (s.mod2 || ''))?.k ?? ''; };

/**
 * SVG del organigrama.
 * @param {object[]} unidades
 * @param {{seleccion?:string|null, interactivo?:boolean}} [o]
 * @returns {{svg:string, ancho:number, alto:number}}
 */
export function svgOrganigrama(unidades, { seleccion = null, interactivo = false } = {}) {
  const d = disponer(unidades, { medir });
  const P = 8;
  const W = Math.ceil(d.ancho + 2 * P), H = Math.ceil(d.alto + 2 * P);
  const ks = CAJA.w / 150;
  const lineas = d.lineas.map((l) => `M${l[0].toFixed(1)},${l[1].toFixed(1)}L${l[2].toFixed(1)},${l[3].toFixed(1)}`).join('');
  const cajas = d.cajas.map((c) => {
    const s = svgUnidad(simboloDe(c.u), { tam: 20, sinTextos: true }).svg;
    const dentro = s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const textos = [c.nombre, c.sub].filter(Boolean).map((e) => `<text x="${e.x.toFixed(1)}" y="${e.y.toFixed(1)}" font-size="${e.tam.toFixed(1)}" ${e === c.nombre ? 'font-weight="700"' : 'fill="#5B6573"'} text-anchor="${e.ancla}" dominant-baseline="central">${esc(e.texto)}</text>`).join('');
    const hit = interactivo ? `<rect class="org-hit" x="${(c.x - 4).toFixed(1)}" y="${(c.y - CAJA.marca - 2).toFixed(1)}" width="${CAJA.w + 8}" height="${(CAJA.h + CAJA.marca + 6).toFixed(1)}" rx="5"/>` : '';
    return `<g class="org-u${c.u.id === seleccion ? ' sel' : ''}"${interactivo ? ` data-u="${c.u.id}"` : ''}>${hit}<g transform="translate(${(c.x - 25 * ks).toFixed(2)},${(c.y - 50 * ks).toFixed(2)}) scale(${ks.toFixed(4)})">${dentro}</g>${textos}</g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-P} ${-P} ${W} ${H}" width="${W}" height="${H}" font-family="${LETRA}" fill="#111">${lineas ? `<path d="${lineas}" fill="none" stroke="#59657A" stroke-width="0.9"/>` : ''}${cajas}</svg>`;
  return { svg, ancho: W, alto: H };
}

/** PNG del organigrama (para Word), a buena resolución. { png: Uint8Array, ancho, alto } en puntos. */
export async function pngOrganigrama(unidades, k = 4) {
  if (!unidades?.length) return null;
  const { svg, ancho, alto } = svgOrganigrama(unidades);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = Math.ceil(ancho * k); c.height = Math.ceil(alto * k);
    const g = c.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0, ancho, alto);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return { png: new Uint8Array(await blob.arrayBuffer()), ancho, alto };
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

