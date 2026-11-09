# Netzach · guia do código

Onde está cada coisa, para mexer sem precisar de ajuda. O jogo é JavaScript puro (ES5, sem compilação): editou, salvou,
recarregou o navegador. Textos e comentários em português.

## Regras de ouro
1. **Toda publicação troca a versão**, senão quem já jogou fica com arquivos velhos (o Cloudflare guarda js e css por 4 h):
   - `js/ui.js`, linha 6: `var VERSION = '20261109-5'` → por exemplo `'20261109-6'`;
   - `index.html`: todos os `?v=20261109-5` (são 6) → o mesmo número novo. Use "Substituir tudo" no editor;
   - se mexeu na arte (`art/`), troque também o `?a=` em `js/view.js` (procure por `?a=`).
2. **Não mexa em `SAVE_VER`** (mesma linha da `VERSION`): mudar apaga os saves de todo mundo.
3. Os arquivos do site são públicos: nunca coloque senha ou chave no código.
4. Publicar: commit e **Push origin** no GitHub Desktop; espere uns 2 minutos e confira a versão no Menu do jogo.

## Testar no seu computador
Abra o PowerShell na pasta do site e rode:
```
powershell -ExecutionPolicy Bypass -File netzach\tools\servidor.ps1 -Root . -Port 8080
```
Depois abra `http://localhost:8080/netzach/`. Para parar, feche a janela do PowerShell (ou Ctrl+C).
No console do navegador (F12), `NZ.debug.state()` mostra o estado do jogo (ex.: `NZ.debug.state().player.inv.moeda = 500`
para testar lojas) e `NZ.debug.view()` a cena. O Menu tem um modo de testes escondido: clique 5 vezes seguidas na palavra
"Netzach" no topo do Menu.

## Os arquivos
| Arquivo | O que tem |
|---|---|
| `index.html` | Estrutura da tela: HUD, janelas (mapa, personagem, conversa, menu, tela inicial), textos do tutorial no Menu. |
| `css/netzach.css` | Aparência: pergaminho, botões, janelas, ajustes de celular (`body.touch`) e de controle (`body.pad`). |
| `data/game.json` | **Regras e números do jogo** (o mais fácil de mexer). Detalhes abaixo. |
| `data/vila.json` | **Planta do mundo**: posições de tudo. Detalhes abaixo. |
| `js/sim.js` | A simulação: combate, coleta, macro, missões, lojas, equipamento, atributos, conversão de saves antigos. Não desenha nada. |
| `js/view.js` | O desenho 3D: construções, chão, plantações, figuras, céu, espada na mão, clique nas coisas. |
| `js/ui.js` | Interface: tela inicial e saves, laço do jogo, HUD, mapa, janelas, lojas, teclado, mouse e toque. |
| `js/controle.js` | Controle (Xbox/gamepad): botões, foco nas janelas, cursor do mapa, câmera invertida. |
| `js/ceu.js` | Céu: cores de cada hora, sol, lua, estrelas, nuvens e montanhas. |
| `sw.js`, `manifest.webmanifest`, `icons/` | App instalável no celular e abertura sem internet. |
| `art/` | Imagens prontas: `sprites.png` (figuras), `walls.png` (texturas), `atlas.json` (onde cada figura está). |
| `tools/` | Ferramentas: `gerar_arte.py` (desenha a arte), `verificar_trilhas.py` (confere os caminhos dos moradores), `gerar_icones.py` (ícones do app), `servidor.ps1` (servidor de teste). |
| `PENDENCIAS.md` | O que falta fazer. |

## "Quero mudar…" → onde mexer
### Números e regras (`data/game.json`)
- **Jogador** (`player`): vida inicial e por nível (`hpBase`, `hpPerLv`), velocidade (`walkSpeed`), poção (`potionHeal`),
  XP por nível (`xpPerLevel`), pontos por nível (`pointsPerLevel`), itens e arma iniciais (`startItems`, `startEquip`).
- **Itens** (`items`): nome, `price` (quanto o comerciante paga), `buy` (quanto a loja cobra). Armas: `dmg` [mínimo, máximo],
  `interval` (segundos entre golpes), `reach` (alcance em metros). Roupas: `def` (defesa). `bonus` dá extras.
- **Classes de arma** (`weaponClasses`): espada, machado, arco (arco usa flechas).
- **Atributos** (`attributes`): o efeito de cada ponto (`per`), o limite (`cap`) e a descrição mostrada no jogo (`desc`).
- **Combate** (`combat.armorK`): quanto a defesa reduz o dano. **Posturas** (`stances`): ofensiva e defensiva.
- **Monstros e animais** (`monsters`): vida, dano, velocidade, XP, o que deixam cair (`drops`), tempo para renascer
  (`respawn`), em que ponto da região nascem (`spot`) e quantos (`count`), raio de ataque (`aggro`), veneno (`poison`),
  fuga dos veados.
- **Recursos** (`nodes`): árvores e veios: tempo de coleta e o que dão.
- **NPCs** (`npcs`): nome, fala, e o que vendem e compram (`services`: `shop` = loja, `sell` = compra do jogador).
- **Pessoas** (`pessoas`): papel, saudações (`ola`) e assuntos (`temas`) de cada um dos 22 moradores e lojistas.
- **Hostilidade** (`aldeoes`): reputação perdida, multa, tempo para acalmar e levantar, e a força de cada papel na luta.
- **Macro** (`macro`): as regras automáticas. **Diárias** (`daily`): missões do quadro, horário de reinício e recompensas.
- **Missões** (`quests`) e **conversas** (`dialogues`, `_textos`).

### Lugares (`data/vila.json`)
Coordenadas em metros: `x` cresce para o leste, `z` para o sul; o centro da praça é (0, 0). `rot` gira em graus.
- `bounds`: metade do tamanho do mundo (120 = 240 × 240 m).
- `buildings`: construções (`type`, `x`, `z`, `rot`). Os tipos são desenhados em `js/view.js`
  (`church`, `smith`, `bar`, `casaSenhor`, `padaria`, `forno`, `alfaiate`, `moradia`).
- `npcs`: onde cada NPC fica parado. `props`: quadro de avisos e baú.
- `plaza`, `avenue`, `road`, `streets`, `gate`: praça, avenida, estrada, ruas e portão.
- `pasture` (pasto das vacas) e `folds` (aprisco das ovelhas): as únicas cercas. `fields`: plantações.
- `regions`: floresta, pedregal e campina, com pontos marcados (`spots`) para os animais.
- `trees`, `rocks`, `boulders`, `bushes`, `rabbits`: árvores, veios, pedras grandes, arbustos e coelhos.
- `walkers` (moradores que andam), `trails` (os caminhos deles), `cows` (vacas); as ovelhas ficam em `folds` → `flock`.
- `interiores`: a sala de cada construção (porta, teto, paredes, luzes e móveis `moveis`). Os móveis são desenhados pela
  tabela `MOVEL` em `js/view.js`.
  **Depois de mexer em ruas, construções ou caminhos, rode** `tools/verificar_trilhas.py` para ver se alguém atravessa parede.

### Código
- **Desenho de uma construção:** `js/view.js`, funções `church`, `smith`, `bar`, `casaSenhor`, `padaria`, `alfaiate`,
  `moradia`… Montagem do mundo em `View.prototype.buildStatic`; moradores e vacas em `buildAmbient`.
- **Altura das figuras** (pessoas, animais, árvores): `SIZE` em `js/view.js`.
- **Céu e horários:** `js/ceu.js`, tabela `HORAS` (cores por hora do dia); montanhas em `serra`.
- **Distância da névoa:** `js/view.js`, `fog: [45, 150]` (começa a 45 m e fecha em 150 m).
- **Combate:** `js/sim.js`, `Sim.prototype.strike` (um golpe) e `swing`; contas do personagem em `stats`.
- **Coleta e macro:** `js/sim.js`, `finishGather`, `macroTick`, `decide` (a colheita das plantações usa a mesma coleta).
- **Animais e guardas perseguindo:** `js/sim.js`, `mobTick` (bichos), `genteTick` (moradores em briga), `chase` e
  `hitPlayer` (perseguir e bater, comum a todos), `foge` (moradores fugindo por um caminho) e `afasta` (ninguém em cima de outro).
- **Menu das pessoas e falas:** `js/ui.js`, procure por `pessoas` e `talk`.
- **Leite e lã:** `js/ui.js`, procure por `farm` (vacas e ovelhas); o tempo de cada animal fica em `st.farm`. Onde cada vaca e
  ovelha está em cada instante: `World.bichoEm` em `js/sim.js` (pelo relógio do jogo, o mesmo para o desenho e a macro, que
  usa a regra `fazenda`).
- **Interiores:** `js/view.js`, `MOVEL` (móveis), `salaQuadro` (qual sala aparece), e a luz da sala no sombreador (`FS`).
- **Lojas:** `js/sim.js`, `service` e `buyItem`; tela em `js/ui.js` (`sellBox`, `openSell`).
- **Janela Personagem:** `js/ui.js`, seção "personagem" (`openChar`, `renderEquip`, `renderBagTab`, `renderAttr`).
- **Ícones dos itens:** `js/ui.js`, `ITEM_ICONS`.
- **Mapa:** `js/ui.js`, `drawMap` (as salas e portas saem de `world.salas`); zoom inicial do mapa grande `MAP_OPEN` (50) e do minimapa `MINI_ZOOM` (80).
- **Teclas:** `js/ui.js`, procure por `KeyM` (M mapa, G macro, R regras, I/B personagem, T postura, F poção, E interagir).
- **Botões do controle:** `js/controle.js`, função `noJogo` (fora das janelas); velocidade da câmera em `OLHAR_X`/`OLHAR_Y`.
- **Saves:** `js/ui.js`, seção "save" (3 espaços, chaves `zg-vila-proto-v1-1` a `-3`); conversão de saves antigos em
  `js/sim.js` (`NZ.migrate`, `NZ.migrateGear`, `NZ.settle`).

## Arte
A arte é desenhada por código em `tools/gerar_arte.py` (uma função por figura: `padre`, `ferreiro`, `mulher_velha`…) e
gravada em `art/`. Gerar de novo exige o Python do Blender (`C:\Program Files\Blender Foundation\Blender 5.2\5.2\python\bin\python.exe`)
e substitutos de Pillow/scipy que ficaram numa pasta temporária das conversas comigo; por isso, mexer na arte é mais
trabalhoso que no resto. A arte nova (animais, alfaiate, árvores, roupas) está pela metade num ramo à parte: ver `PENDENCIAS.md`.
