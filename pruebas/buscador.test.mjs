// Pruebas del buscador universal: búsqueda aproximada y coordenadas flexibles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, distancia, puntuar, buscar, leerCoordenadaFlexible } from '../src/ui/difuso.js';
import { geoAMgrs, geoAUtm, INTERNACIONAL_1924 } from '../src/geo/index.js';
import { prepararRejillas, etrs89AEd50 } from '../src/geo/rejillas.js';
import { crsDesdeEpsg } from '../src/geo/crs.js';

test('normalizar y distancia', () => {
  assert.equal(normalizar('  Cuadrícula  MGRS '), 'cuadricula mgrs');
  assert.equal(distancia('cuadricula', 'cudaricula'), 1); // transposición
  assert.equal(distancia('relieve', 'releive'), 1);
  assert.equal(distancia('sombra', 'sombreado', 3), 3);
});

const AJUSTES = [
  { texto: 'Cuadrícula MGRS', extra: 'mostrar ocultar malla' },
  { texto: 'Coordenadas en UTM', extra: 'formato' },
  { texto: 'Rumbos en milésimas', extra: 'angulos' },
  { texto: 'Fondo híbrido', extra: 'imagen' },
  { texto: 'Curvas de nivel', extra: '' },
  { texto: 'Relieve', extra: 'fondo' },
  { texto: 'Importar archivo', extra: '' },
];
test('búsqueda aproximada: erratas, acentos, prefijos y sinónimos', () => {
  const primero = (q) => buscar(q, AJUSTES)[0]?.texto;
  assert.equal(primero('cuadricula'), 'Cuadrícula MGRS');
  assert.equal(primero('cudricula'), 'Cuadrícula MGRS');
  assert.equal(primero('grid'), 'Cuadrícula MGRS');
  assert.equal(primero('mils'), 'Rumbos en milésimas');
  assert.equal(primero('milesimas'), 'Rumbos en milésimas');
  assert.equal(primero('satelite'), 'Fondo híbrido');
  assert.equal(primero('ortofoto'), 'Fondo híbrido');
  assert.equal(primero('curbas'), 'Curvas de nivel');
  assert.equal(primero('coord utm'), 'Coordenadas en UTM');
  assert.equal(primero('impor'), 'Importar archivo');
  assert.equal(buscar('xyzzy', AJUSTES).length, 0);
  // Nombres de archivos y elementos
  const cosas = [{ texto: 'Ruta_Barriguetis', extra: 'GPX track' }, { texto: 'PV3', extra: 'punto paquete atak' }, { texto: 'UCEDA_25K.sqlite', extra: 'mapa' }];
  assert.equal(buscar('barriguetis', cosas)[0].texto, 'Ruta_Barriguetis');
  assert.equal(buscar('bariguetis', cosas)[0].texto, 'Ruta_Barriguetis');
  assert.equal(buscar('uceda', cosas)[0].texto, 'UCEDA_25K.sqlite');
  assert.equal(buscar('pv3', cosas)[0].texto, 'PV3');
  assert.ok(puntuar('track', 'Ruta 1', 'linea') > 55, 'track ~ línea');
});

test('coordenadas flexibles: completas, sin zona, coma decimal, E/N y ED50', async () => {
  await prepararRejillas();
  const c = { lat: 40.84, lon: -3.42 };
  const ref = { lat: 40.8412, lon: -3.4187 };
  const mgrs = geoAMgrs(ref.lat, ref.lon, 5, { separado: true }); // 30T VL ...
  const u = geoAUtm(ref.lat, ref.lon);
  const cerca = (p, tol = 2) => { const q = geoAUtm(p.lat, p.lon, { zona: 30 }); return Math.hypot(q.este - u.este, q.norte - u.norte) <= tol; };
  assert.ok(cerca(leerCoordenadaFlexible(mgrs, c)), 'MGRS completo');
  assert.ok(cerca(leerCoordenadaFlexible(mgrs.slice(4), c)), 'MGRS sin zona (VL ...)');
  assert.ok(cerca(leerCoordenadaFlexible(mgrs.slice(4).replace(/\s/g, '').toLowerCase(), c)), 'MGRS sin zona, junto y en minúsculas');
  assert.ok(cerca(leerCoordenadaFlexible(`${Math.floor(u.este)} ${Math.floor(u.norte)}`, c)), 'UTM sin huso');
  assert.ok(cerca(leerCoordenadaFlexible(`E${Math.floor(u.este)} N${Math.floor(u.norte)}`, c)), 'UTM con E/N');
  assert.ok(cerca(leerCoordenadaFlexible('40,8412 -3,4187', c), 1), 'grados con coma decimal');
  assert.ok(cerca(leerCoordenadaFlexible('40.8412, -3.4187', c), 1), 'grados decimales');
  // ED50: las mismas cifras en ED50 caen ~110 m E y ~208 m N desplazadas
  const e = etrs89AEd50(ref.lat, ref.lon);
  const ue = geoAUtm(e.lat, e.lon, { zona: 30, elipsoide: INTERNACIONAL_1924 });
  const r = leerCoordenadaFlexible(`ED50 30 ${ue.este.toFixed(1)} ${ue.norte.toFixed(1)}`, c, crsDesdeEpsg);
  assert.ok(cerca(r, 0.1), `ED50 (${r?.como})`);
  assert.equal(leerCoordenadaFlexible('hola', c), null);
});
