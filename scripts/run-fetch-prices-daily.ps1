# Runs npm run fetch:prices at most once per calendar day (local time).
# After a successful fetch, commits data/price-history.sqlite and pushes to origin.
# Skips if today's run already succeeded, or if another instance is running.
#
# Authentication: uses Windows Git Credential Manager (GCM). Run `git push` once
# interactively as the same Windows user before relying on the scheduled task.
#
# Usage:
#   .\run-fetch-prices-daily.ps1           # full run
#   .\run-fetch-prices-daily.ps1 -DryRun   # fetch + commit, but git push --dry-run only

param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $ProjectRoot "logs"
$StampFile = Join-Path $LogsDir "fetch-prices-last-success.txt"
$LockFile = Join-Path $LogsDir "fetch-prices.lock"
$SqliteRelativePath = "data/price-history.sqlite"
$script:OwnsLockFile = $false

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$Today = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogsDir "fetch-prices-$Today.log"
$script:LogEncoding = [System.Text.UTF8Encoding]::new($false)

function Append-LogLine {
  param(
    [AllowEmptyString()]
    [string]$Line = ""
  )

  if ($null -eq $Line) {
    return
  }

  $maxAttempts = 8
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      $stream = [System.IO.FileStream]::new(
        $LogFile,
        [System.IO.FileMode]::Append,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::ReadWrite
      )
      try {
        $writer = [System.IO.StreamWriter]::new($stream, $script:LogEncoding)
        $writer.WriteLine($Line)
        $writer.Flush()
        $writer.Dispose()
      } finally {
        $stream.Dispose()
      }
      return
    } catch {
      if ($attempt -eq $maxAttempts) {
        Write-Warning "Could not write to log after $maxAttempts attempts: $($_.Exception.Message)"
        return
      }
      Start-Sleep -Milliseconds (150 * $attempt)
    }
  }
}

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Write-Host $line
  Append-LogLine -Line $line
}

function Invoke-GitLogged {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$GitArgs,
    [switch]$AllowFailure
  )

  $display = "git $($GitArgs -join ' ')"
  Write-Log $display

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & git @GitArgs 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  foreach ($line in @($output)) {
    if ($null -ne $line -and "$line".Length -gt 0) {
      Append-LogLine -Line $line.ToString()
    }
  }

  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "Git command failed (exit $exitCode): $display"
  }

  return @{
    ExitCode = $exitCode
    Output   = @($output)
  }
}

function Get-GitUpstreamRef {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Branch
  )

  $remoteResult = Invoke-GitLogged -GitArgs @(
    "-C", $ProjectRoot, "config", "--get", "branch.$Branch.remote"
  ) -AllowFailure
  if ($remoteResult.ExitCode -ne 0) {
    return $null
  }

  $mergeResult = Invoke-GitLogged -GitArgs @(
    "-C", $ProjectRoot, "config", "--get", "branch.$Branch.merge"
  ) -AllowFailure
  if ($mergeResult.ExitCode -ne 0) {
    return $null
  }

  $remote = ($remoteResult.Output | Select-Object -Last 1).ToString().Trim()
  $merge = ($mergeResult.Output | Select-Object -Last 1).ToString().Trim()
  if ($merge -notmatch '^refs/heads/(.+)$') {
    return $null
  }

  return "$remote/$($Matches[1])"
}

function Test-GitPreflight {
  Write-Log "Running Git preflight checks..."

  $gitCmd = Get-Command git -ErrorAction SilentlyContinue
  if (-not $gitCmd) {
    throw "git was not found on PATH. Install Git for Windows and ensure it is available to scheduled tasks."
  }
  Write-Log "Using git: $($gitCmd.Source)"

  Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "rev-parse", "--is-inside-work-tree") | Out-Null

  $branchResult = Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "rev-parse", "--abbrev-ref", "HEAD")
  $branch = ($branchResult.Output | Select-Object -Last 1).ToString().Trim()
  if ($branch -eq "HEAD" -or [string]::IsNullOrWhiteSpace($branch)) {
    throw "Repository is in detached HEAD state. Checkout a named branch before running the daily task."
  }
  Write-Log "Current branch: $branch"

  $userName = (Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "config", "--get", "user.name")).Output |
    Select-Object -Last 1
  $userEmail = (Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "config", "--get", "user.email")).Output |
    Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace("$userName") -or [string]::IsNullOrWhiteSpace("$userEmail")) {
    throw "Git user.name and user.email must be configured for automated commits."
  }
  Write-Log "Git identity: $userName <$userEmail>"

  $upstreamRef = Get-GitUpstreamRef -Branch $branch
  if (-not $upstreamRef) {
    throw "Branch '$branch' has no upstream. Set one with: git push -u origin $branch"
  }
  Write-Log "Upstream: $upstreamRef"

  Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "fetch", "origin") | Out-Null
  Write-Log "Fetched origin."

  $countsResult = Invoke-GitLogged -GitArgs @(
    "-C", $ProjectRoot, "rev-list", "--left-right", "--count", "HEAD...$upstreamRef"
  )
  $countsLine = ($countsResult.Output | Select-Object -Last 1).ToString().Trim()
  if ($countsLine -match '^(\d+)\s+(\d+)$') {
    $ahead = [int]$Matches[1]
    $behind = [int]$Matches[2]
    Write-Log "Branch vs upstream: ahead $ahead, behind $behind."
    if ($behind -gt 0 -and $ahead -gt 0) {
      throw "Branch has diverged from upstream (ahead $ahead, behind $behind). Pull or rebase manually before the daily task runs."
    }
    if ($behind -gt 0) {
      throw "Branch is behind upstream by $behind commit(s). Pull manually before the daily task runs."
    }
  } else {
    throw "Could not compare branch with upstream: '$countsLine'"
  }

  Write-Log "Git preflight passed."
}

function Publish-PriceHistorySnapshot {
  param(
    [string]$DateStamp,
    [switch]$DryRunPush
  )

  $sqlitePath = Join-Path $ProjectRoot $SqliteRelativePath
  if (-not (Test-Path $sqlitePath)) {
    throw "Expected SQLite snapshot at $SqliteRelativePath after fetch:prices, but file is missing."
  }

  Write-Log "Publishing price history snapshot..."

  Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "add", "--", $SqliteRelativePath) | Out-Null

  $diffResult = Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "diff", "--cached", "--quiet") -AllowFailure
  if ($diffResult.ExitCode -eq 0) {
    Write-Log "No SQLite changes to commit."
  } else {
    $commitMessage = "Update price history for $DateStamp"
    Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "commit", "-m", $commitMessage) | Out-Null
    Write-Log "Committed: $commitMessage"
  }

  if ($DryRunPush) {
    Write-Log "DryRun: validating push with git push --dry-run (no remote changes)."
    try {
      Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "push", "--dry-run", "origin", "HEAD") | Out-Null
      Write-Log "DryRun: push validation succeeded."
    } catch {
      throw @"
Git push --dry-run failed. Scheduled tasks cannot prompt for credentials.
Run 'git push' once interactively as the same Windows user to store credentials in Git Credential Manager, then retry.
Original error: $($_.Exception.Message)
"@
    }
    return
  }

  try {
    Invoke-GitLogged -GitArgs @("-C", $ProjectRoot, "push", "origin", "HEAD") | Out-Null
    Write-Log "Pushed to origin."
  } catch {
    throw @"
Git push failed. Scheduled tasks cannot prompt for credentials.
Run 'git push' once interactively as the same Windows user to store credentials in Git Credential Manager, then retry.
If commit signing is enabled (commit.gpgsign=true), ensure signing works non-interactively or disable it for this repo.
Original error: $($_.Exception.Message)
"@
  }
}

if (Test-Path $StampFile) {
  $last = (Get-Content $StampFile -Raw).Trim()
  if ($last -eq $Today) {
    Write-Log "Skip: already completed successfully on $Today."
    exit 0
  }
}

function Test-LockHeldByLiveProcess {
  if (-not (Test-Path $LockFile)) {
    return $false
  }

  $lockPidText = (Get-Content $LockFile -Raw -ErrorAction SilentlyContinue).Trim()
  if ($lockPidText -match '^\d+$') {
    $lockPid = [int]$lockPidText
    $proc = Get-Process -Id $lockPid -ErrorAction SilentlyContinue
    if ($proc) {
      return $true
    }
    Write-Log "Removing stale lock (process $lockPid is not running)."
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    return $false
  }

  $lockAge = (Get-Date) - (Get-Item $LockFile).LastWriteTime
  Write-Log "Removing invalid lock file (age $($lockAge.ToString()))."
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
  return $false
}

if (Test-LockHeldByLiveProcess) {
  Write-Log "Skip: another run is in progress (lock PID is active)."
  exit 0
}

try {
  $lockStream = [System.IO.FileStream]::new(
    $LockFile,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  $lockWriter = [System.IO.StreamWriter]::new($lockStream)
  $lockWriter.WriteLine($PID)
  $lockWriter.Flush()
  $lockWriter.Dispose()
  $lockStream.Dispose()
  $script:OwnsLockFile = $true
} catch [System.IO.IOException] {
  if (Test-LockHeldByLiveProcess) {
    Write-Log "Skip: another run is in progress (lock PID is active)."
  } else {
    Write-Log "Skip: could not acquire lock file."
  }
  exit 0
}

try {
  Set-Location $ProjectRoot

  if ($DryRun) {
    Write-Log "DryRun mode: will use git push --dry-run and will not write success stamp."
  }

  Test-GitPreflight

  $npm = (Get-Command npm -ErrorAction Stop).Source
  Write-Log "Starting fetch:prices from $ProjectRoot using $npm"

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $npm run fetch:prices 2>&1 | ForEach-Object {
    $text = $_.ToString()
    if ($text.Length -gt 0) {
      Append-LogLine -Line $text
    }
  }
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  if ($exitCode -ne 0) {
    Write-Log "FAILED fetch:prices with exit code $exitCode (stamp not updated; will retry on next trigger)."
    exit $exitCode
  }

  Write-Log "Verifying SQLite integrity..."
  & $npm run verify:price-db -- $Today 2>&1 | ForEach-Object {
    $text = $_.ToString()
    if ($text.Length -gt 0) {
      Append-LogLine -Line $text
    }
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Log "FAILED verify:price-db (stamp not updated)."
    exit $LASTEXITCODE
  }

  Publish-PriceHistorySnapshot -DateStamp $Today -DryRunPush:$DryRun

  if ($DryRun) {
    Write-Log "DryRun complete - success stamp not written."
    exit 0
  }

  Set-Content -Path $StampFile -Value $Today
  Write-Log "SUCCESS - fetch, commit, and push completed for $Today."
  exit 0
}
catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($script:OwnsLockFile -and (Test-Path $LockFile)) {
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
  }
}
