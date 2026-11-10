# Netzach · publica o que está no ramo dev: o dev entra na main, e a main é o que vai para o site
# Só quando o usuário pedir. Antes de rodar: a notícia nova em noticias.js (montada a partir de netzach/MUDANCAS.md) e o
# MUDANCAS.md zerado, os dois commitados no dev.
# Uso (na pasta do site):  powershell -ExecutionPolicy Bypass -File netzach\tools\publicar.ps1
#   -Testar   mostra o que seria publicado e para (não muda nada)
param([switch]$Testar)
$ErrorActionPreference = 'Stop'
$site = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location $site
function G { $s = & git @args 2>&1; if ($LASTEXITCODE) { throw "git $($args -join ' '): $s" }; return $s }

if ((G branch --show-current) -ne 'dev') { throw 'Rode no ramo dev (git switch dev).' }
if (G status --porcelain) { throw 'Há mudanças sem commit. Commite (ou guarde) antes de publicar.' }
G fetch -q origin
G merge -q --ff-only origin/dev   # o outro computador pode ter enviado algo
$novos = G log --oneline origin/main..dev
if (-not $novos) { Write-Output 'Nada novo no dev para publicar.'; exit 0 }
Write-Output "Vai para o site:"; $novos | ForEach-Object { Write-Output "  $_" }
if ($Testar) { exit 0 }

# versão nova, para todo navegador baixar os arquivos novos
& (Join-Path $PSScriptRoot 'versao.ps1') | Write-Output
G add netzach/index.html netzach/js/ui.js
G commit -q -m "Publicação (versão $(((Select-String -Path netzach\js\ui.js -Pattern "VERSION = '([\d-]+)'").Matches[0].Groups[1].Value)))"
G push -q origin dev

G switch -q main
try {
  G merge -q --ff-only origin/main
  G merge -q --no-edit dev
  G push -q origin main
  Write-Output 'Publicado: a main está igual ao dev e foi enviada ao GitHub.'
} finally { G switch -q dev }
