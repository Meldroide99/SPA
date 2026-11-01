# SPA — Especificación (Fase 0)

Herramienta de planeamiento para la sección S3 de la web Lauria. Se desarrolla
en este repositorio y se migrará a S3 cuando esté lista. Seguimiento del
proyecto (hoja de ruta, decisiones y tareas): página de Notion
"Planeamiento S3 — Hoja de ruta".

## 1. Qué es

Un mapa base sencillo (estilo Google Maps) con capas intercambiables
(topográfico 1:25.000, ortofoto, terreno/MDT), sobre el que se dibujan
unidades y gráficos tácticos según APP-6, todo georreferenciado en MGRS.
Con plantillas de OPORD fáciles de rellenar que incorporan lo dibujado.
Todo exportable. Prioridad: **sencillez, eficiencia y eficacia**, y muy
visual, con el mismo estilo que la web Lauria.

## 2. Decisiones de base

| Tema | Decisión |
|---|---|
| Datos | Ficticios por ahora. Sin datos personales. Código privado. |
| Alojamiento | Servidor y dominio propios del usuario (se migrará cuando avise). |
| Tecnología | HTML + JavaScript (módulos ES), **sin frameworks ni dependencias de npm**. Las librerías externas se copian en `src/vendor/` con su licencia. |
| Uso sin servidor | `herramientas/empaquetar.mjs` genera en `dist/` un único HTML autocontenido que se abre con doble clic y sin conexión. |
| Estilo | Mismos colores, tipografías (EB Garamond, Manrope, IBM Plex Mono) y componentes que la web Lauria. |
| Zona piloto | A — Sierra de Guadarrama (Cercedilla–Navacerrada), unos 20 × 20 km, huso 30, banda T. |
| Simbología | **APP-6 en su edición vigente.** Ver apartado 6. |
| Seguimiento en vivo | No ahora. El modelo de datos queda preparado (apartado 4). |

## 3. Reglas de precisión (no negociables)

1. **Un solo dato guardado:** latitud/longitud WGS84 en grados, doble
   precisión. MGRS, UTM, grados-minutos-segundos y milésimas son solo
   formas de **mostrar** o de **leer**. Nunca se guarda un valor redondeado.
2. **Datum:** WGS84. ETRS89 (oficial en España, RD 1071/2007) coincide a
   efectos prácticos. ED50 (mapas antiguos) se convertirá con la rejilla
   oficial del IGN, nunca con una fórmula aproximada. *(Pendiente.)*
3. **MGRS se trunca, no se redondea.** Precisiones de 100 km a 1 m. Al leer
   una referencia se toma el centro del cuadrado y se informa del tamaño.
4. **Distancias:** por defecto sobre el elipsoide. También "sobre el mapa"
   (cuadrícula UTM). Más adelante, con pendiente (necesita el MDT).
5. **Tres nortes:** geográfico, de cuadrícula y magnético. Siempre se dice
   cuál se usa. Rumbo de cuadrícula = geográfico − convergencia.
   *(Magnético pendiente del modelo WMM.)*
6. **Ángulos:** cálculo en grados de doble precisión; el usuario elige ver
   grados, G° M' S" o **milésimas OTAN (6400)**.
7. **Husos:** España usa 28 (Canarias), 29, 30 y 31. Un plan que cruce de
   huso se trata en la fase 7.
8. **Verificación:** todo cálculo se compara con GeographicLib (Karney).
   `node pruebas/banco.mjs` debe pasar antes de subir cualquier cambio del
   motor. Resultados en `docs/PRECISION.md`.

## 4. Modelo de datos (borrador)

Un plan es un único archivo JSON. Las geometrías siguen GeoJSON
(**ojo: orden [longitud, latitud]**, al revés de como se habla).

```json
{
  "formato": "spa-plan",
  "version": 1,
  "id": "uuid",
  "nombre": "Ejercicio ficticio 01",
  "creado": "2026-11-01T10:00:00Z",
  "modificado": "2026-11-01T10:00:00Z",
  "datum": "WGS84",
  "capas": [{ "id": "uuid", "nombre": "Propias", "visible": true, "orden": 0 }],
  "elementos": [
    {
      "id": "uuid",
      "tipo": "unidad | grafico | punto | linea | area | texto",
      "geometria": { "type": "Point", "coordinates": [-4.0058, 40.7354] },
      "simbolo": { "norma": "APP-6", "edicion": "E", "sidc": "…", "modificadores": {} },
      "propiedades": { "nombre": "1/II BPAC", "notas": "" },
      "capa": "uuid",
      "creado": "…", "modificado": "…", "autor": "…",
      "fuente": "manual | importado | gps",
      "hora": "…",
      "version": 1
    }
  ],
  "opord": {}
}
```

Preparado para el seguimiento en vivo: cada elemento tiene identificador
único, `hora` (momento al que se refiere la posición), `fuente` y `version`
(para fusionar cambios de varios usuarios). El guardado pasa por una capa
intercambiable:

```
almacen.abrir() → plan        almacen.guardar(plan)        almacen.escuchar(fn)
  ├─ AlmacenArchivo   (ahora: archivo local, como Moral y Bienestar)
  └─ AlmacenServidor  (futuro: el servidor propio, tiempo real)
```

## 5. Estructura del repositorio

```
calculadora.html         página de la fase 1 (usa módulos)
dist/                    versiones de un solo archivo (doble clic)
assets/css, assets/fonts estilo Lauria
src/geo/                 motor geodésico (NO depende del mapa ni de la página)
  constantes.js angulos.js utm.js mgrs.js geodesia.js coordenadas.js index.js
src/ui/                  interfaz
src/vendor/              librerías de terceros con su licencia
pruebas/banco.mjs        banco de precisión contra GeographicLib
pruebas/unitarias.test.mjs
pruebas/referencia/      datos de referencia y su generador
herramientas/            empaquetador y servidor local
docs/                    esta especificación e informe de precisión
```

## 6. Simbología APP-6

- Ediciones disponibles: **C** (mayo 2011) y **D versión 1** (octubre 2017)
  en PDF. La **E** existe (referencia de 2025) pero no la tenemos todavía.
- APP-6(C) no tiene código de símbolo propio (su anexo A remite a la B).
  APP-6(D) usa un **código numérico de 20 dígitos** (anexo A, A.2–A.3).
- Plan: diseñar para la **edición vigente (E)**. Mientras no tengamos el
  documento, se trabaja con la **D**, de la misma familia de códigos
  (a confirmar con el texto de la E).
- El PowerPoint del curso (APP-6 (C), PD0-002) da la lista de símbolos y
  cometidos tácticos más usados y sus nombres en castellano: base del
  catálogo corto.

## 7. Mapa (fase 2)

- **Librería:** Leaflet 1.9.4 (copiada en `src/vendor/leaflet`).
- **Capas** (`src/mapa/capas.js`), servicios WMTS/WMS oficiales, malla
  `GoogleMapsCompatible`:
  | Capa | Servicio | Nombre de capa |
  |---|---|---|
  | Topográfico | `ign.es/wmts/mapa-raster` | `MTN` |
  | Ortofoto | `ign.es/wmts/pnoa-ma` | `OI.OrthoimageCoverage` |
  | Mapa base | `ign.es/wmts/ign-base` | `IGNBaseTodo` |
  | Relieve / sombreado | `servicios.idee.es/wmts/mdt` | `Relieve` |
  | Curvas de nivel | `servicios.idee.es/wms-inspire/mdt` | `EL.ContourLine` |
  | Vértices geodésicos (en pruebas) | `ign.es/wms-inspire/redes-geodesicas` | `RED_REGENTE` |
- **Pantalla y precisión:** el mapa se pinta en proyección web (EPSG:3857),
  pero todos los números (coordenadas, cuadrícula, distancias, rumbos) los
  calcula el motor sobre el elipsoide. La cuadrícula MGRS la dibuja SPA,
  punto a punto, con el motor verificado (prueba: desviación < 1 µm).
- **Exportar el mapa a imagen** (fase 5): requiere que los servicios del IGN
  permitan uso entre orígenes (CORS). Pendiente de comprobar; por eso las
  capas se cargan hoy sin `crossOrigin`.

## 8. Pendiente

- Conversión ED50 ↔ ETRS89 con la rejilla del IGN.
- Rumbo magnético (modelo WMM).
- Puntos de control: vértices geodésicos del IGN en la zona piloto.
