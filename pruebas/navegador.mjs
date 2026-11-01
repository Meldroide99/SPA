// Prueba de la página del mapa en un navegador real (Chromium + Playwright).
//
//   node pruebas/navegador.mjs [--capturas]
//
// Las teselas de los mapas se sustituyen por imágenes lisas (la prueba no
// depende de internet). Comprueba la fase 3 (dibujar, editar, deshacer) y
// que las medidas que se muestran son las del motor geodésico.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright está instalado de forma global (no es dependencia del proyecto)
const { chromium } = createRequire(import.meta.url)('playwright');

const PUERTO = 8093;
const CAPTURAS = process.argv.includes('--capturas');
const servidor = spawn(process.execPath, ['herramientas/servidor.mjs', String(PUERTO)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

// PNG 1×1 gris claro (se estira a 256×256)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4/fs3AAXnAvM7qegZAAAAAElFTkSuQmCC', 'base64');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) fallos++; };

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1366, height: 820 }, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.route(/ign\.es|idee\.es|arcgisonline/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
const pag = await ctx.newPage();
const errores = [];
pag.on('pageerror', (e) => errores.push(e.message));
pag.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

await pag.goto(`http://localhost:${PUERTO}/mapa.html`);
await pag.evaluate(() => localStorage.clear());
await pag.reload();
await pag.waitForFunction(() => window.__spa?.dibujo);
await pag.evaluate(() => window.__spa.mapa.setView([40.79, -4.03], 14, { animate: false }));
await pag.waitForTimeout(300);

const caja = await pag.locator('#mapa').boundingBox();
const en = (fx, fy) => ({ x: caja.x + caja.width * fx, y: caja.y + caja.height * fy });
const clicEn = async (fx, fy) => { const p = en(fx, fy); await pag.mouse.click(p.x, p.y); await pag.waitForTimeout(60); };
const plan = () => pag.evaluate(() => JSON.parse(JSON.stringify(window.__spa.dibujo.plan())));

// ---------------------------------------------------------------- línea
await pag.click('[data-herr="linea"]');
await clicEn(0.45, 0.35); await clicEn(0.6, 0.45); await clicEn(0.55, 0.7);
await pag.keyboard.press('Enter');
let p = await plan();
ok(p.elementos.length === 1 && p.elementos[0].tipo === 'linea', 'Línea dibujada con 3 vértices y terminada con Intro');
ok(p.elementos[0].geometria.coordinates.length === 3, `La línea tiene 3 vértices (${p.elementos[0].geometria.coordinates.length})`);
// La longitud del panel es la del motor
const comp = await pag.evaluate(async () => {
  const { longitudLinea } = await import('./src/geo/index.js');
  const { puntosDe } = await import('./src/plan/plan.js');
  const el = window.__spa.dibujo.plan().elementos[0];
  const L = longitudLinea(puntosDe(el));
  return { motor: L, panel: document.querySelector('#panel-elemento .pm-total .grande').textContent };
});
const esperado = comp.motor >= 1000
  ? `${(comp.motor / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km`
  : `${comp.motor.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`;
ok(comp.panel === esperado, `Longitud en el panel = motor (${comp.panel} / ${esperado})`);
ok(await pag.locator('[data-herr="consultar"][aria-pressed="true"]').count() === 1, 'Al terminar vuelve a «Consultar» con el elemento seleccionado');
if (CAPTURAS) { mkdirSync('docs/capturas', { recursive: true }); await pag.screenshot({ path: 'docs/capturas/fase3-linea.png' }); }

// Nombre y bando
await pag.fill('#el-nombre', 'PL Roja'); await pag.keyboard.press('Enter'); await pag.waitForTimeout(50);
await pag.click('#panel-elemento [data-campo="el-bando"] [data-v="enemigo"]');
p = await plan();
ok(p.elementos[0].propiedades.nombre === 'PL Roja' && p.elementos[0].propiedades.bando === 'enemigo', 'Nombre y bando cambiados');

// ---------------------------------------------------------------- área (cerrar tocando el primer vértice)
await pag.click('[data-herr="area"]');
await clicEn(0.36, 0.3); await clicEn(0.46, 0.3); await clicEn(0.46, 0.55); await clicEn(0.36, 0.55);
await clicEn(0.36, 0.3);
p = await plan();
ok(p.elementos.length === 2 && p.elementos[1].tipo === 'area' && p.elementos[1].geometria.coordinates[0].length === 5, 'Área de 4 vértices cerrada tocando el primero');

// ---------------------------------------------------------------- círculo con radio escrito
await pag.click('[data-herr="circulo"]');
await clicEn(0.7, 0.3);
await pag.fill('#dib-radio-m', '1500'); await pag.keyboard.press('Enter');
p = await plan();
ok(p.elementos.length === 3 && p.elementos[2].propiedades.radio === 1500, 'Círculo de 1500 m con el radio escrito');

// ---------------------------------------------------------------- punto
await pag.click('[data-herr="punto"]');
await clicEn(0.66, 0.62);
p = await plan();
ok(p.elementos.length === 4 && p.elementos[3].tipo === 'punto', 'Punto dibujado');

// ---------------------------------------------------------------- editar: arrastrar un vértice y deshacer
await pag.click('.plan-el >> nth=0'); await pag.waitForTimeout(800);
const antes = (await plan()).elementos[0].geometria.coordinates[1];
const asa = pag.locator('.asa-vert').nth(1);
const b = await asa.boundingBox();
await pag.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await pag.mouse.down(); await pag.mouse.move(b.x + 80, b.y + 40, { steps: 6 }); await pag.mouse.up();
await pag.waitForTimeout(100);
const despues = (await plan()).elementos[0].geometria.coordinates[1];
ok(antes[0] !== despues[0], 'Arrastrar un vértice lo mueve');
await pag.keyboard.press('Control+z');
ok(JSON.stringify((await plan()).elementos[0].geometria.coordinates[1]) === JSON.stringify(antes), 'Ctrl+Z devuelve el vértice a su sitio');
await pag.keyboard.press('Control+y');
ok(JSON.stringify((await plan()).elementos[0].geometria.coordinates[1]) === JSON.stringify(despues), 'Ctrl+Y lo vuelve a mover');

// Añadir vértice en un punto medio y quitar con clic derecho
await pag.locator('.asa-media').first().click(); await pag.waitForTimeout(50);
ok((await plan()).elementos[0].geometria.coordinates.length === 4, 'Clic en punto medio añade un vértice');
await pag.locator('.asa-vert').nth(1).click({ button: 'right' }); await pag.waitForTimeout(50);
ok((await plan()).elementos[0].geometria.coordinates.length === 3, 'Clic derecho en un vértice lo quita');
if (CAPTURAS) await pag.screenshot({ path: 'docs/capturas/fase3-edicion.png' });

// Borrar con Supr y recuperar
await pag.keyboard.press('Delete');
ok((await plan()).elementos.length === 3, 'Supr borra el elemento seleccionado');
await pag.keyboard.press('Control+z');
ok((await plan()).elementos.length === 4, 'Ctrl+Z lo recupera');

// Persistencia local
await pag.reload(); await pag.waitForFunction(() => window.__spa?.dibujo);
ok((await plan()).elementos.length === 4, 'El plan sigue ahí al recargar la página');

// ---------------------------------------------------------------- copiar: la del cursor, no el centro
await pag.evaluate(() => window.__spa.mapa.setView([40.79, -4.03], 14, { animate: false }));
await pag.keyboard.press('Escape');
const q = en(0.15, 0.85);
await pag.mouse.move(q.x, q.y);
const enCursor = await pag.textContent('#be-mgrs');
await pag.click('#be-copiar');
const copiado = await pag.evaluate(() => navigator.clipboard.readText());
const centro = await pag.evaluate(async () => { const { geoAMgrs } = await import('./src/geo/index.js'); const c = window.__spa.mapa.getCenter(); return geoAMgrs(c.lat, c.lng, 5, { separado: true }); });
ok(copiado === enCursor && copiado !== centro, `«Copiar» copia la última posición del cursor (${copiado})`);
await pag.mouse.move(en(0.3, 0.8).x, en(0.3, 0.8).y);
await pag.keyboard.press('c');
const conTecla = await pag.evaluate(() => navigator.clipboard.readText());
ok(conTecla === await pag.textContent('#be-mgrs'), `Tecla C copia la coordenada bajo el cursor (${conTecla})`);

// ---------------------------------------------------------------- intensidad de la cuadrícula
await pag.evaluate(() => { const s = document.getElementById('cuad-intensidad'); s.value = '20'; s.dispatchEvent(new Event('input')); });
const opac = await pag.evaluate(() => [...document.querySelectorAll('.leaflet-cuadricula-pane path')].map((e) => Number(e.getAttribute('stroke-opacity'))));
ok(opac.length > 0 && Math.max(...opac) <= 0.85 * 0.2 + 1e-9, `Intensidad 20 %: opacidad máxima de líneas ${Math.max(...opac).toFixed(3)}`);

// ---------------------------------------------------------------- fondo automático por zoom
await pag.check('#fondo-auto');
await pag.evaluate(() => window.__spa.mapa.setZoom(17, { animate: false })); await pag.waitForTimeout(150);
const f17 = await pag.locator('.fondo[aria-pressed="true"]').getAttribute('data-id');
await pag.evaluate(() => window.__spa.mapa.setZoom(15, { animate: false })); await pag.waitForTimeout(150);
const f15 = await pag.locator('.fondo[aria-pressed="true"]').getAttribute('data-id');
ok(f17 === 'ortofoto' && f15 === 'mtn', `Automático: zoom 17 → ${f17}, zoom 15 → ${f15}`);
await pag.uncheck('#fondo-auto');

if (CAPTURAS) {
  await pag.evaluate(() => window.__spa.mapa.setView([40.79, -4.03], 14, { animate: false }));
  await pag.click('[data-herr="consultar"]');
  await pag.click('.plan-el >> nth=1'); await pag.waitForTimeout(800);
  await pag.screenshot({ path: 'docs/capturas/fase3-area.png' });
  await pag.setViewportSize({ width: 390, height: 780 }); await pag.waitForTimeout(300);
  await pag.screenshot({ path: 'docs/capturas/fase3-movil.png' });
}

ok(errores.length === 0, `Sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
await nav.close(); servidor.kill();
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodas las comprobaciones correctas');
process.exit(fallos ? 1 : 0);
