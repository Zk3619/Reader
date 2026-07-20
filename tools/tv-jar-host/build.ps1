# 编译 tv-jar-host.jar（含 CatVod / Android 桌面 stub）
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

& (Join-Path $Root "patch-json-getstring.ps1")

New-Item -ItemType Directory -Force -Path build/classes, build/libs | Out-Null
$sources = Get-ChildItem -Path src/main/java -Recurse -Filter *.java | ForEach-Object { $_.FullName }
if (-not $sources -or $sources.Count -eq 0) { throw "no java sources" }

$cp = ""
$libDir = Join-Path $Root "lib"
if (Test-Path $libDir) {
  $jars = @(Get-ChildItem $libDir -Filter *.jar -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  if ($jars.Count -gt 0) {
    $cp = ($jars -join ";")
  }
}

$javacArgs = @("-encoding", "UTF-8", "-d", "build/classes")
if ($cp) {
  $javacArgs += @("-cp", $cp)
}
$javacArgs += $sources
& javac @javacArgs
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

python -c @"
import zipfile
from pathlib import Path
root = Path('build/classes')
out = Path('build/libs/tv-jar-host.jar')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\r\nMain-Class: com.reader.tvjarhost.Main\r\n\r\n')
    for p in root.rglob('*.class'):
        z.write(p, p.relative_to(root).as_posix())
print(out, out.stat().st_size)
"@

Write-Host "Built:" (Join-Path $Root "build\libs\tv-jar-host.jar")
$Dex = Join-Path (Split-Path $Root) "dex2jar\d2j-dex2jar.bat"
if (-not (Test-Path $Dex)) {
  Write-Host "提示: 尚未拉取 dex2jar，请运行 fetch-dex2jar.ps1" -ForegroundColor Yellow
}
