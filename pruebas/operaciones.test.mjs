// Operaciones (paquetes anidados), lazo y exportación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearPlan, nuevoElemento, Historial } from '../src/plan/plan.js';
import {
  nuevoPaquete, hijos, ruta, nombreRuta, descendientes, objetosDe, asignar, moverPaquete, borrarPaquete,
  duplicarPaquete, esVisible, categoriaDe, filtrar, enCirculo, objetosEnCirculo, crearPaqueteSpa, abrirPaquete, esPaqueteSpa,
} from '../src/plan/operaciones.js';
import { aGeoJSON, aKML, aGPX, aCSV, colorKml, escribirZip, crearArchivo } from '../src/datos/exportar.js';
import { medir, destino } from '../src/geo/index.js';

const C = { lat: 40.8, lon: -4.0 };
const en = (rumbo, m) => { const d = destino(C, rumbo, m); return { lat: d.lat, lon: d.lon }; };

function planDePrueba() {
  const plan = crearPlan('Prueba');
  const op = nuevoPaquete(plan, 'OP NORTE');
  const f1 = nuevoPaquete(plan, 'Fase 1', { padre: op.id });
  const s1 = nuevoPaquete(plan, 'Salto 1', { padre: f1.id });
  const fut = nuevoPaquete(plan, 'OP SUR', { estado: 'futura' });
  const a = nuevoElemento('punto', [en(0, 100)], { paquete: op.id, nombre: 'A' });
  const b = nuevoElemento('punto', [en(90, 200)], { paquete: f1.id, nombre: 'B' });
  const c = nuevoElemento('linea', [en(180, 100), en(180, 400)], { paquete: s1.id, nombre: 'C' });
  const d = nuevoElemento('circulo', [en(270, 300)], { radio: 50, nombre: 'D' });
  plan.elementos.push(a, b, c, d);
  return { plan, op, f1, s1, fut, a, b, c, d };
}

test('Paquetes anidados: ruta, hijos, descendientes y objetos', () => {
  const { plan, op, f1, s1, fut, a, b, c, d } = planDePrueba();
  assert.equal(op.estado, 'curso'); assert.equal(fut.estado, 'futura'); assert.equal(f1.estado, null);
  assert.deepEqual(hijos(plan, null).map((o) => o.nombre), ['OP NORTE', 'OP SUR']);
  assert.deepEqual(ruta(plan, s1.id).map((o) => o.nombre), ['OP NORTE', 'Fase 1', 'Salto 1']);
  assert.equal(nombreRuta(plan, s1.id), 'OP NORTE › Fase 1 › Salto 1');
  assert.deepEqual(descendientes(plan, op.id).sort(), [op.id, f1.id, s1.id].sort());
  assert.deepEqual(objetosDe(plan, op.id).map((e) => e.nombre ?? e.propiedades.nombre), ['A', 'B', 'C']);
  assert.deepEqual(objetosDe(plan, op.id, { recursivo: false }).map((e) => e.propiedades.nombre), ['A']);
  assert.deepEqual(objetosDe(plan, null).map((e) => e.propiedades.nombre), ['D']);
  asignar(plan, [d.id], s1.id);
  assert.equal(d.paquete, s1.id);
  asignar(plan, [a.id, b.id], null);
  assert.equal(objetosDe(plan, null).length, 2);
  assert.ok(c);
});

test('Mover paquetes sin ciclos; borrar con o sin objetos; duplicar', () => {
  const { plan, op, f1, s1, fut } = planDePrueba();
  assert.equal(moverPaquete(plan, op.id, s1.id), false, 'no se mete dentro de sí mismo');
  assert.ok(moverPaquete(plan, f1.id, fut.id));
  assert.equal(nombreRuta(plan, s1.id), 'OP SUR › Fase 1 › Salto 1');
  assert.ok(moverPaquete(plan, f1.id, null));
  assert.equal(f1.estado, 'curso', 'al subir al primer nivel pasa a operación en curso');
  const n = plan.elementos.length;
  borrarPaquete(plan, f1.id, { conObjetos: false });
  assert.equal(plan.elementos.length, n, 'sin objetos: se quedan');
  assert.ok(plan.elementos.every((e) => e.paquete !== f1.id && e.paquete !== s1.id));
  const { plan: p2, op: o2 } = planDePrueba();
  const copia = duplicarPaquete(p2, o2.id);
  assert.equal(copia.nombre, 'OP NORTE (copia)');
  assert.equal(objetosDe(p2, copia.id).length, 3);
  assert.equal(descendientes(p2, copia.id).length, 3);
  borrarPaquete(p2, o2.id, { conObjetos: true });
  assert.equal(p2.elementos.length, 4, 'borrada con sus 3 objetos (queda la copia y el suelto)');
});

test('Visibilidad de cada usuario: ojo, «ver solo» y sueltos', () => {
  const { plan, op, f1, a, b, c, d } = planDePrueba();
  const vis = (v) => plan.elementos.filter((e) => esVisible(plan, e, v)).map((e) => e.propiedades.nombre).join('');
  assert.equal(vis({}), 'ABCD');
  assert.equal(vis({ ocultos: [f1.id] }), 'AD', 'ocultar una fase oculta también sus saltos');
  assert.equal(vis({ solo: f1.id }), 'BC');
  assert.equal(vis({ ocultos: [op.id], sueltosOcultos: true }), '', 'mapa sin símbolos');
  assert.ok(a && b && c && d);
});

test('Historial: deshacer y rehacer también las operaciones', () => {
  const plan = crearPlan();
  const h = new Historial(plan);
  const o = h.hacer('Crear', (p) => nuevoPaquete(p, 'OP'));
  h.hacer('Fase', (p) => nuevoPaquete(p, 'F1', { padre: o.id }));
  assert.equal(plan.operaciones.length, 2);
  h.deshacer(); assert.equal(plan.operaciones.length, 1);
  h.deshacer(); assert.equal(plan.operaciones.length, 0);
  h.rehacer(); assert.equal(plan.operaciones[0].nombre, 'OP');
});

test('Categorías y filtros', () => {
  const { plan, op } = planDePrueba();
  plan.elementos[0].simbolo = { clase: 'unidad' };
  plan.elementos[1].simbolo = { clase: 'medida', id: 'pl' };
  plan.elementos[2].simbolo = { clase: 'medida', id: 'bloquear' };
  const medidaDe = (id) => ({ pl: { grupo: 'lineas' }, bloquear: { grupo: 'cometidos' } }[id]);
  assert.deepEqual(plan.elementos.map((e) => categoriaDe(e, medidaDe)), ['unidad', 'linea', 'cometido', 'dibujo']);
  const n = (f) => filtrar(plan, f, { medidaDe }).map((e) => e.propiedades.nombre).join('');
  assert.equal(n({ categorias: new Set(['linea', 'cometido']) }), 'BC');
  assert.equal(n({ paquete: op.id }), 'ABC');
  assert.equal(n({ paquete: null }), 'D');
  assert.equal(n({ texto: 'salto' }), 'C', 'busca también por el nombre de la operación');
});

test('Lazo: dentro, toca o fuera (círculo geodésico)', () => {
  const { plan } = planDePrueba();
  assert.equal(enCirculo({ tipo: 'punto', puntos: [en(45, 499)] }, C, 500), 'dentro');
  assert.equal(enCirculo({ tipo: 'punto', puntos: [en(45, 501)] }, C, 500), null);
  assert.equal(enCirculo({ tipo: 'linea', puntos: [en(0, 100), en(0, 900)] }, C, 500), 'toca');
  assert.equal(enCirculo({ tipo: 'circulo', puntos: [C], radio: 5000 }, C, 500), 'toca', 'un círculo que envuelve el lazo');
  const r = objetosEnCirculo(plan, C, 250);
  assert.deepEqual(r.map((x) => `${x.el.propiedades.nombre}:${x.como}`).sort(), ['A:dentro', 'B:dentro', 'C:toca']);
});

test('Paquete SPA: crear y abrir como operación editable (ids nuevos)', () => {
  const { plan, s1 } = planDePrueba();
  const pq = crearPaqueteSpa(plan, plan.elementos.filter((e) => e.paquete === s1.id), { nombre: 'Para el S2', autor: 'Balú' });
  assert.ok(esPaqueteSpa(pq));
  assert.deepEqual(pq.operaciones.map((o) => o.nombre), ['OP NORTE', 'Fase 1', 'Salto 1']);
  const otro = crearPlan('Otro usuario');
  const raiz = abrirPaquete(otro, JSON.parse(JSON.stringify(pq)));
  assert.equal(raiz.nombre, 'Para el S2'); assert.equal(raiz.origen, 'recibido de Balú');
  assert.equal(nombreRuta(otro, otro.elementos[0].paquete), 'Para el S2 › OP NORTE › Fase 1 › Salto 1');
  assert.notEqual(otro.elementos[0].id, pq.elementos[0].id);
  abrirPaquete(otro, JSON.parse(JSON.stringify(pq)));
  assert.equal(new Set(otro.elementos.map((e) => e.id)).size, 2, 'abrirlo dos veces no pisa nada');
});

test('Exportar: GeoJSON, KML (carpetas), GPX, CSV y ZIP', async () => {
  const objs = [
    { nombre: 'OBJ 1', tipo: 'punto', puntos: [C], paquete: 'OP NORTE', color: '#C0392B', bando: 'enemigo' },
    { nombre: 'PL ROJA', tipo: 'linea', puntos: [en(0, 100), en(90, 100)], paquete: 'OP NORTE › Fase 1' },
    { nombre: 'Zona & "B"', tipo: 'area', puntos: [en(0, 50), en(120, 50), en(240, 50)] },
    { nombre: 'Círculo', tipo: 'circulo', puntos: [C], radio: 1000 },
  ];
  const gj = JSON.parse(aGeoJSON(objs));
  assert.equal(gj.features.length, 4);
  assert.deepEqual(gj.features[0].geometry, { type: 'Point', coordinates: [-4, 40.8] });
  assert.equal(gj.features[1].properties.paquete, 'OP NORTE › Fase 1');
  const anillo = gj.features[3].geometry.coordinates[0];
  assert.deepEqual(anillo[0], anillo.at(-1), 'anillo cerrado');
  for (const [lon, lat] of anillo) assert.ok(Math.abs(medir(C, { lat, lon }).distancia - 1000) < 0.01, 'círculo a 1000 m exactos (±1 cm)');
  assert.equal(gj.features[3].properties.radio_m, 1000);
  const kml = aKML(objs, { nombre: 'Prueba' });
  assert.match(kml, /<Folder><name>OP NORTE<\/name>.*<Folder><name>Fase 1<\/name>/s);
  assert.match(kml, /Zona &amp; &quot;B&quot;/);
  assert.equal(colorKml('#C0392B'), 'ff2b39c0');
  const gpx = aGPX(objs);
  assert.equal((gpx.match(/<wpt /g) || []).length, 1); assert.equal((gpx.match(/<trk>/g) || []).length, 3);
  const csv = aCSV(objs);
  assert.ok(csv.startsWith('﻿Nombre;Tipo'));
  assert.match(csv, /OBJ 1;punto;;OP NORTE;enemigo;30T /);
  const zip = new Uint8Array(await escribirZip([{ nombre: 'doc.kml', datos: kml }]).arrayBuffer());
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  const f = await crearArchivo('kmz', objs, { nombre: 'OP: NORTE/1' });
  assert.equal(f.nombre, 'OP_ NORTE_1.kmz');
});
