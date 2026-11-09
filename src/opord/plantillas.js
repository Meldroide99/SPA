// Plantillas de OPORD y de anexos.
//
// La OPORD de brigada sale del modelo de Balú (OPORD_TXT_GT.pdf, 17 págs.):
// se ha sacado la estructura y se ha desechado el contenido (todo ficticio).
// Corregido respecto al original: títulos que estaban partidos o montados
// unos sobre otros, numeración repetida («a. A. Enemy»), erratas
// («headquartes», «DEPHT», «POSITIONNAL», «Genera»), tablas con cabeceras
// cortadas y los formularios MEDEVAC y MEDSITREP, que iban pegados como
// imagen en mitad del 4.c.(6): no son parte de la OPORD y se han quitado.
//
// Cada nodo:
//   k      clave estable: con ella se pasa el contenido de una plantilla a otra
//   en, es título en inglés y en castellano (el documento elige el idioma)
//   tipo   'texto' (por defecto) · 'tabla' · 'org' · 'agregaciones' · 'fases'
//          · 'matriz' · 'matrizFases' · 'permanentes' · 'anexos' · 'firma'
//          · 'formulario' · 'imagen' (calco o foto pegada)
//   etiqueta  sin número: sale como «ETIQUETA: texto» (MLCOA:, En espacio:…); color = color de la etiqueta
//   nota   texto corto que sigue al título («(según matriz)»)
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

/**
 * Color del cuadro de cada clasificación (como el cuadro rojo de «RESTRICTED» del modelo de Balú).
 * Las normas de la Autoridad Nacional no fijan colores: se sigue la costumbre OTAN/EE. UU. (provisional).
 */
export const COLORES_CLASIF = Object.freeze({
  'SIN CLASIFICAR': '#2E7D32', 'NATO UNCLASSIFIED': '#2E7D32',
  EJERCICIO: '#5B6573',
  'DIFUSIÓN LIMITADA': '#C8102E', RESTRICTED: '#C8102E', 'NATO RESTRICTED': '#C8102E',
  CONFIDENCIAL: '#1F4E9A', 'NATO CONFIDENTIAL': '#1F4E9A',
  RESERVADO: '#E07B00',
  SECRETO: '#6A1B9A', 'NATO SECRET': '#6A1B9A',
});
export const colorClasificacion = (c) => COLORES_CLASIF[String(c ?? '').trim().toUpperCase()] ?? '#5B6573';

/** Relaciones de mando (AJP-3.2 / PD3-001). */
export const RELACIONES = Object.freeze(['OPCOM', 'OPCON', 'TACOM', 'TACON', 'ADCON', 'APOYO DIRECTO', 'APOYO GENERAL', 'REFUERZO']);

const T = (k, en, es, extra = {}) => ({ k, en, es, ...extra });
const tabla = (k, en, es, cols, filas = 3, extra = {}) => ({ k, en, es, tipo: 'tabla', cols, filas, ...extra });
const col = (k, en, es, extra = {}) => ({ k, en, es, ...extra });

// ---------------------------------------------------------------- OPORD de brigada (modelo de Balú)
const OPORD_BRIGADA = {
  id: 'opord-brigada', nivel: 'Brigada', nombre: 'OPORD de brigada (OTAN)', idioma: 'en',
  origen: 'Modelo de Balú (OPORD_TXT_GT.pdf)', letra: 'Tahoma',
  nodos: [
    T('sit', 'SITUATION', 'SITUACIÓN', { hijos: [
      T('sit.ene', 'Enemy', 'Enemigo', { hijos: [
        T('sit.ene.impresion', 'General impression of enemy', 'Impresión general del enemigo'),
        T('sit.ene.conjunto', 'Overall enemy', 'Enemigo en su conjunto'),
        T('sit.ene.inicial', 'Initial enemy', 'Enemigo inicial'),
        T('sit.ene.seguimiento', 'Follow-on enemy', 'Enemigo de segundo escalón'),
        T('sit.ene.plae', 'Enemy courses of action', 'Posibles líneas de acción del enemigo (PLAE)', {
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
        T('log.ejec.sanidad', 'Medical', 'Sanidad'),
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
          col('recibe', 'Receiving force', 'Fuerza que lo recibe'), col('inicio', 'Start (DTG)', 'Inicio (GFH)', { campo: 'gdh' }),
          col('fin', 'End (DTG)', 'Fin (GFH)', { campo: 'gdh' }), col('indicativo', 'Identifier', 'Indicativo'),
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
  origen: 'Formato estándar de 5 párrafos', letra: 'Arial',
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
      T('log.ejec.sanidad', 'Medical', 'Sanidad'),
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

// ---------------------------------------------------------------- OPORD de compañía en una hoja (modelos de Balú)
// OPORD_NIVEL_CIA_SOLO.pdf y OPORD_NIVEL_CIA.pdf: el mismo formato, una hoja A4 en
// cuadrícula. Arriba situación (izquierda) y misión y ejecución (derecha); en medio
// el calco con coordinación, logística, mando e ingenieros al lado; fuegos a lo
// ancho y abajo la organización operativa (gráfica) y la matriz de cometidos.
const OPORD_CIA_HOJA = {
  id: 'opord-cia-hoja', nivel: 'Compañía', nombre: 'OPORD de compañía en una hoja', idioma: 'es',
  origen: 'Modelos de Balú (OPORD_NIVEL_CIA)', letra: 'Arial', disposicion: 'hoja', rotulos: 'mayusculas',
  fase: { en: 'Bound', es: 'Salto', desde: 1 }, posterior: { en: 'Subsequently', es: 'Posteriormente' },
  nodos: [
    T('sit', 'SITUATION', 'SITUACIÓN', { hijos: [
      T('sit.ene', 'ENEMY FORCES', 'FUERZAS ENEMIGAS', { etiqueta: true }),
      T('sit.ene.mlcoa', 'MLCOA', 'MLCOA', { etiqueta: true, color: '#C8102E' }),
      T('sit.ene.mdcoa', 'MDCOA', 'MDCOA', { etiqueta: true, color: '#C8102E' }),
    ] }),
    T('mision', 'MISSION', 'MISIÓN'),
    T('ejec', 'EXECUTION', 'EJECUCIÓN', { hijos: [
      T('ejec.intencion', 'Purpose', 'Propósito'),
      T('ejec.maniobra', 'Concept of operations', 'Concepto de la operación', { hijos: [
        T('ejec.fases', 'Bounds', 'Saltos', { tipo: 'fases', plano: true, etiquetas: true }),
        T('ejec.maniobra.siguiente', 'Subsequently', 'Posteriormente', { etiqueta: true, vineta: true }),
      ] }),
      T('ejec.misiones', 'Missions and tasks to subordinate units', 'Misiones y cometidos a unidades subordinadas', {
        tipo: 'matriz', nota: { en: '(see matrix)', es: '(según matriz)' }, tituloTabla: { en: 'TASK MATRIX', es: 'MATRIZ DE COMETIDOS' },
      }),
      T('coord', 'Coordinating instructions', 'Instrucciones de coordinación', { hijos: [
        T('coord.espacio', 'IN SPACE', 'EN ESPACIO', { etiqueta: true }),
        T('coord.tiempo', 'IN TIME', 'EN TIEMPO', { etiqueta: true }),
      ] }),
    ] }),
    T('log', 'LOGISTICS', 'LOGÍSTICA'),
    T('mando', 'COMMAND AND CONTROL', 'MANDO Y CONTROL'),
    T('ing', 'ENGINEERS', 'INGENIEROS', { sinNumero: true }),
    T('fuegos', 'FIRES', 'FUEGOS', { sinNumero: true }),
    T('ejec.calco', 'Operation overlay', 'Calco de la operación', { tipo: 'imagen', sinNumero: true }),
    T('orgop', 'TASK ORGANIZATION', 'ORGANIZACIÓN OPERATIVA', { tipo: 'org', sinNumero: true }),
  ],
  // Filas de la hoja: cada columna con su ancho (fracción) y los apartados que lleva.
  // «clave:tabla» = solo la tabla de ese apartado (su título se queda donde está).
  hoja: [
    [{ w: 0.5, k: ['sit'] }, { w: 0.5, k: ['mision', 'ejec'] }],
    [{ w: 0.78, k: ['ejec.calco'] }, { w: 0.22, k: ['coord', 'log', 'mando', 'ing'] }],
    [{ w: 1, k: ['fuegos'] }],
    [{ w: 0.4, k: ['orgop'] }, { w: 0.6, k: ['ejec.misiones:tabla'] }],
  ],
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
    col('desde', 'From (DTG)', 'Desde (GFH)', { campo: 'gdh' }), col('hasta', 'To (DTG)', 'Hasta (GFH)', { campo: 'gdh' }),
  ], filas: 3 },
  libre: { en: 'Table', es: 'Tabla', cols: [col('c1', 'Column 1', 'Columna 1'), col('c2', 'Column 2', 'Columna 2'), col('c3', 'Column 3', 'Columna 3')], filas: 3 },
});

// ---------------------------------------------------------------- anexos
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
});

export const PLANTILLAS = Object.freeze({ [OPORD_BRIGADA.id]: OPORD_BRIGADA, [OPORD_COMPANIA.id]: OPORD_COMPANIA, [OPORD_CIA_HOJA.id]: OPORD_CIA_HOJA });

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
