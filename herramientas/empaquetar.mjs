// Empaquetador mínimo, sin dependencias.
//
// Convierte una página HTML que usa módulos ES (<script type="module">) y
// hojas de estilo en UN SOLO archivo HTML autocontenido en dist/: estilos,
// tipografías y código dentro. Así se abre con doble clic, sin servidor y
// sin conexión (Chrome no carga módulos desde file://).
//
//   node herramientas/empaquetar.mjs calculadora.html
//
// Solo entiende la sintaxis de import/export que usamos en este proyecto
// (import { a, b as c } from './x.js'; export function/const/let/class;
// export * from './x.js'; export default expr;). Si se añade otra forma,
// falla con un error claro en lugar de generar algo roto.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), '..');
const entrada = process.argv[2];
if (!entrada) { console.error('Uso: node herramientas/empaquetar.mjs pagina.html'); process.exit(1); }

const MIME = { '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

// ---------------------------------------------------------------- CSS
function incrustarCss(rutaCss) {
  const css = readFileSync(rutaCss, 'utf8');
  return css.replace(/url\('([^')]+)'\)/g, (m, rel) => {
    if (rel.startsWith('data:')) return m;
    const f = resolve(dirname(rutaCss), rel);
    const tipo = MIME[extname(f)];
    if (!tipo) throw new Error(`No sé incrustar ${f}`);
    return `url('data:${tipo};base64,${readFileSync(f).toString('base64')}')`;
  });
}

// ---------------------------------------------------------------- JS
const modulos = new Map(); // ruta absoluta → { codigo, deps }
const orden = [];

function cargar(ruta) {
  if (modulos.has(ruta)) return;
  modulos.set(ruta, null); // marca "en curso" (detecta ciclos)
  let src = readFileSync(ruta, 'utf8');
  const deps = [];
  const exportados = [];
  const estrellas = [];
  let porDefecto = false;

  // import { a, b as c } from './x.js';
  src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'([^']+)';?/g, (m, nombres, rel) => {
    const dep = resolve(dirname(ruta), rel); deps.push(dep);
    const lista = nombres.split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => { const [a, b] = s.split(/\s+as\s+/); return b ? `${a}: ${b}` : a; });
    return `const { ${lista.join(', ')} } = __req(${JSON.stringify(dep)});`;
  });
  // import x from './x.js';
  src = src.replace(/import\s+(\w+)\s+from\s*'([^']+)';?/g, (m, nombre, rel) => {
    const dep = resolve(dirname(ruta), rel); deps.push(dep);
    return `const ${nombre} = __req(${JSON.stringify(dep)}).default;`;
  });
  // export * from './x.js';
  src = src.replace(/export\s*\*\s*from\s*'([^']+)';?/g, (m, rel) => {
    const dep = resolve(dirname(ruta), rel); deps.push(dep); estrellas.push(dep); return '';
  });
  // export function/const/let/class NOMBRE
  src = src.replace(/export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/g, (m, tipo, nombre) => {
    exportados.push(nombre); return `${tipo} ${nombre}`;
  });
  // export default expr;
  src = src.replace(/export\s+default\s+/g, () => { porDefecto = true; return 'const __porDefecto = '; });
  if (/\b(import|export)\s/.test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ''))) {
    throw new Error(`${relative(RAIZ, ruta)}: hay un import/export con una forma que el empaquetador no entiende`);
  }
  for (const d of deps) cargar(d);
  const devolver = [
    ...estrellas.map((d) => `...__req(${JSON.stringify(d)})`),
    ...exportados,
    ...(porDefecto ? ['default: __porDefecto'] : []),
  ];
  modulos.set(ruta, { src, devolver });
  orden.push(ruta);
}

function empaquetarJs(rutaEntrada) {
  cargar(rutaEntrada);
  const partes = orden.map((r) => {
    const { src, devolver } = modulos.get(r);
    const id = JSON.stringify(r);
    return `// ── ${relative(RAIZ, r)}\n__mods[${id}] = (function () {\n'use strict';\n${src}\nreturn { ${devolver.join(', ')} };\n})();`;
  });
  // Las rutas absolutas solo sirven de clave: se sustituyen por relativas.
  let js = `(function () {\n'use strict';\nconst __mods = {};\nconst __req = (r) => __mods[r];\n${partes.join('\n\n')}\n})();`;
  for (const r of orden) js = js.split(JSON.stringify(r)).join(JSON.stringify(relative(RAIZ, r)));
  return js.replace(/<\/script/gi, '<\\/script');
}

// ---------------------------------------------------------------- HTML
const rutaHtml = resolve(RAIZ, entrada);
let html = readFileSync(rutaHtml, 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) =>
  `<style>\n${incrustarCss(resolve(dirname(rutaHtml), href))}\n</style>`);
html = html.replace(/<script type="module" src="([^"]+)"><\/script>/g, (m, src) =>
  `<script>\n${empaquetarJs(resolve(dirname(rutaHtml), src))}\n</script>`);

mkdirSync(join(RAIZ, 'dist'), { recursive: true });
const salida = join(RAIZ, 'dist', relative(RAIZ, rutaHtml));
writeFileSync(salida, html);
console.log(`${relative(RAIZ, salida)} · ${(html.length / 1024).toFixed(0)} KB · ${orden.length} módulos`);
