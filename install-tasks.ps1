<#
.SYNOPSIS
  Registers the two hourly Windows scheduled tasks for the current user (re-run to update them).

.DESCRIPTION
  CampusCE-Pull : hourly at :05. pull.ps1 -MinHours 8 only does work when 8 hours have passed since the last
                  finished run (or an unfinished run needs resuming) and ADS is reachable (off VPN).
  CampusCE-Push : hourly at :35. push.ps1 only does work when a finished run is waiting and 0003 is reachable (on VPN).
  Both are quiet no-ops otherwise, so the VPN being on or off at a given hour just delays the work.
#>
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

function Register-Hourly($name, $script, $scriptArgs, $minute) {
    $start = (Get-Date).Date.AddHours((Get-Date).Hour).AddMinutes($minute)
    if ($start -lt (Get-Date)) { $start = $start.AddHours(1) }
    $trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $dir `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\$script`" $scriptArgs"
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "Registered $name (first run $start)"
}

Register-Hourly 'CampusCE-Pull' 'pull.ps1' '-MinHours 8' 5
Register-Hourly 'CampusCE-Push' 'push.ps1' '' 35
