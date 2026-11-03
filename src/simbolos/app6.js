// Símbolos de unidades, material, instalaciones y organizaciones civiles
// conforme a la APP-6(E) Ed. E v2 (oct. 2025), capítulos 1 y 3, con las
// denominaciones de la PD0-002 del MADOC.
//
// Los iconos y modificadores salen del propio PDF oficial (vectorizados por
// herramientas/app6/, ver datos/iconos.js); aquí se montan marco, icono,
// modificadores y amplificadores.
//
// Geometría (APP-6(E) 1.3, tabla 1-14): octógono de referencia de lado L = 100
// centrado en (100, 100) → ocupa de 50 a 150.
//   Unidad amigo     rectángulo 1,5L × 1L      x 25–175, y 50–150
//   Hostil           rombo 1,44L               vértices 28 y 172
//   Neutral          cuadrado 1,1L             45–155
//   Desconocido      trébol 1,44L
//   Material amigo   círculo que pasa por los vértices del octógono
// Sectores del octógono: 1 (y 50–80), principal (80–120), 2 (120–150).
// Los iconos «de marco completo» se dibujan para el rectángulo amigo y se
// adaptan a cada marco (APP-6(E) 3.3.3).
//
// Código de identificación (SIDC) de 30 dígitos (anexo A): versión 16 =
// APP-06(E)(2).

import { ICONOS, MODIFICADORES as MODS } from './datos/iconos.js';

const A = 4; // grosor de trazo (unidades del octógono)

// ---------------------------------------------------------------- identidades y colores (tabla 1-15)
export const IDENTIDADES = {
  amigo: { nombre: 'Propio', marco: 'amigo', codigo: '3', relleno: 'rgb(128,224,255)', color: 'rgb(0,168,220)' },
  supuesto: { nombre: 'Supuesto propio', marco: 'amigo', codigo: '2', relleno: 'rgb(128,224,255)', color: 'rgb(0,168,220)', dudoso: true },
  hostil: { nombre: 'Enemigo', marco: 'hostil', codigo: '6', relleno: 'rgb(255,128,128)', color: 'rgb(255,48,49)' },
  sospechoso: { nombre: 'Sospechoso', marco: 'hostil', codigo: '5', relleno: 'rgb(255,128,128)', color: 'rgb(255,48,49)', dudoso: true },
  neutral: { nombre: 'Neutral', marco: 'neutral', codigo: '4', relleno: 'rgb(170,255,170)', color: 'rgb(0,160,0)' },
  desconocido: { nombre: 'Desconocido', marco: 'desconocido', codigo: '1', relleno: 'rgb(255,255,128)', color: 'rgb(225,220,0)' },
  pendiente: { nombre: 'Pendiente', marco: 'desconocido', codigo: '0', relleno: 'rgb(255,255,128)', color: 'rgb(225,220,0)', dudoso: true },
};
const CIVIL = 'rgb(255,161,255)'; // tabla 1-15, civil

// ---------------------------------------------------------------- conjuntos de símbolos (tabla A-4)
export const CONJUNTOS = {
  10: { nombre: 'Unidades', marco: 'unidad' },
  11: { nombre: 'Organizaciones civiles', marco: 'unidad', civil: true },
  15: { nombre: 'Material', marco: 'material' },
  20: { nombre: 'Instalaciones', marco: 'unidad', instalacion: true },
  27: { nombre: 'Combatientes a pie', marco: 'individuo' },
  40: { nombre: 'Actividades y sucesos', marco: 'unidad', actividad: true },
};

// ---------------------------------------------------------------- escalones (tabla 1-8 y A-8; nombres del ET, PD0-002 anexo A)
export const ESCALONES = {
  '': { nombre: 'Sin escalón', codigo: '00' },
  equipo: { nombre: 'Equipo / tripulación', codigo: '11', marca: 'Ø' },
  escuadra: { nombre: 'Escuadra / patrulla', codigo: '12', marca: '•' },
  peloton: { nombre: 'Pelotón', codigo: '13', marca: '••' },
  seccion: { nombre: 'Sección', codigo: '14', marca: '•••' },
  compania: { nombre: 'Compañía / escuadrón / batería', codigo: '15', marca: 'I' },
  batallon: { nombre: 'Batallón / grupo / bandera', codigo: '16', marca: 'II' },
  regimiento: { nombre: 'Regimiento / agrupación', codigo: '17', marca: 'III' },
  brigada: { nombre: 'Brigada', codigo: '18', marca: 'X' },
  division: { nombre: 'División', codigo: '21', marca: 'XX' },
  cuerpo: { nombre: 'Cuerpo de ejército', codigo: '22', marca: 'XXX' },
  ejercito: { nombre: 'Ejército', codigo: '23', marca: 'XXXX' },
  grupoEjercitos: { nombre: 'Grupo de ejércitos', codigo: '24', marca: 'XXXXX' },
  teatro: { nombre: 'Región / teatro', codigo: '25', marca: 'XXXXXX' },
  mando: { nombre: 'Mando (++)', codigo: '26', marca: '++' },
};

// ---------------------------------------------------------------- movilidad del material (tabla 1-10, campo R; código tabla A-8)
export const MOVILIDAD = {
  '': { nombre: 'Sin indicador', codigo: '00' },
  ruedas: { nombre: 'Ruedas (carretera)', codigo: '31' },
  todoterreno: { nombre: 'Ruedas todoterreno', codigo: '32' },
  cadenas: { nombre: 'Cadenas', codigo: '33' },
  mixto: { nombre: 'Ruedas y cadenas', codigo: '34' },
  remolcado: { nombre: 'Remolcado', codigo: '35' },
  ferrocarril: { nombre: 'Ferrocarril', codigo: '36' },
  carga: { nombre: 'Animales de carga', codigo: '37' },
  nieve: { nombre: 'Sobre nieve', codigo: '41' },
  trineo: { nombre: 'Trineo', codigo: '42' },
  barcaza: { nombre: 'Barcaza', codigo: '51' },
  anfibio: { nombre: 'Anfibio', codigo: '52' },
};

// ---------------------------------------------------------------- marcos
const circ = (r) => ({
  arriba: (x) => 100 - Math.sqrt(Math.max(0, r * r - (x - 100) ** 2)),
  abajo: (x) => 100 + Math.sqrt(Math.max(0, r * r - (x - 100) ** 2)),
  izq: (y) => 100 - Math.sqrt(Math.max(0, r * r - (y - 100) ** 2)),
  der: (y) => 100 + Math.sqrt(Math.max(0, r * r - (y - 100) ** 2)),
});
const MARCOS = {
  amigo: {
    d: 'M25,50 L175,50 L175,150 L25,150 Z',
    arriba: () => 50, abajo: () => 150, izq: () => 25, der: () => 175,
    staff: [25, 150],
  },
  hostil: {
    d: 'M100,28 L172,100 L100,172 L28,100 Z',
    arriba: (x) => 28 + Math.abs(x - 100), abajo: (x) => 172 - Math.abs(x - 100),
    izq: (y) => 28 + Math.abs(y - 100), der: (y) => 172 - Math.abs(y - 100),
    staff: [28, 100],
  },
  neutral: {
    d: 'M45,45 L155,45 L155,155 L45,155 Z',
    arriba: () => 45, abajo: () => 155, izq: () => 45, der: () => 155,
    staff: [45, 155],
  },
  desconocido: {
    d: 'M63,63 C63,20 137,20 137,63 C180,63 180,137 137,137 C137,180 63,180 63,137 C20,137 20,63 63,63 Z',
    ...circ(69),
    staff: [31, 100],
  },
  // Combatiente a pie amigo: hexágono 1,1L (tabla 1-14)
  individuoAmigo: {
    d: 'M100,42 L155,68 L155,132 L100,158 L45,132 L45,68 Z',
    arriba: (x) => 42 + (Math.min(55, Math.abs(x - 100)) * 26) / 55, abajo: (x) => 158 - (Math.min(55, Math.abs(x - 100)) * 26) / 55,
    izq: () => 45, der: () => 155,
    staff: [45, 132],
  },
  // Material amigo: círculo (tabla 1-14)
  materialAmigo: {
    d: 'M46,100 A54,54 0 1,0 154,100 A54,54 0 1,0 46,100 Z',
    ...circ(54),
    staff: [46, 100],
  },
};
const marcoDe = (conjunto, identidad) => {
  const m = (IDENTIDADES[identidad] ?? IDENTIDADES.amigo).marco;
  if (m !== 'amigo') return m;
  const t = CONJUNTOS[conjunto]?.marco;
  return t === 'material' ? 'materialAmigo' : t === 'individuo' ? 'individuoAmigo' : m;
};
export const limitesMarco = (m) => {
  const f = MARCOS[m];
  return { x0: f.izq(100), x1: f.der(100), y0: f.arriba(100), y1: f.abajo(100) };
};

// ---------------------------------------------------------------- iconos y modificadores
/** Catálogo de iconos de un conjunto: {código: {nombre, otan, tipo, d}} */
export function iconosDe(conjunto = '10') {
  const t = ICONOS[conjunto] ?? {};
  const out = {};
  for (const [k, [nombre, otan, tipo, d]] of Object.entries(t)) out[k] = { nombre, otan, tipo, d };
  return out;
}
/** Entidades de unidad terrestre (compatibilidad): {código: {nombre, ff}} */
export const ENTIDADES = Object.fromEntries([['000000', { nombre: 'Sin icono', otan: '' }], ...Object.entries(ICONOS['10']).map(([k, v]) => [k, { nombre: v[0], otan: v[1], ff: v[2] === 'f' }])]);
export const icono = (conjunto, codigo) => {
  const v = ICONOS[conjunto ?? '10']?.[codigo];
  return v ? { nombre: v[0], otan: v[1], tipo: v[2], d: v[3], lineas: v[4] ?? [] } : null;
};

/**
 * Modificadores disponibles para un conjunto y sector, con clave de símbolo:
 * 'c' + código común de 3 dígitos (tablas 1-3 y 1-4) o 'u' + código del conjunto.
 */
export function modificadoresDe(conjunto = '10', sector = 1) {
  const out = {};
  for (const [k, [nombre, otan, d]] of Object.entries(MODS[conjunto]?.[sector] ?? {})) out['u' + k] = { nombre, otan, d };
  for (const [k, [nombre, otan, d]] of Object.entries(MODS.c?.[sector] ?? {})) out['c' + k] = { nombre, otan, d, comun: true };
  return out;
}
export const modificador = (conjunto, sector, clave) => {
  if (!clave) return null;
  const t = clave[0] === 'c' ? MODS.c?.[sector] : MODS[conjunto ?? '10']?.[sector];
  const v = t?.[clave.slice(1)];
  return v ? { nombre: v[0], otan: v[1], d: v[2] } : null;
};
/** Compatibilidad con la versión anterior. */
export const MODIFICADORES = { get sector1() { return modificadoresDe('10', 1); }, get sector2() { return modificadoresDe('10', 2); } };

// Trayecto «M x y l dx dy … z» de los datos → lista de polígonos absolutos
function poligonos(d) {
  const out = [];
  for (const parte of d.split('M').filter(Boolean)) {
    const [ini, resto = ''] = parte.replace(/z/gi, '').split('l');
    const n0 = ini.trim().match(/-?\d*\.?\d+/g).map(Number);
    const pts = [[n0[0], n0[1]]];
    const nums = (resto.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) { const p = pts.at(-1); pts.push([p[0] + nums[i], p[1] + nums[i + 1]]); }
    out.push(pts);
  }
  return out;
}
const aTrayecto = (polys) => polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z').join('');

// Adapta un icono de marco completo (dibujado para el rectángulo amigo) a otro
// marco: los trazos rectos que llegan al marco se escalan hasta el marco nuevo
// (sin deformar su grosor) y la parte central se deja como está.
const cacheFF = new Map();
function iconoAdaptado(ic, marco) {
  const k = `${marco}|${ic.d}|${JSON.stringify(ic.lineas)}`;
  if (cacheFF.has(k)) return cacheFF.get(k);
  const f = MARCOS[marco];
  const sx = (f.der(100) - f.izq(100)) / 150, sy = (f.abajo(100) - f.arriba(100)) / 100;
  const af = ([x, y]) => [100 + (x - 100) * sx, 100 + (y - 100) * sy];
  const polys = poligonos(ic.d);
  const fuera = polys.map((p) => {
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    return !(Math.min(...xs) > 40 && Math.max(...xs) < 160 && Math.min(...ys) > 54 && Math.max(...ys) < 146);
  });
  // los huecos e islas de una pieza exterior van con ella
  const dentroDe = (q, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > q[1]) !== (p[j][1] > q[1]) && q[0] < ((p[j][0] - p[i][0]) * (q[1] - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
  polys.forEach((p, i) => { if (!fuera[i] && polys.some((o, j) => fuera[j] && dentroDe(p[0], o))) fuera[i] = true; });
  const interior = polys.filter((_, i) => !fuera[i]), exterior = polys.filter((_, i) => fuera[i]).map((p) => p.map(af));
  const toca = (x, y) => x < 34 || x > 166 || y < 59 || y > 141;
  const lineas = ic.lineas.map(([x1, y1, x2, y2, w]) => {
    let a = af([x1, y1]), b = af([x2, y2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], l = Math.hypot(ux, uy) || 1;
    // prolongar los extremos que tocan el marco para que lleguen al marco nuevo
    if (toca(x1, y1)) a = [a[0] - (ux / l) * 30, a[1] - (uy / l) * 30];
    if (toca(x2, y2)) b = [b[0] + (ux / l) * 30, b[1] + (uy / l) * 30];
    return { a, b, w };
  });
  const res = { interior: aTrayecto(interior), exterior: aTrayecto(exterior), lineas };
  cacheFF.set(k, res);
  return res;
}

// ---------------------------------------------------------------- SIDC
/** Código APP-6(E) de 30 dígitos. */
export function sidc(s) {
  const id = IDENTIDADES[s.identidad] ?? IDENTIDADES.amigo;
  const conj = String(s.conjunto ?? '10');
  const estado = s.estado === 'previsto' ? '1' : '0';
  const ghq = (s.finta ? 1 : 0) + (s.cg ? 2 : 0) + (s.ft ? 4 : 0);
  const amp = conj === '15' ? (MOVILIDAD[s.movilidad] ?? MOVILIDAD['']).codigo : (ESCALONES[s.escalon] ?? ESCALONES['']).codigo;
  const ent = String(s.icono || '000000').padStart(6, '0');
  const mod = (m) => (!m ? ['0', '00'] : m[0] === 'c' ? [m[1], m.slice(2)] : ['0', m.slice(1).padStart(2, '0')]);
  const [c1, m1] = mod(s.mod1), [c2, m2] = mod(s.mod2);
  return `160${id.codigo}${conj}${estado}${ghq}${amp}${ent}${m1}${m2}${c1}${c2}00000000`;
}

// ---------------------------------------------------------------- SVG
const escXml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const anchoTexto = (t, tam) => String(t).length * tam * 0.6;
const linea = (d, opc = {}) => ({ d, trazo: true, ...opc });
const lleno = (d) => ({ d, lleno: true });
const texto = (t, x, y, tam, opc = {}) => ({ texto: t, x, y, tam, ...opc });
const circulo = (cx, cy, r, relleno = false) => ({ d: `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`, trazo: !relleno, lleno: relleno });

/** Marca de escalón (encima del marco), con su anchura. */
function marcaEscalon(clave, yBase) {
  const e = ESCALONES[clave]; if (!e?.marca) return { prims: [], ancho: 0, alto: 0 };
  const p = [];
  const y = yBase;
  const m = e.marca;
  if (m === 'Ø') {
    p.push(circulo(100, y - 11, 9), linea(`M88,${y + 1} L112,${y - 23}`));
    return { prims: p, ancho: 28, alto: 24 };
  }
  if (m.startsWith('•')) {
    const n = m.length, w = (n - 1) * 20;
    for (let i = 0; i < n; i++) p.push(circulo(100 - w / 2 + i * 20, y - 9, 7, true));
    return { prims: p, ancho: w + 16, alto: 18 };
  }
  if (/^I+$/.test(m)) {
    const n = m.length, w = (n - 1) * 15;
    let d = ''; for (let i = 0; i < n; i++) { const x = 100 - w / 2 + i * 15; d += `M${x},${y} L${x},${y - 24} `; }
    p.push(linea(d, { grosor: 5 }));
    return { prims: p, ancho: w + 8, alto: 24 };
  }
  if (/^X+$/.test(m)) {
    const n = m.length, paso = n > 4 ? 20 : 26, w = (n - 1) * paso, h = n > 4 ? 9 : 10;
    let d = ''; for (let i = 0; i < n; i++) { const x = 100 - w / 2 + i * paso; d += `M${x - h},${y} L${x + h},${y - 22} M${x - h},${y - 22} L${x + h},${y} `; }
    p.push(linea(d, { grosor: 4.5 }));
    return { prims: p, ancho: w + 22, alto: 22 };
  }
  p.push(texto(m, 100, y - 2, 28, { negrita: true, centro: true }));
  return { prims: p, ancho: 36, alto: 24 };
}

/** Indicador de movilidad (tabla 1-10) bajo el marco. */
function movilidad(clave, y) {
  const r = 6, p = [];
  const ruedas = (xs) => xs.map((x) => circulo(x, y + 8, r));
  switch (clave) {
    case 'ruedas': return [linea(`M58,${y} L142,${y}`), ...ruedas([64, 136])];
    case 'todoterreno': return [linea(`M58,${y} L142,${y}`), ...ruedas([64, 100, 136])];
    case 'cadenas': return [linea(`M66,${y} L134,${y} A8,8 0 0 1 134,${y + 16} L66,${y + 16} A8,8 0 0 1 66,${y} Z`)];
    case 'mixto': return [circulo(62, y + 8, r), linea(`M78,${y} L134,${y} A8,8 0 0 1 134,${y + 16} L78,${y + 16} A8,8 0 0 1 78,${y} Z`)];
    case 'remolcado': return [linea(`M66,${y + 6} L134,${y + 6}`), circulo(60, y + 6, r), circulo(140, y + 6, r)];
    case 'ferrocarril': return [linea(`M56,${y} L144,${y}`), ...ruedas([62, 76, 124, 138])];
    case 'carga': return [linea(`M86,${y + 14} L93,${y} L100,${y + 14} L107,${y} L114,${y + 14}`)];
    case 'nieve': return [linea(`M58,${y} L66,${y + 12} L142,${y + 12}`)];
    case 'trineo': return [linea(`M62,${y} Q56,${y + 12} 66,${y + 12} L134,${y + 12} Q144,${y + 12} 138,${y}`)];
    case 'barcaza': return [linea(`M56,${y} L144,${y} Q100,${y + 22} 56,${y}`)];
    case 'anfibio': { let d = `M56,${y + 8}`; for (let i = 0; i < 6; i++) d += ` q7.3,-12 14.7,0`; return [linea(d)]; }
    default: return p;
  }
}

function svgPrim(p, color, grosorBase) {
  if (p.texto !== undefined) {
    return `<text x="${p.x}" y="${p.y}" font-size="${p.tam}" font-family="Arial,Helvetica,sans-serif"${p.negrita ? ' font-weight="bold"' : ''}${p.centro ? ' text-anchor="middle" dominant-baseline="central"' : p.ancla ? ` text-anchor="${p.ancla}"` : ''} fill="${p.color ?? color}" stroke="none">${escXml(p.texto)}</text>`;
  }
  if (p.icono) return `<path d="${p.d}" fill="${p.color ?? color}" fill-rule="evenodd" stroke="none"${p.clip ? ` clip-path="url(#${p.clip})"` : ''}/>`;
  if (p.lleno) return `<path d="${p.d}" fill="${p.color ?? color}" stroke="none"/>`;
  return `<path d="${p.d}" fill="none" stroke="${p.color ?? color}" stroke-width="${p.grosor ?? grosorBase}" stroke-linecap="${p.extremo ?? 'butt'}" stroke-linejoin="miter"${p.discontinuo ? ` stroke-dasharray="${p.discontinuo}"` : ''}${p.clip ? ` clip-path="url(#${p.clip})"` : ''}/>`;
}

let nClip = 0;

/**
 * SVG de un símbolo (unidad, material, instalación u organización civil).
 * @param {object} s {conjunto:'10'|'11'|'15'|'20', identidad, estado:'presente'|'previsto', icono, mod1, mod2,
 *                    escalon, movilidad, cg, ft, finta, refuerzo:''|'+'|'-'|'±', T, M, H, G, V}
 * @param {object} [opc] {tam: px del lado del octógono (L), monocromo, sinTextos}
 * @returns {{svg, ancho, alto, ancla:{x,y}, sidc}}
 */
export function svgUnidad(s, opc = {}) {
  const conj = String(s.conjunto ?? '10');
  const C = CONJUNTOS[conj] ?? CONJUNTOS[10];
  const id = IDENTIDADES[s.identidad] ?? IDENTIDADES.amigo;
  const marco = marcoDe(conj, s.identidad);
  const f = MARCOS[marco];
  const negro = '#000';
  const prims = [];
  const defs = [];
  // Icono principal
  const ic = icono(conj, s.icono);
  if (ic) {
    if (ic.tipo === 'f' && marco !== 'amigo') {
      const cid = `spa-clip-${++nClip}`;
      defs.push(`<clipPath id="${cid}"><path d="${f.d}"/></clipPath>`);
      const ad = iconoAdaptado(ic, marco);
      if (ad.interior) prims.push({ d: ad.interior, icono: true });
      if (ad.exterior) prims.push({ d: ad.exterior, icono: true, clip: cid });
      for (const l of ad.lineas) prims.push({ d: `M${l.a[0].toFixed(1)},${l.a[1].toFixed(1)} L${l.b[0].toFixed(1)},${l.b[1].toFixed(1)}`, trazo: true, grosor: l.w, clip: cid });
    } else {
      prims.push({ d: ic.d, icono: true });
      for (const [x1, y1, x2, y2, w] of ic.lineas) prims.push({ d: `M${x1},${y1} L${x2},${y2}`, trazo: true, grosor: w });
    }
  }
  for (const [k, sector] of [['mod1', 1], ['mod2', 2]]) {
    const m = modificador(conj, sector, s[k]);
    if (m) prims.push({ d: m.d, icono: true });
  }
  // Amplificadores gráficos
  const yTop = f.arriba(100);
  const extras = [];
  let techo = yTop;
  if (C.instalacion) {
    extras.push(lleno(`M88,${yTop - 10} L112,${yTop - 10} L112,${yTop + (marco === 'hostil' ? 12 : 0)} L88,${yTop + (marco === 'hostil' ? 12 : 0)} Z`));
    techo = yTop - 10;
  }
  if (C.actividad) {
    const q = 7, puntos = marco === 'hostil' ? [[100, 28], [172, 100], [100, 172], [28, 100]] : marco === 'desconocido' ? [[100, 31], [169, 100], [100, 169], [31, 100]] : [[f.izq(100), f.arriba(100)], [f.der(100), f.arriba(100)], [f.der(100), f.abajo(100)], [f.izq(100), f.abajo(100)]];
    for (const [x, y] of puntos) extras.push(lleno(`M${x - q},${y - q} h${2 * q} v${2 * q} h${-2 * q} Z`));
  }
  const sinEscalon = ['15', '20', '27', '40'].includes(conj);
  const esc = sinEscalon ? { prims: [], alto: 0, ancho: 0 } : marcaEscalon(s.escalon, techo - 6);
  extras.push(...esc.prims);
  if (esc.alto) techo -= esc.alto + 6;
  if (s.ft) {
    const w = Math.max(esc.ancho, 34) + 18, h = (esc.alto || 16) + 14;
    extras.push(linea(`M${100 - w / 2},${yTop} L${100 - w / 2},${yTop - h} L${100 + w / 2},${yTop - h} L${100 + w / 2},${yTop}`));
    techo = Math.min(techo, yTop - h);
  }
  if (s.finta) {
    const xl = marco === 'amigo' ? 25 : f.izq(yTop + 1), xr = 200 - xl;
    const cima = techo - 26;
    extras.push(linea(`M${xl},${yTop} L100,${cima} L${xr},${yTop}`, { discontinuo: '10 8' }));
    techo = cima;
  }
  let suelo = f.abajo(100);
  if (conj === '15' && s.movilidad) { extras.push(...movilidad(s.movilidad, suelo + 6)); suelo += 30; }
  let ancla = { x: 100, y: 100 };
  if (s.cg) {
    const [sx, sy] = f.staff;
    const yFin = Math.max(150, f.abajo(sx)) + 100;
    extras.push(linea(`M${sx},${sy} L${sx},${yFin}`));
    ancla = { x: sx, y: yFin };
    suelo = Math.max(suelo, yFin);
  }
  // Textos (APP-6(E) fig. 3-3)
  const textos = [];
  const xI = f.izq(100) - 8, xD = f.der(100) + 8;
  if (!opc.sinTextos) {
    const der = [['G', 70], ['H', 103], ['M', 136]];
    for (const [k, y] of der) if (s[k]) textos.push(texto(s[k], xD, y + 10, 30, { ancla: 'start' }));
    if (s.T) textos.push(texto(s.T, xI, 136 + 10, 30, { ancla: 'end' }));
    if (s.V) textos.push(texto(s.V, xI, 103 + 10, 30, { ancla: 'end' }));
  }
  if (s.refuerzo) textos.push(texto(s.refuerzo === '±' ? '±' : s.refuerzo === '-' ? '−' : '+', xD, yTop + 6, 30, { ancla: 'start', negrita: true }));
  // Caja que lo contiene todo
  let x0 = f.izq(100) - 4, x1 = f.der(100) + 4, y0 = Math.min(techo, yTop) - 6, y1 = suelo + 6;
  if (s.finta || s.ft) { x0 = Math.min(x0, 21); x1 = Math.max(x1, 179); }
  for (const t of textos) {
    const w = anchoTexto(t.texto, t.tam);
    if (t.ancla === 'end') x0 = Math.min(x0, t.x - w - 4); else x1 = Math.max(x1, t.x + w + 4);
  }
  // Marco (con trazo discontinuo si es previsto; punteado si la identidad es dudosa)
  const relleno = opc.monocromo ? 'none' : C.civil && ['amigo', 'supuesto', 'neutral'].includes(s.identidad ?? 'amigo') ? CIVIL : id.relleno;
  const dash = id.dudoso ? ' stroke-dasharray="3 7" stroke-linecap="round"' : s.estado === 'previsto' ? ' stroke-dasharray="14 8"' : '';
  const blanco = id.dudoso || s.estado === 'previsto' ? `<path d="${f.d}" fill="none" stroke="#fff" stroke-width="${A}"/>` : '';
  const cuerpo = `<path d="${f.d}" fill="${relleno}" stroke="none"/>${prims.map((p) => svgPrim(p, negro, A)).join('')}${blanco}<path d="${f.d}" fill="none" stroke="${negro}" stroke-width="${A}"${dash}/>`;
  const resto = [...extras, ...textos].map((p) => svgPrim(p, negro, A)).join('');
  const W = x1 - x0, H = y1 - y0;
  const k = (opc.tam ?? 30) / 100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * k).toFixed(1)}" height="${(H * k).toFixed(1)}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${cuerpo}${resto}</svg>`;
  return { svg, ancho: W * k, alto: H * k, ancla: { x: (ancla.x - x0) * k, y: (ancla.y - y0) * k }, sidc: sidc(s) };
}
