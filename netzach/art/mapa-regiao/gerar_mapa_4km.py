# -*- coding: utf-8 -*-
"""Riachossagrado e arredores: mapa de 4 km x 4 km (1 px = 1 m), com a exploração pensada como em Skyrim.

Gera, ao lado deste script:
  mapa-4km-base.png        terreno, vila, campos, estradas e lugares (sem textos nem ícones)
  mapa-4km-anotado.png     o mesmo com nomes, ícones de fauna, lugares de interesse, escala e norte
  mapa-4km-editor.json     a linha da tabela `mapas` do roteirizador (Mapic): relevo (a cada 4 m), pintura e dados

Coordenadas do editor: x = leste, z = sul, em metros, (0, 0) no centro do mapa. Pixel (px, py) -> x = px - 2000, z = py - 2000.
Uso: python gerar_mapa_4km.py [semente]
"""
import base64
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_dilation, distance_transform_edt, gaussian_filter, zoom
from skimage.measure import approximate_polygon, find_contours

N = 4000
MEIO = N // 2
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1150
rng = np.random.default_rng(SEED)
AQUI = os.path.dirname(os.path.abspath(__file__))
NIVEL_AGUA = -0.6

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)


# ------------------------------------------------------------------ utilidades
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


def gauss(cx, cy, sx, h, sy=None):
    sy = sy or sx
    return h * np.exp(-(((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2) / 2)


def catmull(pts, step=2.0):
    pts = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(p, float) for p in pts[i - 1:i + 3])
        n = max(2, int(np.linalg.norm(p2 - p1) / step))
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(np.array(pts[-2], float))
    return np.array(out)


def meander(path, amp, wl):
    d = np.diff(path, axis=0)
    s = np.concatenate([[0], np.cumsum(np.hypot(d[:, 0], d[:, 1]))])
    dd = np.gradient(path, axis=0)
    ln = np.hypot(dd[:, 0], dd[:, 1]) + 1e-6
    nrm = np.stack([-dd[:, 1] / ln, dd[:, 0] / ln], 1)
    ph = rng.uniform(0, 6.28, 3)
    off = (np.sin(s / wl * 6.28 + ph[0]) + 0.5 * np.sin(s / wl * 2.3 * 6.28 + ph[1]) + 0.25 * np.sin(s / wl * 5.1 * 6.28 + ph[2]))
    taper = np.minimum(1, np.minimum(s, s[-1] - s) / 80)
    return path + nrm * (off * amp * taper)[:, None]


def draw_path(draw, path, width, fill):
    pts = [tuple(p) for p in path]
    draw.line(pts, fill=fill, width=max(1, int(round(width))), joint="curve")
    r = width / 2
    for p in pts[::5] + [pts[-1]]:
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def rot_rect(cx, cy, w, h, ang):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + dx * c - dy * s, cy + dx * s + dy * c) for dx, dy in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]]


def blob_poly(cx, cy, rx, ry, jit, n=72):
    ph = rng.uniform(0, 6.28, 3)
    pts = []
    for i in range(n):
        a = 6.28 * i / n
        r = 1 + jit * (0.6 * math.sin(3 * a + ph[0]) + 0.3 * math.sin(5 * a + ph[1]) + 0.2 * math.sin(9 * a + ph[2]))
        pts.append((cx + rx * r * math.cos(a), cy + ry * r * math.sin(a)))
    return pts


def ed(px, py):
    """pixel -> coordenadas do editor (x, z), arredondadas"""
    return [round(float(px) - MEIO, 1), round(float(py) - MEIO, 1)]


# ------------------------------------------------------------------ desenho geral
# Geografia do mundo (Tabula Mundi): a Muralha Férrea fecha o norte; a cordilheira fica a oeste. Charcoantigo (Ealdmere)
# é o lado úmido, encostado na montanha: as águas descem dela e correm para o sul. Rocherco (Stangard) é o lado seco, a
# leste: deserto que continua para o norte; nenhum rio chega lá (a água de Rocherco vem do mar, dessalinizada pelo dragão).
# Riachossagrado fica ao sul da Fortaleza da Muralha, entre os dois braços do Rio Grande: a fronteira do úmido com o seco.
V = (2000, 2050)        # praça de Riachossagrado
HG = (2235, 1868)       # Casa do Grão Alto, no outeiro
FONTE = (1780, 1560)    # a fonte sagrada que dá nome à vila (stow + burn)
MOSTEIRO = (830, 2760)
FORTALEZA = (1460, 330)


def muro_y(x):
    """linha da Muralha Férrea (y em px) para cada x"""
    return 230 + 28 * np.sin(np.asarray(x, float) / 640 + 0.7) + 10 * np.sin(np.asarray(x, float) / 210)


# rios: (nome, pontos de controle, largura na foz, largura na nascente, amplitude, comprimento de onda)
RIOS = [
    ("Rio Grande", [(-15, 640), (380, 700), (820, 640), (1220, 560), (1560, 700), (1720, 900)], 30, 24, 16, 340),
    ("Braço Oeste do Rio Grande", [(1720, 900), (1500, 1300), (1310, 1800), (1240, 2300), (1250, 2800), (1300, 3300), (1250, 4015)], 22, 22, 18, 300),
    ("Braço Leste do Rio Grande", [(1720, 900), (2000, 1150), (2400, 1350), (2680, 1700), (2730, 2200), (2700, 2700), (2760, 3300), (2800, 4015)], 18, 18, 16, 300),
    ("Riacho Sagrado", [FONTE, (1835, 1700), (1960, 1880), (2085, 1995), (2120, 2160), (2150, 2350), (2110, 2600),
                        (2080, 2900), (2250, 3200), (2500, 3330), (2745, 3360)], 7, 3, 7, 160),
    ("Riacho da Cordilheira", [(170, 1480), (520, 1650), (880, 1880), (1060, 2080), (1238, 2160)], 10, 5, 12, 200),
    ("Riacho do Mosteiro", [(160, 2500), (420, 2640), (640, 2860), (900, 3050), (1150, 3250), (1285, 3330)], 8, 4, 10, 180),
]
rios_paths = []
agua_img = Image.new("L", (N, N), 0)
ad = ImageDraw.Draw(agua_img)
cen_img = Image.new("L", (N, N), 0)
cd = ImageDraw.Draw(cen_img)
for nome, pts, w0, w1, amp, wl in RIOS:
    p = meander(catmull(pts), amp, wl)
    rios_paths.append((nome, p, w0, w1))
    k = len(p)
    for i in range(0, k - 1, 4):
        draw_path(ad, p[i:i + 6], w1 + (w0 - w1) * (i / k), 255)
    cd.line([tuple(q) for q in p], fill=255, width=3)
# meres de Charcoantigo (todas do lado oeste e sul: é para lá que a água vai)
LAGOS = [("Mere Grande", 1500, 3720, 330, 150), ("Mere do Mosteiro", 560, 3200, 300, 170), ("Charco da Cordilheira", 520, 2150, 160, 110)]
for nome, cx, cy, rx, ry in LAGOS:
    ad.polygon(blob_poly(cx, cy, rx, ry, 0.22), fill=255)
rio_r = np.array(agua_img) > 127
dist_rio = distance_transform_edt(~((np.array(cen_img) > 0) | rio_r)).astype(np.float32)
del cen_img
# leito seco de Rocherco: um rio que não corre mais (só desenho e areia)
leito_seco = meander(catmull([(4015, 2600), (3700, 2450), (3400, 2300), (3150, 2350), (2950, 2500)]), 14, 220)

# ------------------------------------------------------------------ relevo (metros)
n1, n2, n3 = fbm(5, 7), fbm(12, 5), fbm(40, 3)
dv = np.hypot(xx - V[0], yy - V[1])
dvn = dv + 90 * n2
planalto = smooth(1050, 600, dvn)                                   # a ilha seca e fértil da vila
cordilheira = smooth(430, 40, xx + 70 * n2)                          # pé da cordilheira, a oeste
seco = smooth(2780, 3500, xx + 160 * n2)                             # Rocherco: o planalto seco a leste
seco = np.maximum(seco, smooth(1350, 500, yy + 120 * n2) * smooth(2350, 3050, xx + 120 * n2))   # o deserto sobe ao norte
alem_muro = yy < muro_y(xx)
pedregal_z = np.exp(-(((xx - 3330) / 600) ** 2 + ((yy - 1150) / 520) ** 2)) * np.clip(0.8 + 0.2 * n1, 0.5, 1.2)

e = 0.9 + 0.7 * n2 + 10 * (1 - yy / N)                               # tudo desce para o sul
e += 9 * planalto * np.clip(0.85 + 0.15 * n1, 0.6, 1.2)
e += 150 * cordilheira * np.clip(0.75 + 0.25 * n1, 0.5, 1.25)
e += (14 + 18 * np.clip(0.6 + 0.4 * n1, 0, 1.3)) * seco
e += 45 * pedregal_z
for cx, cy, s, h in [(1000, 1150, 170, 22), (HG[0], HG[1], 85, 5.5), (2360, 2860, 150, 6), (3600, 650, 220, 30),
                     (3250, 1700, 200, 18), (3700, 3000, 260, 20), (3200, 3300, 200, 14), (2500, 600, 220, 14),
                     (MOSTEIRO[0], MOSTEIRO[1], 150, 4.5), (1700, 1350, 160, 7), (600, 1200, 200, 20)]:
    e += gauss(cx, cy, s, h)
# baixadas de Charcoantigo: poças e canais logo abaixo da água parada (só no lado úmido)
baixa = smooth(3.2, 1.2, e) * (1 - seco)
e -= baixa * (0.55 + 0.75 * np.clip(n3, -1, 1.5))
# pôlder do mosteiro: terra drenada pelos diques dos monges
POLDER = (560, 2380, 1100, 2620)
mpol = (xx >= POLDER[0]) & (xx <= POLDER[2]) & (yy >= POLDER[1]) & (yy <= POLDER[3])
e = np.where(mpol, np.maximum(e, 1.4 + 0.2 * n3), e)
# vales e leitos
e -= 7 * np.exp(-dist_rio / 160) * (1 - baixa)
e = gaussian_filter(e, 2.5)
leito = rio_r
e = np.where(leito, np.minimum(e, -1.6), e)
e = np.where(binary_dilation(leito, iterations=3) & ~leito, np.minimum(e, NIVEL_AGUA + 0.25), e)
wv = np.exp(-(dv / 330) ** 2) * 0.75
e = e * (1 - wv) + 9.2 * wv
e = gaussian_filter(e, 1.2).astype(np.float32)
agua = leito | ((e < NIVEL_AGUA) & ~alem_muro)
gy, gx = np.gradient(e)
slope = np.hypot(gx, gy)
del n1

# ------------------------------------------------------------------ biomas
nb = fbm(14, 4)
rocha = ((cordilheira > 0.55) | (pedregal_z * (1 + 0.6 * nb + 0.3 * n3) > 0.62) | ((slope > 1.0) & (e > 30))
         | ((seco > 0.85) & (n3 + 0.6 * nb > 1.3))) & ~agua & ~alem_muro
lsi = Image.new("L", (N, N), 0)
draw_path(ImageDraw.Draw(lsi), leito_seco, 26, 255)
mleito = np.array(lsi) > 0
del lsi
areia = (((seco > 0.6) & (n3 + 0.5 * nb > 0.2)) | alem_muro | mleito) & ~agua
areia &= ~(rocha & ~mleito)
pantano = (baixa > 0.5) & ~agua & ~mpol & ~rocha
pantano |= (yy > N - 140 - 50 * nb) & (xx < 2600) & ~agua & ~rocha
nf = fbm(7, 6)
vies = (2.2 * smooth(1300, 450, xx + 80 * n2) * smooth(3000, 2300, yy) * (1 - cordilheira)
        + 0.6 * np.exp(-(((xx - 1050) / 260) ** 2 + ((yy - 3500) / 240) ** 2))
        - 3.0 * np.exp(-(dv / 900) ** 4) - 3.0 * seco - 1.8 * np.exp(-(((xx - 2000) / 520) ** 2 + ((yy - 2950) / 280) ** 2)))
floresta = ((nf + vies) > 0.9) & ~agua & ~rocha & ~pantano & ~mpol & ~areia & ~alem_muro
bosque = ((nf + vies) > 0.25) & ~floresta & ~agua & ~rocha & ~pantano & ~mpol & ~areia & ~alem_muro
GRAMBUCHE = (860, 900)
clareira_g = np.hypot(xx - GRAMBUCHE[0], yy - GRAMBUCHE[1]) < 120 + 25 * nb   # clareira do Grambuche: musgo e solo rico
floresta &= ~clareira_g
bosque &= ~clareira_g
del nf, vies

# ------------------------------------------------------------------ cores do chão
def mix(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return np.array(a, np.float32) * (1 - t) + np.array(b, np.float32) * t


nfine = fbm(90, 3)
umid = 0.5 + 0.25 * nb + 0.45 * np.exp(-dist_rio / 160)
img = mix((156, 160, 88), (104, 144, 70), umid)
sf = np.clip(seco * 1.3, 0, 1)[..., None]
img = img * (1 - sf) + mix((178, 166, 104), (190, 172, 112), 0.5 + 0.4 * nfine) * sf
del sf
img += (nfine * 5 + n3 * 4)[..., None]
img[floresta] = mix((36, 64, 34), (52, 84, 44), 0.5 + 0.3 * n2)[floresta]
img[bosque] = mix((84, 120, 56), (98, 132, 62), 0.5 + 0.3 * n2)[bosque]
img[clareira_g] = mix((84, 128, 98), (104, 146, 104), 0.5 + 0.4 * nfine)[clareira_g]
img[rocha] = mix((128, 116, 100), (166, 152, 132), 0.5 + 0.35 * n3 + 0.15 * nfine)[rocha]
img[areia] = mix((196, 174, 124), (218, 196, 144), 0.5 + 0.3 * n3 + 0.3 * nfine)[areia]
img[pantano] = mix((80, 96, 64), (110, 114, 72), 0.5 + 0.35 * nfine)[pantano]
img[mpol] = mix((120, 146, 74), (132, 154, 80), 0.5 + 0.3 * nfine)[mpol]

ocupado = agua.copy()
campo = np.zeros((N, N), bool)
CORES = {"trigo": ((212, 186, 98), (196, 168, 84)), "pousio": ((150, 150, 92), (138, 140, 86)),
         "nabo": ((112, 140, 66), (128, 112, 76)), "cebola": ((150, 138, 96), (118, 142, 78)),
         "alho_poro": ((96, 138, 104), (124, 112, 80))}

# ------------------------------------------------------------------ lavouras (alinhadas, como o editor entende)
fields = []      # para o editor
rot_fields = []  # rótulos


def lavoura(x0, y0, x1, y1, cultura, vertical, faixa=10, nome=None):
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    sl = (slice(y0, y1), slice(x0, x1))
    bloq = agua[sl] | rocha[sl] | floresta[sl] | pantano[sl] | ocupado[sl] | (dist_rio[sl] < 12)
    if bloq.mean() > 0.3:
        return False
    m = ~bloq
    u = (xx[sl] if vertical else yy[sl])
    a, b = CORES[cultura]
    a, b = np.array(a, np.float32), np.array(b, np.float32)
    if cultura in ("nabo", "cebola", "alho_poro"):
        cor = np.where((np.mod(u, 2.5) < 1)[..., None], b, a)
    else:
        cor = np.where((np.floor(u / faixa) % 2 == 0)[..., None], a, a * 0.93 + b * 0.07) + (nfine[sl] * 5)[..., None]
    cor = np.where((np.mod(u, faixa) < 1)[..., None], cor * 0.82, cor)
    reg = img[sl]
    reg[m] = cor[m]
    ocupado[sl] |= m
    campo[sl] |= m
    xa, za = ed(x0, y0)
    xb, zb = ed(x1, y1)
    if cultura == "trigo" or cultura == "pousio":
        f = {"id": f"campo_{len(fields) + 1}", "kind": "trigo", "name": nome or ("Trigo" if cultura == "trigo" else "Pousio"),
             "x0": xa, "x1": xb, "z0": za, "z1": zb}
        if cultura == "pousio":
            f["pousio"] = True
    else:
        f = {"id": f"horta_{len(fields) + 1}", "kind": "horta", "name": nome or "Horta", "x0": xa, "x1": xb, "z0": za, "z1": zb}
        larg = (zb - za - 2) / 3
        f["strips"] = [{"kind": k, "name": nm, "z0": round(za + i * (larg + 1), 1), "z1": round(za + i * (larg + 1) + larg, 1)}
                       for i, (k, nm) in enumerate([("cebola", "Cebola"), ("nabo", "Nabo"), ("alho_poro", "Alho-poró")])]
    fields.append(f)
    rot_fields.append((cultura, (x0 + x1) / 2, (y0 + y1) / 2))
    return True


# três grandes campos abertos em rotação (trigo, a cultura do rei, é a maior parte)
GRANDES = [("Campo de Oeste", (1330, 1800, 1800, 2330)), ("Campo de Leste", (2200, 2040, 2640, 2480)),
           ("Campo do Sul", (1620, 2330, 2380, 2700)), ("Campo do Norte", (1500, 1560, 1700, 1800))]
for nome, (x0, y0, x1, y1) in GRANDES:
    y = y0
    while y < y1 - 40:
        bh = int(rng.uniform(80, 130))
        x = x0
        while x < x1 - 40:
            bw = int(rng.uniform(90, 150))
            cult = rng.choice(["trigo"] * 7 + ["pousio"] * 2 + ["nabo"])
            if cult == "nabo":
                cult = "horta"
            if cult == "horta":
                lavoura(x + 3, y + 3, min(x + bw, x1) - 3, min(y + bh, y1) - 3, "nabo", rng.random() < 0.5, nome="Nabal")
            else:
                lavoura(x + 3, y + 3, min(x + bw, x1) - 3, min(y + bh, y1) - 3, cult, rng.random() < 0.5, faixa=int(rng.choice([8, 10, 12])))
            x += bw
        y += bh

# lavouras do pôlder (terra roubada ao charco pelos monges)
for x0 in range(POLDER[0] + 15, POLDER[2] - 100, 125):
    for y0 in (POLDER[1] + 12, POLDER[1] + 125):
        if abs(x0 + 52 - 830) < 70:
            continue
        lavoura(x0, y0, x0 + 105, y0 + 100, "trigo" if rng.random() < 0.6 else "nabo", True, nome="Pôlder do mosteiro")

# ------------------------------------------------------------------ pastos e currais
pastos = []


def pasto(x0, y0, x1, y1, tipo, nome):
    sl = (slice(y0, y1), slice(x0, x1))
    m = ~agua[sl] & ~rocha[sl]
    tom = {"gado": (122, 152, 74), "ovelhas": (136, 156, 84), "cabras": (140, 146, 90), "porcos": (128, 120, 82)}[tipo]
    reg = img[sl]
    reg[m] = reg[m] * 0.5 + np.array(tom, np.float32) * 0.5
    ocupado[sl] |= m
    pastos.append((x0, y0, x1, y1, tipo, nome))


pasto(1890, 1640, 2150, 1790, "gado", "Pasto do gado")          # ao norte da vila, como na lore
pasto(2160, 1700, 2215, 1790, "ovelhas", "Aprisco")
pasto(2950, 1700, 3130, 1850, "cabras", "Cabras da fronteira")
pasto(1765, 2110, 1810, 2150, "porcos", "Chiqueiro do Hob")

# ------------------------------------------------------------------ praça e terreiros
praca_poly = blob_poly(V[0], V[1], 52, 40, 0.08, 24)
mp = Image.new("L", (N, N), 0)
ImageDraw.Draw(mp).polygon(praca_poly, fill=255)
mpraca = np.array(mp) > 0
del mp
img[mpraca] = np.array((178, 160, 120), np.float32) + (nfine[mpraca] * 5)[:, None]
ocupado |= mpraca
FOGUEIRAS = (1900, 2140)
mfog = (np.hypot(xx - FOGUEIRAS[0], yy - FOGUEIRAS[1]) < 30) & ~agua
img[mfog] = np.array((150, 140, 100), np.float32)
ocupado |= mfog
terreiros = [(HG[0], HG[1], 52)]   # pátio do Grão Alto
for cx, cy, r in terreiros:
    m = (np.hypot(xx - cx, yy - cy) < r)
    img[m] = img[m] * 0.4 + np.array((150, 150, 96), np.float32) * 0.6
    ocupado |= m

# ------------------------------------------------------------------ sombreamento e curvas de nível
L = np.array([-1.0, -1.0, 1.4]) / np.linalg.norm([-1.0, -1.0, 1.4])
ex = 1.5
nl = np.sqrt((gx * ex) ** 2 + (gy * ex) ** 2 + 1)
sh = (-gx * ex * L[0] - gy * ex * L[1] + L[2]) / nl
fator = np.clip(1 + (sh - L[2]) * 1.3, 0.6, 1.3)
fator[agua] = 1
img *= fator[..., None]
del sh, nl, fator
niv = np.floor(e / 10)
bn = (niv != np.roll(niv, 1, 0)) | (niv != np.roll(niv, 1, 1))
mes = np.floor(e / 50)
bm = (mes != np.roll(mes, 1, 0)) | (mes != np.roll(mes, 1, 1))
terra = ~agua & ~campo & ~mpraca
img[bn & terra] *= 0.93
img[bm & terra] *= 0.85
del niv, bn, mes, bm
dm = distance_transform_edt(agua)
img[agua] = mix((92, 132, 150), (40, 82, 118), dm / 14)[agua]
del dm
margem = binary_dilation(agua, iterations=2) & ~agua
img[margem] = img[margem] * 0.5 + np.array((150, 138, 100), np.float32) * 0.5
img = np.clip(img, 0, 255).astype(np.uint8)
im = Image.fromarray(img, "RGB")
del img
d = ImageDraw.Draw(im)

# ------------------------------------------------------------------ estradas (hub em Riachossagrado, como as estradas de Skyrim: uma espinha e ramais)
ESTRADAS = [
    ("Estrada Real do Sul (para Charcoantigo)", 6, [V, (1990, 2190), (1930, 2700), (1850, 3100), (1800, 3500), (1760, 4015)]),
    ("Estrada da Muralha", 5, [V, (2010, 1930), (2000, 1780), (1820, 1450), (1660, 1100), (1560, 800), (1480, 520), (FORTALEZA[0], FORTALEZA[1] + 60)]),
    ("Estrada da Água (para Rocherco)", 5, [V, (2140, 2060), (2380, 2020), (2730, 1990), (3050, 2000), (3400, 1900), (3700, 1850), (4015, 1830)]),
    ("Estrada da Mata", 4, [V, (1860, 2040), (1600, 2010), (1330, 1960), (1000, 1880), (700, 1720), (440, 1460)]),
    ("Caminho do Dique", 4, [(1000, 1880), (900, 2150), (830, 2370), (830, 2640), (MOSTEIRO[0], MOSTEIRO[1] - 50)]),
    ("Caminho do Grão Alto", 3, [(2025, 1985), (2120, 1930), (HG[0] - 30, HG[1] + 25)]),
    ("Caminho da Fonte", 3, [(2000, 1780), (1900, 1650), FONTE]),
]
estradas_paths = []
for nome, w, pts in ESTRADAS:
    p = meander(catmull(pts), 6 if w >= 5 else 4, 220)
    estradas_paths.append((nome, w, p))
for nome, w, p in estradas_paths:
    draw_path(d, p, w + 2, (128, 108, 76))
for nome, w, p in estradas_paths:
    draw_path(d, p, w, (166, 142, 100))
mest = np.array(im)[..., 0] == 166
# trilhas para os lugares de interesse (picadas tracejadas)
TRILHAS = [
    [(1560, 800), (1200, 820), (980, 880), GRAMBUCHE], [(700, 1720), (600, 1450), (560, 1260)],
    [(980, 880), (700, 640), (480, 470)], [(1660, 1100), (1300, 1120), (1010, 1140)],
    [(3050, 2000), (3200, 1600), (3300, 1180)], [(3400, 1900), (3550, 1300), (3620, 720)],
    [(1480, 520), (2000, 420), (2600, 400)], [(1850, 3100), (1700, 3250), (1580, 3300)],
    [(1800, 3500), (1300, 3480), (750, 3450)], [(3050, 2000), (3300, 2600), (3450, 3050)],
    [(1930, 2700), (2200, 2800), (2350, 2860)], [(2730, 1990), (2900, 1600), (3000, 1260)],
    [(1600, 2010), (1250, 2300), (1060, 2200)], [(3700, 1850), (3780, 1600), (3800, 1450)],
    [(830, 2370), (500, 2200), (300, 1800)], [(3400, 1900), (3600, 2350), (3700, 2800)],
]
for t in TRILHAS:
    p = meander(catmull(t), 10, 160)
    for i in range(0, len(p) - 3, 4):
        if i % 12 < 8:
            d.line([tuple(p[i]), tuple(p[i + 3])], fill=(140, 122, 88), width=2)

# pontes e vaus onde as estradas cruzam água
pontes = []
for nome, w, p in estradas_paths:
    dentro_agua = False
    for i in range(len(p)):
        x, y = int(p[i][0]), int(p[i][1])
        if not (0 <= x < N and 0 <= y < N):
            continue
        if agua[y, x] and not dentro_agua:
            j0 = i
            dentro_agua = True
        elif not agua[y, x] and dentro_agua:
            dentro_agua = False
            a_, b_ = p[max(0, j0 - 4)], p[min(len(p) - 1, i + 4)]
            cx, cy = (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2
            comp = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
            ang = math.atan2(b_[1] - a_[1], b_[0] - a_[0])
            pedra = comp > 26
            d.polygon(rot_rect(cx, cy, comp, w + 3, ang), fill=(120, 116, 108) if pedra else (110, 82, 50), outline=(60, 50, 40))
            pontes.append((cx, cy, ang, comp, pedra, nome))

# ------------------------------------------------------------------ construções
buildings = []   # para o editor
pecas = []       # para o editor
muralhas = []
ocup_img = Image.new("L", (N, N), 0)
oc = ImageDraw.Draw(ocup_img)
oc.polygon(praca_poly, fill=255)
THATCH, PEDRA, ARDOSIA, TELHA = (190, 160, 96), (150, 146, 138), (104, 104, 110), (164, 96, 66)


def telhado(cx, cy, w, h, ang, cor, sombra=True):
    if sombra:
        d.polygon(rot_rect(cx + 2.5, cy + 2.5, w, h, ang), fill=(40, 40, 30))
    r4 = rot_rect(cx, cy, w, h, ang)
    d.polygon(r4, fill=cor, outline=tuple(int(v * 0.55) for v in cor))
    c, s = math.cos(ang), math.sin(ang)
    a_, b_ = (cx - w / 2 * c, cy - w / 2 * s), (cx + w / 2 * c, cy + w / 2 * s)
    d.polygon([a_, b_, r4[2], r4[3]], fill=tuple(int(v * 0.85) for v in cor))
    d.line([a_, b_], fill=tuple(int(v * 0.75) for v in cor), width=1)


def construcao(id_, tipo, cx, cy, w, dd, ang_rad, cor, nome=None, ficha=None, h=None, desenhar=True):
    """w ao longo da fachada; a porta olha para o lado do ângulo (rot do editor: 0 = sul)"""
    if desenhar:
        telhado(cx, cy, w, dd, ang_rad, cor)
    oc.polygon(rot_rect(cx, cy, w + 4, dd + 4, ang_rad), fill=255)
    b = {"id": id_, "type": tipo, "x": ed(cx, cy)[0], "z": ed(cx, cy)[1], "w": round(w, 1), "d": round(dd, 1),
         "rot": round(-math.degrees(ang_rad)) % 360 - 0}
    if h:
        b["h"] = h
    if nome:
        b["name"] = nome
    if ficha:
        b["ficha_id"] = ficha
    buildings.append(b)
    return b


def peca(tipo, px, py, rot=0, escala=1, nome="", ficha=None):
    pid = f"{tipo}_{sum(1 for q in pecas if q['tipo'] == tipo) + 1}"
    pecas.append({"id": pid, "tipo": tipo, "x": ed(px, py)[0], "z": ed(px, py)[1], "rot": rot, "escala": escala,
                  "name": nome, "ficha_id": ficha})


F = {  # fichas do roteirizador
    "casa_aymer": "b23c304d-cdef-4a72-8339-a5a88e9ed71b", "igreja": "dffc17b9-c63a-45cb-8cf1-7ecdcf2b84ff",
    "taberna": "716b3512-6ba8-4c29-9dbe-e0c6ba84e659", "ferreiro": "062a969d-0f5e-458b-bfa7-c35793d69ad9",
    "padaria": "86a9314c-5655-4ac5-9745-c0a4f411ed53", "forno": "cf8a5481-a84c-40d5-b71d-36cbc6e62cd4",
    "alfaiate": "ca64e321-b0f8-427b-9625-3db9883e2fe7", "moradia": "e5325bfc-c955-48c5-bfdf-c230dbeedbb1",
    "riachossagrado": "2ae54456-42e9-41ec-9b47-de92711979a7", "floresta": "6fdb1f31-ed96-43ac-a3bf-9b0a97a1b07c",
    "pedregal": "44b7eb6c-7882-437d-8a09-2a3401796db0", "campina": "b7bc7d9c-019d-403b-990b-e98d0d1393ce",
    "charcoantigo": "9b6d9e9c-bdd7-4170-8eb2-00a09df81099", "rocherco": "cc52ffd8-5b29-4d7f-9d4e-97b7f0235ac9",
    "troll": "47f09cc0-6439-4f33-a25b-326a058e6f44", "grambuche": "7ebdf3d0-532d-4660-892d-61edf1d0f952",
    "gunter": "ba935e24-5b8e-4a3e-915b-0295c98400d9", "bolder": "a535fd32-e1b1-4f06-af85-0b2d1bcb16f7",
    "clara": "14ea899b-b8b2-45bb-ab3d-d99073ae2fdd", "clemente": "df433989-e1c5-49e0-8224-9b1459211141",
    "aymer": "e353ff58-01e3-4e80-9561-4f0230894313", "ralf": "4ae0a88f-bdf1-4688-bb77-fc75d74d4f2c",
    "godwin": "78211844-445b-42e2-b30a-87f29f3c9724", "veado": "d637b069-5706-4e22-9a60-63397b5dc424",
    "lobo": "ef439ddd-17ec-4469-aafa-1e6d07f45c12", "escorpiao": "68d682e9-da34-443b-9a0e-b338f33fdc32",
    "serpente": "385c6ae3-88b0-4514-be1b-59bdc6885b67", "eldred": "d5475563-7323-49f2-b1f9-db8a5e725250",
    "soren": "0a33b949-2a5f-4af2-a212-bbbc8837eaf6",
}
predios = {}   # rótulos

# --- igreja de pedra e adro, ao norte da praça
adro = [(1960, 1935), (2050, 1935), (2050, 1992), (1960, 1992)]
d.polygon(adro, fill=(120, 148, 78), outline=(110, 100, 80))
for _ in range(36):
    gx_, gy_ = rng.uniform(1964, 2046), rng.uniform(1940, 1988)
    if not (1978 <= gx_ <= 2032 and 1952 <= gy_ <= 1976):
        d.rectangle([gx_, gy_, gx_ + 1, gy_ + 2], fill=(170, 168, 160))
construcao("igreja", "igreja", 2005, 1964, 26, 12, 0, PEDRA, "Igreja de Riachossagrado", F["igreja"], h=7)
d.rectangle([1978, 1958, 1988, 1970], fill=(132, 128, 120), outline=(80, 78, 72))   # torre a oeste
telhado(2024, 1964, 9, 9, 0, PEDRA, False)                                           # capela-mor a leste
oc.polygon(adro, fill=255)
predios["Igreja"] = (2005, 1964)
peca("placa", 1955, 1990, 0, 1, "Cruz dos que não voltaram da guerra")
# --- salão da vila (oeste da praça)
construcao("salao", "moradia", 1928, 2040, 24, 11, math.pi / 2, (176, 146, 86), "Salão da vila")
predios["Salão da vila"] = (1928, 2040)
# --- taverna de Gunter (sul da praça), com quintal
d.rectangle([1985, 2105, 2025, 2128], fill=(150, 132, 96), outline=(110, 94, 66))
construcao("taverna", "bar", 2005, 2098, 20, 11, math.pi, TELHA, "Taverna do Gunter", F["taberna"])
oc.rectangle([1985, 2105, 2025, 2128], fill=255)
predios["Taverna"] = (2005, 2098)
# --- padaria oficial e o forno do senhor (leste da praça)
construcao("padaria", "padaria", 2068, 2072, 12, 9, -math.pi / 2, THATCH, "Padaria", F["padaria"])
d.ellipse([2076, 2085, 2088, 2097], fill=(170, 120, 90), outline=(90, 60, 40))
buildings.append({"id": "forno", "type": "forno", "x": ed(2082, 2091)[0], "z": ed(2082, 2091)[1], "w": 3, "d": 3, "rot": 0,
                  "name": "Forno do senhor", "ficha_id": F["forno"]})
predios["Padaria"] = (2068, 2072)
# --- ferraria de Bolder (na estrada de leste, antes da ponte)
d.rectangle([2110, 2058, 2134, 2078], fill=(92, 84, 74))
construcao("ferreiro", "ferreiro", 2120, 2052, 13, 8, 0, (150, 126, 82), "Ferraria do Bolder", F["ferreiro"])
d.ellipse([2126, 2066, 2132, 2072], fill=(200, 90, 40), outline=(60, 40, 30))
oc.rectangle([2110, 2058, 2134, 2078], fill=255)
predios["Ferreiro"] = (2120, 2052)
# --- alfaiataria e artesão
construcao("alfaiate", "alfaiate", 1945, 1995, 11, 8, 0.0, THATCH, "Alfaiataria do Godwin", F["alfaiate"])
predios["Alfaiate"] = (1945, 1995)
construcao("artesao", "moradia", 2070, 2015, 12, 8, 0.0, THATCH, "Oficina do artesão")
predios["Artesão"] = (2070, 2015)
# --- poço e cruz do mercado na praça
d.ellipse([1996, 2046, 2006, 2056], fill=(120, 116, 110), outline=(70, 68, 64))
d.ellipse([1998, 2048, 2004, 2054], fill=(40, 70, 90))
peca("poco", 2001, 2051, 0, 1, "Poço da praça")
peca("banca", 1980, 2035, 0, 1, "Banca da feira")
peca("banca", 2022, 2034, 0, 1, "Banca da feira")
peca("placa", 2015, 2060, 0, 1, "Quadro de avisos")
predios["Praça"] = V
# --- área das fogueiras (noite de São João)
fx, fy = FOGUEIRAS
d.ellipse([fx - 6, fy - 6, fx + 6, fy + 6], fill=(70, 60, 50), outline=(120, 110, 100))
d.ellipse([fx - 3, fy - 3, fx + 3, fy + 3], fill=(220, 120, 40))
for a in np.linspace(0, 6.28, 9)[:-1]:
    d.polygon(rot_rect(fx + 15 * math.cos(a), fy + 15 * math.sin(a), 7, 2, a + math.pi / 2), fill=(110, 78, 46))
for a in (0.6, 2.4, 4.2):
    px_, py_ = fx + 25 * math.cos(a), fy + 25 * math.sin(a)
    d.ellipse([px_ - 3, py_ - 3, px_ + 3, py_ + 3], fill=(66, 58, 50), outline=(110, 100, 90))
oc.ellipse([fx - 30, fy - 30, fx + 30, fy + 30], fill=255)
peca("bandido_fogueira", fx, fy, 0, 1.4, "Fogueira de São João")
predios["Fogueiras"] = FOGUEIRAS

# --- Casa do Grão Alto: casa de pedra e madeira no outeiro, paliçada, vala, celeiros e a bandeira do pelicano
hx, hy = HG
pal = blob_poly(hx, hy, 50, 44, 0.05, 28)
d.line(pal + [pal[0]], fill=(70, 52, 32), width=4)            # vala + paliçada
d.line(pal + [pal[0]], fill=(132, 98, 60), width=2)
portao = (hx - 32, hy + 33)
d.ellipse([portao[0] - 4, portao[1] - 4, portao[0] + 4, portao[1] + 4], fill=(150, 150, 96))
muralhas.append({"id": "palicada_grao_alto", "name": "Paliçada do Grão Alto", "pts": [ed(*p) for p in pal], "h": 3.2, "w": 0.5,
                 "torres": False, "fechada": True, "portoes": [{"x": ed(*portao)[0], "z": ed(*portao)[1], "w": 4}]})
construcao("casa_senhor", "casa_senhor", hx + 5, hy - 10, 24, 13, math.pi * 0.0, ARDOSIA, "Casa do Grão Alto", F["casa_aymer"], h=8)
construcao("celeiro_rei", "moradia", hx - 18, hy + 14, 26, 10, -math.pi / 2, (160, 132, 80), "Celeiro do rei (grão das tropas)")
construcao("celeiro_novo", "moradia", hx + 24, hy + 18, 18, 9, 0.0, (176, 146, 86), "Celeiro novo (obra do quadro de avisos)")
construcao("estrebaria", "moradia", hx + 30, hy - 26, 12, 7, 0.5, THATCH, "Estrebaria")
d.ellipse([hx - 30, hy - 30, hx - 24, hy - 24], fill=(150, 146, 138), outline=(80, 78, 72))   # pombal
d.line([(hx - 3, hy - 22), (hx - 3, hy - 38)], fill=(60, 50, 40), width=2)                    # mastro
d.polygon([(hx - 2, hy - 38), (hx + 9, hy - 35), (hx - 2, hy - 32)], fill=(230, 232, 236), outline=(40, 40, 60))  # pelicano
peca("placa", hx - 3, hy - 30, 0, 1.6, "Bandeira real do pelicano (Charcoantigo)", F["eldred"])
peca("carroca", hx - 5, hy + 30, 90, 1, "Carroça dos cobradores do rei")
oc.polygon(pal, fill=255)
predios["Casa do Grão Alto"] = (hx + 5, hy - 10)

# --- moinho d'água no Riacho Sagrado (o moleiro que rouba no peso)
brook = rios_paths[0][1]
for i in range(len(brook)):
    x, y = brook[i]
    if y > 2330:
        construcao("moinho", "moradia", x - 17, y, 14, 10, 0.25, THATCH, "Moinho d'água")
        d.rectangle([x - 8, y - 7, x - 5, y + 7], fill=(100, 72, 44))
        predios["Moinho"] = (x - 17, y)
        break
# --- fonte sagrada (stow): santuário de pedra na nascente
sx, sy = FONTE
d.ellipse([sx - 9, sy - 9, sx + 9, sy + 9], fill=(150, 146, 138), outline=(90, 86, 80))
d.ellipse([sx - 5, sy - 5, sx + 5, sy + 5], fill=(60, 110, 140))
peca("poco", sx, sy, 0, 1.3, "Fonte Sagrada")
peca("ruina_colunas", sx + 16, sy - 6, 0, 0.6, "Ermida da fonte")

# --- casas dos moradores: lotes ao longo das ruas
casas = []
ocup_arr = None
for nome, w, p in estradas_paths[:4] + estradas_paths[5:6]:
    s_ac, prox = 0.0, 58.0
    for i in range(1, len(p)):
        s_ac += float(np.hypot(*(p[i] - p[i - 1])))
        if math.hypot(p[i][0] - V[0], p[i][1] - V[1]) > 360:
            break
        if s_ac < prox:
            continue
        prox = s_ac + rng.uniform(19, 25)
        j = min(i + 4, len(p) - 1)
        ang = math.atan2(p[j][1] - p[i - 1][1], p[j][0] - p[i - 1][0])
        nx_, ny_ = -math.sin(ang), math.cos(ang)
        for lado in (-1, 1):
            if rng.random() < 0.1:
                continue
            ww, hh = rng.uniform(9, 13), rng.uniform(5, 6.5)
            off = 9 + hh / 2
            cx, cy = p[i][0] + nx_ * off * lado, p[i][1] + ny_ * off * lado
            tcx, tcy = p[i][0] + nx_ * 28 * lado, p[i][1] + ny_ * 28 * lado
            toft = rot_rect(tcx, tcy, 18, 42, ang)
            x0, x1 = int(min(q[0] for q in toft)) - 1, int(max(q[0] for q in toft)) + 2
            y0, y1 = int(min(q[1] for q in toft)) - 1, int(max(q[1] for q in toft)) + 2
            sl = (slice(y0, y1), slice(x0, x1))
            loc = Image.new("L", (x1 - x0, y1 - y0), 0)
            ImageDraw.Draw(loc).polygon([(q[0] - x0, q[1] - y0) for q in rot_rect(cx, cy, ww + 3, hh + 3, ang)], fill=255)
            pe = np.array(loc) > 0
            oarr = np.array(ocup_img.crop((x0, y0, x1, y1))) > 0
            if (pe & (oarr | agua[sl] | (dist_rio[sl] < 8) | mest[sl])).any():
                continue
            loc2 = Image.new("L", (x1 - x0, y1 - y0), 0)
            ImageDraw.Draw(loc2).polygon([(q[0] - x0, q[1] - y0) for q in toft], fill=255)
            mt = (np.array(loc2) > 0) & ~agua[sl] & ~oarr & ~mest[sl]
            arr = np.array(im.crop((x0, y0, x1, y1)))
            u = (xx[sl] - cx) * math.cos(ang) + (yy[sl] - cy) * math.sin(ang)
            hort = np.where((np.mod(u, 3) < 1)[..., None], np.array((104, 128, 64)), np.array((128, 140, 78)))
            arr[mt] = (arr[mt] * 0.35 + hort[mt] * 0.65).astype(np.uint8)
            im.paste(Image.fromarray(arr), (x0, y0))
            d = ImageDraw.Draw(im)
            d.line(toft + [toft[0]], fill=(96, 112, 60), width=1)
            n_c = len(casas) + 1
            construcao(f"moradia_{n_c}", "moradia", cx, cy, ww, hh, ang + (math.pi if lado > 0 else 0),
                       tuple(int(v * rng.uniform(0.92, 1.05)) for v in THATCH), None, F["moradia"] if n_c == 1 else None)
            if rng.random() < 0.6:
                bx, by = p[i][0] + nx_ * 36 * lado, p[i][1] + ny_ * 36 * lado
                d.rectangle([bx - 2, by - 2, bx + 2, by + 2], fill=(150, 120, 80), outline=(90, 70, 40))
            oc.polygon(toft, fill=255)
            ocupado[sl] |= mt
            casas.append((cx, cy))

# ------------------------------------------------------------------ lugares de interesse (POIs), à moda de Skyrim
# cada um: nome, tipo de desenho, posição, peças do editor, ícone, nota de design
POIS = []


def poi(nome, kind, px, py, icone, nota, raio=60, ficha=None):
    POIS.append(dict(nome=nome, kind=kind, x=px, y=py, icone=icone, nota=nota, raio=raio, ficha=ficha))


poi("Fortaleza da Muralha", "fortaleza", FORTALEZA[0], FORTALEZA[1], "🏰", "A fortaleza que guarda a Muralha Férrea e o único portão para o norte. De qualquer ponto do mapa se vê a muralha: é o teto do mundo.", 80)
poi("Ruínas do Velho Burgo", "burgo", 560, 470, "🏚️", "Masmorra grande: cidade de uma sociedade antiga ao pé da muralha, meio engolida pela mata; a entrada some no mato.", 110)
poi("Toca do Troll", "caverna", 470, 1240, "🕳️", "Chefe fixo do ciclo (o troll morre sempre). Na encosta da cordilheira; a saída pelos fundos dá no riacho, volta curta à estrada.", 40, F["troll"])
poi("Clareira do Grambuche", "grambuche", GRAMBUCHE[0], GRAMBUCHE[1], "🌳", "Tocos roídos em volta e musgo brilhante no meio: onde um Grambuche morreu, o chão ficou mágico.", 120, F["grambuche"])
poi("Atalaia do Monte Pelado", "torre", 1010, 1140, "🗼", "Marco visível da vila (weenie): torre partida no morro, entre os dois rios. Do alto se vê o mapa todo.", 40)
poi("Carvoaria", "acampamento", 940, 1960, "🔥", "O carvoeiro com quem o Bolder briga pelo preço, na beira da mata. Primeira parada da Estrada da Mata.", 35)
poi("Cabana do Caçador", "cabana", 330, 1820, "🏕️", "Abrigo no pé da cordilheira: peles e um mapa rabiscado com a toca do troll.", 30)
poi("Caverna da Cordilheira", "caverna", 260, 980, "🕳️", "Atrás de uma cascata na encosta; sai mais acima, perto das ruínas (atalho de volta).", 35)
poi("Pedras de Pé", "pedras", 2360, 2860, "🪨", "Círculo de pedras num morrote da campina: lugar do veado branco ao amanhecer.", 40)
poi("Acampamento de Bandidos", "bandidos", 1580, 3300, "⚔️", "Os bandidos da estrada do sul, numa ilha seca entre o rio e o charco, com vigia virada para a estrada.", 45)
poi("Ruínas Afogadas", "afogada", 740, 3480, "🏚️", "Torres de uma vila antiga engolida pelo charco; só se chega pela picada de tábuas.", 110)
poi("Mosteiro do Charco", "mosteiro", MOSTEIRO[0], MOSTEIRO[1], "⛪", "Os monges secam o pântano com diques e comportas; o pôlder ao norte é terra roubada à água. O campanário se vê de longe.", 90)
poi("Torre Afogada", "torre_afogada", 1080, 3640, "🗼", "Torre de vigia de Charcoantigo cercada de água, com a escada podre.", 45, F["charcoantigo"])
poi("Pedágio da Água", "pedagio", 2790, 2040, "🛡️", "Soldados do pelicano na ponte do Braço Leste: quem leva água para Rocherco paga aqui. A guerra fria em uma cancela.", 40, F["charcoantigo"])
poi("Pouso dos Aguadeiros", "aguadeiros", 2940, 2100, "🛢️", "Carroças de barris de Rocherco esperando a vez. Boatos dos dois reinos; o melhor lugar para ouvir sobre o dragão.", 45, F["soren"])
poi("Posto de Rocherco", "fronteira", 3150, 1990, "🚩", "A fronteira começa onde o verde acaba. Guardas de Soren, terra seca e a estrada que leva ao mar e ao dragão.", 50, F["rocherco"])
poi("Cisterna de Rocherco", "cisterna", 3560, 1760, "💧", "Reservatório de pedra cheio pela água que o dragão dessaliniza; os canos vêm do leste, do mar.", 50, F["rocherco"])
poi("Ruínas do Tempo Parado", "tempo", 3300, 1180, "⏳", "O 'tesouro do pedregal': quem entra fica preso no dia em que entrou. Entrada grande, masmorra embaixo.", 90)
poi("Mina Velha de Joias", "caverna", 3620, 720, "⛏️", "Veios de ferro e as joias místicas de Rocherco; a saída é um poço no alto do morro.", 40)
poi("Gruta das Serpentes", "caverna", 3800, 1450, "🐍", "Ninho de serpentes num paredão do pedregal.", 35, F["serpente"])
poi("Poço Salobre", "sitio", 3700, 2800, "🏚️", "Um sítio de Rocherco que tentou cavar poço: a água saiu salgada. Só o dragão adoça o mar.", 40)
poi("Leito Seco", "marco", 3450, 2310, "🏜️", "Um rio que já correu para Rocherco e secou: a lembrança do que a guerra disputa.", 40)
poi("Sítio Abandonado (oeste)", "sitio", 1060, 2200, "🏚️", "Casa de um dos homens que não voltaram da guerra; a horta virou mato.", 40)
poi("Sítio Abandonado (leste)", "sitio", 3000, 1260, "🏚️", "Outra família que a guerra levou; um diário no baú conta da fome.", 40)
poi("Cabana do Pescador", "cabana", 1880, 3640, "🎣", "Na margem da Mere Grande: barco, redes e enguias.", 30)
poi("Dunas do Norte", "marco", 3300, 450, "🏜️", "O deserto de Rocherco sobe até a muralha. Areia, vento e as escamas de serpentes enormes.", 40)

def muro_quebrado(pts, w=3):
    for i in range(len(pts) - 1):
        a_, b_ = pts[i], pts[i + 1]
        n_ = max(1, int(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) / 4))
        for k in range(n_):
            if rng.random() < 0.28:
                continue
            t0, t1 = k / n_, (k + 1) / n_
            p0 = (a_[0] + (b_[0] - a_[0]) * t0, a_[1] + (b_[1] - a_[1]) * t0)
            p1 = (a_[0] + (b_[0] - a_[0]) * t1, a_[1] + (b_[1] - a_[1]) * t1)
            d.line([(p0[0] + 1, p0[1] + 1), (p1[0] + 1, p1[1] + 1)], fill=(60, 58, 52), width=w)
            d.line([p0, p1], fill=(168, 162, 150), width=w)


def clareia(cx, cy, r, cor, forca=0.55):
    x0, y0, x1, y1 = int(cx - r), int(cy - r), int(cx + r) + 1, int(cy + r) + 1
    sl = (slice(y0, y1), slice(x0, x1))
    m = (np.hypot(xx[sl] - cx, yy[sl] - cy) < r) & ~agua[sl]
    arr = np.array(im.crop((x0, y0, x1, y1)))
    arr[m] = (arr[m] * (1 - forca) + np.array(cor) * forca).astype(np.uint8)
    im.paste(Image.fromarray(arr), (x0, y0))
    ocupado[sl] |= np.hypot(xx[sl] - cx, yy[sl] - cy) < r * 0.6


def boca_caverna(x, y, s=1.0):
    d.ellipse([x - 10 * s, y - 8 * s, x + 10 * s, y + 8 * s], fill=(64, 60, 54))
    d.ellipse([x - 8 * s, y - 6 * s, x + 8 * s, y + 6 * s], fill=(18, 16, 14))
    d.ellipse([x - 4 * s, y - 2 * s, x + 4 * s, y + 4 * s], fill=(4, 4, 4))


def tenda(x, y, cor=(150, 120, 80), r=5):
    d.polygon([(x, y - r), (x + r, y + r * 0.7), (x - r, y + r * 0.7)], fill=cor, outline=(70, 50, 30))


for P in POIS:
    k, x, y, r = P["kind"], P["x"], P["y"], P["raio"]
    nm, fi = P["nome"], P["ficha"]
    if k in ("burgo", "afogada"):
        clareia(x, y, r, (128, 132, 92) if k == "burgo" else (100, 108, 78))
        for gi in range(-3, 4):
            for gj in range(-3, 4):
                if rng.random() < 0.35 or math.hypot(gi, gj) > 3.2:
                    continue
                cx, cy = x + gi * 28 + rng.uniform(-5, 5), y + gj * 26 + rng.uniform(-5, 5)
                w_, h_ = rng.uniform(12, 22), rng.uniform(9, 15)
                muro_quebrado([(cx - w_ / 2, cy - h_ / 2), (cx + w_ / 2, cy - h_ / 2), (cx + w_ / 2, cy + h_ / 2), (cx - w_ / 2, cy + h_ / 2), (cx - w_ / 2, cy - h_ / 2)], 2)
                if rng.random() < 0.5:
                    peca(rng.choice(["ruina_alicerce", "ruina_muro"]), cx, cy, int(rng.choice([0, 90, 180, 270])), 1, nm if gi == gj == 0 else "")
        muro_quebrado([(x - 90, y - 70), (x - 25, y - 90), (x + 60, y - 80), (x + 92, y - 15)], 3)
        peca("ruina_arco", x, y + 40, 0, 1.2, f"Entrada: {nm}")
        if k == "afogada":
            for a in (0.4, 2.6, 4.4):
                tx, ty = x + 70 * math.cos(a), y + 55 * math.sin(a)
                d.ellipse([tx - 9, ty - 9, tx + 9, ty + 9], fill=(150, 146, 136), outline=(70, 66, 60), width=2)
                peca("torre_redonda", tx, ty, 0, 0.8, "Torre afundada")
    elif k == "caverna":
        boca_caverna(x, y, 1.1)
        peca("caverna", x, y, 0, 1, nm, fi)
    elif k == "grambuche":
        for _ in range(26):
            a, rr = rng.uniform(0, 6.28), rng.uniform(70, 115)
            tx, ty = x + rr * math.cos(a), y + rr * math.sin(a)
            d.ellipse([tx - 3, ty - 3, tx + 3, ty + 3], fill=(120, 96, 64), outline=(70, 52, 34))   # tocos roídos
        for _ in range(30):
            a, rr = rng.uniform(0, 6.28), rng.uniform(0, 60)
            tx, ty = x + rr * math.cos(a), y + rr * math.sin(a)
            d.point((tx, ty), fill=(170, 230, 190))
        peca("elfo_cogumelos", x, y, 0, 1.5, nm, fi)
        peca("elfo_circulo", x + 20, y - 15, 0, 1, "Musgo encantado")
    elif k == "torre":
        clareia(x, y, 30, (140, 138, 110), 0.5)
        d.rectangle([x - 8, y - 8, x + 8, y + 8], fill=(150, 146, 138), outline=(70, 66, 60), width=2)
        d.line([(x - 8, y + 8), (x + 2, y - 2)], fill=(70, 66, 60), width=2)
        peca("atalaia", x, y, 0, 1.2, nm)
    elif k == "acampamento":
        clareia(x, y, r, (124, 110, 84), 0.6)
        for a in (0.3, 2.0, 3.8):
            tx, ty = x + 18 * math.cos(a), y + 18 * math.sin(a)
            d.ellipse([tx - 7, ty - 7, tx + 7, ty + 7], fill=(60, 54, 48), outline=(30, 26, 22))   # medas de carvão
        tenda(x - 6, y + 6)
        peca("feno", x + 18, y, 0, 1, "Lenha empilhada")
        peca("bandido_fogueira", x, y, 0, 1, nm)
    elif k == "cabana":
        clareia(x, y, r, (130, 126, 90), 0.4)
        telhado(x, y, 9, 6, 0.3, (150, 126, 82))
        buildings.append({"id": f"cabana_{len(buildings)}", "type": "moradia", "x": ed(x, y)[0], "z": ed(x, y)[1], "w": 9, "d": 6, "rot": 0, "name": nm})
        peca("barris", x + 10, y + 4, 0, 1, "")
    elif k == "pedras":
        for a in np.linspace(0, 6.28, 11)[:-1]:
            tx, ty = x + 20 * math.cos(a), y + 20 * math.sin(a)
            d.rectangle([tx - 2.5, ty - 2.5, tx + 2.5, ty + 2.5], fill=(160, 156, 146), outline=(70, 66, 60))
            peca("ruina_colunas", tx, ty, int(math.degrees(a)), 0.5, nm if a == 0 else "")
    elif k == "bandidos":
        clareia(x, y, r, (126, 110, 80), 0.6)
        for a in (0.5, 2.2, 4.0):
            tenda(x + 16 * math.cos(a), y + 16 * math.sin(a), (120, 60, 50), 6)
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(220, 120, 40))
        for q in [("bandido_fogueira", 0, 0, 0), ("bandido_tenda_chefe", 0, -12, 0), ("bandido_tenda", -12, -3, 70),
                  ("bandido_tenda", 12, -4, -75), ("bandido_saque", 6, -10, 0), ("bandido_vigia", 22, 10, 0), ("bandido_paliçada", 0, 18, 0)]:
            peca(q[0], x + q[1], y + q[2], q[3], 1, nm if q[0] == "bandido_fogueira" else "")
    elif k == "mosteiro":
        clareia(x, y, r, (150, 148, 108), 0.55)
        claustro = [(x - 22, y - 18), (x + 22, y - 18), (x + 22, y + 18), (x - 22, y + 18)]
        d.rectangle([x - 16, y - 12, x + 16, y + 12], fill=(130, 158, 90))
        telhado(x, y - 26, 40, 14, 0, PEDRA)
        d.rectangle([x - 26, y - 34, x - 16, y - 18], fill=(132, 128, 120), outline=(80, 78, 72))  # campanário
        telhado(x - 26, y, 8, 30, 0, ARDOSIA)
        telhado(x + 26, y, 8, 30, 0, ARDOSIA)
        telhado(x, y + 24, 44, 8, 0, ARDOSIA)
        buildings.append({"id": "mosteiro_igreja", "type": "igreja", "x": ed(x, y - 26)[0], "z": ed(x, y - 26)[1], "w": 14, "d": 40, "rot": 90, "h": 9, "name": "Igreja do Mosteiro"})
        for nme, dx_, dy_, w_, h_, rr in [("Dormitório dos monges", -26, 0, 8, 30, 90), ("Refeitório", 26, 0, 8, 30, 90), ("Celeiro e escriptório", 0, 24, 44, 8, 0)]:
            buildings.append({"id": f"mosteiro_{len(buildings)}", "type": "moradia", "x": ed(x + dx_, y + dy_)[0], "z": ed(x + dx_, y + dy_)[1], "w": w_, "d": h_, "rot": rr, "name": nme})
        peca("torre", x - 21, y - 26, 0, 0.8, "Campanário do mosteiro")
        peca("poco", x, y, 0, 1, "Poço do claustro")
    elif k == "torre_afogada":
        d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(140, 136, 126), outline=(60, 58, 52), width=3)
        peca("torre_redonda", x, y, 0, 1.2, nm)
    elif k == "fronteira":
        for dx_, cor, nmm in ((-25, (90, 70, 50), "Posto de Rocherco"), (25, (60, 60, 110), "Marco da fronteira")):
            d.rectangle([x + dx_ - 7, y - 7, x + dx_ + 7, y + 7], fill=(150, 146, 138), outline=(60, 58, 52), width=2)
        peca("atalaia", x - 25, y, 180, 1, "Posto de Rocherco", F["soren"])
        peca("placa", x + 25, y, 0, 1, "Marco da fronteira: aqui começa Rocherco", fi)
    elif k == "posto":
        clareia(x, y, r, (140, 128, 96), 0.5)
        tenda(x - 10, y, (80, 80, 130), 6)
        tenda(x + 10, y + 4, (80, 80, 130), 6)
        d.line([(x, y - 4), (x, y - 20)], fill=(60, 50, 40), width=2)
        d.polygon([(x + 1, y - 20), (x + 11, y - 17), (x + 1, y - 14)], fill=(230, 232, 236), outline=(40, 40, 60))
        peca("atalaia", x, y - 25, 0, 1, nm, fi)
        peca("cerca", x, y + 18, 0, 1, "Barreira do pedágio")
    elif k == "pico":
        m = (np.hypot(xx[int(y - r):int(y + r), int(x - r):int(x + r)] - x, yy[int(y - r):int(y + r), int(x - r):int(x + r)] - y) < r)
        arr = np.array(im.crop((int(x - r), int(y - r), int(x + r), int(y + r))))
        arr[m] = (arr[m] * 0.45).astype(np.uint8)
        im.paste(Image.fromarray(arr), (int(x - r), int(y - r)))
        peca("placa", x, y, 0, 1, nm)
    elif k == "tempo":
        clareia(x, y, r, (170, 160, 126), 0.5)
        for a in np.linspace(0, 6.28, 9)[:-1]:
            tx, ty = x + 45 * math.cos(a), y + 45 * math.sin(a)
            d.rectangle([tx - 3, ty - 3, tx + 3, ty + 3], fill=(176, 170, 156), outline=(70, 66, 60))
            peca("ruina_colunas", tx, ty, int(math.degrees(a)), 1, "")
        boca_caverna(x, y, 1.4)
        peca("ruina_arco", x, y, 0, 1.6, nm)
        peca("caverna", x, y + 8, 0, 1.2, "Descida às ruínas")
    elif k == "sitio":
        clareia(x, y, r, (136, 140, 90), 0.4)
        muro_quebrado([(x - 6, y - 4), (x + 6, y - 4), (x + 6, y + 4), (x - 6, y + 4), (x - 6, y - 4)], 2)
        peca("ruina_alicerce", x, y, 0, 1, nm)
        peca("cerca", x + 15, y + 10, 30, 1, "")
    elif k == "marco":
        peca("placa", x - 20, y - 10, 0, 1, nm)
    elif k == "fortaleza":
        yw = float(muro_y(x))
        d.rectangle([x - 70, yw - 5, x + 70, y + 60], fill=(150, 146, 138), outline=(60, 58, 52), width=3)
        d.rectangle([x - 52, yw + 10, x + 52, y + 44], fill=(170, 160, 128))
        for tx, ty in [(x - 70, yw - 5), (x + 70, yw - 5), (x - 70, y + 60), (x + 70, y + 60)]:
            d.rectangle([tx - 12, ty - 12, tx + 12, ty + 12], fill=(132, 128, 120), outline=(60, 58, 52), width=2)
        telhado(x, y + 5, 40, 26, 0, ARDOSIA)
        telhado(x - 30, y + 36, 30, 10, 0, ARDOSIA)
        d.rectangle([x - 8, y + 56, x + 8, y + 64], fill=(70, 50, 30))
        buildings.append({"id": "fortaleza_torre", "type": "casa_senhor", "x": ed(x, y + 5)[0], "z": ed(x, y + 5)[1], "w": 40, "d": 26, "h": 14, "rot": 0, "name": nm})
        for tx, ty in [(x - 70, yw), (x + 70, yw), (x - 70, y + 60), (x + 70, y + 60)]:
            peca("torre", tx, ty, 0, 1.6, "Torre da fortaleza")
        peca("placa", x, y + 70, 0, 1, "Portão da Muralha (fechado)")
    elif k == "pedagio":
        clareia(x, y, r, (150, 138, 104), 0.5)
        tenda(x - 12, y, (80, 80, 130), 6)
        d.line([(x + 6, y - 4), (x + 6, y - 22)], fill=(60, 50, 40), width=2)
        d.polygon([(x + 7, y - 22), (x + 17, y - 19), (x + 7, y - 16)], fill=(230, 232, 236), outline=(40, 40, 60))
        d.line([(x - 20, y + 14), (x + 20, y + 14)], fill=(150, 40, 30), width=3)
        peca("atalaia", x, y - 20, 0, 1, nm, fi)
        peca("cerca", x, y + 14, 0, 1, "Cancela do pedágio")
        peca("placa", x + 22, y - 6, 0, 1, "Pedágio da água: um balde em cada dez é do rei Eldred", F["eldred"])
    elif k == "aguadeiros":
        clareia(x, y, r, (176, 160, 116), 0.6)
        for a in (0.2, 1.6, 3.0, 4.4):
            cx_, cy_ = x + 22 * math.cos(a), y + 18 * math.sin(a)
            d.rectangle([cx_ - 6, cy_ - 3, cx_ + 6, cy_ + 3], fill=(120, 86, 50), outline=(60, 40, 20))
            d.ellipse([cx_ - 3, cy_ - 3, cx_ + 3, cy_ + 3], fill=(150, 110, 70))
            peca("carroca", cx_, cy_, int(math.degrees(a)), 1, "Carroça de barris")
        tenda(x, y, (190, 150, 90), 7)
        peca("barris", x + 8, y + 8, 0, 1.4, nm, fi)
    elif k == "cisterna":
        clareia(x, y, r, (190, 172, 132), 0.5)
        d.rectangle([x - 26, y - 18, x + 26, y + 18], fill=(150, 146, 138), outline=(70, 66, 60), width=3)
        d.rectangle([x - 20, y - 12, x + 20, y + 12], fill=(60, 110, 140))
        for xa_ in range(int(x + 26), N, 30):     # cano / aqueduto vindo do leste (do mar, pelo dragão)
            ya_ = y - 4 + 6 * math.sin(xa_ / 90)
            d.rectangle([xa_, ya_ - 3, xa_ + 22, ya_ + 3], fill=(150, 140, 120), outline=(80, 72, 60))
            d.rectangle([xa_ + 22, ya_ - 6, xa_ + 26, ya_ + 6], fill=(120, 112, 98))
        muralhas.append({"id": "aqueduto_rocherco", "name": "Aqueduto de Rocherco (água do dragão)", "pts": [ed(x + 26, y), ed(N, y)], "h": 4, "w": 3, "torres": False})
        peca("poco", x, y, 0, 2, nm, fi)
    elif k == "ermida":
        telhado(x, y, 7, 10, 0, PEDRA)
        peca("ruina_colunas", x, y, 0, 0.5, nm)
# Muralha Férrea: o teto do mapa, de ponta a ponta (o que fica além dela é outro deserto, fora do jogo)
xs_m = np.arange(0, N + 1, 20)
pts_m = [(float(x), float(muro_y(x))) for x in xs_m]
d.line([(x + 4, y + 6) for x, y in pts_m], fill=(40, 38, 36), width=18)
d.line(pts_m, fill=(92, 90, 92), width=16)
d.line(pts_m, fill=(130, 128, 130), width=6)
for x, y in pts_m[::12]:
    d.rectangle([x - 12, y - 12, x + 12, y + 12], fill=(108, 106, 108), outline=(40, 38, 36), width=2)
muralhas.append({"id": "muralha_ferrea", "name": "Muralha Férrea", "pts": [ed(x, y) for x, y in pts_m[::5]], "h": 24, "w": 10, "torres": True,
                 "portoes": [{"x": ed(FORTALEZA[0], 0)[0], "z": ed(0, float(muro_y(FORTALEZA[0])))[1], "w": 8}]})
# pontes como peças
for cx, cy, ang, comp, pedra, nome in pontes:
    peca("ponte_pedra" if pedra else "ponte_madeira", cx, cy, round(90 - math.degrees(ang)), round(max(1, comp / 12), 1), "Ponte")
# placas nas encruzilhadas (Skyrim: placas apontam para o que existe)
for px_, py_, nm in [(2380, 2020, "Leste: Pedágio da Água e Rocherco"), (2000, 1780, "Norte: Fortaleza da Muralha | Oeste: Fonte"),
                     (1330, 1960, "Oeste: Mata e Mosteiro | Norte: Atalaia"), (1850, 3100, "Sul: Charcoantigo | Oeste: (bandidos?)"),
                     (3050, 2000, "Norte: Pedregal | Leste: Cisterna e o mar"), (1000, 1880, "Sul: Mosteiro do Charco | Oeste: Cordilheira")]:
    peca("placa", px_ + 6, py_ + 6, 0, 1, nm)

X0, Y0, X1, Y1 = POLDER
DIQUES = [[(X0, Y0), (X1, Y0)], [(X1, Y0), (X1, Y1)], [(X1, Y1), (X0, Y1)], [(X0, Y1), (X0, Y0)], [(830, Y0), (830, Y1)]]
for i, (a_, b_) in enumerate(DIQUES):
    d.line([a_, b_], fill=(96, 84, 60), width=7)
    d.line([a_, b_], fill=(146, 132, 92), width=4)
    muralhas.append({"id": f"dique_{i + 1}", "name": "Dique dos monges", "pts": [ed(*a_), ed(*b_)], "h": 2.2, "w": 5, "torres": False})
# porta d'água (comporta) no dique
d.rectangle([826, POLDER[3] - 6, 834, POLDER[3] + 6], fill=(110, 82, 50), outline=(60, 40, 20))
peca("cerca", 830, POLDER[3], 0, 1, "Comporta do dique")

# ------------------------------------------------------------------ animais de criação
def bicho(x, y, cor, w=3, h=1.6, ang=0.0):
    d.polygon(rot_rect(x + 1, y + 1, w, h * 2, ang), fill=(50, 50, 40))
    d.polygon(rot_rect(x, y, w, h * 2, ang), fill=cor)


for x0, y0, x1, y1, tipo, nome in pastos:
    for xa_, ya_, xb_, yb_ in [(x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)]:
        n_ = int(math.hypot(xb_ - xa_, yb_ - ya_) / 4)
        for k in range(n_):
            d.point((xa_ + (xb_ - xa_) * k / n_, ya_ + (yb_ - ya_) * k / n_), fill=(96, 72, 44))
    qtd, cores, tam = {"gado": (24, [(120, 80, 50), (90, 60, 40), (210, 200, 180)], (3.5, 1.6)),
                       "ovelhas": (16, [(230, 226, 214), (200, 196, 186)], (2.2, 1.2)),
                       "cabras": (18, [(220, 216, 200), (150, 120, 90), (80, 70, 60)], (2.0, 1.0)),
                       "porcos": (6, [(220, 170, 160)], (2.4, 1.2))}[tipo]
    for _ in range(qtd):
        bicho(rng.uniform(x0 + 4, x1 - 4), rng.uniform(y0 + 4, y1 - 4), cores[rng.integers(len(cores))], tam[0], tam[1], rng.uniform(0, 3.14))
# galinhas soltas pela vila
for cx, cy in casas[::3]:
    for _ in range(4):
        d.point((cx + rng.uniform(-14, 14), cy + rng.uniform(-14, 14)), fill=(240, 232, 210))

# ------------------------------------------------------------------ árvores, juncos e pedras (desenho) + amostra para o editor
ocup_np = np.array(ocup_img) > 0
del ocup_img
livre = ~(ocupado | ocup_np | mest | (dist_rio < 6))
objs = {"trees": [], "bushes": [], "rocks": [], "boulders": []}


def plantar(mask, passo, dens, rmin, rmax, cores, editor_frac, editor_tipo="trees"):
    ys, xs = np.nonzero(mask[::passo, ::passo])
    sel = rng.random(len(xs)) < dens
    xs = xs[sel] * passo + rng.uniform(-passo / 2, passo / 2, sel.sum())
    ys = ys[sel] * passo + rng.uniform(-passo / 2, passo / 2, sel.sum())
    rs = rng.uniform(rmin, rmax, len(xs))
    for x, y, r in zip(xs, ys, rs):
        d.ellipse([x - r + 2, y - r + 2, x + r + 2, y + r + 2], fill=(24, 40, 22))
    for x, y, r in zip(xs, ys, rs):
        c = cores[rng.integers(len(cores))]
        j = rng.uniform(0.9, 1.1)
        d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v * j) for v in c))
        d.ellipse([x - r * 0.6, y - r * 0.7, x + r * 0.1, y], fill=tuple(min(255, int(v * j * 1.18)) for v in c))
    pick = rng.random(len(xs)) < editor_frac
    for x, y, r in zip(xs[pick], ys[pick], rs[pick]):
        objs[editor_tipo].append(ed(x, y) + [round(float(r) / 4.5, 2)])


plantar(floresta & livre, 3, 0.22, 3.0, 6.5, [(40, 74, 38), (48, 86, 42), (34, 64, 36), (56, 90, 46), (30, 58, 40)], 0.075)
plantar(bosque & livre, 3, 0.035, 2.5, 5.0, [(66, 104, 50), (78, 116, 54), (58, 96, 46)], 0.3)
plantar(pantano & livre, 3, 0.012, 2.0, 3.5, [(84, 106, 60), (96, 112, 66)], 0.3, "bushes")    # salgueiros e moitas
plantar(~floresta & ~bosque & ~rocha & ~pantano & livre & (dv < 1300), 3, 0.003, 2.5, 4.5, [(70, 108, 52)], 0.6)
for P in POIS:
    if P["kind"] in ("burgo", "afogada", "sitio"):
        for _ in range(16):
            a, rr = rng.uniform(0, 6.28), P["raio"] * 0.7 * math.sqrt(rng.random())
            x, y = P["x"] + rr * math.cos(a), P["y"] + rr * math.sin(a)
            r_ = rng.uniform(3, 5)
            d.ellipse([x - r_, y - r_, x + r_, y + r_], fill=(52, 84, 44))
ys, xs = np.nonzero(pantano[::2, ::2] & livre[::2, ::2])
sel = rng.random(len(xs)) < 0.05
for x, y in zip(xs[sel] * 2, ys[sel] * 2):
    d.line([(x, y), (x + rng.uniform(-1.5, 1.5), y - 3)], fill=(150, 140, 80))
ys, xs = np.nonzero(rocha[::4, ::4] & livre[::4, ::4])
sel = rng.random(len(xs)) < 0.09
for x, y in zip(xs[sel] * 4, ys[sel] * 4):
    r = rng.uniform(1.5, 4.5)
    d.ellipse([x - r + 1.5, y - r + 1.5, x + r + 1.5, y + r + 1.5], fill=(70, 66, 60))
    g_ = int(rng.uniform(140, 180))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(g_, g_ - 4, g_ - 12))
    if rng.random() < 0.12:
        objs["boulders"].append(ed(x, y) + [round(float(r) * 0.6, 1)])
    elif rng.random() < 0.05:
        objs["rocks"].append(ed(x, y))
penhasco = rocha & (slope > 1.5)
arr = np.array(im)
arr[penhasco] = (arr[penhasco] * 0.72).astype(np.uint8)
im = Image.fromarray(arr)
del arr
d = ImageDraw.Draw(im)

im.save(os.path.join(AQUI, "mapa-4km-base.png"), optimize=True)
print("base ok", {k: len(v) for k, v in objs.items()}, len(buildings), "construções", len(pecas), "peças")

# ------------------------------------------------------------------ dados do editor (Mapic)
PIN = {"campina": 0, "floresta": 1, "rochas": 2, "vila": 3, "terra": 4, "areia": 5, "lavoura": 7, "acampamento": 8, "lama": 9, "musgo": 10, "estrada": 11}
PASSO = 4
n_ed = N // PASSO + 1
idx = np.minimum(np.arange(n_ed) * PASSO, N - 1)
cel = np.minimum(np.arange(n_ed) * PASSO + PASSO // 2, N - 1)
ci, cj = np.meshgrid(cel, cel)
pint = np.full((n_ed, n_ed), PIN["campina"], np.uint8)
for mask, k in [(bosque, "campina"), (floresta, "floresta"), (pantano, "lama"), (rocha, "rochas"), (areia, "areia"),
                (clareira_g, "musgo"), (agua, "terra"), (campo, "lavoura"), (ocup_np & (dv < 420), "vila"),
                (mpraca | mfog, "vila"), (mest, "estrada")]:
    pint[mask[cj, ci]] = PIN[k]
for P in POIS:
    if P["kind"] in ("acampamento", "bandidos", "posto"):
        m = np.hypot(ci - P["x"], cj - P["y"]) < P["raio"] * 0.8
        pint[m] = PIN["acampamento"]
alt = gaussian_filter(e, 1.0)[idx][:, idx].astype(np.float64)
amin, amax = float(alt.min()), float(alt.max())
q = np.round((alt - amin) / (amax - amin) * 65535).astype("<u2")
alturas_b64 = base64.b64encode(q.tobytes()).decode()
pintura_b64 = base64.b64encode(pint.tobytes()).decode()

# regiões: contornos das máscaras, simplificados
def regioes_de(mask, kind, nome_base, ficha=None, min_area=60000, tol=3.0):
    sm = mask[::8, ::8].astype(float)
    sm = gaussian_filter(sm, 1.2)
    out = []
    for c in find_contours(np.pad(sm, 1), 0.5):
        c = approximate_polygon(c - 1, tol)
        if len(c) < 4:
            continue
        ys_, xs_ = c[:, 0] * 8, c[:, 1] * 8
        area = 0.5 * abs(np.dot(xs_, np.roll(ys_, 1)) - np.dot(ys_, np.roll(xs_, 1)))
        if area < min_area:
            continue
        sgn = np.dot(xs_, np.roll(ys_, 1)) - np.dot(ys_, np.roll(xs_, 1))
        poly = [ed(min(max(x, 0), N), min(max(y, 0), N)) for x, y in zip(xs_, ys_)]
        out.append((area, poly))
    out.sort(key=lambda t: -t[0])
    regs = []
    for i, (area, poly) in enumerate(out[:1]):   # só a maior: as outras manchas poluem a vista do editor
        xs_, zs_ = [p[0] for p in poly], [p[1] for p in poly]
        r = {"id": f"{kind}_{i + 1}", "kind": kind, "name": nome_base if i == 0 else f"{nome_base} ({i + 1})", "poly": poly,
             "label": [round(sum(xs_) / len(xs_)), round(sum(zs_) / len(zs_))]}
        if ficha and i == 0:
            r["ficha_id"] = ficha
        regs.append(r)
    return regs


regions = []
regions += regioes_de(floresta, "floresta", "Mata Antiga", F["floresta"])
regions += regioes_de(rocha, "rochas", "Pedregal e Terras Altas de Rocherco", F["pedregal"])
regions += regioes_de(pantano, "charco", "Charcoantigo", F["charcoantigo"])
vila_poly = [ed(V[0] + 420 * math.cos(a), V[1] + 380 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 25)[:-1]]
regions.insert(0, {"id": "vila", "kind": "vila", "name": "Riachossagrado", "poly": vila_poly, "label": ed(*V), "ficha_id": F["riachossagrado"]})
regions.append({"id": "campina_sul", "kind": "campina", "name": "Campina do Sul", "ficha_id": F["campina"],
                "poly": [ed(1500, 2700), ed(2500, 2700), ed(2600, 3000), ed(2300, 3150), ed(1700, 3100), ed(1500, 2900)], "label": ed(2050, 2900)})
regions.append({"id": "polder", "kind": "lavoura", "name": "Pôlder do Mosteiro", "poly": [ed(*POLDER[:2]), ed(POLDER[2], POLDER[1]), ed(*POLDER[2:]), ed(POLDER[0], POLDER[3])], "label": ed(830, 2500)})
regions.append({"id": "rocherco", "kind": "areia", "name": "Rocherco", "ficha_id": F["rocherco"],
                "poly": [ed(2800, muro_y(2800) + 20), ed(4000, muro_y(4000) + 20), ed(4000, 4000), ed(2850, 4000), ed(2790, 3000), ed(2760, 2000), ed(2700, 1500), ed(2500, 1000)], "label": ed(3500, 2200)})
regions.append({"id": "charcoantigo", "kind": "charco", "name": "Charcoantigo", "ficha_id": F["charcoantigo"],
                "poly": [ed(0, muro_y(0) + 20), ed(1450, muro_y(1450) + 20), ed(1700, 900), ed(1230, 2300), ed(1250, 4000), ed(0, 4000)], "label": ed(700, 2900)})
limite = [ed(x, float(muro_y(x)) + 40) for x in range(160, 3881, 240)] + [ed(3880, 3880), ed(160, 3880)]

rios_ed = []
for nome, p, w0, w1 in rios_paths:
    pts = p[::12]
    rios_ed.append({"name": nome, "w": round((w0 + w1) / 2, 1), "pts": [ed(*q) for q in pts]})
for nome, cx, cy, rx, ry in LAGOS:
    pass  # lagos ficam no relevo (abaixo do nível da água)

estradas_ed = []
for i, (nome, w, p) in enumerate(estradas_paths):
    pts = [ed(*q) for q in p[::6]]
    estradas_ed.append({"id": f"estrada_{i + 1}", "name": nome, "w": w, "pts": pts, "marcos": pts[::4] + [pts[-1]], "segue": False})

marcos = []
for P in POIS:
    marcos.append({"id": f"marco_{len(marcos) + 1}", "ficha_id": P["ficha"], "nome": P["nome"], "x": ed(P["x"], P["y"])[0], "z": ed(P["x"], P["y"])[1]})
for nome, ficha, (px_, py_) in [("Casa do Grão Alto", F["casa_aymer"], HG), ("Mestre Aymer", F["aymer"], (HG[0] + 8, HG[1] - 2)),
                                ("Ralf", F["ralf"], (HG[0] - 10, HG[1] + 8)), ("Gunter", F["gunter"], (2005, 2098)),
                                ("Bolder", F["bolder"], (2120, 2060)), ("Padeira", F["clara"], (2068, 2072)),
                                ("Padre Clemente", F["clemente"], (2005, 1964)), ("Godwin", F["godwin"], (1945, 1995)),
                                ("Fonte Sagrada", F["riachossagrado"], FONTE), ("Veado branco (boato)", F["veado"], (2360, 2860)),
                                ("Lobos", F["lobo"], (900, 1300)), ("Escorpiões", F["escorpiao"], (3350, 1200)),
                                ("Serpentes", F["serpente"], (3700, 1450))]:
    marcos.append({"id": f"marco_{len(marcos) + 1}", "ficha_id": ficha, "nome": nome, "x": ed(px_, py_)[0], "z": ed(px_, py_)[1]})

dados = {
    "_nota": "Mapa de região 4 x 4 km gerado por netzach/art/mapa-regiao/gerar_mapa_4km.py. x = leste, z = sul, em metros; (0, 0) é o centro do mapa (a praça de Riachossagrado fica em (0, 50)).",
    "bounds": 2000, "limite": limite, "spawn": {"x": ed(*V)[0], "z": ed(*V)[1] + 6}, "plaza": {"x": ed(*V)[0], "z": ed(*V)[1], "r": 45},
    "regions": regions, "rios": rios_ed, "estradas": estradas_ed, "buildings": buildings, "pecas": pecas, "muralhas": muralhas,
    "fields": fields, "marcos": marcos, **objs,
    "pois": [{"nome": P["nome"], "x": ed(P["x"], P["y"])[0], "z": ed(P["x"], P["y"])[1], "nota": P["nota"]} for P in POIS],
}
linha = {"nome": "Riachossagrado 4 km", "lado": 4000, "n": int(n_ed), "altura_min": round(amin, 4), "altura_max": round(amax, 4),
         "nivel_agua": NIVEL_AGUA, "alturas": alturas_b64, "pintura": pintura_b64, "dados": dados}
with open(os.path.join(AQUI, "mapa-4km-editor.json"), "w", encoding="utf-8") as f:
    json.dump(linha, f, ensure_ascii=False, separators=(",", ":"))
print("editor ok", n_ed, amin, amax, len(regions), "regiões", len(fields), "lavouras", len(marcos), "marcos")

# ------------------------------------------------------------------ versão anotada
an = im.copy()
d = ImageDraw.Draw(an)
FT = "C:/Windows/Fonts/"
f_t = ImageFont.truetype(FT + "palab.ttf", 64)
f_g = ImageFont.truetype(FT + "palab.ttf", 48)
f_m = ImageFont.truetype(FT + "pala.ttf", 30)
f_mi = ImageFont.truetype(FT + "palai.ttf", 30)
f_p = ImageFont.truetype(FT + "pala.ttf", 20)
f_emo = ImageFont.truetype(FT + "seguiemj.ttf", 32)


def rotulo(x, y, txt, f, cor=(30, 24, 16), contorno=(240, 230, 205), sw=3, anchor="mm"):
    d.text((x, y), txt, font=f, fill=cor, stroke_width=sw, stroke_fill=contorno, anchor=anchor)


def icone(x, y, emo, f=f_emo):
    r = f.size * 0.75
    d.ellipse([x - r, y - r, x + r, y + r], fill=(244, 236, 214), outline=(90, 70, 40), width=3)
    d.text((x, y), emo, font=f, embedded_color=True, anchor="mm")


for txt, x, y, f in [("MURALHA FÉRREA", 2600, 130, f_g), ("Além da muralha: deserto", 2600, 70, f_mi),
                     ("CHARCOANTIGO", 640, 2950, f_g),
                     ("ROCHERCO", 3480, 2140, f_g),
                     ("Pé da Cordilheira", 130, 1100, f_mi), ("Mata Antiga", 700, 1450, f_mi), ("Pedregal", 3450, 1000, f_m),
                     ("Deserto de Rocherco", 3300, 560, f_mi), ("Campina do Sul", 2050, 3000, f_m), ("Pôlder do Mosteiro", 830, 2360, f_mi),
                     ("Mere Grande", 1500, 3790, f_mi), ("Mere do Mosteiro", 560, 3260, f_mi)]:
    rotulo(x, y, txt, f)
rotulo(2330, 1580, "RIACHOSSAGRADO", f_t)
pos_rot = {"Igreja": (2010, 1915), "Salão da vila": (1850, 2050), "Taverna": (2005, 2150), "Ferreiro": (2160, 2100),
           "Alfaiate": (1890, 1975), "Artesão": (2120, 2000), "Padaria": (2120, 2075), "Praça": V,
           "Fogueiras": (1905, 2192), "Casa do Grão Alto": (2340, 1795), "Moinho": None}
for k, (x, y) in predios.items():
    pr = pos_rot.get(k) or (x + 60, y + 15)
    if k != "Praça":
        d.line([(x, y), pr], fill=(40, 30, 20), width=1)
    rotulo(pr[0], pr[1], k, f_p, sw=2)
rotulo(FONTE[0] + 80, FONTE[1] - 14, "Fonte Sagrada", f_p, sw=2)
vist = []
nomes_c = {"trigo": "Trigo", "pousio": "Pousio", "nabo": "Nabos"}
for cult, cx, cy in rot_fields:
    if any(math.hypot(cx - a, cy - b) < 160 for a, b in vist):
        continue
    vist.append((cx, cy))
    rotulo(cx, cy, nomes_c.get(cult, cult), f_p, sw=2)
for nome, (x0, y0, x1, y1) in GRANDES:
    rotulo((x0 + x1) / 2, y0 - 14, nome, f_mi, sw=2)
for x0, y0, x1, y1, tipo, nome in pastos:
    emo = {"gado": "🐄", "ovelhas": "🐑", "cabras": "🐐", "porcos": "🐖"}[tipo]
    icone((x0 + x1) / 2, (y0 + y1) / 2, emo, ImageFont.truetype(FT + "seguiemj.ttf", 24))
    rotulo((x0 + x1) / 2, y1 + 16, nome, f_p, sw=2)
icone(2065, 2165, "🐔", ImageFont.truetype(FT + "seguiemj.ttf", 22))
for P in POIS:
    icone(P["x"], P["y"] - P["raio"] * 0.3 - 30, P["icone"])
    rotulo(P["x"], P["y"] - P["raio"] * 0.3 + 12, P["nome"], f_m if P["raio"] >= 60 else f_p, sw=3)
for nome, p, w0, w1 in rios_paths:
    q = p[int(len(p) * 0.3)]
    rotulo(q[0] + 90, q[1] - 30, nome, f_mi, cor=(20, 50, 90))
fauna = [("🦌", 2200, 3050), ("🦌", 1550, 2950), ("🦌", 700, 1950), ("🐗", 600, 1100), ("🐗", 1050, 2450),
         ("🐺", 760, 760), ("🐺", 380, 1550), ("🐺", 1150, 1500), ("🦊", 1450, 1150), ("🦊", 2500, 2450), ("🐇", 1650, 2800),
         ("🐇", 2450, 2200), ("🦂", 3200, 900), ("🦂", 3500, 1500), ("🦂", 3800, 2300), ("🐍", 3400, 2650), ("🐍", 3050, 750),
         ("🦎", 3700, 1150), ("🦎", 3300, 3200), ("🦅", 3600, 450), ("🦅", 300, 700), ("🦆", 1100, 3350), ("🦆", 1700, 3600),
         ("🐸", 400, 2700), ("🐸", 1000, 3200), ("🐟", 1290, 2600), ("🐟", 2730, 2500), ("🦉", 600, 1600), ("🐦", 2300, 2600),
         ("🦢", 560, 3120), ("🐻", 280, 1350), ("🦡", 1250, 1600), ("🐿️", 900, 1400)]
for emo, x, y in fauna:
    icone(x, y, emo, ImageFont.truetype(FT + "seguiemj.ttf", 26))
# escala e norte
d.rectangle([90, 3780, 1010, 3910], fill=(244, 236, 214), outline=(90, 70, 40), width=3)
for i in range(5):
    d.rectangle([120 + i * 160, 3830, 280 + i * 160, 3848], fill=(40, 30, 20) if i % 2 == 0 else (240, 232, 210), outline=(40, 30, 20))
for i, t in enumerate(["0", "200", "400", "600", "800 m"]):
    rotulo(120 + i * 160 + (40 if i == 4 else 0), 3808, t, f_p, sw=0)
rotulo(550, 3882, "1 pixel = 1 metro · 4 km × 4 km", f_p, sw=0)
cx, cy = 3830, 3790
d.ellipse([cx - 80, cy - 80, cx + 80, cy + 80], fill=(244, 236, 214), outline=(90, 70, 40), width=3)
d.polygon([(cx, cy - 66), (cx - 20, cy + 6), (cx, cy - 6), (cx + 20, cy + 6)], fill=(150, 40, 30))
d.polygon([(cx, cy + 66), (cx - 20, cy - 6), (cx, cy + 6), (cx + 20, cy - 6)], fill=(60, 50, 40))
rotulo(cx, cy - 100, "N", f_g)
an.save(os.path.join(AQUI, "mapa-4km-anotado.png"), optimize=True)
print("anotado ok")
