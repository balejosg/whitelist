#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Updates the whitelist from remote URL and applies all configurations
.DESCRIPTION
    Downloads whitelist, updates Acrylic DNS hosts, configures firewall,
    and applies browser policies.
#>

$ErrorActionPreference = "Stop"
$WhitelistRoot = "C:\Whitelist"

# Import modules
Import-Module "$WhitelistRoot\lib\Common.psm1" -Force
Import-Module "$WhitelistRoot\lib\DNS.psm1" -Force
Import-Module "$WhitelistRoot\lib\Firewall.psm1" -Force
Import-Module "$WhitelistRoot\lib\Browser.psm1" -Force

try {
    Write-WhitelistLog "=== Starting whitelist update ==="
    
    # Load configuration
    $config = Get-WhitelistConfig
    
    # Download and parse whitelist
    $whitelist = Get-WhitelistFromUrl -Url $config.whitelistUrl
    
    # Check for deactivation flag
    if ($whitelist.Whitelist -contains "#DESACTIVADO" -or $whitelist.Whitelist[0] -match "^#DESACTIVADO") {
        Write-WhitelistLog "DEACTIVATION FLAG detected - entering fail-open mode" -Level WARN
        
        # Restore normal DNS
        Restore-OriginalDNS
        
        # Remove firewall rules
        Remove-WhitelistFirewall
        
        # Remove browser policies
        Remove-BrowserPolicies
        
        Write-WhitelistLog "System in fail-open mode"
        exit 0
    }
    
    # Save whitelist to local file
    $whitelist.Whitelist | Set-Content "$WhitelistRoot\data\whitelist.txt" -Encoding UTF8
    
    # Update Acrylic DNS hosts
    Update-AcrylicHosts -WhitelistedDomains $whitelist.Whitelist -BlockedSubdomains $whitelist.BlockedSubdomains
    
    # Restart Acrylic to apply changes
    Restart-AcrylicService
    
    # Configure firewall (if enabled)
    if ($config.enableFirewall) {
        $acrylicPath = Get-AcrylicPath
        Set-WhitelistFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath
    }
    
    # Configure browser policies (if enabled)
    if ($config.enableBrowserPolicies) {
        Set-AllBrowserPolicies -BlockedPaths $whitelist.BlockedPaths
    }
    
    Write-WhitelistLog "=== Whitelist update completed successfully ==="
    
}
catch {
    Write-WhitelistLog "Update failed: $_" -Level ERROR
    exit 1
}
