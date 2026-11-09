// Exportar una OPORD (o un anexo) a TXT, Word (.docx), Excel (.xlsx) y PDF.
//
// Todos salen de la misma lista de bloques (`bloques()`): cabecera, títulos
// numerados, párrafos, tablas y árbol de la organización operativa. Así los
// cuatro formatos dicen exactamente lo mismo.
//
// Word y Excel son ZIP con XML (Office Open XML) y el PDF se escribe a mano
// con las letras estándar (Helvetica, sin incrustar): no hace falta ninguna
// librería. Los anexos llevan enlace al archivo de su OPORD y la OPORD a los
// de sus anexos (mismo nombre, en la misma carpeta o en el mismo ZIP).
//
// No depende de la página: se prueba en Node.

import {
  numerar, recorrer, titulo, fasesDe, tituloFase, palabraFase, unidadesManiobra, unidadesOrg, agregacionesAuto, orgEnLineas,
  htmlALineas, letraAnexo, tituloDocumento, nombreArchivo,
} from './documento.js';
import { escribirZip } from '../datos/exportar.js';
import { ANEXOS, PLANTILLAS, colorClasificacion } from './plantillas.js';
import { leerTtf } from './ttf.js';
import { CAJA, SIMBOLO_BASE, disponer, svgAPdf } from './organigrama.js';
import { svgUnidad } from '../simbolos/app6.js';

const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// Quita caracteres que XML 1.0 no admite
const limpio = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const TXT = {
  en: { copia: 'Copy', de: 'of', copias: 'copies', huso: 'Time zone used throughout the order', ref: 'References', unidad: 'Unit', bpt: 'BPT', fase: 'Phase', total: 'TOTAL', vease: 'See', anexo: 'Annex', pagina: 'Page', acuse: 'ACKNOWLEDGE.', sinFase: 'Phase deleted', mgrs: 'MGRS', permanentes: 'None', firma: 'Commander', emisor: 'Issuing HQ', lugar: 'Place', gdh: 'DTG', msg: 'Message ref.' },
  es: { copia: 'Ejemplar n.º', de: 'de', copias: 'ejemplares', huso: 'Huso horario de la orden', ref: 'Referencias', unidad: 'Unidad', bpt: 'ECD', fase: 'Fase', total: 'TOTAL', vease: 'Véase', anexo: 'Anexo', pagina: 'Página', acuse: 'ACUSE DE RECIBO.', sinFase: 'Fase eliminada', mgrs: 'MGRS', permanentes: 'Ninguno', firma: 'El jefe', emisor: 'Cuartel general', lugar: 'Lugar', gdh: 'GFH', msg: 'Ref. del mensaje' },
};
const HUSOS = { Z: 'ZULU', A: 'ALFA', B: 'BRAVO', C: 'CHARLIE' };

// ---------------------------------------------------------------- bloques comunes
// Los GDH («031500Z MAY 26») no se parten nunca: espacios duros
const sinPartirGdh = (s) => String(s ?? '').replace(/\b(\d{6}[A-Z]) ([A-Z]{3}) (\d{2})\b/g, '$1\u00A0$2\u00A0$3');
const valorCelda = (v, idioma) => sinPartirGdh(v && typeof v === 'object' ? (v[idioma] ?? v.es ?? v.en ?? '') : String(v ?? ''));

/** Tabla de un nodo → { cols: [títulos], filas: [[celdas]] } (con totales si toca). */
function tablaPlana(t, idioma) {
  const cols = t.cols.map((c) => c[idioma] ?? c.es);
  let filas = t.filas.map((f) => t.cols.map((c) => valorCelda(f.c?.[c.k], idioma)));
  if (t.totales) {
    const nums = t.cols.map((c) => c.campo === 'numero');
    cols.push(TXT[idioma].total);
    const hay = (v) => String(v ?? '').trim() !== '';
    filas = filas.map((f) => [...f, f.some((v, i) => nums[i] && hay(v)) ? String(f.reduce((s, v, i) => s + (nums[i] ? Number(v) || 0 : 0), 0)) : '']);
    const tot = cols.map((_, i) => (i === 0 ? TXT[idioma].total : (i === cols.length - 1 || nums[i]) && filas.some((f) => hay(f[i])) ? String(filas.reduce((s, f) => s + (Number(f[i]) || 0), 0)) : ''));
    filas.push(tot);
  }
  return { cols, filas: filas.filter((f, i, a) => t.filas[i]?.fija || i === a.length - 1 || f.some((x) => String(x).trim())), totales: Boolean(t.totales) };
}

/** Valor legible de un campo de formulario. */
function valorCampo(cp, v, idioma) {
  if (cp.cuentas) return cp.cuentas.map((o) => `${o.k.toUpperCase()}: ${v?.[o.k] ?? ''}`).join('   ');
  if (cp.marcas) { const s = cp.marcas.filter((o) => v?.[o.k]).map((o) => o[idioma] ?? o.es); return s.length ? `[X] ${s.join('   [X] ')}` : ''; }
  if (cp.opciones) { const o = cp.opciones.find((x) => x.k === v); return o ? o[idioma] ?? o.es : ''; }
  return String(v ?? '');
}

/**
 * Lista de bloques del documento.
 * @param {object} doc OPORD o anexo
 * @param {{anexos?:object[], opord?:object, paquetes?:object[], permanentes?:{nombre:string}[], archivoDe?:(d:object)=>string}} ctx
 */
export function bloques(doc, ctx = {}) {
  const idi = doc.idioma === 'en' ? 'en' : 'es';
  const tx = TXT[idi];
  const out = [];
  const opord = doc.tipo === 'anexo' ? ctx.opord : doc;
  const fases = fasesDe(ctx.paquetes, doc.operacion);
  const anexosDe = (ids) => ids.map((id) => (ctx.anexos ?? []).find((a) => a.id === id)).filter(Boolean);
  const c = doc.cabecera ?? {};
  const pl = PLANTILLAS[opord?.plantilla] ?? null;
  const enHoja = doc.tipo === 'opord' && pl?.disposicion === 'hoja';
  out.letra = pl?.letra ?? 'Arial';
  const clasif = c.clasificacion || (opord?.cabecera?.clasificacion ?? '');
  out.push({ t: 'clasificacion', texto: clasif, color: colorClasificacion(clasif) });
  // Cuadro de clasificación junto a cada título (como el modelo), salvo que se quite en la cabecera
  const marcar = clasif && (opord?.cabecera?.marcar ?? c.marcar) !== false;
  const marca = marcar ? { texto: clasif, color: colorClasificacion(clasif) } : null;
  if (doc.tipo === 'opord') {
    out.push({ t: 'cabecera', izq: [
      [tituloDocumento(doc), true],
      c.huso ? [`${tx.huso}: ${HUSOS[c.huso] ?? c.huso}`, false] : null,
      c.referencias ? [`${tx.ref}: ${c.referencias}`, false] : null,
    ].filter(Boolean), der: [
      [`${tx.copia} ${c.copia || '___'} ${tx.de} ${c.deCopias || '___'} ${tx.copias}`, false],
      c.emisor ? [c.emisor, true] : null, c.lugar ? [c.lugar, false] : null,
      c.gdh ? [c.gdh, false] : null, c.referencia ? [c.referencia, false] : null,
    ].filter(Boolean) });
  } else {
    out.push({ t: 'cabecera', izq: [[tituloDocumento(doc, opord), true]], der: [] });
    if (opord) out.push({ t: 'enlace', nivel: 0, texto: `${tituloDocumento(opord)}`, archivo: ctx.archivoDe?.(opord) });
  }
  const num = numerar(doc);
  const nombreFase = (f) => palabraFase(opord, f, idi);
  recorrer(doc, (n, nivel, padre) => {
    if (n.plano) return; // contenedor de fases: sin título propio
    const r = num.get(n.id) ?? { rotulo: '', nivel };
    const niv = r.nivel ?? nivel;
    let tit = titulo(n, idi);
    if (n.fase) { const f = fases.find((x) => x.id === n.fase); tit = f ? (nombreFase(f) ?? tituloFase(f, idi)) : `${n.titulo || tx.sinFase}`; }
    const lineas = htmlALineas(n.texto);
    // Apartados que salen como «ETIQUETA: texto» (MLCOA:, En espacio:, Salto 1:…)
    if (n.etiqueta || (n.fase && padre?.etiquetas)) {
      const vineta = Boolean(n.vineta || n.fase);
      out.push({ nodo: n.id, t: 'parrafo', nivel: niv, lineas: lineas.length ? lineas : [''], etiqueta: { texto: `${tit}:`, color: n.color ?? null, negrita: !vineta }, vineta });
      for (const a of anexosDe(n.enlaces ?? [])) out.push({ nodo: n.id, t: 'enlace', nivel: niv, texto: `${tx.vease} ${tx.anexo} ${opord ? letraAnexo(opord, a.id) : ''} — ${a.cabecera.titulo || ANEXOS[a.plantilla]?.[idi] || ''}`, archivo: ctx.archivoDe?.(a), sangria: true });
      return;
    }
    if (n.tipo === 'firma') { out.push({ nodo: n.id, t: 'titulo', nivel: 0, rotulo: '', texto: tx.acuse, sinNumero: true }); }
    else if (enHoja && n.tipo === 'imagen') { /* el calco va sin título, como en el modelo */ }
    else out.push({ nodo: n.id, t: 'titulo', nivel: niv, rotulo: r.rotulo, texto: tit, marca: n.sinNumero ? null : marca, nota: n.nota ? n.nota[idi] ?? n.nota.es : null });
    if (n.intro) out.push({ nodo: n.id, t: 'parrafo', nivel: niv, lineas: [n.intro[idi] ?? n.intro.es], estilo: 'intro' });
    if (lineas.length) out.push({ nodo: n.id, t: 'parrafo', nivel: niv, lineas });
    if (n.tipo === 'org') {
      const ls = orgEnLineas(doc);
      if (ls.length) out.push({ nodo: n.id, t: 'organigrama', nivel: niv, unidades: unidadesOrg(doc), lineas: ls.map((l) => ({ nivel: l.nivel, texto: l.texto })) });
    }
    if (n.tipo === 'imagen' && n.imagen?.datos) out.push({ nodo: n.id, t: 'imagen', nivel: niv, imagen: n.imagen });
    if (n.tipo === 'agregaciones') {
      const filas = [...agregacionesAuto(doc), ...n.tabla.filas];
      out.push({ nodo: n.id, t: 'tabla', nivel: niv, cols: n.tabla.cols.map((x) => x[idi] ?? x.es), filas: filas.map((f) => n.tabla.cols.map((x) => valorCelda(f.c?.[x.k], idi))).filter((f) => f.some((v) => v.trim())), vacia: 2 });
    } else if (n.tabla) {
      const t = tablaPlana(n.tabla, idi);
      if (n.tabla.previo) out.push({ nodo: n.id, t: 'tabla', nivel: niv, cols: ['', ''], filas: n.tabla.previo.map((cp) => [cp[idi] ?? cp.es, String(n.tabla.valoresPrevio?.[cp.k] ?? '')]), sinCabecera: true });
      out.push({ nodo: n.id, t: 'tabla', nivel: niv, cols: t.cols, filas: t.filas, totales: t.totales, vacia: 2 });
    }
    if (n.tipo === 'matriz') {
      const us = [...unidadesManiobra(doc).map((u) => ({ id: u.id, nombre: u.nombre })), ...(n.matriz.filas ?? [])];
      const filas = us.map((u) => [u.nombre, ...fases.map((f) => n.matriz.celdas?.[u.id]?.[f.id] ?? ''), n.matriz.bpt?.[u.id] ?? '']);
      if (enHoja) {
        // Como la matriz de cometidos del modelo: SALTO 1 · SALTO 2 · Posteriormente, con las celdas iguales unidas
        const cols = ['', ...fases.map((f) => (nombreFase(f) ?? tituloFase(f, idi, { corto: true })).toUpperCase()), pl.posterior?.[idi] ?? tx.bpt];
        out.push({ nodo: n.id, t: 'tabla', nivel: niv, cols, filas, primeraNegrita: true, vacia: 1, fusionar: true, titulo: n.tituloTabla?.[idi] ?? null });
      } else {
        const cols = [tx.unidad, ...fases.map((f) => sinPartirGdh(`${tituloFase(f, idi, { corto: true })}${f.inicio || f.fin ? `: ${[f.inicio, f.fin].filter(Boolean).join(' – ')}` : ''}`)), tx.bpt];
        out.push({ nodo: n.id, t: 'tabla', nivel: niv, cols, filas, primeraNegrita: true, vacia: 1 });
      }
    }
    if (n.tipo === 'matrizFases') {
      const cab = n.matriz.cabecera?.[idi] ?? (idi === 'en' ? 'Element' : 'Elemento');
      const cols = [cab, ...fases.map((f) => sinPartirGdh(`${tituloFase(f, idi, { corto: true })}${f.inicio || f.fin ? `: ${[f.inicio, f.fin].filter(Boolean).join(' – ')}` : ''}`))];
      out.push({ nodo: n.id, t: 'tabla', nivel: niv, cols, filas: (n.matriz.filas ?? []).map((fl) => [fl.nombre ?? '', ...fases.map((f) => n.matriz.celdas?.[fl.id]?.[f.id] ?? '')]), primeraNegrita: true, vacia: 2 });
    }
    if (n.tipo === 'permanentes') {
      const ps = ctx.permanentes ?? [];
      out.push({ nodo: n.id, t: 'parrafo', nivel: niv, lineas: ps.length ? ps.map((p) => `• ${p.nombre}`) : [`— ${tx.permanentes}`] });
    }
    if (n.tipo === 'formulario') {
      out.push({ nodo: n.id, t: 'tabla', nivel: niv, cols: ['', ''], filas: n.campos.map((cp) => [cp[idi] ?? cp.es, valorCampo(cp, n.valores?.[cp.k], idi)]), sinCabecera: true, anchos: [0.42, 0.58] });
    }
    if (n.tipo === 'anexos' && doc.tipo === 'opord') {
      for (const a of anexosDe(doc.anexos)) out.push({ nodo: n.id, t: 'enlace', nivel: 0, texto: `${tx.anexo} ${letraAnexo(doc, a.id)} — ${a.cabecera.titulo || ANEXOS[a.plantilla]?.[idi] || ''}`, archivo: ctx.archivoDe?.(a) });
    }
    if (n.tipo === 'firma') {
      const f = n.firma ?? {};
      out.push({ nodo: n.id, t: 'firma', lineas: [f.jefe, f.empleo, f.cargo].filter(Boolean), defecto: tx.firma });
    }
    for (const a of anexosDe(n.enlaces ?? [])) out.push({ nodo: n.id, t: 'enlace', nivel: niv, texto: `${tx.vease} ${tx.anexo} ${opord ? letraAnexo(opord, a.id) : ''} — ${a.cabecera.titulo || ANEXOS[a.plantilla]?.[idi] || ''}`, archivo: ctx.archivoDe?.(a), sangria: true });
  });
  out.push({ t: 'clasificacionFin', texto: c.clasificacion || '' });
  if (enHoja) out.hoja = repartirHoja(doc, out, pl);
  return out;
}

/**
 * Reparte los bloques en la cuadrícula de una plantilla «hoja»: filas de columnas,
 * cada una con los bloques de sus apartados. Lo que la plantilla no coloca (añadido
 * a mano, «Sin sitio»…) va en una fila al final, a todo lo ancho: no se pierde nada.
 */
function repartirHoja(doc, bl, pl) {
  const filas = pl.hoja.map((f) => f.map((cl) => ({ w: cl.w, k: cl.k, bloques: [] })));
  const sitio = new Map(); // clave → columna;  'clave:tabla' → columna de su tabla
  filas.forEach((f) => f.forEach((cl) => cl.k.forEach((k) => sitio.set(k, cl))));
  const resto = { w: 1, k: [], bloques: [] };
  const columnaDe = new Map(); // id de nodo → columna (por su antepasado más cercano colocado)
  const rec = (ids, col) => {
    for (const id of ids) {
      const n = doc.nodos[id]; if (!n || n.quitado) continue;
      const c = sitio.get(n.k) ?? col;
      columnaDe.set(id, c);
      rec(n.hijos, c);
    }
  };
  rec(doc.raiz, resto);
  for (const b of bl) {
    if (!b.nodo) continue;
    const n = doc.nodos[b.nodo];
    const solo = n && sitio.get(`${n.k}:tabla`);
    if (solo && b.t === 'tabla') { solo.bloques.push(b); continue; }
    (columnaDe.get(b.nodo) ?? resto).bloques.push(b);
  }
  if (resto.bloques.length) filas.push([resto]);
  return filas;
}

/**
 * Celdas de una tabla con las iguales unidas (a lo ancho y luego a lo alto), como la
 * matriz de cometidos del modelo. Devuelve [{f, c, fs, cs, texto}] (fila, columna, filas y columnas que ocupa).
 */
export function celdasUnidas(filas, nCols) {
  const out = [];
  const tapada = filas.map(() => Array(nCols).fill(false));
  const val = (f, c) => String(filas[f]?.[c] ?? '').trim();
  const ancho = (f, c) => { let k = 1; if (c === 0) return 1; while (c + k < nCols && val(f, c) && val(f, c + k) === val(f, c)) k++; return k; };
  const anchos = filas.map((_, f) => Array.from({ length: nCols }, (_, c) => 0));
  for (let f = 0; f < filas.length; f++) for (let c = 0; c < nCols; c++) { if (anchos[f][c] === -1) continue; const k = ancho(f, c); anchos[f][c] = k; for (let j = 1; j < k; j++) anchos[f][c + j] = -1; }
  for (let f = 0; f < filas.length; f++) {
    for (let c = 0; c < nCols; c++) {
      if (tapada[f][c] || anchos[f][c] === -1) continue;
      const cs = anchos[f][c];
      let fs = 1;
      while (c > 0 && f + fs < filas.length && val(f, c) && anchos[f + fs][c] === cs && val(f + fs, c) === val(f, c)) fs++;
      for (let i = 0; i < fs; i++) for (let j = 0; j < cs; j++) if (i || j) tapada[f + i][c + j] = true;
      out.push({ f, c, fs, cs, texto: String(filas[f]?.[c] ?? '') });
    }
  }
  return out;
}

/** Líneas de un párrafo con la etiqueta delante («MLCOA: …», «• Salto 1: …»), para TXT y Excel. */
const lineasPlanas = (b) => (b.etiqueta ? b.lineas.map((l, i) => (i ? l : `${b.vineta ? '• ' : ''}${b.etiqueta.texto} ${l}`.trimEnd())) : b.lineas);

// ---------------------------------------------------------------- TXT
function partir(texto, ancho) {
  const out = [];
  for (const parrafo of String(texto ?? '').split('\n')) {
    let l = '';
    for (const p of parrafo.split(/(\s+)/)) {
      if ((l + p).length > ancho && l.trim()) { out.push(l.trimEnd()); l = p.trimStart(); }
      else l += p;
      while (l.length > ancho) { out.push(l.slice(0, ancho)); l = l.slice(ancho); }
    }
    out.push(l.trimEnd());
  }
  return out;
}
function tablaTexto(cols, filas, ancho, sinCabecera) {
  const n = cols.length;
  const largos = cols.map((c, i) => Math.max(String(c).length, ...filas.map((f) => String(f[i] ?? '').length), 3));
  const total = largos.reduce((s, x) => s + x, 0) + 3 * n + 1;
  const escala = total > ancho ? (ancho - 3 * n - 1) / largos.reduce((s, x) => s + x, 0) : 1;
  const w = largos.map((x) => Math.max(4, Math.floor(x * escala)));
  const raya = `+${w.map((x) => '-'.repeat(x + 2)).join('+')}+`;
  const fila = (f) => {
    const partes = f.map((v, i) => partir(String(v ?? ''), w[i]));
    const h = Math.max(...partes.map((p) => p.length));
    return Array.from({ length: h }, (_, j) => `|${partes.map((p, i) => ` ${(p[j] ?? '').padEnd(w[i])} `).join('|')}|`);
  };
  return [raya, ...(sinCabecera ? [] : [...fila(cols), raya.replace(/-/g, '=')]), ...filas.flatMap((f) => [...fila(f), raya])];
}
/** Texto plano (90 columnas), con sangría por niveles. */
export function aTexto(doc, ctx = {}) {
  const ANCHO = 90, SANG = 4;
  const L = [];
  const bl = bloques(doc, ctx);
  for (const b of bl) {
    if (b.t === 'clasificacion' || b.t === 'clasificacionFin') { if (b.texto) { L.push(b.texto.padStart(Math.floor((ANCHO + b.texto.length) / 2))); L.push(''); } continue; }
    if (b.t === 'cabecera') {
      for (const [t] of b.der) L.push(t.padStart(ANCHO));
      L.push('');
      for (const [t] of b.izq) L.push(...partir(t, ANCHO));
      L.push('');
      continue;
    }
    const x = (b.nivel ?? 0) * SANG;
    const pre = ' '.repeat(x);
    if (b.t === 'titulo') {
      const cab = b.rotulo ? `${b.rotulo} ` : '';
      const ls = partir(`${cab}${b.texto}${b.nota ? ` ${b.nota}` : ''}`, ANCHO - x);
      L.push('', ...ls.map((l, i) => (i ? ' '.repeat(x + cab.length) : pre) + l));
    } else if (b.t === 'parrafo') {
      for (const l of lineasPlanas(b)) L.push(...partir(l, ANCHO - x - SANG).map((s) => pre + ' '.repeat(SANG) + s));
    } else if (b.t === 'arbol' || b.t === 'organigrama') {
      for (const l of b.lineas) L.push(`${pre}${' '.repeat(SANG + l.nivel * 3)}${l.nivel ? '└─ ' : ''}${l.texto}`);
    } else if (b.t === 'tabla') {
      L.push(...tablaTexto(b.cols, b.filas.length ? b.filas : [b.cols.map(() => '')], ANCHO - x - SANG, b.sinCabecera).map((s) => pre + ' '.repeat(SANG) + s));
    } else if (b.t === 'enlace') {
      L.push(`${pre}${' '.repeat(b.sangria ? SANG : 0)}${b.texto}${b.archivo ? `  [${b.archivo}]` : ''}`);
    } else if (b.t === 'firma') {
      L.push('', ...(b.lineas.length ? b.lineas : [b.defecto]).map((l) => l.padStart(ANCHO)));
    }
  }
  return `${L.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

// ---------------------------------------------------------------- Word (.docx)
const TW = 567; // 1 cm en vigésimas de punto
function runs(texto, { negrita = false, cursiva = false, tam = null, subrayado = false, color = null, fondo = null, letra = null } = {}) {
  const rpr = `<w:rPr>${letra ? `<w:rFonts w:ascii="${letra}" w:hAnsi="${letra}" w:cs="${letra}"/>` : ''}${negrita ? '<w:b/>' : ''}${cursiva ? '<w:i/>' : ''}${color ? `<w:color w:val="${color.replace('#', '')}"/>` : ''}${tam ? `<w:sz w:val="${Math.round(tam * 2)}"/><w:szCs w:val="${Math.round(tam * 2)}"/>` : ''}${subrayado ? '<w:u w:val="single"/>' : ''}${fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${fondo.replace('#', '')}"/>` : ''}</w:rPr>`;
  return `<w:r>${rpr}<w:t xml:space="preserve">${xml(limpio(texto))}</w:t></w:r>`;
}
const par = (contenido, { izq = 0, colgante = 0, centro = false, derecha = false, antes = 0, despues = 80, conSiguiente = false, tab = null, linea = null } = {}) =>
  `<w:p><w:pPr>${conSiguiente ? '<w:keepNext/>' : ''}${tab ? `<w:tabs><w:tab w:val="left" w:pos="${tab}"/></w:tabs>` : ''}<w:spacing w:before="${antes}" w:after="${despues}"${linea ? ` w:line="${linea}" w:lineRule="auto"` : ''}/><w:ind w:left="${izq}" w:hanging="${colgante}"/>${centro ? '<w:jc w:val="center"/>' : derecha ? '<w:jc w:val="right"/>' : ''}</w:pPr>${contenido}</w:p>`;
/** Cuadro de clasificación tras un título: letra blanca sobre su color. */
const marcaDocx = (m) => (m ? `${runs(' ', { tam: 7 })}${runs(` ${m.texto} `, { negrita: true, tam: 6.5, color: '#FFFFFF', fondo: m.color })}` : '');

function tablaDocx(b, izq, anchoTotal, tam = 9) {
  const n = b.cols.length;
  // Arial mide como Helvetica: mismas medidas que el PDF (en vigésimas de punto)
  const anchos = (b.anchos ? b.anchos.map((p) => p * anchoTotal) : repartir(b.cols, b.filas, anchoTotal, (t, neg) => anchoTexto(t, neg ? 'F2' : 'F1', tam) * 20 * 1.04, 200, 680)).map((w) => Math.round(w));
  const celda = (t, w, { cab = false, negrita = false, span = 1, vm = null, centro = false } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${vm ? `<w:vMerge${vm === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${cab ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E9EE"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${String(t ?? '').split('\n').map((l) => `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${cab || centro ? '<w:jc w:val="center"/>' : ''}</w:pPr>${runs(l, { negrita: cab || negrita, tam })}</w:p>`).join('')}</w:tc>`;
  const filas = b.filas.length ? b.filas : Array.from({ length: b.vacia ?? 1 }, () => b.cols.map(() => ''));
  const borde = (k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="8A8F99"/>`;
  let cuerpo;
  if (b.fusionar) {
    // Celdas iguales unidas: a lo ancho (gridSpan) y a lo alto (vMerge)
    const cs = celdasUnidas(filas, n);
    const inicio = new Map(cs.map((c) => [`${c.f}:${c.c}`, c]));
    const sigue = new Map();
    for (const c of cs) for (let i = 1; i < c.fs; i++) sigue.set(`${c.f + i}:${c.c}`, c);
    cuerpo = filas.map((_, f) => {
      let tr = '';
      for (let c = 0; c < n; c++) {
        const ini = inicio.get(`${f}:${c}`), con = sigue.get(`${f}:${c}`);
        const cel = ini ?? con; if (!cel) continue;
        const w = anchos.slice(c, c + cel.cs).reduce((a, v) => a + v, 0);
        tr += celda(ini ? cel.texto : '', w, { span: cel.cs, vm: cel.fs > 1 ? (ini ? 'restart' : 'continue') : null, negrita: b.primeraNegrita && c === 0, centro: c > 0 });
        c += cel.cs - 1;
      }
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tr}</w:tr>`;
    }).join('');
  } else {
    cuerpo = filas.map((f, j) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${f.slice(0, n).map((v, i) => celda(v, anchos[i], { negrita: (b.primeraNegrita && i === 0) || (b.sinCabecera && i === 0) || (b.totales && j === filas.length - 1) })).join('')}</w:tr>`).join('');
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="${anchoTotal}" w:type="dxa"/><w:tblInd w:w="${izq}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid>${anchos.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
${b.sinCabecera ? '' : `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${b.cols.map((c, i) => celda(c, anchos[i], { cab: true })).join('')}</w:tr>`}
${cuerpo}
</w:tbl>${par('', { despues: 60 })}`;
}

/** Dibujo en línea de Word (una imagen ya guardada en word/media). */
const dibujoDocx = (rid, id, anchoPt, altoPt) => {
  const cx = Math.round(anchoPt * 12700), cy = Math.round(altoPt * 12700);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagen ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="imagen${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
};

/**
 * Word (.docx). `ctx.imagenes[nodo] = { png: Uint8Array, ancho, alto }` (px) pone el organigrama
 * como imagen (lo prepara la página); si no, va como árbol de texto.
 */
export async function aDocx(doc, ctx = {}) {
  const bl = bloques(doc, ctx);
  const enHoja = Boolean(bl.hoja);
  const ANCHO = enHoja ? 10772 : 9638; // A4 con márgenes de 2 cm (1,25 en la hoja)
  const rels = [];
  const medios = []; // { nombre, datos, ext }
  const clasifB = bl.find((b) => b.t === 'clasificacion');
  const clasif = clasifB?.texto || '';
  const tituloDoc = bl.find((b) => b.t === 'cabecera')?.izq?.[0]?.[0] ?? '';
  const imagen = (bytes, ext, anchoPt, altoPt) => {
    const k = medios.length + 1;
    const rid = `rIdM${k}`;
    medios.push({ nombre: `word/media/imagen${k}.${ext}`, datos: bytes, ext });
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/imagen${k}.${ext}"/>`);
    return dibujoDocx(rid, 100 + k, anchoPt, altoPt);
  };
  const lineasEt = (b, tam, izq, { colgante = 0 } = {}) => b.lineas.map((l, i) => {
    const bala = l.startsWith('• ') || (b.vineta && i === 0);
    const t = l.startsWith('• ') ? l.slice(2) : l;
    const et = i === 0 && b.etiqueta ? `${runs(`${b.etiqueta.texto} `, { negrita: b.etiqueta.negrita !== false, color: b.etiqueta.color, tam })}` : '';
    const sang = bala || b.vineta ? 280 : 0;
    return par(`${bala ? '<w:r><w:t>•</w:t></w:r><w:r><w:tab/></w:r>' : ''}${et}${runs(t, { cursiva: b.estilo === 'intro', subrayado: b.estilo === 'intro', tam })}`, { izq: izq + sang, colgante: bala ? 280 : colgante, tab: bala ? izq + sang : null, despues: enHoja ? 10 : 60, linea: enHoja ? 228 : null });
  });
  const organigramaDocx = (b, x, anchoMax) => {
    const im = ctx.imagenes?.[b.nodo];
    if (im?.png) {
      const k = Math.min(1, (anchoMax / 20) / im.ancho);
      return par(imagen(im.png, 'png', im.ancho * k, im.alto * k), { izq: x, despues: 60, centro: enHoja });
    }
    return b.lineas.map((l) => par(runs(`${l.nivel ? '└ ' : ''}${l.texto}`, { negrita: l.nivel === 0, tam: enHoja ? 8.5 : 10 }), { izq: x + l.nivel * 400, despues: 20 })).join('') + par('', { despues: 60 });
  };
  const imagenDocx = (b, x, anchoMax, altoMax = 520) => {
    const bytes = bytesDe(b.imagen.datos); const t = tamJpeg(bytes); if (!t) return '';
    const k = Math.min((anchoMax / 20) / t.ancho, altoMax / t.alto);
    return par(imagen(bytes, 'jpeg', t.ancho * k, t.alto * k), { izq: x, despues: 60, centro: true });
  };

  const cuerpo = [];
  if (!enHoja) {
    for (const b of bl) {
      const x = (b.nivel ?? 0) * TW;
      if (b.t === 'cabecera') {
        const filas = Math.max(b.izq.length, b.der.length);
        const celda = (lista, i, der) => `<w:tc><w:tcPr><w:tcW w:w="${der ? 3800 : ANCHO - 3800}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="20"/>${der ? '<w:jc w:val="right"/>' : ''}</w:pPr>${lista[i] ? runs(lista[i][0], { negrita: lista[i][1], tam: lista[i][1] && !der ? 11 : 10 }) : ''}</w:p></w:tc>`;
        cuerpo.push(`<w:tbl><w:tblPr><w:tblW w:w="${ANCHO}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${ANCHO - 3800}"/><w:gridCol w:w="3800"/></w:tblGrid>${Array.from({ length: filas }, (_, i) => `<w:tr>${celda(b.izq, i, false)}${celda(b.der, i, true)}</w:tr>`).join('')}</w:tbl>`);
        cuerpo.push(par('', { despues: 120 }));
      } else if (b.t === 'titulo') {
        const tam = b.nivel === 0 ? 12 : b.nivel === 1 ? 11 : 10.5;
        const col = TW * (b.nivel === 0 ? 1.2 : 1);
        cuerpo.push(par(`${b.rotulo ? `${runs(b.rotulo, { negrita: true, tam })}<w:r><w:tab/></w:r>` : ''}${runs(b.nivel === 0 ? b.texto.toUpperCase() : b.texto, { negrita: true, tam })}${marcaDocx(b.marca)}${b.nota ? runs(` ${b.nota}`, { tam: tam - 1 }) : ''}`, { izq: b.rotulo ? x + col : x, colgante: b.rotulo ? col : 0, tab: b.rotulo ? x + col : null, antes: b.nivel === 0 ? 240 : 140, despues: 60, conSiguiente: true }));
      } else if (b.t === 'parrafo') {
        cuerpo.push(...lineasEt(b, 10, x + TW * (b.nivel === 0 ? 1.2 : 1)));
      } else if (b.t === 'arbol' || b.t === 'organigrama') {
        if (b.t === 'organigrama') cuerpo.push(organigramaDocx(b, x + TW, ANCHO - x - TW));
        else { for (const l of b.lineas) cuerpo.push(par(runs(`${l.nivel ? '└ ' : ''}${l.texto}`, { negrita: l.nivel === 0, tam: 10 }), { izq: x + TW + l.nivel * 400, despues: 20 })); cuerpo.push(par('', { despues: 60 })); }
      } else if (b.t === 'imagen') {
        cuerpo.push(imagenDocx(b, x + TW, ANCHO - x - TW));
      } else if (b.t === 'tabla') {
        const izq = Math.min(b.nivel ?? 0, 2) * TW + TW; // las tablas no se meten más allá del segundo nivel: necesitan sitio
        if (b.titulo) cuerpo.push(par(runs(b.titulo, { negrita: true, tam: 10 }), { izq, despues: 40, conSiguiente: true }));
        cuerpo.push(tablaDocx(b, izq, ANCHO - izq));
      } else if (b.t === 'enlace') {
        const izq = x + (b.sangria ? TW : 0) + (b.nivel ? TW : TW * 1.2);
        if (b.archivo) {
          const rid = `rIdA${rels.length + 1}`;
          rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(b.archivo.replace(/\.[a-z]+$/i, '.docx'))}" TargetMode="External"/>`);
          cuerpo.push(par(`<w:hyperlink r:id="${rid}">${runs(b.texto, { tam: 10, subrayado: true })}</w:hyperlink>`, { izq, despues: 40 }));
        } else cuerpo.push(par(runs(b.texto, { tam: 10 }), { izq, despues: 40 }));
      } else if (b.t === 'firma') {
        cuerpo.push(par('', { despues: 360 }));
        for (const l of (b.lineas.length ? b.lineas : [b.defecto])) cuerpo.push(par(runs(l, { tam: 10, negrita: true }), { derecha: true, despues: 0 }));
      }
    }
  } else {
    // ---- una hoja en cuadrícula: una tabla grande con las columnas de la plantilla
    const T = 8.5;
    const c = doc.cabecera ?? {};
    const cortes = new Set([0, 1, 0.5]);
    for (const fila of bl.hoja) { let a = 0; for (const cl of fila) { a += cl.w; cortes.add(+a.toFixed(4)); } }
    const xs = [...cortes].sort((a, b) => a - b);
    const grid = xs.slice(1).map((v, i) => Math.round((v - xs[i]) * ANCHO));
    const span = (a, b) => { const i = xs.findIndex((v) => Math.abs(v - a) < 1e-3), j = xs.findIndex((v) => Math.abs(v - b) < 1e-3); return [j - i, grid.slice(i, j).reduce((s, v) => s + v, 0)]; };
    const tc = (contenido, a, b, { centro = false } = {}) => { const [n, w] = span(a, b); return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${n > 1 ? `<w:gridSpan w:val="${n}"/>` : ''}${centro ? '<w:vAlign w:val="center"/>' : ''}</w:tcPr>${contenido || '<w:p/>'}</w:tc>`; };
    const contenido = (cl, w) => {
      const out = [];
      cl.bloques.forEach((b, i) => {
        if (b.t === 'titulo') {
          const fin = b.nivel === 0 ? (b.rotulo ? '.' : '') : ':';
          const centrado = cl.bloques[i + 1]?.t === 'organigrama';
          out.push(par(`${runs(`${b.rotulo ? `${b.rotulo} ` : ''}${b.texto.toUpperCase()}${fin}`, { negrita: true, tam: b.nivel === 0 ? T + 0.5 : T, subrayado: b.nivel === 0 && !centrado })}${b.nota ? runs(` ${b.nota}`, { tam: T }) : ''}`, { antes: i ? 40 : 0, despues: 10, centro: centrado, conSiguiente: true }));
        } else if (b.t === 'parrafo') out.push(...lineasEt(b, T, 0));
        else if (b.t === 'tabla') { if (b.titulo) out.push(par(runs(b.titulo, { negrita: true, tam: T + 0.5 }), { centro: true, despues: 20 })); out.push(tablaDocx(b, 0, w - 220, T - 0.5)); }
        else if (b.t === 'organigrama') out.push(organigramaDocx(b, 0, w - 220));
        else if (b.t === 'imagen') out.push(imagenDocx(b, 0, w - 220, 330));
        else if (b.t === 'enlace') out.push(par(runs(b.texto, { tam: T }), { despues: 10 }));
        else if (b.t === 'firma') for (const l of (b.lineas.length ? b.lineas : [b.defecto])) out.push(par(runs(l, { negrita: true, tam: T }), { derecha: true, despues: 0 }));
      });
      return out.join('');
    };
    const filasXml = [];
    const titulo = `OPORD ${[c.numero, c.nombre ? `“${String(c.nombre).toUpperCase()}”` : ''].filter(Boolean).join(' ')}`.trim();
    filasXml.push(`<w:tr>${tc(par(runs(titulo, { negrita: true, cursiva: true, tam: 13 }), { centro: true, despues: 20 }), 0, 1)}</w:tr>`);
    const tx = TXT[doc.idioma === 'en' ? 'en' : 'es'];
    filasXml.push(`<w:tr>${tc(par(runs(`${tx.unidad}: ${c.emisor || ''}`, { negrita: true, tam: 9 }), { centro: true, despues: 0 }), 0, 0.5)}${tc(par(runs(`${tx.gdh}${c.huso ? ` (${HUSOS[c.huso] ?? c.huso})` : ''} ${c.gdh || ''}`, { tam: 9 }), { centro: true, despues: 0 }), 0.5, 1)}</w:tr>`);
    for (const fila of bl.hoja) {
      let a = 0;
      filasXml.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${fila.map((cl) => { const x = tc(contenido(cl, span(a, a + cl.w)[1]), a, a + cl.w); a += cl.w; return x; }).join('')}</w:tr>`);
    }
    const borde = (k) => `<w:${k} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`;
    cuerpo.push(`<w:tbl><w:tblPr><w:tblW w:w="${ANCHO}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${filasXml.join('')}</w:tbl>`);
    cuerpo.push(par('', { despues: 0 }));
  }
  const colorClasif = enHoja ? clasifB?.color : null;
  const pie = (centro) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${centro}r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runs(clasif, { negrita: true, tam: 10, color: colorClasif, letra: 'Arial' })}</w:p>
${centro === 'ft' ? `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${runs(`${TXT[doc.idioma === 'en' ? 'en' : 'es'].pagina} `, { tam: 8, letra: 'Arial' })}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>${runs(` ${TXT[doc.idioma === 'en' ? 'en' : 'es'].de} `, { tam: 8, letra: 'Arial' })}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p>` : (enHoja ? '' : `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runs(tituloDoc, { tam: 8, letra: 'Arial' })}</w:p>`)}
</w:${centro}r>`;
  const margen = enHoja ? 'w:top="964" w:right="567" w:bottom="851" w:left="567" w:header="397" w:footer="397"' : 'w:top="1418" w:right="1134" w:bottom="1418" w:left="1134" w:header="567" w:footer="567"';
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>
${cuerpo.join('\n')}
<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar ${margen} w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
  const letra = bl.letra || 'Arial';
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${letra}" w:hAnsi="${letra}" w:cs="${letra}" w:eastAsia="${letra}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="${doc.idioma === 'en' ? 'en-GB' : 'es-ES'}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F4E9A"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;
  const archivos = [
    { nombre: '[Content_Types].xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { nombre: '_rels/.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { nombre: 'docProps/core.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(tituloDoc)}</dc:title><dc:creator>${xml(doc.autor || 'SPA')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date(doc.creado || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date(doc.modificado || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:modified></cp:coreProperties>` },
    { nombre: 'word/_rels/document.xml.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${rels.join('')}</Relationships>` },
    { nombre: 'word/document.xml', datos: documento },
    { nombre: 'word/styles.xml', datos: estilos },
    { nombre: 'word/header1.xml', datos: pie('hd') },
    { nombre: 'word/footer1.xml', datos: pie('ft') },
    ...medios.map((m) => ({ nombre: m.nombre, datos: m.datos })),
  ];
  return escribirZip(archivos, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

// ---------------------------------------------------------------- Excel (.xlsx)
const colLetra = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function hoja(filas, { anchos = [], estilos = () => 0 } = {}) {
  const rows = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => {
    const ref = `${colLetra(c)}${r + 1}`, s = estilos(r, c);
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    if (v === '' || v == null) return s ? `<c r="${ref}" s="${s}"/>` : '';
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(limpio(v))}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${anchos.length ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
}
/** Excel (.xlsx): una hoja con todo el texto y una hoja por cada tabla. */
export async function aXlsx(doc, ctx = {}) {
  const bl = bloques(doc, ctx);
  const en = doc.idioma === 'en';
  const hojas = [];
  const principal = [[en ? 'No.' : 'N.º', en ? 'Paragraph' : 'Apartado', en ? 'Text' : 'Texto']];
  const usados = new Set();
  const nombreHoja = (s) => { let b = String(s || 'Tabla').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Tabla'; let n = b, i = 2; while (usados.has(n.toLowerCase())) n = `${b.slice(0, 25)} ${i++}`; usados.add(n.toLowerCase()); return n; };
  nombreHoja('OPORD');
  let ultimo = null;
  for (const b of bl) {
    if (b.t === 'cabecera') { for (const [t] of [...b.izq, ...b.der]) principal.push(['', t, '']); continue; }
    if (b.t === 'titulo') { principal.push([b.rotulo, `${'   '.repeat(b.nivel ?? 0)}${b.texto}`, b.nota ?? '']); ultimo = b; continue; }
    if (b.t === 'parrafo') { const f = principal.at(-1); f[2] = [f[2], ...lineasPlanas(b)].filter(Boolean).join('\n'); continue; }
    if (b.t === 'arbol' || b.t === 'organigrama') { const f = principal.at(-1); f[2] = [f[2], ...b.lineas.map((l) => `${'   '.repeat(l.nivel)}${l.texto}`)].filter(Boolean).join('\n'); continue; }
    if (b.t === 'enlace') { principal.push(['', b.texto, b.archivo ?? '']); continue; }
    if (b.t === 'tabla') {
      const nombre = nombreHoja(`${ultimo?.rotulo ?? ''} ${ultimo?.texto ?? 'Tabla'}`);
      const f = principal.at(-1); f[2] = [f[2], `→ ${en ? 'sheet' : 'hoja'} «${nombre}»`].filter(Boolean).join('\n');
      const filas = (b.sinCabecera ? [] : [b.cols]).concat(b.filas.map((r) => r.map((v) => (/^-?\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : v))));
      const anchos = b.cols.map((c, i) => Math.min(60, Math.max(10, String(c).length + 2, ...b.filas.map((r) => Math.min(50, String(r[i] ?? '').length + 2)))));
      hojas.push({ nombre, xml: hoja(filas, { anchos, estilos: (r, c) => (!b.sinCabecera && r === 0 ? 1 : (b.primeraNegrita || b.sinCabecera) && c === 0 ? 3 : 2) }) });
    }
  }
  hojas.unshift({ nombre: 'OPORD', xml: hoja(principal, { anchos: [8, 55, 90], estilos: (r) => (r === 0 ? 1 : 2) }) });
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E9EE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF8A8F99"/></left><right style="thin"><color rgb="FF8A8F99"/></right><top style="thin"><color rgb="FF8A8F99"/></top><bottom style="thin"><color rgb="FF8A8F99"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const archivos = [
    { nombre: '[Content_Types].xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { nombre: '_rels/.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${xml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nombre: 'xl/styles.xml', datos: estilos },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: h.xml })),
  ];
  return escribirZip(archivos, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ---------------------------------------------------------------- PDF (escrito a mano)
// Anchos de las letras estándar (AFM de Adobe, milésimas de em), del espacio (32) a la tilde (126).
const AFM = {
  F1: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  F2: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
};
AFM.F3 = AFM.F1; // Helvetica-Oblique: mismos anchos que la normal
// Unicode → WinAnsi (CP1252) para lo que no está en Latin-1
const WIN = { '€': 128, '‚': 130, '„': 132, '…': 133, '†': 134, '‡': 135, '‰': 137, '‹': 139, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '™': 153, '›': 155, '☒': 120, '└': 45, '─': 45 };
const BASE = (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
const ANCHO_ESP = { 160: 278, 149: 350, 150: 556, 151: 1000, 145: 222, 146: 222, 147: 333, 148: 333, 133: 1000, 171: 556, 187: 556, 186: 365, 170: 370, 128: 556, 176: 400 };
function codigo(ch) {
  if (WIN[ch] != null) return WIN[ch];
  const c = ch.codePointAt(0);
  if (c < 128 || (c >= 160 && c <= 255)) return c;
  return 63; // ?
}
// Anchos de la letra incrustada (Tahoma…) mientras se monta un PDF; si no hay, los de Helvetica
let METRICAS = null;
function anchoTexto(s, fuente, tam) {
  let w = 0;
  if (METRICAS?.[fuente]) { for (const ch of String(s)) { const c = codigo(ch); w += METRICAS[fuente][c >= 32 && c <= 255 ? c - 32 : 31] ?? 500; } return (w * tam) / 1000; }
  for (const ch of String(s)) {
    const c = codigo(ch);
    let a = c >= 32 && c <= 126 ? AFM[fuente][c - 32] : ANCHO_ESP[c];
    if (a == null) { const b = BASE(ch); const cb = b.codePointAt(0) ?? 63; a = cb >= 32 && cb <= 126 ? AFM[fuente][cb - 32] : 556; }
    w += a;
  }
  return (w * tam) / 1000;
}
function cadenaPdf(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = codigo(ch);
    if (c === 40 || c === 41 || c === 92) out += `\\${String.fromCharCode(c)}`;
    else if (c < 32 || c > 126) out += `\\${c.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(c);
  }
  return `(${out})`;
}
/** Parte un texto para que quepa en `ancho` puntos. */
function partirPdf(texto, ancho, fuente, tam) {
  const out = [];
  for (const parrafo of String(texto ?? '').split('\n')) {
    // Palabras; las que no caben y llevan «/» se parten por la barra (Attachments/ Detachments)
    const palabras = [];
    for (const w of parrafo.split(/ +/)) {
      if (w.includes('/') && anchoTexto(w, fuente, tam) > ancho) { const ps = w.split(/(?<=\/)/); ps.forEach((x, i) => palabras.push(i ? `\u0000${x}` : x)); } else palabras.push(w);
    }
    let l = '';
    for (const pp of palabras) {
      const pegada = pp.startsWith('\u0000'), p = pegada ? pp.slice(1) : pp;
      const prueba = l ? `${l}${pegada ? '' : ' '}${p}` : p;
      if (anchoTexto(prueba, fuente, tam) <= ancho || !l) {
        if (!l && anchoTexto(p, fuente, tam) > ancho) {
          // palabra más larga que la línea: se corta
          let trozo = '';
          for (const ch of p) { if (anchoTexto(trozo + ch, fuente, tam) > ancho && trozo) { out.push(trozo); trozo = ch; } else trozo += ch; }
          l = trozo;
        } else l = prueba;
      } else { out.push(l); l = p; }
    }
    out.push(l);
  }
  return out;
}

/**
 * Reparte el ancho de una tabla: cada columna, al menos su palabra más larga
 * (para que nada se corte letra a letra); lo que sobra, a las que tienen más texto.
 * `medir(texto, negrita)` da el ancho; `extra` es el relleno de la celda.
 */
export function repartir(cols, filas, total, medir, extra, minimo = 0) {
  const palabras = (t) => String(t ?? '').split(/[ \n\t/]+/).filter(Boolean); // la «/» también deja partir
  const min = cols.map((c, j) => Math.min(total * 0.45, Math.max(minimo, Math.max(...palabras(c).map((w) => medir(w, true)), ...filas.map((f) => Math.max(0, ...palabras(f[j]).map((w) => medir(w, false)))), 0) + extra)));
  const deseo = cols.map((c, j) => Math.max(min[j], Math.min(total * 0.6, Math.max(medir(c, true) * 0.75, ...filas.map((f) => medir(String(f[j] ?? ''), false))) + extra)));
  const sMin = min.reduce((a, v) => a + v, 0);
  if (sMin >= total) return min.map((v) => (v * total) / sMin);
  const pesos = deseo.map((d, j) => d - min[j]);
  const sp = pesos.reduce((a, v) => a + v, 0);
  const libre = total - sMin;
  return min.map((v, j) => v + (sp > 0 ? (libre * pesos[j]) / sp : libre / cols.length));
}

const rgb = (hex) => { const h = String(hex).replace('#', ''); return [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' '); };
/** Comprime con zlib (FlateDecode) si el entorno sabe; si no, null. */
async function desinflar(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try { const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); } catch { return null; }
}
const binario = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };

/**
 * PDF (A4), con cabecera y pie de clasificación, «Página X de Y», cuadro de clasificación junto a
 * cada título y enlaces a los anexos. Con `ctx.fuentesPdf = { normal, negrita }` (archivos .ttf,
 * p. ej. la Tahoma del ordenador) la letra va dentro del PDF; si no, Helvetica (que mide como Arial).
 * Las plantillas «hoja» (OPORD de compañía en una hoja) salen en su cuadrícula.
 */
export async function aPdf(doc, ctx = {}) {
  let letras = null;
  try { if (ctx.fuentesPdf?.normal && ctx.fuentesPdf?.negrita) letras = { normal: leerTtf(ctx.fuentesPdf.normal), negrita: leerTtf(ctx.fuentesPdf.negrita), nombre: ctx.fuentesPdf.nombre ?? 'Tahoma' }; } catch { letras = null; }
  const antes = METRICAS;
  METRICAS = letras ? { F1: letras.normal.anchos, F2: letras.negrita.anchos, F3: letras.normal.anchos } : null;
  try { return await montarPdf(doc, ctx, letras); } finally { METRICAS = antes; }
}

/** Bytes de una imagen guardada como «data:…;base64,…». */
function bytesDe(datos) {
  const b64 = String(datos ?? '').split(',')[1] ?? '';
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
/** Tamaño de un JPEG (de su cabecera SOF). */
function tamJpeg(u) {
  let i = 2;
  while (i < u.length - 9) {
    if (u[i] !== 0xFF) { i++; continue; }
    const m = u[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { alto: (u[i + 5] << 8) | u[i + 6], ancho: (u[i + 7] << 8) | u[i + 8], comps: u[i + 9] };
    i += 2 + ((u[i + 2] << 8) | u[i + 3]);
  }
  return null;
}

async function montarPdf(doc, ctx, letras) {
  const A4 = [595.28, 841.89];
  const bl = bloques(doc, ctx);
  const enHoja = Boolean(bl.hoja);
  const M = enHoja ? { izq: 22, der: 22, arr: 40, aba: 36 } : { izq: 56.7, der: 51, arr: 72, aba: 62 };
  const AN = A4[0] - M.izq - M.der;
  const SANG = 28.35; // 1 cm por nivel
  const clasifB = bl.find((b) => b.t === 'clasificacion');
  const clasif = clasifB?.texto || '';
  const tituloDoc = bl.find((b) => b.t === 'cabecera')?.izq?.[0]?.[0] ?? '';
  const tx = TXT[doc.idioma === 'en' ? 'en' : 'es'];
  const paginas = [];
  const imagenes = []; // { bytes, ancho, alto, gris }
  let pag = null, y = 0;
  const nueva = () => { pag = { ops: [], enlaces: [], imgs: new Set() }; paginas.push(pag); y = A4[1] - M.arr; };
  const f2 = (v) => v.toFixed(2);
  const texto = (s, x, yy, fuente = 'F1', tam = 10, color = null) => {
    if (!s) return;
    const c = color ? `${rgb(color)} rg ` : '';
    pag.ops.push(letras && fuente === 'F3'
      ? `${c}BT /F1 ${tam} Tf 1 0 0.2 1 ${f2(x)} ${f2(yy)} Tm ${cadenaPdf(s)} Tj ET${color ? ' 0 g' : ''}` // cursiva simulada
      : `${c}BT /${fuente} ${tam} Tf ${f2(x)} ${f2(yy)} Td ${cadenaPdf(s)} Tj ET${color ? ' 0 g' : ''}`);
  };
  // Cuadro de clasificación (relleno de su color, letra blanca), con esquinas redondeadas
  const MARCA_T = 6.4;
  const anchoMarca = (m) => (m ? anchoTexto(m.texto, 'F2', MARCA_T) + 9 : 0);
  const redondeado = (x, yb, w, h, r) => {
    const k = 0.55 * r;
    return `${f2(x + r)} ${f2(yb)} m ${f2(x + w - r)} ${f2(yb)} l ${f2(x + w - r + k)} ${f2(yb)} ${f2(x + w)} ${f2(yb + r - k)} ${f2(x + w)} ${f2(yb + r)} c ${f2(x + w)} ${f2(yb + h - r)} l ${f2(x + w)} ${f2(yb + h - r + k)} ${f2(x + w - r + k)} ${f2(yb + h)} ${f2(x + w - r)} ${f2(yb + h)} c ${f2(x + r)} ${f2(yb + h)} l ${f2(x + r - k)} ${f2(yb + h)} ${f2(x)} ${f2(yb + h - r + k)} ${f2(x)} ${f2(yb + h - r)} c ${f2(x)} ${f2(yb + r)} l ${f2(x)} ${f2(yb + r - k)} ${f2(x + r - k)} ${f2(yb)} ${f2(x + r)} ${f2(yb)} c`;
  };
  const marcaPdf = (m, x, base) => {
    const w = anchoMarca(m), yb = base - 2.2;
    pag.ops.push(`${rgb(m.color)} rg ${redondeado(x, yb, w, 9.5, 2.2)} f`);
    pag.ops.push('1 g'); texto(m.texto, x + 4.5, yb + 2.6, 'F2', MARCA_T); pag.ops.push('0 g');
  };
  const raya = (x1, y1, x2, y2, gr = 0.5) => pag.ops.push(`${gr} w ${f2(x1)} ${f2(y1)} m ${f2(x2)} ${f2(y2)} l S`);
  const caja = (x, yy, w, h, gris) => pag.ops.push(`${gris} g ${f2(x)} ${f2(yy)} ${f2(w)} ${f2(h)} re f 0 g`);
  const marco = (x, yy, w, h, gr = 0.6) => pag.ops.push(`${gr} w ${f2(x)} ${f2(yy)} ${f2(w)} ${f2(h)} re S`);
  const sitio = (h) => { if (y - h < M.aba) nueva(); };

  // ---- párrafos (con etiqueta «MLCOA:», viñetas y cursiva de las introducciones), partidos en líneas
  function lineasParrafo(b, w, tam) {
    const out = [];
    const fu = b.estilo === 'intro' ? 'F3' : 'F1';
    b.lineas.forEach((l0, i) => {
      const conBala = l0.startsWith('• ') || (b.vineta && i === 0);
      const l = (l0.startsWith('• ') ? l0.slice(2) : l0).replace(/ +/g, ' ');
      const ind = conBala ? 10 : (b.vineta ? 10 : 0);
      const et = i === 0 && b.etiqueta ? b.etiqueta : null;
      const fe = et?.negrita === false ? 'F1' : 'F2';
      const we = et ? anchoTexto(`${et.texto} `, fe, tam) : 0;
      const wTodo = w - ind;
      let resto = l;
      if (et) {
        if (wTodo - we < 40 && l) out.push({ x: ind, bala: conBala, partes: [{ s: et.texto, f: fe, color: et.color }] });
        else {
          const ls = l ? partirPdf(l, wTodo - we, fu, tam) : [''];
          out.push({ x: ind, bala: conBala, partes: [{ s: `${et.texto} `, f: fe, color: et.color }, { s: ls[0], f: fu }] });
          resto = l.slice(ls[0].length).trim();
          if (!resto) return;
        }
      }
      partirPdf(resto, wTodo, fu, tam).forEach((s, k) => out.push({ x: ind, bala: conBala && !et && k === 0, partes: [{ s, f: fu, sub: b.estilo === 'intro' }] }));
    });
    return out;
  }
  function pintarLinea(ln, x, base, tam) {
    if (ln.bala) texto('•', x + ln.x - 9, base, 'F1', tam);
    let xx = x + ln.x;
    for (const p of ln.partes) {
      texto(p.s, xx, base, p.f, tam, p.color);
      const w = anchoTexto(p.s, p.f, tam);
      if (p.sub) raya(xx, base - 1.5, xx + w, base - 1.5, 0.4);
      xx += w;
    }
  }

  // ---- tablas (también con celdas unidas, para la matriz de cometidos)
  function medirTabla(b, w, tam) {
    const lh = tam * 1.24, pad = 2.6;
    const n = b.cols.length;
    const filas = b.filas.length ? b.filas : Array.from({ length: b.vacia ?? 1 }, () => b.cols.map(() => ''));
    const anchos = b.anchos ? b.anchos.map((p) => p * w) : repartir(b.cols, filas, w, (t, neg) => anchoTexto(t, neg ? 'F2' : 'F1', tam), 2 * pad + 2, 30);
    const alto = (f, fu) => Math.max(1, ...f.slice(0, n).map((v, j) => partirPdf(String(v ?? ''), anchos[j] - 2 * pad, fu, tam).length)) * lh + 2 * pad;
    return { n, filas, anchos, lh, pad, alto };
  }
  /** Tabla sin partir (en la hoja): devuelve su alto; si `dibujar`, la pinta con la esquina arriba-izquierda en (x, yy). */
  function tablaEn(b, x, yy, w, tam, dibujar) {
    const { n, filas, anchos, lh, pad, alto } = medirTabla(b, w, tam);
    const xs = [0]; anchos.forEach((a, j) => xs.push(xs[j] + a));
    const hCab = b.sinCabecera ? 0 : alto(b.cols, 'F2');
    let celdas;
    if (b.fusionar) celdas = celdasUnidas(filas, n);
    else celdas = filas.flatMap((f, i) => f.slice(0, n).map((t, j) => ({ f: i, c: j, fs: 1, cs: 1, texto: String(t ?? '') })));
    // Alto de cada fila: el de sus celdas sencillas; las que ocupan varias filas reparten lo que falte
    const hs = filas.map(() => lh + 2 * pad);
    const lineasDe = (c) => partirPdf(c.texto, xs[c.c + c.cs] - xs[c.c] - 2 * pad, (b.primeraNegrita && c.c === 0) || (b.sinCabecera && c.c === 0) ? 'F2' : 'F1', tam);
    for (const c of celdas) if (c.fs === 1) hs[c.f] = Math.max(hs[c.f], lineasDe(c).length * lh + 2 * pad);
    for (const c of celdas) if (c.fs > 1) { const nec = lineasDe(c).length * lh + 2 * pad; const hay = hs.slice(c.f, c.f + c.fs).reduce((a, v) => a + v, 0); if (nec > hay) hs[c.f + c.fs - 1] += nec - hay; }
    const total = hCab + hs.reduce((a, v) => a + v, 0);
    if (!dibujar) return total;
    let yc = yy;
    if (hCab) {
      caja(x, yc - hCab, w, hCab, 0.91);
      b.cols.forEach((t, j) => partirPdf(String(t ?? ''), anchos[j] - 2 * pad, 'F2', tam).forEach((l, k) => texto(l, x + xs[j] + (anchos[j] - anchoTexto(l, 'F2', tam)) / 2, yc - pad - tam - k * lh + 1.5, 'F2', tam)));
      marco(x, yc - hCab, w, hCab, 0.5);
      for (let j = 1; j < n; j++) raya(x + xs[j], yc, x + xs[j], yc - hCab);
      yc -= hCab;
    }
    const ys = [yc]; hs.forEach((h, i) => ys.push(ys[i] - h));
    for (const c of celdas) {
      const cx = x + xs[c.c], cw = xs[c.c + c.cs] - xs[c.c];
      const top = ys[c.f], bot = ys[c.f + c.fs];
      const fu = (b.primeraNegrita && c.c === 0) || (b.sinCabecera && c.c === 0) || (b.totales && c.f === filas.length - 1) ? 'F2' : 'F1';
      const ls = partirPdf(c.texto, cw - 2 * pad, fu, tam);
      const centrar = b.fusionar && c.c > 0;
      const y0 = centrar ? top - (top - bot - ls.length * lh) / 2 : top - pad;
      ls.forEach((l, k) => texto(l, centrar ? cx + (cw - anchoTexto(l, fu, tam)) / 2 : cx + pad, y0 - tam - k * lh + 1.5 + (centrar ? 1 : 0), fu, tam));
      marco(cx, bot, cw, top - bot, 0.5);
    }
    return total;
  }

  // ---- organigrama (símbolos APP-6 en vectores)
  function organigramaEn(b, x, yy, w, tam, dibujar, centrar = false) {
    const d = disponer(b.unidades, { medir: (t, tm, neg) => anchoTexto(t, neg ? 'F2' : 'F1', tm) });
    if (!d.cajas.length) return 0;
    const k = Math.min(tam / CAJA.letra, w / d.ancho);
    const h = d.alto * k + 4;
    if (!dibujar) return h;
    const x0 = x + (centrar ? (w - d.ancho * k) / 2 : 0), y0 = yy - 2;
    const P = (px, py) => [x0 + px * k, y0 - py * k];
    pag.ops.push('0.35 0.4 0.47 RG');
    for (const l of d.lineas) { const [a, bb] = P(l[0], l[1]), [c, e] = P(l[2], l[3]); pag.ops.push(`${f2(0.7 * k)} w ${f2(a)} ${f2(bb)} m ${f2(c)} ${f2(e)} l S`); }
    pag.ops.push('0 G');
    const ks = CAJA.w / 150; // el marco amigo de los símbolos va de 25 a 175 (y de 50 a 150)
    for (const c of d.cajas) {
      const s = svgUnidad({ ...SIMBOLO_BASE, ...(c.u.simbolo ?? {}), identidad: c.u.simbolo?.identidad ?? 'amigo' }, { tam: 20, sinTextos: true });
      pag.ops.push(svgAPdf(s.svg, (sx, sy) => P(c.x + (sx - 25) * ks, c.y + (sy - 50) * ks), ks * k));
      for (const e of [c.nombre, c.sub]) {
        if (!e) continue;
        const fu = e === c.nombre ? 'F2' : 'F1', tm = e.tam * k;
        const [ex, ey] = P(e.x, e.y);
        texto(e.texto, e.ancla === 'end' ? ex - anchoTexto(e.texto, fu, tm) : ex, ey - tm * 0.35, fu, tm, e === c.sub ? '#5B6573' : null);
      }
    }
    return h;
  }

  // ---- imágenes (calco): JPEG tal cual (DCTDecode)
  function imagenEn(b, x, yy, w, hMax, dibujar) {
    const bytes = bytesDe(b.imagen.datos);
    const t = tamJpeg(bytes); if (!t) return 0;
    const k = Math.min(w / t.ancho, hMax / t.alto);
    const iw = t.ancho * k, ih = t.alto * k;
    if (dibujar) {
      let i = imagenes.findIndex((m) => m.datos === b.imagen.datos);
      if (i < 0) { imagenes.push({ datos: b.imagen.datos, bytes, ...t }); i = imagenes.length - 1; }
      pag.imgs.add(i);
      pag.ops.push(`q ${f2(iw)} 0 0 ${f2(ih)} ${f2(x + (w - iw) / 2)} ${f2(yy - ih)} cm /Im${i + 1} Do Q`);
    }
    return ih;
  }

  nueva();
  if (enHoja) hojaPdf(); else flujoPdf();

  // ================================================================ documento seguido
  function flujoPdf() {
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const x0 = M.izq + (b.nivel ?? 0) * SANG;
      if (b.t === 'clasificacion' || b.t === 'clasificacionFin') continue;
      if (b.t === 'cabecera') {
        const wDer = AN * 0.4;
        let yi = y, yd = y;
        for (const [t, neg] of b.der) for (const l of partirPdf(t, wDer, neg ? 'F2' : 'F1', 9.5)) { texto(l, M.izq + AN - anchoTexto(l, neg ? 'F2' : 'F1', 9.5), yd, neg ? 'F2' : 'F1', 9.5); yd -= 12; }
        for (const [t, neg] of b.izq) for (const l of partirPdf(t, AN * 0.58, neg ? 'F2' : 'F1', neg ? 11 : 9.5)) { texto(l, M.izq, yi, neg ? 'F2' : 'F1', neg ? 11 : 9.5); yi -= neg ? 14 : 12; }
        y = Math.min(yi, yd) - 14;
        continue;
      }
      if (b.t === 'titulo') {
        const tam = b.nivel === 0 ? 12 : b.nivel === 1 ? 11 : 10.5;
        const col = b.rotulo ? (b.nivel === 0 ? SANG * 1.2 : SANG) : 0;
        const txt = b.nivel === 0 ? b.texto.toUpperCase() : b.texto;
        const ls = partirPdf(txt, AN - (x0 - M.izq) - col - (b.marca ? anchoMarca(b.marca) + 8 : 0), 'F2', tam);
        const sig = bl[i + 1];
        const siguienteAlto = sig && (sig.t === 'parrafo' || sig.t === 'tabla' || sig.t === 'organigrama') ? 30 : 0;
        y -= b.nivel === 0 ? 10 : 5;
        sitio(ls.length * (tam + 3) + siguienteAlto);
        if (b.rotulo) texto(b.rotulo, x0, y - tam, 'F2', tam);
        ls.forEach((l, k) => {
          texto(l, x0 + col, y - tam, 'F2', tam);
          if (k === ls.length - 1) {
            let xx = x0 + col + anchoTexto(l, 'F2', tam) + 8;
            if (b.marca) { marcaPdf(b.marca, xx, y - tam); xx += anchoMarca(b.marca) + 6; }
            if (b.nota) texto(b.nota, xx, y - tam, 'F1', tam - 1);
          }
          y -= tam + 3;
        });
        y -= 3;
        continue;
      }
      const xc = x0 + (b.nivel === 0 ? SANG * 1.2 : SANG);
      if (b.t === 'parrafo') {
        for (const ln of lineasParrafo(b, AN - (xc - M.izq), 10)) { sitio(13); pintarLinea(ln, xc, y - 10, 10); y -= 13; }
        y -= 4;
        continue;
      }
      if (b.t === 'organigrama') {
        const w = AN - (xc - M.izq);
        const h = organigramaEn(b, xc, y, w, 9, false);
        sitio(h); organigramaEn(b, xc, y, w, 9, true); y -= h + 6;
        continue;
      }
      if (b.t === 'imagen') {
        const w = AN - (xc - M.izq), hMax = (A4[1] - M.arr - M.aba) * 0.7;
        const h = imagenEn(b, xc, y, w, hMax, false);
        sitio(h); imagenEn(b, xc, y, w, hMax, true); y -= h + 8;
        continue;
      }
      if (b.t === 'arbol') {
        for (const l of b.lineas) {
          sitio(13);
          const xx = xc + l.nivel * 16;
          if (l.nivel) { raya(xx - 10, y - 2, xx - 10, y - 7, 0.4); raya(xx - 10, y - 7, xx - 3, y - 7, 0.4); }
          texto(l.texto, xx, y - 10, l.nivel ? 'F1' : 'F2', 10); y -= 13;
        }
        y -= 4;
        continue;
      }
      if (b.t === 'enlace') {
        sitio(14);
        const xx = b.sangria ? xc : M.izq + (b.nivel ? SANG : SANG * 1.2);
        texto(b.texto, xx, y - 10, 'F1', 10);
        if (b.archivo) { const w = anchoTexto(b.texto, 'F1', 10); raya(xx, y - 11.5, xx + w, y - 11.5, 0.4); pag.enlaces.push({ rect: [xx, y - 13, xx + w, y], archivo: b.archivo.replace(/\.[a-z]+$/i, '.pdf') }); }
        y -= 14;
        continue;
      }
      if (b.t === 'firma') {
        y -= 30; sitio(14 * 3);
        for (const l of (b.lineas.length ? b.lineas : [b.defecto])) { texto(l, M.izq + AN - anchoTexto(l, 'F2', 10), y - 10, 'F2', 10); y -= 13; }
        continue;
      }
      if (b.t === 'tabla') {
        const tam = 8.5;
        const xT = M.izq + Math.min(b.nivel ?? 0, 2) * SANG + SANG, wT = M.izq + AN - xT; // como mucho, al segundo nivel
        if (b.titulo) { sitio(30); texto(b.titulo, xT, y - 9, 'F2', 9); y -= 13; }
        if (b.fusionar) { const h = tablaEn(b, xT, y, wT, tam, false); sitio(h); tablaEn(b, xT, y, wT, tam, true); y -= h + 8; continue; }
        const { n, filas, anchos, lh, pad, alto } = medirTabla(b, wT, tam);
        const dibujarFila = (f, { cab = false, negrita = () => false } = {}) => {
          const h = alto(f, cab ? 'F2' : 'F1');
          if (cab) caja(xT, y - h, wT, h, 0.91);
          let xx = xT;
          for (let j = 0; j < n; j++) {
            const fu = cab || negrita(j) ? 'F2' : 'F1';
            const ls = partirPdf(String(f[j] ?? ''), anchos[j] - 2 * pad, fu, tam);
            ls.forEach((l, k) => texto(l, cab ? xx + (anchos[j] - anchoTexto(l, fu, tam)) / 2 : xx + pad, y - pad - tam - k * lh + 1.5, fu, tam));
            raya(xx, y, xx, y - h); xx += anchos[j];
          }
          raya(xT + wT, y, xT + wT, y - h); raya(xT, y, xT + wT, y); raya(xT, y - h, xT + wT, y - h);
          y -= h;
        };
        const cab = () => { if (!b.sinCabecera) dibujarFila(b.cols, { cab: true }); };
        // Una tabla corta (menos de media página) no se parte: si no cabe, empieza en la página siguiente
        const altoTotal = (b.sinCabecera ? 0 : alto(b.cols, 'F2')) + filas.reduce((a, f) => a + alto(f, 'F1'), 0);
        sitio(altoTotal < (A4[1] - M.arr - M.aba) * 0.5 ? altoTotal : alto(b.cols, 'F2') + alto(filas[0], 'F1'));
        cab();
        filas.forEach((f, k) => {
          const h = alto(f, 'F1');
          if (y - h < M.aba) { nueva(); cab(); }
          dibujarFila(f, { negrita: (j) => (b.primeraNegrita && j === 0) || (b.sinCabecera && j === 0) || (b.totales && k === filas.length - 1) });
        });
        y -= 8;
      }
    }
  }

  // ================================================================ una hoja en cuadrícula
  function hojaPdf() {
    const c = doc.cabecera ?? {};
    const tituloH = `OPORD ${[c.numero, c.nombre ? `“${String(c.nombre).toUpperCase()}”` : ''].filter(Boolean).join(' ')}`.trim();
    const PAD = 3.2;
    // Alto del contenido de una columna con letra `s` (y lo pinta si `dibujar`)
    function columna(cl, x, yy, w, s, dibujar, hImg) {
      const lh = s * 1.24;
      let yc = yy - PAD;
      const wi = w - 2 * PAD, xi = x + PAD;
      cl.bloques.forEach((b, i) => {
        if (b.t === 'titulo') {
          const centrado = cl.bloques[i + 1]?.t === 'organigrama';
          const fin = b.nivel === 0 ? (b.rotulo ? '.' : '') : ':';
          const txt = `${b.rotulo ? `${b.rotulo} ` : ''}${b.nivel === 0 ? b.texto.toUpperCase() : b.texto.toUpperCase()}${fin}`;
          const tam = b.nivel === 0 ? s + 0.4 : s;
          const nota = b.nota ? ` ${b.nota}` : '';
          const ls = partirPdf(txt + nota, wi, 'F2', tam);
          if (i > 0) yc -= lh * 0.25;
          ls.forEach((l, k) => {
            if (dibujar) {
              const conNota = nota && k === ls.length - 1 && l.endsWith(nota.trim());
              const tit = conNota ? l.slice(0, l.length - nota.trim().length).trimEnd() : l;
              const xx = centrado ? xi + (wi - anchoTexto(l, 'F2', tam)) / 2 : xi;
              texto(tit, xx, yc - tam, 'F2', tam);
              if (b.nivel === 0 && !centrado) raya(xx, yc - tam - 1.3, xx + anchoTexto(tit, 'F2', tam), yc - tam - 1.3, 0.5);
              if (conNota) texto(nota.trim(), xx + anchoTexto(`${tit} `, 'F2', tam), yc - tam, 'F1', tam);
            }
            yc -= tam * 1.22;
          });
          return;
        }
        if (b.t === 'parrafo') {
          for (const ln of lineasParrafo(b, wi, s)) { if (dibujar) pintarLinea(ln, xi, yc - s, s); yc -= lh; }
          return;
        }
        if (b.t === 'tabla') {
          if (b.titulo) { if (dibujar) texto(b.titulo, xi + (wi - anchoTexto(b.titulo, 'F2', s + 0.4)) / 2, yc - s - 0.4, 'F2', s + 0.4); yc -= (s + 0.4) * 1.3; }
          yc -= tablaEn(b, xi, yc, wi, s - 0.3, dibujar) + 3;
          return;
        }
        if (b.t === 'organigrama') { yc -= organigramaEn(b, xi, yc, wi, s, dibujar, true) + 2; return; }
        if (b.t === 'imagen') { yc -= imagenEn(b, x + 0.6, yc + PAD - 0.6, w - 1.2, hImg, dibujar) - PAD + 1.2; return; }
        if (b.t === 'enlace') { if (dibujar) texto(b.texto, xi, yc - s, 'F1', s); yc -= lh; return; }
        if (b.t === 'firma') { yc -= lh; for (const l of (b.lineas.length ? b.lineas : [b.defecto])) { if (dibujar) texto(l, xi + wi - anchoTexto(l, 'F2', s), yc - s, 'F2', s); yc -= lh; } }
      });
      return yy - yc + PAD;
    }
    const hCab = 21 + 14;
    const disponible = A4[1] - M.arr - M.aba - hCab;
    const conCalco = (cl) => cl.k.includes('ejec.calco');
    const hayImagen = bl.hoja.some((f) => f.some((cl) => cl.bloques.some((b) => b.t === 'imagen')));
    // El hueco del calco se ve aunque esté vacío
    const alturas = (s, hImg) => bl.hoja.map((fila) => Math.max(12, ...fila.map((cl) => Math.max(conCalco(cl) && !hayImagen ? disponible * 0.24 : 0, columna(cl, 0, 0, cl.w * AN, s, false, hImg)))));
    // La letra más grande con la que todo cabe en una hoja (de 10,5 a 6 puntos); el calco se queda con lo que sobre
    const suma = (a) => a.reduce((t, v) => t + v, 0);
    let s = 10.5, hImg = disponible * 0.36, hs = alturas(s, hImg);
    while (suma(hs) > disponible && s > 6) { s = +(s - 0.25).toFixed(2); hs = alturas(s, hImg); }
    if (suma(hs) > disponible && hayImagen) { hImg = Math.max(disponible * 0.2, hImg - (suma(hs) - disponible)); hs = alturas(s, hImg); }
    if (suma(hs) < disponible && hayImagen) { hImg += disponible - suma(hs); hs = alturas(s, hImg); }
    // Cabecera: título y «Unidad | GFH»
    const yT = y;
    marco(M.izq, yT - 21, AN, 21, 0.8);
    texto(tituloH, M.izq + (AN - anchoTexto(tituloH, 'F2', 13)) / 2, yT - 15, 'F2', 13);
    const uni = `${tx.unidad}: ${c.emisor || ''}`, gfh = `${tx.gdh}${c.huso ? ` (${HUSOS[c.huso] ?? c.huso})` : ''} ${c.gdh || ''}`.trim();
    marco(M.izq, yT - 35, AN / 2, 14, 0.6); marco(M.izq + AN / 2, yT - 35, AN / 2, 14, 0.6);
    texto(uni, M.izq + (AN / 2 - anchoTexto(uni, 'F2', 8.5)) / 2, yT - 31.5, 'F2', 8.5);
    texto(gfh, M.izq + AN / 2 + (AN / 2 - anchoTexto(gfh, 'F1', 8.5)) / 2, yT - 31.5, 'F1', 8.5);
    y = yT - hCab;
    bl.hoja.forEach((fila, i) => {
      const h = hs[i];
      if (y - h < M.aba - 1 && y < yT - hCab - 1) nueva();
      let x = M.izq;
      for (const cl of fila) {
        const w = cl.w * AN;
        columna(cl, x, y, w, s, true, hImg);
        marco(x, y - h, w, h, 0.6);
        x += w;
      }
      y -= h;
    });
  }

  // Cabecera y pie en cada página (ahora que se sabe cuántas hay)
  const colorClasif = clasifB?.color ?? null;
  paginas.forEach((p, i) => {
    pag = p;
    if (clasif) {
      const tc = enHoja ? colorClasif : null;
      texto(clasif, (A4[0] - anchoTexto(clasif, 'F2', 10)) / 2, A4[1] - (enHoja ? 26 : 34), 'F2', 10, tc);
      texto(clasif, (A4[0] - anchoTexto(clasif, 'F2', 10)) / 2, enHoja ? 18 : 30, 'F2', 10, tc);
    }
    if (i > 0 && tituloDoc && !enHoja) { const t = tituloDoc.length > 110 ? `${tituloDoc.slice(0, 107)}…` : tituloDoc; texto(t, (A4[0] - anchoTexto(t, 'F1', 7.5)) / 2, A4[1] - 46, 'F1', 7.5); }
    if (!enHoja || paginas.length > 1) {
      const np = `${tx.pagina} ${i + 1} ${tx.de} ${paginas.length}`;
      texto(np, A4[0] - M.der - anchoTexto(np, 'F1', 8), enHoja ? 18 : 30, 'F1', 8);
    }
  });
  // Montar el archivo
  const objs = [];
  const nuevoObj = (cuerpo) => { objs.push(cuerpo); return objs.length; };
  const catalogo = nuevoObj(null), arbol = nuevoObj(null);
  let fuentes;
  if (letras) {
    // Letra incrustada (TrueType, WinAnsi): F1 normal, F2 negrita y F3 = la normal inclinada
    const incrustar = async (f, nombre) => {
      const comp = await desinflar(f.bytes);
      const datos = comp ?? f.bytes;
      const archivo = nuevoObj(`<< /Length ${datos.length} /Length1 ${f.bytes.length}${comp ? ' /Filter /FlateDecode' : ''} >>\nstream\n${binario(datos)}\nendstream`);
      const e = (v) => Math.round((v * 1000) / f.upem);
      const desc = nuevoObj(`<< /Type /FontDescriptor /FontName /${nombre} /Flags 32 /FontBBox [${f.caja.map(e).join(' ')}] /ItalicAngle ${f.italica} /Ascent ${e(f.ascendente)} /Descent ${e(f.descendente)} /CapHeight ${e(f.mayusculas)} /StemV 80 /FontFile2 ${archivo} 0 R >>`);
      return nuevoObj(`<< /Type /Font /Subtype /TrueType /BaseFont /${nombre} /FirstChar 32 /LastChar 255 /Widths [${f.anchos.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${desc} 0 R >>`);
    };
    const nombre = String(letras.nombre).replace(/[^A-Za-z0-9-]/g, '');
    const n1 = await incrustar(letras.normal, nombre), n2 = await incrustar(letras.negrita, `${nombre}-Bold`);
    fuentes = [n1, n2, n1];
  } else fuentes = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].map((f) => nuevoObj(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  const objImg = imagenes.map((m) => nuevoObj(`<< /Type /XObject /Subtype /Image /Width ${m.ancho} /Height ${m.alto} /ColorSpace /${m.comps === 1 ? 'DeviceGray' : m.comps === 4 ? 'DeviceCMYK' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${m.bytes.length} >>\nstream\n${binario(m.bytes)}\nendstream`));
  const info = nuevoObj(`<< /Title ${cadenaPdf(tituloDoc)} /Producer (SPA) /Creator (SPA) >>`);
  const kids = [];
  for (const p of paginas) {
    const flujo = p.ops.join('\n');
    const cont = nuevoObj(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
    const annots = p.enlaces.map((e) => nuevoObj(`<< /Type /Annot /Subtype /Link /Rect [${e.rect.map((v) => v.toFixed(2)).join(' ')}] /Border [0 0 0] /A << /S /GoToR /F ${cadenaPdf(e.archivo)} /D [0 /Fit] /NewWindow true >> >>`));
    const xo = [...p.imgs].map((i) => `/Im${i + 1} ${objImg[i]} 0 R`).join(' ');
    kids.push(nuevoObj(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /Font << /F1 ${fuentes[0]} 0 R /F2 ${fuentes[1]} 0 R /F3 ${fuentes[2]} 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${cont} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`));
  }
  objs[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R >>`;
  objs[arbol - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let s = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  s += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}

// ---------------------------------------------------------------- todo junto
export const FORMATOS_OPORD = Object.freeze({
  pdf: { nombre: 'PDF', ext: 'pdf' },
  docx: { nombre: 'Word', ext: 'docx' },
  xlsx: { nombre: 'Excel', ext: 'xlsx' },
  txt: { nombre: 'Texto', ext: 'txt' },
});

/** Nombre de archivo (sin extensión) de una OPORD o anexo. */
export function baseArchivo(doc, opord = null) {
  if (doc.tipo === 'anexo') {
    const letra = opord ? letraAnexo(opord, doc.id) : 'X';
    return nombreArchivo(`${opord ? `${baseArchivo(opord)} - ` : ''}Anexo ${letra} ${doc.cabecera.titulo || ANEXOS[doc.plantilla]?.nombre || ''}`);
  }
  return nombreArchivo(`OPORD ${[doc.cabecera.numero, doc.cabecera.nombre].filter(Boolean).join(' ')}`.trim());
}

/**
 * Archivos de una OPORD y sus anexos en los formatos pedidos.
 * @param {object} opord
 * @param {{anexos:object[], paquetes:object[], permanentes?:object[], formatos:string[], extra?:{nombre:string, blob:Blob}[], fuentesPdf?:object, imagenes?:object}} o
 * @returns {Promise<{nombre:string, blob:Blob}[]>}
 */
export async function archivosOpord(opord, { anexos = [], paquetes = [], permanentes = [], formatos = ['pdf'], extra = [], fuentesPdf = null, imagenes = null } = {}) {
  const out = [];
  const docs = [opord, ...opord.anexos.map((id) => anexos.find((a) => a.id === id)).filter(Boolean)];
  for (const f of formatos) {
    const ext = FORMATOS_OPORD[f]?.ext; if (!ext) continue;
    for (const d of docs) {
      const ctx = { anexos, opord, paquetes, permanentes, fuentesPdf, imagenes, archivoDe: (x) => `${baseArchivo(x, opord)}.${ext}` };
      const nombre = `${baseArchivo(d, opord)}.${ext}`;
      let blob;
      if (f === 'pdf') blob = await aPdf(d, ctx);
      else if (f === 'docx') blob = await aDocx(d, ctx);
      else if (f === 'xlsx') blob = await aXlsx(d, ctx);
      else blob = new Blob([aTexto(d, ctx)], { type: 'text/plain;charset=utf-8' });
      out.push({ nombre, blob });
    }
  }
  return [...out, ...extra];
}

/** Mete varios archivos en un ZIP. */
export async function zipDe(archivos, carpeta = '') {
  const lista = [];
  for (const a of archivos) lista.push({ nombre: `${carpeta ? `${carpeta}/` : ''}${a.nombre}`, datos: new Uint8Array(await a.blob.arrayBuffer()) });
  return escribirZip(lista);
}
