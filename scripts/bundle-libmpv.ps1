# Bundle libmpv runtime + generate MSVC import lib (mpv.lib) from DLL.
# Usage:
#   $env:MPV_LIB_DIR = "C:\path\to\folder-with-libmpv-2.dll"
#   .\scripts\bundle-libmpv.ps1
# Or with only resources/libmpv/libmpv-2.dll already present:
#   .\scripts\bundle-libmpv.ps1

param(
  [string]$SourceDir = $env:MPV_LIB_DIR
)

$ErrorActionPreference = "Stop"
$dst = Join-Path $PSScriptRoot "..\src-tauri\resources\libmpv"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

function Find-MsvcTool([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $vswhere) {
    $found = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find "VC\Tools\MSVC\**\bin\Hostx64\x64\$Name" 2>$null
    if ($found) { return ($found | Select-Object -First 1) }
  }
  $guess = "D:\Microsoft Visual Studio\2026\VC\Tools\MSVC\14.50.35717\bin\HostX64\x64\$Name"
  if (Test-Path $guess) { return $guess }
  return $null
}

function New-MpvImportLib([string]$DllPath, [string]$OutLib) {
  $dumpbin = Find-MsvcTool "dumpbin.exe"
  $libExe = Find-MsvcTool "lib.exe"
  if (-not $dumpbin -or -not $libExe) {
    Write-Host "dumpbin/lib not found. Install VS C++ tools, or copy mpv.lib manually."
    return $false
  }
  $raw = & $dumpbin /nologo /exports $DllPath | Out-String
  $matches = [regex]::Matches($raw, '\b(mpv_\w+)\b')
  $names = $matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
  if (-not $names -or $names.Count -eq 0) {
    Write-Host "No mpv_* exports found in: $DllPath"
    return $false
  }
  $dllName = Split-Path $DllPath -Leaf
  $defPath = [System.IO.Path]::ChangeExtension($OutLib, ".def")
  $lines = @("LIBRARY `"$dllName`"", "EXPORTS") + @($names)
  [System.IO.File]::WriteAllLines($defPath, $lines)
  Remove-Item $OutLib -Force -ErrorAction SilentlyContinue
  Remove-Item ([System.IO.Path]::ChangeExtension($OutLib, ".exp")) -Force -ErrorAction SilentlyContinue
  & $libExe /nologo "/def:$defPath" "/out:$OutLib" /machine:x64 | Out-Null
  if (-not (Test-Path $OutLib)) {
    Write-Host "lib.exe failed to create: $OutLib"
    return $false
  }
  $n = $names.Count
  Write-Host "Generated $OutLib ($n exports)"
  return $true
}

if ($SourceDir -and (Test-Path $SourceDir)) {
  $copied = 0
  foreach ($pat in @("libmpv*.dll", "mpv*.dll", "mpv.lib", "libmpv*.lib", "mpv*.lib", "mpv.def", "av*.dll", "sw*.dll", "postproc*.dll")) {
    Get-ChildItem -Path $SourceDir -Filter $pat -ErrorAction SilentlyContinue | ForEach-Object {
      Copy-Item $_.FullName -Destination $dst -Force
      Write-Host "Copied $($_.Name)"
      $copied++
    }
  }
  Write-Host "Copied $copied file(s) from $SourceDir"
} else {
  Write-Host "No SourceDir / MPV_LIB_DIR; using existing files in: $dst"
}

$mpvLib = Join-Path $dst "mpv.lib"
if (-not (Test-Path $mpvLib)) {
  foreach ($alt in @("libmpv-2.lib", "mpv-2.lib", "libmpv.lib")) {
    $p = Join-Path $dst $alt
    if (Test-Path $p) {
      Copy-Item $p $mpvLib -Force
      Write-Host "Copied $alt -> mpv.lib"
      break
    }
  }
}

if (-not (Test-Path $mpvLib)) {
  $dll = Get-ChildItem $dst -Filter "libmpv*.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $dll) {
    $dll = Get-ChildItem $dst -Filter "mpv*.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if ($dll) {
    Write-Host "mpv.lib missing; generating from $($dll.Name) ..."
    [void](New-MpvImportLib $dll.FullName $mpvLib)
  }
}

if (Test-Path $mpvLib) {
  Write-Host "OK: mpv.lib ready for: cargo build --features video-libmpv"
  Get-Item $mpvLib | Format-List FullName, Length
  exit 0
}

Write-Host "FAIL: mpv.lib still missing."
Write-Host "Place libmpv-2.dll under $dst then re-run this script."
Write-Host "Note: MinGW packages ship .dll.a (not usable by MSVC). Generate mpv.lib from the DLL instead."
exit 1
