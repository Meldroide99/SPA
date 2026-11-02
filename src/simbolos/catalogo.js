// Catálogo de unidades del ET para el constructor guiado: arma → tipo →
// especialidad, con los nombres de la PD0-002 (anexo C) y los iconos y
// modificadores de la APP-6(E). Ordenado de lo más usado a lo menos.

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
export const ORDEN_ESCALONES = ['equipo', 'escuadra', 'peloton', 'seccion', 'compania', 'batallon', 'regimiento', 'brigada', 'division', 'cuerpo', 'ejercito', 'mando', ''];

/** Nombre corto de un escalón según el arma (PD0-002 anexo A). */
export function nombreEscalon(escalon, arma) {
  const art = arma === 'artilleria', cab = arma === 'caballeria' || arma === 'acorazada';
  if (escalon === 'compania') return art ? 'Batería' : cab ? 'Escuadrón' : 'Compañía';
  if (escalon === 'batallon') return art || cab ? 'Grupo' : 'Batallón';
  return {
    equipo: 'Equipo', escuadra: 'Escuadra', peloton: 'Pelotón', seccion: 'Sección', regimiento: 'Regimiento',
    brigada: 'Brigada', division: 'División', cuerpo: 'Cuerpo de ejército', ejercito: 'Ejército', mando: 'Mando', '': 'Sin escalón',
  }[escalon] ?? escalon;
}

/** Busca la especialidad de un símbolo (para el nombre y para editar). */
export function especialidadDe(s) {
  for (const a of ARMAS) for (const t of a.tipos) {
    if (t.icono === s.icono && (t.mod1 ?? '') === (s.mod1 ?? '') && (t.mod2 ?? '') === (s.mod2 ?? '')) return { arma: a, tipo: t };
  }
  for (const a of ARMAS) for (const t of a.tipos) if (t.icono === s.icono) return { arma: a, tipo: t };
  return null;
}

/** «Sección de infantería paracaidista», «Compañía de carros»… */
export function nombreUnidad(s) {
  const e = especialidadDe(s);
  const esc = s.escalon ? nombreEscalon(s.escalon, e?.arma.id) : '';
  if (!e) return esc || 'Unidad';
  const t = e.tipo.nombre.toLowerCase();
  const arma = e.arma.id === 'infanteria' ? `de infantería ${t}`
    : e.arma.id === 'caballeria' && !/^(reconocimiento|exploración)/.test(t) ? `de caballería ${t}` : `de ${t}`;
  return esc && esc !== 'Sin escalón' ? `${esc} ${arma}` : e.tipo.nombre;
}

/** Candidatos para el buscador (cada especialidad × escalones típicos). */
export function candidatosUnidad() {
  const out = [];
  for (const a of ARMAS) for (const t of a.tipos) {
    out.push({ arma: a.id, tipo: t, texto: a.id === 'infanteria' ? `Infantería ${t.nombre.toLowerCase()}` : t.nombre, extra: `${a.nombre} ${t.claves ?? ''}` });
  }
  return out;
}
