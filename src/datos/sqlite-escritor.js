// Escritor SQLite mínimo (sin dependencias) para crear mapas en teselas:
// cachés de ATAK (.sqlite) y MBTiles. Formato: sqlite.org/fileformat2.html
//
// Construye los b-árboles de abajo arriba a partir de filas YA ORDENADAS
// (por rowid en las tablas; por clave en los índices). Páginas de 4096 B,
// desbordamiento para los blobs grandes, codificación UTF-8.
// Se verifica con el SQLite oficial (PRAGMA integrity_check) en las pruebas.

const TAM = 4096;
const U = TAM; // sin bytes reservados
const utf8 = new TextEncoder();

/** varint de SQLite (big-endian, 7 bits por byte; el 9.º byte usa 8). */
export function varint(v) {
  if (v < 0) throw new Error('varint negativo no soportado');
  if (v <= 0x7f) return [v];
  if (v > 2 ** 56 - 1) throw new Error('varint demasiado grande');
  const bytes = [];
  let x = v;
  while (x > 0) { bytes.unshift(x % 128); x = Math.floor(x / 128); }
  return bytes.map((b, i) => (i < bytes.length - 1 ? b | 0x80 : b));
}

/** Codifica un registro (fila) en su formato binario. */
export function registro(valores) {
  const tipos = [], cuerpos = [];
  for (const v of valores) {
    if (v === null || v === undefined) { tipos.push(0); continue; }
    if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        if (v === 0) { tipos.push(8); continue; }
        if (v === 1) { tipos.push(9); continue; }
        const tam = [[1, 1, 0x7f], [2, 2, 0x7fff], [3, 3, 0x7fffff], [4, 4, 0x7fffffff], [5, 6, 0x7fffffffffff], [6, 8, Number.MAX_SAFE_INTEGER]]
          .find(([, , max]) => v <= max && v >= -max - 1);
        const [tipo, n] = tam;
        const b = new Uint8Array(n);
        let x = v < 0 ? 2 ** (8 * n) + v : v;
        for (let i = n - 1; i >= 0; i--) { b[i] = x % 256; x = Math.floor(x / 256); }
        tipos.push(tipo); cuerpos.push(b);
      } else {
        const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); tipos.push(7); cuerpos.push(b);
      }
    } else if (typeof v === 'string') {
      const b = utf8.encode(v); tipos.push(13 + 2 * b.length); cuerpos.push(b);
    } else if (v instanceof Uint8Array) {
      tipos.push(12 + 2 * v.length); cuerpos.push(v);
    } else throw new Error(`Valor no soportado en registro: ${typeof v}`);
  }
  const cab = tipos.flatMap(varint);
  let tamCab = cab.length + 1;
  if (varint(tamCab).length > 1) tamCab = cab.length + varint(cab.length + 2).length;
  const head = [...varint(tamCab), ...cab];
  const total = head.length + cuerpos.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  out.set(head, 0);
  let o = head.length;
  for (const b of cuerpos) { out.set(b, o); o += b.length; }
  return out;
}

/** Bytes de payload que caben en la página (el resto, a desbordamiento). */
function local(P, esIndice) {
  const X = esIndice ? Math.floor(((U - 12) * 64) / 255) - 23 : U - 35;
  if (P <= X) return P;
  const M = Math.floor(((U - 12) * 32) / 255) - 23;
  const K = M + ((P - M) % (U - 4));
  return K <= X ? K : M;
}

class Archivo {
  constructor() { this.paginas = []; }
  reservar() { this.paginas.push(null); return this.paginas.length; } // número de página (1-based)
  poner(n, bytes) { this.paginas[n - 1] = bytes; }
  /** Escribe el payload que no cabe en cadenas de páginas de desbordamiento; devuelve la 1.ª. */
  desbordar(resto) {
    let primera = 0, anterior = null;
    for (let o = 0; o < resto.length; o += U - 4) {
      const n = this.reservar();
      if (anterior) new DataView(anterior.buffer).setUint32(0, n);
      else primera = n;
      const p = new Uint8Array(TAM);
      p.set(resto.subarray(o, o + U - 4), 4);
      this.poner(n, p);
      anterior = p;
    }
    return primera;
  }
  /** Celda de payload (con desbordamiento si hace falta). */
  celdaPayload(prefijo, payload, esIndice) {
    const P = payload.length, k = local(P, esIndice);
    const pre = [...prefijo];
    const celda = new Uint8Array(pre.length + k + (k < P ? 4 : 0));
    celda.set(pre, 0); celda.set(payload.subarray(0, k), pre.length);
    if (k < P) new DataView(celda.buffer).setUint32(pre.length + k, this.desbordar(payload.subarray(k)));
    return celda;
  }
}

/** Página b-árbol a partir de sus celdas. */
function pagina(tipo, celdas, derecha, esPrimera = false) {
  const p = new Uint8Array(TAM);
  const h = esPrimera ? 100 : 0;
  const interior = tipo === 2 || tipo === 5;
  const tamCab = interior ? 12 : 8;
  const dv = new DataView(p.buffer);
  let fin = TAM;
  const punteros = [];
  for (const c of celdas) { fin -= c.length; p.set(c, fin); punteros.push(fin); }
  if (fin < h + tamCab + 2 * celdas.length) throw new Error('Página desbordada');
  p[h] = tipo;
  dv.setUint16(h + 1, 0); dv.setUint16(h + 3, celdas.length); dv.setUint16(h + 5, fin === TAM ? 0 : fin); p[h + 7] = 0;
  if (interior) dv.setUint32(h + 8, derecha);
  punteros.forEach((q, i) => dv.setUint16(h + tamCab + 2 * i, q));
  return p;
}
const cabe = (usado, celda, n, tamCab, h = 0) => h + tamCab + 2 * (n + 1) + usado + celda.length <= TAM;

/** Tabla: filas {rowid, valores} ordenadas por rowid (iterable síncrono o asíncrono). Devuelve la raíz. */
async function escribirTabla(a, filas) {
  const hojas = []; // [{n, max}]
  let celdas = [], usado = 0, ultimo = -Infinity, nPag = a.reservar();
  const cerrar = () => { a.poner(nPag, pagina(13, celdas, 0)); hojas.push({ n: nPag, max: ultimo }); };
  for await (const f of filas) {
    if (f.rowid <= ultimo) throw new Error('Filas sin ordenar por rowid');
    const vals = await Promise.all(f.valores.map(async (v) => (v instanceof Blob ? new Uint8Array(await v.arrayBuffer()) : v)));
    const payload = registro(vals);
    const celda = a.celdaPayload([...varint(payload.length), ...varint(f.rowid)], payload, false);
    if (celdas.length && !cabe(usado, celda, celdas.length, 8)) { cerrar(); celdas = []; usado = 0; nPag = a.reservar(); }
    celdas.push(celda); usado += celda.length; ultimo = f.rowid;
  }
  cerrar();
  // Niveles interiores: cada celda = (hijo izquierdo, rowid máximo de ese hijo); el último hijo, a la derecha
  let nivel = hojas;
  while (nivel.length > 1) {
    const arriba = [];
    let i = 0;
    while (i < nivel.length) {
      const n = a.reservar();
      const cs = []; let us = 0;
      while (i < nivel.length - 1) {
        const c = new Uint8Array([0, 0, 0, 0, ...varint(nivel[i].max)]);
        new DataView(c.buffer).setUint32(0, nivel[i].n);
        if (cs.length && !cabe(us, c, cs.length, 12)) break;
        cs.push(c); us += c.length; i++;
      }
      // Que la página siguiente no se quede con un solo hijo y ninguna celda
      if (i === nivel.length - 2 && cs.length >= 2) { cs.pop(); i--; }
      a.poner(n, pagina(5, cs, nivel[i].n));
      arriba.push({ n, max: nivel[i].max });
      i++;
    }
    nivel = arriba;
  }
  return nivel[0].n;
}

/** Índice: entradas (arrays de valores, la última es el rowid) ordenadas. Devuelve la raíz. */
function escribirIndice(a, entradas) {
  const regs = entradas.map(registro);
  if (!regs.length) { const n = a.reservar(); a.poner(n, pagina(10, [], 0)); return n; }
  // Hojas. En un índice, las entradas de los niveles interiores NO se repiten
  // en las hojas: al llenarse una hoja, la entrada siguiente sube como separador.
  const grupos = []; const seps = [];
  let i = 0;
  while (i < regs.length) {
    const g = []; let us = 0;
    while (i < regs.length) {
      const tam = varint(regs[i].length).length + regs[i].length;
      if (g.length && 8 + 2 * (g.length + 1) + us + tam > TAM) break;
      g.push(regs[i]); us += tam; i++;
    }
    grupos.push(g);
    if (i < regs.length) {
      if (i === regs.length - 1) { seps.push(g.pop()); } // así la última hoja no queda vacía
      else { seps.push(regs[i]); i++; }
    }
  }
  let hijos = grupos.map((g) => { const n = a.reservar(); a.poner(n, pagina(10, g.map((r) => a.celdaPayload(varint(r.length), r, true)), 0)); return n; });
  let sp = seps;
  // Interiores: celdas (hijo k, separador k); el último hijo a la derecha; al llenarse, el separador sube
  while (hijos.length > 1) {
    const nh = [], ns = [];
    let k = 0;
    while (k < hijos.length) {
      const n = a.reservar(); const cs = []; let us = 0;
      while (k < hijos.length - 1) {
        const c = a.celdaPayload([0, 0, 0, 0, ...varint(sp[k].length)], sp[k], true);
        new DataView(c.buffer).setUint32(0, hijos[k]);
        if (cs.length && !cabe(us, c, cs.length, 12)) break;
        cs.push(c); us += c.length; k++;
      }
      if (k === hijos.length - 2 && cs.length >= 2) { cs.pop(); k--; }
      a.poner(n, pagina(2, cs, hijos[k]));
      nh.push(n);
      if (k < hijos.length - 1) ns.push(sp[k]);
      k++;
    }
    hijos = nh; sp = ns;
  }
  return hijos[0];
}

/**
 * Crea una base de datos SQLite.
 * @param {Array<{nombre, sql, filas}>} tablas   filas: iterable de {rowid, valores} ordenado por rowid
 * @param {Array<{nombre, tabla, sql, entradas}>} [indices] entradas: arrays ordenados [..., rowid]
 * @returns {Promise<Blob>}
 */
export async function escribirSqlite(tablas, indices = []) {
  const a = new Archivo();
  a.reservar(); // página 1: cabecera + sqlite_master
  const esquema = [];
  for (const t of tablas) {
    const raiz = await escribirTabla(a, t.filas);
    esquema.push(['table', t.nombre, t.nombre, raiz, t.sql]);
  }
  for (const ix of indices) {
    const raiz = escribirIndice(a, ix.entradas);
    esquema.push(['index', ix.nombre, ix.tabla, raiz, ix.sql]);
  }
  // sqlite_master en la página 1
  const celdas = esquema.map((fila, i) => { const r = registro(fila); return new Uint8Array([...varint(r.length), ...varint(i + 1), ...r]); });
  const p1 = pagina(13, celdas, 0, true);
  const txt = utf8.encode('SQLite format 3\0');
  p1.set(txt, 0);
  const dv = new DataView(p1.buffer);
  dv.setUint16(16, TAM); p1[18] = 1; p1[19] = 1; p1[20] = 0; p1[21] = 64; p1[22] = 32; p1[23] = 32;
  dv.setUint32(24, 1);                 // contador de cambios
  dv.setUint32(28, a.paginas.length);  // páginas
  dv.setUint32(32, 0); dv.setUint32(36, 0);
  dv.setUint32(40, 1);                 // cookie del esquema
  dv.setUint32(44, 4);                 // formato de esquema
  dv.setUint32(48, 0); dv.setUint32(52, 0);
  dv.setUint32(56, 1);                 // UTF-8
  dv.setUint32(60, 0); dv.setUint32(64, 0); dv.setUint32(68, 0);
  dv.setUint32(92, 1);                 // válido para el contador de cambios
  dv.setUint32(96, 3045000);           // versión de SQLite (referencia)
  a.poner(1, p1);
  return new Blob(a.paginas, { type: 'application/vnd.sqlite3' });
}
