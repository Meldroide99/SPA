#!/usr/bin/env python3
"""
Genera los datos de referencia del banco de pruebas de precisión.

Fuente de verdad: GeographicLib (C. F. F. Karney), herramientas de línea de
órdenes GeoConvert, GeodSolve y Planimeter, compiladas desde el código
oficial (https://github.com/geographiclib/geographiclib).

Uso:
    GEOGRAPHICLIB_BIN=/ruta/a/geographiclib/build/tools python3 generar.py

Escribe los ficheros JSON junto a este script. Semilla fija: siempre
salen los mismos puntos, así los resultados son reproducibles.
"""
import json, os, random, subprocess, sys
from pathlib import Path

BIN = Path(os.environ.get("GEOGRAPHICLIB_BIN", ""))
if not (BIN / "GeoConvert").exists():
    sys.exit("Defina GEOGRAPHICLIB_BIN con la carpeta que contiene GeoConvert")
AQUI = Path(__file__).resolve().parent
rnd = random.Random(20261101)


def ejecutar(herramienta, args, lineas):
    entrada = "\n".join(lineas) + "\n"
    r = subprocess.run([str(BIN / herramienta), *args], input=entrada,
                       capture_output=True, text=True, check=True)
    salida = r.stdout.strip().split("\n")
    assert len(salida) == len(lineas), (herramienta, len(salida), len(lineas))
    return salida


def guardar(nombre, datos):
    (AQUI / f"{nombre}.json").write_text(json.dumps(datos, indent=0))
    print(f"{nombre}.json: {len(datos['casos'])} casos")


# ---------------------------------------------------------------- puntos
def aleatorio(lat0, lat1, lon0, lon1, n):
    return [(rnd.uniform(lat0, lat1), rnd.uniform(lon0, lon1)) for _ in range(n)]

# Zona piloto A: Sierra de Guadarrama (Cercedilla–Navacerrada), ~20×20 km
PILOTO = aleatorio(40.70, 40.88, -4.15, -3.91, 400)
# Península y Baleares
PENINSULA = aleatorio(36.0, 43.8, -9.3, 4.3, 1200)
# Canarias (zona 28)
CANARIAS = aleatorio(27.6, 29.5, -18.2, -13.4, 200)
# Casos límite: cambios de huso (lon −6 y 0), de banda (lat 32, 40, 48)
LIMITES = []
for lon in (-12.0, -6.0, 0.0, 6.0):
    for d in (-1e-7, -1e-9, 0.0, 1e-9, 1e-7):
        LIMITES += [(rnd.uniform(36, 43), lon + d) for _ in range(3)]
for lat in (32.0, 40.0, 48.0):
    for d in (-1e-7, -1e-9, 0.0, 1e-9, 1e-7):
        LIMITES += [(lat + d, rnd.uniform(-8, 3)) for _ in range(3)]
# Ciudades de control (para revisar a ojo)
CIUDADES = [(40.416775, -3.703790), (41.387917, 2.169919), (37.389092, -5.984459),
            (43.362344, -8.411540), (28.463629, -16.251846), (39.569600, 2.650160),
            (40.735400, -4.005800), (40.850100, -3.955000)]
TODOS = PILOTO + PENINSULA + CANARIAS + LIMITES + CIUDADES
lineas = [f"{la:.15f} {lo:.15f}" for la, lo in TODOS]

# ---------------------------------------------------------------- UTM
utm = ejecutar("GeoConvert", ["-u", "-p", "9"], lineas)
cs = ejecutar("GeoConvert", ["-c", "-p", "9"], lineas)
casos = []
for (la, lo), u, c in zip(TODOS, utm, cs):
    z, e, n = u.split()
    g, k = c.split()
    casos.append({"lat": la, "lon": lo, "zona": int(z[:-1]), "hem": z[-1].upper(),
                  "e": float(e), "n": float(n), "gamma": float(g), "k": float(k)})
guardar("utm", {"fuente": "GeographicLib GeoConvert -u / -c", "casos": casos})

# ---------------------------------------------------------------- MGRS directa
casos = []
for prec in range(6):
    m = ejecutar("GeoConvert", ["-m", "-p", str(prec - 5)], lineas)
    for (la, lo), r in zip(TODOS, m):
        casos.append({"lat": la, "lon": lo, "prec": prec, "mgrs": r})
guardar("mgrs_directa", {"fuente": "GeographicLib GeoConvert -m (truncado)", "casos": casos})

# MGRS en bordes de cuadrícula: puntos a ±1 µm y ±0,1 mm de una línea de
# 100 km / 1 km. Aquí es donde un redondeo mal hecho falla. (Un punto
# EXACTAMENTE sobre la línea no se puede decidir con lat/lon en coma
# flotante; esa convención se prueba aparte, con E/N exactos.)
bordes = []
for zona, e0, n0 in [(30, 400000, 4500000), (30, 500000, 4400000), (30, 420000, 4521000),
                     (29, 600000, 4700000), (31, 400000, 4600000), (28, 300000, 3100000)]:
    for de in (-1e-4, -1e-6, 1e-6, 1e-4):
        for dn in (-1e-4, -1e-6, 1e-6, 1e-4):
            bordes.append(f"{zona}n {e0 + de:.6f} {n0 + dn:.6f}")
geo_bordes = ejecutar("GeoConvert", ["-p", "12"], bordes)  # → lat lon
lineas_b = [g for g in geo_bordes]
casos = []
for prec in range(6):
    m = ejecutar("GeoConvert", ["-m", "-p", str(prec - 5)], lineas_b)
    for g, r in zip(lineas_b, m):
        la, lo = map(float, g.split())
        casos.append({"lat": la, "lon": lo, "prec": prec, "mgrs": r})
guardar("mgrs_bordes", {"fuente": "GeographicLib GeoConvert -m en bordes de cuadrícula", "casos": casos})

# ---------------------------------------------------------------- MGRS inversa
refs = ejecutar("GeoConvert", ["-m", "-p", "0"], lineas)          # 1 m
refs += ejecutar("GeoConvert", ["-m", "-p", "-2"], lineas[:600])  # 100 m
refs += ejecutar("GeoConvert", ["-m", "-p", "-5"], lineas[:300])  # 100 km
geo = ejecutar("GeoConvert", ["-g", "-p", "12"], refs)            # centro del cuadrado
casos = []
for r, g in zip(refs, geo):
    la, lo = map(float, g.split())
    casos.append({"mgrs": r, "lat": la, "lon": lo})
guardar("mgrs_inversa", {"fuente": "GeographicLib GeoConvert -g (centro del cuadrado)", "casos": casos})

# ---------------------------------------------------------------- geodésicas
pares = []
for i in range(600):          # dentro de la zona piloto (distancias tácticas)
    a, b = rnd.sample(PILOTO, 2); pares.append((a, b))
for i in range(600):          # por toda España (cruzando husos)
    a, b = rnd.sample(PENINSULA, 2); pares.append((a, b))
pares.append(((40.7354, -4.0058), (40.7354, -4.0058)))  # distancia cero
inv = ejecutar("GeodSolve", ["-i", "-p", "12"], [f"{a[0]:.15f} {a[1]:.15f} {b[0]:.15f} {b[1]:.15f}" for a, b in pares])
casos = []
for (a, b), r in zip(pares, inv):
    azi1, azi2, s12 = map(float, r.split())
    casos.append({"lat1": a[0], "lon1": a[1], "lat2": b[0], "lon2": b[1], "azi1": azi1, "azi2": azi2, "s12": s12})
guardar("geodesica_inversa", {"fuente": "GeographicLib GeodSolve -i", "casos": casos})

dirs = [(p, rnd.uniform(0, 360), rnd.uniform(1, 40000)) for p in PILOTO[:300]]
dirs += [(p, rnd.uniform(0, 360), rnd.uniform(1000, 800000)) for p in PENINSULA[:300]]
out = ejecutar("GeodSolve", ["-p", "12"], [f"{p[0]:.15f} {p[1]:.15f} {az:.15f} {s:.9f}" for p, az, s in dirs])
casos = []
for (p, az, s), r in zip(dirs, out):
    la2, lo2, az2 = map(float, r.split())
    casos.append({"lat1": p[0], "lon1": p[1], "azi1": az, "s12": s, "lat2": la2, "lon2": lo2, "azi2": az2})
guardar("geodesica_directa", {"fuente": "GeographicLib GeodSolve", "casos": casos})

# ---------------------------------------------------------------- áreas
casos = []
for i in range(60):
    c = rnd.choice(PILOTO)
    nv = rnd.randint(3, 9)
    radio = rnd.uniform(0.002, 0.05)
    import math
    angs = sorted(rnd.uniform(0, 2 * math.pi) for _ in range(nv))
    vert = [(c[0] + radio * math.sin(t), c[1] + radio * 1.3 * math.cos(t)) for t in angs]
    r = subprocess.run([str(BIN / "Planimeter"), "-p", "9"], input="\n".join(f"{a:.15f} {b:.15f}" for a, b in vert) + "\n",
                       capture_output=True, text=True, check=True).stdout.split()
    casos.append({"vertices": vert, "perimetro": float(r[1]), "area": abs(float(r[2]))})
guardar("areas", {"fuente": "GeographicLib Planimeter", "casos": casos})
