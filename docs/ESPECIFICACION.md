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
   efectos prácticos. ED50 (mapas antiguos) se convierte con la **rejilla
   oficial del IGN** (SPED2ETV2, NTv2, EPSG:15932) y el elipsoide
   internacional de 1924; nunca con una fórmula aproximada
   (`src/geo/rejillas.js`). Altitudes elipsoidales (GPS, ATAK) → altitud
   sobre el nivel del mar con el geoide **EGM08-REDNAP** del IGN.
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
- **Fondos** (`src/mapa/capas.js`): Topográfico (IGN `mapa-raster`, PNG),
  **Híbrido**, Mapa base (IGN `ign-base`) y **Relieve** (propio, ver abajo).
  La ortofoto suelta y el satélite suelto se quitaron: ahora son el Híbrido.
- **Híbrido = imagen + rótulos.** Imagen elegible: Google (`lyrs=s`), IGN
  PNOA máxima actualidad, Esri World Imagery o Bing; rótulos de Google
  (`lyrs=h`, en castellano), que se pueden quitar. **Fecha de la imagen**
  para el centro del mapa cuando se publica: IGN PNOA (GetFeatureInfo de
  `OI.MosaicElement`, con resolución) y Esri (identify). Google y Bing no la
  publican. Comprobado en Uceda: PNOA julio 2024 (25 cm), Esri julio 2023;
  Google y Bing muestran otras fechas (distinto laboreo de los campos).
- **Google y Bing:** acceso no oficial a sus teselas (sus condiciones no lo
  permiten y pueden cortarlo); decisión de Balú por calidad de imagen.
- **Relieve propio** (`src/mapa/relieve.js`): sombreado calculado en el
  navegador con el MDT del IGN (WCS de la IDEE, ASCII Grid con decimales):
  MDT05 a resolución completa desde zoom 16, reducido a ~200 puntos por
  tesela en 14–15, MDT25 en 11–13, MDT200 en 8–10, MDT1000 por debajo.
  Método de Horn, sol del NO a 45°, exageración vertical creciente al alejar.
  El «Relieve» del IGN en zoom 15 viene de una malla gruesa (~25 m, se ve
  pixelado); el propio muestra hasta los bancales. Peticiones medidas desde
  el navegador de Balú: 0,1–0,55 s y 84–460 KB por tesela.
- **Mantener detalle 1:25.000** (opcional): el IGN cambia de mapa según el
  zoom (MTN25 en 15–16, más general en 14 y 13). Con la opción, en 14 y 13
  se pintan las teselas del 15 reducidas (4× y 16× teselas). Límite: zoom 13.
- **Híbrido al acercarte** (opcional): desde zoom 17.
- **Pantalla y precisión:** el mapa se pinta en EPSG:3857, pero todos los
  números los calcula el motor sobre el elipsoide. La cuadrícula MGRS la
  dibuja SPA (desviación < 1 µm), tenue por defecto (35 %, ajustable).
  Sobre el híbrido, líneas y rótulos en **blanco**; sobre los mapas, en azul
  oscuro.
- **Zoom:** todos los fondos llegan a zoom 21 (Topográfico y Mapa base se
  amplían desde su zoom 17; antes desaparecían a partir del 20).
- **Diagnóstico y rutas alternativas:** si un fondo no carga, aviso con las
  causas probables y tesela de prueba; la ortofoto pasa sola al WMS del IGN.
- **Barra inferior:** solo la coordenada (en el formato elegido en Ajustes,
  siempre al metro) y la **altitud** del terreno bajo el cursor.
- **Ajustes** (icono arriba a la derecha), en apartados desplegables que
  recuerdan si estaban abiertos: *Coordenadas y rumbos* (MGRS, UTM,
  geográficas, grados decimales; grados, milésimas o G M S), *Imagen del
  híbrido* (Google por defecto, PNOA, Esri, Bing, con su fecha; nombres y
  carreteras), *Mapas de fondo* (mantener detalle 1:25.000, híbrido al
  acercarte) y *Cuadrícula MGRS* (intensidad). El buscador abre el apartado
  que toca.
- **Panel de capas en desplegables:** Fondo (solo los cuatro fondos), Mapas
  (zona piloto, mapas importados, importar, buscar en mis mapas, crear mapa)
  y Visualización (cuadrícula MGRS, sombreado, curvas de nivel).
- **Altitudes:** siempre sobre el nivel del mar (MDT05 del IGN; las alturas
  elipsoidales de ATAK se convierten con el geoide EGM08-REDNAP).
- **Barra de herramientas** escondida: aparece al acercar el ratón arriba a
  la izquierda (en pantallas táctiles, siempre). Una pastilla indica la
  herramienta activa.
- **Buscador universal** (arriba): coordenadas en cualquier formato (MGRS,
  UTM, geográficas, grados con punto o coma; MGRS o UTM sin zona → la de la
  vista; «ED50 30 …» con la rejilla del IGN), lo dibujado, archivos y sus
  elementos, mapas importados, mapas de la carpeta y ajustes y acciones.
  Aproximado: sin acentos, con erratas (Damerau-Levenshtein) y sinónimos
  (track ~ línea, satélite ~ híbrido, grid ~ cuadrícula, mils ~ milésimas…).
  Flechas e Intro para elegir. `src/ui/difuso.js`.
- **Exportar el mapa a imagen** (fase 5): requiere CORS en los servicios.

## 8. Medir y dibujar (fase 3)

- **Elementos:** punto, línea (también tracks), área y círculo
  (`src/plan/plan.js` sin dependencias del mapa; `src/ui/dibujo.js`).
- **«Mover»** (antes «Consultar»): pinchar el mapa no pone nada; solo
  selecciona elementos. Los puntos se ponen solo con la herramienta Punto.
- **Al dibujar:** clic añade un punto; **imán**: si cae a 12 px o menos de
  otro punto (del plan, de lo importado o de la propia línea) se une a él
  exactamente; **clic derecho** quita el último; **arrastrar** un punto ya
  puesto lo mueve; **mantener pulsado** abre un menú para eliminarlo;
  doble clic, Intro o clic en el último punto termina (área: en el primero).
- **Ficha del punto:** nombre, bando (colores APP-6), presente/previsto,
  coordenada y altitud (MDT05, al metro).
- **Ficha de la línea:** distancia total, desnivel acumulado de subida y
  bajada, altitudes mínima/máxima e inicial/final, perfil de altura (al
  pasar el ratón se marca el punto en el mapa); estilo: color (de bando o
  libre), trazo (continua, discontinua, punteada) y grosor. Sin tabla de
  tramos. La «línea de acción» llegará con los símbolos APP-6 (fase 4).
- **Área / círculo:** superficie, perímetro / radio exacto; mismo estilo.
- **Editar:** arrastrar vértices (con imán), añadir en puntos medios, quitar
  con clic derecho; Supr borra; deshacer/rehacer (Ctrl+Z / Ctrl+Y).
- **Panel «Plan»** (botón en la barra): lo dibujado y lo importado.

## 9. Alturas

- **Fuente:** MDT05 del IGN (malla de 5 m, altitud ortométrica) por el WCS
  de la IDEE (`servicios.idee.es/wcs-inspire/mdt`, cobertura
  `Elevacion4258_5`; respaldo `Elevacion4258_25`). Permite CORS: funciona
  también abriendo el archivo con doble clic. Comprobado desde el navegador
  de Balú (bloque de 450 × 340 m en 0,4 s).
- **Cómo:** bloques fijos de 0,004° con 2 celdas de margen, en caché;
  interpolación bilineal entre centros de celda; se muestra **redondeada al
  metro**. El desnivel usa una histéresis de 1 m contra el ruido de la malla.
- **Alturas de los archivos:** se muestran aparte. Las de ATAK (CoT) son
  elipsoidales (HAE) y se convierten con el geoide EGM08-REDNAP.

## 10. Importar (`src/datos/`, `src/ui/importar.js`)

- **Arrastrar y soltar** en cualquier parte de la página, o botones.
- **Datos** → panel «Plan · Archivos importados» (ver/ocultar, nombres,
  centrar, «Pasar al plan» para editarlos, quitar):
  GPX (wpt, rte, trk), KML/KMZ (puntos, líneas, polígonos, tracks, estilos,
  superposiciones de imagen), CoT de ATAK (puntos con bando, líneas,
  rectángulos, círculos) y **paquetes .zip de ATAK** (manifiesto, CoT, y lo
  que lleven dentro: GPX, KML, KMZ, otros zip y mapas).
- **Mapas** → «Capas · Mapas» (ver, opacidad, centrar, quitar). **Clic en
  su nombre:** encuadra el mapa (acercando o alejando), lo marca con un
  marco magenta que parpadea y lo pone **por encima de todas las capas**.
  Todos los mapas importados se pintan **encima de cualquier fondo** (el
  fondo elegido queda debajo: al bajar la opacidad se mezclan). Las cachés
  de ATAK con zooms incompletos se ven a cualquier escala: cada tesela se
  compone con la del mismo zoom, o con sus hijas reducidas (hasta 3 niveles),
  o con un trozo ampliado de su madre.
  Desde lejos, los mapas que aún no se pintan por el zoom muestran su
  contorno discontinuo. Se colocan solos:
  colocados solos:
  - `.sqlite` de ATAK/osmdroid y **MBTiles** (plano o normalizado): lector
    SQLite propio **por trozos** (sirve para archivos de GB: solo lee las
    páginas necesarias). Comprobado con UCEDA_25K y UCEDA_FOTO: teselas
    idénticas byte a byte a las de SQLite.
  - **GeoTIFF** (clásico y BigTIFF; teselas o bandas; sin compresión, LZW,
    Deflate, PackBits, JPEG, WebP; reducciones internas): lector propio por
    trozos. Sistema leído del propio archivo (EPSG) o de su `.prj`; si no lo
    trae, se pregunta.
  - **JPG/PNG + archivo de mundo** (.jgw/.pgw/.wld) y `.prj`.
  - Sistemas: ETRS89 y WGS84 UTM 28–31, ED50 UTM 28–31 (rejilla IGN),
    REGCAN95, geográficas, Web Mercator.
  - **Reproyección exacta:** malla de control de 17 × 17 por tesela calculada
    con el motor; error medido ≤ 0,5 píxeles del mapa original.
  - **ECW / JP2 / MrSID:** no se pueden leer en un navegador. Se avisa con
    cómo convertirlos una vez a GeoTIFF (QGIS o `gdal_translate`).
- **Buscador de mapas** (Chrome/Edge): se elige una vez la carpeta; se
  leen solo las cabeceras (zona de cada mapa); búsqueda por nombre y «solo
  los que cubren la vista»; se carga solo el elegido, sin copiarlo.
- **Guardado:** IndexedDB del navegador. En Chrome/Edge los mapas se
  guardan como acceso directo al archivo (no se copian; puede pedir volver
  a dar acceso al abrir de nuevo).

## 11. Creador de mapas (`src/datos/creador.js`, `src/ui/creador.js`)

- **Zona:** dibujada en el mapa (irregular, cóncava incluida; clic derecho
  quita el último vértice, doble clic o «Terminar»), un área o círculo del
  plan, o la vista actual. Se descargan solo las teselas que toca la zona
  (barrido por filas: bordes + interior; probado contra una referencia
  exacta con 60 polígonos al azar).
- **Capas:** Topográfico (hasta z17), Híbrido (la imagen y los rótulos de
  Ajustes, hasta z20 en Google), Mapa base (z17) y Relieve (calculado con el
  MDT, z17). Cada una con su rango de zoom y los m/píxel de cada zoom.
- **Varias capas:** un solo archivo (cada zoom de una capa; si dos piden el
  mismo zoom gana la de más arriba, que se ordena con ▲) o un archivo por
  capa.
- **Formatos:** ATAK `.sqlite` (tablas `tiles`, `ATAK_catalog`,
  `ATAK_metadata` con srid 3857, como las cachés de Balú), MBTiles 1.3 (con
  índice), ZIP de teselas `{z}/{x}/{y}` y GeoTIFF (EPSG:3857, Deflate, una
  imagen por capa al zoom elegido, recortada a la zona con transparencia).
  Escritor SQLite propio (`sqlite-escritor.js`), verificado con el SQLite
  oficial (`integrity_check`), incluido un índice de 200 000 entradas.
- **Calidad** JPEG del híbrido con rótulos y del relieve: alta, media,
  ligera. Las teselas que no hay que recomponer se guardan tal cual llegan.
- **Estimación** de teselas, MB y tiempo antes de empezar; aviso por encima
  de 30 000 teselas y límite de 250 000.
- **Descarga** en el propio navegador (6 a la vez, reintentos, progreso,
  cancelar). Se elige dónde guardar antes de empezar (Chrome/Edge) o se
  descarga normal. Opción de abrir el mapa en SPA al terminar.

## 12. Pendiente

- Rumbo magnético (modelo WMM).
- Puntos de control: vértices geodésicos del IGN en la zona piloto.
