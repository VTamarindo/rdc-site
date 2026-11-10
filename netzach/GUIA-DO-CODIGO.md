# Netzach · guia do código

Onde está cada coisa, para mexer sem precisar de ajuda. O jogo é JavaScript puro (ES5, sem compilação): editou, salvou,
recarregou o navegador. Textos e comentários em português.

## Regras de ouro
1. **O dia a dia vai no ramo `dev`**; a `main` é o que está no site. Commit e push no `dev` não mudam o site.
2. **Publicar** (só quando o dono do jogo pedir): rode os testes (abaixo), monte a notícia em `noticias.js` (na raiz) a partir
   de `MUDANCAS.md`, zere o `MUDANCAS.md`, commite no `dev` e rode
   `powershell -ExecutionPolicy Bypass -File netzach\tools\publicar.ps1` na pasta do site (com `-Testar` ele só mostra o que iria).
   Ele troca a versão, junta o `dev` na `main` e envia. Espere uns 2 minutos e confira a versão no Menu do jogo.
3. **Toda publicação troca a versão** (o `publicar.ps1` já faz, com `tools/versao.ps1`), senão quem já jogou fica com arquivos
   velhos (o Cloudflare guarda js e css por 4 h). Se mexeu na arte (`art/`), troque também o `?a=` em `js/view.js`.
4. **Save:** mudou o jeito de guardar algo no save? Aumente `FORMATO_SAVE` em `js/sim.js` e escreva a conversão em
   `MIGRACOES` (está explicado lá); ninguém perde o progresso. **Não mexa em `SAVE_VER`** (`js/ui.js`): com
   `settings.resetSaveOnNewVersion` ligado, mudar apaga os saves de todo mundo (fica só para emergência; hoje está desligado).
5. Os arquivos do site são públicos: nunca coloque senha ou chave secreta no código. A única exceção é a chave **publishable** (ou "anon") do Supabase em `js/conta.js` e `js/erros.js`, que é feita para ficar à vista; a `secret`/`service_role` nunca.

## Testar no seu computador
Abra o PowerShell na pasta do site e rode:
```
powershell -ExecutionPolicy Bypass -File netzach\tools\servidor.ps1 -Root . -Port 8080
```
Depois abra `http://localhost:8080/netzach/`. Para parar, feche a janela do PowerShell (ou Ctrl+C).
No console do navegador (F12), `NZ.debug.state()` mostra o estado do jogo (ex.: `NZ.debug.state().player.inv.moeda = 500`
para testar lojas) e `NZ.debug.view()` a cena. O Menu tem um modo de testes escondido: clique 5 vezes seguidas na palavra
"Netzach" no topo do Menu. O mesmo atalho no "Netzach" do menu inicial mostra o botão "Modo livre" em Novo jogo (o menu inicial só oferece a campanha).

**Testes automáticos:** com o servidor ligado, abra `http://localhost:8080/netzach/testes/`. Em segundos eles conferem os dados
(todo item, missão, conversa, figura e cena citados existem) e a simulação (jogo novo, save que abre igual, save antigo que
converte, 20 minutos jogando sozinho, compra, venda, missão, nível, poção). Verde = pode publicar. Teste novo: `testes/testes.js`.
Sem navegador, na pasta `netzach` (precisa do Node; `npm install` na primeira vez):
- `npm run testar`: os mesmos testes, em 2 segundos;
- `npm run verificar`: o verificador de código (ESLint, regras em `eslint.config.js`) procura erro de digitação, variável que
  não existe e código que nunca roda.
O `publicar.ps1` roda os dois e não publica se algum falhar. As ferramentas de Python (`tools/*.py`) rodam com o Python 3.13
instalado em 10/11 (com Pillow, numpy e scipy).

**Erros dos jogadores:** `js/erros.js` manda cada erro de código que acontece no jogo de alguém para a tabela `erros` do
Supabase (painel → Table Editor → erros), com versão, aparelho e onde foi. A tabela é criada por `supabase/erros.sql`.

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
| `js/campanha.js` | **Campanha** (modo história): lê `data/campanha.json`, mostra falas e escolhas, aplica os efeitos e conduz o que cada cena faz no mundo (tabela `ROTEIRO`, pelo id da cena). |
| `js/som.js` | **Sons feitos por código** (provisórios): a trilha da tela inicial (ciclo de 24 s, tabela `CICLO`: acordes e melodia), o vento e o trigo farfalhando perto do campo (`campo`, números em `AMB`; quem calcula distância e lado é `ambiente` em `js/ui.js`), as crianças rindo, o toque de missão completada e os sons de navegação nos menus. Volume em `VOL`. A tela de Configurações (botão no menu inicial) liga e desliga o som e acerta o volume da música e dos efeitos (`NZ.som.volume`), guardados no navegador. No celular o áudio usa um buffer maior e eco mais curto, destrava no fim do toque e para quando a aba some. |
| `data/campanha.json` | As cenas do roteirizador num arquivo só. **Não edite**: é gerado por `tools/montar_campanha.ps1` (ver "Campanha" abaixo). |
| `js/conta.js` | Conta do site (Supabase): entrar, criar conta, sair, trocar senha e gravar/ler os saves na nuvem. Também a vez do aparelho (`sessao`: um aparelho por vez, tabela criada por `supabase/sessoes.sql`; a lógica fica em `js/ui.js`, seção "um aparelho por vez"). Usado também pelo portal. O endereço e a chave do projeto ficam no topo. A tabela é criada por `supabase/conta.sql` (na raiz do site). |
| `js/ceu.js` | Céu: cores de cada hora, sol, lua, estrelas, nuvens e montanhas. |
| `sw.js`, `manifest.webmanifest`, `icons/` | App instalável no celular e abertura sem internet. |
| `art/` | Imagens que o jogo carrega: `sprites.png` (figuras), `walls.png` (texturas), `atlas.json` (onde cada figura está e as animações), montadas por `tools/montar_atlas.py`. Fontes: `art/fonte/*.aseprite` (desenho à mão) e `art/gerado/` (arte provisória feita por código). Ver "Arte". |
| `tools/` | Ferramentas: `gerar_arte.py` (desenha a arte provisória), `montar_atlas.py` (monta o atlas com a arte do Aseprite; `aseprite/` tem o script do Aseprite que ele usa), `verificar_trilhas.py` (confere os caminhos dos moradores), `gerar_icones.py` (ícones do app), `servidor.ps1` (servidor de teste), `versao.ps1` (troca a versão em todos os lugares), `publicar.ps1` (junta o `dev` na `main`). |
| `js/erros.js` | Registro de erros dos jogadores (ver "Testar no seu computador"). Carrega antes de todos. |
| `testes/` | Testes automáticos dos dados e da simulação (abra pelo servidor de teste). |
| `PENDENCIAS.md` | O que falta fazer. |
| `PLANO.md` | O plano para frente: mundo grande, arte animada, eventos, regiões, raid e boas práticas. |
| `MUDANCAS.md` | O que mudou desde a última publicação; vira a notícia do site. |
| `LORE.md` | A história da vila: quem é quem, lugares, ganchos para missões e o que ainda está para decidir. |

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
- **Hostilidade** (`aldeoes`): **desligada desde a versão `20261109-10`**: o menu das pessoas não tem mais "Atacar" (o
  protagonista é da vila; ver `LORE.md`), e um save gravado no meio de uma briga termina a briga ao carregar
  (`NZ.settle`, em `js/sim.js`). O resto do sistema continua no código, sem uso. Antes: reputação perdida (por incidente e por inocente morto), multa, tempo para acalmar e a força de cada papel na luta.
  **Morte** (`aldeoes` → `morte`): quanto tempo o corpo fica, quando chegam os substitutos de lojistas e guardas, e os nomes deles.
- **Macro** (`macro`): as regras automáticas. **Diárias** (`daily`): missões do quadro, horário de reinício e recompensas.
- **Missões** (`quests`) e **conversas** (`dialogues`, `_textos`).

### Lugares (`data/vila.json`)
Coordenadas em metros: `x` cresce para o leste, `z` para o sul; o centro da praça é (0, 0). `rot` gira em graus.
- `bounds`: metade do tamanho do mundo (120 = 240 × 240 m), fixo.
- `limite`: a borda jogável, um polígono `[x, z]` que segue a linha preta do rascunho do mapa (10/11). Fora dele tudo
  bloqueia (`World`, em `js/sim.js`) e começa a mata do limite (`limite`, em `js/view.js`), que acompanha a curva.
- `buildings`: construções (`type`, `x`, `z`, `rot`). Os tipos são desenhados em `js/view.js`
  (`church`, `smith`, `bar`, `casaSenhor`, `padaria`, `forno`, `alfaiate`, `moradia`).
- `npcs`: onde cada NPC fica parado. `props`: quadro de avisos e baú.
- `plaza`, `avenue`, `road`, `streets`, `gate`: praça, avenida, estrada, ruas e portão. A praça é a rotatória do
  cruzamento: a avenida (leste-oeste) para na borda dela, dos dois lados (`semPraca`, em `js/view.js`).
- `pasture` (pasto das vacas) e `folds` (aprisco das ovelhas): as únicas cercas. `fields`: plantações.
- `rios`: o rio (5 m) e o braço dele (3,6 m), curvas `[x, z]`; a água bloqueia. `travessias`: a ponte (no caminho de
  terra que sai da avenida para o oeste) e os vaus de pedras, onde dá para atravessar. Desenho em `rios`, `ponte` e `vau`
  (`js/view.js`); a água corre no sombreador (`vf = 2`, em `VS`).
- `regions`: floresta, pedregal e campina, cada uma um polígono (`poly`, pode passar do limite), com pontos marcados
  (`spots`) para os animais e `label` (onde o nome fica no mapa). A divisa entre dois terrenos é um degradê pontilhado:
  `mascaraTerrenos` em `js/view.js` pinta uma máscara (largura do degradê em `MASCARA.transicao`) e o sombreador (`FS`)
  mostra cada chão onde a máscara manda. `World.terreno(x, z)` diz o terreno de um ponto.
- `trees`, `rocks`, `boulders`, `bushes`, `rabbits`: árvores, veios, pedras grandes, arbustos e coelhos.
- `walkers` (moradores que andam), `trails` (os caminhos deles), `cows` (vacas); as ovelhas ficam em `folds` → `flock`.
- `interiores`: a sala de cada construção (porta, teto, paredes, luzes e móveis `moveis`). Os móveis são desenhados pela
  tabela `MOVEL` em `js/view.js`.
  **Depois de mexer em ruas, construções ou caminhos, rode** `tools/verificar_trilhas.py` para ver se alguém atravessa parede.
  **Construção com interior:** o canto dela (centro menos metade da largura, e centro menos metade do fundo) precisa cair em
  meio metro (…,5), senão a parede cai no meio de uma casa da grade e a porta não abre. Os testes avisam qual está errada.

### Campanha (modo história)
- **Escrever cenas:** no roteirizador. Exporte para a pasta `netzach` (as cenas vão para `cenas/`, mais `projeto.json`), e rode
  `powershell -ExecutionPolicy Bypass -File netzach\tools\montar_campanha.ps1` na pasta do site: ele junta tudo em
  `data/campanha.json`, que é o que vai para o site (`cenas/`, `projeto.json`, `variaveis.json` e o `README.md` do roteirizador
  ficam fora do git). O servidor de teste (`servidor.ps1`) já roda a ferramenta ao abrir.
- **O que cada cena faz:** cena sem roteiro funciona sozinha (falas uma a uma; escolhas viram botões; sem escolhas, o capítulo
  acaba). Cena que acontece no mundo (andar até a figura, colher, a carroça) ganha uma entrada em `ROTEIRO`, em `js/campanha.js`,
  com o mesmo id da cena; ela usa as escolhas pela ordem do roteirizador (`segue(c, 0)` = a primeira).
- **Variáveis:** `moedas` = moedas da bolsa, `experiencia` = experiência (sobe de nível como sempre), `nivel` = nível; outras
  ficam guardadas no save (`st.camp.vars`). Condições: `{ variavel, op, valor }` ou o texto `moedas >= 5`. Nos textos,
  `(Nome)` vira o nome do personagem, e a fala de "protagonista" sai com o nome dele.
- **Lugares, números e textos do capítulo:** `data/game.json` → `campanha` (onde acorda, a figura, a carroça, quantos fardos,
  os 5 s parado, as missões, a dica de colheita de cada aparelho, a hora fixa do céu).
- **Hora:** na campanha e na tela inicial o céu fica parado na `campanha.hora`; só o modo livre segue o relógio de verdade.
- **Tela inicial:** o fundo é o começo da campanha: deitado no trigo, olhando o céu (`deitado` em `View.prototype.render`,
  altura e ângulo em `DEITADO`, em `js/view.js`). O trigo balança com o vento no sombreador (`VS`, `vf`), no campo inteiro.
- **Sons:** feitos por código em `js/som.js` (sem arquivos). A campanha pede pelo nome em `som()` (`SONS`, em `js/campanha.js`). O navegador só toca som depois do primeiro clique ou tecla, então a música da tela inicial começa aí.
- **Fim do capítulo:** o save marca `st.camp.fim`; quem abre esse save depois começa na praça. A cena do pasto ainda vai ser ligada.
- **Sem macro até o mundo aberto:** enquanto o capítulo não termina, a macro não existe: `semMacro()` em `js/ui.js` põe a classe `sem-macro` no `body`, que esconde tudo o que tem a classe `macro-ui` em `index.html` (botões Macro e Caminhada do mapa, ajuda e atalhos), e G, R e RB não fazem nada. Para esconder mais alguma coisa, dê a ela a classe `macro-ui`.
- **Rosto de quem fala:** ao lado de cada fala aparece a cabeça do personagem, recortada da figura dele no atlas
  (`View.prototype.retrato` em `js/view.js`; tamanho do recorte em `RETRATO`). A campanha acha o rosto pelo nome de quem fala
  (`rosto` em `js/campanha.js`): a figura e o fazendeiro usam os deles, e qualquer outro nome igual ao de uma pessoa da
  vila usa a figura dela. O protagonista (o jogador) e a narração não têm rosto. Tamanhos (PC e
  celular) em `.rosto` no `css/netzach.css`.
- **Testar uma cena:** no console, `NZ.debug.state().camp` mostra a cena e o passo.

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
- **Uma aba só:** `js/ui.js`, seção "uma aba só". Abrir o jogo em outra aba faz a antiga salvar, subir o save para a nuvem (até 5 s), parar e passar o espaço aberto para a nova, que abre direto nele. A antiga mostra o aviso `#w-aba` (o navegador não deixa fechá-la sozinha). Só no mesmo navegador (BroadcastChannel). Em outro aparelho continua valendo a regra da nuvem acima.
  **Com conta**, cada conta tem as suas chaves (`zg-vila-proto-v1-u<id>-1`...), que espelham a nuvem: `nuvem()` acerta os três espaços na tela inicial (vence o lado que mudou; se os dois mudaram, o gravado por último) e `sobe()` manda o save aberto a cada minuto, ao esconder a aba e ao sair. Se outro aparelho gravou o mesmo espaço enquanto ele estava aberto, o jogo abre a versão de lá. O lado que perde nunca some: fica numa cópia (`NZ.debug.copias()` no console). Os saves feitos sem conta passam para a conta ao entrar.

## Arte
**A arte nova é desenhada no Aseprite**, um arquivo por personagem, em `art/fonte/<nome>.aseprite` (o nome é o da figura:
`ferreiro`, `faz_velho`, `menina`...). O jogo não lê esses arquivos: o montador junta tudo em `art/sprites.png` e
`art/atlas.json`.

**Como desenhar um personagem:**
1. Abra `art/fonte/<nome>.aseprite` no Aseprite. Ele já vem com a figura de hoje em todos os quadros, separados em marcas
   (as faixas coloridas em cima da linha do tempo):
   - `frente_parado` (1 quadro) e `frente_andar` (4 passos): de frente;
   - `lado_parado` e `lado_andar`: olhando para a **direita** da tela (o jogo espelha sozinho para a esquerda);
   - `costas_parado` e `costas_andar`: de costas;
   - opcional: uma marca `rosto` (1 quadro) com a cabeça desenhada em qualquer lugar: vira o retrato das falas (sem ela,
     o jogo recorta a cabeça da figura de frente).
2. Redesenhe por cima. A duração de cada quadro (clique com o botão direito no número do quadro → Propriedades) é a
   velocidade da animação no jogo. Não mude o tamanho da tela: 100 px = 1 m, e o pé fica na base.
3. Salve e rode, na pasta `netzach`: `python tools/montar_atlas.py`. Ele exporta pelo Aseprite, junta, comprime e troca a
   versão da arte (`?a=` em `js/view.js`). Recarregue o jogo.

Enquanto uma direção ou os passos estiverem iguais à figura de frente parada, eles ficam de fora e o jogo continua como
antes; o que você redesenhar entra sozinho. **Personagem novo:** copie `art/fonte/_modelo.aseprite` (vazio, com as marcas)
com o nome da figura. Para criar de uma vez o arquivo de toda pessoa que ainda não tem: `python tools/montar_atlas.py --criar-fontes`.

**No jogo:** `View.prototype.anima` e `direcao` em `js/view.js` escolhem o quadro pelo lado que a figura mostra à câmera
(dentro de 45° = frente ou costas) e se ela está andando; moradores, quem tem posto, atores da campanha e bichos já usam.

**Poses provisórias:** as 22 pessoas já têm costas, perfil e passos desenhados por código (`tools/gerar_poses.py`, a
partir da figura de frente e da ficha de cada pessoa em `FICHAS`: cabelo, barba, chapéu, roupa, o que leva na mão).
`python tools/gerar_poses.py` grava de novo os arquivos do Aseprite (todos, ou só os nomes que você passar; `--previa` só
desenha a folha de conferência). **Ele grava por cima:** depois de redesenhar alguém à mão, não passe essa pessoa por ele.

**A arte provisória (feita por código)** fica em `art/gerado/` (`sprites.png`, `atlas.json`, `walls.png`), feita por
`tools/gerar_arte.py` (uma função por figura). Ela é a base: o que não tem arquivo no Aseprite vem dela. Para gerar de novo:
`python tools/gerar_arte.py <pasta art do zeitgeist1> art/gerado` e depois o montador. As texturas de pedra, tijolo e porta
vêm do zeitgeist1.

O montador precisa do Aseprite (procurado na Steam, no PATH ou na variável `ASEPRITE`), do Pillow e do pyoxipng
(`pip install pillow pyoxipng`). O outro computador só precisa disso para mexer na arte; para jogar e testar, não.
