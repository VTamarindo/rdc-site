# -*- coding: utf-8 -*-
"""Mapa de região 2 km x 2 km (1 px = 1 m), vila inglesa do século XII.

Gera dois arquivos ao lado deste script:
  mapa-regiao-base.png       terreno, vila, campos e criação (sem ícones nem nomes)
  mapa-regiao-anotado.png    o mesmo com nomes, cavernas, ruínas, fauna, escala e norte

Uso: python gerar_mapa.py [semente]
"""
import os
import sys
import math
import numpy as np
from scipy.ndimage import zoom, distance_transform_edt, gaussian_filter, binary_dilation
from PIL import Image, ImageDraw, ImageFont

N = 2000
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1142
rng = np.random.default_rng(SEED)
AQUI = os.path.dirname(os.path.abspath(__file__))

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)


# ---------------------------------------------------------------- ruído
def octave(res):
    g = rng.standard_normal((res + 4, res + 4)).astype(np.float32)
    f = N / res
    z = zoom(g, f, order=3)
    o = int(2 * f)
    return z[o:o + N, o:o + N]


def fbm(base, octs, pers=0.5):
    tot = np.zeros((N, N), np.float32)
    amp, res = 1.0, base
    for _ in range(octs):
        if res > N // 2:
            break
        tot += amp * octave(res)
        amp *= pers
        res *= 2
    tot -= tot.mean()
    return tot / tot.std()


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(cx, cy, s, h):
    return h * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * s * s))


# ---------------------------------------------------------------- traçados (rios, estradas)
def catmull(pts, step=2.0):
    pts = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(p, float) for p in pts[i - 1:i + 3])
        n = max(2, int(np.linalg.norm(p2 - p1) / step))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(np.array(pts[-2], float))
    return np.array(out)


def meander(path, amp, wl):
    d = np.diff(path, axis=0)
    seg = np.hypot(d[:, 0], d[:, 1])
    s = np.concatenate([[0], np.cumsum(seg)])
    nrm = np.zeros_like(path)
    dd = np.gradient(path, axis=0)
    ln = np.hypot(dd[:, 0], dd[:, 1]) + 1e-6
    nrm[:, 0], nrm[:, 1] = -dd[:, 1] / ln, dd[:, 0] / ln
    ph = rng.uniform(0, 6.28, 3)
    off = (np.sin(s / wl * 6.28 + ph[0]) + 0.5 * np.sin(s / wl * 2.3 * 6.28 + ph[1])
           + 0.25 * np.sin(s / wl * 5.1 * 6.28 + ph[2]))
    taper = np.minimum(1, np.minimum(s, s[-1] - s) / 60)
    return path + nrm * (off * amp * taper)[:, None]


def draw_path(draw, path, width, fill):
    pts = [tuple(p) for p in path]
    draw.line(pts, fill=fill, width=int(round(width)), joint="curve")
    r = width / 2
    for p in pts[::6] + [pts[-1]]:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


# ---------------------------------------------------------------- rios
V = (950, 1000)  # centro da praça

rio_principal = meander(catmull([(1335, -15), (1340, 230), (1300, 450), (1215, 690), (1165, 900),
                                 (1168, 1080), (1185, 1250), (1265, 1450), (1380, 1640),
                                 (1430, 1800), (1390, 2015)]), 14, 260)
afluente_oeste = meander(catmull([(250, 760), (480, 870), (740, 1130), (960, 1215), (1180, 1250)]), 12, 200)
riacho_nordeste = meander(catmull([(1860, 520), (1620, 610), (1400, 700), (1230, 760)]), 9, 150)
riacho_sul = meander(catmull([(560, 1580), (760, 1620), (1000, 1700), (1250, 1720), (1400, 1760)]), 8, 140)

rios = [(rio_principal, 15, 10), (afluente_oeste, 9, 6), (riacho_nordeste, 6, 4), (riacho_sul, 5, 4)]

agua_img = Image.new("L", (N, N), 0)
ad = ImageDraw.Draw(agua_img)
for path, w0, w1 in rios:
    # largura cresce rio abaixo
    k = len(path)
    for i in range(0, k - 1, 4):
        w = w1 + (w0 - w1) * (i / k)
        draw_path(ad, path[i:i + 6], w, 255)

# lagoa de montanha (norte) e o charco grande (sul, sai pela borda)
def blob_poly(cx, cy, rx, ry, jit, n=60):
    ph = rng.uniform(0, 6.28, 3)
    pts = []
    for i in range(n):
        a = 6.28 * i / n
        r = 1 + jit * (0.6 * math.sin(3 * a + ph[0]) + 0.3 * math.sin(5 * a + ph[1]) + 0.2 * math.sin(9 * a + ph[2]))
        pts.append((cx + rx * r * math.cos(a), cy + ry * r * math.sin(a)))
    return pts


ad.polygon(blob_poly(1338, 225, 70, 48, 0.18), fill=255)
ad.polygon(blob_poly(1420, 1930, 260, 95, 0.2), fill=255)
ad.polygon(blob_poly(1700, 1980, 200, 70, 0.25), fill=255)
agua = np.array(agua_img) > 127

centro_rios = Image.new("L", (N, N), 0)
cd = ImageDraw.Draw(centro_rios)
for path, w0, w1 in rios:
    cd.line([tuple(p) for p in path], fill=255, width=3)
dist_rio = distance_transform_edt(~((np.array(centro_rios) > 0) | agua))

# ---------------------------------------------------------------- relevo
n1 = fbm(4, 7)
n2 = fbm(10, 5)
e = 70 + 14 * n1
e += 95 * smooth(520, 0, yy) * (0.75 + 0.25 * n2)          # terras altas ao norte
e += 45 * smooth(480, 60, xx) * (0.7 + 0.3 * n1)           # colinas a oeste
e += 55 * smooth(1500, 1950, xx) * smooth(1050, 300, yy)   # escarpa a leste (metade norte)
for cx, cy, s, h in [(1680, 330, 230, 60), (520, 430, 150, 38), (640, 1480, 170, 30),
                     (1600, 1100, 150, 42), (300, 1250, 160, 40), (1760, 1550, 130, 26),
                     (900, 560, 120, 16), (380, 900, 110, 22), (1500, 820, 120, 30)]:
    e += gauss(cx, cy, s, h)
e -= 32 * smooth(1350, 1950, yy) * smooth(600, 1100, xx)   # baixada do pântano
e -= 26 * np.exp(-dist_rio / 110) + 8 * np.exp(-dist_rio / 25)  # vales dos rios
dv = np.hypot(xx - V[0], yy - V[1])
wv = np.exp(-(dv / 300) ** 2) * 0.85
e = e * (1 - wv) + 68 * wv                                  # planície da vila
e = gaussian_filter(e, 2)

gy, gx = np.gradient(e)
slope = np.hypot(gx, gy)

# ---------------------------------------------------------------- borda natural (limites de jogo)
nb = fbm(12, 4)
lim = 150 + 45 * nb
borda_n = yy < lim
borda_l_rocha = (xx > N - lim) & (yy < 1050 + 80 * nb)
borda_l_mata = (xx > N - lim) & ~borda_l_rocha
borda_o = xx < lim
borda_s = yy > N - lim

# ---------------------------------------------------------------- biomas
nr = fbm(16, 4)
rocha = (e > 152 + 8 * nr) | borda_n | borda_l_rocha | ((slope > 1.15) & (e > 115))
rocha &= ~agua

nm = fbm(8, 5)
pantano = ((yy > 1430 + 110 * nm) & (xx > 760 + 120 * nm) & (e < 66 + 6 * nm)) | (borda_s & (xx > 820 + 80 * nm))
pantano |= (dist_rio < 90 + 30 * nm) & (yy > 1500) & (xx > 1100)
pantano &= ~agua & ~rocha
poças = pantano & (fbm(40, 3) > 0.9)

nf = fbm(6, 6)
vies = (1.6 * smooth(520, 120, xx)                      # mata antiga a oeste
        + 1.3 * np.exp(-(((xx - 1650) / 260) ** 2 + ((yy - 700) / 260) ** 2))   # nordeste
        + 1.0 * np.exp(-(((xx - 1700) / 250) ** 2 + ((yy - 1400) / 250) ** 2))  # sudeste
        + 1.0 * np.exp(-(((xx - 450) / 230) ** 2 + ((yy - 1750) / 230) ** 2))   # sudoeste
        + 0.6 * np.exp(-(((xx - 700) / 200) ** 2 + ((yy - 350) / 200) ** 2))
        - 2.6 * np.exp(-(dv / 560) ** 4)                    # clareira dos campos
        - 1.6 * np.exp(-(((xx - 470) / 230) ** 2 + ((yy - 1250) / 200) ** 2)))  # pradaria
f_val = nf + vies
floresta = (f_val > 0.75) | borda_o | borda_l_mata | (borda_s & (xx <= 820 + 80 * nm))
floresta &= ~agua & ~rocha & ~(pantano & ~borda_s)
bosque = (f_val > 0.15) & ~floresta & ~agua & ~rocha & ~pantano

pradaria = np.exp(-(((xx - 470) / 300) ** 2 + ((yy - 1250) / 260) ** 2))

# ---------------------------------------------------------------- cores do chão
def mix(a, b, t):
    t = t[..., None]
    return np.array(a, np.float32) * (1 - t) + np.array(b, np.float32) * t


nfine = fbm(60, 3)
nmed = fbm(25, 3)
umid = np.clip(0.5 + 0.25 * fbm(7, 4) + 0.4 * np.exp(-dist_rio / 120), 0, 1)
img = mix((150, 158, 86), (104, 144, 70), umid)                       # campo/grama
img = img * (1 - pradaria[..., None] * 0.6) + np.array((176, 170, 98), np.float32) * pradaria[..., None] * 0.6
img += (nfine * 5 + nmed * 6)[..., None]

c_mata = mix((38, 66, 36), (52, 84, 44), np.clip(0.5 + 0.3 * nmed, 0, 1))
img[floresta] = c_mata[floresta]
c_bosque = mix((86, 122, 58), (98, 132, 62), np.clip(0.5 + 0.3 * nmed, 0, 1))
img[bosque] = c_bosque[bosque]
c_rocha = mix((122, 118, 108), (156, 150, 138), np.clip(0.5 + 0.35 * nr + 0.15 * nfine, 0, 1))
img[rocha] = c_rocha[rocha]
c_pant = mix((84, 98, 66), (112, 116, 74), np.clip(0.5 + 0.35 * nfine, 0, 1))
img[pantano] = c_pant[pantano]
img[poças] = mix((62, 86, 82), (74, 98, 92), np.clip(0.5 + 0.3 * nfine, 0, 1))[poças]

ocupado = np.zeros((N, N), bool)   # onde não se planta árvore/pedra
ocupado |= agua

# ---------------------------------------------------------------- campos abertos (faixas)
CORES = {
    "trigo": ((212, 186, 98), (196, 168, 84)),
    "pousio": ((150, 150, 92), (138, 140, 86)),
    "nabo": ((112, 140, 66), (128, 112, 76)),
    "cebola": ((150, 138, 96), (118, 142, 78)),
    "alho": ((96, 138, 104), (124, 112, 80)),
    "pasto": None,
}
campos_rotulos = []


def rot_rect(cx, cy, w, h, ang):
    c, s = math.cos(ang), math.sin(ang)
    pts = []
    for dx, dy in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        pts.append((cx + dx * c - dy * s, cy + dx * s + dy * c))
    return pts


def mask_poly(pts):
    m = Image.new("L", (N, N), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.array(m) > 0


bloqueio_campo = agua | rocha | pantano | floresta | (dist_rio < 14)
vila_nucleo = dv < 175
campo_label = np.zeros((N, N), np.uint8)


def furlong(cx, cy, w, h, ang, cultura, faixa=10):
    pts = rot_rect(cx, cy, w, h, ang)
    m = mask_poly(pts)
    area = m.sum()
    m &= ~bloqueio_campo & ~vila_nucleo & ~ocupado
    if area == 0 or m.sum() < 0.55 * area:
        return False
    c, s = math.cos(ang), math.sin(ang)
    u = (xx - cx) * c + (yy - cy) * s
    idx = np.floor(u / faixa).astype(np.int32)
    a, b = CORES[cultura]
    alt = (idx % 2 == 0)
    cor = np.where(alt[..., None], np.array(a, np.float32), np.array(a, np.float32) * 0.93 + np.array(b, np.float32) * 0.07)
    # sulcos: linhas finas ao longo de cada faixa
    v = (xx - cx) * -s + (yy - cy) * c
    if cultura in ("nabo", "cebola", "alho"):
        fileira = (np.mod(u, 2.5) < 1.0)
        cor = np.where(fileira[..., None], np.array(b, np.float32), np.array(a, np.float32))
    elif cultura == "trigo":
        cor = cor + (fbm_fino[..., None] * 6)
    sulco = np.mod(u, faixa) < 1.0
    cor = np.where(sulco[..., None], cor * 0.82, cor)
    img[m] = cor[m]
    ocupado[m] = True
    campo_label[m] = 1
    campos_rotulos.append((cultura, cx, cy))
    return True


fbm_fino = fbm(120, 2)

# grandes campos (sistema de campos abertos): trigo é o maior
grandes = [
    # nome, região (x0,y0,x1,y1), ângulo base
    ("Campo Norte", (640, 520, 1140, 860), 0.12),
    ("Campo Oeste", (360, 830, 790, 1180), -0.35),
    ("Campo Sul", (620, 1230, 1150, 1520), 0.25),
]
for nome, (x0, y0, x1, y1), ang0 in grandes:
    y = y0
    while y < y1:
        bh = rng.uniform(110, 160)
        x = x0
        while x < x1:
            bw = rng.uniform(130, 200)
            cult = rng.choice(["trigo"] * 7 + ["nabo"] * 1 + ["pousio"] * 2)
            ang = ang0 + rng.uniform(-0.25, 0.25) + (math.pi / 2 if rng.random() < 0.35 else 0)
            furlong(x + bw / 2, y + bh / 2, bw - 6, bh - 6, ang, cult, faixa=rng.choice([8, 10, 12]))
            x += bw
        y += bh

# hortas da vila (cebola, nabo, alho-poró) perto das casas
hortas = [(1060, 900, 70, 55, 0.1, "cebola"), (1105, 955, 55, 50, 0.1, "alho"),
          (1080, 1060, 60, 50, -0.2, "nabo"), (820, 1110, 70, 50, 0.3, "alho"),
          (760, 1040, 60, 55, -0.3, "cebola"), (995, 1170, 60, 40, 0.2, "nabo"),
          (870, 840, 60, 45, 0.15, "nabo"), (1130, 1185, 40, 36, 0.0, "cebola")]
for cx, cy, w, h, ang, cult in hortas:
    pts = rot_rect(cx, cy, w, h, ang)
    m = mask_poly(pts) & ~agua & ~rocha & (dist_rio > 10)
    c, s = math.cos(ang), math.sin(ang)
    u = (xx - cx) * c + (yy - cy) * s
    a, b = CORES[cult]
    fileira = np.mod(u, 2.4) < 1.0
    cor = np.where(fileira[..., None], np.array(b, np.float32), np.array(a, np.float32))
    img[m] = cor[m]
    ocupado[m] = True
    campos_rotulos.append((cult, cx, cy))

# ---------------------------------------------------------------- pastos
pastos = []
def pasto(pts, tipo):
    m = mask_poly(pts) & ~agua & ~rocha
    tom = {"gado": (122, 152, 74), "cabras": (138, 146, 88), "galinhas": (150, 140, 96)}[tipo]
    img[m] = (img[m] * 0.5 + np.array(tom, np.float32) * 0.5)
    ocupado[m] = True
    pastos.append((pts, tipo, m))


pasto([(1205, 860), (1420, 830), (1470, 1000), (1440, 1180), (1250, 1210), (1200, 1050)], "gado")
pasto([(1210, 1280), (1360, 1270), (1400, 1400), (1280, 1430), (1230, 1350)], "gado")
pasto([(1440, 600), (1600, 660), (1640, 800), (1520, 870), (1430, 760)], "cabras")
pasto([(560, 640), (650, 600), (700, 700), (620, 760), (550, 720)], "cabras")
pasto([(860, 1060), (900, 1060), (900, 1085), (860, 1085)], "galinhas")
pasto([(835, 908), (855, 908), (855, 925), (835, 925)], "galinhas")

# ---------------------------------------------------------------- praça
praca = [(900, 962), (1000, 958), (1018, 998), (1003, 1042), (912, 1046), (888, 1004)]
mpraca = mask_poly(praca)
img[mpraca] = np.array((178, 160, 120), np.float32) + (nfine[mpraca] * 5)[:, None]
ocupado |= mpraca
fogueira_c = (1078, 1138)
mfog = (np.hypot(xx - fogueira_c[0], yy - fogueira_c[1]) < 30) & ~agua
img[mfog] = np.array((150, 140, 100), np.float32) + (nfine[mfog] * 5)[:, None]
ocupado |= mfog

# ---------------------------------------------------------------- relevo: sombreamento e curvas de nível
L = np.array([-1.0, -1.0, 1.4])
L /= np.linalg.norm(L)
ex = 1.6
nxv, nyv, nzv = -gx * ex, -gy * ex, np.ones_like(gx)
nl = np.sqrt(nxv ** 2 + nyv ** 2 + 1)
sh = (nxv * L[0] + nyv * L[1] + nzv * L[2]) / nl
sh0 = L[2]
fator = np.clip(1 + (sh - sh0) * 1.3, 0.62, 1.28)
fator = np.where(agua, 1, fator)
img *= fator[..., None]

nivel = np.floor(e / 10)
borda_niv = (nivel != np.roll(nivel, 1, 0)) | (nivel != np.roll(nivel, 1, 1))
mestra = np.floor(e / 50)
borda_mes = (mestra != np.roll(mestra, 1, 0)) | (mestra != np.roll(mestra, 1, 1))
terra = ~agua & ~campo_label.astype(bool) & ~mpraca
img[borda_niv & terra] *= 0.93
img[borda_mes & terra] *= 0.86

# água (profundidade pela distância à margem)
dm = distance_transform_edt(agua)
prof = np.clip(dm / 14, 0, 1)
cagua = mix((92, 132, 150), (42, 84, 120), prof) + (nfine * 3)[..., None]
img[agua] = cagua[agua]
margem = binary_dilation(agua, iterations=2) & ~agua
img[margem] = img[margem] * 0.5 + np.array((150, 138, 100), np.float32) * 0.5

img = np.clip(img, 0, 255).astype(np.uint8)
im = Image.fromarray(img, "RGB")
d = ImageDraw.Draw(im)

# ---------------------------------------------------------------- estradas
estradas = {
    "oeste": catmull([V, (800, 992), (600, 1012), (330, 1000), (-10, 1025)]),
    "leste": catmull([V, (1060, 1002), (1168, 1000), (1350, 975), (1600, 1050), (1820, 1060), (2010, 1085)]),
    "norte": catmull([V, (935, 900), (975, 700), (1060, 480), (1170, 260), (1190, -10)]),
    "sul": catmull([V, (940, 1120), (935, 1215), (890, 1430), (820, 1700), (760, 2010)]),
    "manor": catmull([(905, 975), (860, 920), (820, 880)]),
    "fogueira": catmull([(985, 1040), (1030, 1150), fogueira_c]),
}
for k, p in estradas.items():
    estradas[k] = meander(p, 4 if k in ("manor", "fogueira") else 9, 180)
COR_ESTRADA = (166, 142, 100)
for k, p in estradas.items():
    w = 3 if k in ("manor", "fogueira") else 6
    draw_path(d, p, w + 2, (128, 108, 76))
for k, p in estradas.items():
    w = 3 if k in ("manor", "fogueira") else 6
    draw_path(d, p, w, COR_ESTRADA)
mest = np.array(im)[..., 0] == COR_ESTRADA[0]

# trilhas (até ruínas e cavernas)
trilhas = [
    [(600, 1012), (480, 760), (360, 450), (300, 320)],
    [(1350, 975), (1500, 760), (1620, 520), (1700, 330)],
    [(890, 1430), (700, 1560), (450, 1700), (330, 1720)],
    [(1350, 975), (1550, 1250), (1600, 1500), (1680, 1680)],
]
for t in trilhas:
    p = meander(catmull(t), 10, 150)
    for i in range(0, len(p) - 1, 3):
        if i % 9 < 6:
            d.line([tuple(p[i]), tuple(p[min(i + 3, len(p) - 1)])], fill=(140, 122, 88), width=2)


def ponte(path, cor=(110, 82, 50)):
    """ponte onde o caminho cruza água"""
    for i in range(len(path)):
        x, y = int(path[i][0]), int(path[i][1])
        if 0 <= x < N and 0 <= y < N and agua[y, x]:
            j = min(i + 3, len(path) - 1)
            ang = math.atan2(path[j][1] - path[i][1], path[j][0] - path[i][0])
            a = rot_rect(x, y, 34, 9, ang)
            d.polygon(a, fill=cor, outline=(70, 50, 30))
            return (x, y)


pontes = [ponte(estradas["leste"]), ponte(estradas["sul"])]

# ---------------------------------------------------------------- construções
def casa(cx, cy, w, h, ang, telhado=(186, 156, 92), cumeeira=(150, 122, 70), sombra=True):
    if sombra:
        d.polygon(rot_rect(cx + 2.5, cy + 2.5, w, h, ang), fill=(40, 40, 30))
    d.polygon(rot_rect(cx, cy, w, h, ang), fill=telhado, outline=(96, 78, 46))
    c, s = math.cos(ang), math.sin(ang)
    d.line([(cx - w / 2 * c, cy - w / 2 * s), (cx + w / 2 * c, cy + w / 2 * s)], fill=cumeeira, width=1)
    # meia-água sombreada do lado sul/leste
    r4 = rot_rect(cx, cy, w, h, ang)
    d.polygon([(cx - w / 2 * c, cy - w / 2 * s), (cx + w / 2 * c, cy + w / 2 * s), r4[2], r4[3]],
              fill=tuple(int(v * 0.85) for v in telhado))
    d.line([(cx - w / 2 * c, cy - w / 2 * s), (cx + w / 2 * c, cy + w / 2 * s)], fill=cumeeira, width=1)
    return rot_rect(cx, cy, w + 4, h + 4, ang)


ocup_casas = Image.new("L", (N, N), 0)
oc = ImageDraw.Draw(ocup_casas)
oc.polygon(praca, fill=255)


def livre(poly):
    m = mask_poly(poly)
    return not (m & (np.array(ocup_casas) > 0)).any() and not (m & (agua | (dist_rio < 8))).any() and not (m & mest).any()


THATCH = (190, 160, 96)
PEDRA = (150, 146, 138)
ARDOSIA = (104, 104, 110)
TELHA = (164, 96, 66)

predios = {}

# igreja normanda (nave, capela-mor a leste, torre a oeste) e adro
adro = [(915, 895), (1015, 895), (1015, 952), (915, 952)]
d.polygon(adro, fill=(120, 148, 78))
d.line(adro + [adro[0]], fill=(110, 100, 80), width=2)
for _ in range(28):
    gx_, gy_ = rng.uniform(920, 1010), rng.uniform(900, 948)
    if not (932 <= gx_ <= 975 and 913 <= gy_ <= 936):
        d.rectangle([gx_, gy_, gx_ + 1, gy_ + 2], fill=(170, 168, 160))
d.rectangle([937, 918, 966, 934], fill=(40, 40, 30))
casa(952, 924, 26, 12, 0, PEDRA, (120, 116, 110))
casa(971, 924, 10, 9, 0, PEDRA, (120, 116, 110))
d.rectangle([929, 918, 939, 931], fill=(132, 128, 120), outline=(80, 78, 72))
d.line([(929, 918), (939, 931)], fill=(100, 98, 92))
d.line([(939, 918), (929, 931)], fill=(100, 98, 92))
oc.polygon(adro, fill=255)
predios["Igreja"] = (952, 924)

# salão das reuniões (lado oeste da praça)
oc.polygon(casa(872, 1000, 26, 12, math.pi / 2, (176, 146, 86)), fill=255)
predios["Salão da vila"] = (872, 1000)
# taverna (lado sul) com quintal
d.rectangle([942, 1062, 976, 1082], fill=(150, 132, 96), outline=(110, 94, 66))
oc.polygon(casa(958, 1055, 20, 10, 0.03, TELHA, (130, 74, 50)), fill=255)
oc.rectangle([942, 1062, 976, 1082], fill=255)
predios["Taverna"] = (958, 1055)
# ferreiro (a leste, na saída da ponte) com pátio de forja
d.rectangle([1028, 1015, 1050, 1032], fill=(92, 84, 74))
oc.polygon(casa(1036, 1012, 13, 8, 0.0, (150, 126, 82)), fill=255)
d.ellipse([1043, 1022, 1048, 1027], fill=(200, 90, 40), outline=(60, 40, 30))
oc.rectangle([1028, 1015, 1050, 1032], fill=255)
predios["Ferreiro"] = (1036, 1012)
# artesão
oc.polygon(casa(1034, 982, 14, 8, -0.05, THATCH), fill=255)
d.rectangle([1044, 976, 1050, 988], fill=(140, 110, 70))
predios["Artesão"] = (1034, 982)
# padaria da vila (forno comum)
oc.polygon(casa(1012, 1062, 12, 8, 0.1, THATCH), fill=255)
d.ellipse([1020, 1060, 1030, 1070], fill=(170, 120, 90), outline=(90, 60, 40))
predios["Padaria"] = (1012, 1062)
# poço e cruz do mercado
d.ellipse([951, 1000, 959, 1008], fill=(120, 116, 110), outline=(70, 68, 64))
d.ellipse([953, 1002, 957, 1006], fill=(40, 70, 90))
d.rectangle([968, 985, 972, 989], fill=(150, 146, 138))
predios["Praça"] = (955, 1004)

# casa senhorial (cerca, pátio, salão, quarto, cozinha, celeiro, pombal, pomar)
cerca = [(758, 828), (852, 822), (858, 906), (762, 912)]
d.polygon(cerca, fill=(132, 150, 84))
for i in range(4):
    a_, b_ = cerca[i], cerca[(i + 1) % 4]
    n_ = int(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) / 3)
    for k in range(n_):
        t = k / n_
        if not (i == 1 and 0.75 < t < 0.95):   # portão
            d.point((a_[0] + (b_[0] - a_[0]) * t, a_[1] + (b_[1] - a_[1]) * t), fill=(90, 70, 44))
d.polygon([(780, 846), (830, 844), (832, 880), (782, 884)], fill=(168, 152, 118))
casa(800, 856, 28, 13, -0.04, ARDOSIA, (80, 80, 86))
casa(818, 868, 9, 16, -0.04, ARDOSIA, (80, 80, 86))
casa(836, 886, 10, 8, 0, THATCH)
casa(780, 895, 20, 10, -0.04, (160, 132, 80))
d.ellipse([840, 836, 848, 844], fill=(150, 146, 138), outline=(80, 78, 72))
for _ in range(14):
    px, py = rng.uniform(766, 790), rng.uniform(834, 880)
    d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=(70, 112, 52), outline=(50, 82, 40))
oc.polygon(cerca, fill=255)
predios["Casa do Senhor"] = (800, 856)

# área das fogueiras: fossos de fogo, bancos de tronco
fx, fy = fogueira_c
d.ellipse([fx - 6, fy - 6, fx + 6, fy + 6], fill=(70, 60, 50), outline=(120, 110, 100))
d.ellipse([fx - 3, fy - 3, fx + 3, fy + 3], fill=(220, 120, 40))
for a in np.linspace(0, 6.28, 9)[:-1]:
    bx, by = fx + 15 * math.cos(a), fy + 15 * math.sin(a)
    d.polygon(rot_rect(bx, by, 7, 2, a + math.pi / 2), fill=(110, 78, 46))
for a in (0.6, 2.4, 4.2):
    px, py = fx + 25 * math.cos(a), fy + 25 * math.sin(a)
    d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=(66, 58, 50), outline=(110, 100, 90))
oc.ellipse([fx - 30, fy - 30, fx + 30, fy + 30], fill=255)
predios["Fogueiras"] = fogueira_c

# moinho d'água no rio principal
for i in range(len(rio_principal)):
    x, y = rio_principal[i]
    if y > 1120:
        casa(x - 16, y, 14, 9, 0.2, THATCH)
        d.rectangle([x - 8, y - 6, x - 5, y + 6], fill=(100, 72, 44))
        predios["Moinho"] = (x - 16, y)
        oc.rectangle([x - 26, y - 10, x - 4, y + 10], fill=255)
        break

# casas dos moradores: lotes (toft e croft) ao longo das estradas
casas = []
for k in ("oeste", "leste", "norte", "sul", "manor", "fogueira"):
    p = estradas[k]
    s_acum = 0.0
    prox = 62.0
    for i in range(1, len(p)):
        s_acum += float(np.hypot(*(p[i] - p[i - 1])))
        dcen = math.hypot(p[i][0] - V[0], p[i][1] - V[1])
        if dcen > 380:
            break
        if s_acum < prox:
            continue
        prox = s_acum + rng.uniform(19, 24)
        j = min(i + 4, len(p) - 1)
        ang = math.atan2(p[j][1] - p[i - 1][1], p[j][0] - p[i - 1][0])
        nx_, ny_ = -math.sin(ang), math.cos(ang)
        for lado in (-1, 1):
            if rng.random() < 0.08:
                continue
            w, h = rng.uniform(9, 13), rng.uniform(5, 6.5)
            off = 9 + h / 2
            cx, cy = p[i][0] + nx_ * off * lado, p[i][1] + ny_ * off * lado
            toft = rot_rect(p[i][0] + nx_ * (6 + 22) * lado, p[i][1] + ny_ * (6 + 22) * lado, 18, 42, ang)
            pe = rot_rect(cx, cy, w + 3, h + 3, ang)
            if not livre(pe):
                continue
            # quintal/horta no fundo do lote
            m = mask_poly(toft) & ~agua & ~(np.array(ocup_casas) > 0) & ~mest
            arr = np.array(im)
            u = (xx[m] - cx) * math.cos(ang) + (yy[m] - cy) * math.sin(ang)
            hort = np.where((np.mod(u, 3) < 1)[:, None], np.array((104, 128, 64)), np.array((128, 140, 78)))
            arr[m] = (arr[m] * 0.35 + hort * 0.65).astype(np.uint8)
            im.paste(Image.fromarray(arr), (0, 0))
            d = ImageDraw.Draw(im)
            # sebe/cerca do lote
            d.line(toft + [toft[0]], fill=(96, 112, 60), width=1)
            casa(cx, cy, w, h, ang, tuple(int(v * rng.uniform(0.92, 1.05)) for v in THATCH))
            # galinheiro ou chiqueiro nos fundos
            if rng.random() < 0.6:
                bx = p[i][0] + nx_ * 34 * lado + rng.uniform(-4, 4)
                by = p[i][1] + ny_ * 34 * lado + rng.uniform(-4, 4)
                d.rectangle([bx - 2, by - 2, bx + 2, by + 2], fill=(150, 120, 80), outline=(90, 70, 40))
            oc.polygon(toft, fill=255)
            ocupado[mask_poly(toft)] = True
            casas.append((cx, cy))

# ---------------------------------------------------------------- ruínas nos cantos
ruinas = [("Ruínas do Velho Burgo", 300, 300, "burgo"), ("Fortaleza Partida", 1700, 300, "forte"),
          ("Ruínas da Mata Sul", 330, 1720, "burgo"), ("Ruínas Afogadas", 1690, 1700, "afogada")]


def muro_quebrado(pts, w=3):
    for i in range(len(pts) - 1):
        a_, b_ = pts[i], pts[i + 1]
        L_ = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
        n_ = max(1, int(L_ / 4))
        for k in range(n_):
            if rng.random() < 0.28:
                continue
            t0, t1 = k / n_, (k + 1) / n_
            p0 = (a_[0] + (b_[0] - a_[0]) * t0, a_[1] + (b_[1] - a_[1]) * t0)
            p1 = (a_[0] + (b_[0] - a_[0]) * t1, a_[1] + (b_[1] - a_[1]) * t1)
            d.line([(p0[0] + 1, p0[1] + 1), (p1[0] + 1, p1[1] + 1)], fill=(60, 58, 52), width=w)
            d.line([p0, p1], fill=(168, 162, 150), width=w)


for nome, rx, ry, tipo in ruinas:
    rr = 95
    m = (np.hypot(xx - rx, yy - ry) < rr) & ~agua
    arr = np.array(im)
    chao = np.array((128, 132, 92)) if tipo != "afogada" else np.array((100, 108, 78))
    arr[m] = (arr[m] * 0.45 + chao * 0.55).astype(np.uint8)
    im.paste(Image.fromarray(arr), (0, 0))
    d = ImageDraw.Draw(im)
    ocupado[np.hypot(xx - rx, yy - ry) < rr * 0.55] = True
    if tipo == "forte":
        pts = [(rx + 60 * math.cos(a), ry + 52 * math.sin(a)) for a in np.linspace(0.3, 6.0, 40)]
        muro_quebrado(pts, 4)
        muro_quebrado([(rx - 14, ry - 14), (rx + 14, ry - 14), (rx + 14, ry + 14), (rx - 14, ry + 14), (rx - 14, ry - 14)], 4)
        for a in np.linspace(0, 6.28, 7)[:-1]:
            tx, ty = rx + 60 * math.cos(a), ry + 52 * math.sin(a)
            d.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], outline=(160, 154, 142), width=2)
    else:
        for gi in range(-2, 3):
            for gj in range(-2, 3):
                if rng.random() < 0.3 or math.hypot(gi, gj) > 2.6:
                    continue
                cx, cy = rx + gi * 30 + rng.uniform(-5, 5), ry + gj * 28 + rng.uniform(-5, 5)
                w, h = rng.uniform(12, 22), rng.uniform(9, 15)
                pts = [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy + h / 2),
                       (cx - w / 2, cy + h / 2), (cx - w / 2, cy - h / 2)]
                muro_quebrado(pts, 2)
        muro_quebrado([(rx - 70, ry - 60), (rx - 20, ry - 75), (rx + 50, ry - 66), (rx + 75, ry - 10)], 3)
    for _ in range(140):
        a, r = rng.uniform(0, 6.28), rr * math.sqrt(rng.random()) * 0.85
        px, py = rx + r * math.cos(a), ry + r * math.sin(a)
        s_ = rng.uniform(0.8, 2.2)
        d.ellipse([px - s_, py - s_, px + s_, py + s_], fill=(150, 146, 136))

# ---------------------------------------------------------------- animais de criação (pequenos, vistos de cima)
def bicho(x, y, cor, w=3, h=1.6, ang=0.0):
    d.polygon(rot_rect(x + 1, y + 1, w, h * 2, ang), fill=(50, 50, 40))
    d.polygon(rot_rect(x, y, w, h * 2, ang), fill=cor)


for pts, tipo, m in pastos:
    ys, xs = np.nonzero(m)
    # cerca
    for i in range(len(pts)):
        a_, b_ = pts[i], pts[(i + 1) % len(pts)]
        n_ = int(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) / 4)
        for k in range(n_):
            t = k / max(1, n_)
            d.point((a_[0] + (b_[0] - a_[0]) * t, a_[1] + (b_[1] - a_[1]) * t), fill=(96, 72, 44))
    if tipo == "gado":
        for _ in range(26):
            i = rng.integers(len(xs))
            cor = [(120, 80, 50), (90, 60, 40), (210, 200, 180), (60, 50, 44)][rng.integers(4)]
            bicho(xs[i], ys[i], cor, 3.5, 1.6, rng.uniform(0, 3.14))
        cx, cy = xs.mean(), ys.mean()
        casa(cx + 30, cy - 40, 14, 7, 0.3, (150, 126, 82))   # estábulo
    elif tipo == "cabras":
        for _ in range(22):
            i = rng.integers(len(xs))
            cor = [(220, 216, 200), (150, 120, 90), (80, 70, 60)][rng.integers(3)]
            bicho(xs[i], ys[i], cor, 2.0, 1.0, rng.uniform(0, 3.14))
        casa(xs.mean(), ys.mean(), 8, 6, 0.2, (150, 126, 82))
    else:
        cx, cy = xs.mean(), ys.mean()
        casa(cx, cy - 4, 6, 4, 0, (150, 120, 80))
        for _ in range(12):
            i = rng.integers(len(xs))
            d.point((xs[i], ys[i]), fill=(240, 232, 210))
            d.point((xs[i] + 1, ys[i]), fill=(170, 80, 50))

# ---------------------------------------------------------------- árvores e pedras
occ_final = ocupado | (np.array(ocup_casas) > 0) | mest | (dist_rio < 6)


def plantar(mask, dens, rmin, rmax, cores):
    ys, xs = np.nonzero(mask[::3, ::3])
    ys, xs = ys * 3, xs * 3
    sel = rng.random(len(xs)) < dens
    xs, ys = xs[sel] + rng.uniform(-1.5, 1.5, sel.sum()), ys[sel] + rng.uniform(-1.5, 1.5, sel.sum())
    rs = rng.uniform(rmin, rmax, len(xs))
    for x, y, r in zip(xs, ys, rs):
        d.ellipse([x - r + 2, y - r + 2, x + r + 2, y + r + 2], fill=(24, 40, 22))
    for x, y, r in zip(xs, ys, rs):
        c = cores[rng.integers(len(cores))]
        j = rng.uniform(0.9, 1.1)
        d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v * j) for v in c))
        d.ellipse([x - r * 0.6, y - r * 0.7, x + r * 0.1, y], fill=tuple(min(255, int(v * j * 1.18)) for v in c))


plantar(floresta & ~occ_final, 0.22, 3.0, 6.5, [(40, 74, 38), (48, 86, 42), (34, 64, 36), (56, 90, 46), (30, 58, 40)])
plantar(bosque & ~occ_final, 0.035, 2.5, 5.0, [(66, 104, 50), (78, 116, 54), (58, 96, 46)])
plantar(pantano & ~occ_final & ~poças, 0.012, 2.0, 3.5, [(84, 106, 60), (96, 112, 66)])   # salgueiros
# sebes entre os campos: algumas árvores isoladas
plantar(~occ_final & ~floresta & ~bosque & ~rocha & ~pantano & (dv < 900), 0.004, 2.5, 4.5, [(70, 108, 52)])
# ruínas cobertas pela mata (algumas árvores por cima)
for nome, rx, ry, tipo in ruinas:
    for _ in range(18):
        a, r = rng.uniform(0, 6.28), 70 * math.sqrt(rng.random())
        x, y = rx + r * math.cos(a), ry + r * math.sin(a)
        rr_ = rng.uniform(3, 5)
        d.ellipse([x - rr_, y - rr_, x + rr_, y + rr_], fill=(52, 84, 44))

# juncos no pântano
ys, xs = np.nonzero(pantano[::2, ::2] & ~poças[::2, ::2])
sel = rng.random(len(xs)) < 0.05
for x, y in zip(xs[sel] * 2, ys[sel] * 2):
    d.line([(x, y), (x + rng.uniform(-1.5, 1.5), y - 3)], fill=(150, 140, 80))

# pedras e penhascos
ys, xs = np.nonzero(rocha[::4, ::4] & ~occ_final[::4, ::4])
sel = rng.random(len(xs)) < 0.10
for x, y in zip(xs[sel] * 4, ys[sel] * 4):
    r = rng.uniform(1.5, 4.5)
    d.ellipse([x - r + 1.5, y - r + 1.5, x + r + 1.5, y + r + 1.5], fill=(70, 66, 60))
    g_ = int(rng.uniform(140, 180))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(g_, g_ - 4, g_ - 12))
penhasco = rocha & (slope > 1.6)
arr = np.array(im)
arr[penhasco] = (arr[penhasco] * 0.72).astype(np.uint8)
im = Image.fromarray(arr)
d = ImageDraw.Draw(im)

# ---------------------------------------------------------------- cavernas
def achar_paredao(tx, ty, raio=120):
    best, bv = (tx, ty), -1
    for _ in range(600):
        x, y = int(tx + rng.uniform(-raio, raio)), int(ty + rng.uniform(-raio, raio))
        if 20 < x < N - 20 and 20 < y < N - 20 and rocha[y, x] and not agua[y, x]:
            v = slope[y, x]
            if v > bv:
                best, bv = (x, y), v
    return best


cavernas = []
for tx, ty in [(620, 190), (1080, 150), (1560, 430), (1840, 820), (1740, 230), (300, 1260)]:
    x, y = achar_paredao(tx, ty)
    if not rocha[y, x]:
        continue
    ang = math.atan2(-gy[y, x], -gx[y, x])   # boca virada para o declive
    d.ellipse([x - 9, y - 7, x + 9, y + 7], fill=(64, 60, 54))
    d.ellipse([x - 7, y - 5, x + 7, y + 5], fill=(18, 16, 14))
    d.ellipse([x - 4, y - 2, x + 4, y + 4], fill=(4, 4, 4))
    cavernas.append((x, y))

base = im.copy()
base.save(os.path.join(AQUI, "mapa-regiao-base.png"), optimize=True)

# ---------------------------------------------------------------- versão anotada
an = im.copy()
d = ImageDraw.Draw(an)
F = "C:/Windows/Fonts/"
f_g = ImageFont.truetype(F + "palab.ttf", 34)
f_m = ImageFont.truetype(F + "pala.ttf", 22)
f_mi = ImageFont.truetype(F + "palai.ttf", 20)
f_p = ImageFont.truetype(F + "pala.ttf", 15)
f_emo = ImageFont.truetype(F + "seguiemj.ttf", 24)
f_emo_p = ImageFont.truetype(F + "seguiemj.ttf", 18)


def rotulo(x, y, txt, f, cor=(30, 24, 16), contorno=(240, 230, 205), sw=3, anchor="mm"):
    d.text((x, y), txt, font=f, fill=cor, stroke_width=sw, stroke_fill=contorno, anchor=anchor)


def icone(x, y, emo, f=f_emo, fundo=True):
    if fundo:
        r = f.size * 0.72
        d.ellipse([x - r, y - r, x + r, y + r], fill=(244, 236, 214), outline=(90, 70, 40), width=2)
    d.text((x, y), emo, font=f, embedded_color=True, anchor="mm")


# regiões
for txt, x, y, f in [("Terras Altas do Norte", 400, 70, f_g), ("Mata Antiga", 120, 600, f_mi),
                     ("Floresta Densa", 1660, 560, f_mi), ("Pradaria", 470, 1300, f_m),
                     ("Pântano", 1150, 1650, f_g), ("Rochedos", 1830, 420, f_mi),
                     ("Colinas", 1600, 1180, f_mi), ("Bosque do Sul", 520, 1840, f_mi),
                     ("Lagoa", 1338, 228, f_mi), ("Charco Grande", 1430, 1925, f_mi),
                     ("Vale do Rio", 1290, 560, f_mi)]:
    rotulo(x, y, txt, f)
rotulo(1110, 830, "VILA", f_g)

# prédios da vila (com linha de chamada)
pos_rot = {"Igreja": (960, 860), "Salão da vila": (780, 960), "Taverna": (930, 1105),
           "Ferreiro": (1090, 1040), "Artesão": (1090, 960), "Padaria": (1035, 1095),
           "Praça": (955, 1004), "Casa do Senhor": (720, 800), "Fogueiras": (1030, 1190),
           "Moinho": None}
for k, (x, y) in predios.items():
    pr = pos_rot.get(k)
    if k == "Moinho":
        pr = (x + 15, y + 32)
    if pr is None:
        continue
    if k != "Praça":
        d.line([(x, y), pr], fill=(40, 30, 20), width=1)
    rotulo(pr[0], pr[1], k, f_p, sw=2)

# culturas
rot_cult = {"trigo": "Trigo", "nabo": "Nabos", "cebola": "Cebolas", "alho": "Alho-poró", "pousio": "Pousio"}
vistos = []
for cult, cx, cy in campos_rotulos:
    if any(math.hypot(cx - a, cy - b) < 110 for a, b in vistos):
        continue
    vistos.append((cx, cy))
    rotulo(cx, cy, rot_cult[cult], f_p, sw=2)
for nome, (x0, y0, x1, y1), _ in grandes:
    rotulo((x0 + x1) / 2, y0 + 25, nome, f_mi)

# criação
for pts, tipo, m in pastos:
    ys, xs = np.nonzero(m)
    cx, cy = xs.mean(), ys.mean()
    if tipo == "gado":
        icone(cx, cy, "🐄")
        rotulo(cx, cy + 30, "Pasto do gado", f_p, sw=2)
    elif tipo == "cabras":
        icone(cx, cy, "🐐")
        rotulo(cx, cy + 30, "Cabras", f_p, sw=2)
    else:
        icone(cx + 30, cy, "🐔", f_emo_p)

# cavernas
for x, y in cavernas:
    icone(x + 26, y - 20, "🕳️", f_emo_p)
    rotulo(x + 26, y + 4, "Caverna", f_p, sw=2)

# ruínas
for nome, rx, ry, tipo in ruinas:
    icone(rx, ry, "🏚️")
    rotulo(rx, ry + 112, nome, f_m)

# fauna (aproximada; mundo de fantasia)
fauna = [("🦌", 330, 820), ("🦌", 1720, 760), ("🦌", 560, 1780), ("🦌", 1580, 1380),
         ("🐗", 240, 1050), ("🐗", 1780, 1450), ("🐺", 450, 260), ("🐺", 1880, 650),
         ("🦊", 760, 450), ("🦊", 1500, 1500), ("🐇", 420, 1200), ("🐇", 1350, 1120),
         ("🦆", 1150, 1780), ("🦆", 1330, 1840), ("🐸", 1000, 1600), ("🐍", 1560, 1800),
         ("🐟", 1215, 780), ("🐟", 1400, 1600), ("🐟", 1338, 205), ("🦅", 900, 210),
         ("🦅", 1820, 300), ("🐻", 1700, 950), ("🦉", 230, 450), ("🐦", 600, 1150),
         ("🦡", 1500, 1000), ("🐿️", 1650, 1250)]
for emo, x, y in fauna:
    icone(x, y, emo)

# picos e colinas (altitude)
from scipy.ndimage import maximum_filter
mx = (e == maximum_filter(e, size=241)) & (xx > 120) & (xx < N - 120) & (yy > 120) & (yy < N - 120) & ~agua
picos = sorted(zip(*np.nonzero(mx)), key=lambda t: -e[t])[:8]
for y, x in picos:
    if dv[y, x] < 250:
        continue
    d.polygon([(x, y - 9), (x - 8, y + 5), (x + 8, y + 5)], fill=(120, 80, 50), outline=(40, 30, 20))
    rotulo(x, y + 18, f"{int(e[y, x])} m", f_p, sw=2)

# rios
rotulo(1205, 680, "Rio", f_mi, cor=(20, 50, 90))
rotulo(560, 935, "Riacho Oeste", f_mi, cor=(20, 50, 90))

# escala e norte
d.rectangle([60, 1900, 560, 1960], fill=(244, 236, 214), outline=(90, 70, 40), width=2)
for i in range(5):
    d.rectangle([80 + i * 80, 1925, 160 + i * 80, 1935], fill=(40, 30, 20) if i % 2 == 0 else (240, 232, 210),
                outline=(40, 30, 20))
rotulo(80, 1913, "0", f_p, sw=0)
rotulo(240, 1913, "200 m", f_p, sw=0)
rotulo(480, 1913, "400 m", f_p, sw=0)
rotulo(310, 1948, "1 pixel = 1 metro · 2 km × 2 km", f_p, sw=0)
cx, cy = 1900, 1880
d.ellipse([cx - 48, cy - 48, cx + 48, cy + 48], fill=(244, 236, 214), outline=(90, 70, 40), width=2)
d.polygon([(cx, cy - 40), (cx - 12, cy + 4), (cx, cy - 4), (cx + 12, cy + 4)], fill=(150, 40, 30))
d.polygon([(cx, cy + 40), (cx - 12, cy - 4), (cx, cy + 4), (cx + 12, cy - 4)], fill=(60, 50, 40))
rotulo(cx, cy - 62, "N", f_m)

an.save(os.path.join(AQUI, "mapa-regiao-anotado.png"), optimize=True)
print("ok", len(casas), "casas", len(cavernas), "cavernas", len(campos_rotulos), "talhões")
