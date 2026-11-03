// Hoja de revisión: dibuja los iconos vectorizados en marco amigo y captura PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [, , entrada, salida, cols = '12', desde = '0', n = '96'] = process.argv;
const r = JSON.parse(readFileSync(entrada, 'utf8')).filter((x) => x.d).slice(+desde, +desde + +n);
const celda = (x) => `<div class="c"><svg viewBox="0 0 200 200" width="92" height="92"><path d="M25,50H175V150H25Z" fill="#cdf" stroke="#000" stroke-width="3"/><path d="M50,100L64.6,64.6 100,50 135.4,64.6 150,100 135.4,135.4 100,150 64.6,135.4Z" fill="none" stroke="#f0f" stroke-width=".6"/><path d="${x.d}" fill="#000" fill-rule="evenodd"/>${(x.colores || []).map((c) => `<path d="${c.d}" fill="${c.color}" fill-rule="evenodd"/>`).join('')}</svg><b>${x.conjunto} ${x.codigo}</b><span>${x.nombre.slice(0, 26)}</span></div>`;
const html = `<html><body style="margin:6px;font:10px Arial;display:grid;grid-template-columns:repeat(${cols},98px);gap:4px">${r.map(celda).join('')}<style>.c{display:flex;flex-direction:column;align-items:center;border:1px solid #ddd}.c span{text-align:center;height:24px;overflow:hidden}</style></body></html>`;
writeFileSync(salida.replace(/\.png$/, '.html'), html);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.setContent(html); await p.screenshot({ path: salida, fullPage: true }); await b.close();
