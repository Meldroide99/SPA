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
  "operaciones": [
    { "id": "uuid", "nombre": "OP NORTE", "padre": null, "estado": "curso | futura | pasada",
      "notas": "", "autor": "", "origen": "local | recibido de …", "creado": "…", "modificado": "…", "version": 1 },
    { "id": "uuid", "nombre": "Fase 1", "padre": "uuid de OP NORTE", "estado": null, "…": "…" }
  ],
  "elementos": [
    {
      "id": "uuid",
      "paquete": "uuid de la operación o fase (o null)",
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

## 6. Simbología APP-6 (fase 4, `src/simbolos/`, `src/ui/simbolos.js`)

- Norma: **APP-6(E) Ed. E v2 (octubre 2025)**. Nombres en castellano y
  escalones según la **PD0-002** (anexo A: • escuadra, •• pelotón,
  ••• sección).
- **Catálogo completo** (salvo lo marítimo, aéreo y espacial):
  - Iconos sacados del propio PDF y vectorizados (`herramientas/app6/`):
    unidades terrestres (183), material (174), instalaciones (78),
    combatientes a pie (43), actividades y sucesos (81), organizaciones
    civiles (11), con todos sus modificadores de sector 1 y 2 y los comunes
    (tablas 1-3 y 1-4).
  - Marcos por conjunto (tabla 1-14): material amigo en círculo, combatiente a
    pie en hexágono, instalación con barra, actividad con esquinas, civil en
    morado. Los iconos «de marco completo» se adaptan a cada marco.
  - Movilidad del material (tabla 1-10), CG, agrupación táctica, finta,
    refuerzo y campos de texto.
- **SIDC de 30 dígitos** (anexo A): versión `16`, contexto, identidad,
  conjunto, estado, CG/FT/finta, escalón o movilidad (tabla A-8), entidad,
  modificadores y modificador común.
- **Medidas de coordinación y cometidos** (cap. 8 y su apéndice A): 440
  símbolos — líneas, zonas, puntos, ejes y direcciones, defensa, espacio
  aéreo, fuegos y objetivos, obstáculos y fortificación, NBQR,
  sostenimiento, engaño e inteligencia, y los 47 verbos de cometido táctico (el contraataque va con los ejes). Cada uno
  con sus puntos de anclaje según las reglas de dibujo de la norma.
- Las geometrías se calculan en un plano métrico local alrededor de las
  anclas y se pasan a lat/lon; las líneas pasan exactamente por los
  puntos tocados (prueba automática). Los motivos repetidos (alambradas,
  dientes, rayados) se miden en píxeles para verse igual a cualquier zoom.
- Interfaz:
  - Paleta con buscador, constructor guiado (bando → arma → tipo → escalón)
    y el árbol completo de la APP-6(E) por conjunto.
  - Con la paleta de unidades abierta, **cada clic en el mapa pone la unidad
    elegida**; también se puede **arrastrar y soltar** cualquier símbolo
    (las medidas se sueltan ya hechas, con un tamaño de ~170 px).
  - Al arrastrar, los paneles se difuminan y dejan pasar el ratón; con una
    unidad elegida la paleta se vuelve translúcida al salir al mapa.
  - Fichas con desplegables de miniaturas; Duplicar; girar (asa ↻ y botones
    de 15°/45°) y mover entero (asa ✥) los cometidos y medidas.
- **Tamaño**: el de Ajustes es el del momento de ponerlos; al alejar encogen
  con el mapa (mínimo 28 %) y al acercar crecen solo hasta un 35 % más.
- **Rótulos** sobre las líneas (PL, LD, FSCL, MSR…) y en los límites
  (escalón y unidades a cada lado): uno en cada tramo al acercar, menos al
  alejar, siempre al menos uno.
- Pendiente: exportar con SIDC (fase 5).

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
- **Panel «Objetos»** (botón en la barra; antes «Plan»): todo lo pintado y lo
  importado, con filtros (ver §12).

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
- **Datos** → panel «Objetos · Archivos importados» (ver/ocultar, nombres,
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

## 12. Operaciones, Objetos, Lazo e interfaz (v0.9)

**Operaciones** (`src/plan/operaciones.js`, `src/ui/panel-operaciones.js`).
Paquetes de datos anidados: una operación contiene fases, saltos… (con el
nombre que se quiera) y estos otros, sin límite. Cada objeto está en un
paquete como mucho (`el.paquete`) y pertenece también a los de arriba.
- Pestañas **En curso / Futuras / Pasadas** (estado del paquete de primer nivel).
- **Operación activa** (●, píldora verde abajo): lo que se pinte entra en ella.
- **Ojo** por paquete, **ver solo esta**, **Ocultar todo** (mapa sin símbolos).
  Lo que se ve es de cada usuario (`localStorage spa.vista.paquetes`), no del plan.
- Arrastrar objetos entre paquetes y paquetes dentro de otros (sin ciclos).
- Menú ⋯: fase dentro, renombrar, pasar a futura/pasada, sacar al primer
  nivel, duplicar, encuadrar, ver en Objetos, exportar o enviar, borrar
  (solo el paquete —sus objetos suben un nivel— o con todo).
- Todo se deshace (el historial guarda objetos y paquetes).
- **Paquete SPA** (`.spa.json`, formato `spa-paquete`): objetos + los
  paquetes que los contienen. Al abrirlo (soltarlo o Importar) entra como
  operación nueva y editable, con ids nuevos (no pisa nada) y `origen`
  «recibido de …».
- **Varios usuarios (pendiente de servidor):** el modelo ya lleva `autor`,
  `origen` y `version`. Con usuario y contraseña, cada uno cargará la
  operación del servidor y, al modificar algo, elegirá si es **para todos**
  (se sube) **o solo para él** (capa personal encima). Esa pregunta necesita el
  servidor: se hará en la fase de usuarios.

**Objetos** (`src/ui/objetos.js`). Lista de todo lo pintado con filtros
(categoría: unidades, líneas de coordinación, cometidos, dibujos; operación;
bando; estado; texto), selección múltiple (Mayús: un tramo), resaltado en el
mapa y acciones: ver, meter en una operación, exportar o enviar, borrar. Al
borrar algo que está en una operación pregunta: **quitarlo solo de la
operación** (sigue en el mapa) o **borrarlo del todo**.

**Lazo** (`src/ui/lazo.js`, `src/datos/exportar.js`). Círculo geodésico (radio
exacto sobre el elipsoide): pulsar en el centro y arrastrar al borde, o clic y
clic. Selecciona lo visible que queda dentro (o lo toca, a elegir), agrupado
por operación y por archivo importado. Exporta a **KMZ** (carpetas por
operación › fase), **KML**, **GeoJSON** (RFC 7946), **GPX** 1.1, **CSV** (Excel,
«;», con MGRS al metro) o **paquete SPA**; «Enviar…» usa el Compartir del
sistema cuando el navegador lo permite (si no, descarga el archivo para
adjuntarlo). Coordenadas WGS84 a 7 decimales (~1 cm). Los círculos salen como
polígono de 72 vértices a la distancia exacta del centro.

**Líneas de coordinación** (antes «medidas»): el rótulo es el nombre que
escribe el usuario; si no escribe nada, la sigla de base (PL, LD…). Nunca
«PL PL1».

**Giro**: rueda en la ficha (aguja que se arrastra, rumbo exacto escrito, ±15°
y 180°) y asa ↻ en el mapa que se arrastra alrededor del centro, de 5 en 5°
(con Mayús, de 1 en 1). Se ve en directo y se guarda al soltar.

**Interfaz** (`src/ui/ventanas.js`, `src/ui/apariencia.js`):
- Vidrio esmerilado en todo lo que flota (sin color propio, difumina lo de
  detrás). Tema automático (oscuro sobre el híbrido), claro u oscuro.
- Mapa a pantalla completa; cabecera y coordenadas flotan (píldora con fondo
  difuminado y texto con halo para leerse sobre cualquier fondo).
- Barra de herramientas: aparece al acercar el ratón bajo la cabecera.
  **APP-6**: un solo botón; al pasar el ratón salen Unidades, Líneas de
  coordinación y Cometidos.
- **Ventanas**: se mueven por la cabecera, cambian de tamaño desde la esquina
  (doble clic en la cabecera: a su sitio) y su contenido se adapta al ancho
  («container queries»). Sin usar unos segundos se recogen y se abren al pasar
  el ratón; la chincheta las fija. Al poner objetos se apartan (casi
  transparentes, se pincha el mapa a través); para usar una, ratón quieto
  encima. Los desplegables con miniaturas se abren solos al pasar el ratón.
- **Ajustes › Pantalla y ventanas**: tema, transparencia, desenfoque, tamaño
  de la interfaz, tiempo para recogerse, apartar al poner objetos, barra fija,
  altitud, recolocar ventanas y valores de fábrica. Todo por usuario.
- Sin zona piloto (la primera vez el mapa se abre en Guadarrama).

### v0.9.1 (correcciones de Balú)
- **Mapas de la carpeta de ATAK**: fondos Esri Topo, Google Relieve, OpenTopoMap y
  MTBMap; imágenes del híbrido Esri Clarity y Bing con sus rótulos. También en el
  creador de mapas. Se quedan los IGN en PNG (más nítidos que el JPEG de la carpeta).
- Cabecera y barra de herramientas se esconden sin uso; Capas se recoge a su icono.
- **Todo se va despacio**: las ventanas se desvanecen y encogen (≈1,5 s); al
  cerrarlas, se desvanecen (0,55 s).
- **Tamaño de las ventanas** desde cualquier borde o esquina, agarrando justo por
  fuera (no choca con la barra de desplazamiento).
- **Símbolos**: todos del mismo tamaño en pantalla, los pusieras al zoom que fuera
  (referencia: zoom 14; crecen hasta +35 % al acercar y encogen al alejar).
- Sin SIDC, sin brújula ni grados en la ficha, sin explicaciones de uso y sin
  desplegables automáticos. «Recientes» recogido. Arma **UAS (drones)** con sus
  variantes (ala fija, rotatoria, VTOL, rotor basculante, ISR, ataque, GE, recuperación).
- **Nombres de las líneas** en su propia capa por encima de las líneas, con fondo
  de vidrio: la línea pasa difuminada por detrás.
- **Lazo a mano** (además del círculo) y exportación **ZIP** (paquete de datos de
  ATAK: MANIFEST/manifest.xml + KML).
- Cuadrados de 100 km de la cuadrícula: en una etiqueta en la esquina de abajo a la
  izquierda, solo con la cuadrícula MGRS activada (ya no en medio del mapa).
- Valores de fábrica: transparencia 60 %, desenfoque 6 px, tamaño 95 %.

### v0.9.2
- **Regla**: clic pone punto, botón derecho deshace, doble clic (o Intro) termina.
  La distancia de cada tramo va encima de la línea, en su mitad, en píldora de
  vidrio. La medida terminada se queda en el mapa; al pincharla sale su ficha como
  la de un track (distancia, desnivel, perfil y tramos con rumbos) y se puede
  guardar como línea o quitar (`src/ui/regla.js`).
- **Botón derecho** con una unidad elegida en la paleta: deja de ponerla (como Esc).
- **Brújula** arriba a la izquierda (desde v0.9.3, solo el norte).
- **Objetos**: el filtro de operación muestra solo operaciones (sin fases).
- **Operaciones**: los objetos van por categoría (unidades, líneas de coordinación,
  cometidos, dibujos) y, dentro, los iguales apilados con su número; sin coordenadas.
- **Ventanas**: el alto que elige el usuario es un tope; con los desplegables
  cerrados encogen solas. Al abrirse la ficha o la regla, Capas se queda en su icono
  (si no está fijada). Chincheta fijada en azul.
- Fuera la línea de cuadrados de 100 km al alejar. La aclaración de las altitudes
  (nivel del mar, MDT05) solo en Ajustes.

### v0.9.3 · interfaz viva
- **Barra lateral** (izquierda, vidrio, redondeada): de ella salen **Capas,
  Operaciones y Objetos**, cada uno desde su botón, con un pequeño muelle. Un
  puntito marca el abierto. Sin uso, el panel vuelve a la barra.
- **Reordenar**: mantener pulsado un botón (barra lateral o de herramientas) y
  arrastrarlo; los demás se apartan, tiemblan un poco mientras tanto y el orden
  se recuerda (`spa.orden.dock`, `spa.orden.herramientas`) (`src/ui/vivo.js`).
- **Lupa** como el Dock del Mac: los iconos crecen al pasar el ratón (el de
  debajo más, los vecinos un poco). El nombre de cada botón solo sale al pasar
  el ratón, en una píldora de vidrio. Botones que se hunden al pulsar y rebotan.
- **Zoom con la rueda** fluido (`src/mapa/zoom-suave.js`): un golpe de rueda =
  un nivel, deslizado y con el punto del ratón quieto; en el panel táctil,
  continuo, y se asienta en el nivel entero siguiente (mapas nítidos). Arrastre
  con inercia que frena poco a poco según la fuerza.
- **Desplegables cerrados de fábrica** (Capas, Ajustes, grupos de líneas de
  coordinación; Cometidos, que es un solo grupo, abierto).
- **Buscador**: también **lugares** (ciudades, pueblos, parajes, calles) del
  nomenclátor oficial del IGN (CartoCiudad, JSONP) y, si no responde, de
  OpenStreetMap (Nominatim) (`src/datos/lugares.js`). El híbrido es una imagen:
  sus nombres no se pueden leer. Además: lazo en círculo / a mano, exportar en
  cada formato, Capas, regla.
- **Bandos**: solo los 4 (amigo, hostil, neutral, desconocido) en la paleta y al
  modificar.
- **Brújula**: solo la aguja del norte (fuera la azul y la convergencia).
- **Sello SPA**: oro champán sobre gris, con «Planeamiento *táctico*» y
  «S3 · Lauria».

## 13. Pendiente

- Rumbo magnético (modelo WMM).
- Puntos de control: vértices geodésicos del IGN en la zona de Guadarrama.
- Usuarios y servidor: cargar operaciones del servidor y preguntar al modificar «¿para todos o solo para ti?».

## v0.9.4 — Estilo Apple
- Icono de **Operaciones** nuevo (ruta entre dos puntos), distinto del de Capas.
- Iconos nítidos al pasar el ratón: se dibujan a 1,42× y se encogen (sin `will-change`); la lupa solo cambia la escala.
- Barra lateral con más separación entre iconos (10 px).
- Los paneles de la barra lateral se apilan sin pisarse: se mide el ancho real (sin la escala de la animación de apertura) y se pegan al dock (8 px).
- Selectores y pestañas segmentados con pastilla que se desliza (muelle `linear()`), muelles `--suave` y `--bote`.
- Vidrio: borde superior claro, sombra por capas, `prefers-reduced-transparency` y `prefers-contrast`.
- Valores de fábrica: transparencia 65 %, desenfoque 10 px, tamaño 95 % (`VERSION` de apariencia = 3).

### v0.9.4 · pasada completa Apple
- **Arrastrar ventanas:** siguen al ratón 1:1; pasado el borde se estiran como una goma (`goma()`, constante .55) y vuelven.
- **Soltar con inercia:** se mide la velocidad de los últimos 100 ms, se proyecta (`(v/1000)·.99/(1−.99)`) y un muelle de 2 ejes (respuesta .4 s; amortiguación 1, o .8 si venía lanzada) la lleva al sitio, siempre dentro de la pantalla.
- **Interrumpible:** si se agarra en pleno vuelo, se queda donde se cogió.
- **Levantarse:** mientras se arrastra, sombra más honda y escala 1,015.
- **Paneles del dock:** salen de su botón sin rebote (un clic no lleva inercia) y se van por el mismo camino.
- **Tipografía:** tracking según tamaño (títulos −.012em, texto pequeño +.01em).
- **Vibrancia en oscuro:** texto más legible sobre el vidrio. Cambio claro↔oscuro con transición.
- **Movimiento reducido:** sin desplazamientos ni escalas, solo fundidos.

## v0.10.0 — OPORD (Fase 6, primera entrega)

### Arreglos previos
- **Zoom con la rueda fluido:** durante el gesto las capas de teselas no se vacían (`_move` con `{pinch:true}`, como el pellizco nativo); al terminar se cargan las del zoom final y se tiran las viejas.
- **Relleno de áreas, círculos y zonas APP-6:** deslizador «Relleno» en la ficha (0–100 %, por defecto 10 % en dibujos y casi hueco en zonas).
- **Ojo de las fases:** si la operación está oculta, sus fases salen tachadas; pinchar el ojo de una fase enseña solo esa.
- **Ventanas de la barra lateral:** se colocan antes de pintarse y salen por detrás de las ya abiertas (como un cajón); nunca por encima.

### Plantillas (src/opord/plantillas.js)
- **OPORD de brigada**, sacada del modelo de Balú (OPORD_TXT_GT.pdf): estructura completa de 5 párrafos con sus subapartados, títulos en inglés y en castellano (el documento elige idioma).
- **Corregido respecto al modelo:**
  - títulos montados sobre las marcas «RESTRICTED» y cortados («Commander's», «Missions to Maneuver Units»);
  - numeración repetida («a. A. Enemy»);
  - erratas («headquartes», «DEPHT», «POSITIONNAL», «Genera»);
  - el «(1) Reinforcements» que iba en la misma línea que «g. Movement Control»;
  - cabeceras de tabla partidas («ATTACHEMEN TS/DETACH», «UNIT T»);
  - tamaños de letra distintos para el mismo nivel (c. Fires y d. Engineering);
  - los formularios MEDEVAC y MEDSITREP, que iban pegados como imagen en el 4.c.(6): ahora son anexos aparte y enlazados.
- **Añadido (estándar OTAN, se puede quitar):** «Elementos vigentes en todas las fases» en las instrucciones de coordinación, acuse de recibo con firma y lista de anexos.
- **OPORD de compañía (provisional):** 5 párrafos estándar, a la espera del modelo de la unidad.
- **Anexos:** MEDEVAC 9 líneas y MEDSITREP (sacados del modelo, con totales automáticos), Plan de fuegos, Plan PACE y anexo en blanco.

### Modelo (src/opord/documento.js)
- La OPORD vive en `plan.documentos`, unida a su operación. Los anexos van aparte, enlazados en los dos sentidos y con letra automática.
- **Claves estables por apartado:** al cambiar de plantilla todo pasa a su sitio, y lo que no encaja va a «Sin sitio en esta plantilla».
- **Fases = fases de la operación:** un apartado «Fase n» por cada una, con su GDH guardado en la operación, numerados seguidos entre «Descripción» y «Fase siguiente». Si se borra una fase, lo escrito se conserva marcado.
- **Varios usuarios:** cada cambio se registra con autor, hora y reloj lógico; `fusionar()` se queda con el más reciente de cada campo.
- **Paquete SPA:** lleva la operación, sus fases, la OPORD y los anexos. Al recibirlo otra vez se actualiza lo que ya se tenía (por `idOrigen`) en vez de duplicarlo.

### Editor (src/ui/opord.js)
- Botón OPORD en la barra lateral, «Hacer/Abrir la OPORD» en el menú de cada operación, y un icono de documento en las operaciones que tienen OPORD.
- La ventana va a la derecha, con una hoja de papel. Tiene pestañas para la OPORD y cada anexo, chips de fases e índice numerado.
- **Todo editable en el sitio:**
  - textos con negrita, cursiva y listas;
  - títulos (doble clic);
  - tablas con filas y columnas, GDH validado y MGRS pinchando en el mapa;
  - formularios de los anexos.
- **Menú ⋯ de cada apartado:** subapartados, tablas (libre, fuegos, PACE, puestos de mando, por fases), anexo enlazado, subir, bajar y quitar (con deshacer).
- **Organización operativa:**
  - lista que se escribe con Intro (otra unidad), Tab (dentro), Mayús+Tab (fuera) y Retroceso (quitar);
  - relación de mando y «cedida por» en cada unidad, y «Desde el mapa» para traer las unidades dibujadas;
  - organigrama debajo de la lista;
  - las agregaciones salen solas de las unidades cedidas.
- **Matriz de misiones:** filas = unidades de maniobra de la organización, columnas = fases más la columna ECD/BPT.
- **Concepto:**
  - la ventana se encoge y el mapa enseña la operación o la fase elegida, con lo vigente en todas las fases;
  - lo que se dibuja entra en esa fase;
  - el cuadro enseña el texto de la fase y los cometidos de cada unidad en ella.
- **Exportar:**
  - OPORD y anexos en PDF, Word, Excel y TXT, enlazados entre sí;
  - concepto en paquete de datos ATAK (ZIP), KMZ o paquete SPA;
  - todo junto en un ZIP o por separado, y «Enviar…» cuando el navegador deja compartir archivos.
- Los objetos se pueden marcar «Vigente en todas las fases» desde su ficha o desde la OPORD.
