"""Lee las tablas de símbolos de la APP-6(E) Ed. E v2 (PDF oficial) y saca, por
fila: nombre, tipo, entidad, conjunto, código, tipo de icono, observaciones y
el recuadro de la imagen del icono.  Uso: python3 filas.py APP-06.pdf p0 p1 > filas.json"""
import sys, json, re, pdfplumber

def columnas_de(ws, col):
    cs = {}
    for w in ws: cs.setdefault(str(col(w['x0'])), []).append(w)
    res = {}
    for k, v in cs.items():
        ls = {}
        for w in v: ls.setdefault(round(w['top']), []).append(w)
        res[k] = '\n'.join(' '.join(x['text'] for x in sorted(ls[y], key=lambda w: w['x0'])) for y in sorted(ls))
    return res

def filas_pagina(pg, n, out_prev=None):
    W = pg.width
    # separadores horizontales de la tabla (rectángulos finos y anchos)
    hs = sorted({round(r['top'], 1) for r in pg.rects if r['height'] < 1.6 and r['width'] > 60})
    # columnas: bordes verticales finos y altos
    vs = sorted({round(r['x0'], 0) for r in pg.rects if r['width'] < 1.6 and r['height'] > 20})
    if len(hs) < 2 or len(vs) < 3:
        return []
    palabras = pg.extract_words(keep_blank_chars=False, use_text_flow=False, extra_attrs=['size'])
    imgs = pg.images
    out = []
    # unir separadores muy próximos
    hh = []
    for h in hs:
        if not hh or h - hh[-1] > 3: hh.append(h)
    def col(x):
        k = 0
        for j, v in enumerate(vs):
            if x > v: k = j
        return k
    c1 = vs[1] if len(vs) > 1 else 220
    c2 = vs[2] if len(vs) > 2 else 370
    for a, b in zip(hh, hh[1:]):
        if b - a < 25: continue
        ws = [w for w in palabras if a <= w['top'] < b]
        desc = [w for w in ws if w['x0'] < c1 - 2]
        rem = [w for w in ws if w['x0'] > c2 + 2]
        def lineas(ws):
            ls = {}
            for w in ws: ls.setdefault(round(w['top']), []).append(w)
            res = []
            for y in sorted(ls):
                res.append(' '.join(x['text'] for x in sorted(ls[y], key=lambda w: w['x0'])))
            # fusionar líneas a < 2 px (mismo renglón)
            return res
        dl = lineas(desc)
        txt = '\n'.join(dl)
        cods = re.findall(r'Code:\s*([0-9A-Z][0-9A-Z ]{1,11})', txt)
        comun = re.match(r'^(\d{3})$', txt.strip())
        if comun:
            cods = [comun.group(1)]
            dl = [l for l in columnas_de([w for w in ws if c1 - 2 <= w['x0'] < (vs[2] if len(vs) > 2 else 999)], col).get('1', '').split('\n') if l]
            txt = '\n'.join(dl)
        if not cods:
            # continuación de la fila de la página anterior
            if out_prev is not None and not out:
                for k, v in columnas_de(ws, col).items():
                    out_prev['columnas'][k] = out_prev['columnas'].get(k, '') + '\n' + v
            continue
        m = re.match(r'(.*)', cods[-1].replace(' ', ''))
        conjunto_txt = cods[-2].replace(' ', '') if len(cods) > 1 else ''
        im = [i for i in imgs if a - 2 <= (i['top'] + i['bottom']) / 2 <= b + 2 and (i['x0'] + i['x1']) / 2 > c1 - 5]
        columnas = {}
        for w in ws: columnas.setdefault(col(w['x0']), []).append(w)
        nombre = []
        for l in dl:
            if re.match(r'(Type|Entity|Symbol Set|Code|Icon Type|Modifier|Sector|Status)\b', l): break
            nombre.append(l)
        campo = lambda k: (re.search(rf'^{k}:\s*(.*)$', txt, re.M) or [None, None])[1]
        out.append({
            'pagina': n, 'nombre': ' '.join(nombre).strip(), 'texto': txt,
            'codigo': m.group(1), 'conjunto': (campo('Symbol Set Code') or conjunto_txt).strip(),
            'tipo': campo('Type'), 'entidad': campo('Entity'), 'icono_tipo': campo('Icon Type'),
            'obs': ' '.join(lineas(rem)), 'fila': [round(a, 1), round(b, 1)], 'cols': [c1, c2],
            'imagenes': [[round(i['x0'], 2), round(i['top'], 2), round(i['x1'], 2), round(i['bottom'], 2), col((i['x0'] + i['x1']) / 2)] for i in im],
            'columnas': {str(k): '\n'.join(lineas(v)) for k, v in sorted(columnas.items())}, 'vs': vs,
        })
    return out

pdf = pdfplumber.open(sys.argv[1])
p0, p1 = int(sys.argv[2]), int(sys.argv[3])
res = []
for n in range(p0, p1 + 1):
    res += filas_pagina(pdf.pages[n - 1], n, res[-1] if res else None)
json.dump(res, sys.stdout, ensure_ascii=False, indent=0)
