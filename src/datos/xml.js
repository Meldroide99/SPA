// Lector XML mínimo (sin dependencias) para GPX, KML, CoT y manifiestos ATAK.
// Funciona igual en el navegador y en Node (pruebas).
//
// Devuelve un árbol de nodos { nombre, local, attrs, hijos, texto }.
// `local` es el nombre sin prefijo de espacio de nombres (gx:Track → Track).

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desentidad = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTIDADES[e] ?? m;
});

/** @param {string} xml */
export function leerXml(xml) {
  const raiz = { nombre: '#doc', local: '#doc', attrs: {}, hijos: [], texto: '' };
  const pila = [raiz];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) { pila.at(-1).texto += desentidad(xml.slice(i)); break; }
    if (lt > i) pila.at(-1).texto += desentidad(xml.slice(i, lt));
    if (xml.startsWith('<!--', lt)) { const f = xml.indexOf('-->', lt + 4); i = f < 0 ? n : f + 3; continue; }
    if (xml.startsWith('<![CDATA[', lt)) { const f = xml.indexOf(']]>', lt + 9); pila.at(-1).texto += xml.slice(lt + 9, f < 0 ? n : f); i = f < 0 ? n : f + 3; continue; }
    if (xml[lt + 1] === '?' || xml[lt + 1] === '!') { const f = xml.indexOf('>', lt); i = f < 0 ? n : f + 1; continue; }
    if (xml[lt + 1] === '/') {
      const f = xml.indexOf('>', lt);
      const nombre = xml.slice(lt + 2, f).trim();
      // Cierra hasta el nodo con ese nombre (tolera XML algo descuidado)
      for (let k = pila.length - 1; k > 0; k--) { if (pila[k].nombre === nombre) { pila.length = k; break; } }
      i = f + 1; continue;
    }
    // Etiqueta de apertura: buscar el '>' respetando comillas
    let j = lt + 1, q = null;
    while (j < n) { const c = xml[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
    let cuerpo = xml.slice(lt + 1, j);
    const autocierre = cuerpo.endsWith('/');
    if (autocierre) cuerpo = cuerpo.slice(0, -1);
    const m = /^([^\s/>]+)/.exec(cuerpo);
    const nombre = m ? m[1] : '';
    const attrs = {};
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = re.exec(cuerpo.slice(nombre.length)))) attrs[a[1].replace(/^.*:/, '')] = desentidad(a[3] ?? a[4]);
    const nodo = { nombre, local: nombre.replace(/^.*:/, ''), attrs, hijos: [], texto: '' };
    pila.at(-1).hijos.push(nodo);
    if (!autocierre) pila.push(nodo);
    i = j + 1;
  }
  return raiz;
}

/** Primer descendiente (o hijo directo con `directo`) con ese nombre local. */
export function hijo(nodo, local) { return nodo?.hijos.find((h) => h.local === local) ?? null; }
export function hijos(nodo, local) { return nodo ? nodo.hijos.filter((h) => h.local === local) : []; }
export function texto(nodo, local) { const h = local ? hijo(nodo, local) : nodo; return h ? h.texto.trim() : ''; }
/** Todos los descendientes con ese nombre local (en orden de documento). */
export function buscarTodos(nodo, local, out = []) {
  for (const h of nodo.hijos) { if (h.local === local) out.push(h); buscarTodos(h, local, out); }
  return out;
}
