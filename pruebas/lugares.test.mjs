// Lugares para el buscador: traducción de CartoCiudad y Nominatim, memoria y respaldo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lugarCartoCiudad, lugarNominatim, crearBuscadorLugares } from '../src/datos/lugares.js';

test('CartoCiudad: nombre, tipo y dónde', () => {
  const l = lugarCartoCiudad({ id: '1', type: 'Municipio', address: 'TORRELODONES', muni: 'TORRELODONES', province: 'MADRID', lat: 40.57, lng: -3.92 });
  assert.equal(l.nombre, 'Torrelodones');
  assert.equal(l.detalle, 'Municipio · Madrid');
  assert.equal(l.lat, 40.57); assert.equal(l.lon, -3.92); assert.equal(l.lado, 10000);
  const sin = lugarCartoCiudad({ id: '2', type: 'callejero', address: 'CALLE REAL', muni: 'UCEDA', province: 'GUADALAJARA', lat: 0, lng: 0 });
  assert.equal(sin.lat, null); assert.equal(sin.detalle, 'Calle · Uceda, Guadalajara');
});

test('Nominatim: tamaño desde la caja', () => {
  const l = lugarNominatim({ display_name: 'Uceda, Guadalajara, Castilla-La Mancha, España', lat: '40.84', lon: '-3.46', type: 'village', boundingbox: ['40.83', '40.85', '-3.47', '-3.45'] });
  assert.equal(l.nombre, 'Uceda'); assert.match(l.detalle, /^Pueblo · Guadalajara/);
  assert.ok(l.lado > 2000 && l.lado < 2400);
});

test('Memoria y respaldo en OpenStreetMap si el IGN falla', async () => {
  let llamadas = 0;
  const b = crearBuscadorLugares({
    jsonp: async () => { llamadas++; throw new Error('sin conexión'); },
    pedir: async () => ({ ok: true, json: async () => [{ display_name: 'Uceda, Guadalajara', lat: '40.84', lon: '-3.46', type: 'village' }] }),
  });
  assert.equal(b.enMemoria('uceda'), undefined);
  const l = await b.buscar('Uceda');
  assert.equal(l[0].nombre, 'Uceda');
  await b.buscar('uceda ');
  assert.equal(llamadas, 1);
  assert.deepEqual(b.enMemoria('UCEDA'), l);
});
