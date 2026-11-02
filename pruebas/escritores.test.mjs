// Pruebas de los escritores de archivos (creador de mapas):
// SQLite (ATAK y MBTiles) verificado con el SQLite oficial (Python) y con
// nuestro lector; GeoTIFF leído con nuestro lector TIFF; ZIP con unzip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escribirSqlite, varint, registro } from '../src/datos/sqlite-escritor.js';
import { escribirAtak, escribirMbtiles, escribirZipXyz, escribirGeoTiff, crc32 } from '../src/datos/escritores.js';
import { abrirMapaTeselas } from '../src/datos/teselas.js';
import { abrirTiff, lectorBlob } from '../src/datos/tiff.js';
import { abrirZip } from '../src/datos/zip.js';

const dir = mkdtempSync(join(tmpdir(), 'spa-'));
const guardarBlob = async (b, nombre) => { const f = join(dir, nombre); writeFileSync(f, Buffer.from(await b.arrayBuffer())); return f; };
const python = (codigo, ...args) => {
  const r = spawnSync('python3', ['-I', '-c', codigo, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
const contenido = (z, x, y) => {
  const n = 30 + ((z * 7919 + x * 31 + y * 17) % 7000);
  return Uint8Array.from({ length: n }, (_, i) => (z * 13 + x * 7 + y * 3 + i) % 251);
};
// Teselas válidas alrededor de Uceda, zooms 10–15
const TESELAS = [];
for (let z = 10; z <= 15; z++) {
  const n = 2 ** z, cx = Math.floor(((-3.42 + 180) / 360) * n);
  const cy = Math.floor(((1 - Math.log(Math.tan((40.84 * Math.PI) / 180) + 1 / Math.cos((40.84 * Math.PI) / 180)) / Math.PI) / 2) * n);
  const r = z < 13 ? 2 : 7;
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) TESELAS.push({ z, x, y, datos: new Blob([contenido(z, x, y)]) });
}

test('varint y registro con los casos del formato', () => {
  assert.deepEqual(varint(127), [127]);
  assert.deepEqual(varint(128), [0x81, 0x00]);
  assert.deepEqual(varint(16384), [0x81, 0x80, 0x00]);
  const r = registro([null, 1, 0, 300, -5, 'ñ', new Uint8Array([7])]);
  // cabecera: tamaño, 0 (null), 9 (1), 8 (0), 2 (int16), 1 (int8), 15 (texto de 1 byte... ñ son 2: 13+4=17), 14 (blob de 1)
  assert.deepEqual([...r.subarray(0, 8)], [8, 0, 9, 8, 2, 1, 17, 14]);
});

test('ATAK (.sqlite): íntegro para SQLite, legible por SPA y con las tablas de ATAK', async () => {
  const b = await escribirAtak(TESELAS, { nombre: 'Prueba SPA' });
  const f = await guardarBlob(b, 'prueba_atak.sqlite');
  const out = python(`
import sqlite3,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
print(c.execute('pragma integrity_check').fetchone()[0])
print(c.execute('select count(*) from tiles').fetchone()[0], c.execute('select count(*) from ATAK_catalog').fetchone()[0])
print(c.execute("select value from ATAK_metadata where key='srid'").fetchone()[0])
print(c.execute('select provider from tiles limit 1').fetchone()[0])`, f).split('\n');
  assert.equal(out[0], 'ok');
  assert.equal(out[1], `${TESELAS.length} ${TESELAS.length}`);
  assert.equal(out[2], '3857'); assert.equal(out[3], 'Prueba SPA');
  const m = await abrirMapaTeselas(lectorBlob(b), 'x');
  assert.equal(m.tipo, 'ATAK'); assert.deepEqual(m.zooms, [10, 11, 12, 13, 14, 15]);
  for (const t of TESELAS.filter((_, i) => i % 7 === 0)) assert.deepEqual(new Uint8Array(await (await m.tesela(t.z, t.x, t.y)).arrayBuffer()), contenido(t.z, t.x, t.y));
});

test('MBTiles: íntegro, con índice usado por SQLite, y legible por SPA', async () => {
  const b = await escribirMbtiles(TESELAS, { nombre: 'Prueba SPA', formato: 'png', limites: { oeste: -3.5, sur: 40.8, este: -3.3, norte: 40.9 } });
  const f = await guardarBlob(b, 'prueba.mbtiles');
  const out = python(`
import sqlite3,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
print(c.execute('pragma integrity_check').fetchone()[0])
print(dict(c.execute('select name,value from metadata').fetchall())['bounds'])
print(c.execute("explain query plan select tile_data from tiles where zoom_level=1 and tile_column=2 and tile_row=3").fetchall()[0][3])`, f).split('\n');
  assert.equal(out[0], 'ok');
  assert.equal(out[1], '-3.5,40.8,-3.3,40.9');
  assert.match(out[2], /USING INDEX tile_index/);
  const m = await abrirMapaTeselas(lectorBlob(b), 'x');
  assert.equal(m.tipo, 'MBTiles');
  for (const t of TESELAS.filter((_, i) => i % 5 === 0)) assert.deepEqual(new Uint8Array(await (await m.tesela(t.z, t.x, t.y)).arrayBuffer()), contenido(t.z, t.x, t.y));
});

test('SQLite: índice de 200 000 entradas (varios niveles) íntegro', async () => {
  const mb = []; for (let x = 0; x < 500; x++) for (let y = 0; y < 400; y++) mb.push([16, 30000 + x, 40000 + y]);
  const b = await escribirSqlite([{ nombre: 'tiles', sql: 'CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)', filas: mb.map((t, i) => ({ rowid: i + 1, valores: [...t, new Uint8Array([t[1] % 256, t[2] % 256])] })) }],
    [{ nombre: 'tile_index', tabla: 'tiles', sql: 'CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)', entradas: mb.map((t, i) => [...t, i + 1]) }]);
  const f = await guardarBlob(b, 'grande.mbtiles');
  assert.equal(python(`
import sqlite3,sys,random
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
ok=c.execute('pragma integrity_check').fetchone()[0]
mal=sum(1 for _ in range(2000) for x,y in [(30000+random.randrange(500),40000+random.randrange(400))] if c.execute('select tile_data from tiles where zoom_level=16 and tile_column=? and tile_row=?',(x,y)).fetchone()[0]!=bytes([x%256,y%256]))
print(ok, mal)`, f), 'ok 0');
});

test('ZIP de teselas {z}/{x}/{y}: lo abre unzip y nuestro lector', async () => {
  const b = await escribirZipXyz(TESELAS.slice(0, 40), { extension: (t) => 'png' });
  const f = await guardarBlob(b, 'teselas.zip');
  const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
  assert.match(r.stdout, /No errors detected/);
  const { entradas } = await abrirZip(b);
  assert.equal(entradas.length, 40);
  const t = TESELAS[3];
  const e = entradas.find((x) => x.nombre === `${t.z}/${t.x}/${t.y}.png`);
  assert.deepEqual(await e.leer(), contenido(t.z, t.x, t.y));
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('GeoTIFF: mosaico en EPSG:3857, georreferencia y píxeles correctos', async () => {
  // 2×2 teselas sintéticas de color liso (RGBA) a zoom 15
  const z = 15, x0 = 16067, y0 = 12302;
  const teselas = [];
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    for (let k = 0; k < rgba.length; k += 4) { rgba[k] = 50 + dx * 100; rgba[k + 1] = 60 + dy * 100; rgba[k + 2] = 70; rgba[k + 3] = 255; }
    teselas.push({ z, x: x0 + dx, y: y0 + dy, rgba });
  }
  const b = await escribirGeoTiff(teselas, { z, conAlfa: true, rgbaDe: async (t) => t.rgba });
  const t = await abrirTiff(lectorBlob(b));
  const im = t.imagenes[0];
  assert.equal(im.ancho, 512); assert.equal(im.alto, 512); assert.equal(im.muestras, 4);
  assert.equal(t.geo.epsg, 3857);
  const R = 6378137, tam = (2 * Math.PI * R) / 2 ** z / 256;
  assert.ok(Math.abs(t.geo.afin[0] - tam) < 1e-9);
  assert.ok(Math.abs(t.geo.afin[2] - (-Math.PI * R + x0 * 256 * tam)) < 1e-6);
  const blq = await im.leerBloque(1, 0); // arriba a la derecha → dx=1, dy=0
  assert.deepEqual([...blq.datos.slice(0, 4)], [150, 60, 70, 255]);
  const py = python(`
from PIL import Image; import sys
im=Image.open(sys.argv[1]); print(im.size, im.mode, im.getpixel((300,300)))`, await guardarBlob(b, 'mosaico.tif'));
  assert.equal(py, '(512, 512) RGBA (150, 160, 70, 255)');
});
