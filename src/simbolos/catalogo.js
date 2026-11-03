// Catálogo de unidades del ET para el constructor guiado: arma → tipo →
// especialidad, con los nombres de la PD0-002 (anexo C) y los iconos y
// modificadores de la APP-6(E). Ordenado de lo más usado a lo menos.
// Además, el árbol completo de la APP-6(E) (unidades, material, instalaciones
// y organizaciones civiles) para buscar cualquier símbolo.

import { ICONOS } from './datos/iconos.js';
import { CONJUNTOS, ESCALONES } from './app6.js';

/** Especialidad: {id, nombre, icono, mod1?, mod2?, claves?} */
export const ARMAS = [
  {
    id: 'infanteria', nombre: 'Infantería', icono: '121100', tipos: [
      { id: 'ligera', nombre: 'Ligera', icono: '121100' },
      { id: 'paracaidista', nombre: 'Paracaidista', icono: '121100', mod2: 'c100', claves: 'bandera bripac aerotransportada' },
      { id: 'montana', nombre: 'Cazadores de montaña', icono: '121100', mod2: 'c113', claves: 'montaña' },
      { id: 'motorizada', nombre: 'Motorizada', icono: '121104' },
      { id: 'mecanizada', nombre: 'Mecanizada (cadenas)', icono: '121102' },
      { id: 'protegida', nombre: 'Protegida (ruedas)', icono: '121102', mod2: 'c106', claves: 'vamtac piraña dragón 8x8' },
      { id: 'aeromovil', nombre: 'Aeromóvil', icono: '121100', mod2: 'u59', claves: 'asalto aéreo helitransportada' },
      { id: 'esquiadores', nombre: 'Esquiadores escaladores', icono: '121100', mod2: 'c103' },
      { id: 'anfibia', nombre: 'Anfibia / de marina', icono: '121101' },
    ],
  },
  {
    id: 'apoyo', nombre: 'Armas de apoyo', icono: '130800', tipos: [
      { id: 'morteros', nombre: 'Morteros', icono: '130800' },
      { id: 'contracarro', nombre: 'Contracarro', icono: '120400', claves: 'spike misil cc' },
      { id: 'contracarro-mot', nombre: 'Contracarro motorizado', icono: '120402' },
      { id: 'contracarro-aco', nombre: 'Contracarro acorazado', icono: '120401' },
      { id: 'tiradores', nombre: 'Tiradores de precisión', icono: '121500', claves: 'francotiradores' },
      { id: 'apoyo-combate', nombre: 'Armas de apoyo / mando y apoyo', icono: '140200' },
    ],
  },
  {
    id: 'caballeria', nombre: 'Caballería / reconocimiento', icono: '121300', tipos: [
      { id: 'reco', nombre: 'Reconocimiento', icono: '121300', claves: 'reco exploración' },
      { id: 'reco-mot', nombre: 'Reconocimiento motorizado', icono: '121303' },
      { id: 'ligero-aco', nombre: 'Ligero acorazado (ruedas)', icono: '120501', mod2: 'c106', claves: 'vrc centauro' },
      { id: 'acorazado', nombre: 'Acorazado', icono: '120501' },
      { id: 'expl-vig', nombre: 'Exploración y vigilancia', icono: '121301' },
      { id: 'reco-para', nombre: 'Reconocimiento paracaidista', icono: '121300', mod2: 'c100' },
    ],
  },
  { id: 'acorazada', nombre: 'Carros de combate', icono: '120500', tipos: [{ id: 'carros', nombre: 'Carros', icono: '120500', claves: 'leopard acorazado' }] },
  {
    id: 'artilleria', nombre: 'Artillería', icono: '130300', tipos: [
      { id: 'remolcada', nombre: 'Campaña remolcada', icono: '130300', claves: 'obús' },
      { id: 'autopropulsada', nombre: 'Campaña autopropulsada', icono: '130301', claves: 'atp' },
      { id: 'lanzacohetes', nombre: 'Lanzacohetes', icono: '130300', mod1: 'u41' },
      { id: 'paracaidista', nombre: 'Campaña paracaidista', icono: '130300', mod2: 'c100' },
      { id: 'info-loc', nombre: 'Información y localización', icono: '130300', mod1: 'u67' },
      { id: 'observador', nombre: 'Observador avanzado', icono: '130400', claves: 'oaf jtac' },
      { id: 'antiaerea', nombre: 'Antiaérea', icono: '130100', claves: 'aaa defensa aérea' },
      { id: 'antiaerea-cañon', nombre: 'Antiaérea (cañón)', icono: '130101' },
      { id: 'antiaerea-misil', nombre: 'Antiaérea (misiles)', icono: '130102', claves: 'mistral nasams patriot' },
    ],
  },
  {
    id: 'ingenieros', nombre: 'Ingenieros', icono: '140700', tipos: [
      { id: 'zapadores', nombre: 'Zapadores', icono: '140700' },
      { id: 'paracaidistas', nombre: 'Zapadores paracaidistas', icono: '140700', mod2: 'c100' },
      { id: 'montana', nombre: 'Zapadores de montaña', icono: '140700', mod2: 'c113' },
      { id: 'mecanizados', nombre: 'Zapadores mecanizados', icono: '140701' },
      { id: 'motorizados', nombre: 'Zapadores motorizados', icono: '140702' },
      { id: 'reco', nombre: 'Reconocimiento de ingenieros', icono: '140703' },
      { id: 'eod', nombre: 'Desactivación de explosivos', icono: '140800', claves: 'edex eod' },
    ],
  },
  {
    id: 'transmisiones', nombre: 'Transmisiones e inteligencia', icono: '111000', tipos: [
      { id: 'transmisiones', nombre: 'Transmisiones', icono: '111000', claves: 'cis' },
      { id: 'ew', nombre: 'Guerra electrónica', icono: '150500' },
      { id: 'inteligencia', nombre: 'Inteligencia', icono: '151000' },
      { id: 'vigilancia', nombre: 'Vigilancia', icono: '121600' },
      { id: 'uas', nombre: 'UAS (drones)', icono: '121900', claves: 'uav dron raven' },
      { id: 'contrainteligencia', nombre: 'Contrainteligencia', icono: '150200' },
      { id: 'enlace', nombre: 'Enlace', icono: '110500' },
      { id: 'cimic', nombre: 'CIMIC', icono: '110300' },
      { id: 'psyops', nombre: 'Operaciones psicológicas', icono: '110600' },
    ],
  },
  {
    id: 'especiales', nombre: 'Operaciones especiales', icono: '121700', tipos: [
      { id: 'goe', nombre: 'Operaciones especiales (GOE)', icono: '121700', claves: 'boinas verdes moe' },
      { id: 'sof', nombre: 'SOF', icono: '121800' },
    ],
  },
  {
    id: 'helicopteros', nombre: 'Helicópteros (FAMET)', icono: '120600', tipos: [
      { id: 'maniobra', nombre: 'De maniobra', icono: '120600', mod1: 'c111', claves: 'nh90 cougar' },
      { id: 'ataque', nombre: 'De ataque', icono: '120600', mod1: 'c106', claves: 'tigre' },
      { id: 'transporte', nombre: 'De transporte', icono: '120600', mod1: 'c114', claves: 'chinook' },
      { id: 'reco', nombre: 'De reconocimiento', icono: '120601' },
    ],
  },
  {
    id: 'uas', nombre: 'UAS (drones)', icono: '121900', tipos: [
      { id: 'uas', nombre: 'UAS', icono: '121900', claves: 'dron drones rpas uav no tripulado' },
      { id: 'ala-fija', nombre: 'UAS de ala fija', icono: '121900', mod1: 'c102', claves: 'dron avión' },
      { id: 'ala-rotatoria', nombre: 'UAS de ala rotatoria', icono: '121900', mod1: 'c103', claves: 'dron multirrotor cuadricóptero' },
      { id: 'vtol', nombre: 'UAS VTOL', icono: '121900', mod1: 'c105', claves: 'dron despegue vertical' },
      { id: 'rotor-basculante', nombre: 'UAS de rotor basculante', icono: '121900', mod1: 'c104', claves: 'dron tiltrotor' },
      { id: 'isr', nombre: 'UAS de reconocimiento (ISR)', icono: '121900', mod1: 'c125', claves: 'dron vigilancia inteligencia' },
      { id: 'ataque', nombre: 'UAS de ataque', icono: '121900', mod1: 'c106', claves: 'dron armado munición merodeadora' },
      { id: 'ge', nombre: 'UAS de guerra electrónica', icono: '121900', mod1: 'c166', claves: 'dron perturbación' },
      { id: 'recuperacion', nombre: 'Recuperación de UAS', icono: '121900', mod2: 'u37', claves: 'dron' },
      { id: 'con-drones', nombre: 'Unidad con drones', icono: '121100', mod1: 'c100', claves: 'infantería dron equipada' },
    ],
  },
  {
    id: 'proteccion', nombre: 'NBQ, policía y seguridad', icono: '140100', tipos: [
      { id: 'nbq', nombre: 'Defensa NBQ', icono: '140100' },
      { id: 'nbq-reco', nombre: 'Reconocimiento NBQ', icono: '140103' },
      { id: 'pm', nombre: 'Policía militar', icono: '141200' },
      { id: 'seguridad', nombre: 'Seguridad', icono: '141700' },
      { id: 'cinologica', nombre: 'Cinológica', icono: '140500' },
    ],
  },
  {
    id: 'logistica', nombre: 'Logística y sanidad', icono: '160600', tipos: [
      { id: 'servicios', nombre: 'Servicios / logística', icono: '160600', claves: 'css grupo logístico' },
      { id: 'sanidad', nombre: 'Sanidad', icono: '161300', claves: 'médica role' },
      { id: 'abastecimiento', nombre: 'Abastecimiento', icono: '160200' },
      { id: 'municion', nombre: 'Munición', icono: '160400' },
      { id: 'combustible', nombre: 'Combustible', icono: '162500' },
      { id: 'mantenimiento', nombre: 'Mantenimiento', icono: '161100' },
      { id: 'transporte', nombre: 'Transporte', icono: '163600' },
      { id: 'intendencia', nombre: 'Intendencia', icono: '162900' },
      { id: 'personal', nombre: 'Personal', icono: '162400' },
    ],
  },
  { id: 'generica', nombre: 'Sin icono (genérica)', icono: '000000', tipos: [{ id: 'generica', nombre: 'Unidad genérica', icono: '000000', claves: 'mando cuartel general plana mayor' }] },
];

/** Escalones habituales primero (los del batallón hacia abajo y arriba). */
export const ORDEN_ESCALONES = ['equipo', 'escuadra', 'peloton', 'seccion', 'compania', 'batallon', 'regimiento', 'brigada', 'division', 'cuerpo', 'ejercito', 'grupoEjercitos', 'teatro', 'mando', ''];

/** Nombre corto de un escalón según el arma (PD0-002 anexo A). */
export function nombreEscalon(escalon, arma) {
  const art = arma === 'artilleria', cab = arma === 'caballeria' || arma === 'acorazada';
  if (escalon === 'compania') return art ? 'Batería' : cab ? 'Escuadrón' : 'Compañía';
  if (escalon === 'batallon') return art || cab ? 'Grupo' : 'Batallón';
  return {
    equipo: 'Equipo', escuadra: 'Escuadra', peloton: 'Pelotón', seccion: 'Sección', regimiento: 'Regimiento',
    brigada: 'Brigada', division: 'División', cuerpo: 'Cuerpo de ejército', ejercito: 'Ejército', grupoEjercitos: 'Grupo de ejércitos', teatro: 'Teatro', mando: 'Mando', '': 'Sin escalón',
  }[escalon] ?? escalon;
}

/** Busca la especialidad de un símbolo (para el nombre y para editar). */
export function especialidadDe(s) {
  if (String(s.conjunto ?? '10') !== '10') return null;
  for (const a of ARMAS) for (const t of a.tipos) {
    if (t.icono === s.icono && (t.mod1 ?? '') === (s.mod1 ?? '') && (t.mod2 ?? '') === (s.mod2 ?? '')) return { arma: a, tipo: t };
  }
  for (const a of ARMAS) for (const t of a.tipos) if (t.icono === s.icono) return { arma: a, tipo: t };
  return null;
}

/** «Sección de infantería paracaidista», «Compañía de carros»… */
export function nombreUnidad(s) {
  const conj = String(s.conjunto ?? '10');
  if (conj !== '10') return ICONOS[conj]?.[s.icono]?.[0] ?? CONJUNTOS[conj]?.nombre ?? 'Símbolo';
  const e = especialidadDe(s);
  if (!e) {
    const n = ICONOS['10']?.[s.icono]?.[0];
    if (n) { const esc = s.escalon ? nombreEscalon(s.escalon, '') : ''; return esc && esc !== 'Sin escalón' ? `${esc} · ${n}` : n; }
  }
  const esc = s.escalon ? nombreEscalon(s.escalon, e?.arma.id) : '';
  if (!e) return esc || 'Unidad';
  const t = e.tipo.nombre.toLowerCase();
  const arma = e.arma.id === 'infanteria' ? `de infantería ${t}`
    : e.arma.id === 'caballeria' && !/^(reconocimiento|exploración)/.test(t) ? `de caballería ${t}` : `de ${t}`;
  return esc && esc !== 'Sin escalón' ? `${esc} ${arma}` : e.tipo.nombre;
}

/** Candidatos para el buscador: especialidades del ET y todos los iconos de la APP-6(E). */
export function candidatosUnidad() {
  const out = [];
  const vistos = new Set();
  for (const a of ARMAS) for (const t of a.tipos) {
    out.push({ arma: a.id, tipo: { ...t, conjunto: '10' }, texto: a.id === 'infanteria' ? `Infantería ${t.nombre.toLowerCase()}` : t.nombre, extra: `${a.nombre} ${t.claves ?? ''}` });
    if (!t.mod1 && !t.mod2) vistos.add(`10/${t.icono}`);
  }
  for (const [conj, tabla] of Object.entries(ICONOS)) {
    for (const [codigo, [nombre, otan]] of Object.entries(tabla)) {
      if (vistos.has(`${conj}/${codigo}`)) continue;
      out.push({ arma: conj === '10' ? 'todos' : conj, tipo: { id: codigo, nombre, icono: codigo, conjunto: conj }, texto: nombre, extra: `${otan} ${CONJUNTOS[conj].nombre} ${padreDe(conj, codigo)?.[0] ?? ''}` });
    }
  }
  return out;
}

/** Entidad / tipo de entidad del que cuelga un icono (para agrupar). */
export function padreDe(conj, codigo) {
  const t = ICONOS[conj] ?? {};
  if (codigo.slice(4) !== '00') return t[codigo.slice(0, 4) + '00'] ?? t[codigo.slice(0, 2) + '0000'];
  if (codigo.slice(2) !== '0000') return t[codigo.slice(0, 2) + '0000'];
  return null;
}

/**
 * Árbol completo de un conjunto: [{codigo, nombre, otan, nivel (0 entidad, 1 tipo, 2 subtipo), grupo}]
 * en el orden de la norma.
 */
const GRUPOS_SIN_ICONO = {
  10: { 11: 'Mando y control', 12: 'Movimiento y maniobra', 13: 'Fuegos', 14: 'Protección', 15: 'Inteligencia', 16: 'Sostenimiento', 17: 'Naval', 18: 'Cuarteles generales con nombre', 19: 'Operación de emergencia', 20: 'Fuerzas del orden', 21: 'Ciberespacio' },
  11: { 11: 'Civil' },
  15: { 11: 'Armas / sistemas de armas', 12: 'Vehículos', 13: 'Vehículos y equipos de ingenieros', 14: 'Vehículos de servicio', 15: 'Tren', 16: 'Vehículo civil', 17: 'Fuerzas del orden', 18: 'Animales de carga', 19: 'Apoyo a misiles', 20: 'Otro material', 21: 'Minas terrestres', 22: 'Sensores', 23: 'Operación de emergencia', 24: 'Pista manual', 25: 'Ala rotatoria' },
  20: { 11: 'Instalaciones', 12: 'Infraestructura' },
  27: { 11: 'Militar', 12: 'Civil' },
  40: { 11: 'Incidentes', 12: 'Alteraciones del orden', 13: 'Operaciones', 15: 'Materiales peligrosos', 16: 'Accidentes de transporte', 17: 'Sucesos naturales', 18: 'Individuos' },
};
export function arbol(conj = '10') {
  const t = ICONOS[conj] ?? {};
  const grupos = GRUPOS_SIN_ICONO[conj] ?? {};
  return Object.keys(t).sort().map((codigo) => {
    const [nombre, otan] = t[codigo];
    const nivel = codigo.slice(2) === '0000' ? 0 : codigo.slice(4) === '00' ? 1 : 2;
    const ent = t[codigo.slice(0, 2) + '0000'];
    const g = grupos[codigo.slice(0, 2)] ?? ent?.[0] ?? 'Otros';
    return { codigo, nombre, otan, nivel, grupo: g };
  });
}

/** Escalones con sentido para un conjunto (el material y las instalaciones no llevan). */
export const escalonesDe = (conj) => (String(conj ?? '10') === '10' || String(conj) === '11' ? ORDEN_ESCALONES.filter((k) => ESCALONES[k]) : ['']);
