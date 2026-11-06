"""Confere as trilhas dos moradores (walkers/trails) e o rebanho (cows) de data/vila.json contra a planta da cidade.

Percorre cada trilha em passos de 0,25 m, já com o desvio lateral (`side`) de cada pessoa, e acusa o ponto que
entrar num obstáculo com folga de 0,5 m. Árvores, veios e figuras fixas vêm do próprio vila.json, então vale rodar de
novo depois de mudar a cidade. Sai com código 1 se houver colisão. Uso: python3 tools/verificar_trilhas.py [vila.json]"""
import json, math, os, sys

PASSO, FOLGA, LIMITE = 0.25, 0.5, 44.5        # LIMITE: a cerca externa fica em fence.half 45 menos 0,5
RAIO_NO = 0.7                                  # tronco da árvore ou base do veio, em metros

# (nome, x0, z0, x1, z1)
PLANTA = [
    ('igreja', -3.5, -18, 3.5, -8), ('ferreiro', -17, -3.5, -9, 3.5), ('forja e bigorna', -9, -3.5, -7.2, 3.5), ('bar', 9, -4, 17, 4),
    ('barris do bar', 7.8, -4, 9, 4), ('quadro e baú', 8, 10, 9, 13.2), ('casa do senhor', -6, -38, 6, -28), ('padaria', 16, -33.5, 24, -26.5), ('forno', 24, -30.2, 26.4, -27.8),
    ('moradia NO', -39, 15, -33, 21), ('moradia NE', -27, 15, -21, 21), ('moradia SO', -39, 29, -33, 35), ('moradia SE', -27, 29, -21, 35),
    ('pasto', 20, -18, 42, 6), ('trigo', 14, 18, 42, 40), ('horta', -42, -32, -20, -10),
]


def medir(pts):
    acc = [0.0]
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        acc.append(acc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return acc


def ponto(pts, acc, s):
    s %= acc[-1]
    for i in range(len(pts)):
        if s <= acc[i + 1]:
            a, b = pts[i], pts[(i + 1) % len(pts)]
            t = (s - acc[i]) / ((acc[i + 1] - acc[i]) or 1)
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
    return pts[0]


def lateral(pts, acc, s, lado):
    """a mesma conta de view.js: tangente média entre 0,6 m atrás e 0,6 m à frente"""
    x, z = ponto(pts, acc, s)
    a, b = ponto(pts, acc, s - 0.6), ponto(pts, acc, s + 0.6)
    dx, dz = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dz) or 1
    return x - dz / l * lado, z + dx / l * lado


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    v = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(raiz, 'data', 'vila.json'), encoding='utf8'))
    circulos = [(n['id'], n['x'], n['z'], 0.5) for n in v['npcs']]
    circulos += [('árvore', p[0] + 0.5, p[1] + 0.5, RAIO_NO) for p in v['trees']] + [('veio', p[0] + 0.5, p[1] + 0.5, RAIO_NO) for p in v['rocks']]
    falhas = 0; menor = {}
    casos = sorted({(w['trail'], w['side']) for w in v['walkers']})
    for tr, lado in casos:
        pts = v['trails'][tr]; acc = medir(pts); n = int(acc[-1] / PASSO) + 1; achou = {}
        for k in range(n):
            x, z = lateral(pts, acc, k * PASSO, lado)
            if abs(x) > LIMITE - FOLGA or abs(z) > LIMITE - FOLGA: achou.setdefault('cerca externa', (x, z))
            for nome, x0, z0, x1, z1 in PLANTA:
                d = max(x0 - x, x - x1, z0 - z, z - z1)          # > 0: fora do retângulo, medido no eixo mais afastado
                menor[tr] = min(menor.get(tr, 99), d)
                if d < FOLGA: achou.setdefault(nome, (x, z))
            for nome, cx, cz, r in circulos:
                if math.hypot(x - cx, z - cz) < r + FOLGA: achou.setdefault(nome + ' (%g, %g)' % (cx, cz), (x, z))
        print('%-10s lado %+.1f  %5.1f m  %4d passos  %s' % (tr, lado, acc[-1], n, 'ok' if not achou else 'COLIDE: ' + '; '.join('%s em (%.1f, %.1f)' % (k, p[0], p[1]) for k, p in achou.items())))
        falhas += len(achou)
    print('menor distância até a planta por trilha:', ', '.join('%s %.2f m' % (k, d) for k, d in sorted(menor.items())))
    c = v['cows']; x0, z0, x1, z1 = c['area']; print('vacas: área do sprite x %g a %g, z %g a %g' % (x0, x1, z0, z1))
    for k, h in enumerate(c['herd']):
        if h[0] - h[2] < x0 or h[0] + h[2] > x1 or h[1] - h[3] < z0 or h[1] + h[3] > z1:
            print('  vaca', k, 'alcança a borda: o limite em view.js a segura');
    for nome, cx, cz, r in circulos:
        if x0 - 1.5 <= cx <= x1 + 1.5 and z0 - 1.5 <= cz <= z1 + 1.5: print('  aviso:', nome, 'em (%g, %g) está dentro do pasto' % (cx, cz))
    print('resultado:', 'nenhuma colisão' if not falhas else '%d colisões' % falhas)
    sys.exit(1 if falhas else 0)


main()
