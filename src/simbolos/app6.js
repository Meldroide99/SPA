// Símbolos de unidad terrestre conforme a la APP-6(E) Ed. E v2 (oct. 2025),
// capítulos 1 y 3, con las denominaciones de la PD0-002 del MADOC.
//
// Geometría (APP-6(E) 1.3, tabla 1-14 y fig. 1-29): octógono de referencia de
// lado L = 100 unidades centrado en (100, 100) → ocupa de 50 a 150.
//   Amigo      rectángulo 1,5L × 1L      x 25–175, y 50–150
//   Hostil     rombo 1,44L               vértices 28 y 172
//   Neutral    cuadrado 1,1L             45–155
//   Desconocido trébol 1,44L
// Sectores del octógono: 1 (y 50–80), principal (80–120), 2 (120–150).
// Los iconos «de marco completo» (infantería, reconocimiento, sanidad…) se
// adaptan a la forma del marco (APP-6(E) 3.3.3).
//
// Código de identificación (SIDC) de 30 dígitos (anexo A): versión 16 =
// APP-06(E)(2), conjunto 10 = unidad terrestre.

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

// ---------------------------------------------------------------- escalones (tabla 1-8; nombres del ET, PD0-002 anexo A)
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
  mando: { nombre: 'Mando (++)', codigo: '00', marca: '++' },
};

// ---------------------------------------------------------------- marcos
const MARCOS = {
  amigo: {
    d: 'M25,50 L175,50 L175,150 L25,150 Z',
    arriba: () => 50, abajo: () => 150, izq: () => 25, der: () => 175,
    esq: [[25, 50], [175, 50], [175, 150], [25, 150]], // sup-izq, sup-der, inf-der, inf-izq
    staff: [25, 150],
  },
  hostil: {
    d: 'M100,28 L172,100 L100,172 L28,100 Z',
    arriba: (x) => 28 + Math.abs(x - 100), abajo: (x) => 172 - Math.abs(x - 100),
    izq: (y) => 28 + Math.abs(y - 100), der: (y) => 172 - Math.abs(y - 100),
    esq: [[64, 64], [136, 64], [136, 136], [64, 136]],
    staff: [28, 100],
  },
  neutral: {
    d: 'M45,45 L155,45 L155,155 L45,155 Z',
    arriba: () => 45, abajo: () => 155, izq: () => 45, der: () => 155,
    esq: [[45, 45], [155, 45], [155, 155], [45, 155]],
    staff: [45, 155],
  },
  desconocido: {
    d: 'M63,63 C63,20 137,20 137,63 C180,63 180,137 137,137 C137,180 63,180 63,137 C20,137 20,63 63,63 Z',
    // aproximación por un círculo de radio 69 (suficiente para encajar líneas)
    arriba: (x) => 100 - Math.sqrt(Math.max(0, 69 ** 2 - (x - 100) ** 2)),
    abajo: (x) => 100 + Math.sqrt(Math.max(0, 69 ** 2 - (x - 100) ** 2)),
    izq: (y) => 100 - Math.sqrt(Math.max(0, 69 ** 2 - (y - 100) ** 2)),
    der: (y) => 100 + Math.sqrt(Math.max(0, 69 ** 2 - (y - 100) ** 2)),
    esq: [[63, 63], [137, 63], [137, 137], [63, 137]],
    staff: [31, 100],
  },
};
export const limitesMarco = (m) => {
  const f = MARCOS[m];
  return { x0: f.izq(100), x1: f.der(100), y0: f.arriba(100), y1: f.abajo(100) };
};

// ---------------------------------------------------------------- primitivas
const linea = (d) => ({ d, trazo: true });
const lleno = (d) => ({ d, lleno: true });
const texto = (t, x, y, tam, opc = {}) => ({ texto: t, x, y, tam, ...opc });
const circulo = (cx, cy, r, relleno = false) => ({ d: `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`, trazo: !relleno, lleno: relleno });
const textoIcono = (t) => texto(t, 100, 100, t.length <= 2 ? 42 : t.length === 3 ? 36 : t.length === 4 ? 30 : 24, { negrita: true, centro: true });
const P = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

// Elementos de marco completo (dependen de la forma)
const X = (m) => { const [a, b, c, d] = MARCOS[m].esq; return linea(`M${P(a)} L${P(c)} M${P(d)} L${P(b)}`); };
const diagonal = (m) => { const [, b, , d] = MARCOS[m].esq; return linea(`M${P(d)} L${P(b)}`); };
const vertical = (m) => linea(`M100,${MARCOS[m].arriba(100).toFixed(1)} L100,${MARCOS[m].abajo(100).toFixed(1)}`);
const contracarro = (m) => { const f = MARCOS[m]; const [, , c, d] = f.esq; return linea(`M${P(d)} L100,${f.arriba(100).toFixed(1)} L${P(c)}`); };
const barraInferior = (m, y = 120) => { const f = MARCOS[m]; return linea(`M${f.izq(y).toFixed(1)},${y} L${f.der(y).toFixed(1)},${y}`); };
const cruzSanidad = (m) => { const f = MARCOS[m]; return linea(`M100,${f.arriba(100).toFixed(1)} L100,${f.abajo(100).toFixed(1)} M${f.izq(100).toFixed(1)},100 L${f.der(100).toFixed(1)},100`); };
const transmisiones = (m) => {
  const [a, , c] = MARCOS[m].esq;
  return linea(`M${P(a)} L100,110 L100,90 L${P(c)}`);
};
const cupulaAntiaerea = (m) => {
  const f = MARCOS[m];
  if (m === 'amigo') return linea('M25,150 Q100,96 175,150');
  if (m === 'hostil') return linea('M60,140 Q100,104 140,140');
  if (m === 'neutral') return linea('M45,155 Q100,104 155,155');
  return linea(`M${f.izq(130).toFixed(1)},130 Q100,100 ${f.der(130).toFixed(1)},130`);
};
const asaltoAereo = (m) => { const f = MARCOS[m]; return linea(`M${f.izq(118).toFixed(1)},118 L88,118 L100,134 L112,118 L${f.der(118).toFixed(1)},118`); };

// Iconos del sector principal (independientes del marco)
const OVALO = 'M76,85 L124,85 A15,15 0 0 1 124,115 L76,115 A15,15 0 0 1 76,85 Z';
const icono = {
  carro: () => linea(OVALO),
  punto: () => circulo(100, 100, 14, true),
  puntoPequeno: () => circulo(100, 100, 10, true),
  mortero: () => [circulo(100, 110, 6), linea('M100,104 L100,80 M92,89 L100,80 L108,89')],
  ingenieros: () => linea('M70,115 L70,85 L130,85 L130,115 M100,85 L100,115'),
  alaRotatoria: () => lleno('M60,84 L100,100 L60,116 Z M140,84 L100,100 L140,116 Z'),
  alaFija: () => lleno('M100,100 C84,84 58,86 58,100 C58,114 84,116 100,100 C116,84 142,86 142,100 C142,114 116,116 100,100 Z'),
  uas: () => lleno('M58,84 L100,104 L142,84 L142,96 L100,118 L58,96 Z'),
  francotirador: () => linea('M70,84 L94,84 M106,84 L130,84 M100,94 L100,120'),
  vigilancia: () => lleno('M100,80 L120,117 L80,117 Z'),
  observador: () => linea('M100,80 L120,117 L80,117 Z'),
  observadorArt: () => [linea('M100,80 L120,117 L80,117 Z'), circulo(100, 106, 6, true)],
  nbq: () => [circulo(78, 87, 8, true), circulo(122, 87, 8, true), linea('M84,93 Q104,96 112,120 M116,93 Q96,96 88,120')],
  mantenimiento: () => linea('M64,88 A12,12 0 0 1 64,112 M64,100 L136,100 M136,88 A12,12 0 0 0 136,112'),
  transporte: () => [circulo(100, 100, 16), linea('M100,84 L100,116 M84,100 L116,100 M88.7,88.7 L111.3,111.3 M88.7,111.3 L111.3,88.7')],
  municion: () => linea('M88,118 L88,96 A12,12 0 0 1 112,96 L112,118 M82,118 L118,118'),
  combustible: () => linea('M84,84 L116,84 M84,84 L100,102 L116,84 M100,102 L100,120'),
  apoyoCombate: () => lleno('M84,84 L116,84 L116,104 L100,118 L84,104 Z'),
  armasCombinadas: () => [linea(OVALO), linea('M84,88 L116,112 M84,112 L116,88')],
  misil: () => linea('M93,118 L93,90 A7,7 0 0 1 107,90 L107,118 M100,84 L100,118'),
  explosivos: () => textoIcono('EOD'),
  cuartelMaestre: () => [linea('M62,100 L120,100 M68,100 L68,110 M76,100 L76,110 M62,110 L80,110'), circulo(128, 100, 9)],
  enlace: () => textoIcono('LO'),
  psyops: () => lleno('M84,92 L92,92 L104,82 L104,118 L92,108 L84,108 Z'),
};

/**
 * Iconos de entidad (conjunto 10, unidad terrestre), por código de 6 dígitos.
 * `ff`: icono de marco completo (APP-6(E) tabla 3-2).
 */
export const ENTIDADES = {
  '000000': { nombre: 'Sin icono', dibujo: () => [] },
  110300: { nombre: 'Cooperación cívico-militar (CIMIC)', dibujo: () => linea('M68,86 L132,86 L132,98 Q132,116 100,116 Q68,116 68,98 Z') },
  110500: { nombre: 'Enlace', dibujo: () => icono.enlace() },
  110600: { nombre: 'Operaciones psicológicas', dibujo: () => icono.psyops() },
  111000: { nombre: 'Transmisiones', ff: true, dibujo: (m) => transmisiones(m) },
  120100: { nombre: 'Asalto aéreo con medios orgánicos', ff: true, dibujo: (m) => asaltoAereo(m) },
  120400: { nombre: 'Contracarro', ff: true, dibujo: (m) => contracarro(m) },
  120401: { nombre: 'Contracarro acorazado', ff: true, dibujo: (m) => [contracarro(m), linea(OVALO)] },
  120402: { nombre: 'Contracarro motorizado', ff: true, dibujo: (m) => [contracarro(m), vertical(m)] },
  120500: { nombre: 'Acorazado (carros)', dibujo: () => icono.carro() },
  120501: { nombre: 'Reconocimiento acorazado', ff: true, dibujo: (m) => [icono.carro(), diagonal(m)] },
  120600: { nombre: 'Helicópteros', dibujo: () => icono.alaRotatoria() },
  120601: { nombre: 'Helicópteros de reconocimiento', ff: true, dibujo: (m) => [icono.alaRotatoria(), diagonal(m)] },
  120800: { nombre: 'Aviación de ala fija', dibujo: () => icono.alaFija() },
  120900: { nombre: 'Combate', dibujo: () => textoIcono('CBT') },
  121000: { nombre: 'Armas combinadas', dibujo: () => icono.armasCombinadas() },
  121100: { nombre: 'Infantería', ff: true, dibujo: (m) => X(m) },
  121101: { nombre: 'Infantería anfibia', ff: true, dibujo: (m) => [X(m), linea('M60,108 q6,-12 12,0 t12,0 t12,0 t12,0 t12,0 t12,0 t12,0')] },
  121102: { nombre: 'Infantería mecanizada (cadenas)', ff: true, dibujo: (m) => [X(m), icono.carro()] },
  121104: { nombre: 'Infantería motorizada', ff: true, dibujo: (m) => [X(m), vertical(m)] },
  121200: { nombre: 'Observadores', dibujo: () => icono.observador() },
  121300: { nombre: 'Reconocimiento / caballería', ff: true, dibujo: (m) => diagonal(m) },
  121301: { nombre: 'Reconocimiento y vigilancia', ff: true, dibujo: (m) => [diagonal(m), icono.vigilancia()] },
  121303: { nombre: 'Reconocimiento motorizado', ff: true, dibujo: (m) => [diagonal(m), vertical(m)] },
  121500: { nombre: 'Tiradores de precisión', dibujo: () => icono.francotirador() },
  121600: { nombre: 'Vigilancia', dibujo: () => icono.vigilancia() },
  121700: { nombre: 'Fuerzas especiales', dibujo: () => textoIcono('SF') },
  121800: { nombre: 'Operaciones especiales', dibujo: () => textoIcono('SOF') },
  121900: { nombre: 'Sistemas aéreos no tripulados', dibujo: () => icono.uas() },
  122100: { nombre: 'Unidad de combate combinada', ff: true, dibujo: (m) => [X(m), circulo(100, 100, 12, true)] },
  130100: { nombre: 'Defensa antiaérea', ff: true, dibujo: (m) => cupulaAntiaerea(m) },
  130101: { nombre: 'Defensa antiaérea (cañón)', ff: true, dibujo: (m) => [cupulaAntiaerea(m), linea(`M42,${MARCOS[m].arriba(42).toFixed(1)} L42,${(m === 'amigo' ? 150 : MARCOS[m].abajo(42)).toFixed(1)}`)] },
  130102: { nombre: 'Defensa antiaérea (misiles)', ff: true, dibujo: (m) => [cupulaAntiaerea(m), icono.misil()] },
  130300: { nombre: 'Artillería de campaña', dibujo: () => icono.punto() },
  130301: { nombre: 'Artillería autopropulsada', dibujo: () => [icono.carro(), icono.puntoPequeno()] },
  130303: { nombre: 'Reconocimiento de artillería', ff: true, dibujo: (m) => [icono.punto(), diagonal(m)] },
  130400: { nombre: 'Observador de artillería', dibujo: () => icono.observadorArt() },
  130700: { nombre: 'Misiles', dibujo: () => icono.misil() },
  130800: { nombre: 'Morteros', dibujo: () => icono.mortero() },
  140100: { nombre: 'Defensa NBQ', dibujo: () => icono.nbq() },
  140103: { nombre: 'Reconocimiento NBQ', ff: true, dibujo: (m) => [icono.nbq(), diagonal(m)] },
  140200: { nombre: 'Apoyo al combate', dibujo: () => icono.apoyoCombate() },
  140500: { nombre: 'Cinológica', dibujo: () => textoIcono('DOG') },
  140700: { nombre: 'Ingenieros (zapadores)', dibujo: () => icono.ingenieros() },
  140701: { nombre: 'Zapadores acorazados', dibujo: () => [icono.ingenieros(), linea('M58,82 L142,82 A18,18 0 0 1 142,118 L58,118 A18,18 0 0 1 58,82 Z')] },
  140702: { nombre: 'Zapadores motorizados', ff: true, dibujo: (m) => [icono.ingenieros(), vertical(m)] },
  140703: { nombre: 'Reconocimiento de ingenieros', ff: true, dibujo: (m) => [icono.ingenieros(), diagonal(m)] },
  140800: { nombre: 'Desactivación de explosivos (EOD)', dibujo: () => icono.explosivos() },
  141200: { nombre: 'Policía militar', dibujo: () => textoIcono('MP') },
  141700: { nombre: 'Seguridad', dibujo: () => textoIcono('SEC') },
  150200: { nombre: 'Contrainteligencia', dibujo: () => textoIcono('CI') },
  150500: { nombre: 'Guerra electrónica', dibujo: () => textoIcono('EW') },
  151000: { nombre: 'Inteligencia', dibujo: () => textoIcono('MI') },
  160200: { nombre: 'Abastecimiento (todas las clases)', ff: true, dibujo: (m) => [barraInferior(m), textoIcono('ALL')] },
  160400: { nombre: 'Munición', dibujo: () => icono.municion() },
  160600: { nombre: 'Apoyo logístico (servicios)', dibujo: () => textoIcono('CSS') },
  161100: { nombre: 'Mantenimiento', dibujo: () => icono.mantenimiento() },
  161300: { nombre: 'Sanidad', ff: true, dibujo: (m) => cruzSanidad(m) },
  161700: { nombre: 'Abastecimiento (varias clases)', ff: true, dibujo: (m) => [barraInferior(m), textoIcono('MULT')] },
  162400: { nombre: 'Personal', dibujo: () => textoIcono('PS') },
  162500: { nombre: 'Combustible (POL)', dibujo: () => icono.combustible() },
  162900: { nombre: 'Intendencia', dibujo: () => icono.cuartelMaestre() },
  163600: { nombre: 'Transporte', dibujo: () => icono.transporte() },
};

// ---------------------------------------------------------------- modificadores de sector
// Clave: 'c' + código común de 3 dígitos (tablas 1-3 y 1-4) o 'u' + código
// de 2 dígitos del conjunto 10 (tablas 3-3 y 3-4).
const SECTOR1 = {
  c106: { nombre: 'Ataque', dibujo: () => texto('A', 100, 70, 26, { negrita: true, centro: true }) },
  c111: { nombre: 'Utilitario', dibujo: () => texto('U', 100, 70, 26, { negrita: true, centro: true }) },
  c112: { nombre: 'Ligero', dibujo: () => texto('L', 100, 70, 26, { negrita: true, centro: true }) },
  c113: { nombre: 'Medio', dibujo: () => texto('M', 100, 70, 26, { negrita: true, centro: true }) },
  c114: { nombre: 'Pesado', dibujo: () => texto('H', 100, 70, 26, { negrita: true, centro: true }) },
  c107: { nombre: 'Acorazado', dibujo: () => linea('M88,57 L112,57 A7,7 0 0 1 112,71 L88,71 A7,7 0 0 1 88,57 Z') },
  u41: { nombre: 'Lanzacohetes múltiple', dibujo: () => linea('M86,72 L100,61 L114,72 M86,64 L100,53 L114,64') },
  u67: { nombre: 'Adquisición de objetivos (TA)', dibujo: () => texto('TA', 100, 70, 26, { negrita: true, centro: true }) },
};
const SECTOR2 = {
  c100: { nombre: 'Paracaidista (aerotransportada)', dibujo: () => linea('M78,142 C78,127 100,127 100,142 C100,127 122,127 122,142') },
  c113: { nombre: 'Montaña', dibujo: () => lleno('M84,146 L96,126 L103,136 L108,129 L118,146 Z') },
  c103: { nombre: 'Esquiadores', dibujo: () => linea('M90,147 L110,127 M110,147 L90,127 M86,143 L94,151 M106,151 L114,143') },
  c104: { nombre: 'Cadenas', dibujo: () => linea('M82,132 L118,132 A6,6 0 0 1 118,144 L82,144 A6,6 0 0 1 82,132 Z') },
  c105: { nombre: 'Ruedas', dibujo: () => [circulo(86, 138, 5), circulo(114, 138, 5)] },
  c106: { nombre: 'Ruedas todo terreno', dibujo: () => [circulo(82, 138, 5), circulo(100, 138, 5), circulo(118, 138, 5)] },
  c101: { nombre: 'Bicicletas', dibujo: () => circulo(100, 138, 7) },
  u59: { nombre: 'Aeromóvil (asalto aéreo)', dibujo: () => linea('M84,128 L100,144 L116,128') },
  u60: { nombre: 'Anfibio', dibujo: (m) => { const f = MARCOS[m]; const x0 = f.izq(140), x1 = f.der(140); let d = `M${x0.toFixed(1)},140`; const n = Math.max(2, Math.round((x1 - x0) / 24)); const w = (x1 - x0) / n; for (let i = 0; i < n; i++) d += ` q${(w / 2).toFixed(1)},-14 ${w.toFixed(1)},0`; return linea(d); } },
  c118: { nombre: 'Pesado', dibujo: () => texto('H', 100, 146, 26, { negrita: true, centro: true }) },
  c119: { nombre: 'Medio', dibujo: () => texto('M', 100, 146, 26, { negrita: true, centro: true }) },
  c121: { nombre: 'Ligero', dibujo: () => texto('L', 100, 146, 26, { negrita: true, centro: true }) },
};
export const MODIFICADORES = { sector1: SECTOR1, sector2: SECTOR2 };

// ---------------------------------------------------------------- SIDC
/** Código APP-6(E) de 30 dígitos. */
export function sidc(s) {
  const id = IDENTIDADES[s.identidad] ?? IDENTIDADES.amigo;
  const estado = s.estado === 'previsto' ? '1' : '0';
  const ghq = (s.finta ? 1 : 0) + (s.cg ? 2 : 0) + (s.ft ? 4 : 0);
  const esc = (ESCALONES[s.escalon] ?? ESCALONES['']).codigo;
  const ent = String(s.icono || '000000').padStart(6, '0');
  const mod = (m) => (!m ? ['0', '00'] : m[0] === 'c' ? [m[1], m.slice(2)] : ['0', m.slice(1).padStart(2, '0')]);
  const [c1, m1] = mod(s.mod1), [c2, m2] = mod(s.mod2);
  return `160${id.codigo}10${estado}${ghq}${esc}${ent}${m1}${m2}${c1}${c2}00000000`;
}

// ---------------------------------------------------------------- SVG
const escXml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const anchoTexto = (t, tam) => String(t).length * tam * 0.6;

/** Marca de escalón (encima del marco), con su anchura. */
function marcaEscalon(clave, yBase) {
  const e = ESCALONES[clave]; if (!e?.marca) return { prims: [], ancho: 0, alto: 0 };
  const p = [];
  const y = yBase; // borde inferior de la marca
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
    p.push({ d, trazo: true, grosor: 5 });
    return { prims: p, ancho: w + 8, alto: 24 };
  }
  if (/^X+$/.test(m)) {
    const n = m.length, w = (n - 1) * 26;
    let d = ''; for (let i = 0; i < n; i++) { const x = 100 - w / 2 + i * 26; d += `M${x - 10},${y} L${x + 10},${y - 22} M${x - 10},${y - 22} L${x + 10},${y} `; }
    p.push({ d, trazo: true, grosor: 4.5 });
    return { prims: p, ancho: w + 22, alto: 22 };
  }
  p.push(texto(m, 100, y - 2, 28, { negrita: true, centro: true }));
  return { prims: p, ancho: 36, alto: 24 };
}

function svgPrim(p, color, grosorBase) {
  if (p.texto !== undefined) {
    return `<text x="${p.x}" y="${p.y}" font-size="${p.tam}" font-family="Arial,Helvetica,sans-serif"${p.negrita ? ' font-weight="bold"' : ''}${p.centro ? ' text-anchor="middle" dominant-baseline="central"' : p.ancla ? ` text-anchor="${p.ancla}"` : ''} fill="${p.color ?? color}" stroke="none">${escXml(p.texto)}</text>`;
  }
  if (p.lleno) return `<path d="${p.d}" fill="${p.color ?? color}" stroke="none"/>`;
  return `<path d="${p.d}" fill="none" stroke="${p.color ?? color}" stroke-width="${p.grosor ?? grosorBase}" stroke-linecap="${p.extremo ?? 'butt'}" stroke-linejoin="miter"${p.discontinuo ? ` stroke-dasharray="${p.discontinuo}"` : ''}/>`;
}

/**
 * SVG de un símbolo de unidad.
 * @param {object} s {identidad, estado:'presente'|'previsto', icono, mod1, mod2, escalon, cg, ft, finta, refuerzo:''|'+'|'-'|'±', T, M, H, G}
 * @param {object} [opc] {tam: px de L (lado del octógono), monocromo, sinTextos}
 * @returns {{svg, ancho, alto, ancla:{x,y}, sidc}}
 */
export function svgUnidad(s, opc = {}) {
  const id = IDENTIDADES[s.identidad] ?? IDENTIDADES.amigo;
  const marco = id.marco;
  const f = MARCOS[marco];
  const negro = opc.monocromo ? '#000' : '#000';
  const prims = [];
  // Icono principal y modificadores
  const ent = ENTIDADES[s.icono] ?? ENTIDADES['000000'];
  const dib = (fn) => { [fn(marco)].flat(Infinity).forEach((x) => prims.push(x)); };
  dib(ent.dibujo);
  if (s.mod1 && SECTOR1[s.mod1]) dib(SECTOR1[s.mod1].dibujo);
  if (s.mod2 && SECTOR2[s.mod2]) dib(SECTOR2[s.mod2].dibujo);
  // Amplificadores gráficos
  const yTop = f.arriba(100);
  const extras = [];
  const esc = marcaEscalon(s.escalon, yTop - 6);
  extras.push(...esc.prims);
  let techo = yTop - (esc.alto ? esc.alto + 6 : 0);
  if (s.ft) {
    const w = Math.max(esc.ancho, 34) + 18, h = (esc.alto || 16) + 14;
    extras.push(linea(`M${100 - w / 2},${yTop} L${100 - w / 2},${yTop - h} L${100 + w / 2},${yTop - h} L${100 + w / 2},${yTop}`));
    techo = Math.min(techo, yTop - h);
  }
  if (s.finta) {
    const xl = f.esq[0][0] === 25 ? 25 : f.izq(yTop + 1), xr = 200 - xl;
    const cima = techo - 26;
    extras.push({ d: `M${xl},${yTop} L100,${cima} L${xr},${yTop}`, trazo: true, discontinuo: '10 8' });
    techo = cima;
  }
  let suelo = f.abajo(100);
  let ancla = { x: 100, y: 100 };
  if (s.cg) {
    const [sx, sy] = f.staff;
    const yFin = 150 + 100;
    extras.push(linea(`M${sx},${sy} L${sx},${yFin}`));
    ancla = { x: sx, y: yFin };
    suelo = yFin;
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
  for (const t of textos) {
    const w = anchoTexto(t.texto, t.tam);
    if (t.ancla === 'end') x0 = Math.min(x0, t.x - w - 4); else x1 = Math.max(x1, t.x + w + 4);
  }
  // Marco (con trazo discontinuo si es previsto; punteado si la identidad es dudosa)
  const relleno = opc.monocromo ? 'none' : id.relleno;
  const dash = id.dudoso ? ' stroke-dasharray="3 7" stroke-linecap="round"' : s.estado === 'previsto' ? ' stroke-dasharray="14 8"' : '';
  const blanco = id.dudoso || s.estado === 'previsto' ? `<path d="${f.d}" fill="none" stroke="#fff" stroke-width="${A}"/>` : '';
  const cuerpo = `<path d="${f.d}" fill="${relleno}" stroke="none"/>${prims.map((p) => svgPrim(p, negro, A)).join('')}${blanco}<path d="${f.d}" fill="none" stroke="${negro}" stroke-width="${A}"${dash}/>`;
  const resto = [...extras, ...textos].map((p) => svgPrim(p, negro, A)).join('');
  const W = x1 - x0, H = y1 - y0;
  const k = (opc.tam ?? 30) / 100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * k).toFixed(1)}" height="${(H * k).toFixed(1)}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}">${cuerpo}${resto}</svg>`;
  return { svg, ancho: W * k, alto: H * k, ancla: { x: (ancla.x - x0) * k, y: (ancla.y - y0) * k }, sidc: sidc(s) };
}
