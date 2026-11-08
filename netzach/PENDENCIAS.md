# Netzach · o que falta (registro de 8/11/2026)

Pedido grande de 8/11, dividido em duas ondas de agentes. A onda 1 foi feita e está na `main`, menos a arte.
A onda 2 não começou. Este arquivo lista tudo o que falta, o que ficou provisório e o que ainda não foi testado.

## Onde está o trabalho
- A onda 1 (mundo novo, menu inicial com saves, controle no celular e sistemas de personagem) foi para a `main` na
  versão `20261108-1`, sem a arte nova. `SAVE_VER` não mudou: os saves são convertidos (espaços de save, equipamentos,
  mapa versão 3).
- A arte interrompida continua só no ramo `worktree-agent-a281f0c200b3e28a0` (ver "Arte" abaixo).

## Feito na onda 1 (para referência)
- **Mundo:** layout da imagem do usuário; mundo de 240 × 240 m (`bounds` 120); igreja à direita da rua, alfaiate do outro lado;
  avenida das moradias à Casa do Senhor; 8 moradias; cerca só no pasto e no aprisco das ovelhas; campos maiores; regiões
  `floresta`, `pedregal` (rochas) e `campina` em `vila.json` → `regions`, com pontos marcados para coelhos, lobos,
  escorpiões, serpentes e veados; mapa grande abre em 50% (0% = tudo, 100% = zoom máximo); minimapa fixo em 80%.
- **Menu inicial:** 3 espaços de save (`zg-vila-proto-v1-1` a `-3`), o save antigo vai para o espaço 1; nome escolhido aqui;
  "Voltar ao menu inicial" no Menu do jogo.
- **Controle:** no celular, com controle em uso, somem analógico, Interagir e direcional da tela; LB não faz mais nada;
  sinais de Y e Menu nos botões; mapa navegado só pelo cursor; direcional para cima recolhe as missões, com ícone.
- **Personagem:** botão "Personagem" no lugar de Inventário e Bolsa, com abas Equipamento, Bolsa e Atributos; espaços de
  arma (+ flechas com arco), cabeça, peito, luvas, calças, botas, colar e 3 anéis; 8 armas e flechas no ferreiro; 10 peças no
  alfaiate (Godwin); 6 atributos com 5 pontos por nível; modelo de dano único (dano mín–máx, intervalo, alcance, crítico,
  defesa) para jogador e monstros.

## Onda 2 (não começou)
1. **Menu de interação com todos os NPCs** (lojistas e os 17 moradores que andam): Conversar, Atacar, Negociar (onde
   houver loja) e Fechar.
2. **Diálogos básicos** com personalidade própria para cada NPC.
3. **Atacar NPCs com consequência:** −100 de reputação; soldados e homens da vila atacam o jogador. Os moradores hoje só
   existem no desenho (`view.js` → `buildAmbient`), então precisam virar entidades da simulação para lutar. Definir quando a
   hostilidade acaba (desmaio, tempo, multa).
4. **Fauna nas regiões:** 2 lobos na floresta, longe dos coelhos; escorpiões e serpentes no pedregal; veados na campina;
   ovelhas no aprisco. Usar o modelo de dano novo (`Sim.strike`, perfil `dmg`/`interval`/`reach`/`def`).
5. **Colheita** nas plantações (trigo, cebola, nabo, alho-poró), **tirar leite** das vacas e **tosquiar** as ovelhas
   (sprite `ovelha_tosquiada`), com itens novos e onde vendê-los.
6. **Interiores** da igreja, ferreiro, taverna, padaria, Casa do Senhor e alfaiate, com os lojistas lá dentro.
7. **Padeiro fixo na padaria** (hoje a padeira anda pela vila).

## Arte (interrompida, NÃO está na integração)
- O agente de arte foi parado antes de terminar. O trabalho dele está guardado no ramo `worktree-agent-a281f0c200b3e28a0`
  commit `95e70ac` (a pasta temporária foi apagada; para retomar, crie uma cópia de trabalho a partir desse ramo): só `tools/gerar_arte.py` (+640 linhas) e o
  `SIZE` em `view.js`. As imagens (`art/sprites.png`, `walls.png`, `atlas.json`) **não foram geradas nem conferidas**.
- Já existem no gerador, sem revisão: `alfaiate`, `lobo`, `veado`, `ovelha`, `ovelha_tosquiada`, `arbusto`, `arbusto_seco`,
  `escorpiao`, `serpente`, `arvore` (nova), `arvore_2`, `arvore_3`.
- Não se sabe quanto da revisão das roupas para o século 12 foi feita: conferir personagem por personagem, mantendo
  reconhecíveis a senhora (`mulher_velha`) e a padeira.
- Para terminar: gerar a arte (Python do Blender, com `PYTHONPATH` na pasta de shims do scratchpad, como antes), conferir
  cada sprite, trocar o `?a=` em `view.js` e o `VERSION`/`?v=`, e juntar à `main`. Sem isso, o alfaiate aparece com a figura do taberneiro.

## Provisório ou incompleto
- **Armas na mão:** machados e arcos ainda aparecem como espada em primeira pessoa; faltam os desenhos (nomes em `items.*.sprite`).
- **Anéis e colar:** os espaços existem, sem itens; o usuário vai definir.
- **Reputação:** só tem o número; o usuário quer organizar o sistema depois.
- **Arbustos:** se a arte não tiver `arbusto`, aparecem como bolhas verdes provisórias.
- **Pedras grandes** (`boulders`) parecem blocos escuros; bordas das regiões no chão são linhas retas.
- **Limite do mundo** em ±120 m é uma parede invisível, coberta pela névoa.
- **Equilíbrio:** dano, preços e atributos foram calibrados só contra coelhos; rever com os animais novos e as distâncias maiores.
- **XP de missão** multiplicada pela inteligência (decisão do agente; confirmar se é o desejado).
- **Dica do Padrão** no mapa não apareceu com o controle simulado (não confirmado se é só o teste).

## Não testado
- Celular de verdade (toque, desempenho no mapa maior, instalação como app, abrir sem internet).
- Controle de verdade no PC e no Xbox.
- **Xbox:** falta o usuário dizer qual eixo da câmera fica trocado (horizontal, vertical ou os dois) e o texto da linha
  "Controle:" no menu, para deixar o padrão certo. O modo de controles de jogo do Edge só liga pelo menu do navegador
  (segurar Menu); a página não consegue ligar sozinha.
- Mapa e menu inicial com o painel do navegador oculto: só pelo estado da página, as imagens ficaram defasadas.
