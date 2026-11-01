// Lector SQLite de solo lectura, por trozos (no carga el archivo entero).
// Sirve para los mapas en teselas de ATAK/osmdroid y MBTiles, aunque pesen
// varios GB: solo se leen las páginas necesarias para cada tesela.
//
// Formato: https://www.sqlite.org/fileformat2.html
// Se implementa: cabecera, b-árboles de tabla e índice, registros,
// desbordamiento (overflow) y búsquedas por rowid o por clave de índice.

const utf8 = new TextDecoder('utf-8');

/**
 * @param {{tamano:number, leer:(o:number,n:number)=>Promise<Uint8Array>}} lector
 */
export async function abrirSqlite(lector) {
  const cab = await lector.leer(0, 100);
  if (utf8.decode(cab.subarray(0, 15)) !== 'SQLite format 3') throw new Error('No es una base de datos SQLite');
  const dv = new DataView(cab.buffer, cab.byteOffset, 100);
  let tamPagina = dv.getUint16(16); if (tamPagina === 1) tamPagina = 65536;
  const reservado = cab[20];
  const U = tamPagina - reservado;
  const cache = new Map();
  const MAX_CACHE = 512;

  async function pagina(n) {
    let p = cache.get(n);
    if (p) { cache.delete(n); cache.set(n, p); return p; }
    p = lector.leer((n - 1) * tamPagina, tamPagina);
    cache.set(n, p);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return p;
  }

  /** varint de SQLite → [valor, bytes]. Exacto hasta 2^53. */
  function varint(b, o) {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const c = b[o + i];
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) return [v, i + 1];
    }
    return [v * 256 + b[o + 8], 9];
  }

  /** Lee el payload de una celda (con desbordamiento si lo hay). */
  async function payload(b, o, P, esIndice) {
    const X = esIndice ? Math.floor(((U - 12) * 64) / 255) - 23 : U - 35;
    if (P <= X) return b.subarray(o, o + P);
    const M = Math.floor(((U - 12) * 32) / 255) - 23;
    let K = M + ((P - M) % (U - 4));
    if (K > X) K = M;
    const out = new Uint8Array(P);
    out.set(b.subarray(o, o + K), 0);
    let siguiente = new DataView(b.buffer, b.byteOffset + o + K, 4).getUint32(0);
    let pos = K;
    while (siguiente && pos < P) {
      const pg = await pagina(siguiente);
      siguiente = new DataView(pg.buffer, pg.byteOffset, 4).getUint32(0);
      const n = Math.min(U - 4, P - pos);
      out.set(pg.subarray(4, 4 + n), pos); pos += n;
    }
    return out;
  }

  /** Registro → array de valores. */
  function registro(r) {
    const [tamCab, l] = varint(r, 0);
    const tipos = [];
    for (let o = l; o < tamCab;) { const [t, k] = varint(r, o); tipos.push(t); o += k; }
    const vals = [];
    let o = tamCab;
    const dv2 = new DataView(r.buffer, r.byteOffset, r.byteLength);
    for (const t of tipos) {
      if (t === 0) vals.push(null);
      else if (t >= 1 && t <= 6) {
        const n = [0, 1, 2, 3, 4, 6, 8][t];
        let v = 0;
        for (let i = 0; i < n; i++) v = v * 256 + r[o + i];
        if (r[o] & 0x80) v -= 2 ** (8 * n); // con signo
        vals.push(v); o += n;
      } else if (t === 7) { vals.push(dv2.getFloat64(o)); o += 8; }
      else if (t === 8) vals.push(0);
      else if (t === 9) vals.push(1);
      else if (t >= 12 && t % 2 === 0) { const n = (t - 12) / 2; vals.push(r.subarray(o, o + n)); o += n; }
      else if (t >= 13) { const n = (t - 13) / 2; vals.push(utf8.decode(r.subarray(o, o + n))); o += n; }
      else vals.push(null);
    }
    return vals;
  }

  /** Cabecera de página b-árbol. */
  function nodo(b, n) {
    const h = n === 1 ? 100 : 0;
    const tipo = b[h];
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const celdas = d.getUint16(h + 3);
    const interior = tipo === 2 || tipo === 5;
    const derecha = interior ? d.getUint32(h + 8) : 0;
    const ini = h + (interior ? 12 : 8);
    const punteros = new Array(celdas);
    for (let i = 0; i < celdas; i++) punteros[i] = d.getUint16(ini + i * 2);
    return { tipo, celdas, derecha, punteros, d };
  }

  /** Busca una fila por rowid en un b-árbol de tabla. Devuelve los valores o null. */
  async function filaPorRowid(raiz, rowid) {
    let n = raiz;
    for (let prof = 0; prof < 40; prof++) {
      const b = await pagina(n); const nd = nodo(b, n);
      if (nd.tipo === 5) {
        // interior: celdas = [hijo izq (4), clave varint]; ir al primer hijo con clave >= rowid
        let lo = 0, hi = nd.celdas - 1, sig = nd.derecha;
        while (lo <= hi) {
          const m = (lo + hi) >> 1; const p = nd.punteros[m];
          const [clave] = varint(b, p + 4);
          if (clave >= rowid) { sig = nd.d.getUint32(p); hi = m - 1; } else lo = m + 1;
        }
        n = sig; continue;
      }
      if (nd.tipo !== 13) throw new Error('Página de tabla no válida');
      let lo = 0, hi = nd.celdas - 1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1; const p = nd.punteros[m];
        const [P, k1] = varint(b, p); const [id, k2] = varint(b, p + k1);
        if (id === rowid) return registro(await payload(b, p + k1 + k2, P, false));
        if (id < rowid) lo = m + 1; else hi = m - 1;
      }
      return null;
    }
    return null;
  }

  /** Recorre los rowid (sin leer datos) en [desde, hasta]; `fn(rowid)` puede devolver false para parar. */
  async function recorrerRowids(raiz, desde, hasta, fn) {
    async function rec(n) {
      const b = await pagina(n); const nd = nodo(b, n);
      if (nd.tipo === 5) {
        let previa = -Infinity;
        for (let i = 0; i < nd.celdas; i++) {
          const p = nd.punteros[i]; const [clave] = varint(b, p + 4);
          if (clave >= desde && previa <= hasta) { if ((await rec(nd.d.getUint32(p))) === false) return false; }
          previa = clave;
          if (previa > hasta) return true;
        }
        return rec(nd.derecha);
      }
      for (let i = 0; i < nd.celdas; i++) {
        const p = nd.punteros[i]; const [, k1] = varint(b, p); const [id] = varint(b, p + k1);
        if (id > hasta) return false;
        if (id >= desde && fn(id) === false) return false;
      }
      return true;
    }
    await rec(raiz);
  }

  /** Recorre todas las filas de una tabla (para tablas pequeñas: sqlite_master, metadata). */
  async function filas(raiz) {
    const out = [];
    async function rec(n) {
      const b = await pagina(n); const nd = nodo(b, n);
      if (nd.tipo === 5) { for (const p of nd.punteros) await rec(nd.d.getUint32(p)); return rec(nd.derecha); }
      for (const p of nd.punteros) {
        const [P, k1] = varint(b, p); const [id, k2] = varint(b, p + k1);
        out.push({ rowid: id, valores: registro(await payload(b, p + k1 + k2, P, false)) });
      }
    }
    await rec(raiz);
    return out;
  }

  const comparar = (a, b) => {
    for (let i = 0; i < b.length; i++) {
      const x = a[i], y = b[i];
      if (x === y) continue;
      if (x === null) return -1; if (y === null) return 1;
      if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
      if (typeof x === 'number') return -1; if (typeof y === 'number') return 1;
      return String(x) < String(y) ? -1 : 1;
    }
    return 0;
  };

  /** Busca en un índice la primera entrada cuyo prefijo coincide con `clave`. Devuelve el registro (con el rowid al final). */
  async function buscarIndice(raiz, clave) {
    let n = raiz;
    for (let prof = 0; prof < 40; prof++) {
      const b = await pagina(n); const nd = nodo(b, n);
      const interior = nd.tipo === 2;
      if (!interior && nd.tipo !== 10) throw new Error('Página de índice no válida');
      let lo = 0, hi = nd.celdas - 1, sig = interior ? nd.derecha : null;
      while (lo <= hi) {
        const m = (lo + hi) >> 1; const p = nd.punteros[m];
        const o = interior ? p + 4 : p;
        const [P, k] = varint(b, o);
        const rec = registro(await payload(b, o + k, P, true));
        const c = comparar(rec, clave);
        if (c === 0) return rec;
        if (c > 0) { if (interior) sig = nd.d.getUint32(p); hi = m - 1; } else lo = m + 1;
      }
      if (!interior) return null;
      n = sig;
    }
    return null;
  }

  // Esquema
  const esquema = (await filas(1)).map(({ valores: [tipo, nombre, tabla, raiz, sql] }) => ({ tipo, nombre, tabla, raiz, sql }));
  const tabla = (nombre) => esquema.find((e) => e.tipo === 'table' && e.nombre.toLowerCase() === nombre.toLowerCase());
  const indicesDe = (nombre) => esquema.filter((e) => e.tipo === 'index' && e.tabla.toLowerCase() === nombre.toLowerCase());

  return { tamPagina, esquema, tabla, indicesDe, filaPorRowid, recorrerRowids, filas, buscarIndice, lector };
}
