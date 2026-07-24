# Register or remove the Windows scheduled task for daily fetch:prices.

param(
  [string]$Time = "07:00",
  [string]$TaskName = "EeveeTracxker Fetch Prices Daily",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $ProjectRoot "scripts\run-fetch-prices-daily.ps1"
$LogsDir = Join-Path $ProjectRoot "logs"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task: $TaskName"
  exit 0
}

if (-not (Test-Path $Runner)) {
  throw "Missing runner script: $Runner"
}

try {
  $npm = Get-Command npm -ErrorAction Stop
} catch {
  throw @"
npm was not found on PATH. Scheduled tasks use a minimal PATH - ensure Node.js/npm is installed
and available to your user account (not only in an interactive nvm/fnm shell).
"@
}

$Shell = "powershell.exe"
$ShellArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""
if (Get-Command pwsh -ErrorAction SilentlyContinue) {
  $Shell = (Get-Command pwsh).Source
}

$Action = New-ScheduledTaskAction -Execute $Shell -Argument $ShellArgs -WorkingDirectory $ProjectRoot

$Daily = New-ScheduledTaskTrigger -Daily -At $Time
$Logon = New-ScheduledTaskTrigger -AtLogOn
$Logon.Delay = "PT3M"

$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 8)

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger @($Daily, $Logon) `
  -Settings $Settings `
  -Principal $Principal `
  -Force | Out-Null

Write-Host "Registered scheduled task: $TaskName"
Write-Host "  Daily at $Time (runs ASAP if PC was off at scheduled time)"
Write-Host "  At logon (+ 3 min), skipped if already succeeded today"
Write-Host "  npm: $($npm.Source)"
Write-Host "  Logs: $LogsDir\"
Write-Host ""
Write-Host "Test now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Or:        npm run fetch:prices:daily"
Write-Host "Remove:    npm run setup:fetch-prices-task -- -Remove"
