# Whitelist Services Module for Windows
# Manages Task Scheduler tasks for periodic updates

# Import common functions
$modulePath = Split-Path $PSScriptRoot -Parent
Import-Module "$modulePath\lib\Common.psm1" -Force -ErrorAction SilentlyContinue

$script:TaskPrefix = "Whitelist"

function Register-WhitelistTasks {
    <#
    .SYNOPSIS
        Registers all scheduled tasks for whitelist system
    #>
    param(
        [int]$UpdateIntervalMinutes = 5,
        [int]$WatchdogIntervalMinutes = 1
    )
    
    Write-WhitelistLog "Registering scheduled tasks..."
    
    $whitelistRoot = "C:\Whitelist"
    
    # Task 1: Update Whitelist (every 5 minutes)
    $updateAction = New-ScheduledTaskAction -Execute "PowerShell.exe" `
        -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$whitelistRoot\scripts\Update-Whitelist.ps1`""
    
    $updateTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
        -RepetitionInterval (New-TimeSpan -Minutes $UpdateIntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 9999)
    
    $updatePrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    
    $updateSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName "$script:TaskPrefix-Update" `
        -Action $updateAction `
        -Trigger $updateTrigger `
        -Principal $updatePrincipal `
        -Settings $updateSettings `
        -Force | Out-Null
    
    Write-WhitelistLog "Registered: $script:TaskPrefix-Update (every $UpdateIntervalMinutes min)"
    
    # Task 2: Watchdog (every 1 minute)
    $watchdogAction = New-ScheduledTaskAction -Execute "PowerShell.exe" `
        -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$whitelistRoot\scripts\Test-DNSHealth.ps1`""
    
    $watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes $WatchdogIntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 9999)
    
    Register-ScheduledTask -TaskName "$script:TaskPrefix-Watchdog" `
        -Action $watchdogAction `
        -Trigger $watchdogTrigger `
        -Principal $updatePrincipal `
        -Settings $updateSettings `
        -Force | Out-Null
    
    Write-WhitelistLog "Registered: $script:TaskPrefix-Watchdog (every $WatchdogIntervalMinutes min)"
    
    # Task 3: Startup task (run update on boot)
    $startupTrigger = New-ScheduledTaskTrigger -AtStartup
    
    Register-ScheduledTask -TaskName "$script:TaskPrefix-Startup" `
        -Action $updateAction `
        -Trigger $startupTrigger `
        -Principal $updatePrincipal `
        -Settings $updateSettings `
        -Force | Out-Null
    
    Write-WhitelistLog "Registered: $script:TaskPrefix-Startup (at boot)"
    
    return $true
}

function Unregister-WhitelistTasks {
    <#
    .SYNOPSIS
        Removes all whitelist scheduled tasks
    #>
    Write-WhitelistLog "Removing scheduled tasks..."
    
    $tasks = Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue
    
    foreach ($task in $tasks) {
        try {
            Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false
            Write-WhitelistLog "Removed task: $($task.TaskName)"
        }
        catch {
            Write-WhitelistLog "Failed to remove $($task.TaskName): $_" -Level WARN
        }
    }
}

function Get-WhitelistTaskStatus {
    <#
    .SYNOPSIS
        Gets status of all whitelist tasks
    #>
    $tasks = Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue
    
    $status = @()
    foreach ($task in $tasks) {
        $info = Get-ScheduledTaskInfo -TaskName $task.TaskName -ErrorAction SilentlyContinue
        $status += [PSCustomObject]@{
            Name = $task.TaskName
            State = $task.State
            LastRunTime = $info.LastRunTime
            LastResult = $info.LastTaskResult
            NextRunTime = $info.NextRunTime
        }
    }
    
    return $status
}

function Start-WhitelistTask {
    <#
    .SYNOPSIS
        Manually starts a whitelist task
    .PARAMETER TaskType
        Type of task: Update, Watchdog, or Startup
    #>
    param(
        [ValidateSet("Update", "Watchdog", "Startup")]
        [string]$TaskType = "Update"
    )
    
    $taskName = "$script:TaskPrefix-$TaskType"
    
    try {
        Start-ScheduledTask -TaskName $taskName
        Write-WhitelistLog "Started task: $taskName"
        return $true
    }
    catch {
        Write-WhitelistLog "Failed to start $taskName : $_" -Level ERROR
        return $false
    }
}

function Enable-WhitelistTasks {
    <#
    .SYNOPSIS
        Enables all whitelist scheduled tasks
    #>
    Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue | 
        Enable-ScheduledTask | Out-Null
    Write-WhitelistLog "All whitelist tasks enabled"
}

function Disable-WhitelistTasks {
    <#
    .SYNOPSIS
        Disables all whitelist scheduled tasks
    #>
    Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue | 
        Disable-ScheduledTask | Out-Null
    Write-WhitelistLog "All whitelist tasks disabled"
}

# Export module members
Export-ModuleMember -Function @(
    'Register-WhitelistTasks',
    'Unregister-WhitelistTasks',
    'Get-WhitelistTaskStatus',
    'Start-WhitelistTask',
    'Enable-WhitelistTasks',
    'Disable-WhitelistTasks'
)
