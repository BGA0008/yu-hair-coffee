# 小小學習樂園 - 本機預覽伺服器 (只需要 Windows 內建的 PowerShell, 不用安裝 Python 或 Node)
# 用法: 雙擊 start.bat, 或執行 powershell -ExecutionPolicy Bypass -File serve.ps1
# 為什麼需要它: 直接雙擊 index.html 開啟時, YouTube 會拒絕在頁面裡嵌入影片; 透過 http://localhost 就可以。
param([int]$Port = 8080, [switch]$NoOpen)

$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "無法在 $Port 埠啟動 ($($_.Exception.Message))。可能已經有另一個視窗開著, 或換一個埠: serve.ps1 -Port 8081"
  exit 1
}
$url = "http://localhost:$Port/"
Write-Host "小小學習樂園已啟動: $url  (關閉這個視窗就會停止)"
if (-not $NoOpen) { Start-Process $url }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    # 只提供這個資料夾裡的檔案, 擋掉 ../ 之類的路徑
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $type = $mime[[IO.Path]::GetExtension($file).ToLower()]
      $ctx.Response.ContentType = if ($type) { $type } else { 'application/octet-stream' }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    $ctx.Response.StatusCode = 500
  } finally {
    $ctx.Response.Close()
  }
}
