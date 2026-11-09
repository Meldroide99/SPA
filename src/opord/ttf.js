// Letras TrueType (.ttf) para meterlas dentro del PDF (p. ej. la Tahoma del
// modelo de OPORD). Se leen las tablas justas: tamaño del em, caja, ascendente
// y descendente, anchos de cada letra y la tabla de caracteres (cmap).
// No depende de la página: se prueba en Node.

/** Unicode de los códigos 128–159 de WinAnsi (CP1252). El resto coincide con Latin-1. */
const WIN_128 = [0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0,
  0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178];
export const unicodeWinAnsi = (c) => (c >= 128 && c < 160 ? WIN_128[c - 128] : c);

/**
 * Lee una letra TrueType.
 * @param {ArrayBuffer|Uint8Array} datos
 * @returns {{bytes:Uint8Array, upem:number, caja:number[], ascendente:number, descendente:number, mayusculas:number, italica:number, anchos:number[]}}
 *   `anchos`: ancho (milésimas de em) de los códigos WinAnsi 32–255.
 */
export function leerTtf(datos) {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const etiqueta = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (etiqueta(0) === 'ttcf') throw new Error('Colección de letras (.ttc): no se puede incrustar');
  const tablas = {};
  const n = dv.getUint16(4);
  for (let i = 0; i < n; i++) { const o = 12 + 16 * i; tablas[etiqueta(o)] = { o: dv.getUint32(o + 8), l: dv.getUint32(o + 12) }; }
  for (const t of ['head', 'hhea', 'hmtx', 'cmap']) if (!tablas[t]) throw new Error(`Falta la tabla ${t}`);
  const head = tablas.head.o, hhea = tablas.hhea.o;
  const upem = dv.getUint16(head + 18);
  const caja = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];
  const ascendente = dv.getInt16(hhea + 4), descendente = dv.getInt16(hhea + 6);
  const nMetricas = dv.getUint16(hhea + 34);
  const avance = (gid) => dv.getUint16(tablas.hmtx.o + 4 * Math.min(gid, nMetricas - 1));
  let mayusculas = Math.round(ascendente * 0.72);
  if (tablas['OS/2'] && dv.getUint16(tablas['OS/2'].o) >= 2) mayusculas = dv.getInt16(tablas['OS/2'].o + 88) || mayusculas;
  const italica = tablas.post ? dv.getInt32(tablas.post.o + 4) / 65536 : 0;
  // cmap: Windows Unicode (3,1) formato 4
  const cm = tablas.cmap.o;
  let sub = -1;
  for (let i = 0; i < dv.getUint16(cm + 2); i++) {
    const r = cm + 4 + 8 * i;
    if (dv.getUint16(r) === 3 && dv.getUint16(r + 2) === 1) { sub = cm + dv.getUint32(r + 4); break; }
  }
  if (sub < 0 || dv.getUint16(sub) !== 4) throw new Error('Tabla de caracteres no compatible');
  const seg = dv.getUint16(sub + 6) / 2;
  const fin = sub + 14, ini = fin + 2 * seg + 2, delta = ini + 2 * seg, rango = delta + 2 * seg;
  const glifo = (u) => {
    for (let i = 0; i < seg; i++) {
      if (u > dv.getUint16(fin + 2 * i)) continue;
      const s = dv.getUint16(ini + 2 * i); if (u < s) return 0;
      const ro = dv.getUint16(rango + 2 * i), d = dv.getInt16(delta + 2 * i);
      if (!ro) return (u + d) & 0xFFFF;
      const g = dv.getUint16(rango + 2 * i + ro + 2 * (u - s));
      return g ? (g + d) & 0xFFFF : 0;
    }
    return 0;
  };
  const anchos = [];
  for (let c = 32; c <= 255; c++) { const u = unicodeWinAnsi(c); anchos.push(Math.round((avance(u ? glifo(u) : 0) * 1000) / upem)); }
  return { bytes, upem, caja, ascendente, descendente, mayusculas, italica, anchos };
}
