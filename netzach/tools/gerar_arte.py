"""Gera a arte PROVISÓRIA do protótipo da vila (Netzach).

- walls.png: texturas repetíveis de 64x64 (pedra, tijolo e porta vêm do zeitgeist1).
- sprites.png: figuras (billboards) em pixel art, cada uma com o seu próprio quadro
  (pessoas 96x192, adolescentes 96x176, crianças 96x128, vaca 240x152, coelho 96x64, árvore/toco 192x256, veio/veio vazio 128x128,
  quadro de missões 180x216 e baú 116x104, os dois a 100 px por metro, como as pessoas),
  listadas em atlas.json como {"name","x","y","w","h"}.

As figuras são desenhadas por formas (elipses, polígonos, cápsulas) com uma normal
falsa calculada a partir da distância à borda; a luz vem do alto à esquerda e a cor
final é quantizada numa rampa curta por material (3 a 6 tons), sem contorno: a borda é
a própria cor do material, levemente escurecida embaixo/à direita. Requer Pillow, numpy e scipy.
Uso: python3 tools/gerar_arte.py <pasta art do zeitgeist1> <pasta de saída>"""
import json, math, random, sys, os
import numpy as np
from scipy import ndimage
from PIL import Image

S = 64


def hx(c, a=255):
    c = c.lstrip('#'); return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


def dark(c, k=0.75): return (int(c[0] * k), int(c[1] * k), int(c[2] * k), 255)


def light(c, k=0.25): return mix(c, (255, 255, 255), k)


# ---------------- paleta (rampas do escuro para o claro) ----------------
def ramp(*cs): return [hx(c) for c in cs]


MAT = {
    'pele': ramp('4a2e24', '6e4535', '93604a', 'b07a60', 'c79478', 'd8ab8e'),
    'pele_r': ramp('4e2c24', '764336', '9c5e4a', 'b8765e', 'cc9076', 'dca78c'),   # corada (taberneiro)
    'pele_j': ramp('4c3226', '724c3a', '97674e', 'b48264', 'c99c7c', 'd9b294'),   # jovem
    'olho': ramp('120e0e', '2a211d', '5a4a40', '9a8e80'),
    'cinza': ramp('34312e', '55514b', '78736b', '9b958b', 'bbb5aa'),               # cabelo grisalho
    'castanho': ramp('1c130d', '2e2016', '453120', '5e442c', '765838'),
    'barba': ramp('17100c', '261a12', '38281b', '4c3725', '614830'),
    'bigode': ramp('241912', '3d2c1f', '5a4330', '76604a', '8f7a62'),
    'habito': ramp('120f12', '1b171b', '262026', '332b31', '41383e', '51464b'),
    'capuz': ramp('161216', '211b20', '2e262b', '3d3339', '4e4248'),
    'corda': ramp('3a2e1c', '5a4a30', '7c6844', '9c875c', 'b6a274'),
    'couro_v': ramp('230f0c', '3a1914', '54251c', '6e3426', '874530'),          # capa do livro
    'papel': ramp('6e6250', '9c8e74', 'c2b394', 'd9cbac'),
    'madeira': ramp('22160e', '3b2818', '553a23', '6f4c2f', '8a613c', 'a3784d'),
    'linho': ramp('3c372e', '5b5446', '7a7160', '988d78', 'b0a58e', 'c4baa2'),
    'linho_c': ramp('4a4234', '6c6250', '8e826a', 'ad9f84', 'c6b99c', 'd6cbb0'),  # avental claro
    'avental': ramp('1e130c', '301e12', '45301c', '5c4127', '765535', '8c6a46'),  # couro grosso
    'calca': ramp('15110e', '221c17', '322920', '43382c', '554838'),
    'bota': ramp('120d0a', '1f1711', '2e2219', '3f3023', '52402f'),
    'ferro': ramp('17181b', '2a2c30', '414449', '5d6167', '7e8389', 'a2a7ab'),
    'ocre': ramp('2c1e12', '46301c', '634528', '7f5b35', '9a7245', 'b28a5a'),     # túnica do taberneiro
    'peltre': ramp('2a2a2c', '45464a', '65676b', '888a8c', 'aaabab'),
    'gambeson': ramp('2e2618', '4a3d27', '675638', '84704a', '9f8a5e', 'b7a274'),
    'tabardo': ramp('141a24', '1f2836', '2c384a', '3b4a5f', '4d5d72'),           # azul gasto
    'cinto': ramp('140c08', '24160e', '3a2416', '50331f'),
    'lamina': ramp('2a2d31', '4b5056', '737a80', 'a0a6ab'),
    'latao': ramp('3a2a10', '5e4618', '8a6a26', 'b08c3a', 'cfae58'),
    'pelo': ramp('231a12', '3a2b1d', '574129', '735638', '8e6d48', 'a6875e'),
    'pelo_c': ramp('6e6250', '948670', 'b6a98e', 'd2c6aa', 'e4dac2'),
    'orelha': ramp('3a2520', '5a3a32', '7a5048', '96665a'),
    'casca': ramp('1a140f', '2a2018', '3d3023', '524231', '685540', '7e6a52'),
    'folha': ramp('121a0e', '1b2814', '26381b', '344a22', '445e2a', '577233', '6f8a40'),
    'cerne': ramp('5a4026', '7c5a36', '9c7748', 'b8935e', 'ccab74'),
    'rocha': ramp('1c1b1d', '2e2c2e', '434043', '5a5658', '726d6d', '8b8582', 'a39d97'),
    'ferrugem': ramp('2a150e', '442114', '5e2f1b', '784026', '8f5432', 'a46a42'),
    'musgo': ramp('1e2412', '2f3a1a', '445224', '5a6a30'),
    'terra': ramp('1e160f', '2f2318', '433322', '5a4630'),
    # espada do jogador: aço simples, afiado (mais claro e polido) e temperado (azulado, fio claro)
    'aco': ramp('2c2f33', '464b51', '646a70', '858b90', 'a7acb0', 'c9cdcf'),
    'aco_af': ramp('30353b', '4d555d', '6f7880', '949ca3', 'bac1c6', 'dfe4e6'),
    'aco_t': ramp('1c2230', '2c3548', '414d64', '5b6a80', '7d8ca0', 'a9b6c4'),
    'luva': ramp('1e130c', '33210f', '4a3119', '624327', '7a5636', '8f6a46'),
    'rastro': ramp('7e868c', '9ba3a8', 'b9c0c4', 'd5dadc', 'eceff0'),
}
DITHER = {'luva': 0.5, 'rastro': 0.0, 'habito': 0.5, 'capuz': 0.5, 'linho': 0.5, 'linho_c': 0.5, 'avental': 0.5, 'calca': 0.5, 'gambeson': 0.5,
          'ocre': 0.5, 'tabardo': 0.5, 'pelo': 0.6, 'casca': 0.6, 'folha': 0.7, 'rocha': 0.55, 'ferrugem': 0.5,
          'madeira': 0.4, 'corda': 0.3, 'terra': 0.6, 'musgo': 0.6, 'barba': 0.5, 'cinza': 0.3, 'castanho': 0.3}
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
LUZ = np.array([-0.52, -0.62, 0.58]); LUZ = LUZ / np.linalg.norm(LUZ)   # alto à esquerda, um pouco de frente


class Fig:
    """tela de desenho: material por pixel + luminância (0..1) + id da peça"""

    def __init__(self, w, h, seed=1):
        self.w, self.h = w, h
        self.names = [None]
        self.mat = np.zeros((h, w), np.int16)
        self.lum = np.zeros((h, w))
        self.part = np.zeros((h, w), np.int16)
        self.np = 0
        self.Y, self.X = np.mgrid[0:h, 0:w] + 0.5
        self.rng = np.random.RandomState(seed)

    def mid(self, name):
        if name not in self.names: self.names.append(name)
        return self.names.index(name)

    # ----- máscaras -----
    def m_ell(self, cx, cy, rx, ry):
        return ((self.X - cx) / rx) ** 2 + ((self.Y - cy) / ry) ** 2 <= 1

    def m_poly(self, pts):
        from PIL import ImageDraw
        im = Image.new('L', (self.w * 4, self.h * 4), 0)
        ImageDraw.Draw(im).polygon([(x * 4, y * 4) for x, y in pts], fill=255)
        im = im.resize((self.w, self.h), Image.BOX)
        return np.array(im) >= 128

    def m_cap(self, x0, y0, x1, y1, r0, r1=None):
        r1 = r0 if r1 is None else r1
        dx, dy = x1 - x0, y1 - y0; L2 = dx * dx + dy * dy or 1e-6
        t = np.clip(((self.X - x0) * dx + (self.Y - y0) * dy) / L2, 0, 1)
        px, py = x0 + t * dx, y0 + t * dy
        return (self.X - px) ** 2 + (self.Y - py) ** 2 <= (r0 + (r1 - r0) * t) ** 2

    def m_mat(self, *names):
        ids = [self.names.index(n) for n in names if n in self.names]
        return np.isin(self.mat, ids)

    # ----- pintura -----
    def shape(self, mask, mat, R=None, bias=0.0, tex=0.0, edge=0.0, shadow=0.0, vgrad=0.0, flat=None, clip=None,
              amb=0.22, dif=0.9, seed=None, grain=1):
        """pinta a máscara com material `mat`. R: raio do arredondamento (px); bias: soma na luz;
        tex: ruído; edge: escurece a borda onde encosta em algo já pintado; shadow: sombra projetada
        (para baixo/direita) sobre o que já existe; vgrad: escurece para baixo; flat: luz fixa;
        clip: máscara que limita a pintura (ex.: só sobre um material)."""
        if clip is not None: mask = mask & clip
        if not mask.any(): return mask
        if shadow:
            sh = np.zeros_like(mask); sh[2:, 1:] = mask[:-2, :-1]; sh[1:, 1:] |= mask[:-1, :-1]
            sh &= ~mask & (self.mat > 0)
            self.lum[sh] -= shadow
        if flat is not None:
            lum = np.full(mask.shape, float(flat))
        else:
            d = ndimage.distance_transform_edt(mask)
            if R is None: R = max(d.max(), 1)
            t = np.clip(d / R, 0, 1)
            gy, gx = np.gradient(ndimage.gaussian_filter(d, 0.8))
            gl = np.hypot(gx, gy) + 1e-6
            ox, oy = -gx / gl, -gy / gl              # direção para fora
            s = 1 - t
            nx, ny, nz = ox * s, oy * s, np.sqrt(np.clip(1 - s * s, 0, 1))
            lum = amb + dif * np.clip(nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2], 0, 1)
        if vgrad:
            ys = np.where(mask.any(1))[0]; y0, y1 = ys.min(), ys.max() + 1
            lum = lum - vgrad * np.clip((self.Y - y0) / max(1, y1 - y0), 0, 1)
        if tex:
            rng = np.random.RandomState(seed) if seed is not None else self.rng
            n = rng.uniform(-tex, tex, (self.h // grain + 1, self.w // grain + 1))
            n = np.kron(n, np.ones((grain, grain)))[:self.h, :self.w]
            lum = lum + n
        lum = lum + bias
        self.np += 1
        if edge:
            nb = ndimage.binary_dilation(~mask) & mask
            old = self.mat > 0
            touch = ndimage.binary_dilation(old & ~mask) & nb
            lum = np.where(touch, lum - edge, lum)
        self.mat[mask] = self.mid(mat); self.lum[mask] = lum[mask]; self.part[mask] = self.np
        return mask

    def ell(self, cx, cy, rx, ry, mat, **k): return self.shape(self.m_ell(cx, cy, rx, ry), mat, **k)

    def poly(self, pts, mat, **k): return self.shape(self.m_poly(pts), mat, **k)

    def cap(self, x0, y0, x1, y1, r0, r1, mat, **k): return self.shape(self.m_cap(x0, y0, x1, y1, r0, r1), mat, **k)

    def adj(self, mask, amt, clip=None):
        if clip is not None: mask = mask & clip
        mask = mask & (self.mat > 0); self.lum[mask] += amt

    def px(self, x, y, mat, lum):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h: self.mat[y, x] = self.mid(mat); self.lum[y, x] = lum

    def dk(self, x, y, amt):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h and self.mat[y, x]: self.lum[y, x] += amt

    def pts(self, pts):
        out = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = int(max(abs(x1 - x0), abs(y1 - y0), 1))
            for i in range(n + 1): out.append((round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)))
        return out

    def line(self, pts, mat, lum):
        for x, y in self.pts(pts): self.px(x, y, mat, lum)

    def fold(self, pts, amt=0.28, hi=0.12, clip=None):
        """vinco: linha escura com um fio de luz à esquerda"""
        for x, y in self.pts(pts):
            if clip is not None and not (0 <= y < self.h and 0 <= x < self.w and clip[y, x]): continue
            self.dk(x, y, -amt)
            if hi and 0 <= x - 1 < self.w and 0 <= y < self.h and self.mat[y, x - 1] == self.mat[y, x]: self.dk(x - 1, y, hi)

    def soft(self, mask, amt, sigma=1.4, off=(1, 2)):
        """sombra suave (sem linha dura) que `mask` projeta para baixo/direita sobre o que já está pintado"""
        m = np.zeros(mask.shape); dx, dy = off
        m[dy:, dx:] = mask[:mask.shape[0] - dy, :mask.shape[1] - dx]
        g = ndimage.gaussian_filter(m, sigma)
        sel = (self.mat > 0) & ~mask
        self.lum[sel] -= amt * np.clip(g[sel] * 1.6, 0, 1)

    def crease(self, pts, amt, sigma=0.9):
        """dobra/junção suave: escurecimento com queda gradual, sem linha de contorno"""
        m = np.zeros((self.h, self.w))
        for x, y in self.pts(pts):
            if 0 <= x < self.w and 0 <= y < self.h: m[y, x] = 1
        g = ndimage.gaussian_filter(m, sigma); g = g / max(g.max(), 1e-6)
        sel = self.mat > 0
        self.lum[sel] -= amt * g[sel]

    def smudge(self, cx, cy, rx, ry, amt, n=40, clip=None):
        """fuligem/sujeira: pontos escuros espalhados"""
        for _ in range(n):
            x = cx + self.rng.normal(0, rx); y = cy + self.rng.normal(0, ry)
            xi, yi = int(x), int(y)
            if 0 <= xi < self.w and 0 <= yi < self.h and (clip is None or clip[yi, xi]): self.dk(xi, yi, -amt)

    # ----- saída -----
    def render(self, rim=0.12):
        """sem contorno: a borda é só a cor do próprio material. rim escurece levemente, no próprio
        material, os pixels da borda de baixo/direita (lado da sombra) para a silhueta ler contra o fundo."""
        h, w = self.h, self.w
        rgba = np.zeros((h, w, 4), np.uint8)
        bay = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]
        lum = self.lum.copy()
        op = self.mat > 0
        if rim:
            er = np.zeros_like(op); er[:, :-1] = ~op[:, 1:]; er[:, -1] = True     # vazio à direita
            eb = np.zeros_like(op); eb[:-1, :] = ~op[1:, :]; eb[-1, :] = True     # vazio abaixo
            edge = op & (er | eb)
            lum[edge] -= rim
        for i, n in enumerate(self.names):
            if not i: continue
            m = self.mat == i
            if not m.any(): continue
            r = MAT[n]; k = len(r); dth = DITHER.get(n, 0.25)
            v = np.clip(lum, 0, 1.2) * (k - 1) + 0.5 + (bay - 0.5) * dth
            idx = np.clip(np.floor(v), 0, k - 1).astype(int)
            if rim:  # a borda nunca vira o tom mais escuro se o pixel não era escuro antes (nada de "linha preta")
                v0 = np.clip(self.lum, 0, 1.2) * (k - 1) + 0.5 + (bay - 0.5) * dth
                idx0 = np.clip(np.floor(v0), 0, k - 1).astype(int)
                idx = np.where(edge & (idx0 >= 1), np.maximum(idx, 1), idx)
            pal = np.array([c[:3] for c in r], np.uint8)
            rgba[m, :3] = pal[idx[m]]; rgba[m, 3] = 255
        return Image.fromarray(rgba, 'RGBA')

# ---------------- pessoas (quadro 96x192, pés na linha 189, ~7 cabeças) ----------------
PW, PH, CX, G = 96, 192, 48, 189


def cabeca(f, skin, cy=18.5, wide=0.0, jaw=0.0, age=0.0):
    """crânio + mandíbula + orelhas + pescoço. Retorna a máscara da cabeça."""
    c = CX
    f.ell(c - 9.6 - wide, cy + 1, 1.8, 3.6, skin, bias=-0.1)   # orelhas (atrás)
    f.ell(c + 9.6 + wide, cy + 1, 1.8, 3.6, skin, bias=-0.2)
    m = f.m_ell(c, cy - 2.5, 9.4 + wide, 11) | f.m_poly([(c - 9.2 - wide, cy - 2), (c + 9.2 + wide, cy - 2), (c + 8.6 + wide + jaw, cy + 6),
                                                         (c + 4.5 + jaw, cy + 11.5), (c, cy + 13), (c - 4.5 - jaw, cy + 11.5), (c - 8.6 - wide - jaw, cy + 6)])
    f.shape(m, skin, R=6, edge=0.15, bias=-0.06)
    f.adj(m & (f.X > CX + 5.5 + wide) & (f.Y > cy - 6), -0.07)
    return m


def rosto(f, skin, cy=18.5, brow='castanho', young=False, age=0.0, stern=0.0):
    c = CX; e = int(cy)            # linha dos olhos
    # órbitas sombreadas
    for x in range(c - 6, c - 1): f.dk(x, e - 1, -0.16)
    for x in range(c + 2, c + 7): f.dk(x, e - 1, -0.22)
    # sobrancelhas (um pouco baixas e retas = expressão séria)
    for x in range(c - 7, c - 1): f.px(x, e - 2 - (1 if x == c - 7 else 0), brow, 0.25)
    for x in range(c + 2, c + 8): f.px(x, e - 2 - (1 if x == c + 7 else 0), brow, 0.2)
    if stern: f.px(c - 2, e - 2, brow, 0.2); f.px(c + 2, e - 1, brow, 0.15)
    # olhos: canto claro + íris escura + pálpebra
    for sx in (-1, 1):
        x0 = c - 4 if sx < 0 else c + 3
        f.px(x0 - 1, e, 'olho', 0.55 if sx < 0 else 0.45)
        f.px(x0, e, 'olho', 0.0)
        f.px(x0 + 1, e, 'olho', 0.5 if sx < 0 else 0.4)
        f.px(x0, e - 1 + 0, skin, 0.12 if sx > 0 else 0.2)
        f.px(x0 + 1, e - 1, skin, 0.18)
        f.px(x0 - 1, e - 1, skin, 0.18)
    # nariz: dorso claro, lado direito em sombra, ponta e narinas
    for y in range(e, e + 5): f.dk(c - 1, y, 0.1); f.dk(c + 1, y, -0.22)
    f.dk(c + 1, e + 5, -0.3); f.dk(c, e + 5, 0.05); f.dk(c - 1, e + 5, 0.1)
    f.dk(c - 2, e + 6, -0.3); f.dk(c + 2, e + 6, -0.38); f.dk(c, e + 6, -0.18); f.dk(c + 1, e + 6, -0.25)
    # boca fechada, reta
    for x in range(c - 3, c + 4): f.dk(x, e + 9, -0.42)
    f.dk(c - 3, e + 9, 0.2)
    for x in range(c - 2, c + 3): f.dk(x, e + 10, 0.08)
    f.dk(c, e + 11, -0.12)
    if age:
        f.dk(c - 4, e + 7, -0.2 * age); f.dk(c - 5, e + 8, -0.2 * age); f.dk(c + 4, e + 7, -0.25 * age); f.dk(c + 5, e + 8, -0.25 * age)
        for x in range(c - 3, c + 3): f.dk(x, e - 6, -0.12 * age)
        f.dk(c - 5, e + 1, -0.15 * age); f.dk(c + 5, e + 1, -0.2 * age)
    # malar / maçã do rosto
    f.dk(c - 6, e + 3, 0.06)


def pescoco(f, skin, y0=27, y1=38, w=5.5):
    f.poly([(CX - w, y0), (CX + w, y0), (CX + w + 1, y1), (CX - w - 1, y1)], skin, R=4, bias=-0.12)
    for x in range(int(CX - w), int(CX + w + 1)): f.dk(x, y0 + 4, -0.2)  # sombra do queixo


def mao(f, x, y, skin, s=1.0, fist=True, flip=False, edge=0.15):
    """mão pendente vista de frente (punho fechado ou semiaberta)"""
    f.ell(x, y, 3.6 * s, 5.2 * s, skin, R=3, edge=edge)
    d = 1 if not flip else -1
    for i in range(3): f.dk(x - 2 + i * 1.6, y + 3 * s, -0.22)
    f.dk(x + 2.5 * d, y - 1, -0.15)
    f.ell(x - 2.6 * d, y - 0.5, 1.4, 2.6, skin, R=2, bias=0.05)   # polegar


def padre():
    f = Fig(PW, PH, seed=11)
    sk = 'pele'
    # hábito: corpo inteiro até o chão
    f.poly([(31, 36), (65, 36), (71, 70), (74, 120), (77, 184), (66, 187), (48, 186), (30, 187), (19, 184), (22, 120), (25, 70)],
           'habito', R=14, vgrad=0.12, tex=0.03)
    # pés (sandálias)
    for x in (39, 57):
        f.ell(x, 187, 5.5, 2.8, 'bota', R=2, bias=0.1)
        f.ell(x, 185.5, 3.8, 1.8, sk, R=2, bias=-0.05)
    # vincos verticais do hábito
    for (x0, x1, a) in ((34, 30, .22), (40, 38, .26), (46, 46, .2), (52, 55, .26), (59, 63, .3), (64, 70, .28)):
        f.fold([(x0, 98), ((x0 + x1) / 2, 140), (x1, 184)], a, 0.1)
    f.fold([(36, 92), (35, 110)], .2); f.fold([(61, 92), (62, 112)], .25)
    # cinto de corda na cintura com a ponta pendurada e nós
    f.poly([(25, 80), (71, 80), (71, 84), (25, 84)], 'corda', R=2, shadow=0.25)
    for x in range(26, 71, 3): f.dk(x, 82, -0.25)
    f.cap(43, 84, 41, 146, 1.3, 1.2, 'corda', R=1.2, shadow=0.25)
    for y in (112, 130, 146): f.ell(43 - (y - 84) * 0.032, y, 1.9, 1.7, 'corda', R=1.5, shadow=0.2)
    # mangas largas: braço desce e o antebraço vem para frente segurar o livro
    for sx in (-1, 1):
        f.cap(CX + sx * 16, 42, CX + sx * 19, 74, 7, 8, 'habito', R=6, edge=0.2, shadow=0.1)
        f.poly([(CX + sx * 25, 70), (CX + sx * 13, 70), (CX + sx * 6, 92), (CX + sx * 9, 100), (CX + sx * 22, 98), (CX + sx * 27, 88)],
               'habito', R=6, edge=0.22, shadow=0.15, bias=0.04)
        f.fold([(CX + sx * 20, 76), (CX + sx * 13, 94)], .25)
    # capuz caído sobre os ombros
    f.poly([(32, 34), (64, 34), (69, 40), (63, 48), (48, 52), (33, 48), (27, 40)], 'capuz', R=6, edge=0.18, shadow=0.15)
    f.fold([(40, 44), (47, 50)], .25, .08); f.fold([(57, 43), (51, 49)], .25, .05)
    for x in range(36, 61): f.dk(x, 38, -0.22)
    # cordão com cruz de madeira
    f.line([(43, 39), (47, 54)], 'corda', 0.35); f.line([(53, 39), (49, 54)], 'corda', 0.25)
    f.poly([(47, 54), (50, 54), (50, 70), (47, 70)], 'madeira', R=1.5, shadow=0.2, edge=0.1)
    f.poly([(43, 58), (54, 58), (54, 61), (43, 61)], 'madeira', R=1.5, shadow=0.2, edge=0.1)
    # livro fechado nas duas mãos, à frente do ventre
    f.poly([(37, 86), (59, 84), (61, 102), (39, 104)], 'couro_v', R=3, shadow=0.35, edge=0.1)
    f.poly([(39, 102), (61, 100), (61, 103), (40, 105)], 'papel', flat=0.55)
    for (x, y) in ((40, 87), (57, 85), (41, 100), (58, 98)): f.px(x, y, 'latao', 0.75); f.px(x + 1, y, 'latao', 0.45)
    f.line([(45, 90), (53, 89)], 'couro_v', 0.12); f.line([(45, 97), (54, 96)], 'couro_v', 0.12)
    mao(f, 36, 95, sk, 0.9); mao(f, 61, 93, sk, 0.9, flip=True)
    # cabeça
    pescoco(f, sk, 28, 37, 5)
    cabeca(f, sk, age=1)
    m = f.m_ell(CX, 15.5, 10.6, 12.5) & ~f.m_ell(CX, 7, 7.6, 5) & ~((f.Y > 11.5) & (np.abs(f.X - CX) < 8.7)) & (f.Y < 23)
    f.shape(m, 'cinza', R=2.5, edge=0.12, tex=0.1, bias=0.05)   # coroa de cabelo grisalho (tonsura)
    f.adj(f.m_ell(CX + 2, 8, 6, 3) & f.m_mat('pele'), -0.06)
    rosto(f, sk, brow='cinza', age=1.0)
    return f


def braco(f, sx, sh, el, wr, r_sh, r_el, r_wr):
    """máscara do braço inteiro (ombro arredondado + braço + antebraço com leve dobra no cotovelo)"""
    x0, y0 = CX + sx * sh[0], sh[1]; x1, y1 = CX + sx * el[0], el[1]; x2, y2 = CX + sx * wr[0], wr[1]
    return f.m_ell(x0, y0 + 1, r_sh + 0.5, r_sh) | f.m_cap(x0, y0, x1, y1, r_sh, r_el) | f.m_cap(x1, y1, x2, y2, r_el, r_wr)


def ferreiro():
    f = Fig(PW, PH, seed=21)
    sk = 'pele'
    # pernas (calça) e botas
    for sx in (-1, 1):
        f.poly([(CX + sx * 2, 100), (CX + sx * 16, 100), (CX + sx * 15, 150), (CX + sx * 13, 176), (CX + sx * 4, 176), (CX + sx * 3, 150)],
               'calca', R=6, edge=0.12, tex=0.03)
        f.poly([(CX + sx * 3, 162), (CX + sx * 14, 162), (CX + sx * 15, 183), (CX + sx * 18, 189), (CX + sx * 1, 189), (CX + sx * 2, 182)],
               'bota', R=4, edge=0.15, shadow=0.12)
    # camisa: tronco e mangas numa peça só (ombro que se funde ao tronco)
    torso = f.m_poly([(38, 35), (58, 35), (69, 38), (71, 50), (68, 76), (66, 104), (30, 104), (28, 76), (25, 50), (27, 38)])
    sl = [braco(f, sx, (19.5, 48), (24, 70), (24, 72), 8, 7.5, 7.5) for sx in (-1, 1)]
    f.shape(torso | sl[0] | sl[1], 'linho', R=7, tex=0.03, vgrad=0.1)
    for sx in (-1, 1):
        f.crease([(CX + sx * 15.5, 50), (CX + sx * 16.5, 62), (CX + sx * 17, 72)], .16)        # junção suave braço/tronco
        f.crease([(CX + sx * 20, 54), (CX + sx * 23, 62)], .1); f.crease([(CX + sx * 26, 50), (CX + sx * 27, 60)], .08)
    f.fold([(42, 42), (48, 49), (54, 42)], .3, .05)                                            # gola aberta
    f.poly([(44, 40), (52, 40), (48, 48)], sk, R=3, bias=-0.15)
    # avental de couro com alça no pescoço
    f.line([(40, 40), (37, 52)], 'avental', 0.3); f.line([(41, 40), (38, 52)], 'avental', 0.4)
    f.line([(56, 40), (59, 52)], 'avental', 0.2); f.line([(55, 40), (58, 52)], 'avental', 0.3)
    ap = f.m_poly([(35, 52), (61, 52), (62, 76), (67, 100), (66, 150), (30, 150), (29, 100), (34, 76)])
    f.soft(ap, 0.14)
    f.shape(ap, 'avental', R=10, tex=0.03)
    f.poly([(29, 78), (67, 78), (67, 81), (29, 81)], 'cinto', R=1.5)
    f.soft(f.m_poly([(29, 78), (67, 78), (67, 81), (29, 81)]), 0.1)
    f.fold([(42, 84), (40, 148)], .18); f.fold([(55, 84), (57, 148)], .2); f.fold([(48, 110), (48, 148)], .14)
    f.crease([(40, 88), (52, 88), (52, 100), (40, 100), (40, 88)], .14)                         # bolso
    f.smudge(48, 120, 9, 20, 0.12, 60); f.smudge(46, 62, 6, 6, 0.1, 15)
    # antebraços nus saindo da manga enrolada, com leve dobra; sombra suave sobre o corpo
    for sx in (-1, 1):
        fa = f.m_cap(CX + sx * 24, 71, CX + sx * 25, 86, 6.5, 6) | f.m_cap(CX + sx * 25, 86, CX + sx * 24.5, 100, 6, 4.8)
        f.soft(fa, 0.16)
        f.shape(fa, sk, R=5, tex=0.02)
        f.crease([(CX + sx * 22, 78), (CX + sx * 21, 92)], .08)                                   # músculo do antebraço
        cuff = f.m_ell(CX + sx * 24, 71, 8, 3.6)
        f.soft(cuff, 0.12)
        f.shape(cuff, 'linho', R=3, tex=0.03)
        f.crease([(CX + sx * 24 - 6, 71), (CX + sx * 24 + 6, 71)], .14)
        f.smudge(CX + sx * 24, 90, 4, 7, 0.16, 30)
    # mão esquerda (do observador): punho fechado
    mao(f, CX - 24.5, 105, sk, 1.1, edge=0.0)
    # martelo pendendo na mão direita
    f.cap(CX + 25, 100, CX + 27, 140, 1.7, 1.7, 'madeira', R=1.5)
    f.soft(f.m_cap(CX + 25, 100, CX + 27, 140, 1.7, 1.7), 0.15)
    hd = f.m_poly([(CX + 21, 138), (CX + 33, 138), (CX + 33, 147), (CX + 21, 147)])
    f.soft(hd, 0.15); f.shape(hd, 'ferro', R=3)
    f.poly([(CX + 33, 139), (CX + 36, 140), (CX + 36, 145), (CX + 33, 146)], 'ferro', R=2, bias=-0.1)
    mao(f, CX + 25, 104, sk, 1.15, flip=True, edge=0.0)
    f.crease([(CX + 22, 102), (CX + 28, 102)], .12)                                            # dedos fechados no cabo
    # cabeça: cabelo curto escuro, barba cheia
    pescoco(f, sk, 27, 39, 6.5)
    cabeca(f, sk, wide=0.6, jaw=0.6)
    f.shape(f.m_ell(CX, 14, 10.6, 11) & (f.Y < 13.5 + np.abs(f.X - CX) * 0.32) & ~f.m_ell(CX, 22, 7.5, 9.5), 'castanho', R=4, edge=0.1, tex=0.08)
    rosto(f, sk, brow='barba', stern=1)
    b = (f.m_poly([(38.6, 18), (57.4, 18), (58, 26), (54, 34), (48, 37), (42, 34), (38, 26)]) & ~f.m_poly([(41, 15), (55, 15), (55, 23), (52, 24.5), (44, 24.5), (41, 23)]))
    f.shape(b, 'barba', R=4, edge=0.1, tex=0.12, shadow=0.15)
    for x in range(45, 52): f.px(x, 27, 'barba', 0.0)          # boca escura no meio da barba
    for x in range(46, 51): f.px(x, 28, 'pele', 0.35)
    f.smudge(41, 20, 1.5, 1.5, 0.12, 5)
    return f


def taberneiro():
    f = Fig(PW, PH, seed=31)
    sk = 'pele_r'
    for sx in (-1, 1):
        f.poly([(CX + sx * 2, 104), (CX + sx * 17, 104), (CX + sx * 16, 150), (CX + sx * 14, 178), (CX + sx * 4, 178), (CX + sx * 3, 150)],
               'calca', R=6, edge=0.12, tex=0.03)
        f.poly([(CX + sx * 3, 176), (CX + sx * 14, 176), (CX + sx * 16, 189), (CX + sx * 2, 189)], 'bota', R=3, edge=0.15, shadow=0.12)
    # túnica: tronco, barriga e mangas numa peça só
    torso = (f.m_poly([(38, 36), (58, 36), (68, 39), (72, 54), (70, 74), (30, 74), (24, 54), (28, 39)]) | f.m_ell(CX, 92, 25, 26)
             | f.m_poly([(26, 92), (70, 92), (70, 112), (26, 112)]))
    sl = [braco(f, sx, (21, 49), (27, 71), (27, 72), 8, 7.5, 7.5) for sx in (-1, 1)]
    f.shape(torso | sl[0] | sl[1], 'ocre', R=8, tex=0.03, vgrad=0.08)
    for sx in (-1, 1):
        f.crease([(CX + sx * 17, 52), (CX + sx * 19.5, 64), (CX + sx * 21.5, 74)], .15)
        f.crease([(CX + sx * 22, 54), (CX + sx * 26, 64)], .1)
    f.fold([(43, 41), (48, 50), (53, 41)], .28, .05)
    f.poly([(45, 41), (51, 41), (48, 48)], sk, R=2, bias=-0.15)
    # avental de linho comprido, amarrado sob o peito, acompanhando a barriga
    ap = f.m_poly([(31, 66), (65, 66), (72, 80), (75, 98), (72, 150), (24, 150), (21, 98), (24, 80)])
    f.soft(ap, 0.14); f.shape(ap, 'linho_c', R=12, tex=0.03)
    tie = f.m_poly([(29, 64), (67, 64), (67, 68), (29, 68)])
    f.soft(tie, 0.1); f.shape(tie, 'linho_c', R=2, bias=-0.06)
    f.fold([(36, 70), (33, 148)], .2); f.fold([(46, 72), (45, 148)], .16); f.fold([(58, 72), (61, 148)], .22); f.fold([(66, 80), (68, 148)], .18)
    f.smudge(52, 105, 8, 14, 0.14, 26); f.smudge(40, 128, 5, 6, 0.12, 12)
    f.crease([(27, 116), (38, 122), (48, 124), (60, 122), (70, 116)], .12)
    f.adj(f.m_ell(40, 92, 10, 14) & f.m_mat('linho_c'), 0.07)
    # antebraços nus, com leve dobra; esquerdo segura um pano, direito a caneca pela asa
    for sx in (-1, 1):
        fa = f.m_cap(CX + sx * 27, 72, CX + sx * 28, 86, 6.3, 5.8) | f.m_cap(CX + sx * 28, 86, CX + sx * 27, 100, 5.8, 4.8)
        f.soft(fa, 0.16); f.shape(fa, sk, R=5, tex=0.02)
        f.crease([(CX + sx * 25, 78), (CX + sx * 24.5, 92)], .07)
        cuff = f.m_ell(CX + sx * 27, 72, 8, 3.8)
        f.soft(cuff, 0.12); f.shape(cuff, 'ocre', R=3, tex=0.03)
        f.crease([(CX + sx * 27 - 6, 72), (CX + sx * 27 + 6, 72)], .14)
    # pano preso na mão: passa por trás dos dedos e cai
    rag = f.m_poly([(CX - 31, 104), (CX - 23, 104), (CX - 21, 120), (CX - 20, 136), (CX - 23, 133), (CX - 27, 138), (CX - 30, 134), (CX - 33, 137), (CX - 32, 120)])
    f.soft(rag, 0.12); f.shape(rag, 'linho', R=3, tex=0.03, bias=0.12)
    f.fold([(CX - 27, 110), (CX - 26, 133)], .18); f.fold([(CX - 30, 112), (CX - 31, 132)], .14)
    mao(f, CX - 27, 104, sk, 1.1, edge=0.0)
    # caneca de madeira com aros de ferro, segura pela asa
    mug = f.m_poly([(CX + 30, 95), (CX + 43, 95), (CX + 42, 117), (CX + 31, 117)])
    f.soft(mug, 0.15); f.shape(mug, 'madeira', R=6, tex=0.02)
    for y in (98, 112): f.poly([(CX + 30, y), (CX + 43, y), (CX + 43, y + 2), (CX + 30, y + 2)], 'ferro', R=1.5, bias=0.05)
    for x in (CX + 34, CX + 38): f.fold([(x, 101), (x, 111)], .15, .05)
    f.ell(CX + 36.5, 94.5, 6.5, 2, 'linho_c', R=2, bias=0.1)    # espuma
    f.cap(CX + 29, 99, CX + 27, 104, 2.4, 2.4, 'madeira', R=1.5, bias=-0.1)
    f.cap(CX + 29, 111, CX + 27, 106, 2.4, 2.4, 'madeira', R=1.5, bias=-0.15)
    mao(f, CX + 27, 104, sk, 1.15, flip=True, edge=0.0)
    f.crease([(CX + 25, 102), (CX + 30, 102)], .1)
    # cabeça: calvo no alto, laterais castanho-grisalhas, bigode caído, papada
    pescoco(f, sk, 27, 40, 7)
    cabeca(f, sk, wide=1.0, jaw=1.2)
    side = (f.m_ell(CX - 10.2, 17.5, 2.6, 6) | f.m_ell(CX + 10.2, 17.5, 2.6, 6) | (f.m_ell(CX, 15, 11.2, 11.5) & ~f.m_ell(CX, 14.5, 10.2, 11.5) & (f.Y > 9))) & (f.Y < 24)
    f.shape(side, 'bigode', R=2, edge=0.1, tex=0.08)
    rosto(f, sk, brow='bigode', age=0.6)
    for (x, y) in ((41, 22), (42, 23), (54, 22), (55, 23)): f.dk(x, y, 0.08)  # bochechas coradas
    mm = f.m_poly([(43, 24.6), (53, 24.6), (55, 27), (55.5, 31), (53.5, 30.5), (51.5, 27.6), (44.5, 27.6), (42.5, 30.5), (40.5, 31), (41, 27)])
    f.shape(mm, 'bigode', R=2, edge=0.05, shadow=0.15)
    f.adj(f.m_ell(CX, 31.5, 8, 2) & f.m_mat(sk), -0.08)                          # papada
    return f


def anselmo():
    f = Fig(PW, PH, seed=41)
    sk = 'pele_j'
    # pernas (calças justas) e botas altas
    for sx in (-1, 1):
        f.poly([(CX + sx * 2, 100), (CX + sx * 13, 100), (CX + sx * 13, 140), (CX + sx * 11, 150), (CX + sx * 4, 150), (CX + sx * 3, 140)],
               'calca', R=5, edge=0.12, tex=0.03)
        f.poly([(CX + sx * 3, 142), (CX + sx * 13, 142), (CX + sx * 12, 182), (CX + sx * 15, 189), (CX + sx * 1, 189), (CX + sx * 3, 182)],
               'bota', R=4, edge=0.15, shadow=0.12)
        f.poly([(CX + sx * 2, 141), (CX + sx * 14, 141), (CX + sx * 14, 145), (CX + sx * 2, 145)], 'bota', R=2, bias=0.1)
    # gambeson: tronco e mangas inteiras numa peça só; o braço direito (do observador) dobra para pousar a mão no punho da espada
    torso = f.m_poly([(39, 35), (57, 35), (66, 39), (68, 52), (65, 82), (69, 124), (27, 124), (31, 82), (28, 52), (30, 39)])
    armL = braco(f, -1, (18.5, 47), (21.5, 72), (21, 97), 7, 6, 5)
    armR = braco(f, 1, (18.5, 47), (22, 72), (14, 81), 7, 6, 5)
    f.shape(torso | armL | armR, 'gambeson', R=7, tex=0.03)
    gm = f.m_mat('gambeson')
    for x in range(30, 68, 5): f.fold([(x, 44), (x + (x - 48) * 0.06, 124)], .16, .08, clip=gm & torso)   # costuras do acolchoado
    for y in range(50, 124, 8): f.fold([(26, y), (70, y)], .08, 0, clip=gm & torso)
    for y in range(52, 96, 7): f.fold([(CX - 27, y), (CX - 15, y)], .1, 0, clip=gm & armL & ~torso)
    for y in range(52, 70, 7): f.fold([(CX + 15, y), (CX + 27, y)], .1, 0, clip=gm & armR & ~torso)
    f.crease([(CX - 14, 50), (CX - 15.5, 64), (CX - 16.5, 80)], .14)
    f.crease([(CX + 14, 50), (CX + 15.5, 64)], .14)
    # tabardo azul gasto por cima
    tb = f.m_poly([(36, 40), (60, 40), (62, 82), (64, 130), (32, 130), (34, 82)]) & ~armR
    f.soft(tb, 0.14); f.shape(tb, 'tabardo', R=8, tex=0.03)
    f.fold([(41, 90), (39, 128)], .2); f.fold([(55, 90), (57, 128)], .2)
    f.poly([(46.5, 56), (49.5, 56), (49.5, 74), (46.5, 74)], 'linho_c', R=1.5, bias=-0.05)
    f.poly([(41, 61.5), (55, 61.5), (55, 64.5), (41, 64.5)], 'linho_c', R=1.5, bias=-0.05)
    # cinto com fivela
    bl = f.m_poly([(28, 82), (68, 82), (68, 86), (28, 86)])
    f.soft(bl, 0.12); f.shape(bl, 'cinto', R=1.5)
    f.poly([(45, 81), (51, 81), (51, 87), (45, 87)], 'latao', R=2)
    f.poly([(46.5, 82.5), (49.5, 82.5), (49.5, 85.5), (46.5, 85.5)], 'cinto', flat=0.0)
    # espada curta na bainha, do lado esquerdo do corpo (direita do observador)
    sc = f.m_poly([(62, 86), (66, 86), (73, 142), (70, 143)])
    f.soft(sc, 0.15); f.shape(sc, 'couro_v', R=2)
    f.poly([(69, 140), (73, 139), (74, 145), (71, 146)], 'latao', R=1.5)
    f.poly([(54, 84), (68, 81), (68, 84), (54, 87)], 'lamina', R=1.5)            # guarda
    f.cap(60, 81, 61, 72, 1.6, 1.6, 'cinto', R=1)                               # punho
    f.ell(60.5, 71, 2.4, 2.4, 'latao', R=2)                                      # pomo
    # antebraço direito por cima de tudo, mão pousada no punho da espada
    fa = f.m_cap(CX + 22, 72, CX + 14, 81, 6, 5)
    f.soft(fa, 0.14); f.shape(fa, 'gambeson', R=5, tex=0.03)
    f.fold([(CX + 18, 72), (CX + 15, 77)], .1, 0)
    f.ell(CX + 13.5, 81.5, 3.8, 4.4, sk, R=3)                                    # mão fechada sobre o punho
    f.crease([(CX + 11, 83), (CX + 16, 83)], .14); f.dk(CX + 11, 80, 0.06)
    f.ell(60.5, 76, 1.4, 1.2, 'cinto', R=1, bias=-0.05)
    mao(f, CX - 21, 102, sk, edge=0.0)
    # cabeça jovem: cabelo castanho curto com franja, sem barba
    pescoco(f, sk, 27, 38, 5)
    cabeca(f, sk)
    hm = (f.m_ell(CX, 13.5, 10.6, 10.5) & (f.Y < 12 + np.abs(f.X - CX) * 0.45)) | (f.m_ell(CX - 9, 17, 2.2, 5) | f.m_ell(CX + 9, 17, 2.2, 5))
    f.shape(hm & (f.Y < 22), 'castanho', R=4, edge=0.1, tex=0.1, bias=0.12)
    for x in range(40, 56, 3): f.px(x, 12 + (x % 2), 'castanho', 0.1)
    rosto(f, sk, brow='castanho')
    f.px(CX - 1, 30, sk, 0.55)
    return f


# ---------------- moradores da vila (ambiente) ----------------
MAT.update({
    # moradores da vila
    'pele_m': ramp('3a2318', '5a3826', '7a5036', '966a4a', 'ac8260', 'bf9876'),   # morena
    'pele_e': ramp('20130e', '33201a', '4a2f24', '614032', '785240', '8e6650'),   # negra
    'pele_c': ramp('5a3e34', '86604e', 'ad8268', 'c9a084', 'dcb89c', 'ecd0b4'),   # clara
    'pele_v': ramp('4a3630', '6e5248', '907062', 'ad8c7c', 'c4a594', 'd6bba9'),   # idosa
    'labio': ramp('5a2a26', '7c3c34', '9c5448', 'b46c5c'),
    'ruivo': ramp('3a1408', '5c2210', '843418', 'a84a20', 'c4652c', 'd9823e'),
    'loiro': ramp('4a3614', '705422', '967434', 'b8964a', 'd0b264', 'e2ca80'),
    'preto': ramp('0e0c0e', '1a1719', '272226', '352e33', '453c42'),
    'branco': ramp('5e5a56', '86817b', 'aaa59e', 'cbc6be', 'e2ded6'),              # cabelo alvo
    'verde': ramp('141c12', '20301c', '304428', '445a36', '5a7046', '728658'),
    'musgo_t': ramp('1c1e10', '2e3218', '444a24', '5c6230', '747a40', '8c9254'),
    'marrom': ramp('1c120c', '2e1e14', '44301f', '5c432c', '75583a', '8c6e4c'),
    'cinza_l': ramp('1e1e20', '323234', '48484a', '606060', '787876', '908e8a'),   # lã cinza
    'azul': ramp('10182a', '1a2840', '293c5a', '3b5274', '506a8c', '6a84a2'),
    'azul_c': ramp('1c2430', '2e3a4c', '45556a', '5e7088', '7a8ca2', '98a8ba'),    # azul acinzentado
    'rosa': ramp('3a1416', '5e2024', '863238', 'a84a4c', 'c06a64', 'd08c82'),      # vermelho desbotado
    'mostarda': ramp('2e220c', '4c3a12', '6e561c', '90742a', 'ae923c', 'c6ac52'),
    'vinho': ramp('1e0a10', '320f1a', '4a1826', '642433', '7e3242', '964654'),
    'roxo': ramp('1a1024', '2a1a3a', '3e2a52', '54396c', '6c4c86', '8462a0'),
    'esmeralda': ramp('0c2018', '123428', '1c4a38', '28624c', '367c60', '4a9676'),
    'palha': ramp('4a3a18', '6e5a28', '94803e', 'b49e56', 'ccb870', 'ded090'),
    'malha': ramp('1c1e22', '34383e', '50565c', '70767c', '929899'),
    'branco_p': ramp('8a8578', 'aca696', 'c8c2b2', 'ddd8ca', 'ece8dc'),            # pano branco
    'arminho': ramp('3c3026', '5e4c3c', '82705c', 'a6947e', 'c8b8a2', 'e0d4c2'),   # pele da gola
    'pao': ramp('4a2810', '74441a', '9e6628', 'c08a40', 'd8ac62'),
    'vaca_b': ramp('6a5e50', '8e8270', 'b0a48e', 'ccc0a8', 'e0d6c0', 'ece4d2'),
    'vaca_m': ramp('24150e', '38231a', '503426', '6a4834', '845e44', '9c7558'),
    'focinho': ramp('5a3a36', '7e5650', 'a07870', 'bc968c', 'd0b0a4'),
    'chifre': ramp('4e4430', '76684c', 'a09070', 'c4b698', 'dcd2ba'),
    'casco': ramp('141010', '221c18', '34291f', '463a2e'),
})
DITHER.update({'verde': 0.5, 'musgo_t': 0.5, 'marrom': 0.5, 'cinza_l': 0.5, 'azul': 0.5, 'azul_c': 0.5, 'rosa': 0.5, 'mostarda': 0.5, 'vinho': 0.5,
               'roxo': 0.5, 'esmeralda': 0.5, 'palha': 0.4, 'malha': 0.5, 'branco_p': 0.3, 'arminho': 0.6, 'preto': 0.3, 'ruivo': 0.3, 'loiro': 0.3,
               'branco': 0.3, 'vaca_b': 0.45, 'vaca_m': 0.5})

# quadros: adultos 96x192 como as figuras acima; adolescentes 96x176 e crianças 96x128, na mesma densidade.
# Cabeça igual em pixels: a criança fica com ~5 cabeças de altura, o adolescente com ~6,5.
TH, CH = 176, 128                     # altura do quadro de adolescente e de criança


def pernas(f, y0, G, o=13, i=3, mat='calca', bota='bota', cano=None, sola=3):
    """duas pernas de y0 até o chão; cano = linha onde começa a bota"""
    cano = cano or G - 14
    for sx in (-1, 1):
        f.poly([(CX + sx * i, y0), (CX + sx * (o + 2), y0), (CX + sx * (o + 1), (y0 + cano) / 2), (CX + sx * o, cano + 4),
                (CX + sx * (i + 1), cano + 4), (CX + sx * (i + 0.5), (y0 + cano) / 2)], mat, R=6, edge=0.12, tex=0.03)
        f.poly([(CX + sx * (i + 0.5), cano), (CX + sx * o, cano), (CX + sx * (o + 0.5), G - 6), (CX + sx * (o + sola), G),
                (CX + sx * (i - 1), G), (CX + sx * i, G - 7)], bota, R=4, edge=0.15, shadow=0.12)


def tunica(f, mat, bracos, y0=36, ys=50, yw=82, yh=118, sh=23, wa=18, hem=21, R=7, vgrad=0.1):
    """tronco e mangas numa peça só, como nas figuras acima. Retorna a máscara do tronco."""
    torso = f.m_poly([(CX - 9, y0), (CX + 9, y0), (CX + sh - 3, y0 + 3), (CX + sh, ys), (CX + wa, yw), (CX + hem, yh),
                      (CX - hem, yh), (CX - wa, yw), (CX - sh, ys), (CX - sh + 3, y0 + 3)])
    m = torso
    for b in bracos: m = m | b
    f.shape(m, mat, R=R, tex=0.03, vgrad=vgrad)
    return torso


def axila(f, a, ys=50, amt=0.16):
    for sx in (-1, 1): f.crease([(CX + sx * a, ys), (CX + sx * (a + 1), ys + 12), (CX + sx * (a + 1.5), ys + 24)], amt)


def faixa(f, y, x0, x1, mat='cinto', h=3.5, sombra=0.1):
    m = f.m_poly([(x0, y), (x1, y), (x1, y + h), (x0, y + h)])
    f.soft(m, sombra); f.shape(m, mat, R=1.5)
    return m


def saia(f, mat, y0, G, w0, w1, vincos=6, a=0.24):
    """saia longa até o chão, abrindo para baixo, com vincos em leque"""
    f.poly([(CX - w0, y0), (CX + w0, y0), (CX + w0 + (w1 - w0) * 0.45, (y0 + G) / 2), (CX + w1, G - 4), (CX + w1 * 0.5, G - 2), (CX, G - 3), (CX - w1 * 0.5, G - 2),
            (CX - w1, G - 4), (CX - w0 - (w1 - w0) * 0.45, (y0 + G) / 2)], mat, R=14, vgrad=0.12, tex=0.03)
    for k in range(vincos):
        t = (k + 0.5) / vincos * 2 - 1
        x0, x1 = CX + t * w0 * 0.8, CX + t * w1 * 0.86
        f.fold([(x0, y0 + 14 + (k % 2) * 8), ((x0 + x1) / 2, (y0 + G) / 2 + 6), (x1, G - 5)], a + (0.05 if t > 0 else 0), 0.09)


def faixas_perna(f, y0, y1, o, i, mat='cinza_l', passo=6):
    """faixas de lã enroladas na canela, em diagonal (as perneiras do séc. XII)"""
    for sx in (-1, 1):
        perna = f.m_poly([(CX + sx * (i - .5), y0), (CX + sx * (o + 1.5), y0), (CX + sx * (o + 1), y1), (CX + sx * (i), y1)])
        f.shape(perna, mat, R=4, tex=.03, edge=.1)
        for y in range(int(y0) + 2, int(y1), passo):
            f.crease([(CX + sx * i, y + 3), (CX + sx * (o + 1.5), y)], .2, sigma=.6)
            f.fold([(CX + sx * i, y + 4), (CX + sx * (o + 1.5), y + 1)], 0, .1)


def pes(f, G, xs=(39, 57), mat='bota'):
    for x in xs: f.ell(x, G - 2, 6, 3, mat, R=2, bias=0.1)


def rosto_f(f, skin, cy=18.5, brow='castanho', age=0.0, boca=True):
    """o rosto comum com sobrancelha fina, cílios e boca pintada (mulheres e meninas)"""
    rosto(f, skin, cy=cy, brow=brow, age=age)
    c = CX; e = int(cy)
    for x in (c - 7, c - 6, c - 2, c + 2, c + 6, c + 7): f.px(x, e - 2 - (1 if x in (c - 7, c + 7) else 0), skin, 0.5)
    for x in (c - 5, c - 4, c - 3, c + 2, c + 3, c + 4): f.px(x, e - 1, brow, 0.12)
    if boca:
        for x in range(c - 2, c + 3): f.px(x, e + 9, 'labio', 0.5); f.px(x, e + 10, 'labio', 0.75)
        f.px(c - 3, e + 9, skin, 0.3); f.px(c + 3, e + 9, skin, 0.25)
    f.dk(c - 6, e + 4, 0.05); f.dk(c - 5, e + 4, 0.05)


def rosto_c(f, skin, cy=18.5, brow='castanho'):
    """criança: o rosto comum com olhos mais abertos e boca pequena"""
    rosto(f, skin, cy=cy, brow=brow)
    c = CX; e = int(cy)
    for x0 in (c - 4, c + 3): f.px(x0, e + 1, 'olho', 0.0); f.px(x0, e - 1, 'olho', 0.1)
    for x in (c - 3, c + 3): f.px(x, e + 9, skin, 0.42)
    f.dk(c - 6, e + 4, 0.06); f.dk(c + 6, e + 4, 0.03)


def sardas(f, cy=18.5, n=10, amt=-0.2, seed=3):
    r = np.random.RandomState(seed); e = int(cy)
    for _ in range(n): f.dk(CX + r.randint(-7, 8), e + r.randint(2, 6), amt)


def chapeu_palha(f, y=10, rx=19, ry=3.6, alto=8):
    """chapéu de palha de aba larga: copa, fita e aba por cima da testa"""
    aba = f.m_ell(CX, y, rx, ry)
    f.soft(aba, 0.3, sigma=1.6, off=(1, 3))
    f.poly([(CX - 9.5, y), (CX - 8, y - alto), (CX - 3, y - alto - 1), (CX + 4, y - alto - 1), (CX + 8, y - alto), (CX + 9.5, y)], 'palha', R=6, tex=0.1, grain=1)
    f.shape(aba, 'palha', R=3, tex=0.12)
    for k in range(-16, 17, 4): f.dk(CX + k, y + (k % 3) - 1, -0.14)


def barba_cheia(f, mat, y0=18, y1=37, w=9.4, bias=0.0, tex=0.12):
    b = (f.m_poly([(CX - w, y0), (CX + w, y0), (CX + w + 0.6, y0 + 8), (CX + 6, y1 - 3), (CX, y1), (CX - 6, y1 - 3), (CX - w - 0.4, y0 + 8)])
         & ~f.m_poly([(41, 15), (55, 15), (55, 23), (52, 24.5), (44, 24.5), (41, 23)]))
    f.shape(b, mat, R=4, edge=0.1, tex=tex, shadow=0.15, bias=bias)
    return b


def cabo(f, x0, y0, x1, y1, r=1.7, mat='madeira'):
    m = f.m_cap(x0, y0, x1, y1, r, r); f.soft(m, 0.15); f.shape(m, mat, R=1.5, tex=0.02)
    return m


def faz_velho():
    """lavrador velho: magro, curvado, chapéu de aba larga, barba branca comprida e enxada"""
    f = Fig(PW, PH, seed=61); sk = 'pele_v'
    pernas(f, 112, 189, o=11, i=4, mat='cinza_l', bota='marrom', cano=172)
    arms = [braco(f, -1, (16, 50), (20, 76), (19, 100), 6, 5, 4.2), braco(f, 1, (16, 50), (21, 74), (22, 92), 6, 5, 4.2)]
    t = tunica(f, 'cinza_l', arms, y0=40, ys=54, yw=86, yh=134, sh=18, wa=15, hem=20)
    axila(f, 13, 54, .14)
    for x0, x1 in ((39, 36), (47, 47), (56, 59)): f.fold([(x0, 92), (x1, 132)], .2, .08)
    # remendo no peito e bainha esfiapada
    f.poly([(36, 96), (46, 95), (47, 108), (37, 109)], 'marrom', R=3, shadow=0.1, bias=0.1)
    for (x, y) in ((36, 98), (36, 103), (46, 97), (46, 104)): f.dk(x, y, 0.2)
    for x in range(30, 67, 3): f.dk(x, 133 - (x % 2) * 2, -0.25)
    corda = faixa(f, 86, 33, 63, 'corda', 3)
    for x in range(34, 63, 3): f.dk(x, 87, -0.25)
    # enxada: cabo do chão até acima do ombro, lâmina de ferro no alto
    cabo(f, CX + 26, 186, CX + 31, 34, 1.6)
    h = f.m_poly([(CX + 24, 30), (CX + 40, 33), (CX + 41, 44), (CX + 36, 43), (CX + 34, 38), (CX + 26, 37)])
    f.soft(h, 0.12); f.shape(h, 'ferro', R=3, bias=-0.05)
    mao(f, CX + 28, 94, sk, 1.0, flip=True, edge=0.0); f.crease([(CX + 25, 92), (CX + 31, 92)], .12)
    mao(f, CX - 19, 105, sk, 0.95, edge=0.0)
    # cabeça baixa, entre os ombros
    pescoco(f, sk, 30, 42, 4.5)
    cabeca(f, sk, cy=22.5, wide=-0.6, jaw=-0.4)
    rosto(f, sk, cy=22.5, brow='branco', age=1.2)
    b = (f.m_poly([(39, 25), (57, 25), (58, 32), (55, 44), (50, 58), (47, 60), (42, 46), (38, 32)])
         & ~f.m_poly([(41, 19), (55, 19), (55, 27), (52, 28.5), (44, 28.5), (41, 27)]))
    f.shape(b, 'branco', R=4, edge=0.1, tex=0.1, shadow=0.15, bias=-0.05)
    for x0 in (44, 48, 52): f.fold([(x0, 36), (x0 + (48 - x0) * 0.3, 54)], .16, .06)
    for x in range(46, 51): f.px(x, 31, 'branco', 0.0)
    chapeu_palha(f, 14, 20, 3.8, 9)
    return f


def faz_forte():
    """lavrador forte: moreno, ombros largos, colete sobre a camisa de mangas arregaçadas, forcado"""
    f = Fig(PW, PH, seed=62); sk = 'pele_m'
    # calças de linho com faixas de lã enroladas na canela e sapatos baixos (no lugar das botas de cano)
    pernas(f, 112, 189, o=15, i=2.5, mat='linho', bota='marrom', cano=178)
    faixas_perna(f, 138, 180, 15, 2.5, 'cinza_l')
    arms = [braco(f, -1, (22, 49), (27, 70), (27, 72), 9, 8, 8), braco(f, 1, (22, 49), (27, 70), (27, 72), 9, 8, 8)]
    # túnica de lã parda até o joelho (no lugar do colete de couro, que é de séculos depois), camisa de linho por baixo
    t = tunica(f, 'avental', arms, y0=35, ys=50, yw=82, yh=134, sh=27, wa=20, hem=23)
    axila(f, 17.5, 50, .16)
    for x0, x1 in ((38, 32), (48, 48), (58, 64)): f.fold([(x0, 92), (x1, 132)], .2, .08)
    f.poly([(43, 38), (53, 38), (48, 50)], 'linho_c', R=3, bias=-.05)
    f.fold([(43, 39), (48, 51), (53, 39)], .3, .05); f.poly([(45, 39), (51, 39), (48, 46)], sk, R=2, bias=-0.15)
    faixa(f, 84, 27, 69)
    f.poly([(45, 83), (51, 83), (51, 89), (45, 89)], 'ferro', R=2)
    # antebraços nus, grossos
    for sx in (-1, 1):
        fa = f.m_cap(CX + sx * 27, 72, CX + sx * 29, 86, 7.5, 7) | f.m_cap(CX + sx * 29, 86, CX + sx * 29, 100, 7, 5.6)
        f.soft(fa, 0.16); f.shape(fa, sk, R=5, tex=0.02)
        f.crease([(CX + sx * 26, 78), (CX + sx * 25.5, 92)], .08)
        cuff = f.m_ell(CX + sx * 27, 71, 9.5, 3.8); f.soft(cuff, 0.12); f.shape(cuff, 'linho_c', R=3, tex=0.03)
        f.crease([(CX + sx * 27 - 7, 71), (CX + sx * 27 + 7, 71)], .14)
    # forcado de três dentes, em pé, firme na mão direita
    cabo(f, CX + 33, 187, CX + 33, 20, 1.8)
    f.poly([(CX + 25, 18), (CX + 41, 18), (CX + 41, 21), (CX + 25, 21)], 'ferro', R=1.5)
    for x in (CX + 26, CX + 33, CX + 40): f.cap(x, 19, x, 2, 1.3, 0.7, 'ferro', R=1)
    mao(f, CX + 30, 104, sk, 1.2, flip=True, edge=0.0); f.crease([(CX + 27, 102), (CX + 34, 102)], .12)
    mao(f, CX - 29, 105, sk, 1.2, edge=0.0)
    # cabeça larga, barba curta preta, cabelo raspado dos lados com lenço vermelho na testa
    pescoco(f, sk, 27, 39, 7.5)
    cabeca(f, sk, wide=1.0, jaw=1.2)
    f.shape(f.m_ell(CX, 13, 11, 10) & (f.Y < 13), 'preto', R=4, edge=0.1, tex=0.08, bias=0.1)
    rosto(f, sk, brow='preto', stern=1)
    lenco = f.m_poly([(CX - 11, 9), (CX + 11, 9), (CX + 11, 13), (CX - 11, 13)]) & f.m_ell(CX, 16, 11.4, 13)
    f.shape(lenco, 'rosa', R=2, bias=0.05)
    f.poly([(CX + 10, 10), (CX + 15, 13), (CX + 14, 18), (CX + 11, 14)], 'rosa', R=1.5, bias=-0.1)
    b = barba_cheia(f, 'preto', 21, 34, 9.8, bias=0.05)
    for x in range(45, 52): f.px(x, 27, 'preto', 0.0)
    for x in range(46, 51): f.px(x, 28, sk, 0.4)
    return f


def faz_gordo():
    """lavrador gordo: barriga redonda, túnica verde, gorro de lã e um saco de grãos no ombro"""
    f = Fig(PW, PH, seed=63); sk = 'pele_c'
    pernas(f, 118, 189, o=16, i=3, mat='linho', bota='bota', cano=170)
    arms = [braco(f, -1, (22, 50), (31, 74), (33, 100), 8, 7.5, 6), braco(f, 1, (21, 50), (27, 62), (21, 46), 8, 7.5, 6)]
    t = (f.m_poly([(38, 37), (58, 37), (68, 40), (72, 54), (72, 74), (24, 74), (24, 54), (28, 40)]) | f.m_ell(CX, 96, 29, 34)
         | f.m_poly([(25, 100), (71, 100), (70, 132), (26, 132)]))
    m = t | arms[0] | arms[1]
    f.shape(m, 'verde', R=11, tex=0.03, vgrad=0.08)
    f.crease([(CX - 18, 54), (CX - 21, 70), (CX - 23, 88), (CX - 23, 100)], .24, sigma=1.2)
    f.crease([(CX + 17, 72), (CX + 26, 84)], .12)
    for x0, x1 in ((34, 32), (62, 64)): f.fold([(x0, 112), (x1, 130)], .2, .08)
    b = f.m_poly([(21, 106), (75, 106), (75, 110), (21, 110)]) & f.m_ell(CX, 100, 29.5, 34)
    f.soft(b, .12); f.shape(b, 'cinto', R=1.5)
    f.crease([(26, 112), (38, 117), (48, 119), (58, 117), (70, 112)], .14)
    f.fold([(42, 39), (48, 49), (54, 39)], .3, .05)
    mao(f, CX - 33, 105, sk, 1.15, edge=0.0)
    # saco de grãos no ombro, seguro pela mão erguida
    s = f.m_poly([(CX + 12, 24), (CX + 24, 12), (CX + 40, 15), (CX + 45, 30), (CX + 40, 56), (CX + 26, 60), (CX + 15, 48)])
    f.soft(s, .16); f.shape(s, 'linho_c', R=11, tex=0.05, bias=-0.04)
    f.fold([(CX + 30, 16), (CX + 26, 34), (CX + 30, 56)], .18, .08); f.fold([(CX + 38, 20), (CX + 36, 38)], .16, .06)
    f.poly([(CX + 20, 10), (CX + 28, 13), (CX + 26, 18), (CX + 19, 16)], 'corda', R=2, shadow=.15)
    mao(f, CX + 20, 46, sk, 1.1, flip=True, edge=0.0)
    # cabeça redonda, bochechas coradas, papada, bigode loiro, gorro de lã caído
    pescoco(f, sk, 27, 38, 7.5)
    f.poly([(43, 37), (53, 37), (48, 47)], sk, R=2, bias=-0.16)
    cabeca(f, sk, wide=1.4, jaw=1.8)
    f.shape(f.m_ell(CX - 10.5, 17, 2.2, 4.5) | f.m_ell(CX + 10.5, 17, 2.2, 4.5), 'loiro', R=2, edge=.1, tex=.08)
    rosto(f, sk, brow='loiro', age=0.5)
    for (x, y) in ((39, 22), (40, 22), (41, 23), (55, 22), (56, 22), (54, 23)): f.px(x, y, 'labio', 0.8)
    mm = f.m_poly([(44, 25), (52, 25), (54, 27), (53, 28.5), (43, 28.5), (42, 27)])
    f.shape(mm, 'loiro', R=2, edge=0.05, shadow=0.15, bias=-0.1)
    f.adj(f.m_ell(CX, 31.5, 9, 2) & f.m_mat(sk), -0.08)
    g = f.m_poly([(CX - 11.4, 13), (CX - 10, 5), (CX - 3, 1), (CX + 5, 1), (CX + 10, 5), (CX + 11.4, 13)])
    f.soft(g, .16); f.shape(g, 'mostarda', R=5, tex=.05)
    f.poly([(CX - 12, 11), (CX + 12, 11), (CX + 12, 15), (CX - 12, 15)], 'mostarda', R=2, bias=-0.08)
    for x in range(CX - 11, CX + 12, 3): f.dk(x, 13, -0.2)
    return f


def faz_jovem():
    """lavrador jovem: alto e magro, cabelo loiro, capuz caído, canga com dois baldes nos ombros"""
    f = Fig(PW, PH, seed=64); sk = 'pele_j'
    # (a bota alta de cano dobrado é de séculos depois): sapato baixo e faixas de lã enroladas na canela
    pernas(f, 106, 189, o=11.5, i=3, mat='cinza_l', bota='bota', cano=178)
    faixas_perna(f, 140, 180, 11.5, 3, 'marrom')
    arms = [braco(f, -1, (17, 48), (25, 66), (37, 52), 6.5, 5.5, 4.8), braco(f, 1, (17, 48), (25, 66), (37, 52), 6.5, 5.5, 4.8)]
    t = tunica(f, 'azul', arms, y0=36, ys=50, yw=84, yh=122, sh=19, wa=15, hem=18)
    for x0, x1 in ((40, 37), (55, 58)): f.fold([(x0, 90), (x1, 120)], .2, .08)
    faixa(f, 84, 33, 63, 'cinto', 3)
    # canga atravessada nos ombros, cordas e baldes
    cg = f.m_poly([(5, 43), (91, 43), (91, 47), (5, 47)])
    for sx in (-1, 1):
        x = CX + sx * 39
        f.line([(x - 5, 46), (x - 6, 100)], 'corda', 0.3); f.line([(x + 5, 46), (x + 6, 100)], 'corda', 0.25)
        bd = f.m_poly([(x - 7, 100), (x + 7, 100), (x + 6, 122), (x - 6, 122)])
        f.shape(bd, 'madeira', R=6, tex=0.02)
        for y in (103, 116): f.poly([(x - 7, y), (x + 7, y), (x + 7, y + 2), (x - 7, y + 2)], 'ferro', R=1.5, bias=0.05)
        f.ell(x, 100, 7, 1.8, 'azul', R=2, bias=0.25)
    f.shape(cg, 'madeira', R=3, tex=0.02, shadow=.15)
    # capuz caído sobre os ombros
    cz = f.m_poly([(35, 34), (61, 34), (67, 41), (61, 52), (48, 57), (35, 52), (29, 41)])
    f.soft(cz, .14); f.shape(cz, 'marrom', R=6, tex=.03)
    f.fold([(39, 46), (47, 54)], .22, .08); f.fold([(58, 45), (50, 53)], .24, .05)
    for sx in (-1, 1): mao(f, CX + sx * 37, 50, sk, 0.95, flip=sx > 0, edge=0.0)
    pescoco(f, sk, 27, 37, 4.8)
    cabeca(f, sk, wide=-0.5, jaw=-0.3)
    hm = (f.m_ell(CX, 12.5, 11, 10.5) & (f.Y < 11 + np.abs(f.X - CX) * 0.55)) | f.m_ell(CX - 9.5, 15, 2.8, 6) | f.m_ell(CX + 9.5, 15, 2.8, 6)
    f.shape(hm & (f.Y < 22), 'loiro', R=4, edge=0.1, tex=0.14, bias=0.05)
    for (x, y) in ((39, 10), (43, 12), (47, 11), (51, 12), (56, 10)): f.ell(x, y, 2.2, 2, 'loiro', R=2, bias=0.05, edge=.1)
    rosto(f, sk, brow='loiro')
    return f


def mulher_cesta():
    """camponesa de vestido azul-acinzentado, touca branca e cesta no quadril"""
    f = Fig(PW, PH, seed=65); sk = 'pele'
    pes(f, 189, mat='marrom')
    arms = [braco(f, -1, (15, 48), (19, 72), (20, 98), 6, 5, 4), braco(f, 1, (15, 48), (20, 72), (13, 86), 6, 5, 4)]
    t = tunica(f, 'azul_c', arms, y0=37, ys=50, yw=78, yh=90, sh=17, wa=12.5, hem=16)
    saia(f, 'azul_c', 80, 188, 15, 29)
    axila(f, 12, 50, .14)
    # avental curto de linho
    ap = f.m_poly([(35, 86), (61, 86), (64, 150), (32, 150)]); f.soft(ap, .12); f.shape(ap, 'linho_c', R=10, tex=.03)
    f.fold([(41, 92), (40, 148)], .16); f.fold([(54, 92), (56, 148)], .18)
    faixa(f, 80, 34, 62, 'linho_c', 4); f.crease([(34, 84), (62, 84)], .12)
    # gola redonda e fechada (o decote quadrado era de séculos depois): a touca entra por dentro dela
    f.crease([(41, 40), (44, 43), (52, 43), (55, 40)], .14)
    mao(f, CX - 20, 103, sk, 0.9, edge=0.0)
    # cesta de vime apoiada no quadril
    ct = f.m_poly([(CX + 7, 88), (CX + 40, 88), (CX + 37, 112), (CX + 10, 112)])
    f.soft(ct, .16); f.shape(ct, 'corda', R=8, tex=.04, bias=-.05)
    for y in range(92, 112, 4):
        for x in range(CX + 9 + (y // 4 % 2) * 2, CX + 38, 4): f.dk(x, y, -.2); f.dk(x + 1, y + 1, .1)
    f.ell(CX + 23.5, 88, 16.5, 3.2, 'corda', R=2, bias=.05)
    for (x, y) in ((CX + 15, 85), (CX + 23, 84), (CX + 31, 85)): f.ell(x, y, 5, 4, 'folha', R=3, bias=.2)     # couves
    f.fold([(CX + 8, 90), (CX + 22, 74), (CX + 37, 90)], 0, 0)
    mao(f, CX + 12, 92, sk, 0.95, flip=True, edge=0.0)
    pescoco(f, sk, 27, 38, 4.2)
    cabeca(f, sk, wide=-0.6, jaw=-0.8)
    rosto_f(f, sk, brow='castanho')
    # touca branca fechando o rosto até o queixo
    tc = f.m_ell(CX, 13, 13, 12.5) | f.m_poly([(CX - 13, 13), (CX + 13, 13), (CX + 12, 34), (CX + 8, 39), (CX - 8, 39), (CX - 12, 34)])
    face = f.m_ell(CX, 19, 8.8, 13) & (f.Y > 9)
    f.shape(tc & ~face, 'branco_p', R=5, tex=.02, edge=.1)
    f.fold([(CX - 11, 14), (CX - 10, 34)], .12, .05); f.fold([(CX + 11, 14), (CX + 10, 34)], .16, .05)
    return f


def mulher_tranca():
    """mulher negra de vestido verde, trança preta sobre o ombro e um feixe de trigo no braço"""
    f = Fig(PW, PH, seed=66); sk = 'pele_e'
    pes(f, 189, mat='bota')
    arms = [braco(f, -1, (15.5, 48), (20, 72), (15, 92), 6, 5.2, 4.2), braco(f, 1, (15.5, 48), (20, 72), (21, 98), 6, 5.2, 4.2)]
    t = tunica(f, 'verde', arms, y0=37, ys=50, yw=78, yh=90, sh=17.5, wa=13, hem=17)
    saia(f, 'verde', 80, 188, 15.5, 25, vincos=5)
    axila(f, 12.5, 50, .14)
    # (o corpete de amarrar na frente era de séculos depois): vestido inteiro com cinta de lã marrom
    # amarrada, as pontas caindo, e gola redonda com a fenda do pescoço
    faixa(f, 80, 34, 62, 'marrom', 3.5)
    for x0, x1 in ((50, 51), (53, 56)): f.cap(x0, 83, x1, 104, 1.2, 1, 'marrom', R=1, shadow=.15)
    f.ell(51, 82, 2.4, 2, 'marrom', R=1.5, shadow=.15)
    f.fold([(42, 50), (40, 78)], .14, .06); f.fold([(54, 50), (56, 78)], .16, .04)
    f.poly([(43, 38), (53, 38), (52, 42), (44, 42)], sk, R=2, bias=-.05)
    f.line([(48, 42), (48, 47)], 'verde', .05)
    mao(f, CX + 21, 103, sk, .9, flip=True, edge=0.0)
    # feixe de trigo deitado no braço
    r = np.random.RandomState(6)
    for k in range(22):
        u = k / 21.0 - 0.5
        x0, y0 = 22 + u * 5, 116 + u * 8 + r.uniform(-3, 3)            # pé do feixe, cortado reto
        x1, y1 = 33 + u * 24, 50 + abs(u) * 9 + r.uniform(-3, 3)       # as espigas abrem em leque
        f.cap(x0, y0, 27 + u * 8, 90 + u * 2, 1.1, 1.1, 'palha', R=1, bias=-.12 + (k % 3) * .1)
        f.cap(27 + u * 8, 90 + u * 2, x1, y1, 1.1, .9, 'palha', R=1, bias=-.08 + (k % 3) * .1)
    for k in range(14):
        u = k / 13.0 - 0.5
        x1, y1 = 33 + u * 24, 50 + abs(u) * 9 + (k % 3) * 3
        f.ell(x1, y1 - 4, 2.1, 5, 'palha', R=1.6, bias=.12 + (k % 2) * .14, edge=.1)
        f.dk(x1, y1 - 7, -.15); f.dk(x1, y1 - 3, -.15)
    f.poly([(19, 90), (34, 88), (35, 93), (20, 95)], 'corda', R=1.5, shadow=.2, bias=-.05)
    mao(f, CX - 16, 95, sk, .95, edge=0.0)
    # trança: nasce atrás da cabeça e desce pelo ombro direito do observador
    pescoco(f, sk, 27, 38, 4.2)
    cabeca(f, sk, wide=-0.2, jaw=-0.6)
    hm = f.m_ell(CX, 12.5, 11.8, 11.5) & (f.Y < 12.5 + np.abs(f.X - CX) * 0.7) & ~f.m_ell(CX, 22, 8, 10)
    f.shape(hm, 'preto', R=4, edge=.1, tex=.08, bias=.1)
    rosto_f(f, sk, brow='preto')
    for k in range(9):
        y = 26 + k * 7; x = CX + 11 + (k % 2) * 1.2 + k * .3
        f.ell(x, y, 3.8 - k * .15, 4.4, 'preto', R=3, bias=.14, edge=.12, shadow=.1)
    f.poly([(CX + 11, 87), (CX + 17, 87), (CX + 16, 91), (CX + 12, 91)], 'rosa', R=1.5)
    return f


def mulher_velha():
    """velha curvada: xale cinza, coque branco, vestido escuro e cajado"""
    f = Fig(PW, PH, seed=67); sk = 'pele_v'
    pes(f, 189, mat='bota')
    saia(f, 'marrom', 84, 188, 20, 27, vincos=5, a=.2)
    # corcunda e xale: uma massa que vai do pescoço ao quadril, os ombros caídos
    x = f.m_poly([(38, 40), (58, 40), (72, 54), (76, 76), (72, 104), (48, 122), (24, 104), (20, 76), (24, 54)])
    f.shape(x, 'cinza_l', R=12, tex=.04, vgrad=.08, bias=.05)
    f.fold([(46, 46), (34, 80), (28, 100)], .22, .08); f.fold([(50, 46), (62, 80), (68, 100)], .26, .05); f.fold([(48, 56), (48, 118)], .16, .05)
    for k in range(25, 72, 4):
        yy = 104 + (1 - abs(k - 48) / 24.0) * 18
        f.cap(k, yy, k + (k - 48) * .05, yy + 7, .9, .7, 'cinza_l', R=1, bias=-.1)    # franja do xale
    # broche de madeira
    f.ell(48, 58, 3, 3, 'madeira', R=2, shadow=.2)
    # cajado à direita do observador, mão por fora do xale
    cabo(f, CX + 31, 188, CX + 28, 66, 1.9)
    f.ell(CX + 27.5, 64, 3.2, 3, 'madeira', R=2.5)
    sl = f.m_cap(CX + 22, 66, CX + 27, 86, 6, 5); f.soft(sl, .14); f.shape(sl, 'cinza_l', R=4, tex=.03)
    mao(f, CX + 28, 90, sk, 1.0, flip=True, edge=0.0); f.crease([(CX + 25, 88), (CX + 31, 88)], .14)
    # cabeça projetada para baixo, sobre o peito
    cabeca(f, sk, cy=32, wide=-0.8, jaw=-1.0)
    f.ell(CX, 13, 7, 6.5, 'branco', R=5, tex=.08, edge=.1, bias=.02)        # coque
    hm = f.m_ell(CX, 26.5, 11, 11.5) & (f.Y < 25.5 + np.abs(f.X - CX) * 0.8) & ~f.m_ell(CX, 36, 8, 10)
    f.shape(hm, 'branco', R=4, edge=.1, tex=.08, bias=-.02)
    for x0 in (41, 45, 51, 55): f.fold([(x0, 19), (CX + (x0 - CX) * 1.5, 26)], .14, .05)
    rosto_f(f, sk, cy=32, brow='branco', age=1.5, boca=False)
    for x in range(45, 52): f.dk(x, 41, -.15)
    return f


def padeira():
    """padeira robusta: vestido mostarda, avental branco enfarinhado, tabuleiro de pães nas mãos"""
    f = Fig(PW, PH, seed=68); sk = 'pele_r'
    pes(f, 189, mat='marrom')
    arms = [braco(f, -1, (20, 50), (26, 72), (21, 84), 8, 7, 6), braco(f, 1, (20, 50), (26, 72), (21, 84), 8, 7, 6)]
    t = (f.m_poly([(38, 37), (58, 37), (68, 41), (71, 54), (66, 84), (30, 84), (25, 54), (28, 41)]) | f.m_ell(CX, 66, 22, 18))
    f.shape(t | arms[0] | arms[1], 'mostarda', R=9, tex=.03, vgrad=.06)
    saia(f, 'mostarda', 82, 188, 22, 32, vincos=6)
    # decote redondo e fechado (séc. XII), com o linho da camisa aparecendo na gola
    f.poly([(43, 37), (53, 37), (52, 41), (44, 41)], sk, R=2, bias=-.1)
    f.line([(42, 37), (44, 42), (52, 42), (54, 37)], 'branco_p', .55)
    # avental de pano amarrado na cintura (sem peitilho nem alças), enfarinhado
    ap = f.m_poly([(28, 92), (68, 92), (71, 120), (72, 168), (24, 168), (25, 120)]); f.soft(ap, .14); f.shape(ap, 'branco_p', R=12, tex=.03, bias=-.05)
    faixa(f, 90, 26, 70, 'branco_p', 3.5); f.crease([(27, 94), (69, 94)], .1)
    for x0, x1 in ((38, 33), (47, 47), (58, 62)): f.fold([(x0, 110), (x1, 166)], .16, .05)
    f.smudge(40, 130, 8, 16, .08, 30); f.smudge(58, 145, 7, 10, .08, 18); f.smudge(46, 72, 8, 6, .06, 14)
    # mangas arregaçadas e o tabuleiro à frente do ventre
    tb = f.m_poly([(16, 84), (80, 84), (77, 92), (19, 92)]); f.soft(tb, .22, sigma=2, off=(1, 3)); f.shape(tb, 'madeira', R=3, tex=.02)
    for (x, y, rx) in ((26, 79, 9), (42, 78, 9.5), (58, 78, 9.5), (72, 79, 8)):
        f.ell(x, y, rx, 6.5, 'pao', R=5, tex=.02, edge=.12)
        for k in (-4, 0, 4): f.fold([(x + k - 1, y - 4), (x + k + 1, y - 1)], .2, .12)
    mao(f, 24, 93, sk, 1.05, edge=0.0); mao(f, 72, 93, sk, 1.05, flip=True, edge=0.0)
    pescoco(f, sk, 27, 37, 4.8)
    cabeca(f, sk, wide=0.8, jaw=0.6)
    rosto_f(f, sk, brow='loiro')
    for (x, y) in ((40, 23), (41, 23), (55, 23), (56, 23)): f.px(x, y, 'labio', .85)
    # lenço de linho branco amarrado na cabeça (no lugar da touca alta, que é de séculos depois),
    # com o nó no alto e mechas loiras saindo dos lados
    f.ell(CX - 10.5, 17, 2.6, 5, 'loiro', R=2, tex=.1); f.ell(CX + 10.5, 17, 2.6, 5, 'loiro', R=2, tex=.1)
    g = f.m_ell(CX, 11, 12.6, 10.4) & (f.Y < 11.5 + np.abs(f.X - CX) * .32)
    f.soft(g, .14); f.shape(g, 'branco_p', R=5, tex=.02)
    f.crease([(CX - 11, 13), (CX - 4, 10.5), (CX + 4, 10.5), (CX + 11, 13)], .12)
    f.fold([(CX - 6, 3), (CX - 2, 9)], .14, .06); f.fold([(CX + 7, 4), (CX + 4, 9)], .16, .04)
    nd = f.m_ell(CX + 3, 1.6, 4.2, 2) | f.m_cap(CX + 6, 1.5, CX + 10, -1, 1.6, 1)
    f.soft(nd, .12); f.shape(nd, 'branco_p', R=2, bias=.02)
    return f


def menino_a():
    """menino de cabelo castanho desgrenhado, túnica curta, pernas e pés de fora, espada de pau erguida"""
    f = Fig(PW, CH, seed=69); sk = 'pele_j'; G = CH - 3
    for sx in (-1, 1):
        f.cap(CX + sx * 7, 88, CX + sx * 8, 118, 4.6, 3.6, sk, R=3, edge=.12, tex=.02)
        f.ell(CX + sx * 9, G - 2, 5, 2.6, sk, R=2, bias=-.05)
    f.dk(CX - 8, 104, -.2); f.dk(CX - 7, 105, -.25); f.dk(CX + 6, 108, -.25)
    arms = [braco(f, -1, (14, 44), (17, 60), (17, 74), 5, 4.2, 3.6), braco(f, 1, (14, 44), (21, 54), (28, 40), 5, 4.2, 3.6)]
    tunica(f, 'ocre', arms, y0=35, ys=44, yw=66, yh=94, sh=15.5, wa=13.5, hem=17, R=6)
    f.fold([(42, 72), (39, 92)], .2, .08); f.fold([(55, 72), (58, 92)], .22, .08)
    faixa(f, 65, 34, 62, 'corda', 3)
    f.fold([(43, 37), (48, 44), (53, 37)], .26, .05); f.poly([(45, 37), (51, 37), (48, 43)], sk, R=2, bias=-.15)
    mao(f, CX - 17, 78, sk, .8, edge=0.0)
    # espada de pau: duas ripas amarradas
    cabo(f, CX + 29, 44, CX + 34, 2, 1.8, 'madeira')
    cabo(f, CX + 23, 31, CX + 37, 33, 1.5, 'madeira')
    f.line([(CX + 29, 31), (CX + 32, 34)], 'corda', .5)
    mao(f, CX + 29, 41, sk, .85, flip=True, edge=0.0)
    pescoco(f, sk, 27, 37, 4)
    cabeca(f, sk, wide=.2, jaw=-1.0)
    hm = (f.m_ell(CX, 12.5, 11.4, 11) & (f.Y < 10 + np.abs(f.X - CX) * 0.5))
    f.shape(hm, 'castanho', R=4, edge=.1, tex=.14, bias=.15)
    for (x, y, a) in ((38, 6, -1), (43, 2, -1), (48, 1, 0), (54, 2, 1), (58, 6, 1)):
        f.cap(x, y + 4, x + a * 2.5, y - 1, 2.6, .8, 'castanho', R=2, bias=.15, tex=.1)
    for x in (42, 46, 50, 54): f.cap(x, 9, x + 1, 14, 2, .8, 'castanho', R=1.5, bias=.1)
    rosto_c(f, sk)
    sardas(f, n=7, amt=-.16)
    return f


def menino_b():
    """menino menor, moreno, cabelo preto cortado em cuia, calça e túnica azul, bola de pano no braço"""
    f = Fig(PW, CH, seed=70); sk = 'pele_m'; G = CH - 3
    pernas(f, 82, G, o=11.5, i=2, mat='marrom', bota='bota', cano=G - 10, sola=2)
    arms = [braco(f, -1, (13, 46), (16, 62), (15, 78), 4.8, 4, 3.4), braco(f, 1, (13, 46), (17, 62), (10, 70), 4.8, 4, 3.4)]
    tunica(f, 'azul', arms, y0=36, ys=46, yw=68, yh=90, sh=14.5, wa=13, hem=15, R=6)
    faixa(f, 68, 35, 61, 'cinto', 2.5)
    f.fold([(43, 38), (48, 45), (53, 38)], .26, .05); f.poly([(45, 38), (51, 38), (48, 44)], sk, R=2, bias=-.15)
    mao(f, CX - 15, 82, sk, .8, edge=0.0)
    bl = f.m_ell(CX + 13, 72, 10, 10); f.soft(bl, .16); f.shape(bl, 'linho', R=8, tex=.03, bias=.05)
    f.fold([(CX + 5, 70), (CX + 13, 66), (CX + 21, 72)], .2, .08); f.fold([(CX + 13, 62), (CX + 10, 72), (CX + 14, 82)], .2, .08)
    mao(f, CX + 7, 72, sk, .8, flip=True, edge=0.0)
    pescoco(f, sk, 27, 38, 4)
    cabeca(f, sk, wide=.4, jaw=-.6)
    hm = f.m_ell(CX, 13, 12.2, 11.5) & (f.Y < 15) | (f.m_ell(CX, 13, 12.2, 13) & (np.abs(f.X - CX) > 8.5) & (f.Y < 21))
    f.shape(hm, 'preto', R=4, edge=.1, tex=.08, bias=.14)
    rosto_c(f, sk, brow='preto')
    return f


def menina():
    """menina de tranças loiras, vestido rosa gasto com avental e flores na mão"""
    f = Fig(PW, CH, seed=71); sk = 'pele_c'; G = CH - 3
    pes(f, CH, xs=(41, 55), mat='marrom')
    arms = [braco(f, -1, (13, 45), (15, 60), (14, 74), 4.6, 3.8, 3.2), braco(f, 1, (13, 45), (17, 58), (21, 48), 4.6, 3.8, 3.2)]
    tunica(f, 'rosa', arms, y0=36, ys=45, yw=62, yh=70, sh=14, wa=11, hem=13, R=6)
    saia(f, 'rosa', 60, G + 1, 12, 21, vincos=5, a=.22)
    ap = f.m_poly([(38, 64), (58, 64), (61, 104), (35, 104)]); f.soft(ap, .1); f.shape(ap, 'linho_c', R=8, tex=.03, bias=.03)
    f.fold([(43, 70), (42, 102)], .14); f.fold([(53, 70), (55, 102)], .16)
    faixa(f, 61, 36, 60, 'linho_c', 3)
    f.poly([(43, 37), (53, 37), (52, 43), (44, 43)], sk, R=2, bias=-.1)
    mao(f, CX - 14, 78, sk, .75, edge=0.0)
    # ramalhete
    for (x, y, c) in ((CX + 23, 34, 'azul_c'), (CX + 28, 38, 'palha'), (CX + 19, 39, 'rosa'), (CX + 25, 41, 'branco_p')):
        f.cap(CX + 22, 50, x, y, .6, .6, 'folha', R=1, bias=.3)
    for (x, y, c) in ((CX + 23, 33, 'azul_c'), (CX + 29, 37, 'palha'), (CX + 18, 38, 'rosa'), (CX + 25, 40, 'branco_p')):
        f.ell(x, y, 2.6, 2.4, c, R=2, bias=.3)
    mao(f, CX + 21, 49, sk, .75, flip=True, edge=0.0)
    pescoco(f, sk, 27, 37, 3.8)
    cabeca(f, sk, wide=0, jaw=-1.2)
    hm = f.m_ell(CX, 12.5, 11.6, 11.2) & (f.Y < 11 + np.abs(f.X - CX) * 0.75) & ~f.m_ell(CX, 22, 8, 10)
    f.shape(hm, 'loiro', R=4, edge=.1, tex=.08, bias=.05)
    f.line([(CX, 3), (CX, 11)], 'loiro', .25)
    rosto_c(f, sk)
    for x in range(CX - 1, CX + 2): f.px(x, 27, 'labio', .6)
    sardas(f, n=6, amt=-.12, seed=5)
    for sx in (-1, 1):      # tranças curtas com laço
        for k in range(5):
            f.ell(CX + sx * (12 + k * .5), 22 + k * 6, 3.2 - k * .12, 3.8, 'loiro', R=2.5, edge=.12, shadow=.1)
        f.poly([(CX + sx * 11, 50), (CX + sx * 18, 50), (CX + sx * 17, 53), (CX + sx * 12, 53)], 'azul_c', R=1.5)
    return f


def soldado_lanca():
    """soldado jovem: elmo de ferro redondo com nasal sobre a coifa de malha, loriga de malha até a coxa sobre o
    gibão acolchoado, faixas nas pernas e lança com a flâmula do senhor (vinho e ouro).
    (O chapéu de ferro de aba e o tabardo são de depois: o soldado a pé do séc. XII anda de loriga e elmo de nasal.)"""
    f = Fig(PW, PH, seed=72); sk = 'pele'
    pernas(f, 104, 189, o=13, i=3, mat='calca', bota='bota', cano=178)
    faixas_perna(f, 140, 180, 13, 3, 'linho')
    gb = f.m_poly([(CX - 21, 118), (CX + 21, 118), (CX + 23, 138), (CX - 23, 138)]); f.shape(gb, 'gambeson', R=5, tex=.03)
    for x in range(CX - 20, CX + 21, 5): f.fold([(x, 130), (x + (x - CX) * .08, 137)], .16, .06, clip=gb)
    arms = [braco(f, -1, (19, 47), (22, 72), (22, 96), 7, 6, 5), braco(f, 1, (19, 47), (24, 70), (27, 88), 7, 6, 5)]
    t = tunica(f, 'malha', arms, y0=35, ys=50, yw=84, yh=130, sh=23, wa=17, hem=22, R=7, vgrad=.05)
    gm = f.m_mat('malha')
    # elos da malha: pontos alternados
    for y in range(40, 130, 3):
        for x in range(20 + (y // 3 % 2) * 2, 78, 4):
            if gm[y, x]: f.dk(x, y, -.2); f.dk(x + 1, y, .14)
    axila(f, 14.5, 50, .14)
    f.crease([(CX, 110), (CX, 130)], .22)                                      # fenda da loriga
    for x0, x1 in ((38, 33), (58, 63)): f.crease([(x0, 92), (x1, 128)], .12)
    faixa(f, 84, 30, 66)
    f.poly([(45, 83), (51, 83), (51, 89), (45, 89)], 'ferro', R=2, bias=.1)
    # lança com a flâmula do senhor
    cabo(f, CX + 29, 188, CX + 29, 18, 1.7)
    f.poly([(CX + 29, 0), (CX + 33, 10), (CX + 31, 19), (CX + 27, 19), (CX + 25, 10)], 'aco', R=3)
    f.poly([(CX + 27, 19), (CX + 31, 19), (CX + 31, 24), (CX + 27, 24)], 'ferro', R=1.5)
    fl = f.m_poly([(CX + 31, 25), (CX + 47, 29), (CX + 40, 32), (CX + 46, 36), (CX + 31, 39)])
    f.soft(fl, .14); f.shape(fl, 'vinho', R=4, tex=.03, bias=.05)
    f.shape(fl & (np.abs(f.Y - 32) < 1.6), 'mostarda', R=2)
    f.fold([(CX + 36, 27), (CX + 37, 37)], .16, .08)
    mao(f, CX + 28, 92, sk, 1.05, flip=True, edge=0.0); f.crease([(CX + 25, 90), (CX + 31, 90)], .12)
    mao(f, CX - 22, 101, sk, 1, edge=0.0)
    pescoco(f, sk, 27, 37, 5)
    cabeca(f, sk, jaw=.3)
    rosto(f, sk, brow='castanho', stern=.5)
    # coifa de malha em volta do rosto, elmo redondo com aro rebitado e nasal por cima
    cf = (f.m_ell(CX, 18, 13, 18) | f.m_poly([(CX - 15, 30), (CX + 15, 30), (CX + 20, 42), (CX - 20, 42)])) & ~(f.m_ell(CX, 20, 9, 12.5))
    f.shape(cf, 'malha', R=4, edge=.1, bias=.02)
    for y in range(8, 44, 3):
        for x in range(26 + (y // 3 % 2) * 2, 72, 4):
            if cf[y, x]: f.dk(x, y, -.2); f.dk(x + 1, y, .14)
    h = f.m_ell(CX, 12, 12.6, 12) & (f.Y < 13); f.soft(h, .2, off=(0, 2)); f.shape(h, 'ferro', R=8, bias=.02)
    f.fold([(CX, 1), (CX, 11)], .12, .12)
    f.poly([(CX - 13, 10.5), (CX + 13, 10.5), (CX + 13, 13.5), (CX - 13, 13.5)], 'ferro', R=1.5, bias=-.05)
    for x in (CX - 10, CX - 5, CX + 5, CX + 10): f.px(x, 12, 'ferro', .95)
    f.poly([(CX - 1.5, 12), (CX + 1.5, 12), (CX + 1.5, 24), (CX - 1.5, 24)], 'ferro', R=1.5, bias=.05)
    return f


def soldado_escudo():
    """soldado veterano: elmo cônico com nasal, bigode, gibão acolchoado e escudo do senhor"""
    f = Fig(PW, PH, seed=73); sk = 'pele_r'
    # (o tabardo e as botas de cano são de depois): calças, faixas de lã nas canelas e sapatos baixos
    pernas(f, 104, 189, o=15, i=3, mat='calca', bota='bota', cano=178)
    faixas_perna(f, 138, 180, 15, 3, 'cinza_l')
    arms = [braco(f, -1, (22, 48), (26, 70), (22, 88), 8, 7, 6), braco(f, 1, (22, 48), (26, 72), (26, 98), 8, 7, 6)]
    t = tunica(f, 'gambeson', arms, y0=35, ys=50, yw=84, yh=130, sh=26, wa=20, hem=24, R=8, vgrad=.06)
    gm = f.m_mat('gambeson')
    for x in range(26, 72, 5): f.fold([(x, 44), (x + (x - 48) * .08, 130)], .16, .08, clip=gm & t)
    axila(f, 17, 50, .14)
    for y in range(52, 100, 7): f.fold([(CX + 18, y), (CX + 34, y)], .1, 0, clip=gm & arms[1] & ~t)
    for y in range(50, 130, 8): f.fold([(26, y), (70, y)], .08, 0, clip=gm & t)
    faixa(f, 84, 27, 69)
    # espada à cinta
    sc = f.m_poly([(64, 87), (68, 87), (74, 142), (71, 143)]); f.soft(sc, .15); f.shape(sc, 'cinto', R=2)
    f.poly([(70, 140), (74, 139), (75, 145), (72, 146)], 'ferro', R=1.5)
    f.poly([(58, 86), (72, 84), (72, 87), (58, 89)], 'lamina', R=1.5)
    mao(f, CX + 26, 103, sk, 1.15, flip=True, edge=0.0)
    # escudo normando (em gota, alto) no braço esquerdo do soldado (à esquerda da imagem), vinho com faixa dourada
    sd = f.m_poly([(5, 60), (12, 53), (22, 50), (30, 49.5), (38, 50), (48, 53), (55, 60), (54, 92), (48, 118), (30, 152), (12, 118), (6, 92)])
    f.soft(sd, .2, sigma=2, off=(2, 3)); f.shape(sd, 'vinho', R=16, tex=.03, bias=.06)
    f.shape(sd & (np.abs(f.X - 30) < 4), 'mostarda', R=16, bias=.0)
    f.shape(sd & (np.abs(f.Y - 78) < 4), 'mostarda', R=16, bias=.0)
    bd = sd & ndimage.binary_dilation(ndimage.binary_dilation(~sd)); f.shape(bd, 'madeira', flat=.5)
    f.ell(30, 78, 5, 5, 'ferro', R=4, shadow=.2)
    f.fold([(40, 70), (42, 100)], .12, 0, clip=sd); f.smudge(38, 104, 8, 8, .14, 20, clip=sd); f.fold([(14, 62), (22, 74)], .2, .1, clip=sd)
    pescoco(f, sk, 27, 37, 6.5)
    cabeca(f, sk, wide=.8, jaw=.8)
    rosto(f, sk, brow='bigode', stern=1, age=.8)
    mm = f.m_poly([(43, 24.6), (53, 24.6), (56, 27), (57, 33), (54.5, 32), (52, 27.6), (44, 27.6), (41.5, 32), (39, 33), (40, 27)])
    f.shape(mm, 'bigode', R=2, edge=.05, shadow=.15)
    # cicatriz na bochecha
    f.line([(55, 15), (53, 21)], sk, .28)
    # aventail de malha e elmo cônico com nasal
    av = f.m_poly([(CX - 12, 22), (CX - 10, 34), (CX, 39), (CX + 10, 34), (CX + 12, 22), (CX + 15, 26), (CX + 19, 42), (CX - 19, 42), (CX - 15, 26)])
    f.shape(av, 'malha', R=4, edge=.1, shadow=.1)
    for y in range(22, 43, 3):
        for x in range(28 + (y // 3 % 2) * 2, 70, 4):
            if av[y, x]: f.dk(x, y, -.2); f.dk(x + 1, y, .14)
    h = f.m_poly([(CX - 11.5, 13), (CX - 9, 7), (CX, 0), (CX + 9, 7), (CX + 11.5, 13)]); f.soft(h, .2, off=(0, 2)); f.shape(h, 'ferro', R=8, bias=.02)
    f.poly([(CX - 12, 11), (CX + 12, 11), (CX + 12, 14), (CX - 12, 14)], 'ferro', R=1.5, bias=-.05)
    f.poly([(CX - 1.5, 12), (CX + 1.5, 12), (CX + 1.5, 24), (CX - 1.5, 24)], 'ferro', R=1.5, bias=.05)
    return f


def rapaz():
    """rapaz desengonçado: cabelo na testa, braços compridos, túnica larga e trouxa no pau, 96x176"""
    f = Fig(PW, TH, seed=74); sk = 'pele_j'; G = TH - 3
    pernas(f, 96, G, o=10, i=3, mat='gambeson', bota='marrom', cano=G - 12)
    arms = [braco(f, -1, (15, 46), (18, 70), (19, 96), 5, 4.2, 3.6), braco(f, 1, (15, 46), (25, 58), (24, 36), 5, 4.2, 3.6)]
    tunica(f, 'musgo_t', arms, y0=35, ys=46, yw=78, yh=112, sh=16.5, wa=15, hem=17, R=6)
    for x0, x1 in ((41, 38), (47, 47), (56, 59)): f.fold([(x0, 84), (x1, 110)], .2, .08)
    faixa(f, 78, 33, 63, 'corda', 2.5)
    f.fold([(43, 37), (48, 44), (53, 37)], .26, .05); f.poly([(45, 37), (51, 37), (48, 43)], sk, R=2, bias=-.15)
    mao(f, CX - 19, 101, sk, .95, edge=0.0)
    # pau no ombro com a trouxa pendurada atrás
    bd = f.m_ell(CX + 35, 45, 11, 12); f.shape(bd, 'linho', R=8, tex=.04, bias=.05)
    f.fold([(CX + 28, 42), (CX + 36, 46), (CX + 44, 40)], .2, .08); f.fold([(CX + 35, 34), (CX + 33, 46), (CX + 38, 56)], .18, .06)
    f.poly([(CX + 32, 30), (CX + 38, 30), (CX + 37, 35), (CX + 33, 35)], 'linho', R=2, bias=-.05)
    cabo(f, CX + 13, 41, CX + 37, 29, 1.6)
    mao(f, CX + 23, 35, sk, .95, flip=True, edge=0.0)
    pescoco(f, sk, 27, 37, 4)
    cabeca(f, sk, wide=-.6, jaw=-.2)
    rosto(f, sk, brow='preto')
    for (x, y) in ((42, 25), (55, 22), (52, 19)): f.px(x, y, 'labio', .6)         # espinhas
    # cabelo comprido caindo em franja sobre os olhos e dos dois lados
    hm = (f.m_ell(CX, 12.5, 11.8, 11.2) & (f.Y < 16)) | f.m_poly([(CX - 11.5, 10), (CX - 8, 10), (CX - 8.5, 26), (CX - 12, 28)]) | f.m_poly([(CX + 11.5, 10), (CX + 8, 10), (CX + 8.5, 26), (CX + 12, 28)])
    f.shape(hm, 'preto', R=4, edge=.1, tex=.1, bias=.2)
    for (x, l) in ((41, 2), (44, 1), (49, 1), (52, 2), (55, 1)): f.cap(x, 13, x + 1, 15 + l, 1.4, .7, 'preto', R=1, bias=.2)
    return f


def filha_senhor():
    """filha do senhor, 96x176: ruiva como o pai, vestido esmeralda justo, tiara e cinto dourados"""
    f = Fig(PW, TH, seed=75); sk = 'pele_c'; G = TH - 3
    # cabelo comprido atrás de tudo
    hb = f.m_poly([(CX - 12, 12), (CX + 12, 12), (CX + 16, 40), (CX + 15, 72), (CX + 9, 78), (CX, 72), (CX - 9, 78), (CX - 15, 72), (CX - 16, 40)])
    f.shape(hb, 'ruivo', R=6, tex=.08, vgrad=.15)
    pes(f, G + 1, xs=(41, 55), mat='couro_v')
    arms = [braco(f, -1, (14, 46), (17, 68), (9, 80), 5, 4.2, 3.6), braco(f, 1, (14, 46), (17, 68), (9, 80), 5, 4.2, 3.6)]
    tunica(f, 'esmeralda', arms, y0=37, ys=47, yw=72, yh=84, sh=15.5, wa=10.5, hem=14, R=6)
    saia(f, 'esmeralda', 74, G, 12, 25, vincos=6, a=.26)
    axila(f, 11, 47, .12)
    # bainha e gola bordadas a ouro
    hem = f.m_poly([(CX - 25, G - 11), (CX + 25, G - 11), (CX + 26, G - 7), (CX - 26, G - 7)])
    f.shape(hem, 'latao', R=2, bias=.02)
    for x in range(CX - 24, CX + 25, 4): f.dk(x, G - 9, -.25)
    f.poly([(41, 38), (55, 38), (54, 44), (42, 44)], sk, R=3, bias=-.05)
    f.line([(40, 38), (42, 45), (54, 45), (56, 38)], 'latao', .6)
    # cinto dourado com ponta caída
    b = faixa(f, 72, 36, 60, 'latao', 2.5)
    f.cap(48, 75, 48, 112, 1, .8, 'latao', R=1, shadow=.2); f.ell(48, 113, 1.8, 2.2, 'latao', R=1.5)
    # mangas compridas pendentes, mãos juntas à frente
    for sx in (-1, 1):
        cf = f.m_poly([(CX + sx * 6, 76), (CX + sx * 20, 72), (CX + sx * 25, 102), (CX + sx * 18, 106), (CX + sx * 13, 90)])
        f.soft(cf, .12); f.shape(cf, 'esmeralda', R=5, tex=.03, bias=.02)
        f.fold([(CX + sx * 16, 78), (CX + sx * 20, 100)], .2, .06)
    mao(f, CX - 4, 82, sk, .85, edge=0.0); mao(f, CX + 4, 82, sk, .85, flip=True, edge=0.0)
    pescoco(f, sk, 27, 38, 3.8)
    cabeca(f, sk, wide=-.5, jaw=-1.0)
    hm = f.m_ell(CX, 12.5, 11.4, 11) & (f.Y < 10 + np.abs(f.X - CX) * 0.95) & ~f.m_ell(CX, 22, 7.8, 10.5)
    f.shape(hm, 'ruivo', R=4, edge=.1, tex=.08, bias=.08)
    f.line([(CX, 3), (CX - 1, 10)], 'ruivo', .25)
    for sx in (-1, 1): f.shape(f.m_poly([(CX + sx * 8, 14), (CX + sx * 12, 14), (CX + sx * 13, 42), (CX + sx * 9.5, 40)]), 'ruivo', R=3, tex=.08, edge=.1, bias=.04)
    rosto_f(f, sk, brow='ruivo')
    sardas(f, n=8, amt=-.14, seed=9)
    # tiara fina
    f.line([(CX - 11, 8), (CX - 5, 6), (CX, 5), (CX + 5, 6), (CX + 11, 8)], 'latao', .85)
    f.px(CX, 4, 'latao', 1.0); f.px(CX, 6, 'vinho', .8)
    return f


def senhor():
    """o senhor da vila: alto, ruivo de barba cheia, capa com gola de pele, sobreveste vinho e corrente de ouro"""
    f = Fig(PW, PH, seed=76); sk = 'pele_c'
    # capa atrás do corpo: abre a silhueta até a canela
    cp = f.m_poly([(26, 38), (70, 38), (80, 70), (85, 124), (84, 170), (66, 174), (30, 174), (12, 170), (11, 124), (16, 70)])
    f.shape(cp, 'tabardo', R=10, tex=.03, vgrad=.14, bias=-.08)
    for x0, x1 in ((20, 16), (76, 80)): f.fold([(x0, 88), (x1, 168)], .24, .08)
    # (as botas altas de cano com galão eram de depois): calças escuras com tiras cruzadas douradas e sapatos baixos
    pernas(f, 124, 189, o=13, i=3, mat='calca', bota='couro_v', cano=178)
    for sx in (-1, 1):
        for y in range(146, 178, 8):
            f.line([(CX + sx * 3.5, y + 6), (CX + sx * 14, y)], 'latao', .55)
            f.line([(CX + sx * 3.5, y), (CX + sx * 14, y + 6)], 'latao', .35)
    arms = [braco(f, -1, (22, 48), (25, 72), (15, 86), 8, 7, 5.5), braco(f, 1, (22, 48), (26, 72), (26, 96), 8, 7, 5.5)]
    t = tunica(f, 'vinho', arms, y0=35, ys=50, yw=84, yh=142, sh=26, wa=19, hem=27, R=8, vgrad=.08)
    axila(f, 17, 50, .15)
    for x0, x1 in ((38, 30), (46, 44), (53, 54), (60, 66)): f.fold([(x0, 92), (x1, 140)], .22, .08)
    hb = f.m_poly([(CX - 27, 137), (CX + 27, 137), (CX + 27, 142), (CX - 27, 142)]); f.shape(hb, 'latao', R=2)
    for x in range(CX - 26, CX + 27, 4): f.dk(x, 139, -.25)
    # galão bordado só na fenda da gola (a faixa de botões do peito até a barra é de séculos depois)
    f.poly([(46, 44), (50, 44), (50, 66), (48, 69), (46, 66)], 'latao', R=1.5, bias=-.04)
    f.crease([(48, 46), (48, 64)], .18)
    # cinto largo com fivela, punhal
    faixa(f, 84, 28, 68, 'cinto', 5)
    f.poly([(43, 82), (53, 82), (53, 91), (43, 91)], 'latao', R=2.5, bias=.05); f.poly([(46, 84.5), (50, 84.5), (50, 88.5), (46, 88.5)], 'cinto', flat=0)
    # (a corrente com medalhão é insígnia de séculos depois): broche redondo de ouro fechando a fenda da gola
    f.ell(48, 54, 4.2, 4.2, 'latao', R=3.5, shadow=.25); f.ell(48, 54, 2.2, 2.2, 'vinho', R=2, bias=.2)
    f.line([(45, 57), (51, 51)], 'latao', .9)
    # mão no cinto e mão pendente
    mao(f, CX - 13, 88, sk, 1.1, edge=0.0)
    mao(f, CX + 26, 101, sk, 1.1, flip=True, edge=0.0)
    f.px(CX + 26, 103, 'latao', .9); f.px(CX + 27, 103, 'latao', .6)      # anel
    # gola de pele sobre os ombros, presa por dois broches
    gp = f.m_poly([(32, 34), (64, 34), (76, 42), (75, 52), (62, 50), (54, 45), (42, 45), (34, 50), (21, 52), (20, 42)])
    f.soft(gp, .16); f.shape(gp, 'arminho', R=5, tex=.1, grain=2)
    f.ell(30, 49, 2.6, 2.6, 'latao', R=2); f.ell(66, 49, 2.6, 2.6, 'latao', R=2)
    pescoco(f, sk, 27, 37, 6)
    cabeca(f, sk, wide=.8, jaw=.8)
    hm = (f.m_ell(CX, 13.5, 12.2, 11.5) & (f.Y < 12.5 + np.abs(f.X - CX) * .4) & ~f.m_ell(CX, 22, 8, 9.5)) | f.m_poly([(CX - 13, 10), (CX - 10.4, 10), (CX - 10.4, 26), (CX - 14, 31)]) | f.m_poly([(CX + 13, 10), (CX + 10.4, 10), (CX + 10.4, 26), (CX + 14, 31)])
    f.shape(hm, 'ruivo', R=3, edge=.1, tex=.1, bias=.08)
    rosto(f, sk, brow='ruivo', stern=1, age=.5)
    b = barba_cheia(f, 'ruivo', 18, 40, 9.8, bias=.02)
    for x in range(45, 52): f.px(x, 27, 'ruivo', 0.0)
    for x in range(46, 51): f.px(x, 28, 'labio', .55)
    for x0 in (43, 48, 53): f.fold([(x0, 30), (x0, 38)], .14, .08)
    return f


def intendente():
    """intendente do senhor: peito estufado, cintura apertada, túnica roxa justa de saia rodada com galões,
    calças amarelas, sapatos de bico (a moda dos 'pigaches', do fim do séc. XI), barrete frígio, mão na cintura.
    Quer parecer nobre: o ouro é latão e há remendo. (Antes tinha gibão de botões e mangas fendidas, calça de
    duas cores, gola engomada, corrente e chapéu de pluma: tudo de séculos depois.)"""
    f = Fig(PW, PH, seed=77); sk = 'pele_j'
    # pernas finas e sapatos de bico comprido, pés abertos
    for sx, m in ((-1, 'mostarda'), (1, 'mostarda')):
        f.poly([(CX + sx * 2, 104), (CX + sx * 13, 104), (CX + sx * 12, 140), (CX + sx * 11.5, 180), (CX + sx * 5, 180), (CX + sx * 3, 140)], m, R=5, edge=.12, tex=.02)
        f.poly([(CX + sx * 4.5, 177), (CX + sx * 12, 177), (CX + sx * 16, 184), (CX + sx * 27, 186), (CX + sx * 29, 183), (CX + sx * 28, 188.5), (CX + sx * 4, 189)], 'couro_v', R=3, edge=.15, shadow=.12)
    # gibão: peito largo e alto, cintura de vespa, saiote rodado
    armL = braco(f, -1, (20, 46), (32, 70), (15, 84), 7, 5.5, 4.5)       # mão na cintura: cotovelo aberto
    armR = braco(f, 1, (20, 46), (23, 70), (25, 94), 7, 6, 4.8)
    torso = f.m_poly([(38, 34), (58, 34), (70, 38), (72, 50), (66, 66), (58, 84), (38, 84), (30, 66), (24, 50), (26, 38)]) | f.m_ell(CX, 54, 21, 18)
    f.shape(torso | armL | armR, 'roxo', R=8, tex=.03, vgrad=.06)
    f.adj(f.m_ell(40, 50, 9, 10) & f.m_mat('roxo'), .1)
    # saia da túnica, rodada e comprida até o meio da canela, com galão amarelo na barra
    sk_ = f.m_poly([(37, 84), (59, 84), (68, 110), (72, 136), (60, 139), (48, 137), (36, 139), (24, 136), (28, 110)])
    f.soft(sk_, .1); f.shape(sk_, 'roxo', R=9, tex=.03)
    for x0, x1 in ((41, 32), (48, 48), (55, 64)): f.fold([(x0, 88), (x1, 136)], .24, .08)
    gal = sk_ & (f.Y > 131 + np.abs(f.X - CX) * .06) & (f.Y < 135.5 + np.abs(f.X - CX) * .06)
    f.shape(gal, 'mostarda', R=2, bias=.02)
    for x in range(26, 71, 4): f.dk(x, 133 + abs(x - CX) * .06, -.22)
    # cinto de latão com a ponta comprida caída (a moda que ele copia dos nobres)
    faixa(f, 81, 36, 60, 'latao', 2.5); f.poly([(45, 80), (51, 80), (51, 85.5), (45, 85.5)], 'latao', R=2, bias=-.12)
    f.cap(49, 85, 50, 118, 1, .8, 'latao', R=1, shadow=.2); f.ell(50, 119, 1.8, 2.2, 'latao', R=1.5)
    # galões nos punhos
    f.poly([(CX + 20, 89), (CX + 30, 89), (CX + 30, 92), (CX + 20, 92)], 'mostarda', R=1.5)
    f.poly([(CX - 20, 80), (CX - 11, 81), (CX - 11, 84), (CX - 20, 83)], 'mostarda', R=1.5)
    # remendo discreto no cotovelo
    f.poly([(CX - 36, 66), (CX - 29, 65), (CX - 28, 73), (CX - 35, 74)], 'tabardo', R=2, bias=.08)
    for (x, y) in ((CX - 35, 67), (CX - 29, 67), (CX - 34, 73), (CX - 29, 72)): f.dk(x, y, .25)
    mao(f, CX - 14, 86, sk, .95, edge=0.0)
    # rolo de pergaminho na mão
    rl = f.m_cap(CX + 21, 112, CX + 30, 86, 3.2, 3.2); f.soft(rl, .14); f.shape(rl, 'papel', R=3)
    f.line([(CX + 24, 101), (CX + 29, 103)], 'vinho', .5)
    mao(f, CX + 25, 98, sk, .95, flip=True, edge=0.0)
    # gola redonda com galão e broche de latão; pescoço esticado, queixo para cima: a cabeça e os olhos ficam altos
    cy = 17
    pescoco(f, sk, 26, 37, 4.6)
    f.poly([(43, 34), (53, 34), (52, 39), (44, 39)], sk, R=2, bias=-.12)
    gl = f.m_poly([(CX - 9, 33), (CX - 6, 39), (CX, 41), (CX + 6, 39), (CX + 9, 33), (CX + 7, 33), (CX + 4.5, 37.5), (CX, 39), (CX - 4.5, 37.5), (CX - 7, 33)])
    f.shape(gl, 'mostarda', R=2, bias=.05)
    f.ell(CX, 43, 2.6, 2.6, 'latao', R=2, shadow=.2); f.px(CX, 43, 'roxo', .4)
    cabeca(f, sk, cy=cy, wide=-.7, jaw=-.6)
    hm = (f.m_ell(CX, 12, 11, 10) & (f.Y < 11)) | f.m_ell(CX - 10, 16, 2.4, 6) | f.m_ell(CX + 10, 16, 2.4, 6)
    f.shape(hm, 'preto', R=3, edge=.1, tex=.06, bias=.15)
    rosto(f, sk, cy=cy, brow='preto')
    e = int(cy)
    for x in (CX - 7, CX + 7): f.px(x, e - 4, 'preto', .25)                 # sobrancelhas arqueadas
    for x in (CX - 6, CX - 5, CX + 5, CX + 6): f.px(x, e - 3, 'preto', .25)
    # bigodinho fino de pontas viradas e cavanhaque
    f.line([(42, e + 8), (44, e + 7), (47, e + 7)], 'preto', .15); f.line([(49, e + 7), (52, e + 7), (54, e + 8)], 'preto', .15)
    f.px(41, e + 7, 'preto', .15); f.px(55, e + 7, 'preto', .15)
    f.poly([(46, e + 11), (50, e + 11), (49, e + 16), (47, e + 16)], 'preto', R=1.5, bias=.1)
    # barrete frígio vinho, de ponta caída para a frente, com aba amarela e alfinete de latão
    hat = f.m_poly([(CX - 12.5, 10), (CX - 11, 2), (CX - 6, -1), (CX + 2, -2), (CX + 9, 0), (CX + 13, 4), (CX + 15, 9), (CX + 12, 8), (CX + 12.5, 10)])
    f.soft(hat, .18, off=(0, 2)); f.shape(hat, 'vinho', R=5, tex=.03)
    f.fold([(CX + 4, 0), (CX + 9, 4)], .2, .08)
    f.poly([(CX - 13.5, 8), (CX + 13.5, 8), (CX + 14, 12), (CX - 14, 12)], 'mostarda', R=2)
    f.px(CX + 5, 10, 'latao', 1.0); f.px(CX + 6, 10, 'latao', .7)
    return f


def alfaiate():
    """alfaiate: túnica de lã azul bem cortada, com galão na gola, nos punhos e na barra; capuz de ombreira
    com uma agulha espetada; cordão de medir com nós no pescoço; tesoura de mola na mão e pano dobrado no braço"""
    f = Fig(PW, PH, seed=78); sk = 'pele_c'
    pernas(f, 120, 189, o=12, i=3, mat='vinho', bota='bota', cano=176, sola=4)
    arms = [braco(f, -1, (19, 48), (24, 72), (15, 88), 7, 6, 5), braco(f, 1, (19, 48), (23, 74), (24, 98), 7, 6, 5)]
    t = tunica(f, 'azul', arms, y0=36, ys=50, yw=84, yh=138, sh=22, wa=17, hem=22)
    axila(f, 14, 50, .14)
    for x0, x1 in ((38, 32), (47, 47), (57, 63)): f.fold([(x0, 92), (x1, 136)], .2, .08)
    faixa(f, 134, CX - 22, CX + 22, 'mostarda', 3, 0)
    for x in range(CX - 21, CX + 22, 3): f.dk(x, 135, -.2)
    for sx, (x, y) in ((1, (CX + 24, 95)),): f.poly([(x - 5.5, y), (x + 5.5, y), (x + 5.5, y + 3), (x - 5.5, y + 3)], 'mostarda', R=1.5)   # punho
    faixa(f, 84, 31, 65, 'cinto', 3)
    bolsa = f.m_poly([(34, 86), (43, 86), (44, 98), (39, 101), (34, 98)]); f.soft(bolsa, .14); f.shape(bolsa, 'couro_v', R=3)
    f.crease([(34, 89), (43, 89)], .14)
    # pano dobrado no braço esquerdo (do observador), uma ponta caindo
    pn = f.m_poly([(CX - 34, 82), (CX - 8, 80), (CX - 7, 94), (CX - 33, 96)])
    f.soft(pn, .16); f.shape(pn, 'rosa', R=5, tex=.03)
    for y in (85, 89): f.fold([(CX - 33, y + 1), (CX - 8, y - 1)], .18, .1)
    ponta = f.m_poly([(CX - 34, 92), (CX - 26, 94), (CX - 27, 116), (CX - 31, 113), (CX - 35, 117)])
    f.soft(ponta, .12); f.shape(ponta, 'rosa', R=3, tex=.03, bias=-.04)
    f.fold([(CX - 30, 96), (CX - 31, 113)], .16, .06)
    f.poly([(CX - 21, 79), (CX - 10, 78), (CX - 10, 81), (CX - 21, 82)], 'mostarda', R=1.5, bias=-.05)    # punho
    mao(f, CX - 15, 88, sk, .95, edge=0.0)
    # tesoura de mola (duas lâminas unidas por um arco), pendendo da mão direita
    for dx in (-1.6, 1.6):
        f.poly([(CX + 24 + dx - 1.4, 106), (CX + 24 + dx + 1.4, 106), (CX + 24 + dx * 1.6 + .6, 128), (CX + 24 + dx * 1.6, 130)], 'aco', R=1.5, bias=.05 if dx < 0 else -.1)
    f.line([(CX + 24, 107), (CX + 24, 126)], 'ferro', .1)
    arco = f.m_ell(CX + 24, 101, 4.4, 5) & ~f.m_ell(CX + 24, 101, 2.4, 3)
    f.shape(arco, 'ferro', R=2, bias=.1)
    mao(f, CX + 24, 104, sk, 1.0, flip=True, edge=0.0); f.crease([(CX + 21, 102), (CX + 27, 102)], .12)
    # capuz caído com ombreira (cobre os ombros), agulha e linha espetadas
    cz = f.m_poly([(34, 34), (62, 34), (70, 42), (68, 56), (56, 60), (48, 58), (40, 60), (28, 56), (26, 42)])
    f.soft(cz, .14); f.shape(cz, 'vinho', R=6, tex=.03)
    f.fold([(38, 46), (36, 56)], .2, .08); f.fold([(60, 46), (62, 56)], .22, .05); f.fold([(48, 50), (48, 58)], .16, .05)
    f.line([(61, 45), (63, 50)], 'aco', .95); f.px(60, 45, 'linho_c', .7); f.px(59, 46, 'linho_c', .55)
    # gola com galão, fechada no pescoço
    f.crease([(43, 37), (48, 39), (53, 37)], .18)
    f.line([(42, 36), (44, 39), (48, 40), (52, 39), (54, 36)], 'mostarda', .6)
    # cordão de medir com nós, pendurado no pescoço
    for pts in ([(42, 40), (40, 58), (39, 76)], [(54, 40), (56, 58), (57, 72)]):
        f.line(pts, 'corda', .55)
        for x, y in f.pts(pts)[6::6]: f.ell(x, y, 1.2, 1.1, 'corda', R=1, bias=.1, shadow=.15)
    pescoco(f, sk, 27, 37, 5)
    cabeca(f, sk, wide=-.3, jaw=-.2)
    hm = (f.m_ell(CX, 13.5, 10.8, 10.5) & (f.Y < 12 + np.abs(f.X - CX) * .4)) | f.m_ell(CX - 9.6, 16.5, 2.2, 5) | f.m_ell(CX + 9.6, 16.5, 2.2, 5)
    f.shape(hm & (f.Y < 22), 'castanho', R=4, edge=.1, tex=.08, bias=.1)
    f.line([(CX - 4, 4), (CX - 6, 10)], 'castanho', .0)                                                   # risca
    for sx in (-1, 1): f.shape(f.m_ell(CX + sx * 9.8, 18, 1.8, 3.5), 'cinza', R=2, tex=.08)               # têmporas grisalhas
    rosto(f, sk, brow='castanho', age=.6)
    f.px(CX - 1, 30, sk, .55)
    return f


def vaca():
    """vaca malhada de lado (3/4), virada para a esquerda; quadro 240x152, 100 px por metro"""
    f = Fig(240, 152, seed=81); W = 'vaca_b'
    # pernas de trás (lado de lá), mais escuras
    f.poly([(70, 92), (88, 92), (86, 128), (84, 146), (72, 146), (73, 128)], W, R=5, bias=-.26)
    f.poly([(176, 92), (196, 92), (192, 118), (188, 146), (176, 146), (178, 118)], W, R=5, bias=-.26)
    for x in (78, 182): f.poly([(x - 7, 142), (x + 6, 142), (x + 7, 149), (x - 8, 149)], 'casco', R=2, bias=-.1)
    # rabo
    f.cap(219, 42, 228, 72, 2.6, 2, W, R=2, bias=-.08); f.cap(228, 72, 228, 104, 2, 1.8, W, R=2, bias=-.12)
    tl = f.m_ell(228, 114, 4.8, 13); f.shape(tl, 'vaca_m', R=3, tex=.1)
    # corpo, pescoço e as duas pernas de cá numa peça só: o volume corre sem emenda
    body = (f.m_ell(132, 68, 80, 37) | f.m_ell(192, 64, 31, 37) | f.m_ell(72, 70, 30, 36)
            | f.m_poly([(56, 40), (205, 34), (222, 48), (218, 92), (176, 104), (90, 104), (50, 96)])
            | f.m_poly([(32, 42), (66, 34), (80, 44), (76, 92), (58, 100), (44, 84), (34, 66)])
            | f.m_poly([(58, 88), (88, 88), (84, 118), (81, 130), (80, 146), (64, 146), (66, 128), (62, 116)])
            | f.m_poly([(184, 72), (218, 72), (217, 100), (206, 116), (205, 146), (189, 146), (192, 118), (182, 104)]))
    f.shape(body, W, R=22, tex=.03, vgrad=.1)
    # malhas castanhas: trocam só a cor, o volume fica
    mid = f.mid('vaca_m')
    mal = [f.m_ell(146, 54, 32, 21) | f.m_ell(120, 66, 20, 18) | f.m_ell(172, 44, 15, 12),
           f.m_ell(204, 58, 19, 24) | f.m_ell(196, 84, 15, 12),
           f.m_ell(78, 58, 24, 20) | f.m_ell(72, 84, 10, 10)]
    r = np.random.RandomState(4)
    for m in mal:
        bord = ndimage.binary_dilation(ndimage.binary_dilation(m)) & (r.uniform(size=m.shape) < .3)
        f.mat[(m | bord) & body] = mid
    # úbere rosado sob a barriga, na frente da perna de trás
    ub = f.m_ell(160, 106, 19, 13); f.soft(ub, .1); f.shape(ub, 'focinho', R=9, edge=.12)
    for x in (150, 160, 170): f.cap(x, 115, x, 122, 2.2, 1.6, 'focinho', R=1.5, bias=-.05)
    # anca, costelas, juntas das pernas e barbela
    f.crease([(196, 36), (203, 46), (205, 60)], .1); f.crease([(160, 92), (176, 66), (186, 42)], .12)
    for x0 in (96, 110, 124): f.crease([(x0, 58), (x0 + 4, 76)], .06)
    f.crease([(87, 90), (86, 112)], .16); f.crease([(182, 96), (191, 118)], .16); f.crease([(46, 70), (54, 92)], .1)
    f.adj(f.m_ell(120, 42, 70, 8), .05)
    for x in (72, 197):
        f.poly([(x - 9, 141), (x + 8, 141), (x + 9, 150), (x - 10, 150)], 'casco', R=2.5, edge=.1)
        f.crease([(x - 8, 128), (x + 7, 128)], .1)
    # cabeça
    f.cap(27, 28, 16, 17, 3, 2, 'chifre', R=2, bias=-.1)                    # chifre de lá
    f.ell(44, 30, 11, 5.5, W, R=4, bias=-.14)                               # orelha de lá
    hd = f.m_poly([(16, 26), (32, 22), (44, 30), (42, 52), (32, 72), (20, 82), (6, 80), (3, 66), (8, 44)])
    f.shape(hd, W, R=11, tex=.02, edge=.06)
    f.mat[f.m_poly([(24, 22), (46, 28), (44, 50), (30, 58), (22, 42)]) & hd] = mid
    f.cap(34, 26, 46, 11, 3.4, 1.8, 'chifre', R=2.2, edge=.1)               # chifre de cá
    f.px(46, 11, 'casco', .3); f.px(45, 12, 'casco', .4)
    f.ell(50, 38, 11, 5.5, W, R=4, edge=.1, bias=-.02)                      # orelha
    f.ell(50, 39, 7, 2.8, 'focinho', R=2, bias=-.08)
    mz = f.m_ell(14, 73, 12, 10.5); f.shape(mz, 'focinho', R=7, edge=.05)   # focinho
    f.ell(8, 70, 2, 2.6, 'casco', flat=.15); f.ell(17, 70, 1.7, 2.2, 'casco', flat=.2)
    f.line([(4, 78), (10, 81), (22, 80)], 'casco', .3)
    # olho
    f.ell(25, 44, 4.6, 3.8, 'casco', flat=.15); f.ell(25, 44, 3, 2.8, 'olho', flat=0)
    f.px(24, 43, 'olho', .95); f.px(23, 43, 'olho', .6)
    for x in range(21, 29): f.dk(x, 40, -.16)
    return f


# ---------------- bichos e recursos ----------------
def coelho():
    """coelho-bravo pardo, de lado (3/4), virado para a esquerda; quadro 96x64"""
    f = Fig(96, 64, seed=51)
    f.cap(36, 21, 47, 5, 3.2, 2.6, 'pelo', R=2, bias=-0.25)                     # orelha de trás
    f.ell(66, 60.5, 13, 2.6, 'pelo', R=2, bias=-0.2)                              # pata traseira
    f.ell(54, 43, 22, 15, 'pelo', R=12, tex=0.08, grain=1)                        # corpo
    f.ell(66, 45, 14, 14, 'pelo', R=11, tex=0.08, edge=0.1)                       # coxa
    f.fold([(57, 36), (60, 47), (66, 56)], .16, .1)
    f.ell(80, 42, 3.5, 4, 'pelo_c', R=3, bias=0.05)                               # rabo branco
    f.ell(37, 46, 10, 11, 'pelo', R=8, tex=0.08)                                  # peito
    f.adj(f.m_ell(54, 56, 18, 4) & f.m_mat('pelo'), -0.15)
    f.ell(40, 52, 6.5, 6, 'pelo_c', R=5, bias=-0.15, edge=0.1)                    # barriga clara
    for x in (34, 39):                                                            # patas dianteiras
        f.cap(x, 50, x - 1, 59, 2.6, 2.2, 'pelo', R=2, edge=0.18, bias=-0.06 * (x - 34))
        f.ell(x - 2.5, 60.5, 3.4, 1.6, 'pelo', R=1.5, bias=0.1)
    f.ell(26, 31, 11, 9, 'pelo', R=7, tex=0.07, edge=0.08)                        # cabeça
    f.ell(17, 35, 5.5, 5, 'pelo', R=4, bias=0.05)                                 # focinho
    f.ell(18, 38, 3.5, 2, 'pelo_c', R=2, bias=-0.1)
    f.cap(31, 22, 41, 3, 3.8, 3.0, 'pelo', R=2.5, edge=0.15, tex=0.05)            # orelha da frente
    f.cap(32.5, 20, 40, 6, 1.7, 1.4, 'orelha', R=1, bias=0.05)
    f.shape(f.m_cap(31, 22, 41, 3, 3.8, 3.0) & (f.Y < 5.5) & (f.X > 37), 'barba', flat=0.2)
    # olho grande, escuro, com brilho; anel claro em volta
    f.ell(23.5, 29.5, 3, 2.6, 'pelo_c', R=2, bias=-0.2)
    f.ell(23.5, 29.5, 2, 2, 'olho', flat=0.0)
    f.px(23, 29, 'olho', 0.9)
    f.px(13, 34, 'olho', 0.1); f.px(14, 35, 'orelha', 0.3); f.px(15, 38, 'orelha', 0.1)
    for (x, y) in ((44, 33), (50, 31), (58, 33), (48, 40), (62, 39), (70, 37), (45, 47)): f.dk(x, y, -0.2); f.dk(x + 1, y, 0.12)
    return f


# fauna da região pedregosa (Inglaterra do séc. XII) e o tojo das encostas: de lado, virados para a esquerda
# como a vaca (o código espelha), a 100 px por metro; cobra e escorpião, pequenos demais, em escala maior
MAT.update({
    'lobo': ramp('1c1a18', '302c28', '48433d', '625b53', '7e766c', '9c9488'),
    'lobo_c': ramp('5a5246', '807664', 'a49a86', 'c4baa4', 'dcd2bc'),
    'ambar': ramp('4a2a08', '8a5a14', 'c48a24', 'e8b844'),
    'veado': ramp('221006', '3a1e0e', '562e16', '74421e', '905628', 'a86c36'),
    'veado_c': ramp('766450', '9c8668', 'c0aa88', 'dac6a4'),
    'galhada': ramp('2e2216', '4a3a28', '6a583e', '8c7a5a', 'b0a07e', 'd2c6a6'),
    'la': ramp('5e5646', '7e7662', '9e967e', 'bcb49a', 'd4ceb4', 'e6e0cc'),
    'la_t': ramp('5e4a3e', '846a5a', 'a68a78', 'c0a492', 'd6bca8'),
    'ovelha_c': ramp('2a221c', '423830', '5e5246', '7a6c5e', '948676'),
    'escorp': ramp('1c1208', '322010', '4e3418', '6c4a20', '8a642c', 'a67e3a'),
    'vibora': ramp('26221c', '403a30', '5c5444', '786e5a', '948870', 'aea288'),
    'vibora_z': ramp('0e0c0a', '1a1612', '28221c', '362e26'),
    'tojo': ramp('0c160c', '162612', '203418', '2c461e', '3a5826', '4c6c2e'),
    'flor_tojo': ramp('8a6a10', 'b8901a', 'dcb424', 'f0d040', 'f8e670'),
    'graveto': ramp('2a1e14', '44321f', '5e4a32', '7a6448', '94805e'),
})
DITHER.update({'lobo': 0.6, 'lobo_c': 0.5, 'veado': 0.5, 'la': 0.5, 'la_t': 0.4, 'tojo': 0.7, 'vibora': 0.4, 'escorp': 0.4, 'graveto': 0.4})


def cadeia(f, pts, r0, r1):
    """máscara de uma cápsula que segue a linha `pts`, afinando de r0 para r1"""
    m = np.zeros((f.h, f.w), bool); n = len(pts) - 1
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        m |= f.m_cap(x0, y0, x1, y1, r0 + (r1 - r0) * i / n, r0 + (r1 - r0) * (i + 1) / n)
    return m


def pelagem(f, mask, n, rng, amt=0.2):
    """pelo: tracinhos escuros com um fio de luz, na direção do pelo (para trás e para baixo)"""
    ys, xs = np.where(mask)
    for _ in range(n):
        k = rng.randint(len(xs)); x, y = xs[k], ys[k]
        f.dk(x, y, -amt); f.dk(x + 1, y + 1, -amt * 0.6); f.dk(x - 1, y, amt * 0.5)


def borda(m):
    return m & ndimage.binary_dilation(~m)


def lobo():
    """lobo cinzento de lado, virado para a esquerda; quadro 176x96, 100 px por metro (0,8 m na cernelha)"""
    f = Fig(176, 96, seed=111); L = 'lobo'; rng = np.random.RandomState(31)
    # pernas do lado de lá, na sombra
    f.shape(f.m_cap(76, 58, 78, 80, 4.8, 3.4) | f.m_cap(78, 80, 79, 92, 3.4, 2.8), L, R=3, bias=-.3, tex=.04)
    f.shape(f.m_cap(124, 56, 128, 76, 6, 3.6) | f.m_cap(128, 76, 125, 92, 3.4, 2.8), L, R=3, bias=-.3, tex=.04)
    for x in (77, 123): f.ell(x, 93, 4.4, 2.2, L, R=2, bias=-.28)
    f.shape(f.m_poly([(34, 22), (37, 6), (44, 20)]), L, R=3, bias=-.25)             # orelha de lá
    # cauda espessa, caída, ponta escura
    tail = cadeia(f, [(146, 36), (156, 50), (160, 66), (159, 82)], 6, 5)
    f.shape(tail, L, R=6, tex=.08, bias=-.04)
    f.adj(tail & (f.Y > 74), -.3)
    # corpo, peito, pescoço e as pernas de cá numa peça só
    body = (f.m_ell(104, 42, 44, 14) | f.m_ell(70, 45, 19, 18) | f.m_ell(134, 43, 15, 15)
            | f.m_poly([(40, 26), (54, 18), (76, 30), (72, 58), (56, 58), (46, 44)])
            | f.m_cap(64, 56, 62, 80, 5.6, 3.8) | f.m_cap(62, 80, 61, 92, 3.8, 3)
            | f.m_ell(138, 52, 12, 13) | f.m_cap(140, 58, 149, 77, 6.4, 3.6) | f.m_cap(149, 77, 146, 92, 3.4, 3))
    f.shape(body, L, R=14, tex=.05, vgrad=.14)
    hd = f.m_ell(38, 30, 12, 10.5) | f.m_poly([(32, 21), (8, 32), (4, 35), (6, 39), (14, 42), (34, 43), (46, 38)])
    f.shape(hd, L, R=8, tex=.04, edge=.06)
    f.shape(f.m_poly([(40, 24), (45, 5), (51, 22)]), L, R=3, edge=.1)                   # orelha
    f.adj(f.m_poly([(43, 20), (45, 10), (48, 20)]), -.25)
    tudo = body | hd
    # cinza mais escuro no lombo; creme no focinho, garganta, peito, barriga e canelas
    f.adj(f.m_ell(104, 30, 42, 8) & body, -.14); f.adj(f.m_ell(58, 26, 14, 6) & body, -.1)
    cream = ((hd & (f.Y > 36)) | f.m_ell(28, 34, 6, 4) | f.m_ell(58, 52, 9, 13) | (body & (f.Y > 52) & (f.X > 74) & (f.X < 132))
             | (body & (f.Y > 80)))
    f.mat[cream & tudo] = f.mid('lobo_c')
    pelagem(f, body, 260, rng, .16)
    f.crease([(80, 54), (96, 57), (118, 55)], .1); f.crease([(128, 34), (132, 48), (130, 60)], .12)
    for x, y in ((61, 92), (146, 92)): f.ell(x - 1, y + 1, 4.6, 2.2, 'lobo_c', R=2, bias=-.1)
    # focinho: nariz, boca e olho âmbar
    f.ell(5.5, 35, 2.6, 2.2, 'olho', flat=.1); f.px(5, 34, 'olho', .7)
    f.line([(8, 40), (18, 41), (27, 40)], 'olho', .15)
    for x in range(26, 36): f.dk(x, 26, -.18)
    f.px(31, 28, 'ambar', .85); f.px(32, 28, 'olho', 0); f.px(30, 28, 'ambar', .5); f.dk(29, 29, -.25); f.dk(33, 27, -.2)
    return f


def veado():
    """veado-vermelho macho, de lado, virado para a esquerda; quadro 224x216, 100 px por metro (1,2 m na cernelha)"""
    f = Fig(224, 216, seed=112); V = 'veado'; rng = np.random.RandomState(32)
    # pernas do lado de lá
    f.shape(f.m_cap(96, 128, 99, 168, 6, 4) | f.m_cap(99, 168, 100, 208, 3.4, 2.6), V, R=3, bias=-.3)
    f.shape(f.m_cap(152, 124, 158, 160, 9, 4.5) | f.m_cap(158, 160, 152, 208, 3.6, 2.6), V, R=3, bias=-.3)
    for x in (100, 152): f.poly([(x - 4, 206), (x + 3, 206), (x + 4, 213), (x - 6, 213)], 'casco', R=2, bias=-.1)
    # galhada do lado de lá
    for pts in ([(49, 44), (46, 30), (46, 16), (51, 4)], [(47, 38), (36, 32), (31, 25)], [(46, 26), (36, 19), (33, 12)], [(48, 12), (44, 3)]):
        f.shape(cadeia(f, pts, 2.6 if len(pts) > 3 else 2, 1.1), 'galhada', R=2, bias=-.25)
    body = (f.m_ell(124, 108, 52, 29) | f.m_ell(84, 110, 26, 31) | f.m_ell(166, 104, 23, 28)
            | f.m_poly([(58, 106), (41, 64), (52, 44), (72, 50), (100, 88), (96, 108)])
            | f.m_cap(80, 132, 78, 168, 8.5, 4.4) | f.m_cap(78, 168, 77, 208, 3.8, 2.8)
            | f.m_ell(170, 122, 16, 19) | f.m_cap(172, 132, 180, 162, 9, 4.4) | f.m_cap(180, 162, 174, 208, 3.8, 2.8))
    f.shape(body, V, R=18, tex=.04, vgrad=.12)
    # juba do pescoço (no outono): pelo comprido e escuro na garganta
    f.adj(f.m_poly([(56, 74), (70, 70), (92, 100), (64, 108)]) & body, -.16)
    for k in range(8):                                   # tufos pendendo da garganta, para baixo e para trás
        x = 45 + k * 2.3 + (k % 2); y = 70 + k * 4.6
        f.shape(f.m_poly([(x + 1, y - 3), (x + 6, y + 1), (x + 1, y + 8 + (k % 3)), (x - 2, y + 2)]), V, R=2, bias=-.3 + .04 * (k % 2), tex=.04)
    pelagem(f, body, 300, rng, .12)
    f.crease([(150, 92), (158, 112), (160, 132)], .12); f.crease([(92, 128), (90, 150)], .14); f.crease([(102, 94), (104, 118)], .08)
    # espelho claro na anca e rabo curto
    f.mat[f.m_ell(185, 100, 7, 11) & body] = f.mid("veado_c")
    f.cap(190, 92, 193, 104, 2.6, 2, V, R=2, bias=-.05)
    for x in (77, 174):
        f.poly([(x - 5, 205), (x + 4, 205), (x + 5, 213), (x - 7, 213)], 'casco', R=2, edge=.1)
    # cabeça inclinada, focinho para baixo e para a frente
    hd = f.m_ell(50, 52, 12, 10) | f.m_poly([(40, 44), (58, 48), (58, 60), (34, 80), (24, 80), (21, 74), (30, 60)])
    f.shape(hd, V, R=8, tex=.03, edge=.08)
    f.ell(24, 76, 3.6, 3, 'casco', flat=.2); f.px(22, 75, 'casco', .5)
    f.mat[f.m_ell(28, 78, 6, 3) & hd & (f.Y > 77)] = f.mid('veado_c')
    f.ell(40, 53, 2.4, 2.1, 'olho', flat=0); f.px(39, 52, 'olho', .9); f.dk(37, 55, -.2); f.dk(36, 57, -.2)
    f.shape(cadeia(f, [(58, 48), (68, 44), (76, 44)], 4.6, 2), V, R=3, edge=.1, bias=-.05)          # orelha
    f.adj(cadeia(f, [(60, 47), (68, 45), (73, 45)], 2.2, 1), -.2)
    # galhada de cá: haste para trás e para cima, com os ramos para a frente
    for pts in ([(57, 42), (61, 30), (65, 18), (70, 8), (76, 2)], [(58, 38), (47, 32), (41, 25)], [(60, 32), (49, 24), (45, 17)],
                [(64, 20), (55, 12), (53, 5)], [(70, 8), (67, 0)], [(73, 5), (82, 2)]):
        m = cadeia(f, pts, 3 if len(pts) > 4 else 2.2, 1.1)
        f.soft(m, .14); f.shape(m, 'galhada', R=2.5, tex=.05)
    for x, y in ((41, 25), (45, 17), (53, 5), (67, 0), (82, 2), (76, 2)): f.px(x, y, 'galhada', 1.0)
    f.ell(57, 42, 3.4, 2.6, 'galhada', R=2, bias=-.2)                                             # roseta
    return f


def tufos_la(f, mask, n, rng, mat='la'):
    """lã em cachos: bolinhas com o alto iluminado, na luz do lugar"""
    ys, xs = np.where(mask); lum0 = f.lum.copy()
    for _ in range(n):
        k = rng.randint(len(xs)); x, y = xs[k], ys[k]
        r = rng.uniform(2.2, 4.0); m = f.m_ell(x, y, r, r * .85) & mask
        f.shape(m, mat, R=r, bias=lum0[y, x] - .62 + rng.uniform(-.04, .04))
        f.adj(m & ~f.m_ell(x + 1, y + 1, r, r * .85), .08)


def _ovelha(tosquiada):
    f = Fig(144, 104, seed=114); rng = np.random.RandomState(33); C = 'ovelha_c'
    # pernas do lado de lá
    for (x0, x1) in ((66, 67), (102, 101)):
        f.shape(f.m_cap(x0, 66, x1, 99, 3.4, 2.6), C, R=2, bias=-.3)
        f.ell(x1, 100.5, 3.2, 1.8, 'casco', R=1.5, bias=-.1)
    f.shape(cadeia(f, [(30, 38), (40, 41), (47, 44)], 3.2, 2), C, R=2, bias=-.28)        # orelha de lá
    if tosquiada:
        body = f.m_ell(86, 52, 36, 17) | f.m_poly([(34, 34), (50, 30), (62, 40), (60, 66), (44, 60)]) | f.m_ell(112, 52, 14, 15)
        body |= f.m_cap(56, 62, 55, 99, 3.6, 2.8) | f.m_cap(112, 60, 114, 99, 4.6, 2.8)
        f.shape(body, 'la_t', R=12, tex=.06, vgrad=.12)
        for x0 in (70, 76, 82, 88, 94, 100): f.crease([(x0, 40), (x0 + 2, 64)], .07)      # marcas da tesoura
        f.crease([(106, 40), (112, 52), (110, 64)], .1); f.crease([(60, 46), (64, 60)], .1)
        f.dk(118, 44, .1); f.dk(119, 45, .1)                                               # osso da anca
        f.mat[body & (f.Y > 64)] = f.mid(C)
    else:
        core = f.m_ell(86, 50, 40, 22) | f.m_poly([(36, 34), (52, 26), (64, 40), (60, 64), (44, 58)])
        body = core.copy()
        for a in np.linspace(0, 2 * np.pi, 26, endpoint=False):
            x, y = 86 + np.cos(a) * 39, 50 + np.sin(a) * 21
            body |= f.m_ell(x, y, rng.uniform(5, 7.5), rng.uniform(4.5, 6.5))
        body &= f.Y < 76
        body |= f.m_cap(56, 66, 55, 99, 3.4, 2.8) | f.m_cap(112, 66, 114, 99, 3.6, 2.8)
        f.shape(body, 'la', R=16, tex=.05, vgrad=.1)
        f.mat[body & (f.Y > 74)] = f.mid(C)
        tufos_la(f, body & (f.Y < 74), 420, rng)
        f.adj(f.m_ell(86, 30, 36, 6) & body, .06)
    for x in (55, 114): f.ell(x, 100.5, 3.4, 1.8, 'casco', R=1.5)
    # cabeça mais baixa que o lombo, focinho para a esquerda; orelhas para os lados
    hd = f.m_ell(28, 42, 9.5, 8.5) | f.m_poly([(22, 34), (34, 38), (32, 50), (18, 58), (11, 56), (11, 49)])
    f.shape(hd, C, R=7, tex=.03, edge=.08, bias=.04)
    f.shape(cadeia(f, [(32, 42), (42, 46), (47, 48)], 3.6, 2.2), C, R=2, edge=.1)
    f.adj(cadeia(f, [(36, 44), (44, 47)], 1.6, 1), -.2)
    f.ell(27, 33, 7, 5, 'la', R=4, tex=.08, bias=.05 if not tosquiada else -.05)               # topete
    f.ell(13, 51, 1.6, 1.4, 'olho', flat=.15); f.line([(12, 55), (16, 56)], 'olho', .25)
    f.ell(24, 42, 2.2, 1.6, 'olho', flat=0); f.px(23, 41, 'olho', .8); f.px(26, 42, 'ambar', .6)
    return f


def ovelha():
    """ovelha de lã comprida (raça antiga, de cara parda), de lado, virada para a esquerda; quadro 144x104"""
    return _ovelha(False)


def ovelha_tosquiada():
    """a mesma ovelha depois da tosquia: pele rosada à mostra, mesmo quadro"""
    return _ovelha(True)


def arbusto():
    """moita de tojo florido (Ulex europaeus), das encostas pedregosas; quadro 160x128, 100 px por metro"""
    import math
    f = Fig(160, 128, seed=115); rng = np.random.RandomState(34); cx, cy = 80, 74
    for (x0, x1, y1) in ((70, 58, 98), (80, 82, 90), (90, 104, 98), (76, 70, 104)):
        f.cap(x0, 127, x1, y1, 3, 1.5, 'graveto', R=2, bias=-.1)
    lobes = [(80, 82, 58, 36), (42, 96, 30, 24), (120, 94, 32, 26), (62, 58, 28, 22), (100, 54, 30, 24), (80, 40, 20, 16), (80, 104, 54, 20)]
    mass = np.zeros((128, 160), bool)
    for (x, y, rx, ry) in lobes: mass |= f.m_ell(x, y, rx, ry)
    mass &= f.Y < 124
    f.shape(mass, 'tojo', R=26, tex=.06, bias=-.12)
    for (x, y, rx, ry) in lobes[1:-1]:
        dx, dy = (x - cx) / 60, (y - cy) / 40
        f.shape(f.m_ell(x, y, rx * .85, ry * .85), 'tojo', R=rx * .8, bias=-.18 * dx - .18 * dy - .1, tex=.08, grain=2)
    ys, xs = np.where(mass); lum0 = f.lum.copy()
    for _ in range(420):                                                                  # tufos de folhinhas
        k = rng.randint(len(xs)); x, y = xs[k], ys[k]
        r = rng.uniform(2.2, 4.2); m = f.m_ell(x, y, r, r * .8) & mass
        f.shape(m, 'tojo', R=r, bias=lum0[y, x] - .6 + rng.uniform(-.05, .05), tex=.05)
        f.adj(m & ~f.m_ell(x + 1, y + 1, r, r * .8), .08)
    # espinhos: traços curtos, e na borda saindo para fora
    ys, xs = np.where(mass); lum0 = f.lum.copy()
    for _ in range(1500):
        k = rng.randint(len(xs)); x, y = xs[k], ys[k]; a = rng.uniform(0, 2 * math.pi); n = rng.randint(2, 4)
        l = lum0[y, x] + rng.choice((-.18, .14))
        for i in range(n): f.px(x + round(math.cos(a) * i), y + round(math.sin(a) * i), 'tojo', l)
    by, bx = np.where(borda(mass))
    for k in range(0, len(bx), 2):
        x, y = bx[k], by[k]
        if y > 116 or rng.rand() < .4: continue
        d = math.atan2(y - cy, x - cx) + rng.uniform(-.5, .5)
        for i in range(1, rng.randint(2, 5)): f.px(x + round(math.cos(d) * i), y + round(math.sin(d) * i), 'tojo', lum0[y, x] - .05)
    # flores amarelas em cachos, mais no alto e do lado da luz
    for _ in range(240):
        k = rng.randint(len(xs)); x, y = xs[k], ys[k]
        if y > 104 or rng.rand() > .35 + .65 * (1 - (y - 20) / 90) or f.mat[y, x] != f.mid('tojo'): continue
        l = .55 + .4 * np.clip(f.lum[y, x], 0, 1)
        f.px(x, y, 'flor_tojo', l); f.px(x + 1, y, 'flor_tojo', l - .3)
        if rng.rand() < .5: f.px(x, y - 1, 'flor_tojo', l + .15)
    return f


def arbusto_seco():
    """o tojo depois de cortado: tocos lenhosos e gravetos secos no chão; mesmo quadro do arbusto"""
    f = Fig(160, 128, seed=116); rng = np.random.RandomState(35)
    f.ell(80, 125, 46, 3.5, 'terra', R=3, tex=.1)
    for (x0, x1, y1) in ((70, 64, 108), (80, 82, 104), (90, 98, 110), (76, 72, 114), (86, 88, 116)):
        m = f.m_cap(x0, 126, x1, y1, 3, 2.2); f.soft(m, .12); f.shape(m, 'graveto', R=2, tex=.06)
        f.ell(x1, y1, 2.3, 1.2, 'cerne', R=1.5, bias=.1)
    for _ in range(14):                                                                    # gravetos espalhados
        x, y = rng.uniform(40, 122), rng.uniform(118, 126); a = rng.uniform(-.4, .4); L = rng.uniform(6, 14)
        f.cap(x, y, x + L * np.cos(a), y + L * np.sin(a) * .3, .9, .7, 'graveto', R=1, bias=rng.uniform(-.2, .1))
    for _ in range(40):                                                                    # espinhos secos
        x, y = rng.randint(48, 116), rng.randint(110, 125)
        f.px(x, y, 'tojo', rng.uniform(.1, .4))
    return f


def escorpiao():
    """escorpião de lado, virado para a esquerda, cauda erguida sobre o dorso; quadro 96x48 (escala maior que 100 px/m)"""
    f = Fig(96, 48, seed=117); E = 'escorp'
    # patas do lado de lá
    for k, x in enumerate((40, 47, 54, 61)):
        f.shape(cadeia(f, [(x + 2, 34), (x - 2, 36), (x - 5, 46)], 1.4, .8), E, R=1, bias=-.3)
    f.shape(cadeia(f, [(36, 30), (26, 24), (18, 24)], 2.6, 2), E, R=2, bias=-.25)          # pinça de lá
    f.shape(f.m_ell(14, 23, 6, 3.4) | f.m_cap(10, 22, 4, 21, 1.6, .7) | f.m_cap(10, 25, 5, 25, 1.4, .6), E, R=2, bias=-.25)
    # corpo em gomos e cauda em arco
    body = f.m_ell(52, 34, 19, 6) | f.m_ell(36, 33, 7, 5)
    f.shape(body, E, R=5, tex=.04)
    for x in (42, 48, 54, 60, 66): f.crease([(x, 29), (x + 1, 39)], .14)
    tail = [(68, 32), (74, 26), (78, 18), (77, 10), (71, 4), (63, 3)]
    m = cadeia(f, tail, 4.2, 2.6); f.soft(m, .1); f.shape(m, E, R=3, edge=.15, bias=.03)
    for i in range(len(tail) - 1):                                                         # juntas dos gomos
        (x0, y0), (x1, y1) = tail[i], tail[i + 1]; mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        l = np.hypot(x1 - x0, y1 - y0); nx, ny = -(y1 - y0) / l, (x1 - x0) / l
        f.crease([(mx - nx * 4, my - ny * 4), (mx + nx * 4, my + ny * 4)], .2, sigma=.6)
    f.ell(58, 6, 4.4, 3.4, E, R=3, edge=.1, bias=.05)                                      # vesícula
    f.shape(cadeia(f, [(55, 8), (53, 11), (54, 13)], 1.2, .4), 'casco', R=1, bias=.2)        # ferrão
    # patas de cá e a pinça da frente
    for k, x in enumerate((42, 49, 56, 63)):
        f.shape(cadeia(f, [(x, 37), (x - 4, 39), (x - 7, 47)], 1.6, .9), E, R=1, edge=.1, bias=.05)
    f.shape(cadeia(f, [(34, 35), (26, 30), (20, 31)], 2.8, 2.2), E, R=2, edge=.1)
    f.shape(f.m_ell(15, 30, 6.5, 3.8) | f.m_cap(10, 29, 3, 28, 1.7, .7) | f.m_cap(10, 32, 4, 33, 1.5, .6), E, R=2.5, edge=.1, bias=.08)
    f.px(31, 30, 'olho', 0); f.px(32, 30, 'olho', .7)
    return f


def serpente():
    """víbora (Vipera berus) enrodilhada, cabeça erguida para a esquerda; quadro 128x48 (escala maior que 100 px/m)"""
    import math
    f = Fig(128, 48, seed=118); rng = np.random.RandomState(36)
    def arco(cx, cy, rx, ry, a0, a1, n=24): return [(cx + math.cos(a0 + (a1 - a0) * i / n) * rx, cy + math.sin(a0 + (a1 - a0) * i / n) * ry) for i in range(n + 1)]
    def zigue(pts, clip, amp=1.6):
        """faixa escura em zigue-zague no dorso"""
        out = []
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            l = math.hypot(x1 - x0, y1 - y0) or 1; nx, ny = -(y1 - y0) / l, (x1 - x0) / l
            s = 1 if i % 2 else -1
            out.append((x0 + nx * amp * s, y0 + ny * amp * s - 1.5))
        f.shape(cadeia(f, out, 1.2, 1.0) & clip, 'vibora_z', R=1, bias=.1)
    voltas = [((84, 39, 30, 5.5), 5, -.25), ((80, 31, 22, 4.5), 4.6, -.18)]
    for (cx, cy, rx, ry), r, b in voltas:                        # metade de trás de cada volta, na sombra
        p = arco(cx, cy, rx, ry, math.pi, 2 * math.pi); m = cadeia(f, p, r, r)
        f.shape(m, 'vibora', R=r, bias=b, tex=.04)
    for (cx, cy, rx, ry), r, b in voltas:                        # metade da frente
        p = arco(cx, cy, rx, ry, 0, math.pi); m = cadeia(f, p, r, r)
        f.soft(m, .12); f.shape(m, 'vibora', R=r, tex=.04, edge=.12); zigue(p, m)
    tail = [(114, 39), (120, 42), (126, 44)]
    m = cadeia(f, tail, 3.6, .8); f.shape(m, 'vibora', R=2, tex=.03, edge=.1)
    neck = [(58 - 24 * t - 2 * math.sin(t * math.pi), 31 - 17 * math.sin(t * math.pi / 2) ** 1.4) for t in np.linspace(0, 1, 12)]
    m = cadeia(f, neck, 4.6, 3.6); f.soft(m, .12); f.shape(m, 'vibora', R=4, tex=.04, edge=.12); zigue(neck, m, 1.4)
    hd = f.m_ell(24, 14, 9, 5.2) | f.m_poly([(18, 10), (8, 13), (7, 16), (18, 19)])
    f.shape(hd, 'vibora', R=4, edge=.1, bias=.04)
    f.shape(f.m_poly([(28, 10), (20, 11), (24, 13), (30, 12)]) & hd, 'vibora_z', R=1, bias=.1)   # marca em V na cabeça
    f.line([(14, 12), (24, 13)], 'vibora_z', .15)
    f.px(17, 13, 'rosa', .85); f.px(18, 13, 'olho', 0)
    f.line([(6, 16), (3, 16)], 'rosa', .3); f.px(2, 15, 'rosa', .3); f.px(2, 17, 'rosa', .3)   # língua bífida
    for y in (17, 18): f.line([(10, y), (24, y)], 'vibora', .78)                                  # beiço claro
    return f


def galho(f, x, y, ang, L, r, depth, rng, segs):
    import math
    x1, y1 = x + math.sin(ang) * L, y - math.cos(ang) * L
    segs.append((x, y, x1, y1, r, r * 0.72))
    if depth == 0: return
    for k in (-1, 1):
        if rng.rand() < 0.9:
            galho(f, x1, y1, ang + k * rng.uniform(0.35, 0.75), L * rng.uniform(0.62, 0.8), r * 0.68, depth - 1, rng, segs)


MAT.update({
    'folha_f': ramp('18220e', '263616', '344c1e', '466628', '5a7e30', '72963c', '8eae4c'),    # freixo: verde claro, amarelado
    'folha_o': ramp('0e180f', '172618', '213620', '2c4828', '3a5a30', '4c6e38', '628644'),    # olmo: verde escuro, azulado
    'casca_c': ramp('22221e', '383832', '505048', '6a6a60', '828276', '9a9a8c'),              # freixo: casca lisa cinza
    'casca_e': ramp('141010', '221c18', '322a24', '443a30', '564a3e', '6a5c4c'),              # olmo: casca escura, rachada
})
DITHER.update({'folha_f': 0.7, 'folha_o': 0.7, 'casca_c': 0.5, 'casca_e': 0.6})


def galho2(x, y, ang, L, r, depth, rng, segs, abre=(0.35, 0.75), sobe=0.0):
    """galho que se divide em dois; sobe puxa os ramos filhos para a vertical (freixo)"""
    x1, y1 = x + math.sin(ang) * L, y - math.cos(ang) * L
    segs.append((x, y, x1, y1, r, r * 0.72))
    if depth == 0: return
    for k in (-1, 1):
        if rng.rand() < 0.9:
            galho2(x1, y1, ang * (1 - sobe) + k * rng.uniform(*abre), L * rng.uniform(0.62, 0.8), r * 0.68, depth - 1, rng, segs, abre, sobe)


def arvore_de(seed, rs, casca, folha, tronco, raizes, membros, lobos, buracos=(), tufo=(2.5, 5.0), n_tufo=900, n_franja=160,
              abre=(0.35, 0.75), sobe=0.0, prof=2, sulcos=(), luz=0.32, base=-0.42):
    """árvore no quadro 192x256 (pé na linha 255): tronco, membros grossos que se dividem, copa feita de lobos
    (cada um com luz própria e o lado de baixo na sombra), buracos onde aparecem os galhos e o céu, tufos e franja"""
    f = Fig(192, 256, seed=seed); rng = np.random.RandomState(rs)
    copa = np.zeros((256, 192), bool); inner = np.zeros((256, 192), bool); fura = np.zeros((256, 192), bool)
    for (x, y, rx, ry) in lobos: copa |= f.m_ell(x, y, rx, ry); inner |= f.m_ell(x, y, rx * .78, ry * .78)
    for (x, y, rx, ry) in buracos: fura |= f.m_ell(x, y, rx, ry)
    ys, xs = np.where(copa); cx, cy = xs.mean(), ys.mean(); sx, sy = (xs.max() - xs.min()) / 2, (ys.max() - ys.min()) / 2
    f.shape(inner, folha, R=30, bias=base, tex=.06)                                          # massa interna escura
    segs = []
    for pts, r0, r1 in membros:
        n = len(pts) - 1
        for i in range(n): segs.append((pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r0 + (r1 - r0) * i / n, r0 + (r1 - r0) * (i + 1) / n))
        (xa, ya), (xb, yb) = pts[-2], pts[-1]
        ang = math.atan2(xb - xa, -(yb - ya)); L = math.hypot(xb - xa, yb - ya)
        for k in (-1, 1): galho2(xb, yb, ang + k * rng.uniform(*abre), L * rng.uniform(.6, .8), r1 * .72, prof - 1, rng, segs, abre, sobe)
    ty0 = min(y for x, y in tronco)
    perto = (f.Y > ty0 - 34) & (np.abs(f.X - 96) < 70)
    for (x0, y0, x1, y1, r0, r1) in segs:
        f.shape(f.m_cap(x0, y0, x1, y1, r0, r1) & (copa | perto), casca, R=max(r0, 2), tex=.1, edge=.15)
    f.poly(tronco, casca, R=13, tex=.12)
    for p in raizes: f.poly(p, casca, R=6, tex=.1, edge=.1)
    for x in sulcos:                                                                          # sulcos da casca
        f.fold([(x, ty0 + 6), (x + rng.randint(-2, 3), (ty0 + 255) / 2), (x + rng.randint(-2, 3), 250)], .3, .12)
    f.adj(f.m_ell(cx, ty0 - 8, sx * .7, 30) & f.m_mat(casca), -.22)                          # sombra da copa no tronco
    # lobos da copa
    for (x, y, rx, ry) in lobos:
        dx, dy = (x - cx) / sx, (y - cy) / sy
        m = f.m_ell(x, y, rx, ry)
        f.shape(m, folha, R=rx * .9, bias=-luz * dx - luz * dy - .08, tex=.08, grain=2)
        f.adj(m & ~f.m_ell(x - rx * .1, y - ry * .35, rx * .95, ry * .8), -.12)
    # buracos: o céu aparece e os galhos passam por eles
    fm = f.m_mat(folha)
    f.mat[fura & fm] = 0
    for (x0, y0, x1, y1, r0, r1) in segs:
        f.shape(f.m_cap(x0, y0, x1, y1, r0, r1) & fura & copa, casca, R=max(r0, 2), tex=.1, bias=-.12)
    for (x0, y0, x1, y1, r0, r1) in segs[len(membros) * 3:]:
        if rng.rand() < 0.5:
            ax, ay = x0 + (x1 - x0) * .25, y0 + (y1 - y0) * .25; bx, by = x0 + (x1 - x0) * .7, y0 + (y1 - y0) * .7
            f.shape(f.m_cap(ax, ay, bx, by, r0 * .9, r1 * .9) & copa & ~fura & (f.Y > cy - sy * .3), casca, R=3, bias=-.18, tex=.1)
    # tufos de folhas por toda a copa
    vivo = f.m_mat(folha, casca) & copa & ~fura
    ys, xs = np.where(vivo); lum0 = f.lum.copy()
    for _ in range(n_tufo):
        k = rng.randint(len(xs)); x, y = xs[k], ys[k]
        rx, ry = rng.uniform(*tufo), rng.uniform(tufo[0] * .8, tufo[1] * .7)
        m = f.m_ell(x, y, rx, ry) & ~fura
        f.shape(m, folha, R=rx, bias=lum0[y, x] - .62 + rng.uniform(-.05, .05), tex=.05)
        f.adj(m & ~f.m_ell(x + 1.2, y + 1.2, rx, ry), .1)
    # franja: folhas soltas na borda
    by, bx = np.where(borda(copa) & ~fura)
    for _ in range(n_franja):
        k = rng.randint(len(bx)); x, y = bx[k], by[k]
        a = math.atan2(y - cy, x - cx); o = rng.uniform(1, 4)
        f.ell(x + math.cos(a) * o, y + math.sin(a) * o, rng.uniform(1.5, tufo[0] + .8), rng.uniform(1.2, 2.4), folha, R=2,
              bias=-luz * math.cos(a) - luz * math.sin(a) - .02)
    return f


def arvore():
    """carvalho-inglês (Quercus robur): tronco curto e grosso, membros tortos que abrem quase na horizontal,
    copa larga em cúpula, de tufos fechados; quadro 192x256 (o toco usa o mesmo quadro)"""
    return arvore_de(61, 7, 'casca', 'folha',
                     [(75, 255), (79, 236), (82, 206), (79, 184), (87, 172), (107, 172), (114, 184), (111, 206), (113, 236), (119, 255)],
                     [[(56, 255), (82, 236), (104, 236), (88, 255)], [(104, 255), (92, 236), (110, 236), (136, 255)], [(76, 255), (88, 240), (104, 240), (112, 255)]],
                     [([(88, 180), (70, 164), (50, 150), (28, 138)], 10, 4.5), ([(90, 176), (80, 146), (68, 118), (60, 92)], 9, 4),
                      ([(97, 174), (99, 140), (94, 108), (97, 74)], 8, 3.5), ([(104, 176), (116, 146), (128, 118), (138, 88)], 9, 4),
                      ([(106, 180), (126, 164), (146, 152), (168, 140)], 10, 4.5)],
                     [(96, 40, 34, 26), (62, 48, 30, 24), (130, 46, 30, 24), (32, 76, 26, 22), (160, 74, 26, 22), (96, 72, 36, 26),
                      (60, 88, 30, 22), (132, 88, 30, 22), (18, 114, 18, 15), (174, 112, 18, 15), (44, 122, 26, 16), (148, 120, 26, 16),
                      (80, 112, 24, 16), (114, 114, 24, 16), (78, 22, 20, 15), (116, 20, 20, 14),
                      (30, 140, 22, 14), (162, 138, 22, 14), (66, 144, 20, 12), (126, 144, 20, 12)],
                     buracos=[(96, 150, 9, 7), (48, 154, 6, 4), (146, 152, 6, 4)],
                     tufo=(2.8, 5.4), n_tufo=950, sulcos=(84, 89, 94, 99, 104, 109))


def arvore_2():
    """freixo (Fraxinus excelsior): tronco reto de casca cinza lisa, galhos que sobem em curva, copa oval e
    aberta, de folhas miúdas verde-claras; mesmo quadro e mesma base do carvalho"""
    return arvore_de(63, 17, 'casca_c', 'folha_f',
                     [(84, 255), (87, 236), (89, 190), (88, 152), (104, 152), (103, 190), (105, 236), (108, 255)],
                     [[(72, 255), (88, 240), (100, 240), (90, 255)], [(100, 255), (94, 240), (106, 240), (120, 255)]],
                     [([(92, 156), (80, 122), (66, 92), (56, 58)], 6, 2.8), ([(96, 152), (97, 112), (95, 72), (98, 32)], 6, 2.6),
                      ([(100, 156), (114, 120), (128, 88), (138, 56)], 6, 2.8), ([(90, 172), (72, 152), (52, 130), (40, 106)], 5, 2.4),
                      ([(102, 170), (122, 150), (142, 128), (152, 104)], 5, 2.4)],
                     [(96, 30, 28, 22), (66, 44, 24, 20), (126, 44, 24, 20), (48, 74, 24, 20), (144, 74, 24, 20), (96, 64, 30, 22),
                      (74, 96, 26, 20), (118, 96, 26, 20), (38, 108, 20, 16), (154, 106, 20, 16), (96, 120, 26, 16), (62, 132, 22, 14), (130, 132, 22, 14)],
                     buracos=[(96, 142, 9, 6), (30, 92, 5, 5), (162, 90, 5, 5), (40, 126, 6, 4), (152, 124, 6, 4)],
                     tufo=(1.8, 3.4), n_tufo=1300, n_franja=240, abre=(0.25, 0.55), sobe=0.35, prof=3, sulcos=(93, 99), luz=0.3, base=-0.36)


def arvore_3():
    """olmo-inglês (Ulmus procera): alto e estreito, copa em nuvens empilhadas ao longo do tronco, com tufos
    baixos nos lados, folhagem escura; mesmo quadro e mesma base do carvalho"""
    return arvore_de(65, 27, 'casca_e', 'folha_o',
                     [(82, 255), (86, 236), (88, 190), (87, 124), (105, 124), (104, 190), (106, 236), (110, 255)],
                     [[(66, 255), (86, 238), (100, 238), (88, 255)], [(102, 255), (94, 238), (108, 238), (126, 255)]],
                     [([(92, 128), (80, 98), (72, 66), (70, 32)], 7, 3), ([(96, 124), (98, 84), (96, 44), (96, 8)], 7, 3),
                      ([(100, 128), (112, 96), (122, 64), (124, 30)], 7, 3), ([(90, 174), (70, 160), (50, 150)], 6, 3),
                      ([(102, 168), (124, 154), (146, 146)], 6, 3)],
                     [(96, 22, 26, 20), (70, 40, 22, 18), (124, 38, 22, 18), (96, 58, 30, 22), (64, 80, 24, 20), (130, 78, 24, 20),
                      (96, 98, 28, 20), (68, 118, 22, 16), (126, 116, 22, 16), (44, 148, 20, 13), (150, 142, 20, 13), (96, 132, 18, 11)],
                     buracos=[],
                     tufo=(2.6, 5.0), n_tufo=1000, n_franja=200, prof=2, sulcos=(90, 94, 98, 102), luz=0.34)


def toco_de(seed, rs, casca, x0, x1, top=222):
    """toco cortado no mesmo quadro da árvore, da largura do tronco dela (x0..x1 na base)"""
    f = Fig(192, 256, seed=seed); rng = np.random.RandomState(rs); c = (x0 + x1) / 2; w = (x1 - x0) / 2
    for (a, b) in ((x0 - 12, x0 + 2), (x1 + 6, x1 - 4)):
        f.poly([(a, 254), (c - w + 4 if a < c else c + w - 4, 236), (c, 236), (b, 254)], casca, R=6, tex=0.1, edge=0.1)
    f.poly([(x0 + 1, 254), (c - w + 3, top), (c + w - 2, top), (x1 - 1, 254)], casca, R=12, tex=0.12)
    for k in range(4): f.fold([(c - w + 6 + k * (2 * w - 10) / 3, top + 4), (c - w + 6 + k * (2 * w - 10) / 3 + rng.randint(-2, 3), 252)], .3, .1)
    rx = w - 1.5
    f.ell(c, top, rx, 4.5, 'cerne', R=4, edge=0.1)
    f.adj(f.m_ell(c, top, rx, 4.5) & ~f.m_ell(c, top, rx - 1.5, 3.5), -0.35)
    for q in (.64, .36):
        m = f.m_ell(c, top, rx * q, 4.5 * q) & ~f.m_ell(c, top, rx * q - 1, 4.5 * q - .7); f.adj(m, -0.22)
    f.px(c, top, 'cerne', 0.2)
    f.line([(c + 1, top), (c + rx * .6, top + 2)], 'cerne', 0.2)                               # rachadura
    for (x, y, r) in ((x0 - 16, 252, 3), (x1 + 10, 251, 2.5), (x1 + 16, 254, 2), (x0 - 22, 255, 1.6), (x1 + 2, 255, 2)):
        f.ell(x, y, r * 1.6, r * 0.7, 'cerne', R=1.5, bias=-0.1)                               # lascas
    return f


def toco():
    """toco do carvalho"""
    return toco_de(62, 8, 'casca', 78, 116, 218)


def toco_2():
    """toco do freixo"""
    return toco_de(64, 18, 'casca_c', 86, 106, 224)


def toco_3():
    """toco do olmo"""
    return toco_de(66, 28, 'casca_e', 84, 108, 222)


ROCHA = [(8, 126), (12, 104), (22, 84), (36, 66), (50, 52), (64, 44), (78, 46), (92, 56), (104, 70), (114, 88), (121, 108), (122, 126)]


def rocha_base(f, pts, facets, rng):
    f.poly(pts, 'rocha', R=18, tex=0.06)
    for poly, b in facets: f.adj(f.m_poly(poly), b, clip=f.m_mat('rocha'))


def veio():
    """afloramento de rocha com veios de minério de ferro; quadro 128x128"""
    f = Fig(128, 128, seed=71); rng = np.random.RandomState(9)
    facets = [([(36, 66), (50, 52), (64, 44), (70, 62), (54, 82), (30, 90)], 0.14),
              ([(64, 44), (78, 46), (92, 56), (84, 76), (70, 62)], 0.02),
              ([(92, 56), (104, 70), (114, 88), (96, 92), (84, 76)], -0.12),
              ([(114, 88), (121, 108), (122, 126), (100, 126), (96, 92)], -0.22),
              ([(54, 82), (70, 62), (84, 76), (96, 92), (100, 126), (60, 126)], -0.06),
              ([(8, 126), (12, 104), (22, 84), (30, 90), (54, 82), (60, 126)], 0.0)]
    rocha_base(f, ROCHA, facets, rng)
    for a, b, c in (((30, 90), (54, 82), (70, 62)), ((70, 62), (84, 76), (96, 92)), ((84, 76), (92, 56), (91, 57)),
                    ((96, 92), (114, 88), (115, 88)), ((54, 82), (60, 126), (60, 126)), ((96, 92), (100, 126), (100, 126))):
        f.fold([a, b, c], .3, .15)
    # pedra menor à frente
    f.poly([(2, 127), (6, 110), (18, 101), (34, 104), (42, 116), (44, 127)], 'rocha', R=10, edge=0.25, shadow=0.25, tex=0.06, bias=0.04)
    f.fold([(18, 101), (22, 114), (21, 127)], .25, .12)
    # veios de minério: faixas ferruginosas que seguem as fendas
    veins = [[(28, 96), (42, 88), (56, 86), (66, 76), (78, 72), (90, 66)],
             [(60, 110), (70, 100), (82, 98), (94, 104), (108, 100)],
             [(46, 66), (54, 62), (62, 64)], [(84, 86), (92, 80), (102, 82)], [(14, 112), (22, 108), (30, 110)]]
    rm = f.m_mat('rocha')
    for v in veins:
        for (x, y) in f.pts(v):
            w = rng.uniform(0.7, 1.7)
            f.shape(f.m_ell(x + rng.uniform(-0.8, 0.8), y + rng.uniform(-0.8, 0.8), w * 1.2, w), 'ferrugem', R=2, bias=rng.uniform(-0.3, 0.0), clip=rm)
        for (x, y) in f.pts(v)[::5]:
            f.px(x, y + 2, 'ferrugem', 0.1)
            if rng.rand() < 0.5: f.px(x + 1, y - 1, 'ferro', 0.95)                  # brilho metálico
    # manchas de óxido escorrendo
    fm = f.m_mat('ferrugem')
    for (x, y) in zip(*np.where(fm.T)):
        if rng.rand() < 0.025:
            for k in range(1, rng.randint(2, 5)):
                if y + k < 128 and f.mat[y + k, x] == f.mid('rocha'): f.px(x, y + k, 'ferrugem', 0.2 - k * 0.04)
    # musgo e terra na base
    for (x, y, r) in ((14, 126, 6), (40, 127, 5), (88, 127, 7), (116, 126, 5)):
        f.ell(x, y, r * 1.6, r * 0.6, 'terra', R=2, bias=0.05)
    for i in range(60):                                                          # líquen/musgo nas faces de cima
        x, y = rng.randint(20, 80), rng.randint(50, 90)
        if rm[y, x] and f.lum[y, x] > 0.6 and f.mat[y, x] == f.mid('rocha'): f.px(x, y, 'musgo', rng.uniform(0.3, 0.8))
    return f


def veio_vazio():
    """entulho de rocha depois de minerado; mesmo quadro do veio"""
    f = Fig(128, 128, seed=72); rng = np.random.RandomState(10)
    f.ell(64, 125, 56, 4, 'terra', R=3, tex=0.1)
    rocks = [(46, 116, 18, 11), (78, 114, 20, 13), (62, 104, 15, 10), (98, 120, 12, 7), (24, 121, 11, 6), (64, 122, 14, 6), (88, 103, 9, 7)]
    for (x, y, rx, ry) in sorted(rocks, key=lambda r: r[1]):
        pts = []
        n = rng.randint(6, 9)
        for i in range(n):
            a = i / n * 2 * np.pi + rng.uniform(-0.2, 0.2)
            k = rng.uniform(0.8, 1.05)
            pts.append((x + np.cos(a) * rx * k, min(y + np.sin(a) * ry * k, 127)))
        f.poly(pts, 'rocha', R=max(4, ry * 0.8), edge=0.25, shadow=0.25, tex=0.06)
    rm = f.m_mat('rocha')
    for (x, y) in ((70, 108), (58, 103), (84, 112), (40, 114), (96, 118)):
        f.shape(f.m_ell(x, y, rng.uniform(1.5, 2.5), 1.4), 'ferrugem', R=1.5, clip=rm)
    for i in range(14):
        x, y = rng.randint(10, 118), rng.randint(122, 127)
        f.ell(x, y, rng.uniform(1, 2.2), 1, 'rocha', R=1, bias=0.1)
    return f


# ---------------- objetos do cenário: mesma densidade das pessoas (100 px por metro) ----------------
FONTE = {'Q': '0110 1001 1001 1001 1001 1011 0111', 'U': '1001 1001 1001 1001 1001 1001 0110',
         'A': '0110 1001 1001 1111 1001 1001 1001', 'D': '1110 1001 1001 1001 1001 1001 1110',
         'R': '1110 1001 1001 1110 1010 1001 1001', 'O': '0110 1001 1001 1001 1001 1001 0110',
         'E': '1111 1000 1000 1110 1000 1000 1111', 'V': '1001 1001 1001 1001 1001 0110 0110',
         'I': '111 010 010 010 010 010 111', 'S': '0111 1000 1000 0110 0001 0001 1110'}


def letreiro(f, txt, cx, y, mat, lum):
    """letras de 4x7 com traço de 2 px, centradas em cx, numa linha só; espaço de 2 px além dos vãos"""
    larg = [2 if c == ' ' else len(FONTE[c].split()[0]) * 2 for c in txt]
    x = int(cx - (sum(larg) + 2 * (len(txt) - 1)) / 2)
    for c, w in zip(txt, larg):
        for j, row in enumerate(FONTE[c].split() if c != ' ' else []):
            for i, b in enumerate(row):
                if b == '1':
                    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)): f.px(x + i * 2 + dx, y + j * 2 + dy, mat, lum)
        x += w + 2


def tabua(f, x0, y0, x1, y1, bias=0.0, seed=None, veios=3):
    """tábua horizontal com veios do próprio material"""
    f.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 'madeira', R=max(3, (y1 - y0) * 0.5), tex=0.05, bias=bias, edge=0.12, shadow=0.15, seed=seed)
    rng = np.random.RandomState(seed)
    for _ in range(veios):
        y = rng.randint(y0 + 2, max(y0 + 3, y1 - 1)); a = rng.randint(x0, x1 - 20); b = a + rng.randint(14, 46)
        f.fold([(a, y), (min(b, x1 - 1), y + rng.randint(-1, 2))], .12, .0)


def aviso(f, x, y, w, h, tilt, seed, selo=False):
    """papel pregado: folha clara com linhas de escrita, prego no alto e canto de baixo dobrado"""
    rng = np.random.RandomState(seed)
    pts = [(x, y + tilt), (x + w, y - tilt), (x + w + tilt, y + h - tilt), (x + tilt, y + h + tilt)]
    m = f.m_poly(pts)
    f.soft(m, 0.3, sigma=1.0, off=(2, 2))
    f.shape(m, 'papel', flat=0.74, tex=0.05, seed=seed)
    for k, yy in enumerate(range(y + 9, y + h - 6 - (8 if selo else 0), 5)):
        a = x + 4 + rng.randint(0, 2) + (tilt * (yy - y)) // h
        b = x + w - 4 - rng.randint(0, 7) if k else x + w - 9
        for xx in range(a, b):
            if rng.rand() < 0.8: f.px(xx, yy - (2 * tilt * (xx - x)) // w, 'madeira', 0.2)
    if selo: f.ell(x + w - 9, y + h - 8, 3.6, 3.4, 'couro_v', R=3, bias=0.28)
    f.px(x + w + tilt - 1, y + h - tilt - 1, 'papel', 0.3); f.px(x + w + tilt - 2, y + h - tilt, 'papel', 0.3)
    cx = x + w // 2
    for dx, dy, l in ((0, 2, .5), (1, 2, .3), (0, 3, .3), (1, 3, .15)): f.px(cx + dx, y + dy, 'ferro', l + .2)


def quadro_frente():
    """frente do quadro de avisos, aplicada numa peça 3D de 1,56 x 1,24 m: letreiro, tábuas, papéis e travessa"""
    f = Fig(156, 124, seed=81)
    tabua(f, 0, 0, 156, 26, bias=-0.22, seed=83, veios=4)                             # letreiro: tábua escura, letras claras
    letreiro(f, 'QUADRO DE AVISOS', 78, 6, 'linho_c', 0.95)
    for i, y in enumerate(range(26, 116, 15)): tabua(f, 0, y, 156, y + 15, bias=-0.04 + 0.03 * (i % 2), seed=84 + i)
    tabua(f, 0, 114, 156, 124, bias=-0.12, seed=91, veios=2)                          # travessa de baixo
    aviso(f, 13, 32, 32, 44, 1, 92); aviso(f, 50, 37, 28, 36, -1, 93, selo=True)
    aviso(f, 83, 30, 30, 40, 1, 94); aviso(f, 118, 36, 26, 46, -1, 95)
    aviso(f, 28, 70, 30, 36, -1, 96, selo=True); aviso(f, 76, 66, 34, 42, 1, 97)
    for (x, y) in ((4, 12), (151, 12), (4, 119), (151, 119)): f.px(x, y, 'ferro', 0.8); f.px(x + 1, y + 1, 'ferro', 0.3)
    return f


def bau_frente():
    """frente do baú, aplicada numa peça 3D de 0,98 x 0,45 m: tábuas, borda, cintas de ferro e fecho"""
    f = Fig(98, 45, seed=101)
    f.poly([(0, 2), (98, 2), (98, 45), (0, 45)], 'madeira', R=16, tex=0.05, vgrad=0.14, shadow=0.2, seed=104)
    for y in (17, 31): f.fold([(1, y), (97, y)], .2, .08)
    f.poly([(0, 0), (98, 0), (98, 6), (0, 6)], 'madeira', R=3, bias=0.1, tex=0.04, seed=105)   # borda de cima
    for x in (6, 86):
        f.poly([(x, 0), (x + 7, 0), (x + 7, 45), (x, 45)], 'ferro', R=3.5, bias=-0.06, edge=0.1)
        for y in (9, 23, 37): f.px(x + 3, y, 'ferro', 1.0); f.px(x + 4, y + 1, 'ferro', 0.2)
    f.poly([(17, 6), (27, 6), (27, 18), (22, 21), (17, 18)], 'latao', R=4, shadow=0.2)         # fecho
    f.px(22, 12, 'latao', 0.05); f.px(22, 13, 'latao', 0.05)
    return f


def bau_tampa():
    """lado de dentro da tampa aberta, aplicado numa peça 3D de 0,98 x 0,60 m"""
    f = Fig(98, 60, seed=102)
    f.poly([(0, 0), (98, 0), (98, 60), (0, 60)], 'madeira', R=20, tex=0.05, bias=-0.26, seed=102)
    for y in (15, 30, 45): f.fold([(1, y), (97, y)], .16, .05)
    for x in (9, 89):
        f.poly([(x - 3, 0), (x + 3, 0), (x + 3, 60), (x - 3, 60)], 'ferro', R=3, bias=-0.2)
    return f


def bau_couro():
    """couro de coelho pendurado na borda do baú, recortado: peça 3D de 0,48 x 0,60 m"""
    f = Fig(48, 60, seed=106); dx, dy = -42, -40
    S = lambda pts: [(x + dx, y + dy) for x, y in pts]
    m = (f.m_poly(S([(53, 62), (79, 62), (84, 72), (82, 88), (74, 96), (58, 96), (50, 88), (48, 72)]))
         | f.m_cap(53 + dx, 66 + dy, 46 + dx, 63 + dy, 4, 3) | f.m_cap(79 + dx, 66 + dy, 86 + dx, 63 + dy, 4, 3)
         | f.m_cap(54 + dx, 90 + dy, 48 + dx, 96 + dy, 4, 3) | f.m_cap(78 + dx, 90 + dy, 84 + dx, 96 + dy, 4, 3)
         | f.m_ell(66 + dx, 58 + dy, 7, 6))
    for x0, x1 in ((63, 58), (69, 74)):
        f.cap(x0 + dx, 54 + dy, x1 + dx, 41 + dy, 3, 2.6, 'pelo', R=3, bias=-0.04, shadow=0.25, seed=108)
        f.cap(x0 + dx, 53 + dy, x1 + dx, 43 + dy, 1.2, 1, 'orelha', R=2, bias=0.1)
    f.shape(m, 'pelo', R=9, tex=0.07, shadow=0.3, bias=-0.04, seed=106)
    f.adj(f.m_ell(66 + dx, 79 + dy, 9, 12), 0.1, clip=f.m_mat('pelo'))                # lombo mais claro
    f.ell(66 + dx, 96 + dy, 2.6, 2.3, 'pelo_c', R=2, bias=0.1)                        # rabinho
    return f


def lenha_topo():
    """topo cortado de uma tora: 0,16 m de diâmetro, com cerne e anéis (como o toco)"""
    f = Fig(16, 16, seed=109); x = y = 7.5; r = 7.5
    f.ell(x, y, r, r, 'cerne', flat=0.72, edge=0.1)
    for q in (0.68, 0.36):
        m = f.m_ell(x, y, r * q, r * q) & ~f.m_ell(x, y, r * q - 1, r * q - 1); f.adj(m, -0.42)
    f.adj(f.m_ell(x, y, r, r) & ~f.m_ell(x, y, r - 1, r - 1), -0.3)
    f.line([(x, y), (x + r - 2, y + 2)], 'cerne', 0.25)
    return f


# ---------------- espada em primeira pessoa (quadro 160x160; a mão fica perto do canto inferior direito) ----------------
EH = (122.0, 126.0)                       # referência da mão no quadro
ED = np.array([-0.671, -0.741])          # direção da lâmina (para o alto à esquerda)
EN = np.array([0.741, -0.671])           # perpendicular (lado de cima/direita da lâmina, o lado iluminado)


def espada(lam='aco'):
    f = Fig(160, 160, seed=81)
    H = np.array(EH); d, n = ED, EN
    P = lambda v: (float(v[0]), float(v[1]))
    def box(c, la, lb, ax=d, bx=n):   # retângulo girado: meio-comprimento la ao longo de ax, lb ao longo de bx
        return [P(c + ax * la + bx * lb), P(c + ax * la - bx * lb), P(c - ax * la - bx * lb), P(c - ax * la + bx * lb)]
    gc = H + d * 22                                        # centro da guarda
    # lâmina: duas metades (fio de cima iluminado, de baixo na sombra), ponta afiada
    b0, L = gc + d * 3, 104
    def half(sgn, bias):
        pts = [P(b0), P(b0 + n * sgn * 6.5), P(b0 + d * (L - 22) + n * sgn * 5), P(b0 + d * L), P(b0 + d * (L - 22))]
        f.poly(pts, lam, R=3, bias=bias)
    half(1, 0.12); half(-1, -0.18)
    for t in range(5, L - 24):                             # canal central (fuller) e brilho
        c = b0 + d * t
        f.px(round(c[0]), round(c[1]), lam, 0.18); f.px(round(c[0] + n[0]), round(c[1] + n[1]), lam, 0.3)
        h = c + n * 3.3
        if t % 11 < 7: f.px(round(h[0]), round(h[1]), lam, 0.98)
    f.line([P(b0 + d * 26 - n * 5), P(b0 + d * 60 - n * 4.4)], lam, 0.5)   # reflexo no fio de baixo
    # guarda reta com pontas arredondadas
    g = box(gc, 3, 24)
    f.soft(f.m_poly(g), 0.15); f.poly(g, 'ferro', R=3)
    for sg in (1, -1): f.ell(*P(gc + n * sg * 24), 3.5, 3.5, 'ferro', R=3, bias=0.05 if sg > 0 else -0.1)
    # cabo com couro e pomo (o pomo aparece entre a mão e o braço)
    f.cap(*P(gc - d * 2), *P(gc - d * 36), 4, 4, 'cinto', R=3)
    pm = gc - d * 40
    f.ell(*P(pm), 7, 7, 'ferro', R=6); f.ell(*P(pm + d * 2 + n * 2), 2.2, 2.2, 'ferro', R=2, bias=0.15)
    luva_no_cabo(f, gc - d * 19, d, n)
    return f


def espada_rastro():
    """rastro do corte: arco de pontos claros que fica mais denso perto do fim (direita-alto -> esquerda-baixo)"""
    f = Fig(256, 192, seed=82); rng = np.random.RandomState(12)
    cx, cy, R = 214.0, 214.0, 196.0
    ang = np.degrees(np.arctan2(-(f.Y - cy), f.X - cx)); rr = np.hypot(f.X - cx, f.Y - cy)
    t = np.clip((ang - 98) / (176 - 98), 0, 1)              # 0 no começo do arco, 1 no fim
    w = 4 + 22 * t
    band = (ang >= 98) & (ang <= 176) & (rr <= R) & (rr >= R - w)
    inner = (rr - (R - w)) / np.maximum(w, 1)             # 0 por dentro, 1 na borda de fora (onde passa a ponta)
    dens = t * (0.25 + 0.75 * inner)
    keep = band & (rng.uniform(0, 1, band.shape) < dens * 1.15)
    f.mat[keep] = f.mid('rastro'); f.lum[keep] = (0.35 + 0.65 * inner)[keep]
    return f


def _rot(d, n):
    """funções de apoio das armas: P (ponto -> tupla) e box (retângulo girado ao longo de d/n)"""
    P = lambda v: (float(v[0]), float(v[1]))
    def box(c, la, lb, ax=d, bx=n):
        return [P(c + ax * la + bx * lb), P(c + ax * la - bx * lb), P(c - ax * la - bx * lb), P(c - ax * la + bx * lb)]
    return P, box


def luva_no_cabo(f, hc, d=ED, n=EN):
    """manopla de couro fechada num cabo que passa por hc na direção d (o polegar fica do lado n), com o cano
    alargando para o pulso no canto de baixo à direita do quadro; igual à mão da espada"""
    P, box = _rot(d, n)
    arm = f.m_poly([(118, 152), (122, 132), (136, 122), (152, 124), (156, 140), (146, 156), (128, 158)])
    f.soft(arm, 0.12); f.shape(arm, 'luva', R=9, tex=0.03, bias=-0.04)
    for k in range(3): f.fold([(126 + k * 9, 155), (134 + k * 7, 128)], .12, .06, clip=arm)
    f.crease([(122, 134), (138, 124), (152, 126)], .1)
    back = box(hc + n * 4, 13, 12)
    f.soft(f.m_poly(back), 0.16); f.poly(back, 'luva', R=8, tex=0.03)
    for k in range(4):                                     # dedos: rolos ao longo do cabo, do lado de baixo
        c = hc - n * 7 + d * (9 - k * 6.2)
        m = f.m_ell(c[0], c[1], 5.2, 4.4)
        f.soft(m, 0.1); f.shape(m, 'luva', R=4, tex=0.03, bias=-0.04 * k)
        f.crease([P(c + d * 3 - n * 3), P(c + d * 3 + n * 3)], .14)
    th0, th1 = hc + n * 9 + d * 2, hc + n * 3 + d * 15     # polegar
    f.cap(*P(th0), *P(th1), 5, 3.8, 'luva', R=4, tex=0.03, bias=0.05)
    f.crease([P(th0 - n * 3), P(th1 - n * 3)], .12)
    for k in range(3): f.crease([P(hc + n * (10 - k * 2) - d * (6 - k * 6)), P(hc + n * (14 - k * 2) - d * (2 - k * 6))], .07)  # tendões
    cf = box(hc - d * 15 + n * 5, 5, 14)                   # punho da luva
    f.soft(f.m_poly(cf), 0.12); f.poly(cf, 'luva', R=4, bias=-0.08, tex=0.03)
    f.crease([P(hc - d * 11 + n * 16), P(hc - d * 11 - n * 8)], .14)


# ---------------- armas em primeira pessoa (quadro 160x160, mão em EH, como a espada) ----------------
MAT.update({
    'freixo': ramp('2a1c10', '45301c', '624629', '7e5d38', '99764a', 'b18e5e'),   # cabo de freixo, claro
    'teixo': ramp('2e140a', '4c2412', '6e381c', '8e5028', 'ad6a38', 'c8874e'),    # arco de teixo (cerne alaranjado)
    'corda_a': ramp('4a4436', '6e6650', '948a6e', 'b6ac8e', 'd2caae'),            # corda do arco, linho encerado
    'pena': ramp('3a3a36', '6a675e', '9a968a', 'c8c4b6', 'e6e2d6'),
})
DITHER.update({'freixo': 0.4, 'teixo': 0.35})


def _cabo_machado(f, hc, L, d, n, mat='freixo', r=3.4):
    """cabo de freixo levemente curvo: do toco abaixo da mão até a cabeça; a ponta de baixo alarga num punho"""
    P, box = _rot(d, n)
    pts = [hc - d * 18, hc + d * (L * .35) + n * 1.2, hc + d * (L * .75) + n * 1.0, hc + d * L]
    m = np.zeros((f.h, f.w), bool)
    for a, b in zip(pts, pts[1:]): m |= f.m_cap(*P(a), *P(b), r, r * .92)
    m |= f.m_ell(*P(hc - d * 18), r + 1.6, r + 1.6)
    f.soft(m, .14); f.shape(m, mat, R=r, tex=.05, bias=.02)
    for t in range(-14, int(L), 9):                          # veio da madeira
        c = hc + d * t + n * ((t // 9) % 2 - .5)
        f.line([P(c), P(c + d * 5)], mat, .25)
    return P, box


def _cabeca(f, T, d, n, pts_ab, mat, bias=0.0, R=5):
    """polígono dado em coordenadas (a ao longo do cabo, b para o lado n) a partir do centro T"""
    P = lambda v: (float(v[0]), float(v[1]))
    pts = [P(T + d * a + n * b) for a, b in pts_ab]
    m = f.m_poly(pts); f.soft(m, .18, sigma=1.6, off=(2, 3)); f.shape(m, mat, R=R, tex=.03, bias=bias)
    return m


def _fio(f, T, d, n, pts_ab, mat, lum=.98, larg=2):
    """fio afiado: faixa clara ao longo da borda de corte"""
    P = lambda v: (float(v[0]), float(v[1]))
    for k in range(larg):
        f.line([P(T + d * a + n * (b + (k if b < 0 else -k))) for a, b in pts_ab], mat, lum - k * .25)


def machado_trabalho():
    """machado de trabalho (de lenhador): cabo de freixo, cabeça de ferro pequena em cunha com olho e nuca curta,
    fio de aço caldeado; mesma mão e mesmo pivô da espada (a lâmina corta para a esquerda, do lado -n)"""
    f = Fig(160, 160, seed=91); d, n = ED, EN; H = np.array(EH); hc = H + d * 3
    P, box = _cabo_machado(f, hc, 100, d, n)
    T = hc + d * 92
    _cabeca(f, T, d, n, [(9, 7), (9, -4), (12, -14), (15, -24), (13, -27), (-11, -27), (-13, -24), (-10, -14), (-8, -4), (-8, 7)], 'ferro', .02)
    nuca = _cabeca(f, T, d, n, [(7, 4), (7, 10), (-6, 10), (-6, 4)], 'ferro', -.08, R=3)
    f.crease([P(T + d * 8 - n * 4), P(T - d * 7 - n * 4)], .2)                    # olho (onde o cabo entra)
    f.crease([P(T + d * 11 - n * 15), P(T - d * 9 - n * 15)], .14)                # onde começa o aço do fio
    fio = _cabeca(f, T, d, n, [(13, -16), (15, -24), (13, -27), (-11, -27), (-13, -24), (-11, -16)], 'aco', .12, R=3)
    _fio(f, T, d, n, [(14, -26), (5, -27.3), (-5, -27.3), (-12, -26)], 'aco', .98)
    f.px(*P(T + d * 2 + n * 7), 'ferro', .9)
    luva_no_cabo(f, hc, d, n)
    return f


def machado_guerra():
    """machado de guerra (de barba, à moda dos dinamarqueses): cabo mais longo, cabeça fina com a lâmina larga que
    desce em barba junto ao cabo, fio de aço comprido e curvo, aro de latão no olho"""
    f = Fig(160, 160, seed=92); d, n = ED, EN; H = np.array(EH); hc = H + d * 3
    P, box = _cabo_machado(f, hc, 112, d, n, r=3.2)
    T = hc + d * 102
    lam = [(8, 4), (8, -4), (12, -12), (17, -24), (18, -32), (14, -38), (2, -40), (-12, -39), (-26, -35), (-32, -31), (-26, -26), (-17, -15), (-10, -6), (-8, -4), (-8, 4)]
    _cabeca(f, T, d, n, lam, 'ferro', .04, R=6)
    f.crease([P(T + d * 8 - n * 4), P(T - d * 8 - n * 4)], .2)
    f.crease([P(T + d * 14 - n * 28), P(T - d * 20 - n * 26)], .12)
    _cabeca(f, T, d, n, [(16, -28), (18, -32), (14, -38), (2, -40), (-12, -39), (-26, -35), (-32, -31), (-26, -29), (-12, -31), (2, -32)], 'aco_af', .1, R=3)
    _fio(f, T, d, n, [(17, -34), (12, -38.5), (2, -40.3), (-12, -39.4), (-26, -35.4), (-31, -31.6)], 'aco_af', .98)
    aro = [box(T + d * 9, 1.6, 5.2), box(T - d * 9, 1.6, 5.2)]
    for a in aro: f.poly(a, 'latao', R=1.5, bias=.05)
    luva_no_cabo(f, hc, d, n)
    return f


def machado_duas_faces():
    """machado de duas faces: duas lâminas em meia-lua, uma de cada lado do olho, com o fio temperado (azulado);
    cabo comprido com tiras de couro abaixo da cabeça"""
    f = Fig(160, 160, seed=93); d, n = ED, EN; H = np.array(EH); hc = H + d * 3
    P, box = _cabo_machado(f, hc, 108, d, n, r=3.3)
    T = hc + d * 96
    for s in (-1, 1):
        lam = [(7, 4 * s), (10, 12 * s), (17, 22 * s), (20, 29 * s), (10, 31 * s), (0, 31.6 * s), (-10, 31 * s), (-20, 29 * s), (-17, 22 * s), (-10, 12 * s), (-7, 4 * s)]
        _cabeca(f, T, d, n, lam, 'ferro', .06 if s > 0 else -.04, R=6)
        f.crease([P(T + d * 14 + n * 20 * s), P(T + n * 13 * s), P(T - d * 14 + n * 20 * s)], .14)
        _cabeca(f, T, d, n, [(18, 25 * s), (20, 29 * s), (10, 31 * s), (0, 31.6 * s), (-10, 31 * s), (-20, 29 * s), (-18, 25 * s), (0, 27 * s)], 'aco_t', .12, R=3)
        _fio(f, T, d, n, [(19, 29 * s), (10, 31.2 * s), (0, 31.8 * s), (-10, 31.2 * s), (-19, 29 * s)], 'aco_t', .98)
    _cabeca(f, T, d, n, [(9, 5), (9, -5), (-9, -5), (-9, 5)], 'ferro', -.02, R=3)
    f.crease([P(T + d * 9), P(T - d * 9)], .16)
    for t in range(68, 84, 4):                                 # tiras de couro enroladas sob a cabeça
        f.poly(box(hc + d * t, 1.6, 4.4), 'cinto', R=1.5, bias=.05 if t % 8 else -.08)
    luva_no_cabo(f, hc, d, n)
    return f


def _arco(f, L_cima, L_baixo, curva, larg, puxado=False):
    """arco de teixo em pé, um pouco inclinado, seguro pela mão em EH; a barriga curva para a esquerda e as pontas
    para a direita, onde passa a corda. puxado: a corda vai até o rosto (fora do quadro, à direita) com a flecha"""
    H = np.array(EH)
    u = np.array([-0.30, -0.954]); u = u / np.linalg.norm(u); p = np.array([-u[1], u[0]])   # p: para a direita
    if puxado: curva *= 1.35
    def s(t):                                                    # ponto da vara a t px da empunhadura
        L = L_cima if t > 0 else L_baixo
        return H + u * t + p * curva * (abs(t) / L) ** 1.8 * L
    ts = np.linspace(-L_baixo, L_cima, 90)
    m = np.zeros((f.h, f.w), bool)
    for a, b in zip(ts, ts[1:]):
        r0 = larg * (1 - .55 * min(1, abs(a) / (L_cima if a > 0 else L_baixo)) ** 1.5)
        r1 = larg * (1 - .55 * min(1, abs(b) / (L_cima if b > 0 else L_baixo)) ** 1.5)
        m |= f.m_cap(*s(a), *s(b), r0, r1)
    # corda (de ponta a ponta, ou em V até o rosto)
    topo, base = s(L_cima - 2), s(-L_baixo + 2)
    if puxado:
        N = np.array([176.0, 158.0])
        f.line([tuple(topo), tuple(N)], 'corda_a', .75); f.line([tuple(base), tuple(N)], 'corda_a', .6)
    f.soft(m, .16, sigma=1.6, off=(2, 3)); f.shape(m, 'teixo', R=larg, tex=.04)
    # alburno claro na face de trás (a do lado da corda) e as pontas de chifre
    for a, b in zip(ts, ts[1:]):
        if abs(a) < 12: continue
        f.line([tuple(s(a) + p * (larg * .5)), tuple(s(b) + p * (larg * .5))], 'teixo', .95)
    for t in (L_cima, -L_baixo):
        c = s(t); f.ell(c[0], c[1], 2.6, 3.4, 'chifre', R=2, bias=.05)
    if not puxado:
        f.line([tuple(topo), tuple(base)], 'corda_a', .75)
    else:
        # flecha: da corda (fora do quadro) por cima da mão, ponta além da vara
        A = s(0) - p * 2 + u * 3; dirv = (A - N) / np.linalg.norm(A - N); ponta = A + dirv * 34
        f.cap(*N, *ponta, 1.3, 1.3, 'freixo', R=1, bias=.1)
        for k in (-1, 1):                                          # penas perto da corda (cortadas pela borda)
            q = N + dirv * 28; f.poly([tuple(q), tuple(q + dirv * 18 + np.array([-dirv[1], dirv[0]]) * 3.4 * k), tuple(q + dirv * 22)], 'pena', R=1.5, bias=.05 * k)
        f.poly([tuple(ponta + dirv * 9), tuple(ponta + np.array([-dirv[1], dirv[0]]) * 3), tuple(ponta - np.array([-dirv[1], dirv[0]]) * 3)], 'aco', R=1.5, bias=.1)
    # empunhadura de couro e a mão fechada na vara
    for t in range(-9, 10, 3): f.line([tuple(s(t) - p * (larg + .5)), tuple(s(t) + p * (larg + .5))], 'cinto', .45 if t % 2 else .3)
    luva_no_cabo(f, H, u, p)
    return f


def arco_curto():
    """arco curto de caça, de teixo, de pontas simples; a parte de baixo sai pela borda do quadro"""
    return _arco(Fig(160, 160, seed=94), 96, 70, .2, 4.4)


def arco_longo():
    """arco longo inglês: uma vara inteira de teixo, reta e funda (sem recurva), mais alta que o quadro; pontas de chifre"""
    return _arco(Fig(160, 160, seed=95), 128, 120, .15, 5.2)


def arco_curto_tenso():
    return _arco(Fig(160, 160, seed=94), 96, 70, .2, 4.4, puxado=True)


def arco_longo_tenso():
    return _arco(Fig(160, 160, seed=95), 128, 120, .15, 5.2, puxado=True)



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


def t_placa_ferreiro(px):
    t_tabuas(px)
    for x0, y0, x1, y1 in ((36, 10, 44, 26), (14, 16, 36, 20),                     # martelo: cabeça e cabo
                           (16, 32, 50, 38), (11, 33, 16, 36), (26, 38, 40, 44), (20, 44, 46, 50)):  # bigorna: mesa, ponta, cintura, base
        for y in range(y0, y1):
            for x in range(x0, x1): px[x, y] = hx('d9b24a')


def t_placa_padaria(px):
    t_tabuas(px); ouro = hx('d9b24a'); fundo = hx('3a2618')
    for y in range(20, 46):  # pão de forma redonda, com três cortes
        for x in range(10, 54):
            if ((x - 32) / 22) ** 2 + ((y - 33) / 13) ** 2 < 1: px[x, y] = ouro
    for i, x0 in enumerate((20, 30, 40)):
        for j in range(11):
            for t in range(2): px[x0 + j // 2 + t, 26 + j] = fundo


def t_lavoura(px):
    """terra arada: dois camalhões por quadro, com a crista em y = 16 e y = 48; a 2 m por repetição dá uma fileira por metro"""
    noise(px, hx('64503a'), 7, 31); random.seed(32)
    for y in range(S):
        d = min(abs(y - 16), abs(y - 48))
        k = 1.2 if d < 5 else 1.0 if d < 10 else 0.72 if d < 14 else 0.58
        for x in range(S):
            c = px[x, y]; px[x, y] = (int(c[0] * k), int(c[1] * k), int(c[2] * k), 255)
    for _ in range(70):  # torrões na crista, com a sombra embaixo
        x, y = random.randint(0, 63), random.choice((16, 48)) + random.randint(-6, 6)
        px[x, y % S] = hx('8d7454'); px[(x + 1) % S, y % S] = hx('7a6448'); px[x, (y + 1) % S] = hx('3e3020')


def caules_trigo():
    random.seed(41); xs = []; x = 2
    while x < 62: xs.append(x); x += random.choice((3, 4, 4, 5))
    return xs


def t_trigo_caule(px):
    """metade de baixo do pé de trigo (a 100 px por metro, recortada por alfa): as hastes seguem até a metade de cima"""
    topo, meio, base, sombra = hx('c9a23e'), hx('a98a34'), hx('7f7530'), hx('565328')
    for i, x in enumerate(caules_trigo()):
        random.seed(50 + i)
        for y in range(S):
            c = topo if y < 20 else meio if y < 44 else base
            px[x, y] = c
            if i % 3 == 0: px[min(63, x + 1), y] = dark(c, .8)
        for y in range(44, S):  # o pé é mais fechado perto do chão
            q = x + 2 + (y % 2)
            if q < 64 and (i + y // 5) % 2: px[q, y] = sombra
    random.seed(44)
    for _ in range(15):  # folhas que saem das hastes e caem para os lados
        x, y, s = random.randint(6, 58), random.randint(12, 46), random.choice((-1, 1)); c = random.choice([hx('a8953a'), hx('8c8a38'), hx('bda548')])
        for i in range(random.randint(10, 16)):
            q = x + s * i; p = y - 4 + (i * i) // 9
            if 0 <= q < 64 and 0 <= p < 64: px[q, p] = c; px[q, min(63, p + 1)] = dark(c, .8)


def t_trigo_espiga(px):
    """metade de cima do pé de trigo: a haste, a espiga de grãos em duas fileiras e as barbas"""
    claro, ouro, escuro, barba = hx('f2d878'), hx('deb448'), hx('a87c28'), hx('ecd590')
    for i, x in enumerate(caules_trigo()):
        random.seed(70 + i); y0 = random.randint(4, 26); lean = random.choice((-1, 0, 0, 1))
        for y in range(y0 + 14, S): px[x, y] = hx('c9a23e')
        for j in range(15):  # j = 0 na ponta
            cx = x + (lean if j < 7 else 0); y = y0 + j
            if j < 2: px[max(0, min(63, cx)), y] = ouro; continue
            if j % 2:
                for dx, c in ((-1, claro), (0, escuro), (1, ouro)):
                    if 0 <= cx + dx < 64: px[cx + dx, y] = c
            else:
                for dx, c in ((-1, ouro), (0, claro), (1, escuro)):
                    if 0 <= cx + dx < 64: px[cx + dx, y] = c
            if j % 3 == 2:
                for s in (-1, 1):
                    for k in range(1, random.randint(5, 8)):
                        q, p = cx + s * (1 + k // 2), y - k
                        if 0 <= q < 64 and p >= 0: px[q, p] = barba


def folha(px, x0, y0, x1, y1, curva, largura, cores, ponta=True):
    """folha em curva de (x0, y0) até (x1, y1), com a borda clara do lado da luz; curva = quanto a ponta cai; ponta=False dá folha larga, de borda ondulada"""
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 2
    for i in range(n + 1):
        t = i / n; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t + curva * t * t
        w = largura * ((1 - t) ** .6 if ponta else (.72 + .28 * math.sin(t * 17)) * math.sin(math.pi * min(1, t * .96 + .04)) ** .55) + .5
        for dx in range(-int(w) - 1, int(w) + 2):
            if abs(dx) > w: continue
            q, p = int(x + dx), int(y)
            if 0 <= q < 64 and 0 <= p < 64: px[q, p] = cores[0] if dx > w * .4 else cores[2] if dx < -w * .4 else cores[1]


def t_cebola(px):
    """folhas tubulares da cebola, que nascem do pescoço do bulbo; o bulbo é peça 3D no jogo, pintado com t_bulbos"""
    verde = [hx('37602a'), hx('5a8a38'), hx('86b254')]
    for x1, y1, curva, w in ((10, 14, 14, 1.6), (54, 12, 16, 1.6), (22, 4, 5, 1.8), (43, 3, 7, 1.8), (32, 8, 0, 1.8)):
        folha(px, 32, 44, x1, y1, curva, w, verde)
    for y in range(40, 50):  # pescoço seco
        for x in range(29, 36): px[x, y] = hx('b48a48') if x < 34 else hx('8a6430')


def t_nabo(px):
    """folhas largas e onduladas do nabo, que saem do alto da raiz. O centro fica em x = 32"""
    verde = [hx('2f6026'), hx('4f8e34'), hx('7ab84a')]
    for x1, y1, curva, w in ((3, 14, 12, 6), (61, 13, 13, 6), (18, 3, 5, 6), (46, 2, 6, 6), (32, 6, 0, 6)):
        folha(px, 32, 42, x1, y1, curva, w, verde, ponta=False)
        for i in range(1, 16):  # nervura central
            t = i / 16; x = 32 + (x1 - 32) * t; y = 42 + (y1 - 42) * t + curva * t * t
            if 0 <= int(x) < 64 and 0 <= int(y) < 64: px[int(x), int(y)] = hx('bfe08a')
    for y in range(40, 48):
        for x in range(28, 37): px[x, y] = hx('4f8e34') if x < 34 else hx('2f6026')


def t_alho_poro(px):
    """leque de folhas chatas e azuladas do alho-poró, que saem de dentro do talo. O centro fica em x = 32"""
    azul = [hx('2c5a4c'), hx('43806a'), hx('74b296')]
    for x1, y1, curva, w in ((4, 16, 12, 2.6), (60, 15, 13, 2.6), (13, 4, 7, 3), (51, 3, 8, 3), (24, 0, 2, 3), (41, 0, 2, 3)):
        folha(px, 32, 34, x1, y1, curva, w, azul)
    for y in range(26, 44):
        for x in range(27, 38):
            px[x, y] = hx('5a9450') if x == 32 else hx('6e9e58') if x < 30 else hx('4a7a48') if x > 35 else hx('8ab866')


def t_bulbos(px):
    """corpos das hortaliças, que dão a volta em peças 3D: três faixas lado a lado, com o topo da peça em y = 0.
    cebola (x 0-20): casca dourada em gomos; nabo (x 21-41): ombro roxo e raiz branca; alho-poró (x 42-63): talo que esverdeia para cima"""
    random.seed(90)
    for y in range(S):
        for x in range(S):
            v = random.randint(-7, 7)
            if x < 21:
                c = hx('e0ac4c') if (x // 3) % 2 else hx('c98a30')
                if y > 54: c = hx('a0641f')
                if (x * 5 + y) % 23 == 0: c = hx('f6d898')
            elif x < 42:
                c = hx('9a4a8e') if y + (x % 2) * 3 < 26 else hx('eee7d6')
                if y < 8: c = hx('74306a')
            else:
                c = hx('6ea050') if y < 12 else hx('b8d68c') if y + (x % 2) * 2 < 24 else hx('eeead9')
            px[x, y] = tuple(max(0, min(255, c[i] + v)) for i in range(3)) + (255,)

def t_brasao(px):
    """escudo do senhor (recortado por alfa): campo vermelho, faixa dourada e o feixe de trigo que paga a vila"""
    borda, ouro, sombra = hx('d9b24a'), hx('e8c860'), hx('a07a28')
    for y in range(2, 62):
        m = 28 if y < 34 else int(28 * (1 - ((y - 34) / 28) ** 2) ** .5)
        for x in range(32 - m, 32 + m):
            b = x - (32 - m) < 3 or (32 + m) - x <= 3 or y < 5 or y > 58
            px[x, y] = borda if b else hx('8a2a26') if x < 32 else hx('74211f')
    for y in range(13, 20):
        for x in range(8, 56): px[x, y] = ouro if y < 18 else sombra
    for x, y0 in ((24, 26), (32, 24), (40, 26)):  # três espigas atadas
        for y in range(y0 + 8, 52):
            q = x + (x - 32) * max(0, y - 43) // 12 - (x - 32) * max(0, 41 - y) // 40
            px[q, y] = ouro; px[q + 1, y] = sombra
        for j in range(0, 14):  # a espiga, em grãos alternados
            px[x - 2 + j % 2, y0 + j] = ouro; px[x, y0 + j] = hx('f2d878'); px[x + 1, y0 + j] = ouro; px[x + 2 - j % 2, y0 + j] = sombra
    for x in range(22, 43):
        for y in (40, 41, 42): px[x, y] = ouro if y < 42 else sombra


def SPRITES():
    """(nome, função, rim) na ordem da folha. O padre foi aprovado como está: só perde o contorno,
    sem o escurecimento de borda (pixel a pixel igual por dentro)."""
    lista = (('coelho', coelho), ('padre', padre), ('ferreiro', ferreiro), ('taberneiro', taberneiro),
             ('anselmo', anselmo), ('arvore', arvore), ('toco', toco), ('arvore_2', arvore_2), ('toco_2', toco_2), ('arvore_3', arvore_3), ('toco_3', toco_3), ('veio', veio), ('veio_vazio', veio_vazio),
             ('espada', lambda: espada('aco')), ('espada_afiada', lambda: espada('aco_af')),
             ('espada_temperada', lambda: espada('aco_t')), ('espada_rastro', espada_rastro),
             ('machado_trabalho', machado_trabalho), ('machado_guerra', machado_guerra), ('machado_duas_faces', machado_duas_faces),
             ('arco_curto', arco_curto), ('arco_curto_tenso', arco_curto_tenso), ('arco_longo', arco_longo), ('arco_longo_tenso', arco_longo_tenso),
             ('quadro_frente', quadro_frente), ('bau_frente', bau_frente), ('bau_tampa', bau_tampa), ('bau_couro', bau_couro), ('lenha_topo', lenha_topo),
             ('faz_velho', faz_velho), ('faz_forte', faz_forte), ('faz_gordo', faz_gordo), ('faz_jovem', faz_jovem), ('mulher_cesta', mulher_cesta),
             ('mulher_tranca', mulher_tranca), ('mulher_velha', mulher_velha), ('padeira', padeira), ('menino_a', menino_a), ('menino_b', menino_b),
             ('menina', menina), ('soldado_lanca', soldado_lanca), ('soldado_escudo', soldado_escudo), ('rapaz', rapaz), ('filha_senhor', filha_senhor),
             ('senhor', senhor), ('intendente', intendente), ('vaca', vaca),
             ('alfaiate', alfaiate), ('lobo', lobo), ('veado', veado), ('ovelha', ovelha), ('ovelha_tosquiada', ovelha_tosquiada),
             ('escorpiao', escorpiao), ('serpente', serpente), ('arbusto', arbusto), ('arbusto_seco', arbusto_seco))
    return [(n, fn, 0 if n == 'padre' else 0.12) for n, fn in lista]


if __name__ == '__main__':
    old, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    oatlas = json.load(open(os.path.join(old, 'atlas.json')))
    ow = Image.open(os.path.join(old, 'walls.png')).convert('RGBA')
    def old_wall(n): i = oatlas['walls'].index(n); return ow.crop((i * S, 0, i * S + S, S))

    walls = [('pedra', old_wall('pedra')), ('tijolo', old_wall('tijolo')), ('porta', old_wall('porta')),
             ('cal', tex(t_cal)), ('telha', tex(roof(hx('9c4b32'), 3))), ('telha_escura', tex(roof(hx('5b4038'), 14))),
             ('palha', tex(t_palha)), ('tabuas', tex(t_tabuas)), ('enxaimel', tex(t_enxaimel)), ('janela', tex(t_janela)),
             ('grama', tex(t_grama)), ('terra', tex(t_terra)), ('pavimento', tex(t_pavimento)), ('placa', tex(t_placa)), ('placa_ferreiro', tex(t_placa_ferreiro)),
             ('placa_padaria', tex(t_placa_padaria)), ('lavoura', tex(t_lavoura)), ('trigo_caule', tex(t_trigo_caule)), ('trigo_espiga', tex(t_trigo_espiga)),
             ('cebola', tex(t_cebola)), ('nabo', tex(t_nabo)), ('alho_poro', tex(t_alho_poro)), ('brasao', tex(t_brasao)), ('bulbos', tex(t_bulbos))]
    sprites = [(n, fn().render(rim=rim)) for n, fn, rim in SPRITES()]

    wsheet = Image.new('RGBA', (S * len(walls), S), (0, 0, 0, 0))
    for i, (_, t) in enumerate(walls): wsheet.paste(t, (i * S, 0))
    wsheet.save(os.path.join(out, 'walls.png'))
    # sprites lado a lado, cada um com o seu quadro, alinhados no topo
    sw, sh = sum(t.width for _, t in sprites), max(t.height for _, t in sprites)
    ssheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0)); meta = []; x = 0
    for n, t in sprites:
        ssheet.paste(t, (x, 0)); meta.append({'name': n, 'x': x, 'y': 0, 'w': t.width, 'h': t.height}); x += t.width
    ssheet.save(os.path.join(out, 'sprites.png'))
    with open(os.path.join(out, 'atlas.json'), 'w') as fo:
        fo.write('{"size": %d,\n "walls": %s,\n "sprites": [\n' % (S, json.dumps([n for n, _ in walls])))
        fo.write(',\n'.join('  ' + json.dumps(m) for m in meta))
        fo.write('\n ],\n "_nota": %s}\n' % json.dumps('Arte provisória gerada por tools/gerar_arte.py (pixel art procedural). '
                                                   'Cada sprite tem o seu quadro (x, y, w, h) em sprites.png; o pé da figura fica na base do quadro. '
                                                   'Figuras sem contorno (borda só na cor do material). Paredes: quadros de 64x64 em walls.png; pedra, tijolo e porta vêm do zeitgeist1.', ensure_ascii=False))
    print('ok', len(walls), 'paredes;', ', '.join('%s %dx%d' % (m['name'], m['w'], m['h']) for m in meta))
