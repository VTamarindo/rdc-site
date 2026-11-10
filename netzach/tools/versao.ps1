# Netzach · troca a versão do jogo em todos os lugares de uma vez
# A versão é AAAAMMDD-N (N conta as versões do dia). Ela vai no ?v= de cada arquivo em netzach/index.html (o navegador
# baixa o arquivo novo em vez de usar o velho) e no VERSION de js/ui.js (o jogo avisa quando há versão nova).
# Uso (na pasta do site):  powershell -ExecutionPolicy Bypass -File netzach\tools\versao.ps1
#   -Versao 20261111-1   usa essa versão em vez de calcular
param([string]$Versao = '')
$jogo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$utf8 = New-Object System.Text.UTF8Encoding($false)
$html = Join-Path $jogo 'index.html'; $ui = Join-Path $jogo 'js\ui.js'
$h = [IO.File]::ReadAllText($html, $utf8); $u = [IO.File]::ReadAllText($ui, $utf8)
$m = [regex]::Match($u, "VERSION = '(\d{8})-(\d+)'")
if (-not $m.Success) { Write-Error 'Não achei VERSION em js/ui.js.'; exit 1 }
$antes = $m.Groups[1].Value + '-' + $m.Groups[2].Value
if (-not $Versao) {
  $hoje = (Get-Date).ToString('yyyyMMdd')
  $n = if ($m.Groups[1].Value -eq $hoje) { [int]$m.Groups[2].Value + 1 } else { 1 }
  $Versao = "$hoje-$n"
}
if ($Versao -notmatch '^\d{8}-\d+$') { Write-Error "Versão inválida: $Versao (use AAAAMMDD-N)."; exit 1 }
$h2 = [regex]::Replace($h, '\?v=\d{8}-\d+', "?v=$Versao")
$u2 = [regex]::Replace($u, "VERSION = '\d{8}-\d+'", "VERSION = '$Versao'")
[IO.File]::WriteAllText($html, $h2, $utf8); [IO.File]::WriteAllText($ui, $u2, $utf8)
# a página inicial do site: as notícias (noticias.js) também ganham a versão nova, senão o navegador mostra as velhas
$raiz = Join-Path $jogo '..\index.html'
if (Test-Path $raiz) { $r = [IO.File]::ReadAllText($raiz, $utf8); [IO.File]::WriteAllText($raiz, [regex]::Replace($r, 'noticias\.js\?v=[\w-]+', "noticias.js?v=$Versao"), $utf8) }
$qtd = ([regex]::Matches($h2, "\?v=$Versao")).Count
Write-Output "Versão $antes -> $Versao ($qtd arquivos no index.html e o VERSION do ui.js)."
