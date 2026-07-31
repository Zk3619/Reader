# 解析 JDK 工具：优先 JAVA_HOME\bin，其次 PATH
function Resolve-JdkTool {
  param(
    [Parameter(Mandatory = $true)][string]$Name
  )
  $exe = if ($Name -match '\.exe$') { $Name } else { "$Name.exe" }
  $candidates = @()
  if ($env:JAVA_HOME) {
    $candidates += (Join-Path $env:JAVA_HOME "bin\$exe")
  }
  # Oracle javapath 常只有 java/javac，不一定有 jar
  foreach ($p in ($env:PATH -split ';' | Where-Object { $_ })) {
    $candidates += (Join-Path $p $exe)
  }
  # 常见安装位置兜底
  foreach ($root in @(
      'D:\Java',
      'C:\Program Files\Java',
      'C:\Program Files\Eclipse Adoptium',
      'C:\Program Files\Microsoft',
      'C:\Program Files\Amazon Corretto'
    )) {
    if (Test-Path $root) {
      Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $candidates += (Join-Path $_.FullName "bin\$exe")
      }
    }
  }
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) {
      return (Resolve-Path -LiteralPath $c).Path
    }
  }
  throw @"
找不到 JDK 工具: $exe
请安装 JDK 并设置 JAVA_HOME（例如 JAVA_HOME=D:\Java\jdk-17.0.11），
或将 %JAVA_HOME%\bin 加入 PATH。当前 JAVA_HOME=$($env:JAVA_HOME)
"@
}

function Get-JdkBinDir {
  $java = Resolve-JdkTool 'java'
  return Split-Path -Parent $java
}
