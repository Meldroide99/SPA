// Lector ZIP mínimo (paquetes de ATAK, KMZ). Lee por trozos: no carga el
// archivo entero en memoria. Descomprime con DecompressionStream
// ('deflate-raw'), que traen Chrome, Edge, Firefox, Safari y Node.

/**
 * @param {Blob} blob
 * @returns {Promise<{entradas: Array<{nombre:string, tamano:number, comprimido:number, metodo:number, leer:()=>Promise<Uint8Array>, leerTexto:()=>Promise<string>, comoBlob:()=>Promise<Blob>}>}>}
 */
export async function abrirZip(blob) {
  const trozo = async (ini, fin) => new Uint8Array(await blob.slice(ini, fin).arrayBuffer());
  // Fin del directorio central: últimos 22 bytes + comentario (≤ 64 KB)
  const ini = Math.max(0, blob.size - 65557);
  const cola = await trozo(ini, blob.size);
  let p = -1;
  for (let k = cola.length - 22; k >= 0; k--) {
    if (cola[k] === 0x50 && cola[k + 1] === 0x4b && cola[k + 2] === 0x05 && cola[k + 3] === 0x06) { p = k; break; }
  }
  if (p < 0) throw new Error('No es un archivo ZIP válido');
  const dv = new DataView(cola.buffer, cola.byteOffset + p);
  let total = dv.getUint16(10, true);
  let tamDir = dv.getUint32(12, true);
  let offDir = dv.getUint32(16, true);
  if (offDir === 0xffffffff || total === 0xffff) {
    // ZIP64: localizador justo antes
    const loc = new DataView(cola.buffer, cola.byteOffset + p - 20);
    if (loc.getUint32(0, true) !== 0x07064b50) throw new Error('ZIP64 no reconocido');
    const off64 = Number(loc.getBigUint64(8, true));
    const r = await trozo(off64, off64 + 56); const d = new DataView(r.buffer);
    total = Number(d.getBigUint64(32, true)); tamDir = Number(d.getBigUint64(40, true)); offDir = Number(d.getBigUint64(48, true));
  }
  const dir = await trozo(offDir, offDir + tamDir);
  const d = new DataView(dir.buffer);
  const entradas = [];
  let o = 0;
  const utf8 = new TextDecoder('utf-8');
  const cp437 = new TextDecoder('latin1');
  for (let k = 0; k < total; k++) {
    if (d.getUint32(o, true) !== 0x02014b50) break;
    const flags = d.getUint16(o + 8, true);
    const metodo = d.getUint16(o + 10, true);
    let comprimido = d.getUint32(o + 20, true);
    let tamano = d.getUint32(o + 24, true);
    const lNom = d.getUint16(o + 28, true), lExtra = d.getUint16(o + 30, true), lCom = d.getUint16(o + 32, true);
    let offLocal = d.getUint32(o + 42, true);
    const nombre = ((flags & 0x800) ? utf8 : cp437).decode(dir.subarray(o + 46, o + 46 + lNom));
    // Campo extra ZIP64
    let e = o + 46 + lNom;
    const finExtra = e + lExtra;
    while (e + 4 <= finExtra) {
      const id = d.getUint16(e, true), len = d.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (tamano === 0xffffffff) { tamano = Number(d.getBigUint64(q, true)); q += 8; }
        if (comprimido === 0xffffffff) { comprimido = Number(d.getBigUint64(q, true)); q += 8; }
        if (offLocal === 0xffffffff) { offLocal = Number(d.getBigUint64(q, true)); }
      }
      e += 4 + len;
    }
    o += 46 + lNom + lExtra + lCom;
    if (nombre.endsWith('/')) continue;
    const comoBlob = async () => {
      const cab = await trozo(offLocal, offLocal + 30);
      const c = new DataView(cab.buffer);
      const datos = offLocal + 30 + c.getUint16(26, true) + c.getUint16(28, true);
      const crudo = blob.slice(datos, datos + comprimido);
      if (metodo === 0) return crudo;
      if (metodo !== 8) throw new Error(`Compresión ZIP no soportada (${metodo}) en ${nombre}`);
      return new Response(crudo.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    };
    const leer = async () => new Uint8Array(await (await comoBlob()).arrayBuffer());
    entradas.push({ nombre, tamano, comprimido, metodo, comoBlob, leer, leerTexto: async () => utf8.decode(await leer()) });
  }
  return { entradas };
}
