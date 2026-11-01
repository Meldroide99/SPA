// Banco de pruebas de precisión del motor geodésico.
//
// Compara el motor de SPA con GeographicLib (referencia generada por
// pruebas/referencia/generar.py) y escribe el informe en docs/PRECISION.md.
//
//   node pruebas/banco.mjs            → comprueba y muestra el resumen
//   node pruebas/banco.mjs --informe  → además reescribe docs/PRECISION.md
//
// Sale con código 1 si algún criterio no se cumple.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  geoAUtm, utmAGeo, geoAMgrs, mgrsAGeo, medir, destino, areaPoligono,
} from '../src/geo/index.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ref = (n) => JSON.parse(readFileSync(join(AQUI, 'referencia', `${n}.json`), 'utf8')).casos;

// Metros por grado (aprox.) para expresar errores angulares de posición en metros
const M_GRADO = 111320;
const difAng = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };

const resultados = [];
function criterio(nombre, n, maxErr, unidad, limite, extra = '') {
  const ok = maxErr <= limite;
  resultados.push({ nombre, n, maxErr, unidad, limite, ok, extra });
}
const fmt = (v) => (v === 0 ? '0' : v < 1e-3 ? v.toExponential(1) : v.toPrecision(3));

// ---------------------------------------------------------------- UTM
{
  const c = ref('utm');
  let eE = 0, eN = 0, eG = 0, eK = 0, eInv = 0, zonaMal = 0;
  for (const p of c) {
    const u = geoAUtm(p.lat, p.lon);
    if (u.zona !== p.zona || u.hemisferio !== p.hem) { zonaMal++; continue; }
    eE = Math.max(eE, Math.abs(u.este - p.e));
    eN = Math.max(eN, Math.abs(u.norte - p.n));
    eG = Math.max(eG, Math.abs(u.convergencia - p.gamma));
    eK = Math.max(eK, Math.abs(u.escala - p.k));
    const g = utmAGeo(p.zona, p.hem, p.e, p.n);
    eInv = Math.max(eInv, Math.hypot((g.lat - p.lat) * M_GRADO, difAng(g.lon, p.lon) * M_GRADO * Math.cos(p.lat * Math.PI / 180)));
  }
  criterio('UTM: zona y hemisferio', c.length, zonaMal, 'fallos', 0);
  criterio('UTM directa: Este', c.length, eE, 'm', 1e-6);
  criterio('UTM directa: Norte', c.length, eN, 'm', 1e-6);
  criterio('UTM inversa: posición', c.length, eInv, 'm', 1e-6);
  criterio('Convergencia de meridianos', c.length, eG, '°', 1e-9);
  criterio('Factor de escala', c.length, eK, '', 1e-12);
}

// ---------------------------------------------------------------- MGRS
for (const [nombre, archivo] of [['MGRS directa (5 precisiones)', 'mgrs_directa'], ['MGRS en bordes de cuadrícula (±1 µm y ±0,1 mm)', 'mgrs_bordes']]) {
  const c = ref(archivo);
  let fallos = 0; const ejemplos = [];
  for (const p of c) {
    const m = geoAMgrs(p.lat, p.lon, p.prec);
    if (m !== p.mgrs) { fallos++; if (ejemplos.length < 3) ejemplos.push(`${p.lat},${p.lon} p${p.prec}: ${m} ≠ ${p.mgrs}`); }
  }
  criterio(nombre, c.length, fallos, 'distintas', 0, ejemplos.join('; '));
}
{
  const c = ref('mgrs_inversa');
  let e = 0, fallos = 0;
  for (const p of c) {
    try {
      const g = mgrsAGeo(p.mgrs);
      e = Math.max(e, Math.hypot((g.lat - p.lat) * M_GRADO, difAng(g.lon, p.lon) * M_GRADO * Math.cos(p.lat * Math.PI / 180)));
    } catch { fallos++; }
  }
  criterio('MGRS inversa: centro del cuadrado', c.length, e, 'm', 1e-6);
  criterio('MGRS inversa: referencias no leídas', c.length, fallos, 'fallos', 0);
}

// ---------------------------------------------------------------- geodésicas
{
  const c = ref('geodesica_inversa');
  let eS = 0, eA1 = 0, eA2 = 0;
  for (const p of c) {
    const r = medir({ lat: p.lat1, lon: p.lon1 }, { lat: p.lat2, lon: p.lon2 });
    eS = Math.max(eS, Math.abs(r.distancia - p.s12));
    if (p.s12 > 0) {
      eA1 = Math.max(eA1, difAng(r.rumbo, p.azi1));
      eA2 = Math.max(eA2, difAng(r.rumboLlegada, p.azi2));
    }
  }
  criterio('Distancia sobre el elipsoide', c.length, eS, 'm', 1e-6);
  criterio('Rumbo de salida', c.length, eA1, '°', 1e-9);
  criterio('Rumbo de llegada', c.length, eA2, '°', 1e-9);
}
{
  const c = ref('geodesica_directa');
  let eP = 0, eA = 0;
  for (const p of c) {
    const r = destino({ lat: p.lat1, lon: p.lon1 }, p.azi1, p.s12);
    eP = Math.max(eP, Math.hypot((r.lat - p.lat2) * M_GRADO, difAng(r.lon, p.lon2) * M_GRADO * Math.cos(p.lat2 * Math.PI / 180)));
    eA = Math.max(eA, difAng(r.rumboLlegada, p.azi2));
  }
  criterio('Punto de destino (rumbo + distancia)', c.length, eP, 'm', 1e-6);
  criterio('Rumbo de llegada al destino', c.length, eA, '°', 1e-9);
}
{
  const c = ref('areas');
  let eA = 0, eP = 0;
  for (const p of c) {
    const r = areaPoligono(p.vertices.map(([lat, lon]) => ({ lat, lon })));
    eA = Math.max(eA, Math.abs(r.area - p.area));
    eP = Math.max(eP, Math.abs(r.perimetro - p.perimetro));
  }
  criterio('Área de polígono', c.length, eA, 'm²', 1e-3);
  criterio('Perímetro de polígono', c.length, eP, 'm', 1e-6);
}

// ---------------------------------------------------------------- informe
const fallan = resultados.filter((r) => !r.ok);
const ancho = Math.max(...resultados.map((r) => r.nombre.length));
for (const r of resultados) {
  console.log(`${r.ok ? '✔' : '✘'} ${r.nombre.padEnd(ancho)}  casos ${String(r.n).padStart(6)}  máx ${fmt(r.maxErr).padStart(8)} ${r.unidad.padEnd(9)} límite ${fmt(r.limite)}${r.extra ? '  ' + r.extra : ''}`);
}
console.log(fallan.length ? `\n${fallan.length} criterio(s) NO cumplido(s)` : `\nTodos los criterios cumplidos (${resultados.length}).`);

if (process.argv.includes('--informe')) {
  const filas = resultados.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.nombre} | ${r.n} | ${fmt(r.maxErr)} ${r.unidad} | ${fmt(r.limite)} ${r.unidad} |`).join('\n');
  const md = `# Informe de precisión del motor geodésico

Generado por \`node pruebas/banco.mjs --informe\` el ${new Date().toISOString().slice(0, 10)}.

**Referencia:** GeographicLib (C. F. F. Karney), compilada desde el código
oficial. Es la implementación de referencia mundial para estos cálculos.
Los puntos de prueba salen de \`pruebas/referencia/generar.py\` (semilla fija):
zona piloto de Guadarrama, toda la Península y Baleares, Canarias, cambios
de huso y de banda, y puntos a ±1 µm y ±0,1 mm de las líneas de cuadrícula MGRS.

| | Qué se comprueba | Casos | Error máximo | Límite |
|---|---|---|---|---|
${filas}

**Cómo leerlo:** "Error máximo" es la mayor diferencia encontrada entre
nuestro motor y la referencia en todos los casos. Un error de 1e-6 m es una
milésima de milímetro. En MGRS se exige que la referencia sea **idéntica**
letra a letra (0 distintas), incluidos los puntos pegados a una línea de
cuadrícula, que es donde falla un redondeo mal hecho.

**Lo que este informe NO cubre todavía:** conversión ED50 ↔ ETRS89 (pendiente
de la rejilla oficial del IGN) y declinación magnética (pendiente del modelo
WMM). Ver docs/ESPECIFICACION.md.
`;
  writeFileSync(join(AQUI, '..', 'docs', 'PRECISION.md'), md);
  console.log('docs/PRECISION.md actualizado');
}
process.exit(fallan.length ? 1 : 0);
