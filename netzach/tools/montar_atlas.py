"""Netzach · monta o atlas das figuras: art/sprites.png + art/atlas.json, que é o que o jogo carrega.

De onde vêm as figuras:
- art/gerado/: a arte provisória feita por código (tools/gerar_arte.py escreve aqui: sprites.png, atlas.json e walls.png).
- art/fonte/<nome>.aseprite: a arte desenhada no Aseprite, um arquivo por personagem. Substitui a figura gerada de mesmo
  nome e traz as animações (marcas/tags no Aseprite):
      frente_parado  frente_andar   de frente
      lado_parado    lado_andar     olhando para a DIREITA da tela (o jogo espelha para a esquerda)
      costas_parado  costas_andar   de costas
  frente_parado é obrigatória (o 1º quadro dela é a figura parada de sempre). As outras são opcionais: sem lado ou costas,
  o jogo usa a de frente; sem andar, usa a parada. A duração de cada quadro no Aseprite é a velocidade no jogo.
  Todos os quadros de um arquivo têm o tamanho da tela dele; 100 px = 1 m; o pé fica na base da tela.

Quadros iguais entram uma vez só no atlas (os modelos começam com a mesma figura em todos os quadros).
Se o atlas mudou, troca o ?a= em js/view.js para o navegador baixar a arte nova.

Uso (na pasta netzach):
  python tools/montar_atlas.py                  monta o atlas
  python tools/montar_atlas.py --criar-fontes   antes, cria o arquivo do Aseprite de cada pessoa que ainda não tem
                                                (com a figura de hoje em todos os quadros, para redesenhar por cima)
O Aseprite é procurado em ASEPRITE (variável de ambiente), no PATH e na pasta padrão da Steam.
Requer Pillow (e, para o PNG sair pequeno, pyoxipng)."""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
JOGO = os.path.dirname(AQUI)
ART = os.path.join(JOGO, 'art')
GERADO = os.path.join(ART, 'gerado')
FONTE = os.path.join(ART, 'fonte')
LARGURA = 4096          # largura máxima do atlas (celulares antigos não abrem imagem maior que isso)
DIRS = ('frente', 'lado', 'costas')
MARCA = re.compile(r'^((frente|lado|costas)_(parado|andar)|rosto)$')  # rosto: o retrato das falas (opcional)


def aseprite():
    cands = [os.environ.get('ASEPRITE'), shutil.which('aseprite'), shutil.which('Aseprite'),
             r'D:\SteamLibrary\steamapps\common\Aseprite\Aseprite.exe',
             r'C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe',
             r'C:\Program Files\Aseprite\Aseprite.exe']
    for c in cands:
        if c and os.path.isfile(c):
            return c
    sys.exit('Não achei o Aseprite. Diga onde ele está: set ASEPRITE=C:\\caminho\\Aseprite.exe')


def pessoa(sp):
    """figuras de gente: 96 px de largura e 128 px (criança) ou mais de altura"""
    return sp['w'] == 96 and sp['h'] >= 128


def le_gerado():
    with open(os.path.join(GERADO, 'atlas.json'), encoding='utf-8') as f:
        atlas = json.load(f)
    folha = Image.open(os.path.join(GERADO, 'sprites.png')).convert('RGBA')
    figs = {sp['name']: folha.crop((sp['x'], sp['y'], sp['x'] + sp['w'], sp['y'] + sp['h'])) for sp in atlas['sprites']}
    return atlas, figs


def criar_fontes(figs, exe):
    os.makedirs(FONTE, exist_ok=True)
    lua = os.path.join(AQUI, 'aseprite', 'criar_fonte.lua')
    feitos = []
    with tempfile.TemporaryDirectory() as tmp:
        for nome, im in figs.items():
            dest = os.path.join(FONTE, nome + '.aseprite')
            if not pessoa({'w': im.width, 'h': im.height}) or os.path.exists(dest):
                continue
            png = os.path.join(tmp, nome + '.png'); im.save(png)
            subprocess.run([exe, '-b', '--script-param', 'src=' + png, '--script-param', 'out=' + dest, '--script', lua],
                           check=True, capture_output=True)
            feitos.append(nome)
    print('Arquivos do Aseprite criados: ' + (', '.join(feitos) if feitos else 'nenhum (todos já existiam)'))


def exporta(arq, exe, tmp):
    """exporta um .aseprite: devolve {marca: [(imagem, ms), ...]} na ordem dos quadros"""
    base = os.path.join(tmp, 'x')
    subprocess.run([exe, '-b', arq, '--split-tags', '--list-tags', '--format', 'json-array', '--sheet-type', 'rows',
                    '--filename-format', '{tag}|{tagframe}', '--sheet', base + '.png', '--data', base + '.json'],
                   check=True, capture_output=True)
    with open(base + '.json', encoding='utf-8') as f:
        d = json.load(f)
    folha = Image.open(base + '.png').convert('RGBA')
    marcas = {}
    for fr in d['frames']:
        tag, _, k = fr['filename'].rpartition('|')
        if not MARCA.match(tag):
            continue
        r = fr['frame']
        marcas.setdefault(tag, []).append((int(k), folha.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), fr['duration']))
    avisos = [t['name'] for t in d['meta'].get('frameTags', []) if not MARCA.match(t['name'])]
    if avisos:
        print('  aviso: ' + os.path.basename(arq) + ': marcas que o jogo não usa: ' + ', '.join(avisos))
    return {t: [(im, ms) for _, im, ms in sorted(L, key=lambda x: x[0])] for t, L in marcas.items()}


def quadrado(im):
    """o rosto: recortado em volta do desenho e centrado num quadrado (o quadro do Aseprite tem o tamanho da figura toda)"""
    caixa = im.getbbox()
    if not caixa:
        return im
    im = im.crop(caixa); l = max(im.size)
    q = Image.new('RGBA', (l, l), (0, 0, 0, 0)); q.paste(im, ((l - im.width) // 2, (l - im.height) // 2))
    return q


def empacota(itens):
    """prateleiras: das mais altas para as mais baixas, da esquerda para a direita, até LARGURA"""
    pos, x, y, alt = {}, 0, 0, 0
    for nome, im in sorted(itens, key=lambda t: (-t[1].height, t[0])):
        if x + im.width > LARGURA:
            x, y, alt = 0, y + alt, 0
        pos[nome] = (x, y)
        x += im.width; alt = max(alt, im.height)
    return pos, max([pos[n][0] + im.width for n, im in itens] + [1]), y + alt


def main():
    exe = None
    atlas, figs = le_gerado()
    if '--criar-fontes' in sys.argv:
        exe = aseprite(); criar_fontes(figs, exe)
    fontes = sorted(f for f in os.listdir(FONTE) if f.endswith('.aseprite') and not f.startswith('_')) if os.path.isdir(FONTE) else []  # _modelo: não entra

    final, ordem, anims, iguais = {}, [], {}, {}  # iguais: hash da imagem -> nome que já está no atlas

    def poe(nome, im):
        h = hashlib.sha1(im.tobytes() + bytes(str(im.size), 'ascii')).hexdigest()
        if h in iguais:
            return iguais[h]
        iguais[h] = nome; final[nome] = im; ordem.append(nome)
        return nome

    desenhados = set()
    if fontes:
        exe = exe or aseprite()
        with tempfile.TemporaryDirectory() as tmp:
            for arq in fontes:
                nome = arq[:-len('.aseprite')]
                m = exporta(os.path.join(FONTE, arq), exe, tmp)
                if 'frente_parado' not in m:
                    sys.exit(arq + ': falta a marca frente_parado (o 1º quadro dela é a figura parada).')
                poe(nome, m['frente_parado'][0][0])  # a figura de sempre, com o nome de sempre
                if 'rosto' in m:  # retrato próprio das falas (sem ele, o jogo recorta a cabeça da figura)
                    poe(nome + '@rosto', quadrado(m['rosto'][0][0]))
                A = {}
                for d in DIRS:
                    for estado in ('parado', 'andar'):
                        L = m.get(d + '_' + estado)
                        if L:
                            A.setdefault(d, {})[estado] = [{'s': poe('%s@%s_%s_%d' % (nome, d, estado, i), im), 'ms': ms}
                                                           for i, (im, ms) in enumerate(L)]
                # só entra o que já foi desenhado: lado ou costas iguais à frente, e passos iguais à figura parada, ficam
                # de fora (o jogo usa a frente parada no lugar, sem espelhar). Assim os modelos não mudam nada até serem redesenhados
                nomes = lambda L: [q['s'] for q in L]
                for d in ('lado', 'costas'):
                    if d in A and A.get('frente') and all(nomes(A[d].get(e, [])) == nomes(A['frente'].get(e, [])) for e in ('parado', 'andar')):
                        del A[d]
                for d in list(A):
                    if 'andar' in A[d] and set(nomes(A[d]['andar'])) <= set(nomes(A[d].get('parado', []))):
                        del A[d]['andar']
                if A != {'frente': {'parado': [A['frente']['parado'][0]]}} or A['frente']['parado'][0]['s'] != nome:
                    anims[nome] = A
                desenhados.add(nome)
    # o resto vem da arte gerada, na ordem dela
    for sp in atlas['sprites']:
        if sp['name'] not in desenhados:
            poe(sp['name'], figs[sp['name']])

    itens = [(n, final[n]) for n in ordem]
    pos, W, H = empacota(itens)
    folha = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for n, im in itens:
        folha.paste(im, pos[n])

    linhas = ['  {"name": "%s", "x": %d, "y": %d, "w": %d, "h": %d}' % (n, pos[n][0], pos[n][1], final[n].width, final[n].height) for n in ordem]
    texto = ('{"size": %d,\n "walls": %s,\n "sprites": [\n%s\n ],\n "anims": %s}\n'
             % (atlas['size'], json.dumps(atlas['walls'], ensure_ascii=False), ',\n'.join(linhas),
                json.dumps(anims, ensure_ascii=False, separators=(',', ':'))))

    destino_json, destino_png = os.path.join(ART, 'atlas.json'), os.path.join(ART, 'sprites.png')
    antes = open(destino_json, encoding='utf-8').read() if os.path.exists(destino_json) else ''
    antes_png = Image.open(destino_png).convert('RGBA').tobytes() if os.path.exists(destino_png) else b''
    mudou = antes.replace('\r\n', '\n') != texto or antes_png != folha.tobytes()
    if mudou:
        folha.save(destino_png, optimize=True)
        try:  # compressão sem perda (pip install pyoxipng): o atlas fica quase metade do tamanho
            import oxipng
            oxipng.optimize(destino_png, level=4)
        except ImportError:
            print('  aviso: sem o pyoxipng (pip install pyoxipng), o sprites.png fica maior que precisa')
        with open(destino_json, 'w', encoding='utf-8', newline='\r\n') as f:
            f.write(texto)
    walls = os.path.join(GERADO, 'walls.png')
    if os.path.exists(walls):
        shutil.copyfile(walls, os.path.join(ART, 'walls.png'))
    if mudou:
        sobe_versao_arte()
    print('Atlas: %d figuras (%d desenhadas no Aseprite, %d quadros de animação), %d x %d px%s.'
          % (len(ordem), len(desenhados), sum(len(L) for A in anims.values() for D in A.values() for L in D.values()), W, H,
             '' if mudou else ', sem mudança'))


def sobe_versao_arte():
    """o ?a= em js/view.js muda, para o navegador não usar a arte velha guardada"""
    js = os.path.join(JOGO, 'js', 'view.js')
    with open(js, encoding='utf-8', newline='') as f:
        t = f.read()
    t2, n = re.subn(r"\?a=(\d+)", lambda m: '?a=%d' % (int(m.group(1)) + 1), t, count=1)
    if n:
        with open(js, 'w', encoding='utf-8', newline='') as f:
            f.write(t2)
        print('Versão da arte em js/view.js: ' + re.search(r"\?a=\d+", t2).group(0))


if __name__ == '__main__':
    main()
