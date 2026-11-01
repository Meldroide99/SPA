// Genera src/vendor/ign-rejillas.js con las rejillas oficiales del IGN
// incrustadas (base64), para que funcionen también en la versión de un solo
// archivo y sin conexión.
//
//   node herramientas/rejillas.mjs
//
// Origen: repositorio OSGeo/PROJ-data, carpeta es_ign (CC BY 4.0, IGN).
//   es_ign_SPED2ETV2.tif   ED50 → ETRS89 (NTv2 oficial, Península y Baleares)
//   es_ign_egm08-rednap.tif geoide EGM08-REDNAP (Península y Baleares)
import { readFileSync, writeFileSync } from 'node:fs';
const b64 = (f) => readFileSync(new URL(`../datos/rejillas/${f}`, import.meta.url)).toString('base64');
writeFileSync(new URL('../src/vendor/ign-rejillas.js', import.meta.url),
  `// Generado por herramientas/rejillas.mjs. No editar.\n// © IGN (www.ign.es), CC BY 4.0. Conversión a GeoTIFF: proyecto PROJ (OSGeo/PROJ-data).\n`
  + `export const SPED2ETV2 = '${b64('es_ign_SPED2ETV2.tif')}';\n`
  + `export const EGM08_REDNAP = '${b64('es_ign_egm08-rednap.tif')}';\n`);
console.log('src/vendor/ign-rejillas.js generado');
