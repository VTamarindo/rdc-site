"""Gera os ícones do app em icons/: entardecer, serras e o escudo do favicon, em pixel art.
A arte ocupa o quadro inteiro e o escudo fica no miolo, para sobreviver aos recortes do Android.
Uso: python tools/gerar_icones.py (só precisa de numpy)."""
import math, os, struct, zlib
import numpy as np

N = 64
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 + 1 / 32
CEU = [(0x2a, 0x2c, 0x5e), (0x5a, 0x3e, 0x78), (0xa8, 0x4e, 0x6c), (0xe8, 0x7a, 0x58), (0xf4, 0xb8, 0x6e)]
SERRAS = [((0x6a, 0x4a, 0x70), 19, 5, 3, 0.5), ((0x3e, 0x34, 0x58), 13, 4, 5, 2.1), ((0x20, 0x20, 0x38), 7, 3, 7, 4.0)]
AZUL, OURO, OURO_CLARO, OURO_ESCURO = (0x2a, 0x2f, 0x3d), (0xc9, 0xa2, 0x4b), (0xf0, 0xd0, 0x7a), (0x8a, 0x68, 0x28)


def desenha():
    a = np.zeros((N, N, 3), np.uint8)
    for y in range(N):  # céu em faixas, com trama entre uma cor e a outra
        for x in range(N):
            t = y / (N - 1) * (len(CEU) - 1)
            i = min(int(t), len(CEU) - 2)
            a[y, x] = CEU[i + 1 if t - i > BAYER[y & 3, x & 3] else i]
    for cor, base, amp, freq, fase in SERRAS:
        for x in range(N):
            u = x / N * math.pi * 2
            alt = base + amp * (math.sin(u * freq + fase) + 0.5 * math.sin(u * freq * 2.3 + fase * 2))
            a[int(N - alt):, x] = cor
    cx, cy, W, H = 31.5, 32, 16, 19
    def dentro(x, y, m=0):  # m: recuo em pixels a partir da borda do escudo
        dx, dy = abs(x - cx), y - cy
        if dy < -H + 5 * dx / W + m:
            return False
        t = (dy + H) / (2 * H)
        w = W if t < 0.55 else W * math.sqrt(max(0, 1 - ((t - 0.55) / 0.45) ** 2))
        return dx < w - m
    for y in range(N):
        for x in range(N):
            if dentro(x, y):
                a[y, x] = AZUL if dentro(x, y, 2.2) else (OURO_CLARO if x < cx else OURO)
    for y in range(21, 46):  # cruz
        for x in (30, 31, 32, 33):
            a[y, x] = OURO_CLARO if x == 30 else OURO_ESCURO if x == 33 else OURO
    for x in range(23, 41):
        for y in (27, 28, 29, 30):
            a[y, x] = OURO_CLARO if y == 27 else OURO_ESCURO if y == 30 else OURO
    return a


def png(caminho, img):
    h, w, _ = img.shape
    linhas = b''.join(b'\0' + img[y].tobytes() for y in range(h))
    def bloco(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    with open(caminho, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + bloco(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + bloco(b'IDAT', zlib.compress(linhas, 9)) + bloco(b'IEND', b''))


raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(raiz, exist_ok=True)
arte = desenha()
for nome, lado in (('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)):
    idx = np.arange(lado) * N // lado
    png(os.path.join(raiz, nome), arte[idx][:, idx])
print('ok')
