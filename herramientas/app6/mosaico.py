"""Mosaico de celdas de plantilla de la APP-6(E) para revisión visual.
Uso: python3 mosaico.py APP-06.pdf filas.json prefijo columna [desde] [hasta]"""
import sys, json, os, subprocess, tempfile
from PIL import Image, ImageDraw
pdf, fj, pref, colu = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
a = int(sys.argv[5]) if len(sys.argv) > 5 else 0
b = int(sys.argv[6]) if len(sys.argv) > 6 else 10**9
filas = [f for f in json.load(open(fj))[a:b] if 'no associated symbol' not in ' '.join(f.get('columnas', {}).values())]
DPI = int(__import__("os").environ.get("MDPI", 90)); K = DPI / 72; tmp = tempfile.mkdtemp(); cache = {}
def pag(n):
    if n not in cache:
        base = os.path.join(tmp, f'p{n}')
        subprocess.run(['pdftoppm', '-f', str(n), '-l', str(n), '-r', str(DPI), '-png', '-singlefile', pdf, base], check=True)
        cache[n] = Image.open(base + '.png').convert('RGB')
    return cache[n]
W, H, N = int(__import__("os").environ.get("MW", 230)), int(__import__("os").environ.get("MH", 160)), int(__import__("os").environ.get("MN", 6))
celdas = []
for f in filas:
    vs = f['vs']; c = min(colu, len(vs) - 2)
    x0, x1 = vs[c], vs[c + 1]; y0, y1 = f['fila']
    im = pag(f['pagina']).crop((int(x0 * K), int(y0 * K), int(x1 * K), int(y1 * K)))
    im.thumbnail((W, H - 14))
    t = Image.new('RGB', (W, H), 'white'); t.paste(im, (0, 14))
    d = ImageDraw.Draw(t); d.text((2, 1), f"{f['codigo']} {f['nombre'][:30]}", fill=(200, 0, 0))
    d.rectangle((0, 0, W - 1, H - 1), outline=(180, 180, 180))
    celdas.append(t)
for i in range(0, len(celdas), N * 5):
    grupo = celdas[i:i + N * 5]
    o = Image.new('RGB', (W * N, H * ((len(grupo) + N - 1) // N)), 'white')
    for j, t in enumerate(grupo): o.paste(t, ((j % N) * W, (j // N) * H))
    o.save(f'{pref}{i // (N * 5):02d}.png')
print(len(celdas))
