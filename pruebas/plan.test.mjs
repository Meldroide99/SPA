// Pruebas del modelo del plan (fase 3): geometrías, medidas e historial.
// Criterio de la fase: las medidas de lo dibujado coinciden con el motor
// verificado (fase 1) y con GeographicLib llamada directamente.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Geodesic } from '../src/vendor/geographiclib-geodesic.js';
import { mgrsAGeo, geoAUtm, utmAGeo } from '../src/geo/index.js';
import {
  crearPlan, nuevoElemento, puntosDe, moverPuntos, medidasDe, puntosCirculo,
  Historial, formatearArea, esPlan, geometria,
} from '../src/plan/plan.js';

const G = Geodesic.WGS84;
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);
const P = (mgrs) => { const g = mgrsAGeo(mgrs); return { lat: g.lat, lon: g.lon }; };

// Puntos de la zona piloto (Guadarrama, 30T VL / VK)
const A = P('30TVL0300003000'), B = P('30TVL0800004000'), C = P('30TVL0600009000'), D = P('30TVK9900099000');

test('GeoJSON: orden [longitud, latitud] y anillo cerrado', () => {
  const el = nuevoElemento('area', [A, B, C]);
  assert.equal(el.geometria.type, 'Polygon');
  const anillo = el.geometria.coordinates[0];
  assert.equal(anillo.length, 4);
  assert.deepEqual(anillo[0], anillo[3]);
  assert.deepEqual(anillo[0], [A.lon, A.lat]);
  assert.deepEqual(puntosDe(el), [A, B, C]);
  assert.equal(geometria('linea', [A, B]).type, 'LineString');
  assert.throws(() => nuevoElemento('area', [A, B]), /al menos 3/);
  assert.throws(() => nuevoElemento('circulo', [A], { radio: 0 }), /radio/);
});

test('línea: longitud = suma de geodésicas de GeographicLib (< 1 mm)', () => {
  const el = nuevoElemento('linea', [A, B, C, D]);
  const m = medidasDe(el);
  let ref = 0;
  for (const [p, q] of [[A, B], [B, C], [C, D]]) ref += G.Inverse(p.lat, p.lon, q.lat, q.lon).s12;
  cerca(m.longitud, ref, 1e-3, 'longitud');
  assert.equal(m.tramos.length, 3);
  cerca(m.tramos[0].rumbo, ((G.Inverse(A.lat, A.lon, B.lat, B.lon).azi1 % 360) + 360) % 360, 1e-9, 'rumbo tramo 1');
  // Sobre el mapa: tramo A→B mide en cuadrícula ~ 5000 E y 1000 N → √26 km
  cerca(m.tramos[0].distanciaCuadricula, Math.hypot(5000, 1000), 1e-3, 'distancia de cuadrícula');
});

test('área: un cuadrado de 1 km de la cuadrícula mide 1 km² / k² sobre el elipsoide', () => {
  // Cuadrado MGRS 30T VL 03 03 (1 × 1 km en el plano UTM)
  const u = geoAUtm(A.lat, A.lon);
  const esq = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]].map(([e, n]) => utmAGeo(u.zona, 'N', u.este + e, u.norte + n));
  const el = nuevoElemento('area', esq.map((g) => ({ lat: g.lat, lon: g.lon })));
  const m = medidasDe(el);
  // Factor de escala en el centro del cuadrado
  const cen = utmAGeo(u.zona, 'N', u.este + 500, u.norte + 500);
  const k = geoAUtm(cen.lat, cen.lon).escala;
  cerca(m.area, 1e6 / (k * k), 1, 'área frente a 1 km²/k²');
  cerca(m.perimetroMapa, 4000, 1e-6, 'perímetro sobre el mapa');
  cerca(m.perimetro, 4000 / k, 0.01, 'perímetro real');
});

test('círculo: cada vértice a exactamente el radio del centro (< 1 mm) y área ≈ πr²', () => {
  const el = nuevoElemento('circulo', [A], { radio: 2500 });
  for (const v of puntosCirculo(A, 2500, 64)) cerca(G.Inverse(A.lat, A.lon, v.lat, v.lon).s12, 2500, 1e-3, 'radio');
  const m = medidasDe(el);
  assert.equal(m.radio, 2500); assert.equal(m.diametro, 5000);
  cerca(m.area / (Math.PI * 2500 ** 2), 1, 1e-4, 'área relativa');
  cerca(m.perimetro / (2 * Math.PI * 2500), 1, 1e-4, 'perímetro relativo');
});

test('mover puntos actualiza geometría y versión', () => {
  const el = nuevoElemento('linea', [A, B]);
  moverPuntos(el, [A, C]);
  assert.deepEqual(puntosDe(el), [A, C]);
  assert.equal(el.version, 2);
  assert.throws(() => moverPuntos(el, [A]), /al menos 2/);
});

test('historial: deshacer y rehacer', () => {
  const plan = crearPlan('Prueba');
  assert.ok(esPlan(plan));
  let avisos = 0;
  const h = new Historial(plan, { alCambiar: () => { avisos++; } });
  const l = h.hacer('Dibujar línea', (p) => { const e = nuevoElemento('linea', [A, B]); p.elementos.push(e); return e; });
  h.hacer('Dibujar área', (p) => p.elementos.push(nuevoElemento('area', [A, B, C])));
  h.hacer('Mover vértice', (p) => moverPuntos(p.elementos.find((e) => e.id === l.id), [A, D]));
  assert.equal(plan.elementos.length, 2);
  h.hacer('Nada', () => {}); // sin cambios: no entra en el historial
  assert.equal(h.ultimo, 'Mover vértice');
  assert.equal(h.deshacer(), 'Mover vértice');
  assert.deepEqual(puntosDe(plan.elementos[0]), [A, B]);
  h.deshacer();
  assert.equal(plan.elementos.length, 1);
  assert.equal(h.rehacer(), 'Dibujar área');
  assert.equal(plan.elementos.length, 2);
  // Un cambio nuevo borra lo que quedaba por rehacer
  h.hacer('Borrar', (p) => { p.elementos.pop(); });
  assert.equal(h.puedeRehacer, false);
  h.deshacer(); h.deshacer(); h.deshacer(); h.deshacer();
  assert.equal(plan.elementos.length, 0);
  assert.equal(h.deshacer(), false);
  assert.ok(avisos >= 8);
});

test('formato de superficies', () => {
  assert.equal(formatearArea(950), '950 m²');
  assert.equal(formatearArea(25000), '2,50 ha');
  assert.equal(formatearArea(3_200_000), '3,200 km² (320 ha)');
});

test('perfil: muestras sobre la geodésica, distancia acumulada exacta', async () => {
  const { muestrasPerfil, estiloDe } = await import('../src/plan/plan.js');
  const m = muestrasPerfil([A, B, C], 100);
  let ref = 0;
  for (const [p, q] of [[A, B], [B, C]]) ref += G.Inverse(p.lat, p.lon, q.lat, q.lon).s12;
  cerca(m.at(-1).d, ref, 1e-6, 'distancia final');
  cerca(m.at(-1).lat, C.lat, 1e-12); cerca(m.at(-1).lon, C.lon, 1e-12);
  for (let i = 1; i < m.length; i++) assert.ok(m[i].d - m[i - 1].d <= 100 + 1e-9);
  const el = nuevoElemento('linea', [A, B], { bando: 'enemigo' });
  assert.deepEqual(estiloDe(el), { color: '#C0392B', trazo: 'continuo', grosor: 3, relleno: 10 });
  el.propiedades.estado = 'previsto'; assert.equal(estiloDe(el).trazo, 'discontinuo');
  el.propiedades.color = '#123456'; el.propiedades.trazo = 'punteado'; el.propiedades.grosor = 5;
  assert.deepEqual(estiloDe(el), { color: '#123456', trazo: 'punteado', grosor: 5, relleno: 10 });
});
