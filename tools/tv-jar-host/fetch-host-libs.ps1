# 拉取桌面 Spider 运行依赖到 tools/tv-jar-host/lib（org.json + okhttp + gson 等）
# powershell -ExecutionPolicy Bypass -File tools/tv-jar-host/fetch-host-libs.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Lib = Join-Path $Root "lib"
New-Item -ItemType Directory -Force -Path $Lib | Out-Null

$deps = @(
  @{
    Name = "json-20240303.jar"
    Url  = "https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar"
  },
  @{
    Name = "okhttp-4.12.0.jar"
    Url  = "https://repo1.maven.org/maven2/com/squareup/okhttp3/okhttp/4.12.0/okhttp-4.12.0.jar"
  },
  @{
    Name = "okio-jvm-3.6.0.jar"
    Url  = "https://repo1.maven.org/maven2/com/squareup/okio/okio-jvm/3.6.0/okio-jvm-3.6.0.jar"
  },
  @{
    Name = "kotlin-stdlib-1.9.22.jar"
    Url  = "https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/1.9.22/kotlin-stdlib-1.9.22.jar"
  },
  @{
    Name = "gson-2.10.1.jar"
    Url  = "https://repo1.maven.org/maven2/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar"
  }
)

foreach ($d in $deps) {
  $dest = Join-Path $Lib $d.Name
  if (Test-Path $dest) {
    Write-Host "exists $($d.Name)"
    continue
  }
  Write-Host "Downloading $($d.Url)"
  Invoke-WebRequest -Uri $d.Url -OutFile $dest -UseBasicParsing
  Write-Host "OK $($d.Name) size=" (Get-Item $dest).Length
}

Write-Host "lib -> $Lib"
Get-ChildItem $Lib | ForEach-Object { Write-Host " -" $_.Name }
