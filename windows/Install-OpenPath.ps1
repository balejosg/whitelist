# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# PSScriptAnalyzer: Write-Host is intentional for interactive installer
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '')]

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs the OpenPath DNS system for Windows
.DESCRIPTION
    Installs Acrylic DNS Proxy, configures firewall, browser policies,
    and scheduled tasks for automatic whitelist updates.
.PARAMETER WhitelistUrl
    URL to download the whitelist from
.PARAMETER SkipAcrylic
    Skip Acrylic DNS installation (if already installed)
.EXAMPLE
    .\Install-Whitelist.ps1 -WhitelistUrl "http://server:3000/export/grupo.txt"
#>

param(
    [string]$WhitelistUrl = "https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/main/Informatica%203.txt",
    [switch]$SkipAcrylic
)

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  OpenPath DNS para Windows - Instalador" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "URL: $WhitelistUrl"
Write-Host ""

# Step 1: Create directory structure
Write-Host "[1/7] Creando estructura de directorios..." -ForegroundColor Yellow

$dirs = @(
    "$OpenPathRoot\lib",
    "$OpenPathRoot\scripts",
    "$OpenPathRoot\data\logs"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}
Write-Host "  Estructura creada en $OpenPathRoot" -ForegroundColor Green

# Step 2: Copy modules and scripts
Write-Host "[2/7] Copiando módulos y scripts..." -ForegroundColor Yellow

$scriptDir = Split-Path $PSScriptRoot -Parent
if ($scriptDir -eq "") { $scriptDir = $PSScriptRoot }

# Copy lib modules
Get-ChildItem "$scriptDir\lib\*.psm1" -ErrorAction SilentlyContinue | 
    Copy-Item -Destination "$OpenPathRoot\lib\" -Force

# Copy scripts
Get-ChildItem "$scriptDir\scripts\*.ps1" -ErrorAction SilentlyContinue | 
    Copy-Item -Destination "$OpenPathRoot\scripts\" -Force

Write-Host "  Módulos copiados" -ForegroundColor Green

# Step 3: Create configuration
Write-Host "[3/7] Creando configuración..." -ForegroundColor Yellow

# Detect primary DNS
$primaryDNS = (Get-DnsClientServerAddress -AddressFamily IPv4 | 
    Where-Object { $_.ServerAddresses -and $_.ServerAddresses[0] -ne "127.0.0.1" } |
    Select-Object -First 1).ServerAddresses[0]

if (-not $primaryDNS) {
    $primaryDNS = "8.8.8.8"
}

$config = @{
    whitelistUrl = $WhitelistUrl
    updateIntervalMinutes = 5
    watchdogIntervalMinutes = 1
    primaryDNS = $primaryDNS
    acrylicPath = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
    enableFirewall = $true
    enableBrowserPolicies = $true
    installedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
}

$config | ConvertTo-Json -Depth 10 | Set-Content "$OpenPathRoot\data\config.json" -Encoding UTF8
Write-Host "  DNS upstream: $primaryDNS" -ForegroundColor Green

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force
Import-Module "$OpenPathRoot\lib\Browser.psm1" -Force
Import-Module "$OpenPathRoot\lib\Services.psm1" -Force

# Step 4: Install Acrylic DNS
Write-Host "[4/7] Instalando Acrylic DNS Proxy..." -ForegroundColor Yellow

if (-not $SkipAcrylic) {
    if (Test-AcrylicInstalled) {
        Write-Host "  Acrylic ya instalado" -ForegroundColor Green
    }
    else {
        $installed = Install-AcrylicDNS
        if ($installed) {
            Write-Host "  Acrylic instalado" -ForegroundColor Green
        }
        else {
            Write-Host "  ADVERTENCIA: No se pudo instalar Acrylic automáticamente" -ForegroundColor Yellow
            Write-Host "  Descarga manual: https://mayakron.altervista.org/support/acrylic/Home.htm" -ForegroundColor Yellow
        }
    }
}
else {
    Write-Host "  Instalación de Acrylic omitida" -ForegroundColor Yellow
}

# Configure Acrylic
Set-AcrylicConfiguration

# Step 5: Configure DNS
Write-Host "[5/7] Configurando DNS local..." -ForegroundColor Yellow
Set-LocalDNS
Write-Host "  DNS configurado a 127.0.0.1" -ForegroundColor Green

# Step 6: Register scheduled tasks
Write-Host "[6/7] Registrando tareas programadas..." -ForegroundColor Yellow
Register-OpenPathTask -UpdateIntervalMinutes 5 -WatchdogIntervalMinutes 1
Write-Host "  Tareas registradas" -ForegroundColor Green

# Step 7: First update
Write-Host "[7/7] Ejecutando primera actualización..." -ForegroundColor Yellow

try {
    & "$OpenPathRoot\scripts\Update-Whitelist.ps1"
    Write-Host "  Primera actualización completada" -ForegroundColor Green
}
catch {
    Write-Host "  ADVERTENCIA: Primera actualización fallida (se reintentará)" -ForegroundColor Yellow
}

# Verify installation
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Verificando instalación..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$checks = @()

# Check Acrylic
if (Test-AcrylicInstalled) {
    $checks += @{Name = "Acrylic DNS"; Status = "OK"}
}
else {
    $checks += @{Name = "Acrylic DNS"; Status = "WARN"}
}

# Check DNS
if (Test-DNSResolution -Domain "google.com") {
    $checks += @{Name = "Resolución DNS"; Status = "OK"}
}
else {
    $checks += @{Name = "Resolución DNS"; Status = "FAIL"}
}

# Check Firewall
if (Test-FirewallActive) {
    $checks += @{Name = "Firewall"; Status = "OK"}
}
else {
    $checks += @{Name = "Firewall"; Status = "WARN"}
}

# Check Tasks
$tasks = Get-ScheduledTask -TaskName "OpenPath-*" -ErrorAction SilentlyContinue
if ($tasks.Count -ge 2) {
    $checks += @{Name = "Tareas programadas"; Status = "OK"}
}
else {
    $checks += @{Name = "Tareas programadas"; Status = "WARN"}
}

foreach ($check in $checks) {
    $color = switch ($check.Status) {
        "OK" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    Write-Host "  $($check.Name): $($check.Status)" -ForegroundColor $color
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  INSTALACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Configuración:"
Write-Host "  - Whitelist: $WhitelistUrl"
Write-Host "  - DNS upstream: $primaryDNS"
Write-Host "  - Actualización: cada 5 minutos"
Write-Host ""
Write-Host "Comandos útiles:"
Write-Host "  nslookup google.com 127.0.0.1  # Probar DNS"
Write-Host "  Get-ScheduledTask OpenPath-*  # Ver tareas"
Write-Host ""
Write-Host "Desinstalar: .\Uninstall-OpenPath.ps1"
Write-Host ""
