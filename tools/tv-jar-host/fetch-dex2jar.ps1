# 下载官方 dex2jar（pxb1988 v2.4）到 tools/dex2jar，供 tv-jar-host 捆绑使用。
# 用法（在仓库 Reader 目录或任意处）:
#   powershell -ExecutionPolicy Bypass -File tools/tv-jar-host/fetch-dex2jar.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsDir = Split-Path -Parent $ScriptDir
$Dest = Join-Path $ToolsDir "dex2jar"
$Version = "v2.4"
$Url = "https://github.com/pxb1988/dex2jar/releases/download/$Version/dex-tools-$Version.zip"
$Zip = Join-Path $env:TEMP "dex-tools-$Version.zip"
$ExtractRoot = Join-Path $env:TEMP "dex2jar-extract-$Version"

Write-Host "Downloading $Url"
Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing
Write-Host "Zip size:" (Get-Item $Zip).Length

if (Test-Path $ExtractRoot) { Remove-Item -Recurse -Force $ExtractRoot }
Expand-Archive -Path $Zip -DestinationPath $ExtractRoot -Force

# zip 内通常为 dex-tools-v2.4/ 一层；也可能文件已在根目录
$Inner = $null
$dirs = @(Get-ChildItem -LiteralPath $ExtractRoot -Directory -ErrorAction SilentlyContinue)
if ($dirs.Count -eq 1 -and (Test-Path (Join-Path $dirs[0].FullName "lib"))) {
  $Inner = $dirs[0].FullName
} elseif (Test-Path (Join-Path $ExtractRoot "d2j-dex2jar.bat") -or Test-Path (Join-Path $ExtractRoot "lib")) {
  $Inner = $ExtractRoot
} elseif ($dirs.Count -ge 1) {
  foreach ($d in $dirs) {
    if ((Test-Path (Join-Path $d.FullName "d2j-dex2jar.bat")) -or (Test-Path (Join-Path $d.FullName "lib"))) {
      $Inner = $d.FullName
      break
    }
  }
}
if (-not $Inner) {
  Write-Host "Extract root listing:"
  Get-ChildItem -LiteralPath $ExtractRoot -Force | ForEach-Object { Write-Host " -" $_.Name $_.Mode }
  throw "解压后未找到 dex-tools 目录"
}

if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Path (Join-Path $Inner "*") -Destination $Dest -Recurse -Force

$Bat = Join-Path $Dest "d2j-dex2jar.bat"
$Sh = Join-Path $Dest "d2j-dex2jar.sh"
if (-not (Test-Path $Bat) -and -not (Test-Path $Sh)) {
  throw "解压结果缺少 d2j-dex2jar.bat/sh，请检查 zip 结构: $Dest"
}

Write-Host "OK -> $Dest"
Write-Host "Contains:" (Get-ChildItem $Dest | Select-Object -ExpandProperty Name)
Write-Host ""
Write-Host "开发: tv-jar-host 会自动查找 tools/dex2jar"
Write-Host "发布: 将整个 dex2jar 目录与 tv-jar-host.jar 一并放到 .exe 同级"
