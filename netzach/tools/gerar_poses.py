"""Netzach · desenha as poses provisórias das pessoas (costas, perfil e passos) e grava nos arquivos do Aseprite.

Parte da figura de frente feita por tools/gerar_arte.py (os mesmos materiais e o mesmo sombreado):
- costas: a figura espelhada, com a cabeça repintada como nuca (cabelo, touca, coifa...) e sem o que só se vê de frente
  (rosto, barba no peito, avental, o que a pessoa segura na frente do corpo);
- perfil (lado, olhando para a direita): desenhado de novo a partir da ficha de cada pessoa (FICHAS, abaixo);
- passos: de frente e de costas, um pé sobe de cada vez; de perfil, as pernas e os braços balançam.
O quadro de frente parado continua o de art/gerado (a figura de sempre).

Uso (na pasta netzach):
  python tools/gerar_poses.py                 grava art/fonte/<nome>.aseprite de todas as pessoas
  python tools/gerar_poses.py faz_velho menina   só essas
  python tools/gerar_poses.py --previa        só desenha a folha de conferência (scratch), sem gravar
Depois: python tools/montar_atlas.py
CUIDADO: grava por cima do arquivo do Aseprite. Quem foi redesenhado à mão não deve passar por aqui (tire da lista).
Requer Pillow, numpy, scipy e o Aseprite."""
import json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gerar_arte as GA  # noqa: E402
from montar_atlas import aseprite  # noqa: E402

JOGO = os.path.dirname(AQUI)
FONTE = os.path.join(JOGO, 'art', 'fonte')
CX = 48
PASSO_MS = 150

# ---------------------------------------------------------------- fichas
# cabelo: (estilo, material). Estilos: curto, calvo, longo, tranca, trancas, coque, cuia, desgrenhado, franja, nenhum
# barba: None ou (tipo, material): cheia, comprida, curta, bigode, cavanhaque
# chapeu: None ou (tipo, material[, material2]): palha, gorro, faixa, touca, elmo_redondo, elmo_conico, tiara, capuz, boina
# roupa: material do corpo; manga: da manga (None = a roupa); antebraco: material do antebraço (pele = manga arregaçada)
# saia: True = roupa até o chão (sem pernas); fundo: profundidade do corpo de perfil (px); barriga: a mais na frente
# cinto, avental: (material, y relativo ao ombro) ou None; capa: material da capa (pelas costas, até o chão)
# perna, bota: materiais; item: (tipo, materiais...); frente: materiais que só se veem de frente (somem nas costas)
# avesso: {material: material do avesso} para o que fica para fora do corpo nas costas (o escudo visto por trás)
# vao: a linha da barra (onde as pernas aparecem), quando a medida automática erra (a capa atrás das pernas, por exemplo)
FICHAS = {
    'padre':       dict(cabelo=('calvo', 'cinza'), roupa='habito', saia=True, fundo=9, cinto=('corda', 46), bota='bota',
                        chapeu=('capuz', 'capuz'), item=('livro', 'couro_v', 'papel'), frente=('couro_v', 'papel', 'madeira', 'latao')),
    'ferreiro':    dict(cabelo=('curto', 'castanho'), barba=('cheia', 'barba'), roupa='linho', antebraco=True, fundo=9,
                        avental=('avental', 4), cinto=('cinto', 44), perna='calca', bota='bota', item=('martelo', 'madeira', 'ferro'),
                        frente=('avental',)),
    'taberneiro':  dict(cabelo=('calvo', 'castanho'), barba=('bigode', 'bigode'), roupa='ocre', antebraco=True, fundo=11, barriga=3,
                        avental=('linho_c', 34), perna='calca', bota='bota', item=('caneca', 'madeira', 'ferro'), frente=('linho_c',)),
    'anselmo':     dict(cabelo=('curto', 'castanho'), roupa='gambeson', manga='linho_c', fundo=9, sobre='tabardo',
                        cinto=('cinto', 46), perna='calca', bota='bota', item=('bainha', 'couro_v', 'latao')),
    'faz_velho':   dict(cabelo=('curto', 'branco'), barba=('comprida', 'branco'), chapeu=('palha', 'palha'), roupa='cinza_l',
                        fundo=8, curvado=3, cinto=('corda', 40), perna='cinza_l', bota='marrom', item=('enxada', 'madeira', 'ferro')),
    'faz_forte':   dict(cabelo=('curto', 'preto'), barba=('curta', 'preto'), chapeu=('faixa', 'rosa'), roupa='avental', manga='linho_c',
                        antebraco=True, fundo=10, cinto=('cinto', 46), perna='cinza_l', bota='marrom', item=('forcado', 'madeira', 'ferro')),
    'faz_gordo':   dict(cabelo=('curto', 'loiro'), barba=('curta', 'loiro'), chapeu=('gorro', 'mostarda'), roupa='verde', fundo=11,
                        barriga=9, cinto=('cinto', 50), perna='linho', bota='bota', item=('saco', 'linho_c', 'corda')),
    'faz_jovem':   dict(cabelo=('curto', 'loiro'), chapeu=('capuz', 'marrom'), roupa='azul', fundo=8, cinto=('cinto', 46),
                        perna='marrom', bota='bota', item=('canga', 'madeira', 'ferro', 'cinza_l')),
    'mulher_cesta': dict(cabelo=('nenhum', 'branco_p'), chapeu=('touca', 'branco_p'), roupa='azul_c', saia=True, fundo=9,
                         avental=('linho_c', 40), item=('cesta', 'corda', 'folha'), bota='marrom', frente=('linho_c',)),
    'mulher_tranca': dict(cabelo=('tranca', 'preto'), roupa='verde', saia=True, fundo=8, cinto=('marrom', 44), bota='bota',
                          item=('feixe', 'palha')),
    'mulher_velha': dict(cabelo=('coque', 'branco'), roupa='marrom', saia=True, fundo=9, curvado=4, xale='cinza_l', bota='bota',
                         item=('cajado', 'madeira')),
    'padeira':     dict(cabelo=('nenhum', 'loiro'), chapeu=('touca', 'branco_p'), roupa='mostarda', saia=True, fundo=12, barriga=4,
                        avental=('branco_p', 40), bota='marrom', item=('tabuleiro', 'madeira', 'pao'), frente=('branco_p', 'pao', 'madeira')),
    'menino_a':    dict(cabelo=('desgrenhado', 'castanho'), roupa='ocre', fundo=7, cinto=('corda', 32), perna='pele_j', bota='pele_j',
                        item=('espada_pau', 'madeira')),
    'menino_b':    dict(cabelo=('cuia', 'preto'), roupa='azul', fundo=7, cinto=('cinto', 30), perna='marrom', bota='bota',
                        item=('bola', 'linho')),
    'menina':      dict(cabelo=('trancas', 'loiro'), roupa='rosa', saia=True, fundo=7, avental=('linho_c', 28), bota='marrom',
                        item=('flores', 'folha', 'branco_p', 'azul_c'), frente=('linho_c',)),
    'soldado_lanca': dict(cabelo=('nenhum', 'malha'), chapeu=('elmo_redondo', 'ferro', 'malha'), roupa='malha', fundo=10,
                          cinto=('cinto', 50), perna='linho', bota='bota', item=('lanca', 'madeira', 'aco', 'vinho', 'mostarda')),
    'soldado_escudo': dict(cabelo=('nenhum', 'malha'), barba=('bigode', 'bigode'), chapeu=('elmo_conico', 'ferro', 'malha'), roupa='gambeson',
                           fundo=11, cinto=('cinto', 50), perna='cinza_l', bota='bota', item=('escudo', 'vinho', 'mostarda', 'ferro'),
                           frente=('vinho', 'mostarda'), avesso={'vinho': 'madeira', 'mostarda': 'madeira'}),
    'rapaz':       dict(cabelo=('franja', 'preto'), roupa='musgo_t', fundo=7, cinto=('corda', 44), perna='gambeson', bota='marrom',
                        item=('trouxa', 'madeira', 'linho')),
    'filha_senhor': dict(cabelo=('longo', 'ruivo'), chapeu=('tiara', 'latao'), roupa='esmeralda', saia=True, fundo=7,
                         cinto=('latao', 40), bota='couro_v'),
    'senhor':      dict(vao=152, cabelo=('curto', 'ruivo'), barba=('cheia', 'ruivo'), roupa='vinho', fundo=10, capa='tabardo', gola='arminho',
                        cinto=('cinto', 50), perna='calca', bota='couro_v', colar='latao'),
    'intendente':  dict(cabelo=('curto', 'preto'), barba=('cavanhaque', 'preto'), chapeu=('boina', 'vinho'), roupa='roxo', fundo=10,
                        barriga=2, cinto=('mostarda', 46), perna='mostarda', bota='couro_v', item=('rolo', 'papel'), colar='latao'),
    'alfaiate':    dict(cabelo=('curto', 'castanho'), roupa='azul', fundo=9, gola='vinho', cinto=('cinto', 46), perna='vinho', bota='bota',
                     item=('pano', 'rosa', 'aco')),
}


# ---------------------------------------------------------------- medidas da figura de frente
def medidas(f):
    op = f.mat > 0
    ys = np.where(op.any(1))[0]
    top, G = int(ys.min()), int(ys.max())
    nomes = f.names
    ido = nomes.index('olho') if 'olho' in nomes else -1
    oy = np.where((f.mat == ido).any(1))[0]
    olho = int(oy.min()) if len(oy) else top + 18
    pele = max((n for n in nomes[1:] if n.startswith('pele')), key=lambda n: (f.mat == nomes.index(n)).sum())
    # ombro: a primeira linha abaixo do queixo com o corpo largo
    ombro = next((y for y in range(olho + 12, G) if op[y].sum() > 28), olho + 22)
    # pernas: a linha mais alta em que há vão no meio com perna dos dois lados
    vao, falha = None, 0
    for y in range(G - 2, ombro, -1):
        if not op[y, CX - 1:CX + 1].any() and op[y, CX - 12:CX - 2].any() and op[y, CX + 2:CX + 12].any():
            vao, falha = y, 0
        elif vao is not None:
            falha += 1
            if falha > 4: break  # tiras e cordões cruzando o vão não contam
    return dict(top=top, G=G, olho=olho, ombro=ombro, vao=vao, pele=pele, H=f.h)


# ---------------------------------------------------------------- costas
def remenda(g, mask, mat, sigma=4.0):
    """pinta mask com o material mat e a luz da vizinhança desse material (sem bolota de sombra própria)"""
    from scipy import ndimage
    if not mask.any(): return
    i = g.mid(mat)
    W = ((g.mat == i) & ~mask).astype(float)
    if W.sum() < 10: g.shape(mask, mat, R=10, tex=0.03); return
    num = ndimage.gaussian_filter(g.lum * W, sigma); den = ndimage.gaussian_filter(W, sigma)
    lum = np.where(den > 1e-3, num / np.maximum(den, 1e-3), np.median(g.lum[W > 0]))
    lum = lum + g.rng.uniform(-0.04, 0.04, lum.shape)
    g.mat[mask] = i; g.lum[mask] = lum[mask]


def costas(n, f, M):
    F = FICHAS[n]
    g = GA.Fig(f.w, f.h, seed=7)
    g.names = list(f.names); g.mat = f.mat[:, ::-1].copy(); g.lum = f.lum[:, ::-1].copy(); g.part = f.part[:, ::-1].copy()
    ids = lambda *ms: np.isin(g.mat, [g.names.index(m) for m in ms if m in g.names])
    roupa = F['roupa']
    queixo = M['olho'] + 13
    cabeca = g.m_ell(CX, M['olho'] - 2.5, 10.5, 13) | g.m_poly([(CX - 9, M['olho']), (CX + 9, M['olho']), (CX + 5, queixo + 1), (CX - 5, queixo + 1)])
    est, cmat = F['cabelo']
    chap = F.get('chapeu')
    # o oval do rosto inteiro vira nuca, seja qual for o material (sobrancelha, olho, nasal do elmo...); o chapéu acima da testa fica
    oval = g.m_ell(CX, M['olho'] + 2.5, 8.6, 11) & (g.Y < queixo + 1)
    fica = ids(*[m for m in (chap or ())[1:] if m]) & (g.Y < M['olho'] - 3) if chap else np.zeros_like(oval)
    rosto = (oval & ~fica) | (cabeca & ids(M['pele'], 'olho', 'labio'))
    nuca = cmat
    if chap and chap[0] in ('touca',): nuca = chap[1]
    if chap and chap[0] in ('elmo_redondo', 'elmo_conico'): nuca = chap[2]
    if est == 'calvo':
        g.shape(rosto, M['pele'], R=6, bias=-0.04)
        anel = rosto & (g.Y > M['olho'] + 5 - 3 * np.abs(g.X - CX) / 10) & (g.Y < M['olho'] + 10 - np.abs(g.X - CX) / 10)
        g.shape(anel, cmat, R=2, tex=0.08)
    else:
        g.shape(rosto, nuca, R=6, tex=0.08 if nuca == cmat else 0.03)
    if chap and chap[0] == 'faixa':
        g.shape(g.m_poly([(CX - 10, M['olho'] - 8), (CX + 10, M['olho'] - 8), (CX + 10, M['olho'] - 5), (CX - 10, M['olho'] - 5)]) & cabeca, chap[1], R=2)
    # barba que desce pelo peito e o que só se vê de frente viram roupa (ou capa)
    corpo = roupa if not F.get('capa') else F['capa']
    tira = ids(*F.get('frente', ())) | (ids(F['barba'][1]) & (g.Y > queixo) if F.get('barba') else np.zeros_like(g.mat, bool))
    if F.get('avental'): tira |= ids(F['avental'][0])
    meio = np.abs(g.X - CX) < 17
    if tira.any():
        remenda(g, tira & meio & (g.Y > queixo), corpo)
    # o que sobra para fora do corpo mostra o avesso (o escudo visto por trás é de madeira)
    for m, avesso in (F.get('avesso') or {}).items():
        sel = ids(m) & ~meio
        if sel.any(): g.shape(sel, avesso, R=4, tex=0.08, bias=-0.1)
    # cabelo comprido e tranças pelas costas
    o = M['ombro']
    if est == 'longo':
        g.poly([(CX - 10, M['olho'] - 4), (CX + 10, M['olho'] - 4), (CX + 12, o + 26), (CX, o + 30), (CX - 12, o + 26)], cmat, R=6, tex=0.1)
    if est == 'tranca':
        for k in range(8): g.ell(CX + (1 if k % 2 else -1) * 0.8, queixo + 4 + k * 6, 3.4, 3.8, cmat, R=2, tex=0.06)
    if est == 'trancas':
        for sx in (-1, 1):
            for k in range(4): g.ell(CX + sx * 7, queixo + 2 + k * 5, 2.6, 3, cmat, R=2)
    if est == 'coque':
        g.ell(CX, M['top'] + 6, 6, 5, cmat, R=3, tex=0.1)
    if F.get('capa'):
        g.poly([(CX - 21, o + 4), (CX + 21, o + 4), (CX + 25, M['G'] - 10), (CX - 25, M['G'] - 10)], F['capa'], R=10, vgrad=0.15, tex=0.03)
        if F.get('gola'): g.poly([(CX - 18, o - 2), (CX + 18, o - 2), (CX + 16, o + 8), (CX - 16, o + 8)], F['gola'], R=4, tex=0.12)
    return g


# ---------------------------------------------------------------- passos de frente e de costas
def passo(g, F, M, lado):
    """sobe o pé (e a canela) de um lado: lado = -1 (esquerda da tela) ou 1"""
    h = GA.Fig(g.w, g.h); h.names = list(g.names); h.mat = g.mat.copy(); h.lum = g.lum.copy(); h.part = g.part.copy()
    G = M['G']
    mats = [F.get('bota'), F.get('perna')] if not F.get('saia') else [F.get('bota')]
    ids = [g.names.index(m) for m in mats if m and m in g.names]
    joelho = (M['vao'] + (G - M['vao']) * 0.45) if (M['vao'] and not F.get('saia')) else G - 9
    sobe = 4 if not F.get('saia') else 3
    metade = (g.X < CX) if lado < 0 else (g.X >= CX)
    m = np.isin(g.mat, ids) & metade & (g.Y >= joelho)
    ys, xs = np.where(m)
    h.mat[ys, xs] = 0
    h.mat[ys - sobe, xs] = g.mat[ys, xs]; h.lum[ys - sobe, xs] = g.lum[ys, xs] + 0.04
    return h


# ---------------------------------------------------------------- perfil (olhando para a direita)
def perfil(n, M, fase):
    """fase: 0..3 (0 e 2 = pernas abertas, 1 e 3 = cruzando; None = parado)"""
    F = FICHAS[n]
    f = GA.Fig(96, M['H'], seed=13)
    G, olho, o = M['G'], M['olho'], M['ombro']
    pele, roupa = M['pele'], F['roupa']
    manga = F.get('manga') or roupa
    cv = F.get('curvado', 0)
    fundo, barr = F.get('fundo', 9), F.get('barriga', 0)
    cx = 46
    hx, hy = cx + 2 + cv, olho - 2.5
    saia = F.get('saia')
    hem = G - 4 if saia else (M['vao'] or int(G * 0.7)) + 2
    quadril = (M['vao'] or hem) - 4
    perna_c = G - quadril
    # ângulo das pernas e dos braços
    if fase is None: a = 0.0
    else: a = [1, 0, -1, 0][fase]
    abre = 0.32 * a          # perna da frente para a frente (positivo)
    ergue = [0, 1, 0, -1][fase] if fase is not None else 0  # qual perna passa no ar
    desce = abs(a) * 1.5     # o quadril baixa com as pernas abertas
    def perna(sinal, fundo_):
        ang = abre * sinal
        joelho_d = 0
        if ergue == sinal: joelho_d = 4
        kx = cx + math.sin(ang) * perna_c * 0.5 + joelho_d * 0.8
        ky = quadril + desce + math.cos(ang) * perna_c * 0.5 - joelho_d * 0.5
        ax = cx + math.sin(ang) * perna_c * 0.95
        ay = min(G - 2, quadril + desce + perna_c - 2) - (3 if ergue == sinal else 0)
        bias = -0.22 if fundo_ else 0
        if not saia:
            f.cap(cx, quadril + desce, kx, ky, 4.6, 4.0, F.get('perna') or roupa, R=4, bias=bias, edge=0.12)
            f.cap(kx, ky, ax, ay - 3, 4.0, 3.4, F.get('perna') or roupa, R=4, bias=bias, edge=0.12)
            f.cap(ax, ay - 8, ax, ay - 1, 3.8, 3.8, F.get('bota') or 'bota', R=3, bias=bias)
        f.ell(ax + 3, ay, 6, 2.6, F.get('bota') or 'bota', R=2, bias=bias + 0.05)
    def braco(sinal, fundo_, segura=False):
        sw = -0.35 * a * sinal
        if segura: sw = 0.25
        sx, sy = cx + 1 + cv * 0.5, o + 6
        ex, ey = sx + math.sin(sw) * 17, sy + math.cos(sw) * 17
        sw2 = sw + (0.5 if segura else 0.15)
        wx, wy = ex + math.sin(sw2) * 16, ey + math.cos(sw2) * 16
        bias = -0.25 if fundo_ else 0.02
        f.cap(sx, sy, ex, ey, 5.2, 4.4, manga, R=4, bias=bias, edge=0.1)
        f.cap(ex, ey, wx, wy, 4.4, 3.8, pele if F.get('antebraco') else manga, R=3, bias=bias, edge=0.1)
        f.ell(wx + 0.5, wy + 3, 3.2, 4.2, pele, R=2, bias=bias)
        return wx, wy + 3
    item = F.get('item')
    segura = item and item[0] in ('enxada', 'forcado', 'lanca', 'cajado', 'livro', 'tabuleiro', 'escudo', 'rolo', 'feixe', 'cesta', 'espada_pau', 'flores')

    # capa por trás
    if F.get('capa'):
        f.poly([(cx - fundo + 1, o), (cx - fundo - 3, (o + G) / 2), (cx - fundo - 6, G - 8), (cx + 2, G - 9), (cx + 1, o + 6)], F['capa'], R=8, vgrad=0.15, bias=-0.1)
    # canga e saco ficam por trás do braço de fundo
    braco(-1, True)
    perna(-1, True)
    # tronco
    yw = o + (F['cinto'][1] if F.get('cinto') else int((hem - o) * 0.5))
    fr = cx + fundo - 2 + cv * 0.4
    flare = 6 if saia else 3
    sway = (a * 2) if saia else 0
    tronco = [(cx - fundo + 2 + cv * 0.5, o - 1), (fr, o), (fr + 2, o + 12), (fr + barr, yw - 4), (fr + barr * 0.6, yw + 6)]
    if saia: tronco += [(fr + flare + sway, G - 4), (cx + 2, G - 2), (cx - fundo - flare + sway, G - 4)]
    else: tronco += [(fr + flare, hem), (cx - fundo - 1, hem)]
    tronco += [(cx - fundo, yw), (cx - fundo - 1 - cv * 0.3, o + 14)]
    if not saia: perna(1, False)
    tr = f.poly(tronco, roupa, R=9, tex=0.03, vgrad=0.1, edge=0.08)
    if saia:
        for k in range(3): f.fold([(cx - 4 + k * 5, yw + 10), (cx - 5 + k * 6 + sway, G - 6)], 0.18, 0.06)
        # pés aparecendo na barra
        f.ell(cx + 6 + (a * 3), G - 1, 5, 2.2, F.get('bota') or 'bota', R=2)
    if F.get('sobre'):
        f.shape(f.m_poly([(fr - 6, o + 2), (fr + 1, o + 2), (fr + 2 + flare * 0.5, hem - 2), (fr - 7, hem - 2)]) & tr, F['sobre'], R=4)
    if F.get('avental'):
        am, ay = F['avental']
        f.shape(f.m_poly([(fr - 3, o + ay), (fr + 2 + barr, o + ay + 6), (fr + flare + 1 + sway, (G - 6) if saia else hem + 4), (fr - 4 + sway, (G - 6) if saia else hem + 4)]), am, R=4, tex=0.03, shadow=0.1)
    if F.get('cinto'):
        cm = F['cinto'][0]
        f.shape(f.m_poly([(cx - fundo - 2, yw), (fr + barr + 2, yw - 1), (fr + barr + 2, yw + 3), (cx - fundo - 2, yw + 4)]) & tr, cm, R=1.5)
    if F.get('xale'):
        f.poly([(cx - fundo - 1, o - 2), (fr + 2, o - 1), (fr + 4, o + 22), (cx, o + 34), (cx - fundo - 4, o + 26)], F['xale'], R=6, tex=0.05, shadow=0.12)
    # pescoço e cabeça
    f.poly([(hx - 5, olho + 6), (hx + 3, olho + 8), (hx + 4, o + 2), (hx - 6, o + 2)], pele, R=3, bias=-0.12)
    if F.get('gola'):
        f.poly([(cx - fundo, o - 3), (fr + 1, o - 2), (fr + 3, o + 5), (cx - fundo - 2, o + 6)], F['gola'], R=3, tex=0.12)
    if F.get('colar'):
        f.line([(fr - 1, o + 2), (fr + 1, o + 14), (fr + 1, o + 22)], F['colar'], 0.8)
    craneo = f.m_ell(hx, hy, 9.4, 11)
    face = f.m_poly([(hx + 3, hy - 9), (hx + 8, hy - 4), (hx + 9, olho - 1), (hx + 11.5, olho + 4), (hx + 9, olho + 6), (hx + 9.6, olho + 9),
                     (hx + 8.5, olho + 11), (hx + 7, olho + 13), (hx + 1, olho + 13), (hx - 4, olho + 9)])
    f.shape(craneo | face, pele, R=6, edge=0.15, bias=-0.04)
    f.px(hx + 6, olho, 'olho', 0.0); f.px(hx + 7, olho, 'olho', 0.5); f.px(hx + 5, olho, pele, 0.3)
    for x in (hx + 5, hx + 6, hx + 7): f.dk(x, olho - 2, -0.25)
    f.dk(hx + 9, olho + 9, -0.4); f.dk(hx + 8, olho + 9, -0.3); f.dk(hx + 10, olho + 5, -0.3)
    f.dk(hx + 3, olho + 2, 0.08)
    est, cmat = F['cabelo']
    topo = hy - 11
    if est in ('curto', 'longo', 'tranca', 'trancas', 'coque', 'cuia', 'desgrenhado', 'franja'):
        frente_cab = {'cuia': hx + 9, 'franja': hx + 9, 'desgrenhado': hx + 6}.get(est, hx + 5)
        baixo_cab = {'cuia': olho - 2, 'franja': olho - 1}.get(est, hy - 3)
        cab = f.m_ell(hx - 0.5, hy - 0.5, 10.3, 11.8) & ((f.Y < baixo_cab) | (f.X < hx - 2)) & (f.X < frente_cab) & (f.Y < olho + (8 if est != 'longo' else 30))
        cab &= ~((f.X > hx - 3) & (f.X < hx + 2) & (f.Y > olho - 3))  # a orelha fica à vista
        f.shape(cab, cmat, R=4, tex=0.1, edge=0.08)
        if est == 'longo':
            f.poly([(hx - 10, hy), (hx - 2, hy + 4), (hx - 1, o + 24), (hx - 12, o + 22)], cmat, R=5, tex=0.1)
        if est == 'desgrenhado':
            for k, dx in enumerate((-6, -2, 2, 5)): f.poly([(hx + dx - 2, topo + 2), (hx + dx + 1, topo - 4 + k % 2), (hx + dx + 3, topo + 2)], cmat, R=1.5, tex=0.1)
        if est == 'tranca':
            for k in range(7): f.ell(hx - 5 + k * 0.3, olho + 6 + k * 6, 3.2, 3.6, cmat, R=2, tex=0.06)
        if est == 'trancas':
            for k in range(4): f.ell(hx - 3, olho + 8 + k * 5, 2.6, 3, cmat, R=2)
        if est == 'coque':
            f.ell(hx - 9, topo + 5, 5.5, 5, cmat, R=3, tex=0.1)
    elif est == 'calvo':
        f.shape(f.m_ell(hx - 1, hy + 1, 10, 9) & (f.X < hx + 1) & (f.Y > hy - 3) & (f.Y < olho + 7), cmat, R=3, tex=0.08)
    f.ell(hx - 1, olho + 1, 2.2, 3.4, pele, R=2, bias=-0.1)   # orelha
    bar = F.get('barba')
    if bar:
        tipo, bm = bar
        if tipo in ('cheia', 'curta'):
            fim = olho + (17 if tipo == 'cheia' else 14)
            f.shape(f.m_poly([(hx + 1, olho + 3), (hx + 9, olho + 8), (hx + 10.5, olho + 11), (hx + 8, fim), (hx + 1, fim - 1), (hx - 3, olho + 8)]), bm, R=3, tex=0.12)
            f.dk(hx + 9, olho + 9, -0.3)
        if tipo == 'comprida':
            f.shape(f.m_poly([(hx + 1, olho + 3), (hx + 9, olho + 8), (hx + 11, olho + 12), (hx + 10, olho + 26), (hx + 6, olho + 40), (hx + 3, olho + 30), (hx - 2, olho + 10)]), bm, R=4, tex=0.1)
        if tipo == 'bigode':
            f.shape(f.m_poly([(hx + 6, olho + 7), (hx + 11, olho + 7), (hx + 10, olho + 10), (hx + 6, olho + 9)]), bm, R=1.5)
        if tipo == 'cavanhaque':
            f.shape(f.m_poly([(hx + 6, olho + 7), (hx + 10, olho + 7), (hx + 9, olho + 15), (hx + 5, olho + 13)]), bm, R=1.5)
    chap = F.get('chapeu')
    if chap:
        t, cm = chap[0], chap[1]
        if t == 'palha':
            f.poly([(hx - 8, topo + 6), (hx - 7, topo - 3), (hx + 5, topo - 4), (hx + 7, topo + 6)], cm, R=5, tex=0.1)
            aba = f.m_ell(hx, topo + 6, 19, 3.4); f.soft(aba, 0.3, sigma=1.6, off=(1, 3)); f.shape(aba, cm, R=3, tex=0.12)
        if t == 'gorro':
            f.poly([(hx - 10, hy - 1), (hx - 9, topo - 2), (hx - 2, topo - 5), (hx + 6, topo - 2), (hx + 9, hy - 3)], cm, R=5, tex=0.08)
            f.shape(f.m_poly([(hx - 10.5, hy - 3), (hx + 9.5, hy - 5), (hx + 9.5, hy - 2), (hx - 10.5, hy)]), cm, R=1.5, bias=0.1)
        if t == 'faixa':
            f.shape(f.m_poly([(hx - 10, hy - 6), (hx + 8, hy - 7), (hx + 8, hy - 4), (hx - 10, hy - 3)]), cm, R=1.5)
            f.poly([(hx - 10, hy - 5), (hx - 15, hy + 1), (hx - 13, hy + 3), (hx - 9, hy - 2)], cm, R=1.5)
        if t == 'touca':
            f.poly([(hx + 6, topo + 1), (hx + 7, olho - 3), (hx + 4, olho + 8), (hx + 3, olho + 13), (hx + 2, o + 4), (hx - 12, o + 4), (hx - 11, hy), (hx - 6, topo - 1)], cm, R=5, tex=0.04)
            f.ell(hx - 1, olho + 1, 1, 1, cm, flat=0.6)
        if t == 'capuz':
            f.poly([(hx - 4, olho + 7), (hx + 4, o - 1), (cx - fundo + 1, o + 10), (cx - fundo - 4, o + 6), (hx - 10, olho + 9)], cm, R=4, tex=0.05)
        if t == 'tiara':
            f.shape(f.m_poly([(hx - 9, hy - 6), (hx + 6, hy - 9), (hx + 6, hy - 7), (hx - 9, hy - 4)]), cm, R=1, bias=0.2)
        if t == 'boina':
            f.poly([(hx - 10, hy - 4), (hx - 8, topo - 3), (hx + 4, topo - 4), (hx + 8, hy - 6)], cm, R=4, tex=0.05)
        if t in ('elmo_redondo', 'elmo_conico'):
            malha = chap[2]
            f.shape(f.m_poly([(hx + 4, hy - 8), (hx + 6, olho - 3), (hx + 4, olho + 2), (hx + 5, olho + 10), (hx + 9, olho + 13), (hx + 10, o + 4),
                              (hx - 12, o + 6), (hx - 11, hy)]) | (f.m_ell(hx - 1, hy, 10.5, 12) & (f.X < hx + 4)), malha, R=4, tex=0.1)
            if t == 'elmo_redondo':
                f.shape(f.m_ell(hx, hy - 3, 10.8, 9.5) & (f.Y < hy - 1), cm, R=5, bias=0.05)
            else:
                f.poly([(hx - 10.5, hy - 1), (hx - 7, topo - 2), (hx + 1, topo - 9), (hx + 7, topo - 1), (hx + 10.5, hy - 1)], cm, R=5, bias=0.05)
            f.cap(hx + 9, hy - 2, hx + 9.5, olho + 5, 1.2, 1.2, cm, R=1, bias=0.1)  # nasal
    # braço da frente e o que leva
    mao = braco(1, False, segura=bool(segura))
    if item:
        desenha_item(f, item, mao, cx, fundo, fr, o, hem, G, olho, a, hx, hy)
    return f


def desenha_item(f, item, mao, cx, fundo, fr, o, hem, G, olho, a, hx, hy):
    t, ms = item[0], item[1:]
    mx, my = mao
    if t in ('enxada', 'forcado', 'lanca', 'cajado'):
        topo = {'enxada': o - 10, 'forcado': o - 22, 'lanca': o - 40, 'cajado': o + 2}[t]
        x0, x1 = mx + 1 + a * 2, mx + 3 + a * 2
        f.cap(x0, G - 1, x1, topo, 1.6, 1.6, ms[0], R=1.5)
        if t == 'enxada':
            f.poly([(x1 - 2, topo - 2), (x1 + 12, topo + 1), (x1 + 13, topo + 9), (x1 + 9, topo + 8), (x1 + 7, topo + 4), (x1 - 1, topo + 4)], ms[1], R=3)
        if t == 'forcado':
            for k in (-4, 0, 4): f.cap(x1 + k, topo + 2, x1 + k, topo - 12, 1, 0.8, ms[1], R=1)
            f.cap(x1 - 5, topo + 2, x1 + 5, topo + 2, 1.2, 1.2, ms[1], R=1)
        if t == 'lanca':
            f.poly([(x1 - 2, topo), (x1, topo - 12), (x1 + 2, topo)], ms[1], R=2, bias=0.1)
            f.poly([(x1 + 1, topo + 5), (x1 + 15, topo + 8), (x1 + 11, topo + 11), (x1 + 15, topo + 14), (x1 + 1, topo + 13)], ms[2], R=2)
        f.ell(mx + 2 + a * 2, my - 1, 3.3, 3.6, _pele(f), R=2)
    elif t == 'livro':
        f.poly([(fr - 2, o + 30), (fr + 10, o + 28), (fr + 11, o + 42), (fr - 1, o + 44)], ms[0], R=2, shadow=0.12)
    elif t == 'tabuleiro':
        f.poly([(fr - 6, o + 18), (fr + 16, o + 17), (fr + 16, o + 21), (fr - 6, o + 22)], ms[0], R=2, shadow=0.15)
        for k in range(3): f.ell(fr - 1 + k * 6, o + 16, 3.4, 2.6, ms[1], R=2, tex=0.06)
    elif t == 'cesta':
        f.poly([(mx - 9, my - 2), (mx + 8, my - 3), (mx + 6, my + 10), (mx - 7, my + 10)], ms[0], R=3, tex=0.12)
        f.ell(mx - 1, my - 3, 7, 3, ms[1], R=2, tex=0.15)
    elif t == 'feixe':
        f.poly([(mx - 3, my - 40), (mx + 6, my - 40), (mx + 5, my + 14), (mx - 2, my + 14)], ms[0], R=3, tex=0.18)
    elif t == 'martelo':
        f.cap(mx + 1, my, mx + 2, my + 18, 1.3, 1.3, ms[0], R=1)
        f.poly([(mx - 3, my + 17), (mx + 7, my + 17), (mx + 7, my + 22), (mx - 3, my + 22)], ms[1], R=2)
    elif t == 'caneca':
        f.poly([(mx - 1, my - 3), (mx + 7, my - 3), (mx + 7, my + 6), (mx - 1, my + 6)], ms[0], R=2, tex=0.06)
        f.cap(mx - 1, my - 1, mx - 1, my + 4, 0.8, 0.8, ms[1], R=1)
    elif t == 'bainha':
        f.cap(cx - 2, hem - 22, cx - 12, hem + 12, 2, 1.8, ms[0], R=1.5, bias=-0.05)
        f.cap(cx - 1, hem - 24, cx + 2, hem - 31, 1.2, 1.2, ms[1], R=1, bias=0.1)
    elif t == 'saco':
        f.ell(cx - fundo - 2, o - 2, 9, 12, ms[0], R=6, tex=0.06, shadow=0.15)
        f.dk(cx - fundo - 2, o - 13, -0.3)
    elif t == 'canga':
        f.cap(cx - 24, o + 1, cx + 24, o + 1, 1.8, 1.8, ms[0], R=1.5)
        for x in (cx - 24, cx + 24):
            f.line([(x, o + 2), (x, o + 30)], ms[2] if len(ms) > 2 else ms[0], 0.3)
            f.poly([(x - 5, o + 30), (x + 5, o + 30), (x + 4, o + 42), (x - 4, o + 42)], ms[0], R=2, tex=0.06)
            f.line([(x - 5, o + 33), (x + 5, o + 33)], ms[1], 0.4); f.line([(x - 4, o + 39), (x + 4, o + 39)], ms[1], 0.4)
    elif t == 'espada_pau':
        f.cap(mx + 2, my + 2, mx + 6, my - 26, 1.4, 1.2, ms[0], R=1)
        f.cap(mx - 2, my - 3, mx + 7, my - 4, 1, 1, ms[0], R=1)
    elif t == 'bola':
        f.ell(mx + 1, my + 3, 6, 6, ms[0], R=4, tex=0.08)
    elif t == 'flores':
        f.line([(mx + 2, my), (mx + 4, my - 10)], ms[0], 0.4)
        for k, cm in enumerate(ms[1:]): f.ell(mx + 3 + k * 3, my - 11 - k, 1.8, 1.6, cm, R=1)
    elif t == 'escudo':
        f.poly([(fr - 10, o + 8), (fr + 6, o + 8), (fr + 7, o + 40), (fr - 2, o + 58), (fr - 11, o + 40)], ms[0], R=4, shadow=0.15)
        f.shape(f.m_poly([(fr - 3, o + 9), (fr - 1, o + 9), (fr - 1, o + 55), (fr - 3, o + 55)]) | f.m_poly([(fr - 10, o + 22), (fr + 6, o + 22), (fr + 6, o + 25), (fr - 10, o + 25)]), ms[1], R=1)
        f.ell(fr - 2, o + 23, 2.5, 2.5, ms[2], R=2, bias=0.1)
    elif t == 'trouxa':
        f.cap(mx - 2, my + 2, cx - 26, o - 8, 1.3, 1.3, ms[0], R=1)
        f.ell(cx - 27, o - 8, 7, 7, ms[1], R=4, tex=0.08)
    elif t == 'rolo':
        f.cap(mx - 1, my - 8, mx + 3, my + 8, 2, 2, ms[0], R=2, bias=0.1)
    elif t == 'pano':
        f.poly([(mx - 4, my - 4), (mx + 4, my - 4), (mx + 5, my + 14), (mx - 3, my + 12)], ms[0], R=3, tex=0.06)


def _pele(f):
    return next(n for n in f.names[1:] if n and n.startswith('pele'))


# ---------------------------------------------------------------- todas as poses de uma pessoa
def poses(n, fn, orig):
    f = fn(); M = medidas(f); F = FICHAS[n]
    if F.get('vao'): M['vao'] = F['vao']
    rim = 0.12
    Q = {}
    Q['frente_parado'] = [orig]
    Q['frente_andar'] = [passo(f, F, M, -1).render(rim), orig, passo(f, F, M, 1).render(rim), orig]
    c = costas(n, f, M)
    cp = c.render(rim)
    Q['costas_parado'] = [cp]
    Q['costas_andar'] = [passo(c, F, M, -1).render(rim), cp, passo(c, F, M, 1).render(rim), cp]
    Q['lado_parado'] = [perfil(n, M, None).render(rim)]
    Q['lado_andar'] = [perfil(n, M, k).render(rim) for k in range(4)]
    return Q


def grava(n, Q, exe, tmp):
    d = os.path.join(tmp, n); os.makedirs(d, exist_ok=True)
    ordem = ('frente_parado', 'frente_andar', 'lado_parado', 'lado_andar', 'costas_parado', 'costas_andar')
    for t in ordem:
        for i, im in enumerate(Q[t]): im.save(os.path.join(d, '%s_%d.png' % (t, i)))
    lua = os.path.join(AQUI, 'aseprite', 'gravar_poses.lua')
    subprocess.run([exe, '-b', '--script-param', 'dir=' + d, '--script-param', 'out=' + os.path.join(FONTE, n + '.aseprite'),
                    '--script-param', 'ms=%d' % PASSO_MS, '--script', lua], check=True, capture_output=True)


def previa(todos, dest):
    """folha de conferência: cada pessoa numa linha (frente, costas, perfil e os 4 passos do perfil), em 2x"""
    linhas = []
    for n, Q in todos:
        q = [Q['frente_parado'][0], Q['frente_andar'][0], Q['costas_parado'][0], Q['costas_andar'][0], Q['lado_parado'][0]] + Q['lado_andar']
        W = sum(i.width for i in q) + 6 * len(q); H = max(i.height for i in q)
        lin = Image.new('RGBA', (W, H), (225, 212, 180, 255)); x = 0
        for i in q: lin.alpha_composite(i, (x, H - i.height)); x += i.width + 6
        linhas.append(lin)
    W = max(l.width for l in linhas); H = sum(l.height + 6 for l in linhas)
    out = Image.new('RGBA', (W, H), (225, 212, 180, 255)); y = 0
    for l in linhas: out.alpha_composite(l, (0, y)); y += l.height + 6
    out = out.resize((out.width * 2, out.height * 2), Image.NEAREST)
    out.save(dest)
    return dest


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    so_previa = '--previa' in sys.argv
    with open(os.path.join(JOGO, 'art', 'gerado', 'atlas.json'), encoding='utf-8') as fh:
        A = {s['name']: s for s in json.load(fh)['sprites']}
    folha = Image.open(os.path.join(JOGO, 'art', 'gerado', 'sprites.png')).convert('RGBA')
    fns = {n: fn for n, fn, r in GA.SPRITES()}
    nomes = args or list(FICHAS)
    todos = []
    for n in nomes:
        s = A[n]; orig = folha.crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
        todos.append((n, poses(n, fns[n], orig)))
    dest = os.environ.get('PREVIA') or os.path.join(tempfile.gettempdir(), 'netzach_poses.png')
    print('Prévia: ' + previa(todos, dest))
    if so_previa:
        return
    exe = aseprite()
    with tempfile.TemporaryDirectory() as tmp:
        for n, Q in todos:
            grava(n, Q, exe, tmp)
    print('Gravados em art/fonte: ' + ', '.join(n for n, _ in todos) + '. Agora: python tools/montar_atlas.py')


if __name__ == '__main__':
    main()
