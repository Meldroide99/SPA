// Pruebas del creador de mapas (cálculos puros).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filasPoligono, contarTeselas, recorrerTeselas, repartirZooms, textoReparto, estimar,
  teselaX, teselaY, lonDeX, latDeY, metrosPixel, areaAproximada, poligonoEnTesela,
} from '../src/datos/creador.js';

// Verdad de referencia: una tesela entra si algún lado del polígono corta su
// rectángulo, si su centro está dentro del polígono o si contiene un vértice.
function cortaSegmentoRect([x1, y1], [x2, y2], r) {
  // Liang–Barsky
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - r.x0], [dx, r.x1 - x1], [-dy, y1 - r.y0], [dy, r.y1 - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
const dentro = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
function referencia(pol, z) {
  const P = pol.map((p) => [teselaX(p.lon, z), teselaY(p.lat, z)]);
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const set = new Set();
  for (let y = Math.floor(Math.min(...ys)); y <= Math.floor(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.floor(Math.max(...xs)); x++) {
      const r = { x0: x, x1: x + 1, y0: y, y1: y + 1 };
      const toca = P.some((p, i) => cortaSegmentoRect(p, P[(i + 1) % P.length], r)) || dentro(P, x + 0.5, y + 0.5);
      if (toca) set.add(`${x},${y}`);
    }
  }
  return set;
}

// Generador pseudoaleatorio fijo (repetible)
let semilla = 12345;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };

test('teselas de una zona irregular: coinciden con la referencia (polígonos cóncavos al azar)', () => {
  for (let caso = 0; caso < 60; caso++) {
    const z = 10 + (caso % 6);
    const c = { lat: 40.84 + (azar() - 0.5) * 0.2, lon: -3.42 + (azar() - 0.5) * 0.2 };
    const nv = 3 + Math.floor(azar() * 12);
    const pol = Array.from({ length: nv }, (_, i) => {
      const a = (2 * Math.PI * i) / nv, r = 0.01 + azar() * 0.06; // estrella: cóncava
      return { lat: c.lat + r * Math.sin(a), lon: c.lon + r * 1.3 * Math.cos(a) };
    });
    const ref = referencia(pol, z);
    const nuestro = new Set([...recorrerTeselas(pol, z)].map((t) => `${t.x},${t.y}`));
    assert.deepEqual([...nuestro].sort(), [...ref].sort(), `caso ${caso}, zoom ${z}`);
    assert.equal(contarTeselas(pol, z), ref.size);
  }
});

test('rectángulo alineado: número exacto de teselas y tramos ordenados sin solapes', () => {
  const z = 14;
  const x0 = 8000, x1 = 8010, y0 = 6100, y1 = 6105; // teselas completas (bordes interiores)
  const e = 1e-7;
  const pol = [
    { lat: latDeY(y0 + e, z), lon: lonDeX(x0 + e, z) }, { lat: latDeY(y0 + e, z), lon: lonDeX(x1 + 1 - e, z) },
    { lat: latDeY(y1 + 1 - e, z), lon: lonDeX(x1 + 1 - e, z) }, { lat: latDeY(y1 + 1 - e, z), lon: lonDeX(x0 + e, z) },
  ];
  assert.equal(contarTeselas(pol, z), 11 * 6);
  for (const f of filasPoligono(pol, z)) assert.deepEqual(f.tramos, [[x0, x1]]);
});

test('forma de U: la escotadura no se descarga', () => {
  const z = 15;
  const L = (x, y) => ({ lat: latDeY(y, z), lon: lonDeX(x, z) });
  // U de 10 teselas de ancho y 10 de alto con un hueco de 4 de ancho y 7 de alto
  const pol = [L(100.2, 100.2), L(109.8, 100.2), L(109.8, 109.8), L(100.2, 109.8), L(100.2, 100.2)].slice(0, 4);
  const u = [L(100.2, 100.2), L(102.8, 100.2), L(102.8, 106.8), L(107.2, 106.8), L(107.2, 100.2), L(109.8, 100.2), L(109.8, 109.8), L(100.2, 109.8)];
  assert.equal(contarTeselas(pol, z), 100);
  const t = new Set([...recorrerTeselas(u, z)].map((q) => `${q.x},${q.y}`));
  assert.ok(!t.has('104,103') && !t.has('105,100'), 'el hueco queda fuera');
  assert.ok(t.has('101,103') && t.has('108,103') && t.has('105,108'), 'los brazos y la base entran');
  assert.equal(t.size, 100 - 4 * 6); // columnas 103–106 en las filas 100–105 fuera
});

test('reparto de zooms: un archivo con cada zoom de su capa, o uno por capa', () => {
  const capas = [{ id: 'mtn', zMin: 12, zMax: 15 }, { id: 'hibrido', zMin: 15, zMax: 18 }, { id: 'relieve', zMin: 9, zMax: 11 }];
  const junto = repartirZooms(capas, 'junto');
  assert.equal(junto.archivos.length, 1);
  assert.deepEqual(junto.archivos[0].zooms.map((x) => `${x.z}${x.capa[0]}`), ['9r', '10r', '11r', '12m', '13m', '14m', '15m', '16h', '17h', '18h']);
  assert.deepEqual(junto.solapes, [{ z: 15, gana: 'mtn', pierde: 'hibrido' }]);
  assert.equal(textoReparto(junto.archivos[0].zooms, { mtn: 'Topográfico', hibrido: 'Híbrido', relieve: 'Relieve' }), '9–11 Relieve · 12–15 Topográfico · 16–18 Híbrido');
  const sep = repartirZooms(capas, 'separado');
  assert.equal(sep.archivos.length, 3);
  assert.deepEqual(sep.archivos[1].zooms.map((x) => x.z), [15, 16, 17, 18]);
});

test('medidas: metros por píxel, área y estimación', () => {
  assert.ok(Math.abs(metrosPixel(0, 0) - 156543.034) < 0.01);
  assert.ok(Math.abs(metrosPixel(40.84, 17) - 0.9033) < 0.001);
  // cuadrado de 0,01° × 0,01° en Uceda ≈ 1,11 km × 0,84 km
  const pol = [{ lat: 40.84, lon: -3.42 }, { lat: 40.84, lon: -3.41 }, { lat: 40.85, lon: -3.41 }, { lat: 40.85, lon: -3.42 }];
  const a = areaAproximada(pol);
  assert.ok(Math.abs(a - 1105740 * 0.01 * 0.8424 * 100) / a < 0.01, `área ${a}`);
  const e = estimar(pol, [{ z: 15, capa: 'mtn' }, { z: 16, capa: 'hibrido' }]);
  assert.equal(e.teselas, contarTeselas(pol, 15) + contarTeselas(pol, 16));
  assert.ok(e.megas > 0 && e.segundos > 0);
  const px = poligonoEnTesela(pol, 15, Math.floor(teselaX(-3.42, 15)), Math.floor(teselaY(40.85, 15)));
  assert.ok(px[3][0] >= 0 && px[3][0] < 256 && px[3][1] >= 0 && px[3][1] < 256, 'la esquina NO cae dentro de su tesela');
});
