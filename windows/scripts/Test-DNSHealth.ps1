#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Watchdog script to verify DNS health and auto-recover
.DESCRIPTION
    Runs periodically to ensure Acrylic DNS and firewall are working correctly.
    Attempts auto-recovery if problems are detected.
#>

$ErrorActionPreference = "SilentlyContinue"
$OpenPathRoot = "C:\OpenPath"

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force

$issues = @()

# Check 1: Acrylic service running
$acrylicService = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $acrylicService -or $acrylicService.Status -ne 'Running') {
    $issues += "Acrylic service not running"
    Write-OpenPathLog "Watchdog: Acrylic service not running, attempting restart..." -Level WARN
    Start-AcrylicService
}

# Check 2: DNS resolution working (should resolve whitelisted domain)
if (-not (Test-DNSResolution -Domain "google.com")) {
    $issues += "DNS resolution failed for whitelisted domain"
    Write-OpenPathLog "Watchdog: DNS resolution failed, restarting Acrylic..." -Level WARN
    Restart-AcrylicService
    Start-Sleep -Seconds 3
}

# Check 3: DNS sinkhole working (should block non-whitelisted)
if (-not (Test-DNSSinkhole -Domain "this-should-be-blocked-test-12345.com")) {
    $issues += "DNS sinkhole not working"
    Write-OpenPathLog "Watchdog: Sinkhole not working properly" -Level WARN
}

# Check 4: Firewall rules active
if (-not (Test-FirewallActive)) {
    $issues += "Firewall rules not active"
    Write-OpenPathLog "Watchdog: Firewall rules missing, reconfiguring..." -Level WARN
    
    try {
        $config = Get-OpenPathConfig
        $acrylicPath = Get-AcrylicPath
        Set-OpenPathFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath
    }
    catch {
        Write-OpenPathLog "Failed to reconfigure firewall: $_" -Level ERROR
    }
}

# Check 5: Local DNS configured
$dnsServers = Get-DnsClientServerAddress -AddressFamily IPv4 | 
    Where-Object { $_.ServerAddresses -contains "127.0.0.1" }

if (-not $dnsServers) {
    $issues += "Local DNS not configured"
    Write-OpenPathLog "Watchdog: Local DNS not configured, fixing..." -Level WARN
    Set-LocalDNS
}

# Summary
if ($issues.Count -eq 0) {
    # All checks passed - silent success
    exit 0
}
else {
    Write-OpenPathLog "Watchdog completed with $($issues.Count) issue(s) detected and handled"
    exit 0
}
