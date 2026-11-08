"""Confere as trilhas dos moradores (walkers/trails) e o rebanho (cows) de data/vila.json contra a planta da cidade.

Percorre cada trilha em passos de 0,25 m, já com o desvio lateral (`side`) de cada pessoa, e acusa o ponto que
entrar num obstáculo com folga de 0,5 m. A planta sai toda do próprio vila.json (construções, pasto, aprisco,
plantações, árvores, veios, pedras, figuras fixas e o portão), então vale rodar de novo depois de mudar a cidade.
Sai com código 1 se houver colisão. Uso: python3 tools/verificar_trilhas.py [vila.json]"""
import json, math, os, sys

PASSO, FOLGA = 0.25, 0.5
RAIO_NO = 0.7                                  # tronco da árvore ou base do veio, em metros
# o que cada construção põe na frente da porta (forja, barris, banca, degraus, barril de chuva), em metros além da parede
FRENTE = {'ferreiro': 1.8, 'bar': 1.2, 'padaria': 1.3, 'casa_senhor': 1.1, 'igreja': 0.3, 'alfaiate': 1.0, 'moradia': 0.8, 'forno': 0.6}
PLACA = {'ferreiro', 'bar', 'padaria', 'alfaiate'}  # oficinas com placa pendurada, que passa 0,8 m do canto da frente


def pegada(b):
    """retângulo da construção no mundo, com o que fica na frente da porta (rot 0 = sul, 90 = leste, -90 = oeste, 180 = norte)"""
    vira = abs(b['rot']) == 90
    fw, fd = (b['d'], b['w']) if vira else (b['w'], b['d'])
    x0, x1, z0, z1 = b['x'] - fw / 2, b['x'] + fw / 2, b['z'] - fd / 2, b['z'] + fd / 2
    f = FRENTE.get(b['type'], 0.5); r = b['rot'] % 360; LADO = 0.8 if b['type'] in PLACA else 0
    if r == 0: z1 += f; x0 -= LADO; x1 += LADO
    elif r == 180: z0 -= f; x0 -= LADO; x1 += LADO
    elif r == 90: x1 += f; z0 -= LADO; z1 += LADO
    else: x0 -= f; z0 -= LADO; z1 += LADO
    return (b['id'], x0, z0, x1, z1)


def planta(v):
    out = [pegada(b) for b in v['buildings']]
    out += [('pasto', v['pasture']['x0'], v['pasture']['z0'], v['pasture']['x1'], v['pasture']['z1'])]
    out += [(f['id'], f['x0'], f['z0'], f['x1'], f['z1']) for f in v.get('folds', [])]
    out += [(f['id'], f['x0'], f['z0'], f['x1'], f['z1']) for f in v['fields']]
    out += [(p['id'], p['x'] - p['w'] / 2, p['z'] - p['d'] / 2, p['x'] + p['w'] / 2, p['z'] + p['d'] / 2) for p in v.get('props', [])]
    g = v.get('gate')
    if g:  # os dois mourões do portão, fora da estrada
        for s in (-1, 1):
            x = g['x'] + s * (g['w'] / 2 + 0.5)
            out.append(('portão', x - 0.3, g['z'] - 0.3, x + 0.3, g['z'] + 0.3))
    return out


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
    PLANTA, LIMITE = planta(v), v['bounds'] - 1
    # os recursos ficam no centro da célula, como em sim.js
    circulos = [(n['id'], n['x'], n['z'], 0.5) for n in v['npcs']]
    circulos += [('árvore', math.floor(p[0]) + 0.5, math.floor(p[1]) + 0.5, RAIO_NO) for p in v['trees']]
    circulos += [('veio', math.floor(p[0]) + 0.5, math.floor(p[1]) + 0.5, RAIO_NO) for p in v['rocks']]
    circulos += [('pedra', p[0], p[1], p[2] / 2 + 0.3) for p in v.get('boulders', [])]
    falhas = 0; menor = {}
    casos = sorted({(w['trail'], w['side']) for w in v['walkers']})
    for tr, lado in casos:
        pts = v['trails'][tr]; acc = medir(pts); n = int(acc[-1] / PASSO) + 1; achou = {}
        for k in range(n):
            x, z = lateral(pts, acc, k * PASSO, lado)
            if abs(x) > LIMITE - FOLGA or abs(z) > LIMITE - FOLGA: achou.setdefault('borda do mundo', (x, z))
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
            print('  vaca', k, 'alcança a borda: o limite em view.js a segura')
    for nome, cx, cz, r in circulos:
        if x0 - 1.5 <= cx <= x1 + 1.5 and z0 - 1.5 <= cz <= z1 + 1.5: print('  aviso:', nome, 'em (%g, %g) está dentro do pasto' % (cx, cz))
    print('resultado:', 'nenhuma colisão' if not falhas else '%d colisões' % falhas)
    sys.exit(1 if falhas else 0)


main()
