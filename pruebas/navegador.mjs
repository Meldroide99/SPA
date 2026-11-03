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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4XmM4cWIfAASqAk/sgDdwAAAAAElFTkSuQmCC', 'base64');
// MDT simulado: plano inclinado z = 800 + 1000·(lat−40) + 500·(lon+5) (malla de 0,002°)
const mdt = (url) => {
  const [, la0, la1] = /Lat\(([-\d.]+),([-\d.]+)\)/.exec(url).map(Number), [, lo0, lo1] = /Long\(([-\d.]+),([-\d.]+)\)/.exec(url).map(Number);
  const d = Math.max(0.0005, (la1 - la0) / 60), xll = Math.floor(lo0 / d) * d - d, yll = Math.floor(la0 / d) * d - d;
  const nx = Math.ceil((lo1 - xll) / d) + 2, ny = Math.ceil((la1 - yll) / d) + 2;
  const filas = [];
  for (let j = ny - 1; j >= 0; j--) filas.push(Array.from({ length: nx }, (_, i) => { const lat = yll + (j + 0.5) * d, lon = xll + (i + 0.5) * d; return (800 + 1000 * (lat - 40) + 500 * (lon + 5) + 30 * Math.sin(lat * 900) * Math.cos(lon * 700)).toFixed(3); }).join(' '));
  return `--wcs\r\n\r\nncols ${nx}\nnrows ${ny}\nxllcorner ${xll}\nyllcorner ${yll}\ndx ${d}\ndy ${d}\n${filas.join('\n')}\n--wcs--`;
};
// Altitud esperada (la ondulación del simulado es pequeña: se compara con tolerancia)
const zEsperada = (lat, lon) => 800 + 1000 * (lat - 40) + 500 * (lon + 5) + 30 * Math.sin(lat * 900) * Math.cos(lon * 700);

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) fallos++; };

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1366, height: 820 }, acceptDownloads: true });
const pedidas = [];
await ctx.route(/ign\.es\/wmts|idee\.es\/wmts|wms|arcgisonline|google\.com/, (r) => { pedidas.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }); });
await ctx.route(/wcs-inspire\/mdt/, (r) => { pedidas.push(r.request().url()); r.fulfill({ status: 200, contentType: 'multipart/related', body: mdt(r.request().url()), headers: { 'access-control-allow-origin': '*' } }); });
await ctx.route(/pnoa-ma\?SERVICE=WMS&VERSION=1\.3\.0&REQUEST=GetFeatureInfo/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h2>Informaci&oacute;n PNOA</h2> Fecha (a&ntilde;o-mes) 2024-07 Resoluci&oacute;n (metros) 0.25</body></html>' }));
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
/** Las herramientas se esconden: se acerca el ratón arriba y luego se pulsa. */
const herr = async (sel) => {
  await pag.mouse.move(caja.x + 60, caja.y + 15); await pag.waitForTimeout(350);
  await pag.click(sel); await pag.waitForTimeout(50);
};

// ---------------------------------------------------------------- barra de herramientas escondida
await pag.mouse.move(en(0.5, 0.6).x, en(0.5, 0.6).y); await pag.waitForTimeout(600);
ok(!(await pag.locator('#herramientas.visible').count()), 'Herramientas escondidas mientras el ratón está lejos');
await pag.mouse.move(caja.x + 80, caja.y + 20); await pag.waitForTimeout(400);
ok(await pag.locator('#herramientas.visible').count() === 1, 'Aparecen al acercar el ratón arriba');

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
await herr('[data-herr="punto"]');
await clicEn(0.42, 0.45);
let p = await plan();
ok(p.elementos.length === 1 && p.elementos[0].tipo === 'punto', 'Punto dibujado solo con la herramienta Punto');
await pag.waitForTimeout(400);
const P0 = p.elementos[0].geometria.coordinates;
const altPunto = await pag.textContent('#el-altitud');
ok(Math.abs(parseInt(altPunto, 10) - zEsperada(P0[1], P0[0])) <= 1, `Altitud del punto redondeada al metro: ${altPunto} (esperada ${Math.round(zEsperada(P0[1], P0[0]))} m)`);
ok(await pag.locator('#panel-elemento #el-nombre').count() === 1 && await pag.locator('#panel-elemento [data-campo="el-estado"]').count() === 1, 'Ficha del punto: nombre, bando, presente/previsto, coordenada y altitud');
if (CAPTURAS) { mkdirSync('docs/capturas', { recursive: true }); await pag.screenshot({ path: 'docs/capturas/v4-punto.png' }); }

// ---------------------------------------------------------------- línea: imán, clic derecho, mover y eliminar punto
await herr('[data-herr="linea"]');
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
await herr('[data-herr="consultar"]');
await herr('#btn-plan');
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
ok(/En el archivo\s*\d+ m s\. n\. m\./.test(ficha) && !/HAE|elipsoidal/.test(ficha), 'Punto de ATAK: altura HAE convertida con el geoide del IGN (solo sobre el nivel del mar)');
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
const teselasMapa = await motor(() => [...document.querySelectorAll('.leaflet-mapasImportados-pane canvas')].filter((c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let k = 3; k < d.length; k += 4096) if (d[k]) return true; return false; }).length);
ok(teselasMapa > 0, `Se pintan sus teselas (${teselasMapa})`);
// En pantalla: el mapa importado tapa el fondo a todos los zooms (el fondo simulado es gris liso)
{
  const tapado = [];
  for (const z of [13, 15, 17, 19, 21]) {
    await motor((z) => { const s = window.__spa; const m = s.importar.mapas.find((x) => /sqlite/.test(x.nombre)); s.mapa.setView([(m.limites.sur + m.limites.norte) / 2, (m.limites.oeste + m.limites.este) / 2], z, { animate: false }); }, z);
    await pag.waitForTimeout(1500);
    const png = (await pag.screenshot()).toString('base64');
    tapado.push(await pag.evaluate(async (b64) => {
      const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const r = document.getElementById('mapa').getBoundingClientRect(); let fondo = 0, n = 0;
      for (let i = r.left + r.width * 0.35; i < r.left + r.width * 0.65; i += 12) for (let j = r.top + r.height * 0.35; j < r.top + r.height * 0.65; j += 12) {
        const d = x.getImageData(i, j, 1, 1).data; n++; if (Math.abs(d[0] - 200) < 3 && Math.abs(d[1] - 200) < 3 && Math.abs(d[2] - 190) < 3) fondo++; }
      return fondo / n;
    }, png));
  }
  ok(tapado.every((f) => f < 0.05), `El mapa importado se ve encima del fondo en pantalla a zoom 13–21 (fondo visible: ${tapado.map((f) => `${Math.round(f * 100)} %`).join(', ')})`);
}
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

// ---------------------------------------------------------------- capas: detalle MTN25, híbrido, relieve
await pag.click('.fondo[data-id="mtn"]');
await vista(40.79, -4.03, 14); await pag.waitForTimeout(400);
pedidas.length = 0;
const abrirAjuste = async (sec) => {
  if (await pag.locator('#ajustes').isHidden()) await pag.click('#btn-ajustes');
  await pag.evaluate((s) => { document.querySelector(`.aj-sec[data-aj="${s}"]`).open = true; }, sec);
};
const cerrarAjustes = async () => { if (!(await pag.locator('#ajustes').isHidden())) await pag.click('#btn-ajustes'); };
ok(await motor(() => !document.querySelector('#panel-capas #imagen-fuente, #panel-capas #rotulos, #panel-capas #mtn-detalle, #panel-capas #fondo-auto, #panel-capas #cuad-intensidad')), 'Capas › Fondo solo con los fondos: las opciones están en Ajustes');
ok((await pag.locator('#ajustes .aj-sec').count()) >= 4, 'Ajustes en apartados desplegables');
await abrirAjuste('fondos');
await pag.check('#mtn-detalle'); await pag.waitForTimeout(600);
const matrices = new Set(pedidas.filter((u) => /mapa-raster/.test(u)).map((u) => /TILEMATRIX=(\d+)/.exec(u)?.[1]));
ok(matrices.has('15') && !matrices.has('14'), `Mantener detalle: a zoom 14 se piden teselas del 15 (${[...matrices].join(',')})`);
ok(pedidas.some((u) => /FORMAT=image%2Fpng/.test(u)), 'Topográfico en PNG');
await pag.uncheck('#mtn-detalle');
await cerrarAjustes();
await vista(40.79, -4.03, 21); await pag.waitForTimeout(500);
ok(await motor(() => document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded').length > 0), 'Topográfico visible también a zoom 21 (no desaparece al acercar)');
await vista(40.79, -4.03, 14);
const colorCuad = () => motor(() => { const p = document.querySelector('.leaflet-cuadricula-pane path'); return p ? { c: p.getAttribute('stroke'), claro: document.querySelector('.leaflet-cuadricula-pane').classList.contains('cuad-claro') } : null; });
const cuadMtn = await colorCuad();
ok(await pag.locator('.fondo[data-id="ortofoto"], .fondo[data-id="satelite"], input[data-id="vertices"]').count() === 0, 'Sin ortofoto suelta, sin satélite suelto y sin vértices geodésicos');
pedidas.length = 0;
await pag.click('.fondo[data-id="hibrido"]'); await pag.waitForTimeout(500);
ok(pedidas.some((u) => /lyrs=s&/.test(u)) && pedidas.some((u) => /lyrs=h&/.test(u)), 'Híbrido: imagen de Google + rótulos');
const cuadHib = await colorCuad();
ok(!cuadMtn || (cuadMtn.c !== '#FFFFFF' && !cuadMtn.claro), 'Cuadrícula oscura sobre el topográfico');
ok(cuadHib?.c === '#FFFFFF' && cuadHib.claro, 'Cuadrícula en blanco sobre el híbrido');
pedidas.length = 0;
await abrirAjuste('imagen');
await pag.click('#imagen-fuente [data-v="pnoa"]'); await pag.waitForTimeout(1200);
ok(pedidas.some((u) => /pnoa-ma\?SERVICE=WMTS/.test(u)), 'Híbrido con la imagen del IGN (PNOA)');
ok(/julio 2024 · 25 cm/.test(await pag.textContent('#imagen-fecha')), `Fecha de la imagen: ${await pag.textContent('#imagen-fecha')}`);
await pag.click('#imagen-fuente [data-v="google"]');
await cerrarAjustes();
pedidas.length = 0;
await vista(40.79, -4.03, 13);
await pag.click('.fondo[data-id="relieve"]'); await pag.waitForTimeout(1500);
const relieve = await motor(() => [...document.querySelectorAll('.leaflet-tile-pane canvas')].filter((c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let k = 3; k < d.length; k += 64) if (d[k]) return true; return false; }).length);
ok(relieve > 0, `Relieve calculado con el MDT y pintado (${relieve} teselas)`);
ok(pedidas.some((u) => /CoverageId=Elevacion4258_25&.*FORMAT=application\/asc&SCALESIZE/.test(u)), 'A zoom 13 el relieve pide el MDT (malla del zoom) en ASCII Grid');
await pag.click('.fondo[data-id="mtn"]');

// ---------------------------------------------------------------- mapa importado: encontrarlo y ponerlo encima
await pag.click('.seccion[data-sec="mapas"] > summary');
await vista(40.0, -1.0, 8); await pag.waitForTimeout(300);
await pag.click('#mapas-importados .mi-nom >> text=/sqlite/'); await pag.waitForTimeout(1300);
const selMapa = await motor(() => { const m = window.__spa.importar.mapas.find((x) => /sqlite/.test(x.nombre)); return { pane: m.capa.options.pane, marco: document.querySelectorAll('.leaflet-marcoMapa-pane .marco-mapa').length, zoom: window.__spa.mapa.getZoom(), dentro: window.__spa.mapa.getBounds().contains([m.limites.sur, m.limites.oeste]) }; });
ok(selMapa.pane === 'mapaSeleccionado' && selMapa.marco === 1 && selMapa.dentro, `Clic en el mapa de la lista: lo encuadra (zoom ${selMapa.zoom}), marco llamativo y encima de todo`);
if (CAPTURAS) await pag.screenshot({ path: 'docs/capturas/v5-mapa-seleccionado.png' });

// Ventana «Buscar en mis mapas»: entera dentro de la pantalla (también en una pantalla pequeña)
for (const [w, h] of [[1366, 820], [800, 560]]) {
  await pag.setViewportSize({ width: w, height: h });
  await motor(() => window.__spa.importar.abrirBuscador()); await pag.waitForTimeout(300);
  const caja = await motor(() => { const r = document.querySelector('#dialogo .dlg').getBoundingClientRect(); const b = document.getElementById('cat-cerrar').getBoundingClientRect(); return { r: [r.left, r.top, r.right, r.bottom], b: b.bottom, w: innerWidth, h: innerHeight, sw: document.querySelector('#dialogo .dlg').scrollWidth, cw: document.querySelector('#dialogo .dlg').clientWidth }; });
  ok(caja.r[0] >= 0 && caja.r[1] >= 0 && caja.r[2] <= caja.w && caja.r[3] <= caja.h && caja.b <= caja.h && caja.sw <= caja.cw + 1, `Buscar en mis mapas se ve entera a ${w}×${h}`);
  await pag.click('#cat-cerrar');
}
await pag.setViewportSize({ width: 1366, height: 820 });

// ---------------------------------------------------------------- buscador universal
const buscarYElegir = async (texto, esperado) => {
  await pag.fill('#buscar-txt', texto); await pag.waitForTimeout(200);
  const primero = await pag.locator('#buscar-res .br-item').first().textContent();
  ok(esperado.test(primero), `Buscar «${texto}» → ${primero?.trim()}`);
  await pag.keyboard.press('Enter'); await pag.waitForTimeout(300);
};
await buscarYElegir('cudricula', /Cuadrícula MGRS/);
ok((await motor(() => window.__spa.estado.superpuestas.cuadricula)) === false, 'La acción del buscador quita la cuadrícula');
await buscarYElegir('grid', /Cuadrícula MGRS/);
await buscarYElegir('mils', /milésimas/);
ok((await motor(() => window.__spa.estado.angulo)) === 'milesimas', 'Rumbos en milésimas desde el buscador');
await buscarYElegir('satelite', /Imagen|Fondo híbrido/);
await vista(40.79, -4.03, 14);
await buscarYElegir('VL 1310 1596', /^30T VL 1310\d 1596\d/);
await pag.waitForTimeout(900);
const c2 = await motor(() => window.__spa.mapa.getCenter());
ok(Math.abs(c2.lat - 40.79) < 0.02 && Math.abs(c2.lng + 4.03) < 0.02, 'MGRS sin zona: usa la zona de la vista y va allí');
if (GPX) await buscarYElegir('bariguetis', /Barriguetis/);
await buscarYElegir('ENE 1', /ENE 1/);
await buscarYElegir('pl asul', /PL AZUL/);
await pag.fill('#buscar-txt', 'qwxzv'); await pag.waitForTimeout(200);
ok(/Nada encontrado/.test(await pag.textContent('#buscar-res')), 'Sin resultados: lo dice');
await pag.fill('#buscar-txt', 'linea'); await pag.waitForTimeout(200);
if (CAPTURAS) await pag.screenshot({ path: 'docs/capturas/v5-buscador.png' });
await pag.keyboard.press('Escape');

// ---------------------------------------------------------------- persistencia
await pag.reload(); await pag.waitForFunction(() => window.__spa?.importar);
await pag.waitForTimeout(1500);
const tras = await motor(() => ({ g: window.__spa.importar.grupos.length, m: window.__spa.importar.mapas.length, p: window.__spa.dibujo.plan().elementos.length }));
ok(tras.g === 2 && tras.m === 4 && tras.p === 3, `Tras recargar siguen el plan (${tras.p}), los archivos (${tras.g}) y los mapas (${tras.m})`);

// ---------------------------------------------------------------- creador de mapas
{
  const { spawnSync } = await import('node:child_process');
  const { contarTeselas } = await import('../src/datos/creador.js');
  await motor(() => { window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined; }); // descarga normal
  await vista(40.84, -3.42, 15); await pag.waitForTimeout(300);
  await pag.click('.seccion[data-sec="mapas"] > summary').catch(() => {});
  if (!(await pag.locator('#btn-crear-mapa').isVisible())) await pag.click('.seccion[data-sec="mapas"] > summary');
  await pag.click('#btn-crear-mapa');
  ok(await pag.locator('#panel-creador').isVisible(), 'Creador de mapas: se abre el panel');
  // Zona irregular dibujada con clics (5 vértices, cóncava)
  await pag.click('#cr-dibujar');
  const caja = await pag.locator('#mapa').boundingBox();
  const cx = caja.x + caja.width / 2, cy = caja.y + caja.height / 2;
  for (const [dx, dy] of [[-260, -170], [40, -60], [250, -190], [210, 180], [-230, 160]]) { await pag.mouse.click(cx + dx, cy + dy); await pag.waitForTimeout(80); }
  await pag.click('#cr-terminar');
  const zona = await motor(() => window.__spa.creador.zona);
  ok(zona.length === 5, `Zona irregular de ${zona.length} vértices`);
  ok(await motor(() => window.__spa.dibujo.plan().elementos.length === 3), 'Dibujar la zona no añade nada al plan');
  // Capas: topográfico 14–15 + híbrido 16, un solo archivo ATAK
  const ponerCapa = async (id, on, zMin, zMax) => {
    const f = `#panel-creador [data-capa="${id}"]`;
    if ((await pag.locator(`${f} [data-c="on"]`).isChecked()) !== on) await pag.click(`${f} [data-c="on"]`);
    if (on) { await pag.selectOption(`${f} [data-c="zMax"]`, String(zMax)); if (zMin !== undefined) await pag.selectOption(`${f} [data-c="zMin"]`, String(zMin)); }
  };
  await pag.click('#panel-creador [data-formato="atak"]');
  await ponerCapa('mtn', true, 14, 15); await ponerCapa('hibrido', true, 16, 16); await ponerCapa('base', false); await ponerCapa('relieve', false);
  if (await pag.locator('#panel-creador [data-modo="junto"]').count()) await pag.click('#panel-creador [data-modo="junto"]');
  const esperadas = contarTeselas(zona, 14) + contarTeselas(zona, 15) + contarTeselas(zona, 16);
  const resumen = await pag.textContent('.cr-resumen');
  ok(resumen.replace(/\./g, '').includes(String(esperadas)), `Estimación: ${resumen.trim()} (esperadas ${esperadas})`);
  ok(/14–15 Topográfico · 16 Híbrido/.test(await pag.textContent('#panel-creador')), 'Reparto de zooms por capa en un solo archivo');
  await pag.fill('#cr-nombre', 'Prueba creador');
  const [descarga] = await Promise.all([pag.waitForEvent('download', { timeout: 30000 }).catch(async (e) => { console.log('AVISO:', JSON.stringify(await motor(() => ({ av: document.getElementById('aviso-breve').textContent, prog: document.getElementById('cr-prog-txt')?.textContent, res: document.querySelector('.cr-resumen')?.textContent, crear: document.getElementById('cr-crear')?.disabled, parar: Boolean(document.getElementById('cr-parar')) }))), errores); throw e; }), pag.click('#cr-crear')]);
  const ruta = `/tmp/spa-creador-${Date.now()}.sqlite`; await descarga.saveAs(ruta);
  ok(descarga.suggestedFilename() === 'Prueba creador.sqlite', `Archivo: ${descarga.suggestedFilename()}`);
  const py = spawnSync('python3', ['-I', '-c', `
import sqlite3,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
print(c.execute('pragma integrity_check').fetchone()[0], c.execute('select count(*) from tiles').fetchone()[0], c.execute("select value from ATAK_metadata where key='srid'").fetchone()[0])`, ruta], { encoding: 'utf8' }).stdout.trim();
  ok(py === `ok ${esperadas} 3857`, `ATAK creado íntegro con todas las teselas (${py})`);
  await pag.waitForFunction(() => window.__spa.importar.mapas.some((m) => m.nombre === 'Prueba creador.sqlite' && m.info), null, { timeout: 15000 });
  ok(/ATAK · zoom 14–16/.test((await motor(() => window.__spa.importar.mapas.find((m) => m.nombre === 'Prueba creador.sqlite').info))), 'El mapa creado se abre en SPA');
  // GeoTIFF por capa (separado), recortado a la zona
  await pag.click('#panel-creador [data-formato="geotiff"]');
  await ponerCapa('hibrido', false); await ponerCapa('mtn', true, undefined, 15);
  const [tif] = await Promise.all([pag.waitForEvent('download', { timeout: 30000 }).catch(async (e) => { console.log('TIF:', JSON.stringify(await motor(() => ({ av: document.getElementById('aviso-breve').textContent, prog: document.getElementById('cr-prog-txt')?.textContent, res: document.querySelector('.cr-resumen')?.textContent, crear: document.getElementById('cr-crear')?.disabled })))); throw e; }), pag.click('#cr-crear')]);
  const rutaTif = `/tmp/spa-creador-${Date.now()}.tif`; await tif.saveAs(rutaTif);
  const pil = spawnSync('python3', ['-I', '-c', `
from PIL import Image; import sys
im=Image.open(sys.argv[1]); a=im.getchannel('A'); print(im.mode, im.size[0]%256, im.size[1]%256, a.getextrema())`, rutaTif], { encoding: 'utf8' }).stdout.trim();
  ok(tif.suggestedFilename() === 'Prueba creador_mtn_z15.tif' && /^RGBA 0 0 \(0, 255\)$/.test(pil), `GeoTIFF ${tif.suggestedFilename()}: ${pil} (con transparencia fuera de la zona)`);
  await pag.click('#cr-cerrar');
}

// ---------------------------------------------------------------- símbolos APP-6(E)
{
  await vista(40.80, -4.02, 14); await pag.waitForTimeout(300);
  const n0 = await motor(() => window.__spa.dibujo.plan().elementos.length);
  const caja = await pag.locator('#mapa').boundingBox();
  const cx = caja.x + caja.width / 2, cy = caja.y + caja.height / 2;
  await pag.mouse.move(80, 70); await pag.waitForTimeout(200);
  await pag.click('[data-simbolos="unidades"]');
  ok(await pag.locator('#panel-simbolos').isVisible(), 'Paleta de símbolos abierta desde la barra');
  const anchoPal = await motor(() => { const e = document.querySelector('#panel-simbolos .sim-cuerpo'); return [e.scrollWidth, e.clientWidth]; });
  ok(anchoPal[0] <= anchoPal[1] + 1, `La paleta cabe a lo ancho (sin cortes: ${anchoPal})`);
  await pag.click('#panel-simbolos [data-arma="infanteria"]');
  await pag.click('#panel-simbolos [data-tipo="paracaidista"]');
  await pag.click('#panel-simbolos [data-escalon="seccion"]');
  await pag.fill('[data-campo-u="T"]', '1'); await pag.fill('[data-campo-u="M"]', 'II/RI4');
  ok(/Sección de infantería paracaidista/.test(await pag.textContent('.sim-vista')), 'Constructor guiado: «Sección de infantería paracaidista»');
  // Con la unidad elegida, un clic en el mapa la pone (y otro clic, otra)
  await pag.mouse.click(cx + 60, cy + 40); await pag.waitForTimeout(300);
  const u1 = await motor(() => window.__spa.dibujo.plan().elementos.at(-1));
  ok(u1.simbolo?.clase === 'unidad' && u1.simbolo.icono === '121100' && u1.simbolo.mod2 === 'c100' && u1.simbolo.escalon === 'seccion' && u1.simbolo.T === '1' && u1.simbolo.zoom === 14, 'Clic en el mapa: unidad puesta con su símbolo (y su zoom de referencia)');
  ok(await pag.locator('.leaflet-elementos-pane .simbolo-unidad svg').count() >= 1, 'Símbolo dibujado en el mapa');
  ok(/SIDC 160310001412110000000100000000/.test(await pag.textContent('#panel-elemento')), 'Ficha con el SIDC APP-6(E) de 30 dígitos');
  await pag.mouse.click(cx + 160, cy + 40); await pag.waitForTimeout(300);
  ok((await motor(() => window.__spa.dibujo.plan().elementos.length)) === n0 + 2, 'Segundo clic: segunda unidad (rápido para repetir)');
  // Cambiar el escalón con el desplegable visual
  await pag.click('#panel-elemento [data-abrir-sel="escalon"]');
  await pag.click('#panel-elemento [data-sel="escalon"] [data-elegir="compania"]'); await pag.waitForTimeout(200);
  ok((await motor(() => window.__spa.dibujo.plan().elementos.at(-1).simbolo.escalon)) === 'compania', 'Escalón cambiado desde la ficha (desplegable con miniaturas)');
  // Material: carro de combate de cadenas
  await pag.click('#panel-simbolos [data-conjunto="15"]'); await pag.waitForTimeout(200);
  ok(await pag.locator('#panel-simbolos .sim-grupo-det').count() > 5, 'Material: árbol completo de la APP-6(E)');
  // Arrastrar la unidad desde la vista previa hasta el mapa (encima de la zona que tapa la paleta)
  const v = await pag.locator('#panel-simbolos .sim-vista').boundingBox();
  await pag.mouse.move(v.x + 30, v.y + 30); await pag.mouse.down(); await pag.mouse.move(v.x + 60, v.y + 50, { steps: 3 });
  const opac = Number(await motor(() => getComputedStyle(document.querySelector('#panel-simbolos')).opacity));
  await pag.mouse.move(cx - 250, cy + 100, { steps: 6 }); await pag.mouse.up(); await pag.waitForTimeout(300);
  ok(opac < 0.5, `Al arrastrar, la paleta se difumina y deja ver el mapa (opacidad ${opac.toFixed(2)})`);
  ok((await motor(() => window.__spa.dibujo.plan().elementos.at(-1).simbolo.conjunto)) === '15', 'Arrastrar y soltar: material colocado');
  await pag.click('#panel-simbolos [data-conjunto="10"]');
  // Recientes
  ok(await pag.locator('#panel-simbolos .sim-chip').count() >= 2, 'Lo puesto queda en «Recientes»');
  // Tamaño con el zoom: tope al acercar
  const ancho = async () => motor(() => document.querySelector('.leaflet-elementos-pane .simbolo-unidad svg').getBoundingClientRect().width);
  const a14 = await ancho(); await vista(40.80, -4.02, 17); await pag.waitForTimeout(400); const a17 = await ancho();
  await vista(40.80, -4.02, 12); await pag.waitForTimeout(400); const a12 = await ancho();
  ok(a17 <= a14 * 1.4 && a17 > a14 * 1.2 && a12 < a14 * 0.4, `Tamaño: crece al acercar solo hasta el tope y encoge al alejar (${a12.toFixed(0)} · ${a14.toFixed(0)} · ${a17.toFixed(0)} px)`);
  await vista(40.80, -4.02, 14); await pag.waitForTimeout(300);
  // Cometido con puntos fijos (bloquear: 3) y giro
  await pag.click('#panel-simbolos [data-pestana="cometidos"]');
  await pag.click('#panel-simbolos [data-medida="bloquear"]');
  for (const [dx, dy] of [[250, -60], [250, 60], [120, 0]]) { await pag.mouse.click(cx + dx, cy + dy); await pag.waitForTimeout(80); }
  await pag.waitForTimeout(300);
  const b = await motor(() => window.__spa.dibujo.plan().elementos.at(-1));
  ok(b.simbolo?.id === 'bloquear' && b.geometria.coordinates.length === 3, 'Cometido «Bloquear» con sus 3 puntos de anclaje');
  ok(await pag.locator('.asa-media').count() === 0 && await pag.locator('.asa-vert').count() === 3, 'Puntos fijos: se arrastran, no se añaden ni se quitan');
  ok(await pag.locator('.asa-giro').count() === 1 && await pag.locator('.asa-mover').count() === 1, 'Asas para girar y mover el cometido entero');
  await pag.click('#panel-elemento [data-girar="45"]'); await pag.waitForTimeout(200);
  const b2 = await motor(() => window.__spa.dibujo.plan().elementos.at(-1).geometria.coordinates);
  ok(JSON.stringify(b2) !== JSON.stringify(b.geometria.coordinates), 'Girar 45° desde la ficha');
  // Línea de fase con nombre flotante; límite con escalón en cada tramo al acercar
  await pag.click('#panel-simbolos [data-pestana="medidas"]');
  await pag.click('#panel-simbolos [data-medida="pl"]');
  await pag.mouse.click(cx - 0, cy + 150); await pag.mouse.dblclick(cx + 260, cy + 140); await pag.waitForTimeout(300);
  await pag.fill('#el-nombre', 'ROJA'); await pag.press('#el-nombre', 'Tab'); await pag.waitForTimeout(300);
  ok((await pag.locator('.etq-linea', { hasText: 'PL ROJA' }).count()) >= 1, 'Línea de fase rotulada «PL ROJA» sobre la línea');
  await pag.click('#panel-simbolos [data-medida="limite"]');
  for (const [dx, dy] of [[-150, -200], [-50, -120], [60, -210], [160, -110]]) { await pag.mouse.click(cx + dx, cy + dy); await pag.waitForTimeout(80); }
  await pag.mouse.dblclick(cx + 260, cy - 200); await pag.waitForTimeout(300);
  await pag.click('#panel-elemento [data-abrir-sel="escalon"]'); await pag.click('#panel-elemento [data-sel="escalon"] [data-elegir="batallon"]'); await pag.waitForTimeout(300);
  const nCerca = async () => pag.locator('.etq-limite').count();
  await vista(40.80, -4.02, 16); await pag.waitForTimeout(400); const c16 = await nCerca();
  await vista(40.80, -4.02, 12); await pag.waitForTimeout(400); const c12 = await nCerca();
  ok(c16 > c12 && c12 >= 1, `Límite: escalón en varios tramos al acercar y menos al alejar (${c16} → ${c12})`);
  await vista(40.80, -4.02, 14); await pag.waitForTimeout(300);
  // Deshacer
  await pag.keyboard.press('Escape'); await pag.keyboard.press('Control+z'); await pag.waitForTimeout(200);
  ok((await motor(() => window.__spa.dibujo.plan().elementos.at(-1).simbolo.escalon ?? '')) === '', 'Ctrl+Z deshace el último cambio');
  // Buscador universal: «bloquear» → empieza a dibujar el cometido
  await pag.click('#panel-simbolos [data-s="cerrar"]');
  await pag.fill('#buscar-txt', 'bloquear'); await pag.waitForTimeout(200); await pag.keyboard.press('Enter'); await pag.waitForTimeout(200);
  ok(await motor(() => window.__spa.dibujo.dibujando), 'Buscar «bloquear» y pulsar Intro: listo para dibujarlo');
  await pag.keyboard.press('Escape');
}

if (CAPTURAS) {
  await pag.setViewportSize({ width: 390, height: 780 }); await pag.waitForTimeout(300);
  await pag.screenshot({ path: 'docs/capturas/v4-movil.png' });
}
ok(errores.length === 0, `Sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`);
await nav.close(); servidor.kill();
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodas las comprobaciones correctas');
process.exit(fallos ? 1 : 0);
