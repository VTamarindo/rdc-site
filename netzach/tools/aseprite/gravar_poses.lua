-- Netzach · grava as poses de uma pessoa num arquivo do Aseprite (chamado por tools/gerar_poses.py).
-- Uso: Aseprite.exe -b --script-param dir=<pasta com os PNGs> --script-param out=<nome.aseprite> --script-param ms=150
--      --script gravar_poses.lua
-- A pasta tem <marca>_<n>.png (frente_parado_0.png, frente_andar_0..3.png, lado_..., costas_...). Cada marca vira uma
-- marca (tag) do Aseprite com os quadros na ordem; os passos duram ms milissegundos e o parado, meio segundo.
local dir, out = app.params["dir"], app.params["out"]
local ms = tonumber(app.params["ms"] or 150) / 1000
if not dir or not out then error("faltam os parâmetros dir e out") end
local MARCAS = { "frente_parado", "frente_andar", "lado_parado", "lado_andar", "costas_parado", "costas_andar" }
local sep = package.config:sub(1, 1)

local function existe(p) local f = io.open(p, "rb"); if f then f:close(); return true end; return false end
local quadros = {}
for _, m in ipairs(MARCAS) do
  local n = 0
  while existe(dir .. sep .. m .. "_" .. n .. ".png") do
    table.insert(quadros, { marca = m, arq = dir .. sep .. m .. "_" .. n .. ".png", passo = m:find("andar") ~= nil })
    n = n + 1
  end
end
if #quadros == 0 then error("nenhum quadro em " .. dir) end

local primeiro = Image{ fromFile = quadros[1].arq }
local spr = Sprite(primeiro.width, primeiro.height, ColorMode.RGB)
spr.layers[1].name = "desenho"
for i = 2, #quadros do spr:newEmptyFrame() end
local ini, atual = {}, nil
for i, q in ipairs(quadros) do
  spr:newCel(spr.layers[1], spr.frames[i], Image{ fromFile = q.arq }, Point(0, 0))
  spr.frames[i].duration = q.passo and ms or 0.5
  if q.marca ~= atual then ini[q.marca] = i; atual = q.marca end
end
for _, m in ipairs(MARCAS) do
  if ini[m] then
    local fim = ini[m]
    while quadros[fim + 1] and quadros[fim + 1].marca == m do fim = fim + 1 end
    local t = spr:newTag(ini[m], fim); t.name = m
  end
end
spr:saveAs(out)
