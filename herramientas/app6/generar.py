"""Genera src/simbolos/datos/iconos.js con los iconos vectorizados de la
APP-6(E) Ed. E v2 y sus nombres en castellano.

Uso: python3 generar.py salida.js v1.json c3.json v3.json [c4.json v4.json …]"""
import sys, json, re
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from es_unidades import ES

salida, v1 = sys.argv[1:3]
pares = list(zip(sys.argv[3::2], sys.argv[4::2]))
filas = {}
for c, _ in pares:
    for f in json.load(open(c)): filas[(f['pagina'], f['conjunto'] or '', f['codigo'])] = f
iconos, mods = {}, {}
faltan = []

def limpio(n):
    n = re.sub(r'\s+', ' ', n).strip()
    n = re.sub(r'(\w)- (\w)', r'\1-\2', n)
    return n

vectores = [x for _, v in pares for x in json.load(open(v))]
for x in vectores:
    if not x.get('d') and not x.get('lineas'):
        continue
    f = filas.get((x['pagina'], x['conjunto'] or '', x['codigo']))
    if f and not x['conjunto']: x['conjunto'] = f['conjunto']
    sector = f.get('sector', 'e') if f else 'e'
    clave = f"{x['conjunto']}{sector}:{x['codigo']}"
    es = ES.get(clave)
    if not es:
        faltan.append(clave + ' ' + x['nombre'])
        es = limpio(x['nombre']).capitalize()
    en = limpio(x['nombre'])
    if sector == 'e':
        tipo = {'Full Frame': 'f', 'Full Octagon': 'o'}.get((x.get('icono_tipo') or '').strip(), '')
        iconos.setdefault(x['conjunto'], {})[x['codigo']] = [es, en, tipo, x.get('d', '')] + ([x['lineas']] if x.get('lineas') else [])
    else:
        mods.setdefault(x['conjunto'], {}).setdefault(sector, {})[x['codigo']] = [es, en, x['d']]

for x in json.load(open(v1)):
    if not x.get('d'):
        continue
    sector = '1' if x['pagina'] <= 58 else '2'
    clave = f"c{sector}:{x['codigo']}"
    es = ES.get(clave)
    if not es:
        faltan.append(clave + ' ' + x['nombre'])
        es = limpio(x['nombre']).capitalize()
    mods.setdefault('c', {}).setdefault(sector, {})[x['codigo']] = [es, limpio(x['nombre']), x['d']]

js = ['// GENERADO por herramientas/app6/generar.py a partir del PDF oficial de la',
      '// APP-6(E) Ed. E v2 (oct. 2025): iconos vectorizados de sus tablas 1-3, 1-4,',
      '// 3-2 a 3-4, 3-7 a 3-9, 3-11 a 3-13, 3-16 a 3-18 y de los capítulos 4 y 7.',
      '// No editar a mano.',
      '// Coordenadas: octógono de referencia de lado L = 100 en la caja 50–150.',
      '// ICONOS[conjunto][código] = [nombre, nombre OTAN, tipo (f: marco completo,',
      '// o: octógono completo), trayecto SVG (regla par-impar), [trazos rectos que',
      '// llegan al marco: x1, y1, x2, y2, grosor] (solo marco completo)]',
      '// MODIFICADORES[conjunto | "c" común][sector][código] = [nombre, OTAN, trayecto]',
      'export const ICONOS = ' + json.dumps(iconos, ensure_ascii=False, separators=(',', ':')) + ';',
      'export const MODIFICADORES = ' + json.dumps(mods, ensure_ascii=False, separators=(',', ':')) + ';', '']
open(salida, 'w').write('\n'.join(js))
print('iconos', {k: len(v) for k, v in iconos.items()}, 'mods', {k: {s: len(t) for s, t in v.items()} for k, v in mods.items()})
print('sin traducción:', len(faltan), faltan[:40])
