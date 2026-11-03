# Iconos de la APP-6(E) sacados del PDF oficial

Genera `src/simbolos/datos/iconos.js` (unidades, material, instalaciones,
combatientes a pie, actividades, organizaciones civiles y sus modificadores)
a partir del PDF **APP-06 Ed. E v2 (oct. 2025)**. Los iconos de la norma son
imágenes dentro de las tablas; aquí se recortan, se localiza el octógono guía
azul de cada celda, se llevan a la caja 50–150 de SPA y se trazan los
contornos. Los trazos rectos de los iconos «de marco completo» se guardan
aparte para poder estirarlos a cada marco sin deformarlos.

Necesita Python con `pdfplumber`, `opencv-python-headless`, `scikit-image`,
`numpy`, `pillow` y `pdftoppm` (poppler).

```sh
PDF=APP-06_EDE_V2_E_.pdf; T=/tmp/app6
python3 filas.py $PDF 43 64   > $T/c1.json   # modificadores comunes (tablas 1-3, 1-4)
python3 filas.py $PDF 149 292 > $T/c3.json   # cap. 3: unidades, material, instalaciones
python3 filas.py $PDF 293 319 > $T/c4.json   # cap. 4: combatientes a pie
python3 filas.py $PDF 401 428 > $T/c7.json   # cap. 7: actividades
# (las filas de modificadores llevan además su sector: ver el historial del repositorio)
for c in 1 3 4 7; do python3 vectorizar.py $PDF $T/c$c.json $T/v$c.json 400; done
python3 generar.py ../../src/simbolos/datos/iconos.js $T/v1.json $T/c3.json $T/v3.json $T/c4.json $T/v4.json $T/c7.json $T/v7.json
node hoja.mjs $T/v3.json $T/hoja.png 12 0 96   # hoja de revisión
```

Los nombres en castellano están en `es_unidades.py`. Las medidas de
coordinación y los cometidos (cap. 8) no salen del PDF: se dibujan con sus
reglas de anclaje en `src/simbolos/medidas.js` (catálogo en
`medidas-catalogo.js`, iconos puntuales en `medidas-glifos.js`).
