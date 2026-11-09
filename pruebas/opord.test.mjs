// Pruebas de la OPORD: plantillas, numeración, fases, cambios de varios usuarios,
// paso de una plantilla a otra y exportación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearOpord, crearOpordCompleta, crearAnexo, enlazarAnexo, letraAnexo, numerar, recorrer, titulo, porClave,
  sincronizarFases, fasesDe, tituloFase, editar, fusionar, anadirNodo, anadirRepetido, quitarNodo, moverNodo, deshacer,
  cambiarPlantilla, unidadesManiobra, agregacionesAuto, orgEnLineas, htmlALineas, limpiarHtml, gdh, esGdh, normalizarGdh,
  tituloDocumento, conContenido, cambiosDesde,
} from '../src/opord/documento.js';
import { PLANTILLAS, ANEXOS, clavesDe } from '../src/opord/plantillas.js';
import { aTexto, aDocx, aXlsx, aPdf } from '../src/opord/exportar.js';

const rotulos = (doc) => { const n = numerar(doc); const out = {}; recorrer(doc, (x) => { out[x.k] = n.get(x.id)?.rotulo; }); return out; };

test('Plantillas: claves únicas y títulos en los dos idiomas', () => {
  for (const pl of [...Object.values(PLANTILLAS), ...Object.values(ANEXOS)]) {
    const ks = clavesDe(pl);
    assert.equal(new Set(ks).size, ks.length, `claves repetidas en ${pl.id}`);
    const rec = (ns) => { for (const n of ns ?? []) { assert.ok(n.en && n.es, `${pl.id}: ${n.k} sin título`); rec(n.hijos); } };
    rec(pl.nodos);
  }
});

test('OPORD de brigada: estructura y numeración OTAN como el modelo (corregida)', () => {
  const d = crearOpord('opord-brigada', { idioma: 'en' });
  const r = rotulos(d);
  assert.equal(r.sit, '1.'); assert.equal(r.mision, '2.'); assert.equal(r.ejec, '3.'); assert.equal(r.log, '4.'); assert.equal(r.mando, '5.');
  assert.equal(r['sit.ene'], 'a.'); assert.equal(r['sit.ene.plae'], '(5)'); assert.equal(r['sit.ene.plae.1'], '(a)'); assert.equal(r['sit.ene.amenazas'], '(7)');
  assert.equal(r.orgop, 'c.'); assert.equal(r['orgop.agregaciones'], '(1)'); assert.equal(r['sit.poblacion'], 'f.');
  assert.equal(r['fuegos.ac.despliegue'], '(i)'); assert.equal(r['coord.identificacion'], '(9)'); assert.equal(r['log.ejec.sanidad'], '(6)');
  assert.equal(r['mando.cis.transmisiones'], '(2)'); assert.equal(r.acuse, '');
  assert.equal(titulo(porClave(d, 'sit.prop.superior'), 'en'), 'Higher headquarters mission'); // «headquartes» corregido
});

test('Las fases de la operación se numeran seguidas entre «Descripción» y «Fase siguiente»', () => {
  const ops = [{ id: 'op', padre: null }, { id: 'f0', padre: 'op', nombre: 'Infiltración', inicio: '031500Z MAY 26', fin: '050900Z MAY 26' }, { id: 'f1', padre: 'op', nombre: 'Recce to Neman' }];
  const d = crearOpord('opord-brigada', { operacion: 'op', idioma: 'en' });
  assert.equal(sincronizarFases(d, ops), true);
  const r = rotulos(d);
  assert.equal(r['ejec.maniobra.descripcion'], '(1)'); assert.equal(r['fase:f0'], '(2)'); assert.equal(r['fase:f1'], '(3)'); assert.equal(r['ejec.maniobra.siguiente'], '(4)');
  assert.equal(tituloFase(fasesDe(ops, 'op')[0], 'en'), 'Step 0: INFILTRACIÓN 031500Z MAY 26 – 050900Z MAY 26');
  // Se borra una fase: su texto no se pierde
  const f1 = porClave(d, 'fase:f1'); editar(d, f1.id, 'texto', '<p>Reconocer</p>');
  assert.equal(sincronizarFases(d, ops.filter((o) => o.id !== 'f1')), true);
  assert.equal(d.nodos[f1.id].huerfano, true);
  assert.equal(sincronizarFases(d, ops.filter((o) => o.id !== 'f1')), false, 'segunda vez: nada que hacer');
});

test('Dos usuarios editan a la vez: en cada campo gana el último y nada se duplica', () => {
  const a = crearOpord('opord-compania', { autor: 'A' });
  const b = JSON.parse(JSON.stringify(a));
  const m = porClave(a, 'mision').id;
  const t = porClave(a, 'sit.terreno').id;
  const c1 = editar(a, m, 'texto', 'Misión de A', 'A');
  const c2 = editar(b, m, 'texto', 'Misión de B', 'B');
  const c3 = editar(b, m, 'texto', 'Misión de B (2)', 'B');
  const c4 = editar(a, t, 'texto', 'Terreno de A', 'A');
  assert.equal(fusionar(a, [c2, c3]), 2);
  assert.equal(fusionar(b, [c1, c4]), 1); // c1 llega tarde (reloj 1 < 2): no pisa
  assert.equal(a.nodos[m].texto, 'Misión de B (2)'); assert.equal(b.nodos[m].texto, 'Misión de B (2)');
  assert.equal(b.nodos[t].texto, 'Terreno de A');
  assert.equal(fusionar(a, [c2, c3]), 0, 'repetidos: se ignoran');
  assert.equal(cambiosDesde(a, 0).length, 4); assert.equal(cambiosDesde(a, 1).length, 2);
});

test('Añadir, quitar, mover y deshacer apartados', () => {
  const d = crearOpord('opord-compania');
  const sit = porClave(d, 'sit');
  const n = anadirNodo(d, { padre: sit.id, titulo: 'Meteorología' });
  assert.ok(sit.hijos.includes(n.id));
  const antes = [...sit.hijos];
  moverNodo(d, n.id, -1);
  assert.notDeepEqual(sit.hijos, antes);
  const q = quitarNodo(d, n.id);
  assert.equal(d.nodos[n.id].quitado, true);
  deshacer(d, q);
  assert.equal(d.nodos[n.id].quitado, null);
  const plae = porClave(d, 'sit.ene.plae');
  const h = anadirRepetido(d, plae.id);
  assert.equal(titulo(h, 'es'), 'PLAE 3');
});

test('Organización operativa: unidades de maniobra, agregaciones automáticas y árbol', () => {
  const d = crearOpord('opord-brigada');
  const org = porClave(d, 'orgop');
  org.org.unidades = [
    { id: 'b', nombre: '6 BLB', padre: null }, { id: 'g', nombre: 'GC', padre: 'b' }, { id: 's', nombre: 'SGR', padre: 'b' },
    { id: 'e', nombre: 'EFA PLATOON', padre: 's', de: '31 REG', relacion: 'TACON', inicio: '031500Z MAY 26' }, { id: 'x', nombre: 'Reserva', padre: 'b', enMatriz: false },
  ];
  assert.deepEqual(unidadesManiobra(d).map((u) => u.nombre), ['GC', 'SGR']);
  const ag = agregacionesAuto(d);
  assert.equal(ag.length, 1); assert.equal(ag[0].c.a, 'SGR'); assert.equal(ag[0].c.relacion, 'TACON');
  assert.deepEqual(orgEnLineas(d).map((l) => `${l.nivel}${l.texto}`), ['06 BLB', '1GC', '1SGR', '2EFA PLATOON (TACON, de 31 REG)', '1Reserva']);
});

test('Cambiar de plantilla: pasa lo que encaja y lo demás va a «Sin sitio»', () => {
  const { opord: d } = crearOpordCompleta('opord-brigada', { nombre: 'WINGO3', numero: '01' });
  editar(d, porClave(d, 'mision').id, 'texto', '<p>Cruzar el río</p>');
  editar(d, porClave(d, 'sit.ene.impresion').id, 'texto', '<p>Débil</p>'); // no existe en compañía
  const sit = porClave(d, 'sit');
  const propio = anadirNodo(d, { padre: sit.id, titulo: 'Apartado mío' }); editar(d, propio.id, 'texto', 'hola');
  porClave(d, 'orgop').org.unidades = [{ id: 'u', nombre: 'GC', padre: null }];
  const c = cambiarPlantilla(d, 'opord-compania');
  assert.equal(c.id, d.id); assert.equal(c.plantilla, 'opord-compania'); assert.deepEqual(c.anexos, d.anexos);
  assert.equal(porClave(c, 'mision').texto, '<p>Cruzar el río</p>');
  assert.equal(porClave(c, 'orgop').org.unidades[0].nombre, 'GC');
  const sobr = porClave(c, '__sobrantes');
  assert.ok(sobr, 'hay apartado de sobrantes');
  const titulos = sobr.hijos.map((id) => titulo(c.nodos[id], 'es'));
  assert.ok(titulos.includes('Impresión general del enemigo'));
  assert.ok(Object.values(c.nodos).some((n) => n.titulo === 'Apartado mío' && n.texto === 'hola'), 'lo añadido a mano viaja con su padre');
  // Y de vuelta: nada se pierde
  const v = cambiarPlantilla(c, 'opord-brigada');
  assert.equal(porClave(v, 'mision').texto, '<p>Cruzar el río</p>');
});

test('Anexos enlazados en los dos sentidos, con letra', () => {
  const { opord, anexos } = crearOpordCompleta('opord-brigada', { numero: '01', nombre: 'WINGO3' });
  assert.equal(anexos.length, 0, 'MEDEVAC y MEDSITREP no son parte de la OPORD');
  const f = crearAnexo('fuegos'); enlazarAnexo(opord, f, { nodo: porClave(opord, 'fuegos').id });
  const p = crearAnexo('pace'); enlazarAnexo(opord, p);
  assert.equal(f.padre, opord.id); assert.equal(letraAnexo(opord, p.id), 'B');
  assert.ok(porClave(opord, 'fuegos').enlaces.includes(f.id));
  assert.match(tituloDocumento(p, opord), /^ANNEX B TO OPORD 01 – WINGO3/);
  assert.equal(porClave(opord, 'sit.ene.plae').intro, undefined, 'sin «Comunes a todas las PLAE»');
});

test('Texto, GDH y limpieza de HTML', () => {
  assert.deepEqual(htmlALineas('<p>Uno <b>dos</b></p><ul><li>a</li><li>b</li></ul><p>tres&nbsp;y &amp; 4</p>'), ['Uno dos', '• a', '• b', 'tres y & 4']);
  assert.equal(limpiarHtml('<p style="x">Hola <span>a</span><script>alert(1)</script><b onclick="x">b</b></p>'), '<p>Hola a<b>b</b></p>');
  assert.equal(gdh(Date.UTC(2026, 4, 3, 15, 0)), '031500Z MAY 26');
  assert.ok(esGdh('031500Z MAY 26')); assert.ok(esGdh('290930ZAPR26')); assert.ok(!esGdh('321500Z MAY 26'));
  assert.equal(normalizarGdh('290930zapr26'), '290930Z APR 26');
  assert.ok(!conContenido(porClave(crearOpord('opord-compania'), 'mision')));
});

test('Exportar: TXT, Word, Excel y PDF bien formados', async () => {
  const { opord } = crearOpordCompleta('opord-brigada', { numero: '01', nombre: 'WINGO3' });
  const anexos = [crearAnexo('fuegos')]; enlazarAnexo(opord, anexos[0], { nodo: porClave(opord, 'fuegos').id });
  editar(opord, porClave(opord, 'mision').id, 'texto', '<p>Cruzar el río NEMAN con ñ y tildes: áéíóú.</p>');
  porClave(opord, 'orgop').org.unidades = [{ id: 'b', nombre: '6 BLB', padre: null }, { id: 'g', nombre: 'GC', padre: 'b' }];
  const ctx = { anexos, paquetes: [], permanentes: [] };
  const txt = aTexto(opord, ctx);
  assert.match(txt, /2\. MISSION/); assert.match(txt, /Cruzar el río NEMAN/); assert.match(txt, /Annex A — /); assert.match(txt, /See Annex A/);
  const docx = await aDocx(opord, ctx);
  const bd = new Uint8Array(await docx.arrayBuffer());
  assert.equal(String.fromCharCode(bd[0], bd[1]), 'PK');
  assert.ok(new TextDecoder().decode(bd).includes('word/document.xml'));
  const xlsx = await aXlsx(opord, ctx);
  const bx = new Uint8Array(await xlsx.arrayBuffer());
  assert.ok(new TextDecoder().decode(bx).includes('xl/workbook.xml'));
  const pdf = await aPdf(opord, ctx);
  const s = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()));
  assert.match(s, /^%PDF-1\.4/); assert.match(s, /%%EOF\s*$/);
  assert.match(s, /\/Type \/Pages/);
  // La tabla de referencias cruzadas apunta al principio de cada objeto
  const xref = Number(s.match(/startxref\s+(\d+)/)[1]);
  assert.ok(s.slice(xref).startsWith('xref'));
  const offs = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
  for (const [i, o] of offs.entries()) assert.ok(s.slice(o).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1} mal apuntado`);
});

test('Paquete SPA con OPORD: se recibe una vez y luego se actualiza sin duplicar', async () => {
  const { crearPlan } = await import('../src/plan/plan.js');
  const { nuevoPaquete, crearPaqueteSpa, abrirPaquete, yaRecibido, actualizarDesdePaquete, esVisible } = await import('../src/plan/operaciones.js');
  // Emisor
  const A = crearPlan('A');
  const op = nuevoPaquete(A, 'WINGO3'); const f1 = nuevoPaquete(A, 'Fase 1', { padre: op.id });
  const el = { id: 'e1', tipo: 'punto', version: 1, paquete: f1.id, geometria: { type: 'Point', coordinates: [-4, 40.7] }, propiedades: { nombre: 'PC' } };
  A.elementos.push(el);
  const { opord } = crearOpordCompleta('opord-compania', { operacion: op.id, nombre: 'WINGO3' });
  const anexos = [crearAnexo('pace')]; enlazarAnexo(opord, anexos[0]);
  A.documentos = [opord, ...anexos];
  editar(opord, porClave(opord, 'mision').id, 'texto', 'v1', 'jefe');
  // Receptor: primera vez
  const B = crearPlan('B');
  const pq1 = JSON.parse(JSON.stringify(crearPaqueteSpa(A, A.elementos, { nombre: 'WINGO3', autor: 'jefe' })));
  assert.equal(yaRecibido(B, pq1), null);
  abrirPaquete(B, pq1);
  const docB = B.documentos.find((d) => d.tipo === 'opord');
  assert.equal(porClave(docB, 'mision').texto, 'v1');
  assert.equal(docB.anexos.length, anexos.length);
  assert.ok(B.documentos.find((d) => d.id === docB.anexos[0]).padre === docB.id, 'anexos enlazados con ids nuevos');
  // El emisor cambia cosas y lo vuelve a mandar
  editar(opord, porClave(opord, 'mision').id, 'texto', 'v2', 'jefe');
  el.geometria.coordinates = [-4.1, 40.8]; el.version = 2;
  const pq2 = JSON.parse(JSON.stringify(crearPaqueteSpa(A, A.elementos, { nombre: 'WINGO3', autor: 'jefe' })));
  assert.ok(yaRecibido(B, pq2), 'lo reconoce como actualización');
  const r = actualizarDesdePaquete(B, pq2);
  assert.equal(r.objetos, 1); assert.ok(r.cambiosOpord >= 1);
  assert.equal(porClave(docB, 'mision').texto, 'v2');
  assert.equal(B.elementos.length, 1, 'sin duplicar');
  assert.deepEqual(B.elementos[0].geometria.coordinates, [-4.1, 40.8]);
  // Vigente en todas las fases: se ve aunque se vea solo otra fase
  const f2 = nuevoPaquete(A, 'Fase 2', { padre: op.id });
  el.propiedades.permanente = true;
  assert.equal(esVisible(A, el, { solo: f2.id }), true);
  assert.equal(esVisible(A, el, { ocultos: [f1.id] }), true);
  assert.equal(esVisible(A, el, { ocultos: [op.id] }), false);
  el.propiedades.permanente = false;
  assert.equal(esVisible(A, el, { solo: f2.id }), false);
});

// ---------------------------------------------------------------- v0.11
import { bloques, celdasUnidas } from '../src/opord/exportar.js';
import { disponer, trazadoPdf, svgAPdf } from '../src/opord/organigrama.js';
import { palabraFase } from '../src/opord/documento.js';
import { colorClasificacion } from '../src/opord/plantillas.js';
import { readFileSync, existsSync } from 'node:fs';

const UNIDADES = [
  { id: 'r', nombre: 'II/4', simbolo: { escalon: 'batallon', icono: '121100' } },
  { id: 'a', nombre: '7', padre: 'r', simbolo: { escalon: 'compania', icono: '121100' } },
  { id: 'a1', nombre: '', padre: 'a', simbolo: { escalon: 'seccion', icono: '121100' } },
  { id: 'a2', nombre: 'Pn', padre: 'a1', relacion: 'TACOM' },
  { id: 'b', nombre: '8', padre: 'r' },
  { id: 'c', nombre: 'MM', padre: 'r', relacion: 'TACOM', de: 'BON II' },
];

test('OPORD de una hoja: numeración 1./A., etiquetas, saltos y cuadrícula', () => {
  const paquetes = [{ id: 'op', nombre: 'Op', padre: null }, { id: 'f1', nombre: 'Ocupar', padre: 'op' }, { id: 'f2', nombre: 'Observar', padre: 'op' }];
  const { opord } = crearOpordCompleta('opord-cia-hoja', { operacion: 'op', nombre: 'Prueba', numero: '001' });
  sincronizarFases(opord, paquetes);
  const r = rotulos(opord);
  assert.equal(r.sit, '1.'); assert.equal(r.mision, '2.'); assert.equal(r.ejec, '3.'); assert.equal(r['ejec.intencion'], 'A.');
  assert.equal(r.coord, 'D.'); assert.equal(r.log, '4.'); assert.equal(r.mando, '5.');
  assert.equal(r['sit.ene.mlcoa'], '', 'las etiquetas no llevan número'); assert.equal(r.fuegos, '');
  const fases = fasesDe(paquetes, 'op');
  assert.equal(palabraFase(opord, fases[0]), 'Salto 1');
  editar(opord, porClave(opord, 'sit.ene.mlcoa').id, 'texto', 'Infiltrarse');
  editar(opord, porClave(opord, 'orgop').id, 'org.unidades', UNIDADES);
  const bl = bloques(opord, { paquetes });
  const ml = bl.find((b) => b.etiqueta?.texto === 'MLCOA:');
  assert.ok(ml && ml.etiqueta.color === '#C8102E' && ml.lineas[0] === 'Infiltrarse');
  assert.ok(bl.find((b) => b.etiqueta?.texto === 'Salto 1:' && b.vineta));
  assert.equal(bl.hoja.length, 4, 'las cuatro filas del modelo');
  const [f1, f2, f3, f4] = bl.hoja;
  assert.ok(f1[0].bloques.some((b) => b.etiqueta?.texto === 'MLCOA:'), 'situación arriba a la izquierda');
  assert.ok(f1[1].bloques.some((b) => b.t === 'titulo' && b.nota === '(según matriz)'), 'C. remite a la matriz');
  assert.ok(f2[1].bloques.some((b) => b.t === 'titulo' && /COORDINACI/i.test(b.texto)) || f2[1].bloques.some((b) => /coordinaci/i.test(b.texto ?? '')));
  assert.ok(f3[0].bloques.some((b) => b.t === 'titulo' && b.texto === 'FUEGOS'));
  assert.ok(f4[0].bloques.some((b) => b.t === 'organigrama'));
  const matriz = f4[1].bloques.find((b) => b.t === 'tabla');
  assert.ok(matriz?.fusionar); assert.deepEqual(matriz.cols, ['', 'SALTO 1', 'SALTO 2', 'Posteriormente']);
  assert.equal(matriz.titulo, 'MATRIZ DE COMETIDOS');
});

test('Celdas iguales unidas (matriz de cometidos)', () => {
  const c = celdasUnidas([['TF 7', 'Ocupar', 'Observar', 'Relevo'], ['TF 8', 'Ocupar', 'Observar', 'Relevo'], ['MM', 'Apoyar', 'Apoyar', '']], 4);
  const ocupar = c.find((x) => x.texto === 'Ocupar'); assert.equal(ocupar.fs, 2); assert.equal(ocupar.cs, 1);
  const apoyar = c.find((x) => x.texto === 'Apoyar'); assert.equal(apoyar.cs, 2); assert.equal(apoyar.fs, 1);
  assert.equal(c.filter((x) => x.c === 0).length, 3, 'la primera columna nunca se une');
  assert.equal(c.reduce((s, x) => s + x.fs * x.cs, 0), 12, 'cubre la tabla entera sin repetir');
});

test('Organigrama: la que manda arriba, columnas y dependencias', () => {
  const d = disponer(UNIDADES);
  const caja = (id) => d.cajas.find((c) => c.u.id === id);
  assert.ok(caja('r').raiz); assert.equal(caja('r').nombre.ancla, 'end', 'el nombre de la que manda, a su izquierda');
  assert.ok(caja('a').y > caja('r').y); assert.equal(caja('a').y, caja('b').y, 'subordinadas en fila');
  assert.ok(caja('b').x > caja('a').x && caja('c').x > caja('b').x);
  assert.ok(caja('a1').y > caja('a').y && caja('a1').x > caja('a').x, 'lo que cuelga, debajo y metido');
  assert.equal(caja('c').sub.texto, 'TACOM · de BON II');
  assert.ok(d.lineas.length >= 7);
  for (const c of d.cajas) assert.ok(c.x >= 0 && c.x + c.w <= d.ancho + 0.01);
  assert.deepEqual(disponer([]).cajas, []);
});

test('SVG → PDF: trazados con arcos y relativos', () => {
  const p = trazadoPdf('M10,10 l5,5 h3 v2 a2,2 0 1,0 4,0 Z', (x, y) => [x, -y]);
  assert.match(p, /^10\.00 -10\.00 m 15\.00 -15\.00 l 18\.00 -15\.00 l 18\.00 -17\.00 l .* c .* c h$/);
  const ops = svgAPdf('<svg><path d="M0,0 L1,1" fill="none" stroke="#000" stroke-width="2"/><path d="M0,0 L1,0 L1,1 Z" fill="rgb(128,224,255)" stroke="none"/></svg>', (x, y) => [x, y], 1);
  assert.match(ops, /0\.000 0\.000 0\.000 RG 2\.00 w .* S/); assert.match(ops, /0\.502 0\.878 1\.000 rg .* f/);
});

test('Clasificación con su color y cuadro junto a los títulos', async () => {
  assert.equal(colorClasificacion('confidencial'), '#1F4E9A'); assert.equal(colorClasificacion('NATO RESTRICTED'), '#C8102E');
  const { opord } = crearOpordCompleta('opord-brigada', {});
  opord.cabecera.clasificacion = 'NATO RESTRICTED';
  const bl = bloques(opord, {});
  assert.ok(bl.filter((b) => b.t === 'titulo' && b.marca?.color === '#C8102E').length > 10);
  assert.equal(bl.letra, 'Tahoma');
  editar(opord, '_cab', 'marcar', false);
  assert.ok(!bloques(opord, {}).some((b) => b.marca), 'se puede quitar');
  const xmlDoc = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); return Buffer.from(u).toString('latin1'); };
  editar(opord, '_cab', 'marcar', true);
  const docx = await xmlDoc(await aDocx(opord, {}));
  assert.ok(docx.includes('word/styles.xml'));
});

test('PDF: OPORD de una hoja, organigrama en vectores, calco y letra incrustada', async () => {
  const paquetes = [{ id: 'op', nombre: 'Op', padre: null }, { id: 'f1', nombre: 'Ocupar', padre: 'op' }];
  const { opord } = crearOpordCompleta('opord-cia-hoja', { operacion: 'op', nombre: 'Prueba', numero: '001' });
  sincronizarFases(opord, paquetes);
  editar(opord, porClave(opord, 'orgop').id, 'org.unidades', UNIDADES);
  // JPEG mínimo de 1×1 (cabecera SOF0 legible)
  const jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';
  editar(opord, porClave(opord, 'ejec.calco').id, 'imagen', { datos: jpg, ancho: 1, alto: 1 });
  const pdf = Buffer.from(new Uint8Array(await (await aPdf(opord, { paquetes })).arrayBuffer())).toString('latin1');
  assert.match(pdf, /\/Count 1 /, 'una hoja');
  assert.match(pdf, /\/Subtype \/Image \/Width 1 \/Height 1/);
  assert.match(pdf, /MATRIZ DE COMETIDOS/); assert.match(pdf, /ORGANIZACI\\323N OPERATIVA/);
  assert.match(pdf, /0\.502 0\.878 1\.000 rg/, 'símbolos APP-6 (marco azul) dibujados');
  const docx = Buffer.from(new Uint8Array(await (await aDocx(opord, { paquetes, imagenes: { [porClave(opord, 'orgop').id]: { png: new Uint8Array([137, 80, 78, 71]), ancho: 200, alto: 100 } } })).arrayBuffer())).toString('latin1');
  assert.ok(/word\/media\/imagen\d\.png/.test(docx) && /word\/media\/imagen\d\.jpeg/.test(docx), 'organigrama y calco en Word');
  const ttf = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', ttfB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  if (existsSync(ttf) && existsSync(ttfB)) {
    const b = crearOpord('opord-brigada', {});
    const p2 = Buffer.from(new Uint8Array(await (await aPdf(b, { fuentesPdf: { normal: readFileSync(ttf), negrita: readFileSync(ttfB), nombre: 'Prueba' } })).arrayBuffer())).toString('latin1');
    assert.match(p2, /\/Subtype \/TrueType \/BaseFont \/Prueba /); assert.match(p2, /\/FontFile2 /);
  }
});
