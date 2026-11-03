"""Gera a arte PROVISÓRIA do protótipo da vila, no padrão dos protótipos antigos:
quadros de 64x64, figuras com contorno escuro (sprites.png) e texturas repetíveis
(walls.png), listados em atlas.json. Reaproveita pedra, tijolo, porta e minério do
zeitgeist1. Uso: python3 gerar_arte.py <pasta art do zeitgeist1> <pasta de saída>"""
import json, random, sys, os
from PIL import Image

S = 64
OUT = (0x15, 0x12, 0x1b, 255)


def hx(c, a=255):
    c = c.lstrip('#'); return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


def dark(c, k=0.75): return (int(c[0] * k), int(c[1] * k), int(c[2] * k), 255)


def light(c, k=0.25): return mix(c, (255, 255, 255), k)


class Pic:
    def __init__(self):
        self.im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); self.px = self.im.load()

    def set(self, x, y, c):
        if 0 <= x < S and 0 <= y < S: self.px[x, y] = hx(c) if isinstance(c, str) else c

    def get(self, x, y): return self.px[x, y] if 0 <= x < S and 0 <= y < S else (0, 0, 0, 0)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.set(x, y, c)

    def ell(self, cx, cy, rx, ry, c, shade=None):
        """elipse cheia; shade=(claro, escuro) pinta luz à esquerda/acima e sombra à direita/abaixo"""
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                if dx * dx + dy * dy <= 1:
                    col = c
                    if shade:
                        if dx * 0.8 + dy * 0.5 > 0.45: col = shade[1]
                        elif dx * 0.8 + dy * 0.5 < -0.6: col = shade[0]
                    self.set(x, y, col)

    def poly(self, pts, c, shade=None):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        cx = (min(xs) + max(xs)) / 2; w = (max(xs) - min(xs)) / 2 or 1
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                if inside(x + 0.5, y + 0.5, pts):
                    col = c
                    if shade:
                        t = (x + 0.5 - cx) / w
                        if t > 0.45: col = shade[1]
                        elif t < -0.6: col = shade[0]
                    self.set(x, y, col)

    def line(self, x0, y0, x1, y1, c):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            self.set(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), c)

    def outline(self):
        src = self.im.copy().load(); pts = []
        for y in range(S):
            for x in range(S):
                if src[x, y][3] == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < S and 0 <= ny < S and src[nx, ny][3] > 0 and src[nx, ny] != OUT:
                            pts.append((x, y)); break
        for p in pts: self.px[p] = OUT
        return self


def inside(x, y, pts):
    r = False; j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]; xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: r = not r
        j = i
    return r


SKIN, SKIN_D = hx('e0b48f'), hx('d29a76')


def face(p, cx, cy, hair=None, bald=False, beard=None, mustache=None, cheeks=False):
    p.ell(cx, cy, 10, 10.5, SKIN, (light(SKIN, .15), SKIN_D))
    if hair:
        h, hd = hx(hair), dark(hx(hair))
        if bald:  # coroa careca, cabelo dos lados
            p.ell(cx - 9, cy, 2.5, 5, h); p.ell(cx + 9, cy, 2.5, 5, hd)
        else:
            for y in range(cy - 11, cy - 3):
                for x in range(cx - 11, cx + 12):
                    dx, dy = (x + .5 - cx) / 10.5, (y + .5 - cy) / 11
                    if dx * dx + dy * dy <= 1 and (y < cy - 6 or abs(x - cx) > 7): p.set(x, y, h if x < cx + 4 else hd)
    # olhos e nariz
    p.rect(cx - 5, cy + 1, cx - 4, cy + 2, OUT); p.rect(cx + 3, cy + 1, cx + 4, cy + 2, OUT)
    p.set(cx - 5, cy + 1, '3a3040')
    p.rect(cx, cy + 3, cx, cy + 5, SKIN_D)
    if cheeks: p.set(cx - 7, cy + 5, 'd98a7a'); p.set(cx + 6, cy + 5, 'd98a7a')
    if beard:
        b = hx(beard); p.ell(cx, cy + 8, 8.5, 5.5, b, (light(b, .15), dark(b, .8)))
        p.rect(cx - 2, cy + 6, cx + 2, cy + 6, dark(b, .6))
    elif mustache:
        m = hx(mustache); p.rect(cx - 5, cy + 6, cx + 4, cy + 7, m); p.set(cx - 6, cy + 8, m); p.set(cx + 5, cy + 8, m)
    else:
        p.rect(cx - 2, cy + 7, cx + 2, cy + 7, dark(SKIN_D, .8))


# ---------------- figuras ----------------
def padre():
    p = Pic(); robe, rl, rd = hx('2e2a33'), hx('433d4a'), hx('1c1a20')
    p.poly([(21, 29), (43, 29), (49, 61), (15, 61)], robe, (rl, rd))
    p.rect(19, 60, 25, 62, '1a1418'); p.rect(39, 60, 45, 62, '1a1418')
    p.rect(30, 34, 33, 58, rd)  # botões/frente
    for y in range(35, 57, 4): p.set(31, y, '6a6470')
    p.poly([(16, 32), (22, 31), (24, 46), (17, 47)], robe, (rl, rd)); p.poly([(42, 31), (48, 32), (47, 47), (40, 46)], robe, (rl, rd))
    # livro
    p.rect(23, 41, 41, 51, hx('6b2a22')); p.rect(23, 41, 41, 42, hx('8a3a2e')); p.rect(40, 42, 41, 51, hx('4a1c18'))
    p.rect(31, 43, 32, 49, hx('d9b24a')); p.rect(29, 45, 34, 46, hx('d9b24a'))
    p.ell(22, 47, 2.5, 2.5, SKIN, (SKIN, SKIN_D)); p.ell(42, 47, 2.5, 2.5, SKIN, (SKIN, SKIN_D))
    p.rect(27, 28, 36, 30, hx('e8e4d8')); p.rect(31, 29, 32, 31, hx('ffffff'))
    face(p, 32, 17, hair='8f8a84', bald=True)
    return p.outline()


def ferreiro():
    p = Pic(); shirt, sl, sd = hx('6d6e78'), hx('85868f'), hx('51525a')
    p.poly([(18, 29), (46, 29), (48, 50), (16, 50)], shirt, (sl, sd))
    p.rect(19, 50, 30, 59, hx('3d2b1e')); p.rect(34, 50, 45, 59, hx('35251a'))
    p.rect(17, 59, 30, 62, hx('241a14')); p.rect(34, 59, 47, 62, hx('241a14'))
    ap, al, ad = hx('7a4f2e'), hx('946240'), hx('5c3a20')
    p.poly([(22, 34), (42, 34), (44, 56), (20, 56)], ap, (al, ad))
    p.line(22, 34, 27, 29, ad); p.line(42, 34, 37, 29, ad)
    p.rect(30, 44, 34, 47, ad)  # bolso
    # braços nus
    p.poly([(11, 31), (18, 30), (19, 44), (12, 45)], SKIN, (light(SKIN, .1), SKIN_D))
    p.poly([(46, 30), (53, 31), (52, 45), (45, 44)], SKIN, (light(SKIN, .1), SKIN_D))
    p.ell(15, 46, 3, 3, SKIN, (SKIN, SKIN_D)); p.ell(49, 46, 3, 3, SKIN, (SKIN, SKIN_D))
    # martelo
    p.rect(48, 26, 50, 50, hx('6f4d31')); p.rect(48, 26, 48, 50, hx('8a5a2b'))
    p.rect(44, 21, 55, 27, hx('4a4a52')); p.rect(44, 21, 55, 22, hx('7a7a86')); p.rect(53, 23, 55, 27, hx('333339'))
    face(p, 32, 17, hair='3a2618', beard='4a3020')
    return p.outline()


def taberneiro():
    p = Pic(); tun, tl, td = hx('4f6b3a'), hx('65844c'), hx('3a5029')
    p.ell(32, 46, 17, 14, tun, (tl, td))
    p.rect(22, 29, 42, 36, tun); p.rect(22, 29, 25, 36, tl); p.rect(39, 29, 42, 36, td)
    apr, apl, apd = hx('e6e0cf'), hx('f4f0e4'), hx('c8c0ac')
    p.poly([(21, 44), (43, 44), (45, 59), (19, 59)], apr, (apl, apd)); p.rect(20, 43, 44, 44, apd)
    p.rect(21, 59, 29, 62, hx('2b2118')); p.rect(35, 59, 43, 62, hx('2b2118'))
    p.ell(14, 41, 4, 7, tun, (tl, td)); p.ell(50, 41, 4, 7, tun, (tl, td))
    p.ell(14, 48, 3, 3, SKIN, (SKIN, SKIN_D))
    # caneca na mão direita
    p.rect(47, 41, 55, 52, hx('8a5a2b')); p.rect(47, 41, 48, 52, hx('a8733e')); p.rect(54, 41, 55, 52, hx('6f4d31'))
    p.rect(47, 44, 55, 44, hx('5a3c25')); p.rect(47, 49, 55, 49, hx('5a3c25'))
    p.rect(56, 43, 58, 49, hx('6f4d31')); p.rect(57, 45, 57, 47, (0, 0, 0, 0))
    p.ell(51, 40, 4.5, 2.5, hx('f4efe0')); p.set(53, 39, 'ffffff')
    p.ell(48, 50, 3, 3, SKIN, (SKIN, SKIN_D))
    face(p, 32, 17, hair='6b4a2b', bald=True, mustache='5a3c25', cheeks=True)
    return p.outline()


def coelho():
    p = Pic(); fur, fl, fd = hx('9b7b58'), hx('b8956c'), hx('7a5c40'); pink = hx('e0a0a0')
    p.ell(32, 51, 15, 11, fur, (fl, fd))           # corpo
    p.ell(32, 54, 8, 7, hx('e6d6b8'))              # barriga
    p.ell(22, 61, 6, 2.5, fur, (fl, fd)); p.ell(42, 61, 6, 2.5, fur, (fl, fd))  # patas
    p.ell(26, 15, 4, 12, fur, (fl, fd)); p.ell(38, 15, 4, 12, fur, (fl, fd))    # orelhas
    p.ell(26, 15, 1.8, 9, pink); p.ell(38, 15, 1.8, 9, pink)
    p.ell(32, 33, 11, 9.5, fur, (fl, fd))          # cabeça
    p.ell(32, 37, 5, 3.5, hx('e6d6b8'))
    p.rect(26, 31, 28, 33, OUT); p.set(26, 31, 'ffffff'); p.rect(36, 31, 38, 33, OUT); p.set(36, 31, 'ffffff')
    p.rect(31, 35, 33, 36, hx('d98a8a'))
    p.line(19, 37, 25, 37, hx('d8d0c0')); p.line(39, 37, 45, 37, hx('d8d0c0'))
    p.ell(45, 57, 3.5, 3, hx('f0ece4'))            # rabo aparecendo
    return p.outline()


def arvore():
    p = Pic(); random.seed(7)
    p.poly([(28, 40), (36, 40), (38, 62), (26, 62)], hx('6f4d31'), (hx('8a5a2b'), hx('573b25')))
    p.line(32, 46, 32, 61, hx('573b25')); p.line(29, 50, 29, 58, hx('573b25'))
    p.poly([(36, 44), (46, 36), (47, 38), (37, 47)], hx('6f4d31'))
    g1, g2, g3, g4 = hx('2f5222'), hx('3f6b2e'), hx('4f8236'), hx('6a9a44')
    blobs = [(32, 22, 16, 14), (18, 30, 11, 9), (46, 30, 11, 9), (24, 12, 10, 8), (41, 13, 10, 8), (32, 34, 14, 7)]
    for (cx, cy, rx, ry) in blobs: p.ell(cx, cy, rx, ry, g2, (g3, g1))
    for _ in range(70):
        x, y = random.randint(6, 58), random.randint(3, 42)
        if p.get(x, y)[3] and p.get(x, y) != OUT:
            p.set(x, y, g4 if (x + y) % 3 == 0 and x < 36 else g1)
    return p.outline()


def toco():
    p = Pic()
    p.poly([(25, 52), (39, 52), (41, 62), (23, 62)], hx('6f4d31'), (hx('8a5a2b'), hx('573b25')))
    p.ell(32, 52, 7.5, 2.5, hx('c58847')); p.ell(32, 52, 4, 1.2, hx('a8733e')); p.set(32, 52, hx('8a5a2b'))
    p.ell(20, 61, 3, 1.5, hx('c58847')); p.ell(46, 60, 2.5, 1.2, hx('a8733e'))
    return p.outline()


def veio_vazio():
    p = Pic(); r, rl, rd = hx('6e6e7a'), hx('8a8a96'), hx('50505c')
    for (cx, cy, rx, ry) in [(26, 58, 7, 4), (38, 57, 6, 5), (32, 61, 9, 2.5), (45, 61, 3, 2)]:
        p.ell(cx, cy, rx, ry, r, (rl, rd))
    p.set(37, 55, hx('c0703a')); p.set(24, 57, hx('c0703a'))
    return p.outline()


# ---------------- texturas (repetíveis) ----------------
def tex(fn):
    im = Image.new('RGBA', (S, S)); px = im.load(); fn(px); return im


def noise(px, base, amt, seed, k=1):
    random.seed(seed)
    for y in range(S):
        for x in range(S):
            v = random.uniform(-amt, amt); px[x, y] = tuple(max(0, min(255, int(base[i] * k + v))) for i in range(3)) + (255,)


def t_cal(px):
    noise(px, hx('d8d0bd'), 8, 1)
    random.seed(2)
    for _ in range(9):  # manchas e pedras sob o reboco
        cx, cy, r = random.randint(0, 63), random.randint(0, 63), random.randint(3, 7)
        for y in range(cy - r, cy + r):
            for x in range(cx - r, cx + r):
                if (x - cx) ** 2 + (y - cy) ** 2 < r * r:
                    c = px[x % S, y % S]; px[x % S, y % S] = (c[0] - 10, c[1] - 10, c[2] - 12, 255)
    for _ in range(3):
        x, y = random.randint(0, 63), random.randint(0, 63)
        for i in range(random.randint(4, 9)):
            px[x % S, y % S] = hx('9e9584'); x += random.choice((0, 1)); y += 1


def roof(base, seed):
    def f(px):
        noise(px, base, 6, seed); b = base
        for row in range(8):
            y0 = row * 8; off = 8 if row % 2 else 0
            for x in range(S):
                px[x, y0] = dark(b, .55); px[x, (y0 + 1) % S] = light(b, .12)
                px[x, (y0 + 7) % S] = dark(b, .78)
                if (x + off) % 16 == 0:
                    for y in range(y0, y0 + 8): px[x, y] = dark(b, .55)
    return f


def t_palha(px):
    noise(px, hx('9c7a3e'), 10, 4); random.seed(5)
    for _ in range(260):
        x, y = random.randint(0, 63), random.randint(0, 63); c = random.choice([hx('b8944c'), hx('7d5f2c'), hx('c9a75a')])
        for i in range(random.randint(3, 8)): px[(x + i // 4) % S, (y + i) % S] = c
    for row in range(4):
        for x in range(S): px[x, row * 16 + 15] = hx('5e4520')


def t_tabuas(px):
    noise(px, hx('7a5232'), 7, 6); random.seed(7); w = 16
    for p in range(4):
        tint = random.uniform(0.88, 1.1)
        for y in range(S):
            for x in range(p * w, p * w + w):
                c = px[x, y]; px[x, y] = (min(255, int(c[0] * tint)), min(255, int(c[1] * tint)), min(255, int(c[2] * tint)), 255)
        for y in range(S): px[p * w, y] = hx('3a2618'); px[p * w + 1, y] = hx('8f6440')
        for _ in range(5):
            gx, gy = random.randint(p * w + 3, p * w + w - 2), random.randint(0, 63)
            for i in range(random.randint(6, 18)): px[gx, (gy + i) % S] = hx('5e3d22')
        kx, ky = random.randint(p * w + 4, p * w + w - 4), random.randint(4, 59)
        px[kx, ky] = hx('3a2618'); px[kx + 1, ky] = hx('4a3020')


def t_enxaimel(px):
    noise(px, hx('e2d6b6'), 7, 8); beam = hx('4a3220'); bl = hx('5e4129')
    for y in range(S):
        for x in range(5): px[x, y] = bl if x == 1 else beam
    for x in range(S):
        for y in range(5): px[x, y] = bl if y == 1 else beam
    for i in range(5, 64):  # escora diagonal
        for t in range(-2, 3):
            x, y = i, 68 - i + t
            if 5 <= y < 64: px[x, y] = bl if t == -2 else beam


def t_janela(px):
    for y in range(S):
        for x in range(S): px[x, y] = hx('4a3220')
    for y in range(5, 59):
        for x in range(5, 59): px[x, y] = hx('22262e') if (x // 4 + y // 4) % 5 else hx('2e3440')
    for x in range(5, 59): px[x, 31] = px[x, 32] = hx('4a3220')
    for y in range(5, 59): px[31, y] = px[32, y] = hx('4a3220')
    for i in range(8, 20): px[i, 8 + (i - 8) // 2] = hx('6a7484')
    for x in range(64): px[x, 0] = px[x, 63] = hx('2a1f17')
    for y in range(64): px[0, y] = px[63, y] = hx('2a1f17')


def t_grama(px):
    noise(px, hx('5f7d3c'), 10, 9); random.seed(10)
    for _ in range(180):
        x, y = random.randint(0, 63), random.randint(0, 63); c = random.choice([hx('4a6a2c'), hx('76964a'), hx('3f5a26')])
        px[x, y] = c; px[x, (y + 1) % S] = c


def t_terra(px):
    noise(px, hx('7d6a4b'), 12, 11); random.seed(12)
    for _ in range(30):
        x, y = random.randint(0, 63), random.randint(0, 63)
        px[x, y] = hx('9a8a6a'); px[(x + 1) % S, y] = hx('8a7a5a'); px[x, (y + 1) % S] = hx('5a4a32')


def t_pavimento(px):
    random.seed(13); seeds = [(random.uniform(0, 64), random.uniform(0, 64)) for _ in range(16)]
    tints = [random.uniform(0.85, 1.12) for _ in seeds]; base = hx('9a958b')
    for y in range(S):
        for x in range(S):
            ds = []
            for i, (sx, sy) in enumerate(seeds):
                dx = min(abs(x - sx), 64 - abs(x - sx)); dy = min(abs(y - sy), 64 - abs(y - sy))
                ds.append((dx * dx + dy * dy, i))
            ds.sort(); d0, i0 = ds[0]; d1 = ds[1][0]
            if d1 ** .5 - d0 ** .5 < 1.6: px[x, y] = hx('5a5650')
            else:
                k = tints[i0] * (1.05 if d0 < 30 else 1)
                px[x, y] = (min(255, int(base[0] * k)), min(255, int(base[1] * k)), min(255, int(base[2] * k)), 255)


def t_placa(px):
    t_tabuas(px)
    for y in range(18, 46):  # caneca pintada
        for x in range(22, 40): px[x, y] = hx('d9b24a') if not (24 < x < 37 and 21 < y < 44) else hx('3a2618')
    for y in range(24, 38):
        for x in range(40, 46):
            if x > 42 or y in (24, 25, 36, 37): px[x, y] = hx('d9b24a')


if __name__ == '__main__':
    old, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    oatlas = json.load(open(os.path.join(old, 'atlas.json')))
    ow, osp = Image.open(os.path.join(old, 'walls.png')).convert('RGBA'), Image.open(os.path.join(old, 'sprites.png')).convert('RGBA')
    def old_wall(n): i = oatlas['walls'].index(n); return ow.crop((i * S, 0, i * S + S, S))
    def old_sprite(n): i = oatlas['sprites'].index(n); return osp.crop((i * S, 0, i * S + S, S))

    walls = [('pedra', old_wall('pedra')), ('tijolo', old_wall('tijolo')), ('porta', old_wall('porta')),
             ('cal', tex(t_cal)), ('telha', tex(roof(hx('9c4b32'), 3))), ('telha_escura', tex(roof(hx('5b4038'), 14))),
             ('palha', tex(t_palha)), ('tabuas', tex(t_tabuas)), ('enxaimel', tex(t_enxaimel)), ('janela', tex(t_janela)),
             ('grama', tex(t_grama)), ('terra', tex(t_terra)), ('pavimento', tex(t_pavimento)), ('placa', tex(t_placa))]
    sprites = [('coelho', coelho().im), ('padre', padre().im), ('ferreiro', ferreiro().im), ('taberneiro', taberneiro().im),
               ('arvore', arvore().im), ('toco', toco().im), ('veio', old_sprite('minerio')), ('veio_vazio', veio_vazio().im), ('anselmo', old_sprite('anselmo'))]

    def sheet(items):
        im = Image.new('RGBA', (S * len(items), S), (0, 0, 0, 0))
        for i, (_, t) in enumerate(items): im.paste(t, (i * S, 0))
        return im
    sheet(walls).save(os.path.join(out, 'walls.png')); sheet(sprites).save(os.path.join(out, 'sprites.png'))
    json.dump({'size': S, 'walls': [n for n, _ in walls], 'sprites': [n for n, _ in sprites],
               '_nota': 'Arte provisória gerada por tools/gerar_arte.py. Pedra, tijolo, porta, veio e anselmo vêm do zeitgeist1.'},
              open(os.path.join(out, 'atlas.json'), 'w'), ensure_ascii=False)
    print('ok', len(walls), len(sprites))
