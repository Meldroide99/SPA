// Pruebas de símbolos APP-6(E): SIDC, dibujo de unidades y geometría de
// medidas de coordinación y cometidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sidc, svgUnidad, ENTIDADES, IDENTIDADES, ESCALONES } from '../src/simbolos/app6.js';
import { ARMAS, nombreUnidad, especialidadDe } from '../src/simbolos/catalogo.js';
import { MEDIDAS, geometria, puntosNecesarios } from '../src/simbolos/medidas.js';
import { medir } from '../src/geo/index.js';

test('SIDC de 30 dígitos según el anexo A de la APP-6(E)', () => {
  // Ejemplo del propio anexo A.14 (cambiando el conjunto a unidad terrestre):
  // 16 · 0 · 3 · 10 · 0 · 2 · 16 · 120401 · 00 · 06 · 0 · 1
  const s = { identidad: 'amigo', icono: '120401', mod2: 'c106', escalon: 'batallon', cg: true };
  assert.equal(sidc(s), '160310021612040100060100000000');
  assert.equal(sidc(s).length, 30);
  // Sección (pelotón OTAN ••• = 14) paracaidista enemiga prevista, finta + agrupación táctica
  const e = sidc({ identidad: 'hostil', icono: '121100', mod2: 'c100', escalon: 'seccion', estado: 'previsto', finta: true, ft: true });
  assert.equal(e.slice(0, 10), '1606101514');
  assert.equal(e.slice(10, 20), '1211000000');
  assert.equal(e.slice(20, 22), '01');
  // Modificador del propio conjunto (lanzacohetes, 41) en el sector 1
  assert.equal(sidc({ identidad: 'amigo', icono: '130300', mod1: 'u41' }).slice(16, 22), '410000');
});

test('Escalones del ET con la marca de la tabla 1-8 (sección = •••, compañía = I)', () => {
  assert.equal(ESCALONES.seccion.marca, '•••');
  assert.equal(ESCALONES.seccion.codigo, '14');
  assert.equal(ESCALONES.compania.marca, 'I');
  assert.equal(ESCALONES.brigada.marca, 'X');
});

test('Todas las unidades del catálogo se dibujan con las 7 identidades', () => {
  for (const a of ARMAS) for (const t of a.tipos) {
    assert.ok(ENTIDADES[t.icono], `icono ${t.icono} de ${t.nombre}`);
    for (const id of Object.keys(IDENTIDADES)) {
      const r = svgUnidad({ identidad: id, icono: t.icono, mod1: t.mod1, mod2: t.mod2, escalon: 'compania', T: '1', M: 'II/4', cg: true, ft: true, finta: true, refuerzo: '+' });
      assert.match(r.svg, /^<svg[^>]+viewBox="[-\d. ]+"/);
      assert.ok(r.ancho > 0 && r.alto > 0 && r.ancla.y > r.alto * 0.7, `ancla del CG abajo (${t.nombre}, ${id})`);
      assert.doesNotMatch(r.svg, /NaN|undefined/);
    }
  }
});

test('Ancla: centro del marco sin CG; extremo del mástil con CG (APP-6(E) 1.2.6)', () => {
  const sin = svgUnidad({ identidad: 'amigo', icono: '121100' }, { tam: 100 });
  assert.ok(Math.abs(sin.ancla.x - sin.ancho / 2) < 1 && Math.abs(sin.ancla.y - sin.alto / 2) < 1);
  const con = svgUnidad({ identidad: 'amigo', icono: '121100', cg: true }, { tam: 100 });
  assert.ok(con.ancla.x < 10 && Math.abs(con.ancla.y - (con.alto - 6)) < 1);
});

test('Nombres en castellano (PD0-002)', () => {
  assert.equal(nombreUnidad({ icono: '121100', mod2: 'c100', escalon: 'seccion' }), 'Sección de infantería paracaidista');
  assert.equal(nombreUnidad({ icono: '130301', escalon: 'compania' }), 'Batería de campaña autopropulsada');
  assert.equal(nombreUnidad({ icono: '120501', escalon: 'batallon' }), 'Grupo de caballería acorazado');
  assert.equal(especialidadDe({ icono: '121102', mod2: 'c106' }).tipo.nombre, 'Protegida (ruedas)');
});

test('Medidas y cometidos: geometría válida y anclas exactas', () => {
  const base = { lat: 40.8, lon: -4.0 };
  const desde = (dx, dy) => ({ lat: base.lat + dy / 111000, lon: base.lon + dx / (111000 * Math.cos((base.lat * Math.PI) / 180)) });
  const ej = [desde(0, 0), desde(800, 50), desde(400, 600), desde(-300, 400), desde(100, -300)];
  for (const m of MEDIDAS) {
    const n = m.n ?? Math.max(puntosNecesarios(m), m.tipo === 'area' ? 4 : 2);
    const g = geometria(m, ej.slice(0, n), { nombre: 'ROJA', escalonMarca: 'II' });
    const todos = [...g.lineas.flatMap((l) => l.pts), ...g.textos.map((t) => t.pos)];
    for (const p of todos) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${m.id}: coordenadas finitas`);
    if (m.tipo !== 'punto') assert.ok(g.lineas.length > 0, `${m.id}: dibuja algo`);
    // Todo el gráfico cerca de sus anclas (< 3 km para anclas de < 1 km)
    for (const p of todos) assert.ok(medir(base, { lat: p[0], lon: p[1] }).distancia < 3000, `${m.id}: dentro de su zona`);
  }
  // Las líneas (PL, LD…) pasan exactamente por sus puntos
  const pl = geometria(MEDIDAS.find((m) => m.id === 'pl'), ej.slice(0, 3), { nombre: 'ROJA' });
  pl.lineas[0].pts.forEach((p, i) => { assert.ok(Math.abs(p[0] - ej[i].lat) < 1e-12 && Math.abs(p[1] - ej[i].lon) < 1e-12); });
  assert.deepEqual(pl.textos.map((t) => t.texto), ['PL ROJA', 'PL ROJA']);
  // Destruir: X centrada en el punto 1 con la D en el centro
  const d = geometria(MEDIDAS.find((m) => m.id === 'destruir'), [ej[0], desde(200, 200)], {});
  assert.equal(d.lineas.length, 4);
  assert.equal(d.textos[0].texto, 'D');
  assert.ok(medir(base, { lat: d.textos[0].pos[0], lon: d.textos[0].pos[1] }).distancia < 0.01);
});
