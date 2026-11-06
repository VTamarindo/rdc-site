"""Gera a arte PROVISÓRIA do protótipo da vila (Netzach).

- walls.png: texturas repetíveis de 64x64 (pedra, tijolo e porta vêm do zeitgeist1).
- sprites.png: figuras (billboards) em pixel art, cada uma com o seu próprio quadro
  (pessoas 96x192, coelho 96x64, árvore/toco 192x256, veio/veio vazio 128x128,
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


def galho(f, x, y, ang, L, r, depth, rng, segs):
    import math
    x1, y1 = x + math.sin(ang) * L, y - math.cos(ang) * L
    segs.append((x, y, x1, y1, r, r * 0.72))
    if depth == 0: return
    for k in (-1, 1):
        if rng.rand() < 0.9:
            galho(f, x1, y1, ang + k * rng.uniform(0.35, 0.75), L * rng.uniform(0.62, 0.8), r * 0.68, depth - 1, rng, segs)


def arvore():
    """carvalho; quadro 192x256 (o toco usa o mesmo quadro)"""
    import math
    f = Fig(192, 256, seed=61); rng = np.random.RandomState(7)
    cx, cy = 96, 84
    canopy = f.m_ell(cx, cy - 2, 92, 62)
    # copa: massa interna escura
    f.ell(cx + 2, cy + 6, 80, 46, 'folha', R=40, bias=-0.42, tex=0.06)
    # tronco e galhos (só dentro da copa)
    segs = []
    for a, L, r in ((-0.72, 50, 7.5), (0.68, 52, 8), (-0.1, 50, 7)):
        galho(f, cx + 2, 160, a, L, r, 2, rng, segs)
    for (x0, y0, x1, y1, r0, r1) in segs:
        f.shape(f.m_cap(x0, y0, x1, y1, r0, r1) & (canopy | ((f.Y > 118) & (np.abs(f.X - cx) < 42))), 'casca', R=r0, tex=0.1, edge=0.15)
    f.poly([(80, 252), (84, 222), (85, 160), (107, 160), (109, 222), (114, 252)], 'casca', R=13, tex=0.12)
    for (x0, x1) in ((66, 82), (116, 128)):                                      # raízes
        f.poly([(x0, 254), (86, 234), (106, 234), (x1, 254)], 'casca', R=6, tex=0.1, edge=0.1)
    f.poly([(78, 254), (88, 238), (102, 238), (110, 255)], 'casca', R=6, tex=0.1)
    for x in (88, 93, 99, 104):                                                  # sulcos da casca
        f.fold([(x, 164), (x + rng.randint(-2, 3), 212), (x + rng.randint(-2, 3), 250)], .3, .12)
    f.ell(98, 204, 3, 4, 'casca', R=2, bias=-0.45)                                # nó
    f.adj(f.m_ell(cx, 132, 60, 30) & f.m_mat('casca'), -0.22)                     # sombra da copa no tronco
    # lobos grandes da copa (silhueta irregular de carvalho)
    lobes = [(96, 46, 30, 22), (60, 54, 28, 22), (132, 52, 30, 22), (28, 88, 22, 18), (164, 84, 22, 18),
             (52, 84, 30, 22), (140, 84, 30, 22), (96, 76, 34, 24), (40, 112, 22, 14), (154, 110, 22, 14),
             (78, 110, 26, 15), (118, 112, 26, 14), (78, 32, 18, 14), (114, 30, 18, 13)]
    for (x, y, rx, ry) in lobes:
        dx, dy = (x - cx) / 90, (y - cy) / 56
        f.shape(f.m_ell(x, y, rx, ry), 'folha', R=rx * 0.9, bias=-0.32 * dx - 0.3 * dy - 0.08, tex=0.08, grain=2)
    # vãos: galhos que aparecem por entre as folhas
    for (x0, y0, x1, y1, r0, r1) in segs[1:]:
        if rng.rand() < 0.55:
            t0, t1 = 0.25, 0.7
            ax, ay = x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0
            bx, by = x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1
            f.shape(f.m_cap(ax, ay, bx, by, r0 * 0.9, r1 * 0.9) & canopy & (f.Y > 60), 'casca', R=3, bias=-0.15, tex=0.1)
    # tufos de folhas por toda a copa (textura) e soltos na borda
    fm = f.m_mat('folha', 'casca') & canopy
    ys, xs = np.where(fm)
    lum0 = f.lum.copy()
    for i in range(900):
        k = rng.randint(len(xs)); x, y = xs[k], ys[k]
        dx, dy = (x - cx) / 86, (y - cy) / 66
        base = lum0[y, x]
        rx, ry = rng.uniform(2.5, 5), rng.uniform(2, 3.5)
        m = f.m_ell(x, y, rx, ry)
        hi = m & ~f.m_ell(x + 1.2, y + 1.2, rx, ry)
        f.shape(m, 'folha', R=rx, bias=base - 0.62 + rng.uniform(-0.05, 0.05), tex=0.05)
        f.adj(hi, 0.1)
    for i in range(160):
        a = rng.uniform(0, 2 * math.pi)
        x = cx + math.cos(a) * rng.uniform(78, 94); y = cy - 2 + math.sin(a) * rng.uniform(44, 62)
        if y > 122: continue
        f.ell(x, y, rng.uniform(1.5, 3.5), rng.uniform(1.2, 2.5), 'folha', R=2, bias=-0.3 * math.cos(a) - 0.3 * math.sin(a) - 0.05)
    return f


def toco():
    """toco cortado no mesmo quadro da árvore"""
    f = Fig(192, 256, seed=62); rng = np.random.RandomState(8)
    for (x0, x1) in ((72, 84), (112, 122)):
        f.poly([(x0, 254), (87, 236), (105, 236), (x1, 254)], 'casca', R=6, tex=0.1, edge=0.1)
    f.poly([(83, 254), (85, 222), (108, 222), (110, 254)], 'casca', R=12, tex=0.12)
    for x in (89, 95, 101, 105): f.fold([(x, 226), (x + rng.randint(-2, 3), 252)], .3, .1)
    f.ell(96.5, 222, 12.5, 4.5, 'cerne', R=4, edge=0.1)
    f.adj(f.m_ell(96.5, 222, 12.5, 4.5) & ~f.m_ell(96.5, 222, 11, 3.5), -0.35)
    for (rx, ry) in ((8, 2.6), (4.5, 1.4)):
        m = f.m_ell(96.5, 222, rx, ry) & ~f.m_ell(96.5, 222, rx - 1, ry - 0.7); f.adj(m, -0.22)
    f.px(96, 222, 'cerne', 0.2)
    f.line([(97, 222), (104, 224)], 'cerne', 0.2)                                     # rachadura
    for (x, y, r) in ((66, 252, 3), (124, 251, 2.5), (130, 254, 2), (60, 255, 1.6), (116, 255, 2)):
        f.ell(x, y, r * 1.6, r * 0.7, 'cerne', R=1.5, bias=-0.1)                       # lascas
    return f


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
    # cano da luva (manopla de couro) alargando para o pulso
    arm = f.m_poly([(118, 152), (122, 132), (136, 122), (152, 124), (156, 140), (146, 156), (128, 158)])
    f.soft(arm, 0.12); f.shape(arm, 'luva', R=9, tex=0.03, bias=-0.04)
    for k in range(3): f.fold([(126 + k * 9, 155), (134 + k * 7, 128)], .12, .06, clip=arm)
    f.crease([(122, 134), (138, 124), (152, 126)], .1)
    # luva de couro fechada no cabo: dorso, quatro dedos enrolados e o polegar por cima
    hc = gc - d * 19
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
    # punho da luva
    cf = box(hc - d * 15 + n * 5, 5, 14)
    f.soft(f.m_poly(cf), 0.12); f.poly(cf, 'luva', R=4, bias=-0.08, tex=0.03)
    f.crease([P(hc - d * 11 + n * 16), P(hc - d * 11 - n * 8)], .14)
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
    # o padre foi aprovado como está: só perde o contorno, sem o escurecimento de borda (pixel a pixel igual por dentro)
    sprites = [(n, fn().render(rim=0 if n == 'padre' else 0.12)) for n, fn in (('coelho', coelho), ('padre', padre), ('ferreiro', ferreiro), ('taberneiro', taberneiro),
                                                 ('anselmo', anselmo), ('arvore', arvore), ('toco', toco), ('veio', veio), ('veio_vazio', veio_vazio),
                                                 ('espada', lambda: espada('aco')), ('espada_afiada', lambda: espada('aco_af')),
                                                 ('espada_temperada', lambda: espada('aco_t')), ('espada_rastro', espada_rastro),
                                                 ('quadro_frente', quadro_frente), ('bau_frente', bau_frente), ('bau_tampa', bau_tampa), ('bau_couro', bau_couro), ('lenha_topo', lenha_topo))]

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
