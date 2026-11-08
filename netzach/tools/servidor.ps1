param([Parameter(Mandatory=$true)][string]$Root, [Parameter(Mandatory=$true)][int]$Port)
$Root = [IO.Path]::GetFullPath($Root)
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.webmanifest'='application/manifest+json'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
    if ($p -eq '' -or $p.EndsWith('/')) { $p = $p + 'index.html' }
    $f = [IO.Path]::GetFullPath((Join-Path $Root $p))
    if ($f.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $f -PathType Leaf)) {
      $b = [IO.File]::ReadAllBytes($f)
      $e = [IO.Path]::GetExtension($f).ToLower()
      if ($types.ContainsKey($e)) { $c.Response.ContentType = $types[$e] }
      $c.Response.Headers.Add('Cache-Control', 'no-cache')
      if ($c.Request.HttpMethod -ne 'HEAD') { $c.Response.OutputStream.Write($b, 0, $b.Length) }
    } else { $c.Response.StatusCode = 404 }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}
