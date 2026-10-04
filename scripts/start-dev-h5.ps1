param(
  [int]$Port = 5173,
  [string]$BackendBaseUrl = "http://127.0.0.1:8110"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$previousTarget = $env:VITE_NEXGRID_API_PREVIEW_TARGET
try {
  $env:VITE_NEXGRID_API_PREVIEW_TARGET = $BackendBaseUrl
  $process = Start-Process `
    -FilePath "D:\software\nodejs\npm.cmd" `
    -ArgumentList "run", "dev:h5", "--", "--mode", "development", "--host", "0.0.0.0", "--port", $Port, "--strictPort" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "h5-dev.out.log") `
    -RedirectStandardError (Join-Path $logDir "h5-dev.err.log") `
    -PassThru
  [pscustomobject]@{
    Service = "nexion-uniapp-h5"
    Environment = "dev"
    Port = $Port
    ProcessId = $process.Id
    BackendBaseUrl = $BackendBaseUrl
  }
} finally {
  $env:VITE_NEXGRID_API_PREVIEW_TARGET = $previousTarget
}
