# SPA — Especificación

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
- **Rutas alternativas y diagnóstico:** si un fondo no carga ninguna tesela,
  el mapa avisa con las causas probables y un enlace a una tesela de prueba.
  La ortofoto pasa sola a la misma imagen por el **WMS del IGN**
  (`wms-inspire/pnoa-ma`) y, si tampoco, a **Esri World Imagery**
  (condiciones de uso de Esri por revisar antes de un uso real).
- **Google:** su servicio de teselas (Map Tiles API) **no sirve satélite
  2D a proyectos facturados en el EEE desde el 8-7-2025** (responde 403).
  La única vía sería su API JavaScript completa (clave y facturación), que
  sustituiría a Leaflet: descartado de momento.
- **Exportar el mapa a imagen** (fase 5): requiere que los servicios del IGN
  permitan uso entre orígenes (CORS). Pendiente de comprobar; por eso las
  capas se cargan hoy sin `crossOrigin`.

- **Cuadrícula:** muy tenue por defecto (intensidad 35 %, ajustable de
  10 a 100 % en el panel de capas). Las cifras de los márgenes esquivan los
  paneles y controles abiertos.
- **Fondo automático (opcional):** casilla «Ortofoto al acercarte». Al
  cruzar el zoom 17 hacia dentro pasa a la ortofoto; al alejarse vuelve al
  mapa elegido. Si el usuario cambia de mapa a mano, se respeta.
- **Copiar coordenadas:** se copia la **última posición del cursor** (al
  salir del mapa no se sustituye por el centro). Tecla **C** sobre el mapa:
  copia la coordenada bajo el cursor sin moverlo.

## 8. Medir y dibujar (fase 3)

- **Elementos:** punto, línea, área y círculo (`src/plan/plan.js`, sin
  dependencias del mapa; `src/ui/dibujo.js`, la parte visual).
- **Cómo se dibuja:** clic para cada vértice; termina con doble clic, Intro,
  el botón «Terminar» o tocando el último vértice (línea) o el primero
  (área). Retroceso quita el último vértice; Esc cancela. El círculo: centro
  y borde, o centro y **radio escrito** en metros.
- **Exactitud:** las líneas siguen la geodésica entre vértices; el círculo es
  un polígono cuyos vértices están exactamente a la distancia del radio
  (prueba: < 1 mm). Medidas: longitud real y sobre el mapa, rumbos de cada
  tramo (geográfico y de cuadrícula), superficie y perímetro.
- **Propiedades:** nombre, **bando** con los colores de APP-6 (propio azul,
  enemigo rojo, neutral verde, desconocido amarillo) y **estado** (presente:
  trazo continuo; previsto: discontinuo). El siguiente elemento toma el
  último bando y estado usados.
- **Editar:** clic en un elemento (o en la lista «Plan» del panel de capas)
  para seleccionarlo. Arrastrar vértices; clic en un punto medio para añadir
  uno; clic derecho (o × en la lista de vértices) para quitarlo. Supr borra.
- **Deshacer / rehacer:** botones y Ctrl+Z / Ctrl+Y (Ctrl+Mayús+Z). Hasta
  200 pasos.
- **Guardado provisional:** el plan se guarda en el navegador
  (`localStorage`). Guardar en archivo y exportar: fase 5.
- **Pruebas:** `pruebas/plan.test.mjs` (medidas frente a GeographicLib, un
  cuadrado de 1 km de cuadrícula mide 1 km²/k², historial) y
  `pruebas/navegador.mjs` (21 comprobaciones en Chromium: dibujar, editar,
  deshacer, copiar, cuadrícula, fondo automático).

## 9. Pendiente

- Conversión ED50 ↔ ETRS89 con la rejilla del IGN.
- Rumbo magnético (modelo WMM).
- Puntos de control: vértices geodésicos del IGN en la zona piloto.
