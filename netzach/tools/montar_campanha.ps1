# Netzach · junta as cenas exportadas do roteirizador num arquivo só, que o jogo lê: data/campanha.json
# A pasta cenas/ fica fora do git (ver .gitignore); o que vai para o site é o data/campanha.json gerado aqui.
# Uso (na pasta do site):  powershell -ExecutionPolicy Bypass -File netzach\tools\montar_campanha.ps1
# O texto de cada cena entra como está (sem reformatar), então nada do que o roteirizador escreveu se perde.
param([string]$Pasta = (Join-Path $PSScriptRoot '..'))
$Pasta = [IO.Path]::GetFullPath($Pasta)
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Le($f) { return [IO.File]::ReadAllText($f, $utf8).Trim().TrimStart([char]0xFEFF) }

$projF = Join-Path $Pasta 'projeto.json'
if (-not (Test-Path $projF)) { Write-Error "Não achei $projF (exporte o projeto do roteirizador na pasta do jogo)."; exit 1 }
$proj = Le $projF
$p = $proj | ConvertFrom-Json
$partes = @()
$faltam = @()
foreach ($id in $p.cenas) {
  $f = Join-Path $Pasta ("cenas\" + $id + '.json')
  if (-not (Test-Path $f)) { $faltam += $id; continue }
  $txt = Le $f
  $null = $txt | ConvertFrom-Json # confere se é JSON válido antes de juntar
  $partes += ('"' + $id + '": ' + $txt)
}
if ($faltam.Count) { Write-Warning ("Cenas da lista sem arquivo em cenas/: " + ($faltam -join ', ')) }
$saida = "{`r`n" + '"_nota": "Gerado por tools/montar_campanha.ps1 a partir de projeto.json e cenas/. Não edite aqui: edite no roteirizador, exporte e rode a ferramenta de novo.",' + "`r`n" +
  '"projeto": ' + $proj + ",`r`n" + '"cenas": {' + "`r`n" + ($partes -join ",`r`n") + "`r`n}`r`n}`r`n"
$saida = $saida -replace "(?<!`r)`n", "`r`n"
$null = $saida | ConvertFrom-Json # o arquivo inteiro também tem de ser JSON válido
$dest = Join-Path $Pasta 'data\campanha.json'
[IO.File]::WriteAllText($dest, $saida, $utf8)
Write-Host ("campanha.json: " + $partes.Count + " cenas, cena inicial " + $p.cena_inicial)
