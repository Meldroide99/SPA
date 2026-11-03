"""Vectoriza los iconos de las tablas de la APP-6(E) Ed. E v2.

Para cada fila (de filas.py) recorta la celda del icono de la página renderizada,
localiza el octógono guía azul, lo lleva a la caja 50–150 del sistema de
coordenadas de SPA (octógono de lado L = 100 centrado en 100,100) y traza los
contornos negros como un único trayecto SVG (regla par-impar).

Uso: python3 vectorizar.py APP-06.pdf filas.json salida.json [dpi]
"""
import sys, json, os, subprocess, tempfile
import numpy as np, cv2, math
from skimage.morphology import skeletonize
from PIL import Image

pdf, filas_json, salida = sys.argv[1], sys.argv[2], sys.argv[3]
DPI = int(sys.argv[4]) if len(sys.argv) > 4 else 400
K = DPI / 72
EPS = float(os.environ.get('EPS', '2.2'))
filas = json.load(open(filas_json))
tmp = tempfile.mkdtemp()
paginas = {}

def pagina(n):
    if n not in paginas:
        base = os.path.join(tmp, f'p{n}')
        subprocess.run(['pdftoppm', '-f', str(n), '-l', str(n), '-r', str(DPI), '-png', '-singlefile', pdf, base], check=True)
        paginas.clear()
        paginas[n] = np.array(Image.open(base + '.png').convert('RGB')).astype(np.int16)
        os.remove(base + '.png')
    return paginas[n]

def celda(f, img=None):
    vs = f['vs']
    if f['imagenes']:
        ic = f['imagenes'][0][4]
    else:
        # sin imagen: la columna con más azul (octógono guía dibujado en vector)
        mejor, ic = -1, 1
        for j in range(1, len(vs) - 1):
            x0, x1 = vs[j], vs[j + 1]; y0, y1 = f['fila']
            c = img[int(y0 * K):int(y1 * K), int(x0 * K):int(x1 * K)]
            if c.size == 0: continue
            n = int(((c[..., 2] - c[..., 0] > 50) & (c[..., 2] - c[..., 1] > 50)).sum())
            if n > mejor: mejor, ic = n, j
    x0, x1 = vs[ic], vs[ic + 1] if ic + 1 < len(vs) else vs[-1]
    y0, y1 = f['fila']
    return x0 + 4, y0 + 4, x1 - 4, y1 - 4

def trazar(mask, escala, ox, oy):
    """Contornos de la máscara → trayecto SVG en unidades del símbolo."""
    m = (mask * 255).astype(np.uint8)
    cs, jer = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    partes = []
    for c in cs:
        if cv2.contourArea(c) < 6 and len(c) < 8:
            continue
        a = cv2.approxPolyDP(c, EPS, True)[:, 0, :].astype(float)
        if len(a) < 3:
            continue
        pts = [(round((x + 0.5) * escala + ox, 1), round((y + 0.5) * escala + oy, 1)) for x, y in a]
        def n(v):
            t = f'{v:.1f}'.rstrip('0').rstrip('.')
            return t.replace('0.', '.', 1) if t.startswith('0.') else t.replace('-0.', '-.', 1)
        d = f'M{n(pts[0][0])} {n(pts[0][1])}l'
        prev = pts[0]; trozos = []
        for q in pts[1:]:
            dx, dy = round(q[0] - prev[0], 1), round(q[1] - prev[1], 1)
            trozos.append(f'{n(dx)}{"" if dy < 0 else " "}{n(dy)}'); prev = q
        d += ' '.join(trozos).replace(' -', '-') + 'z'
        partes.append(d)
    return ''.join(partes)

def separar_lineas(m2, ancho_oct, esc, ox, oy):
    """Separa los trazos rectos largos (los que llegan al marco) del resto del icono."""
    m8 = m2.astype(np.uint8)
    sk = skeletonize(m2).astype(np.uint8) * 255
    dist = cv2.distanceTransform(m8, cv2.DIST_L2, 5)
    hs = cv2.HoughLinesP(sk, 1, np.pi / 720, threshold=int(ancho_oct * 0.12), minLineLength=int(ancho_oct * 0.32), maxLineGap=int(ancho_oct * 0.03))
    if hs is None:
        return m2, []
    segs = []
    for x1, y1, x2, y2 in hs.reshape(-1, 4):
        ang = math.atan2(y2 - y1, x2 - x1) % math.pi
        segs.append([float(x1), float(y1), float(x2), float(y2), ang])
    # agrupar segmentos colineales
    grupos = []
    for sgm in segs:
        x1, y1, x2, y2, ang = sgm
        ok = False
        for g in grupos:
            da = abs(((ang - g['ang']) + math.pi / 2) % math.pi - math.pi / 2)
            nx, ny = -math.sin(g['ang']), math.cos(g['ang'])
            rho1, rho2 = x1 * nx + y1 * ny, x2 * nx + y2 * ny
            if da < math.radians(4) and abs(rho1 - g['rho']) < ancho_oct * 0.025 and abs(rho2 - g['rho']) < ancho_oct * 0.025:
                g['pts'] += [(x1, y1), (x2, y2)]; ok = True; break
        if not ok:
            nx, ny = -math.sin(ang), math.cos(ang)
            grupos.append({'ang': ang, 'rho': x1 * nx + y1 * ny, 'pts': [(x1, y1), (x2, y2)]})
    lineas = []
    banda = np.zeros_like(m8)
    H, W = m8.shape
    def en_trazo(x, y):
        xi, yi = int(round(x)), int(round(y))
        return 0 <= xi < W and 0 <= yi < H and m8[yi, xi]
    u = lambda x, y: (x * esc + ox, y * esc + oy)
    vistos = []
    for g in grupos:
        ux, uy = math.cos(g['ang']), math.sin(g['ang'])
        t = [px * ux + py * uy for px, py in g['pts']]
        i0, i1 = int(np.argmin(t)), int(np.argmax(t))
        (ax, ay), (bx, by) = g['pts'][i0], g['pts'][i1]
        # ¿llega al marco amigo (rectángulo 25–175 × 50–150)?
        toca = lambda p: p[0] < 34 or p[0] > 166 or p[1] < 59 or p[1] > 141
        if not (toca(u(ax, ay)) or toca(u(bx, by))):
            continue
        # prolongar por el propio trazo mientras siga habiendo tinta (cruces incluidos)
        def prolongar(x, y, sx, sy):
            hueco = 0
            while hueco < 8:
                x, y = x + sx, y + sy
                if en_trazo(x, y): hueco = 0
                else: hueco += 1
            return x - sx * hueco, y - sy * hueco
        ax, ay = prolongar(ax, ay, -ux, -uy)
        bx, by = prolongar(bx, by, ux, uy)
        n = 40
        muestras = [dist[min(H - 1, int(round(ay + (by - ay) * k / n))), min(W - 1, int(round(ax + (bx - ax) * k / n)))] for k in range(4, n - 3)]
        muestras = [m for m in muestras if m > 0]
        w = 2 * float(np.median(muestras)) if muestras else 0
        if w < 2: continue
        p, q = u(ax, ay), u(bx, by)
        # evitar duplicados (mismo trazo encontrado dos veces)
        if any(abs(p[0] - v[0]) + abs(p[1] - v[1]) + abs(q[0] - v[2]) + abs(q[1] - v[3]) < 12 or abs(p[0] - v[2]) + abs(p[1] - v[3]) + abs(q[0] - v[0]) + abs(q[1] - v[1]) < 12 for v in vistos):
            continue
        vistos.append([p[0], p[1], q[0], q[1]])
        cv2.line(banda, (int(ax), int(ay)), (int(bx), int(by)), 1, int(w + 6))
        lineas.append([round(p[0], 1), round(p[1], 1), round(q[0], 1), round(q[1], 1), round(w * esc, 1)])
    if not lineas:
        return m2, []
    dentro = (m8 & (1 - banda)).astype(np.uint8)
    k = int(max(l[4] for l in lineas) / esc) + 8
    cerrado = cv2.morphologyEx(dentro, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    final = (dentro | (cerrado & banda & m8)).astype(np.uint8)
    final = cv2.morphologyEx(final, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    return final.astype(bool), lineas

res = []
for f in filas:
    if 'no associated symbol' in ' '.join(f.get('columnas', {}).values()):
        continue
    img = pagina(f['pagina'])
    x0, y0, x1, y1 = celda(f, img)
    c = img[int(y0 * K):int(y1 * K), int(x0 * K):int(x1 * K)]
    if c.size == 0:
        continue
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    azul = (B - R > 50) & (B - G > 50)
    ys, xs = np.nonzero(azul)
    if len(xs) < 50:
        res.append({**{k: f[k] for k in ('pagina', 'conjunto', 'codigo', 'nombre', 'tipo', 'entidad', 'icono_tipo')}, 'error': 'sin octógono'})
        continue
    ax0, ax1, ay0, ay1 = xs.min(), xs.max(), ys.min(), ys.max()
    lado = ((ax1 - ax0) + (ay1 - ay0)) / 2
    escala = 100 / lado
    lum = (R * 0.3 + G * 0.59 + B * 0.11)
    # gris de referencia (caja «no se dibuja»): neutro y claro
    gris = (np.abs(R - G) < 14) & (np.abs(G - B) < 14) & (lum > 150)
    oscuro = (lum < 115) & ~azul
    # colores del propio icono (rojo, amarillo, verde...): saturados y no azules de guía
    sat = (np.max(c, axis=2) - np.min(c, axis=2)) > 70
    color = sat & ~azul & ~gris & (lum < 235)
    mask = oscuro.astype(np.uint8)
    # suavizado: subir ×2, desenfocar y umbral
    m2 = cv2.resize(mask.astype(np.float32), None, fx=2, fy=2, interpolation=cv2.INTER_LINEAR)
    m2 = cv2.GaussianBlur(m2, (3, 3), 0) > 0.5
    m2 = cv2.morphologyEx(m2.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)
    ox = 50 - ax0 * escala
    oy = 50 - ay0 * escala
    extra = {}
    if (f.get('icono_tipo') or '').strip() == 'Full Frame':
        m2, lineas = separar_lineas(m2, lado * 2, escala / 2, ox, oy)
        if lineas: extra['lineas'] = lineas
    d = trazar(m2, escala / 2, ox, oy)
    if color.sum() > 80:
        # trazar cada color dominante aparte
        cols = c[color]
        q = (cols // 40) * 40
        uniq, cnt = np.unique(q.reshape(-1, 3), axis=0, return_counts=True)
        capas = []
        for u, n in sorted(zip(map(tuple, uniq), cnt), key=lambda t: -t[1])[:3]:
            if n < 80: continue
            sel = color & (np.all((c // 40) * 40 == np.array(u), axis=2))
            mm = cv2.resize(sel.astype(np.float32), None, fx=2, fy=2, interpolation=cv2.INTER_LINEAR)
            mm = cv2.GaussianBlur(mm, (3, 3), 0) > 0.5
            dd = trazar(mm, escala / 2, ox, oy)
            med = np.median(c[sel], axis=0).astype(int)
            if dd: capas.append({'d': dd, 'color': 'rgb(%d,%d,%d)' % tuple(med)})
        if capas: extra['colores'] = capas
    res.append({**{k: f[k] for k in ('pagina', 'conjunto', 'codigo', 'nombre', 'tipo', 'entidad', 'icono_tipo')},
                'd': d, **extra, 'caja': [round(float(x), 1) for x in ((0 - 0) * escala + ox, oy, c.shape[1] * escala + ox, c.shape[0] * escala + oy)]})
    print(f"{f['pagina']} {f['conjunto']} {f['codigo']} {len(d)}", file=sys.stderr)

json.dump(res, open(salida, 'w'), ensure_ascii=False)
