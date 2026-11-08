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
  numerar, recorrer, titulo, fasesDe, tituloFase, unidadesManiobra, agregacionesAuto, orgEnLineas,
  htmlALineas, letraAnexo, tituloDocumento, nombreArchivo,
} from './documento.js';
import { escribirZip } from '../datos/exportar.js';
import { ANEXOS } from './plantillas.js';

const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// Quita caracteres que XML 1.0 no admite
const limpio = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const TXT = {
  en: { copia: 'Copy', de: 'of', copias: 'copies', huso: 'Time zone used throughout the order', ref: 'References', unidad: 'Unit', bpt: 'BPT', fase: 'Phase', total: 'TOTAL', vease: 'See', anexo: 'Annex', pagina: 'Page', acuse: 'ACKNOWLEDGE.', sinFase: 'Phase deleted', mgrs: 'MGRS', permanentes: 'None', firma: 'Commander', emisor: 'Issuing HQ', lugar: 'Place', gdh: 'DTG', msg: 'Message ref.' },
  es: { copia: 'Ejemplar n.º', de: 'de', copias: 'ejemplares', huso: 'Huso horario de la orden', ref: 'Referencias', unidad: 'Unidad', bpt: 'ECD', fase: 'Fase', total: 'TOTAL', vease: 'Véase', anexo: 'Anexo', pagina: 'Página', acuse: 'ACUSE DE RECIBO.', sinFase: 'Fase eliminada', mgrs: 'MGRS', permanentes: 'Ninguno', firma: 'El jefe', emisor: 'Cuartel general', lugar: 'Lugar', gdh: 'GDH', msg: 'Ref. del mensaje' },
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
  out.push({ t: 'clasificacion', texto: c.clasificacion || '' });
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
  recorrer(doc, (n, nivel) => {
    if (n.plano) return; // contenedor de fases: sin título propio
    const r = num.get(n.id) ?? { rotulo: '', nivel };
    const niv = r.nivel ?? nivel;
    let tit = titulo(n, idi);
    if (n.fase) { const f = fases.find((x) => x.id === n.fase); tit = f ? tituloFase(f, idi) : `${n.titulo || tx.sinFase}`; }
    if (n.tipo === 'firma') { out.push({ t: 'titulo', nivel: 0, rotulo: '', texto: tx.acuse, sinNumero: true }); }
    else out.push({ t: 'titulo', nivel: niv, rotulo: r.rotulo, texto: tit });
    if (n.intro) out.push({ t: 'parrafo', nivel: niv, lineas: [n.intro[idi] ?? n.intro.es], estilo: 'intro' });
    const lineas = htmlALineas(n.texto);
    if (lineas.length) out.push({ t: 'parrafo', nivel: niv, lineas });
    if (n.tipo === 'org') {
      const ls = orgEnLineas(doc);
      if (ls.length) out.push({ t: 'arbol', nivel: niv, lineas: ls.map((l) => ({ nivel: l.nivel, texto: l.texto })) });
    }
    if (n.tipo === 'agregaciones') {
      const filas = [...agregacionesAuto(doc), ...n.tabla.filas];
      out.push({ t: 'tabla', nivel: niv, cols: n.tabla.cols.map((x) => x[idi] ?? x.es), filas: filas.map((f) => n.tabla.cols.map((x) => valorCelda(f.c?.[x.k], idi))).filter((f) => f.some((v) => v.trim())), vacia: 2 });
    } else if (n.tabla) {
      const t = tablaPlana(n.tabla, idi);
      if (n.tabla.previo) out.push({ t: 'tabla', nivel: niv, cols: ['', ''], filas: n.tabla.previo.map((cp) => [cp[idi] ?? cp.es, String(n.tabla.valoresPrevio?.[cp.k] ?? '')]), sinCabecera: true });
      out.push({ t: 'tabla', nivel: niv, cols: t.cols, filas: t.filas, totales: t.totales, vacia: 2 });
    }
    if (n.tipo === 'matriz') {
      const us = [...unidadesManiobra(doc).map((u) => ({ id: u.id, nombre: u.nombre })), ...(n.matriz.filas ?? [])];
      const cols = [tx.unidad, ...fases.map((f) => sinPartirGdh(`${tituloFase(f, idi, { corto: true })}${f.inicio || f.fin ? `: ${[f.inicio, f.fin].filter(Boolean).join(' – ')}` : ''}`)), tx.bpt];
      out.push({ t: 'tabla', nivel: niv, cols, filas: us.map((u) => [u.nombre, ...fases.map((f) => n.matriz.celdas?.[u.id]?.[f.id] ?? ''), n.matriz.bpt?.[u.id] ?? '']), primeraNegrita: true, vacia: 1 });
    }
    if (n.tipo === 'matrizFases') {
      const cab = n.matriz.cabecera?.[idi] ?? (idi === 'en' ? 'Element' : 'Elemento');
      const cols = [cab, ...fases.map((f) => sinPartirGdh(`${tituloFase(f, idi, { corto: true })}${f.inicio || f.fin ? `: ${[f.inicio, f.fin].filter(Boolean).join(' – ')}` : ''}`))];
      out.push({ t: 'tabla', nivel: niv, cols, filas: (n.matriz.filas ?? []).map((fl) => [fl.nombre ?? '', ...fases.map((f) => n.matriz.celdas?.[fl.id]?.[f.id] ?? '')]), primeraNegrita: true, vacia: 2 });
    }
    if (n.tipo === 'permanentes') {
      const ps = ctx.permanentes ?? [];
      out.push({ t: 'parrafo', nivel: niv, lineas: ps.length ? ps.map((p) => `• ${p.nombre}`) : [`— ${tx.permanentes}`] });
    }
    if (n.tipo === 'formulario') {
      out.push({ t: 'tabla', nivel: niv, cols: ['', ''], filas: n.campos.map((cp) => [cp[idi] ?? cp.es, valorCampo(cp, n.valores?.[cp.k], idi)]), sinCabecera: true, anchos: [0.42, 0.58] });
    }
    if (n.tipo === 'anexos' && doc.tipo === 'opord') {
      for (const a of anexosDe(doc.anexos)) out.push({ t: 'enlace', nivel: 0, texto: `${tx.anexo} ${letraAnexo(doc, a.id)} — ${a.cabecera.titulo || ANEXOS[a.plantilla]?.[idi] || ''}`, archivo: ctx.archivoDe?.(a) });
    }
    if (n.tipo === 'firma') {
      const f = n.firma ?? {};
      out.push({ t: 'firma', lineas: [f.jefe, f.empleo, f.cargo].filter(Boolean), defecto: tx.firma });
    }
    for (const a of anexosDe(n.enlaces ?? [])) out.push({ t: 'enlace', nivel: niv, texto: `${tx.vease} ${tx.anexo} ${opord ? letraAnexo(opord, a.id) : ''} — ${a.cabecera.titulo || ANEXOS[a.plantilla]?.[idi] || ''}`, archivo: ctx.archivoDe?.(a), sangria: true });
  });
  out.push({ t: 'clasificacionFin', texto: c.clasificacion || '' });
  return out;
}

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
      const ls = partir(`${cab}${b.texto}`, ANCHO - x);
      L.push('', ...ls.map((l, i) => (i ? ' '.repeat(x + cab.length) : pre) + l));
    } else if (b.t === 'parrafo') {
      for (const l of b.lineas) L.push(...partir(l, ANCHO - x - SANG).map((s) => pre + ' '.repeat(SANG) + s));
    } else if (b.t === 'arbol') {
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
function runs(texto, { negrita = false, cursiva = false, tam = null, subrayado = false } = {}) {
  const rpr = `<w:rPr>${negrita ? '<w:b/>' : ''}${cursiva ? '<w:i/>' : ''}${subrayado ? '<w:u w:val="single"/>' : ''}${tam ? `<w:sz w:val="${tam * 2}"/><w:szCs w:val="${tam * 2}"/>` : ''}</w:rPr>`;
  return `<w:r>${rpr}<w:t xml:space="preserve">${xml(limpio(texto))}</w:t></w:r>`;
}
const par = (contenido, { izq = 0, colgante = 0, centro = false, derecha = false, antes = 0, despues = 80, conSiguiente = false, tab = null } = {}) =>
  `<w:p><w:pPr>${conSiguiente ? '<w:keepNext/>' : ''}${tab ? `<w:tabs><w:tab w:val="left" w:pos="${tab}"/></w:tabs>` : ''}<w:spacing w:before="${antes}" w:after="${despues}"/><w:ind w:left="${izq}" w:hanging="${colgante}"/>${centro ? '<w:jc w:val="center"/>' : derecha ? '<w:jc w:val="right"/>' : ''}</w:pPr>${contenido}</w:p>`;

function tablaDocx(b, izq, anchoTotal) {
  const n = b.cols.length;
  // Arial mide como Helvetica: mismas medidas que el PDF (en vigésimas de punto)
  const anchos = (b.anchos ? b.anchos.map((p) => p * anchoTotal) : repartir(b.cols, b.filas, anchoTotal, (t, neg) => anchoTexto(t, neg ? 'F2' : 'F1', 9) * 20 * 1.04, 200, 680)).map((w) => Math.round(w));
  const celda = (t, w, { cab = false, negrita = false } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${cab ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E9EE"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${String(t ?? '').split('\n').map((l) => `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${cab ? '<w:jc w:val="center"/>' : ''}</w:pPr>${runs(l, { negrita: cab || negrita, tam: 9 })}</w:p>`).join('')}</w:tc>`;
  const filas = b.filas.length ? b.filas : Array.from({ length: b.vacia ?? 1 }, () => b.cols.map(() => ''));
  const borde = (k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="8A8F99"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${anchoTotal}" w:type="dxa"/><w:tblInd w:w="${izq}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid>${anchos.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
${b.sinCabecera ? '' : `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${b.cols.map((c, i) => celda(c, anchos[i], { cab: true })).join('')}</w:tr>`}
${filas.map((f, j) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${f.slice(0, n).map((v, i) => celda(v, anchos[i], { negrita: (b.primeraNegrita && i === 0) || (b.sinCabecera && i === 0) || (b.totales && j === filas.length - 1) })).join('')}</w:tr>`).join('')}
</w:tbl>${par('', { despues: 60 })}`;
}

/** Word (.docx). */
export async function aDocx(doc, ctx = {}) {
  const ANCHO = 9638; // A4 con márgenes de 2 cm
  const bl = bloques(doc, ctx);
  const rels = [];
  const cuerpo = [];
  const clasif = bl.find((b) => b.t === 'clasificacion')?.texto || '';
  const tituloDoc = bl.find((b) => b.t === 'cabecera')?.izq?.[0]?.[0] ?? '';
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
      cuerpo.push(par(`${b.rotulo ? `${runs(b.rotulo, { negrita: true, tam })}<w:r><w:tab/></w:r>` : ''}${runs(b.nivel === 0 ? b.texto.toUpperCase() : b.texto, { negrita: true, tam })}`, { izq: b.rotulo ? x + col : x, colgante: b.rotulo ? col : 0, tab: b.rotulo ? x + col : null, antes: b.nivel === 0 ? 240 : 140, despues: 60, conSiguiente: true }));
    } else if (b.t === 'parrafo') {
      const izq = x + TW * (b.nivel === 0 ? 1.2 : 1);
      for (const l of b.lineas) {
        const bala = l.startsWith('• ');
        cuerpo.push(par(runs(bala ? `•\t${l.slice(2)}` : l, { cursiva: b.estilo === 'intro', subrayado: b.estilo === 'intro', tam: 10 }), { izq: bala ? izq + 340 : izq, colgante: bala ? 340 : 0, tab: bala ? izq + 340 : null, despues: 60 }));
      }
    } else if (b.t === 'arbol') {
      for (const l of b.lineas) cuerpo.push(par(runs(`${l.nivel ? '└ ' : ''}${l.texto}`, { negrita: l.nivel === 0, tam: 10 }), { izq: x + TW + l.nivel * 400, despues: 20 }));
      cuerpo.push(par('', { despues: 60 }));
    } else if (b.t === 'tabla') {
      const izq = Math.min(b.nivel ?? 0, 2) * TW + TW; // las tablas no se meten más allá del segundo nivel: necesitan sitio
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
  const pie = (centro) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${centro}r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runs(clasif, { negrita: true, tam: 10 })}</w:p>
${centro === 'ft' ? `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${runs(`${TXT[doc.idioma === 'en' ? 'en' : 'es'].pagina} `, { tam: 8 })}<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>${runs(` ${TXT[doc.idioma === 'en' ? 'en' : 'es'].de} `, { tam: 8 })}<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p>` : `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runs(tituloDoc, { tam: 8 })}</w:p>`}
</w:${centro}r>`.replace('<w:ftr', '<w:ftr').replace('<w:hdr', '<w:hdr');
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${cuerpo.join('\n')}
<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="${doc.idioma === 'en' ? 'en-GB' : 'es-ES'}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F4E9A"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;
  const archivos = [
    { nombre: '[Content_Types].xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
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
    if (b.t === 'titulo') { principal.push([b.rotulo, `${'   '.repeat(b.nivel ?? 0)}${b.texto}`, '']); ultimo = b; continue; }
    if (b.t === 'parrafo') { const f = principal.at(-1); f[2] = [f[2], ...b.lineas].filter(Boolean).join('\n'); continue; }
    if (b.t === 'arbol') { const f = principal.at(-1); f[2] = [f[2], ...b.lineas.map((l) => `${'   '.repeat(l.nivel)}${l.texto}`)].filter(Boolean).join('\n'); continue; }
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
function anchoTexto(s, fuente, tam) {
  let w = 0;
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

/** PDF (A4), con cabecera y pie de clasificación, «Página X de Y» y enlaces a los anexos. */
export async function aPdf(doc, ctx = {}) {
  const A4 = [595.28, 841.89];
  const M = { izq: 56.7, der: 51, arr: 72, aba: 62 };
  const AN = A4[0] - M.izq - M.der;
  const SANG = 28.35; // 1 cm por nivel
  const bl = bloques(doc, ctx);
  const clasif = bl.find((b) => b.t === 'clasificacion')?.texto || '';
  const tituloDoc = bl.find((b) => b.t === 'cabecera')?.izq?.[0]?.[0] ?? '';
  const tx = TXT[doc.idioma === 'en' ? 'en' : 'es'];
  const paginas = [];
  let pag = null, y = 0;
  const nueva = () => { pag = { ops: [], enlaces: [] }; paginas.push(pag); y = A4[1] - M.arr; };
  const texto = (s, x, yy, fuente = 'F1', tam = 10) => pag.ops.push(`BT /${fuente} ${tam} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${cadenaPdf(s)} Tj ET`);
  const raya = (x1, y1, x2, y2, gr = 0.5) => pag.ops.push(`${gr} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  const caja = (x, yy, w, h, gris) => pag.ops.push(`${gris} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  const sitio = (h) => { if (y - h < M.aba) nueva(); };
  nueva();
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
      const ls = partirPdf(txt, AN - (x0 - M.izq) - col, 'F2', tam);
      const sig = bl[i + 1];
      const siguienteAlto = sig && (sig.t === 'parrafo' || sig.t === 'tabla') ? 30 : 0;
      y -= b.nivel === 0 ? 10 : 5;
      sitio(ls.length * (tam + 3) + siguienteAlto);
      if (b.rotulo) texto(b.rotulo, x0, y - tam, 'F2', tam);
      for (const l of ls) { texto(l, x0 + col, y - tam, 'F2', tam); y -= tam + 3; }
      y -= 3;
      continue;
    }
    const xc = x0 + (b.nivel === 0 ? SANG * 1.2 : SANG);
    if (b.t === 'parrafo') {
      const f = b.estilo === 'intro' ? 'F3' : 'F1';
      for (const l of b.lineas) {
        const bala = l.startsWith('• ');
        const ls = partirPdf(bala ? l.slice(2) : l, AN - (xc - M.izq) - (bala ? 12 : 0), f, 10);
        for (const [j, s] of ls.entries()) {
          sitio(13);
          if (bala && j === 0) texto('•', xc, y - 10, 'F1', 10);
          texto(s, xc + (bala ? 12 : 0), y - 10, f, 10);
          if (b.estilo === 'intro') raya(xc, y - 11.5, xc + anchoTexto(s, f, 10), y - 11.5, 0.4);
          y -= 13;
        }
      }
      y -= 4;
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
      const tam = 8.5, lh = 10.5, pad = 3;
      const xT = M.izq + Math.min(b.nivel ?? 0, 2) * SANG + SANG, wT = M.izq + AN - xT; // como mucho, al segundo nivel
      const n = b.cols.length;
      const filas = b.filas.length ? b.filas : Array.from({ length: b.vacia ?? 1 }, () => b.cols.map(() => ''));
      const anchos = b.anchos ? b.anchos.map((p) => p * wT) : repartir(b.cols, filas, wT, (t, neg) => anchoTexto(t, neg ? 'F2' : 'F1', tam), 2 * pad + 2, 34);
      const alto = (f, fuente) => Math.max(...f.slice(0, n).map((v, j) => partirPdf(String(v ?? ''), anchos[j] - 2 * pad, fuente, tam).length)) * lh + 2 * pad;
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
  // Cabecera y pie en cada página (ahora que se sabe cuántas hay)
  paginas.forEach((p, i) => {
    pag = p;
    if (clasif) { texto(clasif, (A4[0] - anchoTexto(clasif, 'F2', 10)) / 2, A4[1] - 34, 'F2', 10); texto(clasif, (A4[0] - anchoTexto(clasif, 'F2', 10)) / 2, 30, 'F2', 10); }
    if (i > 0 && tituloDoc) { const t = tituloDoc.length > 110 ? `${tituloDoc.slice(0, 107)}…` : tituloDoc; texto(t, (A4[0] - anchoTexto(t, 'F1', 7.5)) / 2, A4[1] - 46, 'F1', 7.5); }
    const np = `${tx.pagina} ${i + 1} ${tx.de} ${paginas.length}`;
    texto(np, A4[0] - M.der - anchoTexto(np, 'F1', 8), 30, 'F1', 8);
  });
  // Montar el archivo
  const objs = [];
  const nuevoObj = (cuerpo) => { objs.push(cuerpo); return objs.length; };
  const catalogo = nuevoObj(null), arbol = nuevoObj(null);
  const fuentes = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].map((f) => nuevoObj(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  const info = nuevoObj(`<< /Title ${cadenaPdf(tituloDoc)} /Producer (SPA) /Creator (SPA) >>`);
  const kids = [];
  for (const p of paginas) {
    const flujo = p.ops.join('\n');
    const cont = nuevoObj(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
    const annots = p.enlaces.map((e) => nuevoObj(`<< /Type /Annot /Subtype /Link /Rect [${e.rect.map((v) => v.toFixed(2)).join(' ')}] /Border [0 0 0] /A << /S /GoToR /F ${cadenaPdf(e.archivo)} /D [0 /Fit] /NewWindow true >> >>`));
    kids.push(nuevoObj(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /Font << /F1 ${fuentes[0]} 0 R /F2 ${fuentes[1]} 0 R /F3 ${fuentes[2]} 0 R >> >> /Contents ${cont} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`));
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
 * @param {{anexos:object[], paquetes:object[], permanentes?:object[], formatos:string[], extra?:{nombre:string, blob:Blob}[]}} o
 * @returns {Promise<{nombre:string, blob:Blob}[]>}
 */
export async function archivosOpord(opord, { anexos = [], paquetes = [], permanentes = [], formatos = ['pdf'], extra = [] } = {}) {
  const out = [];
  const docs = [opord, ...opord.anexos.map((id) => anexos.find((a) => a.id === id)).filter(Boolean)];
  for (const f of formatos) {
    const ext = FORMATOS_OPORD[f]?.ext; if (!ext) continue;
    for (const d of docs) {
      const ctx = { anexos, opord, paquetes, permanentes, archivoDe: (x) => `${baseArchivo(x, opord)}.${ext}` };
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
