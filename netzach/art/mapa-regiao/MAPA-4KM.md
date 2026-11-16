# Riachossagrado e arredores · mapa de 4 × 4 km

Gerado por `gerar_mapa_4km.py` (semente 1150). 1 px = 1 m. Arquivos:

- `mapa-4km-base.png`: terreno, vila, campos, estradas e lugares, sem textos;
- `mapa-4km-anotado.png`: com nomes, ícones de fauna e dos lugares, escala e norte;
- `mapa-4km-editor.json`: o mapa no formato do editor do roteirizador (Mapic). Relevo e pintura a cada 4 m (1001 × 1001 pontos), mais rios, estradas, regiões, construções, peças, muralhas, lavouras e marcos ligados às fichas. Entra pelo botão **Importar .json** da tela de mapas.

## Geografia (segundo o mapa do mundo)

- **Norte: a Muralha Férrea**, de ponta a ponta, com a **Fortaleza da Muralha** e o único portão (fechado). O que fica além dela é outro deserto e não entra no jogo.
- **Oeste: o pé da cordilheira e Charcoantigo.** As águas descem da montanha (Rio Grande, Riacho da Cordilheira, Riacho do Mosteiro) e correm para o sul, onde viram charco e meres.
- **Leste: Rocherco.** É planalto seco, pedregal e areia. Nenhum rio chega lá: a água vem do mar, dessalinizada pelo dragão, pelo **Aqueduto de Rocherco** até a **Cisterna**. O deserto sobe até a muralha.
- **Centro: Riachossagrado**, numa ilha seca e fértil entre os dois braços do Rio Grande, na fronteira do úmido com o seco. A **Fonte Sagrada**, ao norte da vila, dá nome ao lugar e ao Riacho Sagrado, que atravessa a vila e deságua no Braço Leste.

## A vila

- **Praça** com poço, bancas e quadro de avisos.
- **Construções em volta da praça:**
  - **Igreja** de pedra com adro e a cruz dos que não voltaram da guerra (Padre Clemente);
  - **Salão da vila**;
  - **Taverna do Gunter**;
  - **Padaria** e **forno do senhor**;
  - **Ferraria do Bolder**;
  - **Alfaiataria do Godwin**;
  - **Oficina do artesão**.
- **Casa do Grão Alto**, no outeiro a nordeste:
  - casa de pedra e madeira dentro de uma paliçada com vala, celeiro do rei (o grão das tropas), celeiro novo (a obra do quadro de avisos), estrebaria, pombal, a bandeira do pelicano e a carroça dos cobradores.
- **Fogueiras de São João**, moinho d'água no Riacho Sagrado e cerca de 70 casas com quintal ao longo das ruas.
- **Lavouras:** quatro campos abertos em rotação (trigo na maior parte, pousio e nabal).
- **Criação:** pasto do gado e aprisco ao norte (como na lore), cabras na fronteira e o chiqueiro do Hob.

## Exploração à moda de Skyrim

1. **Marcos visíveis de longe (weenies):** a muralha (sempre ao norte), a Fortaleza, a Atalaia do Monte Pelado, o campanário do mosteiro e o pedregal. O jogador sempre sabe onde está e sempre vê alguma coisa que dá vontade de ir.
2. **Um lugar de interesse a cada 1 a 2 minutos de caminhada:** são 26 marcados, a 300–600 m uns dos outros, e cada estrada passa por pelo menos três deles.
3. **Estradas em espinha a partir da vila,** com placas nas encruzilhadas apontando para o que existe:
   - Estrada Real do Sul, para Charcoantigo;
   - Estrada da Muralha;
   - Estrada da Água, para Rocherco;
   - Estrada da Mata;
   - Caminho do Dique.
4. **Picadas tracejadas** saem das estradas para as masmorras e para os lugares escondidos.
5. **Masmorras com saída perto da entrada:**
   - a Toca do Troll sai no riacho;
   - a Mina Velha sai por um poço no alto do morro;
   - a Caverna da Cordilheira sai perto das ruínas.

   Depois do chefe, o jogador não refaz o caminho.
6. **Histórias contadas pelo ambiente:**
   - sítios abandonados dos homens que morreram na guerra;
   - o leito seco;
   - o poço salobre;
   - os aguadeiros esperando na cancela;
   - os tocos roídos em volta da clareira do Grambuche.
7. **A tensão dos dois reinos vista no chão:**
   - o Pedágio da Água, de Charcoantigo, na ponte do Braço Leste;
   - logo depois, o Pouso dos Aguadeiros e o Posto de Rocherco.

   A guerra fria acontece em 400 m de estrada.
8. **Bordas naturais:**
   - a muralha ao norte;
   - a cordilheira a oeste;
   - o deserto aberto a leste;
   - o charco fundo ao sul.

   O polígono `limite` dos dados é a área jogável.

## Lugares de interesse

| Lugar | Onde | Para quê |
| --- | --- | --- |
| Fortaleza da Muralha | norte, na muralha | Marco principal; o portão fechado tem um motivo (ver lore) |
| Ruínas do Velho Burgo | noroeste | Masmorra grande de uma sociedade antiga |
| Toca do Troll | encosta oeste | Chefe fixo do ciclo |
| Clareira do Grambuche | mata, noroeste | Musgo encantado, solo rico |
| Atalaia do Monte Pelado | entre os rios | Mirante (weenie) |
| Caverna da Cordilheira | oeste | Atalho de volta |
| Carvoaria | beira da mata | O carvoeiro que briga com o Bolder |
| Cabana do Caçador | pé da cordilheira | Abrigo, pista da toca do troll |
| Mosteiro do Charco e pôlder | sudoeste | Monges que secam o pântano com diques e comportas |
| Ruínas Afogadas, Torre Afogada | charco, sul | Exploração em água rasa |
| Acampamento de Bandidos | sul, perto da estrada | Os bandidos da estrada do sul |
| Pedras de Pé | campina do sul | O veado branco ao amanhecer |
| Cabana do Pescador | Mere Grande | Pesca |
| Pedágio da Água | ponte do Braço Leste | Charcoantigo cobra a água |
| Pouso dos Aguadeiros | logo depois da ponte | Boatos dos dois reinos e do dragão |
| Posto de Rocherco | fronteira leste | Onde o verde acaba |
| Cisterna de Rocherco | leste | A água do dragão, pelo aqueduto |
| Ruínas do Tempo Parado | pedregal | O "tesouro do pedregal": quem entra fica preso no tempo |
| Mina Velha de Joias | nordeste | Joias místicas de Rocherco |
| Gruta das Serpentes | pedregal | Ninho |
| Dunas do Norte, Leito Seco, Poço Salobre | Rocherco | O deserto e a falta d'água |
| Sítios abandonados (2) | oeste e leste | Famílias que a guerra levou |
