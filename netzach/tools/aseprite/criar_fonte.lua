-- Netzach · cria o arquivo do Aseprite de um personagem a partir da figura de hoje (chamado por tools/montar_atlas.py).
-- Uso: Aseprite.exe -b --script-param src=<figura.png> --script-param out=<nome.aseprite> --script criar_fonte.lua
--
-- O arquivo sai com uma camada "desenho" e 15 quadros, todos com a figura de hoje, separados em 6 marcas (tags):
--   frente_parado (1 quadro)  frente_andar (4)   de frente para quem olha
--   lado_parado   (1)         lado_andar   (4)   olhando para a DIREITA da tela (o jogo espelha para a esquerda)
--   costas_parado (1)         costas_andar (4)   de costas
-- É só redesenhar os quadros por cima. A duração de cada quadro (no Aseprite) é a velocidade da animação no jogo.
local src, out = app.params["src"], app.params["out"]
if not out then error("falta o parâmetro out") end

-- Sem src (só w e h): a tela vazia, para o modelo de personagem novo (art/fonte/_modelo.aseprite).
-- O retrato das falas pode ganhar desenho próprio: uma marca "rosto" (1 quadro) com a cabeça desenhada em qualquer
-- lugar do quadro; o montador recorta em volta dela (uns 48 x 48 px fica bom).
local fig
if src and src ~= "" then fig = Image{ fromFile = src }
else fig = Image(tonumber(app.params["w"] or 96), tonumber(app.params["h"] or 192), ColorMode.RGB) end
local spr = Sprite(fig.width, fig.height, ColorMode.RGB)
spr.layers[1].name = "desenho"

local MARCAS = {
  { "frente_parado", 1 }, { "frente_andar", 4 },
  { "lado_parado", 1 },   { "lado_andar", 4 },
  { "costas_parado", 1 }, { "costas_andar", 4 },
}
local total = 0
for _, m in ipairs(MARCAS) do total = total + m[2] end
for i = 2, total do spr:newEmptyFrame() end

local layer, f = spr.layers[1], 1
for _, m in ipairs(MARCAS) do
  local ini = f
  for k = 1, m[2] do
    spr:newCel(layer, spr.frames[f], fig, Point(0, 0))
    spr.frames[f].duration = (m[2] > 1) and 0.15 or 0.5 -- passos a 150 ms; parado não troca
    f = f + 1
  end
  local t = spr:newTag(ini, f - 1)
  t.name = m[1]
end
spr:saveAs(out)
