# SPA

Herramienta de planeamiento sobre mapa para la sección S3 de la web Lauria:
mapa con capas, símbolos APP-6 georreferenciados en MGRS y OPORD que se
rellenan solos con lo dibujado. Se desarrolla aquí y se migrará a S3.

**Estado:**
- Fase 1 — motor geodésico (coordenadas, distancias y rumbos): núcleo
  terminado y verificado.
- Fase 2 — mapa piloto: mapas del IGN (topográfico MTN, ortofoto PNOA, mapa
  base, relieve, curvas de nivel), cuadrícula MGRS propia, coordenada bajo
  el cursor, consulta de puntos, búsqueda y regla de medida.
- Fase 3 — medir y dibujar: puntos, líneas/tracks, áreas y círculos con
  nombre, bando, estilo; imán; perfil de altura y desnivel (MDT05 del IGN).
- Importar: GPX, KML/KMZ, paquetes de ATAK; mapas .sqlite (ATAK), MBTiles,
  GeoTIFF e imagen georreferenciada, colocados solos; buscador de mapas.
- ED50 ↔ ETRS89 con la rejilla oficial del IGN y geoide EGM08-REDNAP.

Especificación en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

## Probarlo

- **Con doble clic:** abre `dist/mapa.html` (o `dist/calculadora.html`).
  La calculadora funciona sin conexión; el mapa necesita internet para
  descargar las teselas del IGN.
- **Para desarrollar:** `node herramientas/servidor.mjs` y abre
  <http://localhost:8080/mapa.html>.

## Comprobar la precisión

```
npm test
```

Ejecuta las pruebas unitarias (motor y plan) y el banco de precisión, que compara el motor
con GeographicLib en más de 18 000 casos. El resultado está en
[docs/PRECISION.md](docs/PRECISION.md).

Para regenerar los datos de referencia hace falta compilar GeographicLib
(<https://github.com/geographiclib/geographiclib>) y ejecutar
`GEOGRAPHICLIB_BIN=…/build/tools python3 pruebas/referencia/generar.py`.

## Generar las versiones de un solo archivo

```
npm run empaquetar
```

Prueba en navegador (necesita Playwright instalado de forma global):

```
npm run prueba:navegador -- --capturas
```

## Licencias de terceros

- GeographicLib (C. F. F. Karney), MIT — `src/vendor/LICENSE-geographiclib.txt`
- Leaflet 1.9.4, BSD-2 — `src/vendor/leaflet/LICENSE-leaflet.txt`
- Cartografía: © Instituto Geográfico Nacional / IDEE, CC BY 4.0 (scne.es). El navegador la pide directamente a sus servicios; no se copia en el repositorio.
- Rejillas del IGN (SPED2ETV2, EGM08-REDNAP), CC BY 4.0, en la versión GeoTIFF del proyecto PROJ (OSGeo/PROJ-data) — `datos/rejillas/`.
- Imágenes de Google: acceso no oficial, sujeto a sus condiciones (ver docs/ESPECIFICACION.md §7).
- EB Garamond, Manrope e IBM Plex Mono, SIL OFL — `assets/fonts/` (falta copiar aquí el texto de licencia de Plex Mono)
