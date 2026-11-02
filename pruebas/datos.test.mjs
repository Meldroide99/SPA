// Pruebas de importación: TIFF/GeoTIFF y reproyección, SQLite (ATAK y
// MBTiles), ZIP/CoT/GPX/KML, rejillas del IGN (ED50, geoide), sistemas de
// coordenadas y alturas (MDT). Los archivos de prueba están en pruebas/datos
// (generados con Python: valores conocidos de antemano).
//
// Si están los archivos reales de Balú (adjuntos de la sesión), se prueban
// también; si no, esas pruebas se saltan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, openSync, readSync, fstatSync } from 'node:fs';
import { abrirTiff, lectorBlob, lzw } from '../src/datos/tiff.js';
import { abrirMapaTeselas, claveOsmdroid, desdeClaveOsmdroid } from '../src/datos/teselas.js';
import { importarDatos, colorArgb, colorKml, bandoCot } from '../src/datos/vectorial.js';
import { leerAsc, interpolarAsc, crearServicioAlturas, resumenPerfil } from '../src/datos/alturas.js';
import { prepararRejillas, ed50AEtrs89, etrs89AEd50, ondulacionGeoide, haeAAltitud } from '../src/geo/rejillas.js';
import { crsDesdeEpsg, epsgDesdeTexto } from '../src/geo/crs.js';
import { fuenteGeoTiff, pintarTesela, invertirAfin, limitesFuente } from '../src/datos/raster.js';
import { geoAUtm, INTERNACIONAL_1924 } from '../src/geo/index.js';

const D = new URL('./datos/', import.meta.url);
const blob = (f) => new Blob([readFileSync(new URL(f, D))]);
const lectorArchivo = (ruta) => {
  const fd = openSync(ruta, 'r');
  return { tamano: fstatSync(fd).size, async leer(o, n) { const b = Buffer.alloc(n); const r = readSync(fd, b, 0, n, o); return new Uint8Array(b.buffer, b.byteOffset, r); } };
};
await prepararRejillas();

// ---------------------------------------------------------------- TIFF
const colorEsperado = (x, y) => [x & 255, y & 255, ((x >> 8) & 15) | (((y >> 8) & 15) << 4)];

for (const f of ['utm25830_lzw.tif', 'utm25830_deflate.tif', 'ed50_23030_packbits.tif']) {
  test(`TIFF ${f}: decodifica cada píxel exactamente`, async () => {
    const t = await abrirTiff(lectorBlob(blob(f)));
    const im = t.imagenes[0];
    assert.equal(im.ancho, 320); assert.equal(im.alto, 240);
    let errores = 0;
    for (let by = 0; by < im.bloquesY; by++) {
      const b = await im.leerBloque(0, by);
      for (let y = 0; y < b.alto; y++) for (let x = 0; x < 320; x++) {
        const gy = by * im.bloqueAlto + y; const e = colorEsperado(x, gy);
        for (let s = 0; s < 3; s++) if (b.datos[(y * b.ancho + x) * 3 + s] !== e[s]) errores++;
      }
    }
    assert.equal(errores, 0);
    assert.deepEqual(t.geo.afin, [5, 0, 440000, 0, -5, 4522000]);
    assert.equal(t.geo.epsg, f.includes('23030') ? 23030 : 25830);
  });
}

test('LZW: cadena con repeticiones (caso KwKwK)', () => {
  // "aaaa…" fuerza el caso del código aún no definido. Codificado a mano: 256 97 258 259 257 (9 bits)
  const bits = [256, 97, 258, 259, 257].map((c) => c.toString(2).padStart(9, '0')).join('');
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') bytes[i >> 3] |= 0x80 >> (i & 7);
  assert.equal(new TextDecoder().decode(lzw(bytes, 6)), 'aaaaaa');
});

// ---------------------------------------------------------------- reproyección
const lienzoFalso = () => {
  let datos = null;
  return { getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img) => { datos = img.data; } }), get datos() { return datos; } };
};
const lonX = (X, z) => (X / (256 * 2 ** z)) * 360 - 180;
const latY = (Y, z) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * Y) / (256 * 2 ** z)));

for (const [f, z] of [['utm25830_lzw.tif', 17], ['utm25830_lzw.tif', 15], ['ed50_23030_packbits.tif', 16]]) {
  test(`Reproyección ${f} a zoom ${z}: cada píxel pintado sale del píxel de origen correcto`, async () => {
    const fu = await fuenteGeoTiff(blob(f));
    const inv = invertirAfin(fu.afin);
    const lim = limitesFuente(fu);
    const n = 2 ** z;
    const tx0 = Math.floor((lim.oeste + 180) / 360 * n), tx1 = Math.floor((lim.este + 180) / 360 * n);
    const ty = (lat) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    let pintados = 0, maxErr = 0;
    for (let x = tx0; x <= tx1; x++) for (let y = ty(lim.norte); y <= ty(lim.sur); y++) {
      const lz = lienzoFalso();
      await pintarTesela(fu, inv, { x, y, z }, lz);
      if (!lz.datos) continue;
      for (let j = 0; j < 256; j += 3) for (let i = 0; i < 256; i += 3) {
        const o = (j * 256 + i) * 4; if (!lz.datos[o + 3]) continue;
        const r = lz.datos[o], g = lz.datos[o + 1], b = lz.datos[o + 2];
        const px = r | ((b & 15) << 8), py = g | ((b >> 4) << 8);
        // Posición exacta del centro del píxel de pantalla en el mapa de origen
        const q = fu.crs.deGeo(latY(y * 256 + j + 0.5, z), lonX(x * 256 + i + 0.5, z));
        const ex = inv[0] * q.x + inv[1] * q.y + inv[2], ey = inv[3] * q.x + inv[4] * q.y + inv[5];
        const f0 = fu.niveles[0].factor; // solo hay un nivel
        maxErr = Math.max(maxErr, Math.abs(px + 0.5 - ex / f0), Math.abs(py + 0.5 - ey / f0));
        pintados++;
      }
    }
    assert.ok(pintados > 500, `pintados ${pintados}`);
    // El vecino más próximo cae como mucho a medio píxel (más el error de la malla, ínfimo)
    assert.ok(maxErr <= 0.5 + 0.02, `error máximo ${maxErr} píxeles de origen`);
  });
}

test('ED50: el mismo número de coordenada cae ~109 m al O y ~208 m al S que en ETRS89', async () => {
  const a = await fuenteGeoTiff(blob('utm25830_lzw.tif'));
  const b = await fuenteGeoTiff(blob('ed50_23030_packbits.tif'));
  const ga = a.crs.aGeo(440500, 4521500), gb = b.crs.aGeo(440500, 4521500);
  const ua = geoAUtm(ga.lat, ga.lon), ub = geoAUtm(gb.lat, gb.lon, { zona: 30 });
  assert.ok(Math.abs(ub.este - ua.este + 109) < 3, `ΔE ${ub.este - ua.este}`);
  assert.ok(Math.abs(ub.norte - ua.norte + 208) < 3, `ΔN ${ub.norte - ua.norte}`);
});

// ---------------------------------------------------------------- rejillas IGN
test('Rejilla ED50→ETRS89: ida y vuelta exacta y desplazamiento en Madrid como el publicado', () => {
  const e = etrs89AEd50(40.4168, -3.7038);
  const v = ed50AEtrs89(e.lat, e.lon);
  assert.ok(Math.abs(v.lat - 40.4168) < 1e-10 && Math.abs(v.lon + 3.7038) < 1e-10);
  const uE = geoAUtm(40.4168, -3.7038), uD = geoAUtm(e.lat, e.lon, { zona: 30, elipsoide: INTERNACIONAL_1924 });
  // Valor de referencia habitual en la Península: ED50 ≈ ETRS89 + (110 m E, 208 m N)
  assert.ok(Math.abs(uD.este - uE.este - 110) < 3 && Math.abs(uD.norte - uE.norte - 208) < 3);
  assert.equal(ed50AEtrs89(50, 10), null, 'fuera de la rejilla');
});

test('Geoide EGM08-REDNAP: ondulación y paso de HAE a altitud', () => {
  const n = ondulacionGeoide(40.4168, -3.7038);
  assert.ok(n > 50 && n < 53, `N Madrid ${n}`); // ~51 m
  assert.ok(Math.abs(haeAAltitud(40.4168, -3.7038, 700) - (700 - n)) < 1e-9);
  assert.equal(ondulacionGeoide(60, 0), null);
});

// ---------------------------------------------------------------- CRS
test('Sistemas de coordenadas: EPSG y WKT', () => {
  assert.equal(epsgDesdeTexto('PROJCS["ETRS89 / UTM zone 30N",GEOGCS["ETRS89",DATUM["European_Terrestrial_Reference_System_1989"]],AUTHORITY["EPSG","25830"]]'), 25830);
  assert.equal(epsgDesdeTexto('PROJCS["ED50_UTM_zone_30N",GEOGCS["GCS_European_1950",DATUM["D_European_1950"]]]'), 23030);
  assert.equal(epsgDesdeTexto('PROJCS["WGS_1984_UTM_Zone_29N"]'), 32629);
  assert.equal(epsgDesdeTexto('PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere"]'), 3857);
  assert.equal(epsgDesdeTexto('GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989"]]'), 4258);
  const m = crsDesdeEpsg(3857); const p = m.deGeo(40.84, -3.42); const g = m.aGeo(p.x, p.y);
  assert.ok(Math.abs(g.lat - 40.84) < 1e-12 && Math.abs(g.lon + 3.42) < 1e-12);
  assert.equal(crsDesdeEpsg(99999), null);
});

// ---------------------------------------------------------------- SQLite
const teselas = JSON.parse(readFileSync(new URL('teselas.json', D)));
const contenido = (z, x, y) => {
  const n = 50 + ((z * 7919 + x * 31 + y * 17) % 3000);
  const head = (x + y) % 2 ? [0x89, 0x50, 0x4e, 0x47] : [0xff, 0xd8, 0xff, 0xe0];
  return Uint8Array.from([...head, ...Array.from({ length: n }, (_, i) => (z * 13 + x * 7 + y * 3 + i) % 251)]);
};
for (const f of ['atak.sqlite', 'plano.mbtiles', 'normalizado.mbtiles']) {
  test(`SQLite ${f}: todas las teselas idénticas y límites correctos`, async () => {
    const m = await abrirMapaTeselas(lectorArchivo(new URL(f, D).pathname), f);
    assert.equal(m.tipo, f.startsWith('atak') ? 'ATAK' : 'MBTiles');
    assert.equal(m.minZoom, 10); assert.equal(m.maxZoom, 14);
    for (const [z, x, y] of teselas) {
      const b = await m.tesela(z, x, y);
      assert.ok(b, `falta ${z}/${x}/${y}`);
      assert.deepEqual(new Uint8Array(await b.arrayBuffer()), contenido(z, x, y));
    }
    assert.equal(await m.tesela(14, 0, 0), null);
    assert.ok(m.limites.oeste < -3.42 && m.limites.este > -3.42 && m.limites.sur < 40.84 && m.limites.norte > 40.84);
  });
}
test('Clave de osmdroid: ida y vuelta (hasta zoom 22)', () => {
  for (const [z, x, y] of [[0, 0, 0], [13, 4017, 3075], [17, 64278, 49207], [22, 2008123, 1532211]]) {
    assert.deepEqual(desdeClaveOsmdroid(claveOsmdroid(z, x, y)), { z, x, y });
  }
  assert.equal(claveOsmdroid(16, 32135, 24603), (((16 * 2 ** 16) + 32135) * 2 ** 16) + 24603);
});

// ---------------------------------------------------------------- vectoriales
test('Paquete ATAK: CoT (punto, línea, círculo), GPX y KMZ dentro del zip', async () => {
  const r = await importarDatos(blob('paquete_atak.zip'), 'paquete_atak.zip');
  assert.equal(r.nombre, 'Paquete de prueba');
  const por = (n) => r.elementos.find((e) => e.nombre === n);
  assert.equal(por('ENE 1').tipo, 'punto'); assert.equal(por('ENE 1').bando, 'enemigo');
  assert.equal(por('ENE 1').puntos[0].ele, 880.5); assert.equal(por('ENE 1').refAltura, 'hae');
  assert.equal(por('ENE 1').descripcion, 'Puesto & observación');
  assert.equal(por('PL AZUL').tipo, 'linea'); assert.equal(por('PL AZUL').puntos.length, 3);
  assert.equal(por('PL AZUL').color, '#0000ff'); assert.equal(por('PL AZUL').grosor, 3);
  assert.equal(por('ZONA').tipo, 'circulo'); assert.equal(por('ZONA').radio, 500);
  assert.equal(por('Marcha').tipo, 'linea'); assert.equal(por('Marcha').puntos[1].ele, 720);
  assert.equal(por('OBJ 1').tipo, 'area'); assert.equal(por('OBJ 1').puntos.length, 4); assert.equal(por('OBJ 1').color, '#ff0000');
  assert.equal(r.superposiciones.length, 1); assert.equal(r.superposiciones[0].norte, 40.85);
  assert.ok(r.avisos.some((a) => a.includes('notas.txt')));
});
test('Colores y bandos de ATAK/KML', () => {
  assert.equal(colorArgb(-65536), '#ff0000'); assert.equal(colorArgb(-1), '#ffffff');
  assert.equal(colorKml('ff0000ff'), '#ff0000');
  assert.equal(bandoCot('a-f-G'), 'propio'); assert.equal(bandoCot('a-h-G'), 'enemigo'); assert.equal(bandoCot('a-u-G'), 'desconocido'); assert.equal(bandoCot('a-n-G'), 'neutral');
});

const ADJ = '/mnt/user-data/attachments/83f71dba-e38d-5cbc-87ae-83545dbf4640/';
test('Archivos reales de Balú (si están): GPX de ATAK y paquete PvFinales', { skip: !existsSync(`${ADJ}9d04d0e9-Ruta_Barriguetis.gpx`) }, async () => {
  const g = await importarDatos(new Blob([readFileSync(`${ADJ}9d04d0e9-Ruta_Barriguetis.gpx`)]), 'Ruta_Barriguetis.gpx');
  assert.equal(g.elementos.filter((e) => e.tipo === 'punto').length, 7);
  assert.equal(g.elementos.find((e) => e.tipo === 'linea').puntos.length, 24);
  const p = await importarDatos(new Blob([readFileSync(`${ADJ}82752999-PvFinales.zip`)]), 'PvFinales.zip');
  assert.deepEqual(p.elementos.map((e) => e.nombre).sort(), ['PV1', 'PV2', 'PV3', 'PV4', 'PV5', 'PV6', 'PV7']);
});
test('Mapas reales de Balú (si están): UCEDA_25K y UCEDA_FOTO', { skip: !existsSync('/mnt/user-data/uploads/UCEDA_25K.sqlite') }, async () => {
  const m = await abrirMapaTeselas(lectorArchivo('/mnt/user-data/uploads/UCEDA_25K.sqlite'), 'UCEDA_25K');
  assert.equal(m.tipo, 'ATAK'); assert.deepEqual(m.zooms, [13, 14, 15, 16, 17]);
  assert.equal((await m.tesela(16, 32135, 24603)).size, 151566);
  const f = await abrirMapaTeselas(lectorArchivo(`${ADJ}763a5d5f-UCEDA_FOTO.sqlite`), 'UCEDA_FOTO');
  assert.equal((await f.tesela(16, 32135, 24603)).size, 19719);
});

// ---------------------------------------------------------------- alturas
const ASC = '\r\n--wcs\r\nContent-Type: application/asc\r\n\r\nncols        7\nnrows        4\nxllcorner    -3.420000000000\nyllcorner    40.840000000000\ndx           0.000042857143\ndy           0.000050000000\n 830.281 829.050 827.846 826.963 826.203 825.443 824.684\n 830.616 829.568 828.454 826.967 826.208 825.448 824.689\n 831.251 829.983 828.509 827.142 826.251 825.453 824.693\n 831.256 829.992 828.737 827.954 826.435 825.458 824.698\n\r\n--wcs\r\nContent-Type: application/octet-stream\r\n\r\n<PAMDataset/>\r\n--wcs--';
test('MDT: lectura del ASCII Grid real del IGN e interpolación', () => {
  const m = leerAsc(ASC);
  assert.equal(m.ncols, 7); assert.equal(m.nrows, 4);
  // Centro de la celda superior izquierda → su valor exacto
  const lat = 40.84 + 4 * 0.00005 - 0.000025, lon = -3.42 + 0.0000214285715;
  assert.ok(Math.abs(interpolarAsc(m, lat, lon) - 830.281) < 1e-3);
  // A medio camino entre dos celdas → la media
  assert.ok(Math.abs(interpolarAsc(m, lat, lon + 0.000042857143 / 2) - (830.281 + 829.05) / 2) < 1e-3);
  assert.equal(interpolarAsc(m, 41, -3), null);
});
test('Servicio de alturas: bloques en caché y petición correcta', async () => {
  const urls = [];
  const s = crearServicioAlturas({ fetch: async (u) => { urls.push(u); return { ok: true, text: async () => ASC }; } });
  const a = await s.altura(40.84012, -3.41995);
  assert.ok(a > 824 && a < 832);
  await s.altura(40.84013, -3.41996);
  assert.equal(urls.length, 1, 'el segundo punto usa el bloque ya descargado');
  assert.match(urls[0], /CoverageId=Elevacion4258_5&SUBSET=Lat\(/);
});
test('Perfil: desnivel con umbral contra el ruido', () => {
  const r = resumenPerfil([0, 10, 10.4, 10.2, 20, 15, 15.3, 30].map((z, i) => ({ d: i, z })));
  assert.equal(r.subida, 35); assert.equal(r.bajada, 5); assert.equal(r.min, 0); assert.equal(r.max, 30);
});

// ---------------------------------------------------------------- relieve
test('Relieve: la ladera que mira al NO se ilumina, la que mira al SE queda en sombra', async () => {
  const { sombrearMalla, planRelieve, urlRelieve } = await import('../src/mapa/relieve.js');
  const malla = (f) => {
    const W = 5, H = 5, dx = 0.0001, dy = 0.0001; const valores = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) valores[j * W + i] = f(i, j);
    return { ncols: W, nrows: H, dx, dy, oeste: -3.42, norte: 40.84, nodata: null, valores };
  };
  // Sube hacia el SE (i al este, j al sur): la cara mira al NO → luz alta
  const noroeste = sombrearMalla(malla((i, j) => 100 + 5 * i + 5 * j))[12];
  const sureste = sombrearMalla(malla((i, j) => 100 - 5 * i - 5 * j))[12];
  const llano = sombrearMalla(malla(() => 100))[12];
  assert.ok(Math.abs(llano - Math.SQRT1_2) < 1e-6, `llano ${llano}`);
  assert.ok(noroeste > llano && sureste < llano, `NO ${noroeste} · SE ${sureste}`);
  assert.equal(planRelieve(16).cobertura, 'Elevacion4258_5'); assert.equal(planRelieve(16).n, null);
  assert.equal(planRelieve(12).cobertura, 'Elevacion4258_25');
  assert.match(urlRelieve(16, 32135, 24603), /CoverageId=Elevacion4258_5&SUBSET=Lat\(.*FORMAT=application\/asc$/);
  assert.match(urlRelieve(12, 2008, 1537), /SCALESIZE=Long\(173\),Lat\(173\)/);
});
