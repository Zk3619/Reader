# Build tv-jar-host.jar (CatVod / Android desktop stubs)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
. (Join-Path $Root "Resolve-JdkTools.ps1")
$JavacCmd = Resolve-JdkTool "javac"
Write-Host "Using javac: $JavacCmd"

$LibDir = Join-Path $Root "lib"
$LibJars = @(Get-ChildItem $LibDir -Filter "*.jar" -ErrorAction SilentlyContinue)
if ($LibJars.Count -eq 0) {
  Write-Host "lib/ empty, fetching deps..."
  & (Join-Path $Root "fetch-host-libs.ps1")
}

& (Join-Path $Root "patch-json-getstring.ps1")

New-Item -ItemType Directory -Force -Path build/classes, build/libs | Out-Null
$sources = @(Get-ChildItem -Path src/main/java -Recurse -Filter *.java | ForEach-Object { $_.FullName })
if ($sources.Count -eq 0) { throw "no java sources" }

$cp = ""
if (Test-Path $LibDir) {
  $jars = @(Get-ChildItem $LibDir -Filter *.jar -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  if ($jars.Count -gt 0) {
    $cp = ($jars -join ";")
  }
}

$javacArgs = New-Object System.Collections.ArrayList
[void]$javacArgs.Add("-encoding")
[void]$javacArgs.Add("UTF-8")
[void]$javacArgs.Add("-d")
[void]$javacArgs.Add("build/classes")
if ($cp) {
  [void]$javacArgs.Add("-cp")
  [void]$javacArgs.Add($cp)
}
foreach ($s in $sources) { [void]$javacArgs.Add($s) }
& $JavacCmd $javacArgs.ToArray()
if ($LASTEXITCODE -ne 0) { throw "javac failed (tool=$JavacCmd)" }

python (Join-Path $Root "pack-host-jar.py")
if ($LASTEXITCODE -ne 0) { throw "pack jar failed" }

Write-Host "Built:" (Join-Path $Root "build\libs\tv-jar-host.jar")
$Dex = Join-Path (Split-Path $Root) "dex2jar\d2j-dex2jar.bat"
if (-not (Test-Path $Dex)) {
  Write-Host "NOTE: dex2jar missing; run fetch-dex2jar.ps1"
}
