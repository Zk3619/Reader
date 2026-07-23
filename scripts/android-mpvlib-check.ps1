# Check / stage Android mpv AAR for Reader video-player (E2.D).
# Does NOT download binaries.
#
# Default source:
#   src-tauri/android/libmpv/mpv-android-lib-2026-07-18.aar
#
# Usage:
#   .\scripts\android-mpvlib-check.ps1
#   .\scripts\android-mpvlib-check.ps1 -StageLibs
#   $env:READER_MPVLIB_AAR = "D:\path\to\mpvlib.aar"
#   .\scripts\android-mpvlib-check.ps1 -CopyFromEnv -StageLibs

param(
  [switch]$CopyFromEnv,
  [switch]$StageLibs
)

$ErrorActionPreference = "Stop"
$androidRoot = Join-Path $PSScriptRoot "..\src-tauri\android"
$defaultSrc = Join-Path $androidRoot "libmpv\mpv-android-lib-2026-07-18.aar"
$libsDir = Join-Path $androidRoot "video-player\libs"
$dst = Join-Path $libsDir "mpvlib.aar"
New-Item -ItemType Directory -Force -Path (Join-Path $androidRoot "libmpv") | Out-Null
New-Item -ItemType Directory -Force -Path $libsDir | Out-Null

$src = $defaultSrc
if ($CopyFromEnv) {
  $envSrc = $env:READER_MPVLIB_AAR
  if (-not $envSrc -or -not (Test-Path -LiteralPath $envSrc)) {
    Write-Host "READER_MPVLIB_AAR not set or file missing."
    Write-Host "Set it to a local arm64 AAR path, then re-run with -CopyFromEnv."
    exit 1
  }
  $src = $envSrc
  if ($StageLibs) {
    Copy-Item -LiteralPath $src -Destination $dst -Force
    Write-Host "Copied (env): $src -> $dst"
  } else {
    Copy-Item -LiteralPath $src -Destination $defaultSrc -Force
    Write-Host "Copied (env): $src -> $defaultSrc"
    $src = $defaultSrc
  }
}

$ok = $false
if (Test-Path -LiteralPath $defaultSrc) {
  $len = (Get-Item -LiteralPath $defaultSrc).Length
  Write-Host "source AAR: present ($len bytes)"
  Write-Host "Path: $defaultSrc"
  $ok = $true
  if ($StageLibs) {
    Copy-Item -LiteralPath $defaultSrc -Destination $dst -Force
    Write-Host "Staged: $defaultSrc -> $dst"
  }
} elseif (Test-Path -LiteralPath $dst) {
  $len = (Get-Item -LiteralPath $dst).Length
  Write-Host "libs/mpvlib.aar: present ($len bytes) [fallback]"
  Write-Host "Path: $dst"
  $ok = $true
}

if ($ok) {
  Write-Host "Gradle picks: ../libmpv/mpv-android-lib-2026-07-18.aar then libs/mpvlib.aar"
  Write-Host "Next: pnpm tauri android build  (or Android assemble)"
  exit 0
}

Write-Host "mpv AAR: missing"
Write-Host "Expected source: $defaultSrc"
Write-Host "Or staged: $dst"
Write-Host "See: src-tauri/android/libmpv/README.md"
Write-Host "Optional: READER_MPVLIB_AAR + -CopyFromEnv [-StageLibs]"
exit 2
