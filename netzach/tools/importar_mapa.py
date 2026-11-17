# -*- coding: utf-8 -*-
"""Netzach · traz um mapa do editor (roteirizador / Mapic) para o jogo: data/regiao.json.

Entrada: o .json de um mapa inteiro, no formato da linha da tabela `mapas` (o mesmo que o botão "Importar .json" do
editor aceita): n, lado, altura_min, altura_max, nivel_agua, alturas e pintura em base64, dados.

O que sai (data/regiao.json):
  - tudo de data/vila.json que faz a vila funcionar (construções com sala, pessoas, quem anda, plantações, pasto, aprisco,
    praça, ruas, quadro de avisos...), com a praça no (0, 0) como sempre;
  - em volta, o mapa do editor: relevo, pintura do chão, rios, árvores, pedras, construções, peças, muralhas, regiões e
    o limite jogável. O que o editor pôs em cima da vila do jogo (as casas geradas perto da praça) fica de fora;
  - `relevo`: a grade de alturas (16 bits) e a pintura (1 byte por ponto) em base64, já deslocadas para a praça ficar no
    (0, 0) e na altura 0. Em volta da praça o chão fica plano (a vila do jogo é plana).

Uso (na pasta netzach):  python tools/importar_mapa.py <mapa.json> [--praca X Z]
  --praca: onde fica a praça da vila no mapa do editor (padrão: dados.plaza, ou 0 0).
"""
import argparse
import base64
import json
import math
import os

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
PLANO = 175       # m em volta da praça: chão plano, na altura 0
TRANSICAO = 110   # m de rampa entre o plano da vila e o relevo do mapa
SEM_EDITOR = 260  # m: construções, peças e lavouras do editor mais perto que isso da praça saem (a vila do jogo fica ali)
VILA_PINTURA = 3  # índice 'vila' (terra batida) do editor: as casas geradas; vira campina
CAMPINA = 0
ESTRADA = 11

# o que a vila do jogo traz (o resto vem do mapa do editor)
DA_VILA = ['plaza', 'avenue', 'road', 'gate', 'streets', 'pasture', 'folds', 'fields', 'buildings', 'npcs', 'spawn',
           'walkers', 'trails', 'cows', 'props', '_interiores', 'interiores']


def ler(caminho):
    with open(caminho, encoding='utf-8') as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mapa')
    ap.add_argument('--praca', nargs=2, type=float)
    ap.add_argument('--saida', default=os.path.join(RAIZ, 'data', 'regiao.json'))
    a = ap.parse_args()

    M = ler(a.mapa)
    vila = ler(os.path.join(RAIZ, 'data', 'vila.json'))
    D = M['dados']
    n, lado = int(M['n']), float(M['lado'])
    passo = lado / (n - 1)
    alt = np.frombuffer(base64.b64decode(M['alturas']), '<u2').astype(np.float64).reshape(n, n) / 65535 * (M['altura_max'] - M['altura_min']) + M['altura_min']
    pin = np.frombuffer(base64.b64decode(M['pintura']), np.uint8).reshape(n, n).copy()
    if a.praca:
        px, pz = a.praca
    elif isinstance(D.get('plaza'), dict):
        px, pz = float(D['plaza']['x']), float(D['plaza']['z'])
    else:
        px, pz = 0.0, 0.0

    # coordenadas do editor -> do jogo (a praça vai para o 0, 0)
    def P(x, z):
        return [round(x - px, 2), round(z - pz, 2)]

    # relevo: plano na vila, rampa até o relevo, e a praça na altura 0
    xs = -lado / 2 + np.arange(n) * passo - px
    zs = -lado / 2 + np.arange(n) * passo - pz
    gx, gz = np.meshgrid(xs, zs)
    dist = np.hypot(gx, gz)
    i0 = int(round((px + lado / 2) / passo))
    j0 = int(round((pz + lado / 2) / passo))
    h0 = float(alt[j0, i0])
    t = np.clip((dist - PLANO) / TRANSICAO, 0, 1)
    t = t * t * (3 - 2 * t)
    alt = (alt - h0) * t
    nivel = float(M.get('nivel_agua', -0.6)) - h0
    # pintura: as casas geradas viram campina; dentro do plano da vila, tudo campina (a vila do jogo desenha o resto)
    pin[pin == VILA_PINTURA] = CAMPINA
    pin[(dist < PLANO) & (pin != CAMPINA)] = CAMPINA
    amin, amax = float(alt.min()), float(alt.max())
    q = np.round((alt - amin) / (amax - amin) * 65535).astype('<u2')

    def longe(x, z, r=SEM_EDITOR):
        return math.hypot(x - px, z - pz) >= r

    R = {k: vila[k] for k in DA_VILA if k in vila}
    R['_nota'] = ('Gerado por tools/importar_mapa.py a partir de um mapa do editor. Não edite aqui: edite no editor, exporte o mapa '
                  'inteiro (.json) e rode a ferramenta de novo. A vila (praça no 0, 0) vem de data/vila.json.')
    R['bounds'] = lado / 2
    R['relevo'] = {'n': n, 'lado': lado, 'x0': round(-lado / 2 - px, 2), 'z0': round(-lado / 2 - pz, 2), 'min': round(amin, 4),
                   'max': round(amax, 4), 'nivel': round(nivel, 3), 'alturas': base64.b64encode(q.tobytes()).decode(),
                   'pintura': base64.b64encode(pin.tobytes()).decode()}
    R['limite'] = [P(*p) for p in D.get('limite', [])] or None
    R['rios'] = [{'name': r.get('name', 'Rio'), 'w': r.get('w', 4), 'pts': [P(*p) for p in r['pts']]} for r in D.get('rios', [])]

    for k in ('trees', 'bushes', 'boulders'):
        R[k] = [P(p[0], p[1]) + [p[2] if len(p) > 2 else 1] for p in D.get(k, []) if longe(p[0], p[1], PLANO + 20)]
    R['rocks'] = [P(p[0], p[1]) for p in D.get('rocks', []) if longe(p[0], p[1], PLANO + 20)]
    R['rabbits'] = []

    def rot(r):
        r = ((float(r or 0) + 180) % 360) - 180
        return round(r, 1)

    extra = []
    for b in D.get('buildings', []):
        if not longe(b['x'], b['z']):
            continue
        c = dict(b)
        c['x'], c['z'] = P(b['x'], b['z'])
        c['rot'] = rot(b.get('rot'))
        c['id'] = 'ed_' + str(b['id'])
        c.setdefault('w', 6); c.setdefault('d', 6); c.setdefault('h', 3)
        extra.append(c)
    R['buildings'] = R['buildings'] + extra

    # peças: pontes viram travessias (o rio fica livre ali e o jogo desenha a ponte); o resto vai como peça
    R['pecas'] = []
    R['travessias'] = []
    for p in D.get('pecas', []):
        x, z = P(p['x'], p['z'])
        if p['tipo'] in ('ponte_pedra', 'ponte_madeira'):
            esc = float(p.get('escala') or 1)
            R['travessias'] = R['travessias'] + [{'tipo': 'ponte', 'name': p.get('name') or 'Ponte', 'x': x, 'z': z,
                                                          'ang': rot(-(p.get('rot') or 0)), 'len': round(12 * esc + 8, 1), 'w': 6}]
            continue
        if not longe(p['x'], p['z']):
            continue
        R['pecas'].append({'id': p['id'], 'tipo': p['tipo'], 'x': x, 'z': z, 'rot': rot(p.get('rot')),
                           'escala': p.get('escala') or 1, 'name': p.get('name') or ''})
    R['muralhas'] = []
    for m in D.get('muralhas', []):
        pts = [P(*q) for q in m['pts']]
        if all(math.hypot(q[0], q[1]) < SEM_EDITOR for q in pts):
            continue
        if m['id'].startswith('palicada'):   # a paliçada da casa senhorial gerada: a do jogo é outra
            continue
        c = {k: v for k, v in m.items() if k != 'pts'}
        c['pts'] = pts
        c['portoes'] = [dict(g, **dict(zip(('x', 'z'), P(g['x'], g['z'])))) for g in m.get('portoes', [])]
        R['muralhas'].append(c)

    # regiões do editor com pontos para os bichos nascerem (como as da vila: spots)
    pois = {p['nome']: P(p['x'], p['z']) for p in D.get('pois', [])}

    def spot(kind, nome, onde, r=14):
        x, z = pois.get(onde, onde) if isinstance(onde, str) else onde
        return {'kind': kind, 'name': nome, 'x': x, 'z': z, 'r': r}

    regs = []
    for r in D.get('regions', []):
        c = {k: v for k, v in r.items() if k not in ('poly', 'label', 'ficha_id')}
        c['poly'] = [P(*q) for q in r.get('poly', [])]
        if r.get('label'):
            c['label'] = P(*r['label'])
        kind = r.get('kind')
        if kind == 'floresta':
            c['spots'] = [spot('lobos', 'Covil da mata', 'Clareira do Grambuche'), spot('lobos', 'Covil da cordilheira', 'Cabana do Caçador'),
                          spot('trolls', 'Toca do troll', 'Toca do Troll', 10), spot('coelhos', 'Toca dos coelhos', 'Carvoaria', 16)]
        elif kind == 'rochas':
            c['spots'] = [spot('escorpioes', 'Lajedo quente', 'Ruínas do Tempo Parado'), spot('cobras', 'Grota das cobras', 'Gruta das Serpentes')]
        elif kind == 'campina':
            c['spots'] = [spot('cervos', 'Prado dos cervos', 'Pedras de Pé', 18), spot('cervos', 'Várzea do sul', [-200, 600], 14)]
        regs.append(c)
    R['regions'] = [r for r in vila['regions'] if r['id'] == 'vila'] + regs
    R['pois'] = [{'nome': p['nome'], 'x': P(p['x'], p['z'])[0], 'z': P(p['x'], p['z'])[1], 'nota': p.get('nota', '')} for p in D.get('pois', [])]

    with open(a.saida, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(R, f, ensure_ascii=False, separators=(',', ':'))
    print('ok', a.saida, f'{os.path.getsize(a.saida) / 1e6:.1f} MB', 'praça', (px, pz), 'altura da vila', round(h0, 2),
          'nível', round(nivel, 2), len(R['buildings']), 'construções', len(R['pecas']), 'peças', len(R['trees']), 'árvores')


if __name__ == '__main__':
    main()
