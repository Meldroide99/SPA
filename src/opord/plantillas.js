// Plantillas de OPORD y de anexos.
//
// La OPORD de brigada sale del modelo de Balú (OPORD_TXT_GT.pdf, 17 págs.):
// se ha sacado la estructura y se ha desechado el contenido (todo ficticio).
// Corregido respecto al original: títulos que estaban partidos o montados
// unos sobre otros, numeración repetida («a. A. Enemy»), erratas
// («headquartes», «DEPHT», «POSITIONNAL», «Genera»), tablas con cabeceras
// cortadas y los formularios MEDEVAC y MEDSITREP, que iban pegados como
// imagen en mitad del 4.c.(6): ahora son anexos aparte y enlazados.
//
// Cada nodo:
//   k      clave estable: con ella se pasa el contenido de una plantilla a otra
//   en, es título en inglés y en castellano (el documento elige el idioma)
//   tipo   'texto' (por defecto) · 'tabla' · 'org' · 'agregaciones' · 'fases'
//          · 'matriz' · 'matrizFases' · 'permanentes' · 'anexos' · 'firma'
//          · 'formulario'
//   hijos  subapartados
//   cols   (tablas) columnas { k, en, es, campo?: 'gdh'|'mgrs'|'fase'|'numero'|'opcion', opciones? }
//   filas  (tablas) filas vacías al crear (o filas con texto fijo: filasFijas)
//   repetible  { en, es, n }: apartado que se repite (PLAE 1, PLAE 2…); n = cuántos al crear
//   anexo  tipo de anexo al que remite el apartado (se crea enlazado)
//
// No depende de la página: se prueba en Node.

/** Clasificaciones de seguridad (todo es ficticio: por defecto, ejercicio). */
export const CLASIFICACIONES = Object.freeze([
  'SIN CLASIFICAR', 'EJERCICIO', 'DIFUSIÓN LIMITADA', 'CONFIDENCIAL', 'RESERVADO', 'SECRETO',
  'NATO UNCLASSIFIED', 'NATO RESTRICTED', 'NATO CONFIDENTIAL', 'NATO SECRET', 'RESTRICTED',
]);

/** Relaciones de mando (AJP-3.2 / PD3-001). */
export const RELACIONES = Object.freeze(['OPCOM', 'OPCON', 'TACOM', 'TACON', 'ADCON', 'APOYO DIRECTO', 'APOYO GENERAL', 'REFUERZO']);

const T = (k, en, es, extra = {}) => ({ k, en, es, ...extra });
const tabla = (k, en, es, cols, filas = 3, extra = {}) => ({ k, en, es, tipo: 'tabla', cols, filas, ...extra });
const col = (k, en, es, extra = {}) => ({ k, en, es, ...extra });

// ---------------------------------------------------------------- OPORD de brigada (modelo de Balú)
const OPORD_BRIGADA = {
  id: 'opord-brigada', nivel: 'Brigada', nombre: 'OPORD de brigada (OTAN)', idioma: 'en',
  origen: 'Modelo de Balú (OPORD_TXT_GT.pdf)',
  nodos: [
    T('sit', 'SITUATION', 'SITUACIÓN', { hijos: [
      T('sit.ene', 'Enemy', 'Enemigo', { hijos: [
        T('sit.ene.impresion', 'General impression of enemy', 'Impresión general del enemigo'),
        T('sit.ene.conjunto', 'Overall enemy', 'Enemigo en su conjunto'),
        T('sit.ene.inicial', 'Initial enemy', 'Enemigo inicial'),
        T('sit.ene.seguimiento', 'Follow-on enemy', 'Enemigo de segundo escalón'),
        T('sit.ene.plae', 'Enemy courses of action', 'Posibles líneas de acción del enemigo (PLAE)', {
          intro: { en: 'Common to each ECOA', es: 'Comunes a todas las PLAE' },
          repetible: { en: 'ECOA {n}', es: 'PLAE {n}', n: 2 },
        }),
        T('sit.ene.futuro', 'Future enemy', 'Enemigo futuro'),
        T('sit.ene.amenazas', 'Additional threats', 'Otras amenazas'),
      ] }),
      T('sit.prop', 'Friendly forces', 'Fuerzas propias', { hijos: [
        T('sit.prop.valoracion', "Commander's assessment of friendly forces", 'Valoración del jefe sobre las fuerzas propias'),
        T('sit.prop.superior', 'Higher headquarters mission', 'Misión del escalón superior'),
        T('sit.prop.vecinos', 'Adjacent units missions', 'Misiones de las unidades vecinas'),
        T('sit.prop.aire', 'Air situation', 'Situación aérea', { hijos: [
          T('sit.prop.aire.cobertura', 'Local air cover', 'Cobertura aérea local'),
          T('sit.prop.aire.defensa', 'Air defence', 'Defensa aérea'),
        ] }),
      ] }),
      T('orgop', 'Task organization', 'Organización operativa', { tipo: 'org', hijos: [
        T('orgop.agregaciones', 'Attachments/Detachments', 'Agregaciones y segregaciones', { tipo: 'agregaciones' }),
      ] }),
      T('sit.valoracion', "Commander's assessment", 'Valoración del jefe'),
      T('sit.terreno', 'Terrain', 'Terreno'),
      T('sit.poblacion', 'Population', 'Población'),
    ] }),
    T('mision', 'MISSION', 'MISIÓN'),
    T('ejec', 'EXECUTION', 'EJECUCIÓN', { hijos: [
      T('ejec.maniobra', 'Scheme of manoeuvre', 'Esquema de maniobra', { hijos: [
        T('ejec.maniobra.descripcion', 'Description', 'Descripción'),
        T('ejec.fases', 'Phases', 'Fases', { tipo: 'fases', plano: true }),
        T('ejec.maniobra.siguiente', 'Following phase', 'Fase siguiente'),
      ] }),
      T('ejec.misiones', 'Missions to manoeuvre units', 'Misiones a las unidades de maniobra', { tipo: 'matriz' }),
      T('fuegos', 'Fires', 'Fuegos', { hijos: [
        T('fuegos.ac', 'Field artillery', 'Artillería de campaña', { hijos: [
          T('fuegos.ac.general', 'General', 'Generalidades'),
          T('fuegos.ac.articulacion', 'Articulation', 'Articulación'),
          T('fuegos.ac.fuegos', 'Fires', 'Fuegos', { tabla: 'fuegos' }),
          T('fuegos.ac.municion', 'Ammunition', 'Municiones'),
          T('fuegos.ac.varios', 'Miscellaneous', 'Varios'),
          T('fuegos.ac.refuerzos', 'Fires reinforcements', 'Refuerzos de fuegos'),
          T('fuegos.ac.inteligencia', 'Intelligence tasks', 'Cometidos de inteligencia'),
          T('fuegos.ac.adquisicion', 'Target acquisition tasks', 'Cometidos de adquisición de objetivos'),
          T('fuegos.ac.despliegue', 'Deployment', 'Despliegue'),
        ] }),
        T('fuegos.aa', 'Air defence', 'Defensa antiaérea', { hijos: [
          T('fuegos.aa.general', 'General', 'Generalidades'),
          T('fuegos.aa.articulacion', 'Articulation', 'Articulación'),
          T('fuegos.aa.apoyo', 'General support', 'Apoyo general'),
        ] }),
      ] }),
      T('ing', 'Engineering', 'Ingenieros', { hijos: [
        T('ing.mision', 'Mission', 'Misión'),
        T('ing.esfuerzo', 'Engineer effort by phase', 'Esfuerzo de ingenieros por fase', { tipo: 'matrizFases', filasFijas: [] }),
        T('ing.refuerzos', 'Reinforcements', 'Refuerzos'),
        T('ing.retenidas', 'Missions to retained units', 'Misiones a las unidades retenidas'),
        T('ing.coordinacion', 'Coordination', 'Coordinación'),
      ] }),
      T('ejec.aereos', 'Air assets', 'Medios aéreos'),
      T('ejec.ge', 'Electronic warfare', 'Guerra electrónica'),
      T('movimientos', 'Movement control', 'Control de movimientos', { hijos: [
        T('movimientos.refuerzos', 'Reinforcements', 'Refuerzos'),
        T('movimientos.capacidades', 'Subordinate unit capabilities', 'Capacidades de las unidades subordinadas'),
        T('movimientos.retenidas', 'Missions to retained units', 'Misiones a las unidades retenidas'),
        T('movimientos.coordinacion', 'Coordination', 'Coordinación'),
      ] }),
      T('coord', 'Coordinating instructions', 'Instrucciones de coordinación', { hijos: [
        T('coord.limites', 'Boundaries', 'Límites'),
        T('coord.lineas', 'Coordination lines', 'Líneas de coordinación'),
        T('coord.enlaces', 'Liaison', 'Enlaces'),
        T('coord.zonas', 'Areas', 'Zonas'),
        T('coord.nbqr', 'CBRN', 'NBQR'),
        T('coord.latta', 'LATTA/LADA', 'LATTA/LADA'),
        T('coord.cronograma', 'Timeline', 'Cronograma'),
        T('coord.info', 'Information operations', 'Operaciones de información', { tipo: 'matrizFases', filasFijas: [], cabecera: { en: 'Articulation', es: 'Articulación' } }),
        T('coord.identificacion', 'Identification', 'Identificación'),
        T('coord.permanentes', 'Elements in force in all phases', 'Elementos vigentes en todas las fases', { tipo: 'permanentes' }),
      ] }),
    ] }),
    T('log', 'ADMINISTRATION AND LOGISTICS', 'ADMINISTRACIÓN Y LOGÍSTICA', { hijos: [
      T('log.sit', 'Situation', 'Situación', { hijos: [
        T('log.sit.apoyadas', 'Supported forces', 'Fuerzas apoyadas'),
        T('log.sit.resumen', 'Technical summary', 'Resumen técnico'),
      ] }),
      T('log.mision', 'Mission', 'Misión', { hijos: [
        T('log.mision.elementos', 'Brigade logistic elements', 'Elementos logísticos de la brigada'),
        T('log.mision.finalidad', 'Purpose', 'Finalidad'),
        T('log.mision.prioridad', 'Priority', 'Prioridad'),
        T('log.mision.esfuerzo', 'Effort', 'Esfuerzo'),
      ] }),
      T('log.ejec', 'Execution', 'Ejecución', { hijos: [
        T('log.ejec.concepto', 'Concept of support', 'Concepto de apoyo'),
        T('log.ejec.capacidades', 'Brigade logistic capabilities', 'Capacidades logísticas de la brigada'),
        T('log.ejec.division', 'Division logistics', 'Logística de la división'),
        T('log.ejec.abastecimiento', 'Resupply', 'Abastecimiento'),
        T('log.ejec.mantenimiento', 'Maintenance', 'Mantenimiento'),
        T('log.ejec.sanidad', 'Medical', 'Sanidad', { anexos: ['medevac', 'medsitrep'] }),
      ] }),
      tabla('log.admin', 'Administration', 'Administración', [
        col('que', 'What', 'Qué'), col('cuando', 'When', 'Cuándo'), col('quien', 'Who', 'Quién'), col('aquien', 'To whom', 'A quién'),
      ], 5),
    ] }),
    T('mando', 'COMMAND AND SIGNAL', 'MANDO Y TRANSMISIONES', { hijos: [
      T('mando.mando', 'Command', 'Mando', { hijos: [
        T('mando.pc.org', 'CP organization', 'Organización de los puestos de mando'),
        T('mando.pc.situacion', 'CP locations', 'Situación de los puestos de mando', { tabla: 'pc' }),
        T('mando.radioenlaces', 'Radio relay manoeuvre', 'Maniobra de radioenlaces'),
        tabla('mando.destacamentos', 'CIS detachments', 'Destacamentos CIS', [
          col('tipo', 'Detachment type', 'Tipo de destacamento'), col('aporta', 'Providing force', 'Fuerza que lo aporta'),
          col('recibe', 'Receiving force', 'Fuerza que lo recibe'), col('inicio', 'Start (DTG)', 'Inicio (GDH)', { campo: 'gdh' }),
          col('fin', 'End (DTG)', 'Fin (GDH)', { campo: 'gdh' }), col('indicativo', 'Identifier', 'Indicativo'),
        ], 4),
      ] }),
      T('mando.cis', 'CIS', 'CIS', { hijos: [
        T('mando.cis.capacidades', 'CIS capabilities', 'Capacidades CIS'),
        T('mando.cis.transmisiones', 'Signal', 'Transmisiones', { tabla: 'pace' }),
      ] }),
    ] }),
  ],
  // Cierre (no estaba en el modelo; estándar OTAN, se puede quitar)
  cierre: [T('acuse', 'ACKNOWLEDGE', 'ACUSE DE RECIBO', { tipo: 'firma' }), T('anexos', 'ANNEXES', 'ANEXOS', { tipo: 'anexos' })],
};

// ---------------------------------------------------------------- OPORD de compañía (provisional, estándar de 5 párrafos)
const OPORD_COMPANIA = {
  id: 'opord-compania', nivel: 'Compañía', nombre: 'OPORD de compañía (provisional)', idioma: 'es',
  origen: 'Formato estándar de 5 párrafos, a la espera del modelo de la unidad',
  nodos: [
    T('sit', 'SITUATION', 'SITUACIÓN', { hijos: [
      T('sit.ene', 'Enemy', 'Enemigo', { hijos: [
        T('sit.ene.conjunto', 'Composition, disposition and strength', 'Composición, despliegue y entidad'),
        T('sit.ene.actividades', 'Recent activities', 'Actividades recientes'),
        T('sit.ene.plae', 'Enemy courses of action', 'Posibles líneas de acción del enemigo (PLAE)', {
          repetible: { en: 'ECOA {n}', es: 'PLAE {n}', n: 2 },
        }),
      ] }),
      T('sit.prop', 'Friendly forces', 'Fuerzas propias', { hijos: [
        T('sit.prop.superior', 'Higher headquarters mission and intent', 'Misión e intención del escalón superior'),
        T('sit.prop.vecinos', 'Adjacent units missions', 'Misiones de las unidades vecinas'),
        T('sit.prop.apoyos', 'Supporting units', 'Unidades en apoyo'),
      ] }),
      T('orgop', 'Task organization', 'Organización operativa', { tipo: 'org', hijos: [
        T('orgop.agregaciones', 'Attachments/Detachments', 'Agregaciones y segregaciones', { tipo: 'agregaciones' }),
      ] }),
      T('sit.terreno', 'Terrain and weather', 'Terreno y meteorología'),
    ] }),
    T('mision', 'MISSION', 'MISIÓN'),
    T('ejec', 'EXECUTION', 'EJECUCIÓN', { hijos: [
      T('ejec.intencion', "Commander's intent", 'Intención del jefe'),
      T('ejec.maniobra', 'Concept of operations', 'Concepto de la operación', { hijos: [
        T('ejec.maniobra.descripcion', 'Description', 'Descripción'),
        T('ejec.fases', 'Phases', 'Fases', { tipo: 'fases', plano: true }),
      ] }),
      T('ejec.misiones', 'Tasks to subordinate units', 'Cometidos a las unidades subordinadas', { tipo: 'matriz' }),
      T('fuegos', 'Fire support', 'Apoyos de fuego', { tabla: 'fuegos' }),
      T('coord', 'Coordinating instructions', 'Instrucciones de coordinación', { hijos: [
        T('coord.cronograma', 'Timeline', 'Horario'),
        T('coord.limites', 'Boundaries', 'Límites'),
        T('coord.lineas', 'Coordination lines', 'Líneas de coordinación'),
        T('coord.roe', 'Rules of engagement', 'Reglas de enfrentamiento'),
        T('coord.permanentes', 'Elements in force in all phases', 'Elementos vigentes en todas las fases', { tipo: 'permanentes' }),
      ] }),
    ] }),
    T('log', 'SUSTAINMENT', 'APOYO LOGÍSTICO', { hijos: [
      T('log.ejec.abastecimiento', 'Supply', 'Abastecimiento'),
      T('log.ejec.mantenimiento', 'Maintenance', 'Mantenimiento'),
      T('log.ejec.sanidad', 'Medical', 'Sanidad', { anexos: ['medevac'] }),
      T('log.personal', 'Personnel', 'Personal'),
    ] }),
    T('mando', 'COMMAND AND SIGNAL', 'MANDO Y TRANSMISIONES', { hijos: [
      T('mando.mando', 'Command', 'Mando', { hijos: [
        T('mando.pc.situacion', 'CP locations', 'Situación del puesto de mando', { tabla: 'pc' }),
        T('mando.sucesion', 'Succession of command', 'Sucesión en el mando'),
      ] }),
      T('mando.cis.transmisiones', 'Signal', 'Transmisiones', { tabla: 'pace' }),
    ] }),
  ],
  cierre: [T('acuse', 'ACKNOWLEDGE', 'ACUSE DE RECIBO', { tipo: 'firma' }), T('anexos', 'ANNEXES', 'ANEXOS', { tipo: 'anexos' })],
};

// ---------------------------------------------------------------- tablas que se pueden meter en cualquier apartado
export const TABLAS = Object.freeze({
  fuegos: { en: 'Fire plan', es: 'Plan de fuegos', cols: [
    col('obj', 'Target', 'Objetivo'), col('desc', 'Description', 'Descripción'), col('pos', 'Location (MGRS)', 'Situación (MGRS)', { campo: 'mgrs' }),
    col('fase', 'Phase', 'Fase', { campo: 'fase' }), col('unidad', 'Firing unit', 'Unidad que tira'), col('municion', 'Ammunition', 'Munición'), col('obs', 'Remarks', 'Observaciones'),
  ], filas: 4 },
  pace: { en: 'PACE plan', es: 'Plan PACE', cols: [
    col('red', 'Net', 'Red'), col('p', 'Primary', 'Principal'), col('a', 'Alternate', 'Alternativo'),
    col('c', 'Contingency', 'Contingencia'), col('e', 'Emergency', 'Emergencia'),
  ], filas: 3 },
  pc: { en: 'CP locations', es: 'Puestos de mando', cols: [
    col('pc', 'CP', 'PC'), col('pos', 'Location (MGRS)', 'Situación (MGRS)', { campo: 'mgrs' }),
    col('desde', 'From (DTG)', 'Desde (GDH)', { campo: 'gdh' }), col('hasta', 'To (DTG)', 'Hasta (GDH)', { campo: 'gdh' }),
  ], filas: 3 },
  libre: { en: 'Table', es: 'Tabla', cols: [col('c1', 'Column 1', 'Columna 1'), col('c2', 'Column 2', 'Columna 2'), col('c3', 'Column 3', 'Columna 3')], filas: 3 },
});

// ---------------------------------------------------------------- anexos
const CATEGORIAS_MED = Object.freeze([
  { en: 'Coalition forces', es: 'Fuerzas de la coalición' }, { en: 'Local forces', es: 'Fuerzas locales' },
  { en: 'Opposing forces / detainees', es: 'Fuerzas enemigas / detenidos' }, { en: 'Population', es: 'Población' },
  { en: 'IO, NGO', es: 'OI, ONG' }, { en: 'Other', es: 'Otros' },
]);
/** Tabla de bajas por categoría (D, NBI, WIA, BS y total), con totales automáticos. */
const tablaBajas = (k, en, es) => ({
  k, en, es, tipo: 'tabla', totales: true,
  cols: [col('cat', 'Category', 'Categoría'), col('d', 'D', 'D', { campo: 'numero' }), col('nbi', 'NBI', 'NBI', { campo: 'numero' }),
    col('wia', 'WIA', 'WIA', { campo: 'numero' }), col('bs', 'BS', 'BS', { campo: 'numero' })],
  filasFijas: CATEGORIAS_MED,
});
const campo = (k, en, es, extra = {}) => ({ k, en, es, ...extra });

export const ANEXOS = Object.freeze({
  libre: { id: 'libre', nombre: 'Anexo en blanco', en: 'Annex', es: 'Anexo', nodos: [T('anx.texto', 'Content', 'Contenido')] },
  fuegos: { id: 'fuegos', nombre: 'Plan de fuegos', en: 'Fire support plan', es: 'Plan de apoyo de fuegos', nodos: [
    T('anx.fuegos.concepto', 'Concept of fires', 'Concepto de los fuegos'),
    { ...TABLAS.fuegos, k: 'anx.fuegos.lista', en: 'Target list', es: 'Lista de objetivos', tipo: 'tabla' },
  ] },
  pace: { id: 'pace', nombre: 'Plan PACE', en: 'PACE plan', es: 'Plan PACE', nodos: [
    { ...TABLAS.pace, k: 'anx.pace.tabla', tipo: 'tabla' },
    T('anx.pace.notas', 'Remarks', 'Observaciones'),
  ] },
  medevac: { id: 'medevac', nombre: 'MEDEVAC 9 líneas', en: 'Emergency MEDEVAC request (9-line)', es: 'Petición MEDEVAC de urgencia (9 líneas)', nodos: [
    { k: 'anx.medevac', en: 'MEDEVAC «9-lines» request', es: 'Petición MEDEVAC «9 líneas»', tipo: 'formulario', campos: [
      campo('gdh', 'DTG', 'GDH', { campo: 'gdh' }), campo('unidad', 'Unit', 'Unidad'),
      campo('l1', '1 · Location (grid of pickup zone)', '1 · Situación (coordenadas de la zona de recogida)', { campo: 'mgrs' }),
      campo('l2', '2 · Callsign & frequency', '2 · Indicativo y frecuencia'),
      campo('l3', '3 · Number of patients / precedence', '3 · Número de heridos / precedencia', { cuentas: [
        { k: 'a', en: 'A · Urgent', es: 'A · Urgente' }, { k: 'b', en: 'B · Priority', es: 'B · Prioritario' }, { k: 'c', en: 'C · Routine', es: 'C · Rutinario' }] }),
      campo('l4', '4 · Special equipment required', '4 · Equipo especial necesario', { marcas: [
        { k: 'a', en: 'A · None', es: 'A · Ninguno' }, { k: 'b', en: 'B · Hoist (winch)', es: 'B · Grúa' },
        { k: 'c', en: 'C · Extraction', es: 'C · Extracción' }, { k: 'd', en: 'D · Ventilator', es: 'D · Respirador' }] }),
      campo('l5', '5 · Number to be carried lying / sitting', '5 · Número de heridos en camilla / sentados', { cuentas: [
        { k: 'l', en: 'L · Litter', es: 'L · Camilla' }, { k: 'a', en: 'A · Ambulatory', es: 'A · Andando' }, { k: 'e', en: 'E · Escorts', es: 'E · Acompañantes' }] }),
      campo('l6', '6 · Security at pickup zone', '6 · Seguridad en la zona de recogida', { opciones: [
        { k: 'N', en: 'N · No enemy', es: 'N · Sin enemigo' }, { k: 'P', en: 'P · Possible enemy', es: 'P · Posible enemigo' },
        { k: 'E', en: 'E · Enemy in area', es: 'E · Enemigo en la zona' }, { k: 'X', en: 'X · Hot PZ – armed escort required', es: 'X · Zona caliente – escolta armada' }] }),
      campo('l7', '7 · Pickup zone marking method', '7 · Señalización de la zona de recogida', { opciones: [
        { k: 'A', en: 'A · Panels', es: 'A · Paneles' }, { k: 'B', en: 'B · Pyro', es: 'B · Pirotecnia' }, { k: 'C', en: 'C · Smoke', es: 'C · Humo' },
        { k: 'D', en: 'D · None', es: 'D · Ninguna' }, { k: 'E', en: 'E · Other', es: 'E · Otra' }] }),
      campo('l8', '8 · Number of patients by nationality/status', '8 · Número de heridos por nacionalidad/condición', { cuentas: [
        { k: 'a', en: 'A · Coalition military', es: 'A · Militar de la coalición' }, { k: 'b', en: 'B · Civilian with coalition forces', es: 'B · Civil con la coalición' },
        { k: 'c', en: 'C · Non-coalition security forces', es: 'C · Fuerzas de seguridad ajenas' }, { k: 'd', en: 'D · Non-coalition civilian', es: 'D · Civil ajeno' },
        { k: 'e', en: 'E · Opposing forces/PW/detainee', es: 'E · Enemigo/prisionero/detenido' }, { k: 'f', en: 'F · Child', es: 'F · Niño' }] }),
      campo('l9', '9 · Pickup zone terrain / obstacles', '9 · Terreno y obstáculos de la zona de recogida'),
      campo('m', 'M · Mechanism of injury (and time if known)', 'M · Mecanismo de la lesión (y hora si se sabe)'),
      campo('i', 'I · Injury or illness sustained', 'I · Lesión o enfermedad'),
      campo('s', 'S · Symptoms and vital signs', 'S · Síntomas y constantes vitales'),
      campo('t', 'T · Treatment given', 'T · Tratamiento aplicado'),
      campo('notas', 'Notes', 'Notas', { largo: true }),
    ] },
  ] },
  medsitrep: { id: 'medsitrep', nombre: 'MEDSITREP', en: 'Medical situation report (MEDSITREP)', es: 'Parte de situación sanitaria (MEDSITREP)', nodos: [
    { k: 'anx.medsitrep.id', en: 'Report ID', es: 'Identificación del parte', tipo: 'formulario', campos: [
      campo('indicador', 'Unit reporting indicator', 'Indicativo de la unidad'), campo('superior', 'Superior unit', 'Unidad superior'),
      campo('nacionalidad', 'Nationality', 'Nacionalidad'),
      campo('tipo', 'Type of unit reporting', 'Tipo de unidad', { marcas: ['R3', 'R2E', 'R2B/LM', 'CSU', 'CDU', 'MLC', 'JTF'].map((x) => ({ k: x, en: x, es: x })) }),
      campo('situacion', 'Location of medical facilities', 'Situación de las instalaciones sanitarias', { campo: 'mgrs' }),
      campo('gdh', 'Effective DTG of report', 'GDH del parte', { campo: 'gdh' }), campo('r1', 'Number of R1 supported by R2', 'R1 apoyados por el R2'),
      campo('contacto', 'Operational point of contact', 'Punto de contacto'), campo('telefono', 'Phone', 'Teléfono'),
    ] },
    { k: 'anx.medsitrep.camas', en: 'Beds', es: 'Camas', tipo: 'formulario', campos: [
      campo('est_uci', 'Established – ICU', 'Instaladas – UCI', { campo: 'numero' }), campo('est_ob', 'Established – ordinary beds', 'Instaladas – ordinarias', { campo: 'numero' }),
      campo('ocu_uci', 'Occupied – ICU', 'Ocupadas – UCI', { campo: 'numero' }), campo('ocu_ob', 'Occupied – ordinary beds', 'Ocupadas – ordinarias', { campo: 'numero' }),
    ], hijos: [tablaBajas('anx.medsitrep.reparto', 'Repartition', 'Reparto')] },
    T('anx.medsitrep.personal', 'Medical personnel', 'Personal sanitario'),
    T('anx.medsitrep.cirugia', 'Surgical operations', 'Intervenciones quirúrgicas', { hijos: [
      tablaBajas('anx.medsitrep.operados', 'Patients operated since the last MEDSITREP', 'Operados desde el último MEDSITREP'),
      tablaBajas('anx.medsitrep.espera', 'Patients awaiting surgery', 'Pendientes de cirugía'),
    ] }),
    { ...tablaBajas('anx.medsitrep.ingresos', 'Patients admitted', 'Ingresos'), intro: { en: 'Since the last MEDSITREP', es: 'Desde el último MEDSITREP' } },
    T('anx.medsitrep.evac', 'Evacuations', 'Evacuaciones', { hijos: [
      tablaBajas('anx.medsitrep.evacuados', 'Patients evacuated since the last MEDSITREP', 'Evacuados desde el último MEDSITREP'),
      { k: 'anx.medsitrep.destino', en: 'Future of the evacuated patients', es: 'Destino de los evacuados', tipo: 'formulario', campos: [
        campo('servicio', 'Back to duty', 'Vuelta al servicio', { campo: 'numero' }), campo('tacevac', 'TACEVAC', 'TACEVAC', { campo: 'numero' }),
        campo('stratevac', 'STRATEVAC', 'STRATEVAC', { campo: 'numero' }), campo('otros', 'Other', 'Otros', { campo: 'numero' }),
      ] },
      { ...tablaBajas('anx.medsitrep.esperaevac', 'Patients awaiting evacuation', 'Pendientes de evacuación'), formularioPrevio: [
        campo('sentados', 'Sitting', 'Sentados', { campo: 'numero' }), campo('camilla', 'Stretchers', 'En camilla', { campo: 'numero' })] },
    ] }),
    tablaBajas('anx.medsitrep.consultas', 'Consultations (not admitted)', 'Consultas (sin ingreso)'),
    tablaBajas('anx.medsitrep.fallecidos', 'Deaths since the last MEDSITREP', 'Fallecidos desde el último MEDSITREP'),
    { k: 'anx.medsitrep.medios', en: 'Medical assets evolution', es: 'Evolución de los medios sanitarios', tipo: 'formulario', campos: [
      campo('fw', 'Evacuation assets – fixed wing', 'Medios de evacuación – ala fija'), campo('rw', 'Evacuation assets – rotary wing', 'Medios de evacuación – ala rotatoria'),
      campo('amb', 'Evacuation assets – ground ambulances', 'Medios de evacuación – ambulancias'),
      campo('sangre', 'Blood and pharmaceutical supplies', 'Sangre y farmacia'), campo('equipo', 'Medical equipment logistic', 'Material sanitario'),
    ] },
    T('anx.medsitrep.enfermedades', 'Special diseases / injuries', 'Enfermedades o lesiones especiales'),
    { k: 'anx.medsitrep.valoracion', en: 'Mission assessment', es: 'Valoración de la misión', tipo: 'formulario', campos: [
      campo('valor', 'Assessment', 'Valoración', { opciones: [
        { k: 'MA', en: 'MA · Mission can be fulfilled', es: 'MA · La misión se puede cumplir' },
        { k: 'MB', en: 'MB · Can be fulfilled with restrictions', es: 'MB · Se puede cumplir con restricciones' },
        { k: 'MC', en: "MC · Mission can't be fulfilled", es: 'MC · No se puede cumplir' }] }),
      campo('detalles', 'Details in case of MB or MC', 'Detalles si es MB o MC', { largo: true }),
      campo('observaciones', 'Remarks', 'Observaciones', { largo: true }),
    ] },
  ] },
});

export const PLANTILLAS = Object.freeze({ [OPORD_BRIGADA.id]: OPORD_BRIGADA, [OPORD_COMPANIA.id]: OPORD_COMPANIA });

/** Tipos de bloque que el usuario puede añadir en cualquier sitio. */
export const BLOQUES = Object.freeze({
  texto: { nombre: 'Apartado de texto' },
  tabla: { nombre: 'Tabla' },
  fuegos: { nombre: 'Tabla de fuegos' },
  pace: { nombre: 'Plan PACE' },
  pc: { nombre: 'Puestos de mando' },
  matrizFases: { nombre: 'Tabla por fases' },
});

/** Todas las claves de una plantilla (para pruebas y para pasar contenidos). */
export function clavesDe(pl) {
  const out = [];
  const rec = (ns) => { for (const n of ns ?? []) { out.push(n.k); rec(n.hijos); } };
  rec(pl.nodos); rec(pl.cierre);
  return out;
}
