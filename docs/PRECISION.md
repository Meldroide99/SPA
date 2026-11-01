# Informe de precisión del motor geodésico

Generado por `node pruebas/banco.mjs --informe` el 2026-11-01.

**Referencia:** GeographicLib (C. F. F. Karney), compilada desde el código
oficial. Es la implementación de referencia mundial para estos cálculos.
Los puntos de prueba salen de `pruebas/referencia/generar.py` (semilla fija):
zona piloto de Guadarrama, toda la Península y Baleares, Canarias, cambios
de huso y de banda, y puntos a ±1 µm y ±0,1 mm de las líneas de cuadrícula MGRS.

| | Qué se comprueba | Casos | Error máximo | Límite |
|---|---|---|---|---|
| ✅ | UTM: zona y hemisferio | 1913 | 0 fallos | 0 fallos |
| ✅ | UTM directa: Este | 1913 | 7.3e-9 m | 1.0e-6 m |
| ✅ | UTM directa: Norte | 1913 | 3.7e-9 m | 1.0e-6 m |
| ✅ | UTM inversa: posición | 1913 | 1.1e-8 m | 1.0e-6 m |
| ✅ | Convergencia de meridianos | 1913 | 9.4e-14 ° | 1.0e-9 ° |
| ✅ | Factor de escala | 1913 | 1.3e-15  | 1.0e-12  |
| ✅ | MGRS directa (5 precisiones) | 11478 | 0 distintas | 0 distintas |
| ✅ | MGRS en bordes de cuadrícula (±1 µm y ±0,1 mm) | 576 | 0 distintas | 0 distintas |
| ✅ | MGRS inversa: centro del cuadrado | 2813 | 1.1e-8 m | 1.0e-6 m |
| ✅ | MGRS inversa: referencias no leídas | 2813 | 0 fallos | 0 fallos |
| ✅ | Distancia sobre el elipsoide | 1201 | 3.1e-9 m | 1.0e-6 m |
| ✅ | Rumbo de salida | 1201 | 8.0e-11 ° | 1.0e-9 ° |
| ✅ | Rumbo de llegada | 1201 | 8.0e-11 ° | 1.0e-9 ° |
| ✅ | Punto de destino (rumbo + distancia) | 600 | 2.4e-9 m | 1.0e-6 m |
| ✅ | Rumbo de llegada al destino | 600 | 0 ° | 1.0e-9 ° |
| ✅ | Área de polígono | 60 | 7.2e-5 m² | 0.00100 m² |
| ✅ | Perímetro de polígono | 60 | 3.4e-9 m | 1.0e-6 m |

**Cómo leerlo:** "Error máximo" es la mayor diferencia encontrada entre
nuestro motor y la referencia en todos los casos. Un error de 1e-6 m es una
milésima de milímetro. En MGRS se exige que la referencia sea **idéntica**
letra a letra (0 distintas), incluidos los puntos pegados a una línea de
cuadrícula, que es donde falla un redondeo mal hecho.

**Lo que este informe NO cubre todavía:** conversión ED50 ↔ ETRS89 (pendiente
de la rejilla oficial del IGN) y declinación magnética (pendiente del modelo
WMM). Ver docs/ESPECIFICACION.md.
