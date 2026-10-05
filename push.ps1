<#
.SYNOPSIS
  Pushes completed pull runs to 0003 and loads them into CampusCE_ADS_DB. Run while ON the VPN.

.DESCRIPTION
  For each finished run (has DONE, no PUSHED) oldest first:
    1. scp the run folder to ~/campusce_pipeline/inbox/<run>  (skipped if already fully uploaded)
    2. run loader.py inside the campusce-etl container on 0003 (per-table transactions, resumable)
    3. on success, mark the run PUSHED locally and clean up the remote copy
  Safe to re-run at any time: a failed push resumes at the first table that was not loaded.
#>
[CmdletBinding()]
param(
    [string]$Remote    = 'prajsrin@tosmonline0003.ttu.edu',
    [string]$KeyPath   = (Join-Path $env:USERPROFILE '.ssh\id_ed25519_ttu'),
    [string]$StageRoot = (Join-Path $PSScriptRoot 'staging'),
    [int]$KeepRuns     = 3
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path (Join-Path $StageRoot 'logs') | Out-Null
$logFile = Join-Path $StageRoot ("logs\push_{0:yyyyMMdd}.log" -f (Get-Date))
function Log([string]$msg) {
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $msg
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

$lockPath = Join-Path $StageRoot 'push.lock'
try { $lock = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { Log 'Another push is already running; exiting.'; exit 3 }

$sshOpts = @('-i', $KeyPath, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20')
function Invoke-Remote([string]$cmd) {
    $out = & ssh @sshOpts $Remote $cmd 2>&1
    $code = $LASTEXITCODE
    # drop OpenSSH's post-quantum warning noise
    $out | Where-Object { $_ -is [string] -and $_ -notmatch '^\*\*' -or $_ -isnot [string] } | ForEach-Object { "$_" }
    $global:remoteExit = $code
}

# ---- is there anything to push? ----
$runsDir = Join-Path $StageRoot 'runs'
$pending = @(Get-ChildItem $runsDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { (Test-Path (Join-Path $_.FullName 'DONE')) -and -not (Test-Path (Join-Path $_.FullName 'PUSHED')) } |
    Sort-Object Name)
if ($pending.Count -eq 0) { Log 'Nothing to push.'; $lock.Dispose(); exit 0 }

# ---- can we reach 0003? ----
$probe = Invoke-Remote 'echo ok'
if ($global:remoteExit -ne 0 -or ($probe -join '') -notmatch 'ok') {
    Log 'Cannot reach 0003 (are you on the VPN?). Exiting.'
    $lock.Dispose(); exit 2
}

$base = '~/campusce_pipeline'
[void](Invoke-Remote "mkdir -p $base/inbox")
# the server keeps its own clone of the GitHub repo; update it so loader.py is current
$pullOut = Invoke-Remote "git -C $base/repo pull --ff-only"
if ($global:remoteExit -ne 0) { Log "git pull on 0003 failed: $($pullOut -join ' ')"; $lock.Dispose(); exit 1 }
Log "Server repo: $(($pullOut | Select-Object -Last 1))"

$failed = $false
foreach ($run in $pending) {
    $id = $run.Name
    Log "Pushing run $id"

    $have = (Invoke-Remote "test -f $base/inbox/$id/.uploaded && echo yes || echo no") -join ''
    if ($have -notmatch 'yes') {
        [void](Invoke-Remote "rm -rf $base/inbox/$id")
        & scp -r @sshOpts $run.FullName "${Remote}:campusce_pipeline/inbox/" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Log "  upload of $id failed; will retry next run"; $failed = $true; break }
        [void](Invoke-Remote "touch $base/inbox/$id/.uploaded")
        Log '  uploaded'
    } else { Log '  already uploaded' }

    $dockerCmd = "docker run --rm --network host --env-file $base/secrets/pg.env " +
                 "-v $base/inbox/${id}:/run_data:ro -v $base/repo/loader.py:/app/loader.py:ro " +
                 "campusce-etl:latest python /app/loader.py /run_data"
    $out = Invoke-Remote $dockerCmd
    $loadExit = $global:remoteExit
    $out | ForEach-Object { Log "  [0003] $_" }
    if ($loadExit -ne 0) { Log "  load of $id incomplete (exit $loadExit); re-run to resume"; $failed = $true; break }

    Set-Content -Path (Join-Path $run.FullName 'PUSHED') -Value (Get-Date).ToString('s')
    [void](Invoke-Remote "rm -rf $base/inbox/$id")
    Log "  run $id loaded and marked PUSHED"
}

# ---- keep only the newest few pushed runs locally ----
Get-ChildItem $runsDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'PUSHED') } |
    Sort-Object Name -Descending | Select-Object -Skip $KeepRuns |
    ForEach-Object { Remove-Item -Recurse -Force $_.FullName; Log "Removed old local run $($_.Name)" }

$lock.Dispose()
if ($failed) { exit 1 } else { exit 0 }
