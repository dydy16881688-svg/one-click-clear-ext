$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
$url = "https://github.com/dydy16881688-svg/one-click-clear-ext/archive/refs/heads/main.zip"
$tmp = Join-Path $env:TEMP ("occ_update_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

Write-Host "================================"
Write-Host "   一键更新插件到最新版"
Write-Host "================================"
Write-Host ""

try {
  Write-Host "正在下载最新版..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $zip = Join-Path $tmp "latest.zip"
  Invoke-WebRequest -Uri $url -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp "ex") -Force
  $inner = Get-ChildItem (Join-Path $tmp "ex") -Directory | Select-Object -First 1
  Copy-Item -Path (Join-Path $inner.FullName "*") -Destination $dir -Recurse -Force

  $ver = "?"
  $mfTxt = Get-Content (Join-Path $dir "manifest.json") -Raw
  if ($mfTxt -match '"version"\s*:\s*"([^"]+)"') { $ver = $matches[1] }

  Write-Host ""
  Write-Host "[完成] 档案已更新到 v$ver" -ForegroundColor Green
  Write-Host "更新位置: $dir" -ForegroundColor Gray
  Write-Host ""
  Write-Host "==============================================" -ForegroundColor Yellow
  Write-Host " 最后一步(必做): 到 chrome://extensions" -ForegroundColor Yellow
  Write-Host " 点这个插件的「刷新」按钮，版本才会变成 v$ver" -ForegroundColor Yellow
  Write-Host "==============================================" -ForegroundColor Yellow
} catch {
  Write-Host ""
  Write-Host ("[失败] " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "请检查网络后重试。"
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
}

Write-Host ""
Read-Host "按 Enter 关闭"
