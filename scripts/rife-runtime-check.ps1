# Check Reader RIFE runtime layout (E-RIFE.5).
# Does NOT download models / VapourSynth / TensorRT.
#
# Usage:
#   .\scripts\rife-runtime-check.ps1
#   .\scripts\rife-runtime-check.ps1 -Strict

param(
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "..\src-tauri\resources\rife"
$script = Join-Path $root "scripts\rife.vpy"
$readme = Join-Path $root "README.md"
$ncnn = Join-Path $root "models\rife_ncnn"
$dml = Join-Path $root "models\rife_dml"
$trt = Join-Path $root "models\rife_trt"
$vsDir = Join-Path $root "vs"

function Test-HasModelFiles([string]$dir) {
  if (-not (Test-Path -LiteralPath $dir)) { return $false }
  $files = Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension -match '\.(onnx|bin|param|engine|pt|pth)$'
    }
  return ($null -ne $files -and @($files).Count -gt 0)
}

Write-Host "RIFE root: $root"
if (-not (Test-Path -LiteralPath $script)) {
  Write-Host "FAIL: missing scripts/rife.vpy"
  exit 1
}
Write-Host "OK: scripts/rife.vpy"
if (Test-Path -LiteralPath $readme) {
  Write-Host "OK: README.md"
} else {
  Write-Host "WARN: missing README.md"
}

$hasNcnn = Test-HasModelFiles $ncnn
$hasDml = Test-HasModelFiles $dml
$hasTrt = Test-HasModelFiles $trt
Write-Host ("ncnn models: " + $(if ($hasNcnn) { "present" } else { "absent" }) + " ($ncnn)")
Write-Host ("dml models:  " + $(if ($hasDml) { "present" } else { "absent" }) + " ($dml) [Windows DirectML]")
Write-Host ("trt models:  " + $(if ($hasTrt) { "present" } else { "absent" }) + " ($trt)")
Write-Host ("vs runtime:  " + $(if (Test-Path -LiteralPath $vsDir) { "dir exists" } else { "absent (optional)" }))

if ($hasNcnn -or $hasDml -or $hasTrt) {
  Write-Host "RESULT: available (at least one backend model tree)"
  exit 0
}

Write-Host "RESULT: script ok, models empty — probe will report unavailable (expected for CI)"
if ($Strict) {
  Write-Host "Strict mode: require models"
  exit 1
}
exit 0
