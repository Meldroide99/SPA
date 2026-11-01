# SPA

Herramienta de planeamiento sobre mapa para la sección S3 de la web Lauria:
mapa con capas, símbolos APP-6 georreferenciados en MGRS y OPORD que se
rellenan solos con lo dibujado. Se desarrolla aquí y se migrará a S3.

**Estado:** fase 1 — motor geodésico (coordenadas, distancias y rumbos)
terminado y verificado. Especificación en
[docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

## Probarlo

- **Con doble clic:** abre `dist/calculadora.html`. Funciona sin conexión.
- **Para desarrollar:** `node herramientas/servidor.mjs` y abre
  <http://localhost:8080/>.

## Comprobar la precisión

```
npm test
```

Ejecuta las pruebas unitarias y el banco de precisión, que compara el motor
con GeographicLib en más de 18 000 casos. El resultado está en
[docs/PRECISION.md](docs/PRECISION.md).

Para regenerar los datos de referencia hace falta compilar GeographicLib
(<https://github.com/geographiclib/geographiclib>) y ejecutar
`GEOGRAPHICLIB_BIN=…/build/tools python3 pruebas/referencia/generar.py`.

## Generar las versiones de un solo archivo

```
npm run empaquetar
```

## Licencias de terceros

- GeographicLib (C. F. F. Karney), MIT — `src/vendor/LICENSE-geographiclib.txt`
- EB Garamond, Manrope e IBM Plex Mono, SIL OFL — `assets/fonts/` (falta copiar aquí el texto de licencia de Plex Mono)
