# Whitelist DNS Common Module for Windows
# Provides shared functions for all whitelist components

# Configuration paths
$script:WhitelistRoot = "C:\Whitelist"
$script:ConfigPath = "$script:WhitelistRoot\data\config.json"
$script:LogPath = "$script:WhitelistRoot\data\logs\whitelist.log"

function Test-AdminPrivileges {
    <#
    .SYNOPSIS
        Checks if script is running with administrator privileges
    #>
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-WhitelistLog {
    <#
    .SYNOPSIS
        Writes a log entry to the whitelist log file
    .PARAMETER Message
        The message to log
    .PARAMETER Level
        Log level: INFO, WARN, ERROR
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [ValidateSet("INFO", "WARN", "ERROR")]
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "$timestamp [$Level] $Message"
    
    # Ensure log directory exists
    $logDir = Split-Path $script:LogPath -Parent
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    
    # Append to log file
    Add-Content -Path $script:LogPath -Value $logEntry -Encoding UTF8
    
    # Also write to console with color
    switch ($Level) {
        "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        "WARN"  { Write-Host $logEntry -ForegroundColor Yellow }
        default { Write-Host $logEntry }
    }
}

function Get-WhitelistConfig {
    <#
    .SYNOPSIS
        Reads the whitelist configuration from config.json
    .OUTPUTS
        PSCustomObject with configuration values
    #>
    if (-not (Test-Path $script:ConfigPath)) {
        Write-WhitelistLog "Config file not found at $($script:ConfigPath)" -Level ERROR
        throw "Configuration file not found"
    }
    
    return Get-Content $script:ConfigPath -Raw | ConvertFrom-Json
}

function Set-WhitelistConfig {
    <#
    .SYNOPSIS
        Saves configuration to config.json
    .PARAMETER Config
        Configuration object to save
    #>
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config
    )
    
    $configDir = Split-Path $script:ConfigPath -Parent
    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }
    
    $Config | ConvertTo-Json -Depth 10 | Set-Content $script:ConfigPath -Encoding UTF8
    Write-WhitelistLog "Configuration saved"
}

function Get-PrimaryDNS {
    <#
    .SYNOPSIS
        Detects the primary DNS server from active network adapters
    .OUTPUTS
        String with the primary DNS IP address
    #>
    $dns = Get-DnsClientServerAddress -AddressFamily IPv4 | 
        Where-Object { $_.ServerAddresses -and $_.ServerAddresses[0] -ne "127.0.0.1" } |
        Select-Object -First 1
    
    if ($dns -and $dns.ServerAddresses) {
        return $dns.ServerAddresses[0]
    }
    
    # Fallback to gateway
    $gateway = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Select-Object -First 1).NextHop
    if ($gateway) {
        return $gateway
    }
    
    # Ultimate fallback
    return "8.8.8.8"
}

function Get-WhitelistFromUrl {
    <#
    .SYNOPSIS
        Downloads and parses whitelist from URL
    .PARAMETER Url
        URL to download whitelist from
    .OUTPUTS
        Hashtable with Whitelist, BlockedSubdomains, and BlockedPaths arrays
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )
    
    Write-WhitelistLog "Downloading whitelist from $Url"
    
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
        $content = $response.Content
    }
    catch {
        Write-WhitelistLog "Failed to download whitelist: $_" -Level ERROR
        throw
    }
    
    $result = @{
        Whitelist = @()
        BlockedSubdomains = @()
        BlockedPaths = @()
    }
    
    $currentSection = "WHITELIST"
    
    foreach ($line in $content -split "`n") {
        $line = $line.Trim()
        
        # Skip empty lines and comments (except section headers)
        if (-not $line) { continue }
        
        # Check for section headers
        if ($line -match "^##\s*(.+)$") {
            $currentSection = $Matches[1].Trim().ToUpper()
            continue
        }
        
        # Skip other comments
        if ($line.StartsWith("#")) { continue }
        
        # Add to appropriate section
        switch ($currentSection) {
            "WHITELIST"           { $result.Whitelist += $line }
            "BLOCKED-SUBDOMAINS"  { $result.BlockedSubdomains += $line }
            "BLOCKED-PATHS"       { $result.BlockedPaths += $line }
        }
    }
    
    Write-WhitelistLog "Parsed: $($result.Whitelist.Count) whitelisted, $($result.BlockedSubdomains.Count) blocked subdomains, $($result.BlockedPaths.Count) blocked paths"
    
    return $result
}

function Test-InternetConnection {
    <#
    .SYNOPSIS
        Tests if there is an active internet connection
    #>
    try {
        $result = Test-NetConnection -ComputerName "8.8.8.8" -Port 53 -WarningAction SilentlyContinue
        return $result.TcpTestSucceeded
    }
    catch {
        return $false
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Test-AdminPrivileges',
    'Write-WhitelistLog',
    'Get-WhitelistConfig',
    'Set-WhitelistConfig',
    'Get-PrimaryDNS',
    'Get-WhitelistFromUrl',
    'Test-InternetConnection'
)
