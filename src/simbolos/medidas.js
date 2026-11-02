// Medidas de coordinación y cometidos tácticos (APP-6(E) cap. 8 y su
// apéndice A; nombres de la PD0-002 cap. 2 y apéndice I). Las siglas son las
// OTAN, como en la PD0-002 (PL, LD, OBJ, B de bloquear…).
//
// Cada gráfico se construye a partir de sus puntos de anclaje (los mismos que
// define la norma). Se calcula en un plano local en metros alrededor del
// primer punto y se devuelve en lat/lon: los puntos de anclaje son exactos;
// el dibujo intermedio (puntas de flecha, arcos) es solo gráfico.

const R = 6378137;
/** Plano local (metros, x este / y norte) alrededor de p0. */
function plano(p0) {
  const k = Math.cos((p0.lat * Math.PI) / 180);
  const a = (p) => [((p.lon - p0.lon) * Math.PI / 180) * R * k, ((p.lat - p0.lat) * Math.PI / 180) * R];
  const g = ([x, y]) => [p0.lat + (y / R) * (180 / Math.PI), p0.lon + (x / (R * k)) * (180 / Math.PI)];
  return { a, g };
}
const sum = (p, q) => [p[0] + q[0], p[1] + q[1]];
const res = (p, q) => [p[0] - q[0], p[1] - q[1]];
const mul = (p, k) => [p[0] * k, p[1] * k];
const lon = (p) => Math.hypot(p[0], p[1]);
const uni = (p) => { const l = lon(p) || 1; return [p[0] / l, p[1] / l]; };
const perp = (p) => [-p[1], p[0]]; // 90° a la izquierda
const med = (p, q) => mul(sum(p, q), 0.5);
const rot = (p, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const angulo = (v) => (Math.atan2(v[0], v[1]) * 180) / Math.PI; // rumbo de un vector (para girar textos)

/** Punta de flecha abierta en `tip` llegando desde la dirección `dir` (unitario). */
const punta = (tip, dir, t, ang = 0.5) => [sum(tip, mul(rot(dir, Math.PI - ang), t)), tip, sum(tip, mul(rot(dir, Math.PI + ang), t))];
/** Arco circular (centro, radio, ángulo inicial y final en radianes, sentido antihorario si a1 > a0). */
function arco(c, r, a0, a1, n = 36) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return pts;
}
const angDe = (v) => Math.atan2(v[1], v[0]);

// ---------------------------------------------------------------- catálogo
// tipo: elemento del plan que lo guarda ('punto' | 'linea' | 'area')
// n: puntos exactos (cometidos) o mínimo (min) para líneas y áreas
export const GRUPOS = {
  lineas: 'Líneas',
  ejes: 'Ejes y direcciones de ataque',
  areas: 'Zonas y posiciones',
  puntos: 'Puntos',
  cometidos: 'Cometidos tácticos (verbos)',
};
export const MEDIDAS = [
  // Líneas (PD0-002 tablas 2.2, 2.5, 2.7)
  { id: 'limite', grupo: 'lineas', nombre: 'Límite', tipo: 'linea', min: 2, claves: 'boundary lateral', campos: ['escalon', 'izq', 'der'] },
  { id: 'pl', grupo: 'lineas', nombre: 'Línea de fase', sigla: 'PL', tipo: 'linea', min: 2, claves: 'phase line' },
  { id: 'ld', grupo: 'lineas', nombre: 'Línea de partida', sigla: 'LD', tipo: 'linea', min: 2, claves: 'lp línea de partida' },
  { id: 'ldlc', grupo: 'lineas', nombre: 'Línea de partida / de contacto', sigla: 'LD/LC', tipo: 'linea', min: 2 },
  { id: 'loa', grupo: 'lineas', nombre: 'Límite de avance', sigla: 'LOA', tipo: 'linea', min: 2 },
  { id: 'fcl', grupo: 'lineas', nombre: 'Línea de coordinación final', sigla: 'FCL', tipo: 'linea', min: 2 },
  { id: 'pld', grupo: 'lineas', nombre: 'Línea probable de despliegue', sigla: 'PLD', tipo: 'linea', min: 2, discontinua: true },
  { id: 'lc', grupo: 'lineas', nombre: 'Línea de contacto', sigla: 'LC', tipo: 'linea', min: 2 },
  { id: 'feba', grupo: 'lineas', nombre: 'Borde anterior de la zona de defensa', sigla: 'FEBA', tipo: 'linea', min: 2 },
  // Ejes y direcciones (tabla 2.7)
  { id: 'ataque-principal', grupo: 'ejes', nombre: 'Ataque principal (eje)', tipo: 'linea', min: 2, ayuda: 'Marca el eje desde la retaguardia hasta la punta.', campos: ['ancho'] },
  { id: 'ataque-apoyo', grupo: 'ejes', nombre: 'Ataque de apoyo (eje)', tipo: 'linea', min: 2, campos: ['ancho'] },
  { id: 'contraataque', grupo: 'ejes', nombre: 'Contraataque', sigla: 'CATK', tipo: 'linea', min: 2, campos: ['ancho'] },
  { id: 'dir-principal', grupo: 'ejes', nombre: 'Dirección del ataque principal', tipo: 'linea', min: 2 },
  { id: 'dir-apoyo', grupo: 'ejes', nombre: 'Dirección del ataque de apoyo', tipo: 'linea', min: 2 },
  // Zonas (tablas 2.5–2.7)
  { id: 'aa', grupo: 'areas', nombre: 'Zona de reunión', sigla: 'AA', tipo: 'area', min: 3 },
  { id: 'obj', grupo: 'areas', nombre: 'Objetivo', sigla: 'OBJ', tipo: 'area', min: 3 },
  { id: 'atk', grupo: 'areas', nombre: 'Posición de partida', sigla: 'ATK', tipo: 'area', min: 3 },
  { id: 'aslt', grupo: 'areas', nombre: 'Posición de asalto', sigla: 'ASLT', tipo: 'area', min: 3 },
  { id: 'ea', grupo: 'areas', nombre: 'Área de fuego sobre objetivos', sigla: 'EA', tipo: 'area', min: 3, claves: 'engagement area' },
  { id: 'bp', grupo: 'areas', nombre: 'Posición defensiva', sigla: 'BP', tipo: 'area', min: 3, claves: 'battle position' },
  { id: 'dz', grupo: 'areas', nombre: 'Zona de lanzamiento', sigla: 'DZ', tipo: 'area', min: 3, claves: 'paracaidistas salto' },
  { id: 'lz', grupo: 'areas', nombre: 'Zona de aterrizaje', sigla: 'LZ', tipo: 'area', min: 3, claves: 'helicópteros toma' },
  { id: 'pz', grupo: 'areas', nombre: 'Zona de recogida', sigla: 'PZ', tipo: 'area', min: 3 },
  { id: 'sbf', grupo: 'areas', nombre: 'Posición de apoyo por el fuego', sigla: 'SBF', tipo: 'linea', n: 4, ayuda: 'Puntos 1 y 2: base; 3 y 4: puntas de las flechas.' },
  { id: 'abf', grupo: 'areas', nombre: 'Posición de ataque por el fuego', sigla: 'ABF', tipo: 'linea', n: 3, ayuda: 'Punto 1: punta de la flecha; 2 y 3: extremos de la base.' },
  // Puntos (tabla 2.4)
  { id: 'ckp', grupo: 'puntos', nombre: 'Punto de control', sigla: 'CKP', tipo: 'punto', n: 1 },
  { id: 'cop', grupo: 'puntos', nombre: 'Punto de contacto', sigla: 'CP', tipo: 'punto', n: 1 },
  { id: 'coord', grupo: 'puntos', nombre: 'Punto de coordinación', sigla: 'PC', tipo: 'punto', n: 1 },
  { id: 'rly', grupo: 'puntos', nombre: 'Punto de reunión', sigla: 'RLY', tipo: 'punto', n: 1 },
  { id: 'sp', grupo: 'puntos', nombre: 'Punto inicial', sigla: 'SP', tipo: 'punto', n: 1 },
  { id: 'rp', grupo: 'puntos', nombre: 'Punto de dislocación', sigla: 'RP', tipo: 'punto', n: 1 },
  { id: 'pp', grupo: 'puntos', nombre: 'Punto de paso', sigla: 'PP', tipo: 'punto', n: 1 },
  { id: 'pd', grupo: 'puntos', nombre: 'Punto de partida', sigla: 'PD', tipo: 'punto', n: 1 },
  { id: 'op', grupo: 'puntos', nombre: 'Observatorio', sigla: 'OP', tipo: 'punto', n: 1 },
  // Cometidos tácticos (apéndice A al cap. 8 / apéndice I de la PD0-002)
  { id: 'bloquear', grupo: 'cometidos', nombre: 'Bloquear', sigla: 'B', tipo: 'linea', n: 3, ayuda: 'Puntos 1 y 2: la barra (de cara al enemigo); 3: el final de la línea.' },
  { id: 'brecha', grupo: 'cometidos', nombre: 'Brecha', sigla: 'B', tipo: 'linea', n: 3, ayuda: 'Puntos 1 y 2: la abertura; 3: la parte de atrás.' },
  { id: 'desbordar', grupo: 'cometidos', nombre: 'Desbordar', sigla: 'B', tipo: 'linea', n: 3, ayuda: 'Puntos 1 y 2: las puntas; 3: la parte de atrás.' },
  { id: 'canalizar', grupo: 'cometidos', nombre: 'Canalizar', sigla: 'C', tipo: 'linea', n: 3, ayuda: 'Puntos 1 y 2: la abertura; 3: la parte de atrás.' },
  { id: 'limpiar', grupo: 'cometidos', nombre: 'Operación de limpieza', sigla: 'C', tipo: 'linea', n: 3, ayuda: 'Puntos 1 y 2: la línea de llegada; 3: el inicio de las flechas.' },
  { id: 'contener', grupo: 'cometidos', nombre: 'Contener', sigla: 'C', tipo: 'linea', n: 2, ayuda: 'Puntos 1 y 2: extremos del semicírculo.' },
  { id: 'controlar', grupo: 'cometidos', nombre: 'Controlar', sigla: 'C', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: inicio y radio.' },
  { id: 'asegurar', grupo: 'cometidos', nombre: 'Asegurar', sigla: 'S', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: inicio y radio (abertura hacia lo propio).' },
  { id: 'ocupar', grupo: 'cometidos', nombre: 'Ocupar', sigla: 'O', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: inicio y radio.' },
  { id: 'aislar', grupo: 'cometidos', nombre: 'Aislar', sigla: 'I', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: inicio y radio.' },
  { id: 'tomar', grupo: 'cometidos', nombre: 'Tomar', sigla: 'S', tipo: 'linea', n: 3, ayuda: 'Punto 1: centro del círculo de la unidad; 2: radio; 3: punta de la flecha.' },
  { id: 'destruir', grupo: 'cometidos', nombre: 'Destruir', sigla: 'D', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: tamaño.' },
  { id: 'neutralizar', grupo: 'cometidos', nombre: 'Neutralizar', sigla: 'N', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: tamaño.' },
  { id: 'suprimir', grupo: 'cometidos', nombre: 'Suprimir', sigla: 'S', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: tamaño.' },
  { id: 'fijar', grupo: 'cometidos', nombre: 'Fijar', sigla: 'F', tipo: 'linea', n: 2, ayuda: 'Punto 1: punta de la flecha; 2: el inicio.' },
  { id: 'retardar', grupo: 'cometidos', nombre: 'Retardar', sigla: 'D', tipo: 'linea', n: 3, ayuda: 'Punto 1: punta de la flecha; 2: fin del tramo recto; 3: lado y tamaño del arco.' },
  { id: 'retirarse', grupo: 'cometidos', nombre: 'Retirarse', sigla: 'W', tipo: 'linea', n: 3, ayuda: 'Punto 1: punta de la flecha; 2: fin del tramo recto; 3: lado y tamaño del arco.' },
  { id: 'retirarse-presion', grupo: 'cometidos', nombre: 'Retirarse bajo presión', sigla: 'WP', tipo: 'linea', n: 3 },
  { id: 'ruptura', grupo: 'cometidos', nombre: 'Ruptura del contacto', sigla: 'DIS', tipo: 'linea', n: 3 },
  { id: 'demostracion', grupo: 'cometidos', nombre: 'Demostración', sigla: 'DEM', tipo: 'linea', n: 3 },
  { id: 'desorganizar', grupo: 'cometidos', nombre: 'Desorganizar / perturbar', sigla: 'D', tipo: 'linea', n: 3, ayuda: 'Puntos 1 y 2: la línea base; 3: punta de la flecha más larga.' },
  { id: 'interdiccion', grupo: 'cometidos', nombre: 'Interdicción', sigla: 'I', tipo: 'linea', n: 2, ayuda: 'Punto 1: centro; 2: tamaño y dirección.' },
  { id: 'penetrar', grupo: 'cometidos', nombre: 'Penetrar', sigla: 'P', tipo: 'linea', n: 3, ayuda: 'Puntos 1 y 2: la barra; 3: el inicio de la flecha.' },
  { id: 'envolver', grupo: 'cometidos', nombre: 'Envolver', sigla: 'E', tipo: 'linea', n: 3, ayuda: 'Punto 1: inicio; 2: fin del tramo recto; 3: fin del arco.' },
  { id: 'emboscada', grupo: 'cometidos', nombre: 'Emboscada', tipo: 'linea', n: 3, ayuda: 'Punto 1: punta de la flecha; 2 y 3: extremos de la base.' },
  { id: 'cubrir', grupo: 'cometidos', nombre: 'Cubrir', sigla: 'C', tipo: 'linea', n: 3, ayuda: 'Punto 1: la unidad; 2 y 3: puntas de las flechas.' },
  { id: 'vigilar', grupo: 'cometidos', nombre: 'Vigilar / proteger', sigla: 'G', tipo: 'linea', n: 3, ayuda: 'Punto 1: la unidad; 2 y 3: puntas de las flechas.' },
  { id: 'observar', grupo: 'cometidos', nombre: 'Observar / vigilar (pantalla)', sigla: 'S', tipo: 'linea', n: 3, ayuda: 'Punto 1: la unidad; 2 y 3: puntas de las flechas.' },
];
export const medida = (id) => MEDIDAS.find((m) => m.id === id);
export const puntosNecesarios = (m) => m.n ?? m.min ?? 1;

// ---------------------------------------------------------------- geometría
/**
 * Gráfico de una medida.
 * @param {object} m definición (MEDIDAS)
 * @param {Array<{lat,lon}>} anclas puntos de anclaje
 * @param {object} props {nombre, ancho(m), escalon, izq, der}
 * @returns {{lineas: Array<{pts:[[lat,lon]], discontinua?, grosor?}>, rellenos: Array<{pts}>, textos: Array<{pos:[lat,lon], texto, rumbo?, tam?}>}}
 */
export function geometria(m, anclas, props = {}) {
  const out = { lineas: [], rellenos: [], textos: [] };
  if (!anclas.length) return out;
  const { a, g } = plano(anclas[0]);
  const P = anclas.map(a);
  const L = (pts, opc = {}) => out.lineas.push({ pts: pts.map(g), ...opc });
  const F = (pts) => out.rellenos.push({ pts: pts.map(g) });
  const T = (p, texto, opc = {}) => { if (texto) out.textos.push({ pos: g(p), texto, ...opc }); };
  const nombre = props.nombre ?? '';
  const etiqueta = [m.sigla, nombre].filter(Boolean).join(' ');

  // Líneas con rótulo en los extremos
  if (m.grupo === 'lineas') {
    L(P, { discontinua: m.discontinua });
    if (m.id === 'limite') {
      const i = Math.floor((P.length - 1) / 2), c = med(P[i], P[i + 1]);
      const d = uni(res(P[i + 1], P[i])), n = perp(d), L0 = lon(res(P[i + 1], P[i]));
      T(c, props.escalonMarca || '', { tam: 15, rumbo: angulo(d) - 90, fondo: true });
      T(sum(c, mul(n, Math.max(30, L0 * 0.06))), props.izq, { rumbo: angulo(d) - 90 });
      T(sum(c, mul(n, -Math.max(30, L0 * 0.06))), props.der, { rumbo: angulo(d) - 90 });
    } else {
      T(P[0], etiqueta, { extremo: 'inicio', dir: angulo(res(P[1], P[0])) });
      T(P.at(-1), etiqueta, { extremo: 'fin', dir: angulo(res(P.at(-1), P.at(-2))) });
    }
    return out;
  }
  if (m.grupo === 'areas' && m.tipo === 'area') {
    L([...P, P[0]]);
    T(centroide(P), etiqueta, { tam: 14, negrita: true });
    return out;
  }
  if (m.grupo === 'ejes') {
    if (m.id.startsWith('dir-')) {
      L(P);
      const dir = uni(res(P.at(-1), P.at(-2))), t = Math.max(25, longitud(P) * 0.08);
      L(punta(P.at(-1), dir, t));
      if (m.id === 'dir-principal') L(punta(sum(P.at(-1), mul(dir, -t * 0.45)), dir, t));
      T(med(P.at(-2), P.at(-1)), nombre, { rumbo: angulo(dir) - 90, arriba: true });
      return out;
    }
    const ancho = props.ancho > 0 ? props.ancho : Math.max(80, longitud(P) * 0.14);
    const flecha = flechaAncha(P, ancho, m.id === 'ataque-principal');
    for (const l of flecha) L(l, { discontinua: m.id === 'contraataque' });
    const i = Math.max(0, P.length - 2);
    T(med(P[i], P[i + 1]), m.id === 'contraataque' ? ['CATK', nombre].filter(Boolean).join(' ') : nombre, { rumbo: angulo(res(P[i + 1], P[i])) - 90, negrita: true });
    return out;
  }
  if (m.tipo === 'punto') return out; // los puntos se pintan con un icono (marcadorPunto)

  // ---------------------------------------------------------- posiciones de fuego
  if (m.id === 'sbf' && P.length >= 4) {
    const [p1, p2, p3, p4] = P, base = res(p2, p1), n = uni(perp(base)), t = lon(base) * 0.18;
    const atras = mul(n, -t);
    L([sum(p1, sum(atras, mul(uni(base), -t * 0.6))), p1, p2, sum(p2, sum(atras, mul(uni(base), t * 0.6)))]);
    L([p1, p3]); L(punta(p3, uni(res(p3, p1)), t * 0.5));
    L([p2, p4]); L(punta(p4, uni(res(p4, p2)), t * 0.5));
    T(med(p1, p2), nombre);
    return out;
  }
  if (m.id === 'abf' && P.length >= 3) {
    const [p1, p2, p3] = P, base = res(p3, p2), n = uni(perp(base)), t = lon(base) * 0.18;
    const haciaFuera = mul(n, Math.sign((p1[0] - p2[0]) * n[0] + (p1[1] - p2[1]) * n[1]) || 1);
    L([sum(p2, sum(mul(haciaFuera, -t), mul(uni(base), -t * 0.6))), p2, p3, sum(p3, sum(mul(haciaFuera, -t), mul(uni(base), t * 0.6)))]);
    const c = med(p2, p3); L([c, p1]); L(punta(p1, uni(res(p1, c)), t * 0.5));
    T(c, nombre);
    return out;
  }

  // ---------------------------------------------------------- cometidos
  const s = m.sigla ?? '';
  switch (m.id) {
    case 'bloquear': case 'penetrar': {
      const [p1, p2, p3] = P, c = med(p1, p2);
      L([p1, p2]);
      L([p3, c]);
      if (m.id === 'penetrar') L(punta(c, uni(res(c, p3)), lon(res(p2, p1)) * 0.18));
      T(med(c, p3), s, { fondo: true });
      break;
    }
    case 'brecha': case 'desbordar': case 'canalizar': {
      const [p1, p2, p3] = P, ab = res(p2, p1), n = uni(perp(ab));
      const prof = (p3[0] - p1[0]) * n[0] + (p3[1] - p1[1]) * n[1];
      const atras = mul(n, prof);
      const q1 = sum(p1, atras), q2 = sum(p2, atras);
      L([p1, q1, q2, p2]);
      const t = lon(ab) * 0.12, fuera = uni(ab), haciaDelante = mul(n, -Math.sign(prof) || 1);
      if (m.id === 'desbordar') { L(punta(p1, haciaDelante, t)); L(punta(p2, haciaDelante, t)); }
      else {
        const sg = m.id === 'brecha' ? -1 : 1; // brecha: rabos hacia fuera; canalizar: hacia dentro
        L([sum(p1, sum(mul(fuera, sg * t * 0.7), mul(haciaDelante, t * 0.7))), sum(p1, sum(mul(fuera, -sg * t * 0.7), mul(haciaDelante, -t * 0.7)))]);
        L([sum(p2, sum(mul(fuera, -sg * t * 0.7), mul(haciaDelante, t * 0.7))), sum(p2, sum(mul(fuera, sg * t * 0.7), mul(haciaDelante, -t * 0.7)))]);
      }
      T(med(q1, q2), s, { fondo: true });
      break;
    }
    case 'limpiar': {
      const [p1, p2, p3] = P, ab = res(p2, p1), n = uni(perp(ab));
      const prof = (p3[0] - p1[0]) * n[0] + (p3[1] - p1[1]) * n[1];
      L([p1, p2]);
      const t = lon(ab) * 0.1, dir = mul(n, -Math.sign(prof) || 1);
      for (const k of [0.2, 0.5, 0.8]) {
        const tip = sum(p1, mul(ab, k)), cola = sum(tip, mul(n, prof));
        L([cola, tip]); L(punta(tip, dir, t));
        if (k === 0.5) T(med(cola, tip), s, { fondo: true });
      }
      break;
    }
    case 'contener': {
      const [p1, p2] = P, c = med(p1, p2), r = lon(res(p2, p1)) / 2, a0 = angDe(res(p1, c));
      const arc = arco(c, r, a0, a0 + Math.PI, 30);
      L(arc);
      for (let i = 1; i < 10; i++) { const q = arc[i * 3]; const v = uni(res(q, c)); L([q, sum(q, mul(v, r * 0.18))]); } // rayas hacia fuera
      T(sum(c, mul(uni(res(arc[15], c)), r * 1.32)), s, { fondo: true });
      break;
    }
    case 'controlar': case 'asegurar': case 'ocupar': case 'aislar': {
      const [p1, p2] = P, r = lon(res(p2, p1)) || 1, a0 = angDe(res(p2, p1));
      const arc = arco(p1, r, a0, a0 + (330 * Math.PI) / 180, 44);
      L(arc);
      const fin = arc.at(-1), tg = uni(res(fin, arc.at(-2)));
      if (m.id === 'ocupar') { const d = r * 0.14; L([sum(fin, [-d, -d]), sum(fin, [d, d])]); L([sum(fin, [-d, d]), sum(fin, [d, -d])]); }
      else if (m.id === 'asegurar') { const t = r * 0.2; const b = sum(fin, mul(tg, -t)); L([sum(b, mul(perp(tg), t * 0.6)), fin]); }
      else L(punta(fin, tg, r * 0.18));
      if (m.id === 'aislar') {
        for (let i = 4; i < 40; i += 6) {
          const q = arc[i], q2 = arc[i + 2], v = uni(res(p1, q));
          L([q, sum(med(q, q2), mul(v, r * 0.2)), q2]);
        }
      }
      T(arc[Math.round(arc.length * 0.25)], s, { fondo: true });
      break;
    }
    case 'tomar': {
      const [p1, p2, p3] = P, r = lon(res(p2, p1)) || 1;
      L(arco(p1, r, 0, 2 * Math.PI, 48));
      const inicio = sum(p1, mul(uni(res(p3, p1)), r));
      const cuerda = res(p3, inicio), ctrl = sum(med(inicio, p3), mul(uni(perp(cuerda)), lon(cuerda) * 0.3));
      const curva = []; for (let i = 0; i <= 20; i++) { const t = i / 20; curva.push(sum(sum(mul(inicio, (1 - t) ** 2), mul(ctrl, 2 * t * (1 - t))), mul(p3, t * t))); }
      L(curva); L(punta(p3, uni(res(p3, curva.at(-2))), lon(cuerda) * 0.1));
      T(curva[10], s, { fondo: true });
      break;
    }
    case 'destruir': case 'neutralizar': case 'suprimir': {
      const [p1, p2] = P, d = lon(res(p2, p1)) || 1, hueco = d * 0.28;
      for (const v of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const u = uni(v);
        const disc = m.id === 'suprimir' || (m.id === 'neutralizar' && v[0] * v[1] < 0);
        L([sum(p1, mul(u, hueco)), sum(p1, mul(u, d))], { discontinua: disc });
      }
      T(p1, s, { fondo: true });
      break;
    }
    case 'fijar': {
      const [p1, p2] = P, v = res(p1, p2), u = uni(v), n = perp(u), Ltot = lon(v);
      const pts = [p2, sum(p2, mul(u, Ltot * 0.18))];
      const nz = 8, a0 = Ltot * 0.18, a1 = Ltot * 0.85, amp = Ltot * 0.06;
      for (let i = 1; i <= nz; i++) pts.push(sum(sum(p2, mul(u, a0 + ((a1 - a0) * (i - 0.5)) / nz)), mul(n, i % 2 ? amp : -amp)));
      pts.push(sum(p2, mul(u, a1)), p1);
      L(pts); L(punta(p1, u, Ltot * 0.1));
      T(sum(p2, mul(u, Ltot * 0.08)), s, { fondo: true });
      break;
    }
    case 'retardar': case 'retirarse': case 'retirarse-presion': case 'ruptura': case 'demostracion': {
      const [p1, p2, p3] = P, u = uni(res(p1, p2)), n = perp(u);
      const lado = Math.sign((p3[0] - p2[0]) * n[0] + (p3[1] - p2[1]) * n[1]) || 1;
      const diam = Math.abs((p3[0] - p2[0]) * n[0] + (p3[1] - p2[1]) * n[1]) || lon(res(p1, p2)) * 0.3;
      const c = sum(p2, mul(n, (lado * diam) / 2));
      const a0 = angDe(res(p2, c));
      const arc = arco(c, diam / 2, a0, a0 - lado * Math.PI, 24);
      L([p1, p2]); L(arc);
      if (m.id === 'demostracion') { const q = arc.at(-1); L([q, sum(q, mul(u, -lon(res(p1, p2)) * 0.6))]); }
      L(punta(p1, u, lon(res(p1, p2)) * 0.1));
      T(med(p1, p2), s, { fondo: true });
      break;
    }
    case 'desorganizar': {
      const [p1, p2, p3] = P, base = res(p2, p1), n = uni(perp(base));
      const largo = (p3[0] - p1[0]) * n[0] + (p3[1] - p1[1]) * n[1];
      L([p1, p2]);
      const flechas = [[0.08, 0.45], [0.5, 0.3], [0.92, 1]];
      const t = Math.abs(largo) * 0.1;
      for (const [k, f] of flechas) {
        const o = sum(p1, mul(base, k)), tip = sum(o, mul(n, largo * f));
        L([o, tip]); L(punta(tip, mul(n, Math.sign(largo) || 1), t));
        if (k === 0.5) T(sum(o, mul(n, largo * f * 0.5)), s, { fondo: true });
      }
      const c = med(p1, p2); L([c, sum(c, mul(n, -largo * 0.25))]);
      break;
    }
    case 'interdiccion': {
      const [p1, p2] = P, v = res(p2, p1), d = lon(v) || 1, u = uni(v);
      const a = sum(p1, mul(u, -d)), b = sum(p1, mul(u, d));
      L([a, b]); L(punta(b, u, d * 0.18));
      const u2 = rot(u, Math.PI / 4), a2 = sum(p1, mul(u2, -d)), b2 = sum(p1, mul(u2, d));
      L([a2, b2]); L(punta(b2, u2, d * 0.18));
      T(p1, s, { fondo: true });
      break;
    }
    case 'envolver': {
      const [p1, p2, p3] = P, d = res(p3, p2), c = med(p2, p3), r = lon(d) / 2;
      const a0 = angDe(res(p2, c));
      const arc = arco(c, r, a0, a0 - Math.PI, 24);
      L([p1, p2]); L(arc); L(punta(arc.at(-1), uni(res(arc.at(-1), arc.at(-2))), r * 0.35));
      T(med(p1, p2), s, { fondo: true });
      break;
    }
    case 'emboscada': {
      const [p1, p2, p3] = P, c = med(p2, p3), dir = uni(res(p1, c)), r = lon(res(p3, p2)) / 2;
      // base curva (abierta hacia la flecha) con rayas hacia atrás
      const ctrl = sum(c, mul(dir, -r * 0.5));
      const curva = []; for (let i = 0; i <= 16; i++) { const t = i / 16; curva.push(sum(sum(mul(p2, (1 - t) ** 2), mul(ctrl, 2 * t * (1 - t))), mul(p3, t * t))); }
      L(curva);
      for (let i = 1; i < 16; i += 2) L([curva[i], sum(curva[i], mul(dir, r * 0.2))]);
      const ini = curva[8]; L([ini, p1]); L(punta(p1, dir, r * 0.25));
      break;
    }
    case 'cubrir': case 'vigilar': case 'observar': {
      const [p1, p2, p3] = P;
      for (const q of [p2, p3]) {
        const v = res(q, p1), u = uni(v), n = perp(u), d = lon(v);
        const a0 = sum(p1, mul(u, d * 0.18)), z0 = sum(p1, mul(u, d * 0.55)), z1 = sum(p1, mul(u, d * 0.62));
        L([a0, z0, sum(med(z0, z1), mul(n, d * 0.06)), z1, q]);
        L(punta(q, u, d * 0.08));
        T(sum(p1, mul(u, d * 0.3)), s, { fondo: true });
      }
      break;
    }
    default: L(P);
  }
  return out;
}

const longitud = (P) => P.slice(1).reduce((t, p, i) => t + lon(res(p, P[i])), 0);
function centroide(P) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) return mul(P.reduce((s, p) => sum(s, p), [0, 0]), 1 / P.length);
  return [cx / (3 * a), cy / (3 * a)];
}

/** Flecha ancha a lo largo de un eje (ataques). Devuelve polilíneas. */
function flechaAncha(P, ancho, doble) {
  const h = ancho / 2;
  const izq = [], der = [];
  const n = P.length;
  // Normales suavizadas en los vértices
  for (let i = 0; i < n - 1; i++) {
    const dPrev = i > 0 ? uni(res(P[i], P[i - 1])) : null, dNext = uni(res(P[i + 1], P[i]));
    const dir = dPrev ? uni(sum(dPrev, dNext)) : dNext;
    const nn = perp(dir);
    izq.push(sum(P[i], mul(nn, h))); der.push(sum(P[i], mul(nn, -h)));
  }
  const fin = P[n - 1], dFin = uni(res(fin, P[n - 2])), nFin = perp(dFin);
  const largoPunta = Math.min(ancho * 0.9, longitud(P) * 0.3);
  const base = sum(fin, mul(dFin, -largoPunta));
  izq.push(sum(base, mul(nFin, h))); der.push(sum(base, mul(nFin, -h)));
  const alas = [sum(base, mul(nFin, h * 1.6)), fin, sum(base, mul(nFin, -h * 1.6))];
  const lineas = [[...izq, alas[0], alas[1], alas[2], ...der.slice().reverse()]];
  if (doble) {
    // Ataque principal: segunda punta dentro de la cabeza, paralela a la exterior
    const atras = mul(dFin, -largoPunta * 0.32);
    lineas.push([sum(sum(base, atras), mul(nFin, h * 1.25)), sum(fin, atras), sum(sum(base, atras), mul(nFin, -h * 1.25))]);
  }
  return lineas;
}

/** SVG de un punto de control (chincheta con su sigla) — APP-6(E) 8.3. */
export function svgPunto(m, color, nombre = '') {
  const s = m.sigla ?? '';
  if (m.id === 'op') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="32" viewBox="0 0 34 32"><path d="M17,3 L31,29 L3,29 Z" fill="#fff" stroke="${color}" stroke-width="2.5"/><circle cx="17" cy="21" r="3" fill="${color}"/></svg>`;
  }
  const w = Math.max(34, s.length * 9 + 14);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="44" viewBox="0 0 ${w} 44"><path d="M3,3 L${w - 3},3 L${w - 3},26 L${w / 2 + 7},26 L${w / 2},41 L${w / 2 - 7},26 L3,26 Z" fill="#fff" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/><text x="${w / 2}" y="19.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="12" fill="${color}">${s}</text></svg>${nombre ? '' : ''}`;
}
