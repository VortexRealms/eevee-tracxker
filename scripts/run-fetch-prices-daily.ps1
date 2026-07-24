# Runs npm run fetch:prices at most once per calendar day (local time).
# Skips if today's run already succeeded, or if another instance is running.

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $ProjectRoot "logs"
$StampFile = Join-Path $LogsDir "fetch-prices-last-success.txt"
$LockFile = Join-Path $LogsDir "fetch-prices.lock"

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$Today = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogsDir "fetch-prices-$Today.log"

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding utf8
  Write-Host $line
}

if (Test-Path $StampFile) {
  $last = (Get-Content $StampFile -Raw).Trim()
  if ($last -eq $Today) {
    Write-Log "Skip: already completed successfully on $Today."
    exit 0
  }
}

if (Test-Path $LockFile) {
  $lockAge = (Get-Date) - (Get-Item $LockFile).LastWriteTime
  if ($lockAge.TotalHours -lt 12) {
    Write-Log "Skip: lock file present (another run in progress, age $($lockAge.ToString()))."
    exit 0
  }
  Write-Log "Stale lock (>12h); removing."
  Remove-Item $LockFile -Force
}

Set-Content -Path $LockFile -Value $PID

try {
  Set-Location $ProjectRoot

  $npm = (Get-Command npm -ErrorAction Stop).Source
  Write-Log "Starting fetch:prices from $ProjectRoot using $npm"

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $npm run fetch:prices 2>&1 | ForEach-Object {
    Add-Content -Path $LogFile -Value $_.ToString() -Encoding utf8
  }
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  if ($exitCode -ne 0) {
    Write-Log "FAILED with exit code $exitCode (stamp not updated; will retry on next trigger)."
    exit $exitCode
  }

  Set-Content -Path $StampFile -Value $Today
  Write-Log "SUCCESS - stamped $Today."
  exit 0
}
finally {
  if (Test-Path $LockFile) {
    Remove-Item $LockFile -Force
  }
}
