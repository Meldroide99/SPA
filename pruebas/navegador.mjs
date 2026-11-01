// Prueba de la página del mapa en un navegador real (Chromium + Playwright).
//
//   node pruebas/navegador.mjs [--capturas]
//
// Las teselas y el MDT se sustituyen por respuestas simuladas (la prueba no
// depende de internet). Si están los archivos reales de Balú (adjuntos de la
// sesión) se importan también.

import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const PUERTO = 8093;
const CAPTURAS = process.argv.includes('--capturas');
const ADJ = '/mnt/user-data/attachments/83f71dba-e38d-5cbc-87ae-83545dbf4640/';
const GPX = existsSync(`${ADJ}9d04d0e9-Ruta_Barriguetis.gpx`) ? `${ADJ}9d04d0e9-Ruta_Barriguetis.gpx` : null;
const SQLITE = existsSync('/mnt/user-data/uploads/UCEDA_25K.sqlite') ? '/mnt/user-data/uploads/UCEDA_25K.sqlite' : 'pruebas/datos/atak.sqlite';
const servidor = spawn(process.execPath, ['herramientas/servidor.mjs', String(PUERTO)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4/fs3AAXnAvM7qegZAAAAAElFTkSuQmCC', 'base64');
// MDT simulado: plano inclinado z = 800 + 1000·(lat−40) + 500·(lon+5) (malla de 0,002°)
const mdt = (url) => {
  const lat0 = Number(/Lat\(([-\d.]+),/.exec(url)[1]), lon0 = Number(/Long\(([-\d.]+),/.exec(url)[1]);
  const n = 4, d = 0.002, xll = Math.floor(lon0 / d) * d - d, yll = Math.floor(lat0 / d) * d - d;
  const filas = [];
  for (let j = n - 1; j >= 0; j--) filas.push(Array.from({ length: n }, (_, i) => (800 + 1000 * (yll + (j + 0.5) * d - 40) + 500 * (xll + (i + 0.5) * d + 5)).toFixed(3)).join(' '));
  return `--wcs\r\n\r\nncols ${n}\nnrows ${n}\nxllcorner ${xll}\nyllcorner ${yll}\ndx ${d}\ndy ${d}\n${filas.join('\n')}\n--wcs--`;
};
const zEsperada = (lat, lon) => 800 + 1000 * (lat - 40) + 500 * (lon + 5);

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) fallos++; };

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1366, height: 820 } });
const pedidas = [];
await ctx.route(/ign\.es\/wmts|idee\.es\/wmts|wms|arcgisonline|google\.com/, (r) => { pedidas.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); });
await ctx.route(/wcs-inspire\/mdt/, (r) => r.fulfill({ status: 200, contentType: 'multipart/related', body: mdt(r.request().url()), headers: { 'access-control-allow-origin': '*' } }));
const pag = await ctx.newPage();
const errores = [];
pag.on('pageerror', (e) => errores.push(e.message));
pag.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

await pag.goto(`http://localhost:${PUERTO}/mapa.html`);
await pag.evaluate(() => { localStorage.clear(); return new Promise((r) => { const q = indexedDB.deleteDatabase('spa'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); });
await pag.reload();
await pag.waitForFunction(() => window.__spa?.dibujo);
const vista = (lat, lon, z) => pag.evaluate(([a, b, c]) => window.__spa.mapa.setView([a, b], c, { animate: false }), [lat, lon, z]);
await vista(40.79, -4.03, 14);
await pag.waitForTimeout(300);
const caja = await pag.locator('#mapa').boundingBox();
const en = (fx, fy) => ({ x: caja.x + caja.width * fx, y: caja.y + caja.height * fy });
const clicEn = async (fx, fy, opc) => { const p = en(fx, fy); await pag.mouse.click(p.x, p.y, opc); await pag.waitForTimeout(60); };
const plan = () => pag.evaluate(() => JSON.parse(JSON.stringify(window.__spa.dibujo.plan())));
const motor = (codigo) => pag.evaluate(codigo);

// ---------------------------------------------------------------- lo que se quitó
ok(await pag.locator('#be-copiar, .be-prefs, [data-pref="precision"], .enlaces a').count() === 0, 'Sin «Copiar», sin 1 m/10 m/100 m y sin enlace a la calculadora');
await clicEn(0.5, 0.5);
ok((await plan()).elementos.length === 0 && await pag.locator('.pto-elem').count() === 0, 'Con «Mover», pinchar el mapa no pone ningún punto');

// ---------------------------------------------------------------- ajustes
await pag.click('#btn-ajustes');
ok(await pag.isVisible('#ajustes'), 'El icono de ajustes abre el panel');
await pag.click('[data-pref="coordenadas"] [data-v="utm"]');
await pag.mouse.move(en(0.5, 0.6).x, en(0.5, 0.6).y);
ok(/^30N \d{6} E \d{7} N$/.test(await pag.textContent('#be-coord')), `Coordenada en UTM: ${await pag.textContent('#be-coord')}`);
await pag.click('[data-pref="coordenadas"] [data-v="mgrs"]');
await pag.click('#btn-ajustes');
await pag.waitForTimeout(400);
const alt = await pag.textContent('#be-alt');
const cur = await motor(() => { const c = document.getElementById('be-coord').textContent; return c; });
ok(/^\d+ m$/.test(alt), `Altitud bajo el cursor: ${alt} (${cur})`);

// ---------------------------------------------------------------- punto y su ficha (altitud)
await pag.click('[data-herr="punto"]');
await clicEn(0.42, 0.45);
let p = await plan();
ok(p.elementos.length === 1 && p.elementos[0].tipo === 'punto', 'Punto dibujado solo con la herramienta Punto');
await pag.waitForTimeout(400);
const P0 = p.elementos[0].geometria.coordinates;
const altPunto = await pag.textContent('#el-altitud');
ok(altPunto === `${Math.round(zEsperada(P0[1], P0[0]))} m`, `Altitud del punto redondeada al metro: ${altPunto} (esperada ${Math.round(zEsperada(P0[1], P0[0]))} m)`);
ok(await pag.locator('#panel-elemento #el-nombre').count() === 1 && await pag.locator('#panel-elemento [data-campo="el-estado"]').count() === 1, 'Ficha del punto: nombre, bando, presente/previsto, coordenada y altitud');
if (CAPTURAS) { mkdirSync('docs/capturas', { recursive: true }); await pag.screenshot({ path: 'docs/capturas/v4-punto.png' }); }

// ---------------------------------------------------------------- línea: imán, clic derecho, mover y eliminar punto
await pag.click('[data-herr="linea"]');
const pPunto = await motor(() => { const c = window.__spa.dibujo.plan().elementos[0].geometria.coordinates; const q = window.__spa.mapa.latLngToContainerPoint([c[1], c[0]]); return { x: q.x, y: q.y }; });
await pag.mouse.click(caja.x + pPunto.x + 6, caja.y + pPunto.y + 5); await pag.waitForTimeout(60); // cerca del punto: se une
await clicEn(0.55, 0.40); await clicEn(0.6, 0.55); await clicEn(0.5, 0.7);
await clicEn(0.5, 0.7, { button: 'right' }); // quita el último
let b = await motor(() => window.__spa.dibujo.dibujando);
ok(b, 'Sigue dibujando tras el clic derecho');
await clicEn(0.65, 0.68);
// Mantener pulsado el segundo punto → menú → eliminar
const asas = pag.locator('.asa-borrador');
ok(await asas.count() === 4, `4 puntos en la línea en curso (${await asas.count()})`);
const bx = await asas.nth(2).boundingBox();
await pag.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await pag.mouse.down(); await pag.waitForTimeout(700); await pag.mouse.up();
await pag.waitForTimeout(100);
ok(await pag.isVisible('.menu-punto [data-menu="eliminar"]'), 'Mantener pulsado un punto abre el menú');
await pag.click('.menu-punto [data-menu="eliminar"]');
ok(await pag.locator('.asa-borrador').count() === 3, 'Eliminar quita ese punto');
// Arrastrar un punto lo mueve
const b1 = await pag.locator('.asa-borrador').nth(1).boundingBox();
await pag.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await pag.mouse.down();
await pag.mouse.move(b1.x + 60, b1.y + 30, { steps: 5 }); await pag.mouse.up(); await pag.waitForTimeout(100);
await pag.keyboard.press('Enter');
p = await plan();
const lin = p.elementos[1];
ok(lin?.tipo === 'linea' && lin.geometria.coordinates.length === 3, `Línea de 3 puntos (${lin?.geometria.coordinates.length})`);
ok(JSON.stringify(lin.geometria.coordinates[0]) === JSON.stringify(P0), 'El primer punto se unió exactamente al punto existente (imán)');
await pag.waitForTimeout(500);
const comp = await motor(async () => {
  const { longitudLinea } = await import('./src/geo/index.js');
  const el = window.__spa.dibujo.plan().elementos[1];
  const L = longitudLinea(el.geometria.coordinates.map(([lon, lat]) => ({ lat, lon })));
  return { L, panel: document.querySelector('#panel-elemento .pm-total .grande').textContent, desnivel: document.getElementById('el-desnivel')?.textContent, perfil: Boolean(document.querySelector('#el-perfil svg')), tramos: document.querySelectorAll('#panel-elemento .pm-tramos').length };
});
const esperado = comp.L >= 1000 ? `${(comp.L / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km` : `${comp.L.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`;
ok(comp.panel === esperado, `Distancia total = motor (${comp.panel})`);
ok(comp.perfil && /↗/.test(comp.desnivel) && comp.tramos === 0, `Perfil y desnivel, sin tabla de tramos (${comp.desnivel?.replace(/\s+/g, ' ').trim()})`);
// Estilo de línea
await pag.click('#panel-elemento [data-campo="el-trazo"] [data-v="discontinuo"]');
await pag.click('#panel-elemento [data-campo="el-grosor"] [data-v="5"]');
await pag.locator('#panel-elemento input[type=color]').evaluate((i) => { i.value = '#7a3db8'; i.dispatchEvent(new Event('change', { bubbles: true })); });
p = await plan();
ok(p.elementos[1].propiedades.trazo === 'discontinuo' && p.elementos[1].propiedades.grosor === 5 && p.elementos[1].propiedades.color === '#7a3db8', 'Trazo, grosor y color libre de la línea');
await pag.click('#panel-elemento [data-campo="el-bando"] [data-v="enemigo"]');
p = await plan();
ok(p.elementos[1].propiedades.bando === 'enemigo' && p.elementos[1].propiedades.color === null, 'Volver a un color de bando');
if (CAPTURAS) await pag.screenshot({ path: 'docs/capturas/v4-linea.png' });

// ---------------------------------------------------------------- importar GPX y paquete ATAK
await pag.click('[data-herr="consultar"]');
await pag.click('#btn-plan');
ok(await pag.isVisible('#panel-plan'), 'Botón «Plan» abre el panel con lo dibujado e importado');
await pag.setInputFiles('#entrada-datos', [GPX ?? 'pruebas/datos/paquete_atak.zip', 'pruebas/datos/paquete_atak.zip']);
await pag.waitForFunction(() => window.__spa.importar.grupos.length >= 2, null, { timeout: 10000 });
const grupos = await motor(() => window.__spa.importar.grupos.map((g) => ({ n: g.nombre, f: g.formato, e: g.elementos.length })));
ok(grupos.length === 2, `Importados: ${grupos.map((g) => `${g.n} (${g.f}, ${g.e})`).join(' · ')}`);
if (GPX) ok(grupos[0].e === 8, 'GPX de ATAK: 7 puntos + 1 ruta');
// Ficha de un punto CoT (HAE → altitud)
await pag.click('#importados-lista [data-g] >> nth=1 >> [data-acc="abrir"]');
await pag.click('#importados-lista .plan-el >> text=ENE 1');
await pag.waitForTimeout(600);
const ficha = await pag.textContent('#panel-elemento');
ok(/elipsoidal \(HAE\) ≈ \d+ m sobre el nivel del mar/.test(ficha), 'Punto de ATAK: altura HAE convertida con el geoide del IGN');
await pag.click('#panel-elemento [data-imp="al-plan"]');
p = await plan();
ok(p.elementos.some((e) => e.propiedades.nombre === 'ENE 1' && e.propiedades.bando === 'enemigo'), '«Pasar al plan» lo vuelve editable');
if (CAPTURAS) await pag.screenshot({ path: 'docs/capturas/v4-importados.png' });

// ---------------------------------------------------------------- mapas importados
await pag.setInputFiles('#entrada-mapa', [SQLITE]);
const mapaDe = async (patron) => (await motor(() => window.__spa.importar.mapas.map((m) => ({ n: m.nombre, i: m.info, e: m.error })))).find((m) => patron.test(m.n));
await pag.waitForFunction(() => window.__spa.importar.mapas.some((m) => /sqlite/.test(m.nombre) && (m.info || m.error)), null, { timeout: 15000 });
const ma = await mapaDe(/sqlite/);
ok(/ATAK · zoom/.test(ma.i), `Mapa ATAK importado: ${ma.n} · ${ma.i}`);
ok(await mapaDe(/Croquis/), 'La imagen del KMZ (dentro del paquete) entra como mapa superpuesto');
await pag.waitForTimeout(1500);
const teselasMapa = await motor(() => [...document.querySelectorAll('.leaflet-mapasImportados-pane img')].filter((i) => i.naturalWidth === 256).length);
ok(teselasMapa > 0, `Se pintan sus teselas (${teselasMapa})`);
await pag.setInputFiles('#entrada-mapa', ['pruebas/datos/utm25830_lzw.tif', 'pruebas/datos/ed50_23030_packbits.tif']);
await pag.waitForFunction(() => window.__spa.importar.mapas.length >= 4 && window.__spa.importar.mapas.every((m) => m.info || m.error), null, { timeout: 15000 });
const t1 = await mapaDe(/25830/), t2 = await mapaDe(/23030/);
ok(/ETRS89 \/ UTM 30N/.test(t1.i) && /ED50 \/ UTM 30N/.test(t2.i), `GeoTIFF reconocidos solos: ${t1.i} | ${t2.i}`);
await pag.waitForTimeout(1500);
const lienzos = await motor(() => [...document.querySelectorAll('.leaflet-mapasImportados-pane canvas')].filter((c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let k = 3; k < d.length; k += 16) if (d[k]) return true; return false;
}).length);
ok(lienzos > 0, `GeoTIFF reproyectados y pintados (${lienzos} teselas con imagen)`);
if (CAPTURAS) await pag.screenshot({ path: 'docs/capturas/v4-mapas.png' });

// ---------------------------------------------------------------- capas: detalle MTN25 y Google
await pag.click('.fondo[data-id="mtn"]');
await vista(40.79, -4.03, 14); await pag.waitForTimeout(400);
pedidas.length = 0;
await pag.check('#mtn-detalle'); await pag.waitForTimeout(600);
const matrices = new Set(pedidas.filter((u) => /mapa-raster/.test(u)).map((u) => /TILEMATRIX=(\d+)/.exec(u)?.[1]));
ok(matrices.has('15') && !matrices.has('14'), `Mantener detalle: a zoom 14 se piden teselas del 15 (${[...matrices].join(',')})`);
ok(pedidas.some((u) => /FORMAT=image%2Fpng/.test(u)), 'Topográfico en PNG');
await pag.uncheck('#mtn-detalle');
pedidas.length = 0;
await pag.click('.fondo[data-id="satelite"]'); await pag.waitForTimeout(500);
ok(pedidas.some((u) => /mt\d\.google\.com\/vt\/lyrs=s/.test(u)), 'Fondo satélite de Google');

// ---------------------------------------------------------------- persistencia
await pag.reload(); await pag.waitForFunction(() => window.__spa?.importar);
await pag.waitForTimeout(1500);
const tras = await motor(() => ({ g: window.__spa.importar.grupos.length, m: window.__spa.importar.mapas.length, p: window.__spa.dibujo.plan().elementos.length }));
ok(tras.g === 2 && tras.m === 4 && tras.p === 3, `Tras recargar siguen el plan (${tras.p}), los archivos (${tras.g}) y los mapas (${tras.m})`);

if (CAPTURAS) {
  await pag.setViewportSize({ width: 390, height: 780 }); await pag.waitForTimeout(300);
  await pag.screenshot({ path: 'docs/capturas/v4-movil.png' });
}
ok(errores.length === 0, `Sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
await nav.close(); servidor.kill();
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodas las comprobaciones correctas');
process.exit(fallos ? 1 : 0);
