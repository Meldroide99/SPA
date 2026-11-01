// Pruebas unitarias: ángulos, milésimas, lectura de posiciones y casos límite.
// node --test pruebas/

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradosAMilesimas, milesimasAGrados, normalizarRumbo, formatearRumbo, aGMS,
  formatearGMS, leerAngulo, geoAMgrs, utmAMgrs, mgrsAGeo, mgrsAUtm, analizarMgrs,
  formatearPosicion, leerPosicion, geoAUtm, zonaUTM, bandaLatitud, medir,
  destino, destinoCuadricula,
} from '../src/geo/index.js';

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('milésimas OTAN: 6400 por vuelta', () => {
  assert.equal(gradosAMilesimas(360), 6400);
  assert.equal(gradosAMilesimas(90), 1600);
  assert.equal(gradosAMilesimas(45), 800);
  assert.equal(milesimasAGrados(3200), 180);
  cerca(milesimasAGrados(gradosAMilesimas(123.456789)), 123.456789, 1e-12);
});

test('formato de rumbos', () => {
  assert.equal(formatearRumbo(90, 'milesimas'), '1600 mils');
  assert.equal(formatearRumbo(1, 'milesimas'), '0018 mils');
  assert.equal(formatearRumbo(359.99, 'milesimas'), '0000 mils'); // 6399.8 → 6400 → 0
  assert.equal(formatearRumbo(-90, 'grados'), '270.00°');
  assert.equal(formatearRumbo(359.999, 'grados'), '0.00°');
  assert.equal(formatearRumbo(45.5, 'gms'), '45°30\'00"');
  assert.equal(normalizarRumbo(720), 0);
  assert.equal(normalizarRumbo(-0.0), 0);
});

test('grados-minutos-segundos sin "60 segundos"', () => {
  assert.deepEqual(aGMS(40.999999999), { signo: 1, g: 41, m: 0, s: 0 });
  assert.equal(formatearGMS(-3.7038, { segDecimales: 1 }), '-3°42\'13.7"');
});

test('lectura de ángulos escritos a mano', () => {
  cerca(leerAngulo('40°24\'59.3"N'), 40.416472, 1e-6);
  cerca(leerAngulo('3 42 13.7 W'), -3.703806, 1e-6);
  cerca(leerAngulo('3°42\'13,7" O'), -3.703806, 1e-6); // O = Oeste, coma decimal
  cerca(leerAngulo('-3.7038'), -3.7038, 1e-12);
  assert.throws(() => leerAngulo('40 61 00 N'), /fuera de rango/);
  assert.throws(() => leerAngulo('hola'), /No entiendo/);
});

test('zonas UTM de España', () => {
  assert.equal(zonaUTM(28.1, -15.4), 28); // Gran Canaria
  assert.equal(zonaUTM(43.36, -8.41), 29); // A Coruña
  assert.equal(zonaUTM(40.42, -3.70), 30); // Madrid
  assert.equal(zonaUTM(41.39, 2.17), 31);  // Barcelona
  assert.equal(zonaUTM(40, -6), 30);       // en el límite: zona de la derecha
  assert.equal(bandaLatitud(40), 'T');
  assert.equal(bandaLatitud(39.999), 'S');
  assert.equal(bandaLatitud(84), 'X');
});

test('MGRS: truncar, nunca redondear', () => {
  // Madrid, Puerta del Sol: 440290.458 E, 4474257.382 N
  assert.equal(geoAMgrs(40.4168, -3.7038, 5), '30TVK4029074257');
  assert.equal(geoAMgrs(40.4168, -3.7038, 3), '30TVK402742');   // NO 403/743
  assert.equal(geoAMgrs(40.4168, -3.7038, 0), '30TVK');
  assert.equal(geoAMgrs(40.4168, -3.7038, 5, { separado: true }), '30T VK 40290 74257');
});

test('MGRS: punto exactamente sobre una línea va al cuadrado de arriba/derecha', () => {
  assert.equal(utmAMgrs(30, 'T', 400000, 4500000, 5), '30TVL0000000000');
  assert.equal(utmAMgrs(30, 'T', 399999.9999, 4499999.9999, 5), '30TUK9999999999');
});

test('MGRS: lectura tolerante y centro del cuadrado', () => {
  const a = mgrsAUtm('30tvk 402 742');
  assert.equal(a.precision, 3);
  assert.equal(a.lado, 100);
  assert.equal(a.este, 440250);    // 440200 + 50 (centro)
  assert.equal(a.norte, 4474250);
  const b = mgrsAUtm('30TVK402742', { esquina: true });
  assert.equal(b.este, 440200);
  assert.equal(b.norte, 4474200);
  assert.deepEqual(analizarMgrs('4QFJ12345678'), { zona: 4, banda: 'Q', letras: 'FJ', precision: 4, e: 1234, n: 5678 });
  assert.throws(() => mgrsAGeo('30TVK123'), /mismo número de cifras/);
  assert.throws(() => mgrsAGeo('30TIK1234'), /no válida/);   // I no existe
  assert.throws(() => mgrsAGeo('30TAK1234'), /no existe en la zona/); // A no es columna de la zona 30
});

test('MGRS: ida y vuelta en la zona piloto (error ≤ media diagonal del cuadrado de 1 m)', () => {
  for (let i = 0; i < 500; i++) {
    const lat = 40.70 + Math.random() * 0.18, lon = -4.15 + Math.random() * 0.24;
    const g = mgrsAGeo(geoAMgrs(lat, lon, 5));
    const r = medir({ lat, lon }, g);
    assert.ok(r.distancia < Math.SQRT1_2 + 1e-6, `error ${r.distancia} m`); // máx: media diagonal de 1 m
  }
});

test('posiciones: mostrar y leer en todos los formatos', () => {
  const p = { lat: 40.4168, lon: -3.7038 };
  assert.equal(formatearPosicion(p, { formato: 'utm' }), '30N 440290 E 4474257 N');
  assert.equal(formatearPosicion(p, { formato: 'gd' }), '40.416800, -3.703800');
  assert.equal(formatearPosicion(p, { formato: 'gms' }), '40°25\'00.5"N 3°42\'13.7"W');
  for (const txt of ['30TVK4029074257', '30T VK 40290 74257', '30N 440290 4474257',
    '30T 440290.458 4474257.382', '40.4168, -3.7038', '40.4168 -3.7038',
    '40°25\'00.48"N 3°42\'13.68"W', '40 25 0.48 N, 3 42 13.68 O']) {
    const q = leerPosicion(txt);
    assert.ok(medir(p, q).distancia < 1.5, `${txt} → ${q.lat},${q.lon}`);
  }
  // "30S" en UTM = banda S (hemisferio norte), habitual en el sur de España
  assert.ok(leerPosicion('30S 440290 4100000').lat > 0);
});

test('medidas: cuadrícula frente a elipsoide y tres nortes', () => {
  // Dos puntos de la zona piloto separados unos 10 km
  const a = { lat: 40.7354, lon: -4.0058 }, b = { lat: 40.8501, lon: -3.9550 };
  const r = medir(a, b);
  // Rumbo de cuadrícula = rumbo geográfico − convergencia (al oeste del meridiano central γ < 0)
  cerca(r.rumboCuadricula, normalizarRumbo(r.rumbo - r.convergencia), 1e-12);
  assert.ok(r.convergencia < 0);
  // En esta zona k ≈ 0,99965: la distancia de cuadrícula es algo MENOR que la real
  assert.ok(r.distanciaCuadricula < r.distancia);
  cerca(r.distanciaCuadricula / r.distancia, geoAUtm(a.lat, a.lon).escala, 1e-4);
  // destino() con rumbo de cuadrícula y destinoCuadricula() coinciden a < 1 m a 10 km
  const d1 = destino(a, r.rumboCuadricula, r.distancia, { norte: 'cuadricula' });
  const d2 = destinoCuadricula(a, r.rumboCuadriculaPlano, r.distanciaCuadricula);
  assert.ok(medir(d1, b).distancia < 1e-6);
  assert.ok(medir(d2, b).distancia < 1e-6);
});
