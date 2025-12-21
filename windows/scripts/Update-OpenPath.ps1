#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Updates the whitelist from remote URL and applies all configurations
.DESCRIPTION
    Downloads whitelist, updates Acrylic DNS hosts, configures firewall,
    and applies browser policies.
#>

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force
Import-Module "$OpenPathRoot\lib\Browser.psm1" -Force

try {
    Write-OpenPathLog "=== Starting openpath update ==="
    
    # Load configuration
    $config = Get-OpenPathConfig
    
    # Download and parse whitelist
    $whitelist = Get-OpenPathFromUrl -Url $config.whitelistUrl
    
    # Check for deactivation flag
    if ($whitelist.Whitelist -contains "#DESACTIVADO" -or $whitelist.Whitelist[0] -match "^#DESACTIVADO") {
        Write-OpenPathLog "DEACTIVATION FLAG detected - entering fail-open mode" -Level WARN
        
        # Restore normal DNS
        Restore-OriginalDNS
        
        # Remove firewall rules
        Remove-OpenPathFirewall
        
        # Remove browser policies
        Remove-BrowserPolicies
        
        Write-OpenPathLog "System in fail-open mode"
        exit 0
    }
    
    # Save whitelist to local file
    $whitelist.Whitelist | Set-Content "$OpenPathRoot\data\whitelist.txt" -Encoding UTF8
    
    # Update Acrylic DNS hosts
    Update-AcrylicHosts -WhitelistedDomains $whitelist.Whitelist -BlockedSubdomains $whitelist.BlockedSubdomains
    
    # Restart Acrylic to apply changes
    Restart-AcrylicService
    
    # Configure firewall (if enabled)
    if ($config.enableFirewall) {
        $acrylicPath = Get-AcrylicPath
        Set-OpenPathFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath
    }
    
    # Configure browser policies (if enabled)
    if ($config.enableBrowserPolicies) {
        Set-AllBrowserPolicies -BlockedPaths $whitelist.BlockedPaths
    }
    
    Write-OpenPathLog "=== OpenPath update completed successfully ==="
    
}
catch {
    Write-OpenPathLog "Update failed: $_" -Level ERROR
    exit 1
}
