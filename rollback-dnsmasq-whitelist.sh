#!/bin/bash

################################################################################
# Rollback script for dnsmasq URL Whitelist System v2.0
# This script removes all components installed by setup-dnsmasq-whitelist.sh
# Must be run as root/sudo
################################################################################

# NOTE: Do NOT use 'set -e' to prevent abrupt exits on errors
# We use explicit error handling instead

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Validation functions
validate_dns() {
    log "Validando resolución DNS..."
    if nslookup google.com >/dev/null 2>&1; then
        log "✓ DNS funcional"
        return 0
    else
        error "DNS no funcional"
        return 1
    fi
}

validate_connectivity() {
    log "Validando conectividad a internet..."
    if ping -c 2 -W 3 8.8.8.8 >/dev/null 2>&1; then
        log "✓ Conectividad IP funcional"
        if ping -c 2 -W 3 google.com >/dev/null 2>&1; then
            log "✓ Resolución DNS y conectividad funcionales"
            return 0
        else
            warn "Conectividad IP OK, pero DNS falla"
            return 1
        fi
    else
        error "Sin conectividad a internet"
        return 1
    fi
}

emergency_dns_fix() {
    warn "Aplicando configuración DNS de emergencia..."
    cat > /etc/resolv.conf << 'EMERGENCY_EOF'
# Configuración DNS de emergencia (rollback fallido)
nameserver 8.8.8.8
nameserver 1.1.1.1
EMERGENCY_EOF
    log "DNS de emergencia configurado (8.8.8.8, 1.1.1.1)"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root. Please use sudo."
    exit 1
fi

echo "================================================"
echo "dnsmasq URL Whitelist System v2.0 - ROLLBACK"
echo "================================================"
echo ""
warn "This script will remove the URL whitelist system and restore your system to its previous state."
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Rollback cancelled."
    exit 0
fi
echo ""

# Step 1: Stop and disable systemd services
log "Stopping and disabling systemd services..."

# Detector de portal cautivo
if systemctl is-active --quiet captive-portal-detector.service; then
    systemctl stop captive-portal-detector.service
    log "Stopped captive-portal-detector.service"
fi

if systemctl is-enabled --quiet captive-portal-detector.service 2>/dev/null; then
    systemctl disable captive-portal-detector.service
    log "Disabled captive-portal-detector.service"
fi

# Timer de whitelist
if systemctl is-active --quiet dnsmasq-whitelist.timer; then
    systemctl stop dnsmasq-whitelist.timer
    log "Stopped dnsmasq-whitelist.timer"
fi

if systemctl is-enabled --quiet dnsmasq-whitelist.timer 2>/dev/null; then
    systemctl disable dnsmasq-whitelist.timer
    log "Disabled dnsmasq-whitelist.timer"
fi

# Servicio de whitelist
if systemctl is-active --quiet dnsmasq-whitelist.service; then
    systemctl stop dnsmasq-whitelist.service
    log "Stopped dnsmasq-whitelist.service"
fi

# Step 2: Remove firewall rules
log "Removing firewall rules..."

# Limpiar todas las reglas de OUTPUT (volver a estado por defecto)
iptables -F OUTPUT 2>/dev/null || true
log "Flushed OUTPUT chain"

# Step 3: Remove systemd service files
log "Removing systemd service files..."

if [ -f /etc/systemd/system/captive-portal-detector.service ]; then
    rm -f /etc/systemd/system/captive-portal-detector.service
    log "Removed /etc/systemd/system/captive-portal-detector.service"
fi

if [ -f /etc/systemd/system/dnsmasq-whitelist.timer ]; then
    rm -f /etc/systemd/system/dnsmasq-whitelist.timer
    log "Removed /etc/systemd/system/dnsmasq-whitelist.timer"
fi

if [ -f /etc/systemd/system/dnsmasq-whitelist.service ]; then
    rm -f /etc/systemd/system/dnsmasq-whitelist.service
    log "Removed /etc/systemd/system/dnsmasq-whitelist.service"
fi

systemctl daemon-reload
log "Reloaded systemd daemon"

# Step 4: Remove scripts
log "Removing scripts..."

if [ -f /usr/local/bin/captive-portal-detector.sh ]; then
    rm -f /usr/local/bin/captive-portal-detector.sh
    log "Removed /usr/local/bin/captive-portal-detector.sh"
fi

if [ -f /usr/local/bin/dnsmasq-whitelist.sh ]; then
    rm -f /usr/local/bin/dnsmasq-whitelist.sh
    log "Removed /usr/local/bin/dnsmasq-whitelist.sh"
fi

# Step 5: Remove whitelist directory and data
log "Removing whitelist data directory..."
if [ -d /var/lib/url-whitelist ]; then
    rm -rf /var/lib/url-whitelist
    log "Removed /var/lib/url-whitelist directory"
fi

# Step 6: Remove log files
log "Removing log files..."
if [ -f /var/log/url-whitelist.log ]; then
    rm -f /var/log/url-whitelist.log
    log "Removed /var/log/url-whitelist.log"
fi

if [ -f /var/log/captive-portal-detector.log ]; then
    rm -f /var/log/captive-portal-detector.log
    log "Removed /var/log/captive-portal-detector.log"
fi

# Step 7: Remove state files
log "Removing state files..."
if [ -f /var/run/captive-portal-state ]; then
    rm -f /var/run/captive-portal-state
    log "Removed /var/run/captive-portal-state"
fi

# Step 8: Remove dnsmasq configuration
log "Removing dnsmasq configuration..."
if [ -f /etc/dnsmasq.d/url-whitelist.conf ]; then
    rm -f /etc/dnsmasq.d/url-whitelist.conf
    log "Removed /etc/dnsmasq.d/url-whitelist.conf"
fi

# Restore original dnsmasq.conf if backup exists
if [ -f /etc/dnsmasq.conf.backup-whitelist ]; then
    mv /etc/dnsmasq.conf.backup-whitelist /etc/dnsmasq.conf
    log "Restored original /etc/dnsmasq.conf from backup"
else
    warn "No backup found for /etc/dnsmasq.conf. You may need to manually review this file."
fi

# Step 9: Restore DNS configuration (CRITICAL - improved order)
log "Restoring DNS configuration..."

# PASO 1: Restaurar y validar systemd-resolved PRIMERO
log "PASO 1/4: Restaurando systemd-resolved..."
if [ -f /etc/systemd/resolved.conf.backup-whitelist ]; then
    mv /etc/systemd/resolved.conf.backup-whitelist /etc/systemd/resolved.conf
    log "Restored original /etc/systemd/resolved.conf from backup"
else
    warn "No backup found for systemd-resolved.conf"
fi

# Asegurar que systemd-resolved esté activo y funcionando
log "Iniciando systemd-resolved..."
systemctl stop systemd-resolved 2>/dev/null || true
systemctl start systemd-resolved

# Validar que systemd-resolved inició correctamente
log "Validando systemd-resolved..."
RESOLVED_OK=false
for i in {1..10}; do
    if systemctl is-active --quiet systemd-resolved; then
        log "✓ systemd-resolved activo"
        RESOLVED_OK=true
        break
    fi
    sleep 1
done

if [ "$RESOLVED_OK" = false ]; then
    error "systemd-resolved no pudo iniciar correctamente"
    warn "Intentando continuar de todos modos..."
fi

# PASO 2: Gestionar dnsmasq ANTES de cambiar resolv.conf
log "PASO 2/4: Gestionando dnsmasq..."
# Detener dnsmasq si está corriendo
if systemctl is-active --quiet dnsmasq; then
    log "Deteniendo dnsmasq..."
    systemctl stop dnsmasq 2>/dev/null || true
fi

# Deshabilitar si no estaba habilitado antes
# (Asumimos que no estaba habilitado originalmente)
if systemctl is-enabled --quiet dnsmasq 2>/dev/null; then
    log "Deshabilitando dnsmasq..."
    systemctl disable dnsmasq 2>/dev/null || true
fi

# PASO 3: Restaurar resolv.conf
log "PASO 3/4: Restaurando /etc/resolv.conf..."
if [ -f /etc/resolv.conf.backup-whitelist ]; then
    # Remove current file if it exists
    if [ -L /etc/resolv.conf ] || [ -f /etc/resolv.conf ]; then
        rm -f /etc/resolv.conf
    fi
    mv /etc/resolv.conf.backup-whitelist /etc/resolv.conf
    log "Restored original /etc/resolv.conf from backup"
else
    warn "No backup found for /etc/resolv.conf. Recreating symlink to systemd-resolved..."
    # Recrear symlink a systemd-resolved si no hay backup
    rm -f /etc/resolv.conf
    ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
    log "Recreated symlink to systemd-resolved"
fi

# PASO 4: Validar DNS y conectividad
log "PASO 4/4: Validando DNS y conectividad..."
if ! validate_dns; then
    error "DNS validation failed after rollback"
    warn "Aplicando DNS de emergencia..."
    emergency_dns_fix

    # Validar nuevamente
    sleep 2
    if ! validate_dns; then
        error "DNS aún no funciona después de configuración de emergencia"
        warn "Puede necesitar intervención manual"
    fi
fi

# Validar conectividad completa
validate_connectivity || warn "Conectividad limitada - revisar configuración de red"

# Step 11: Optional package removal
echo ""
warn "The following packages were installed by the setup script:"
echo "  - dnsmasq"
echo "  - iptables"
echo "  - curl"
echo "  - libcap2-bin"
echo ""
echo "These packages may be used by other services on your system."
read -p "Do you want to remove dnsmasq package? (yes/no): " remove_packages

if [ "$remove_packages" = "yes" ]; then
    log "Removing dnsmasq package..."
    apt-get remove --purge -y dnsmasq 2>/dev/null || warn "Failed to remove dnsmasq"
    apt-get autoremove -y 2>/dev/null || warn "Failed to autoremove packages"
    log "dnsmasq removed (iptables, curl, and libcap2-bin were kept)"
else
    log "Skipping package removal"
fi

# Final summary
echo ""
echo "================================================"
log "Rollback completed!"
echo "================================================"
echo ""
echo "Summary of changes:"
echo "  ✓ Stopped and disabled all systemd services"
echo "  ✓ Removed firewall rules (OUTPUT chain flushed)"
echo "  ✓ Removed systemd service files"
echo "  ✓ Removed whitelist manager scripts"
echo "  ✓ Removed captive portal detector script"
echo "  ✓ Removed whitelist data directory"
echo "  ✓ Removed log files"
echo "  ✓ Removed dnsmasq configuration"
echo "  ✓ Restored DNS settings"
echo "  ✓ Validated DNS functionality"
echo "  ✓ Validated internet connectivity"
echo ""
log "Verification tests performed:"
echo "  - systemd-resolved: $(systemctl is-active systemd-resolved 2>/dev/null || echo 'inactive')"
echo "  - DNS resolution: $(nslookup google.com >/dev/null 2>&1 && echo 'OK' || echo 'FAILED')"
echo "  - Internet connectivity: $(ping -c 1 -W 2 google.com >/dev/null 2>&1 && echo 'OK' || echo 'FAILED')"
echo ""

if validate_connectivity >/dev/null 2>&1; then
    log "✓ Your system has been successfully restored with working internet!"
else
    warn "⚠ Your system was restored but connectivity issues remain."
    echo ""
    warn "Manual checks recommended:"
    echo "  1. Check DNS: nslookup google.com"
    echo "  2. Check systemd-resolved: systemctl status systemd-resolved"
    echo "  3. Check /etc/resolv.conf: cat /etc/resolv.conf"
    echo "  4. If all else fails, manually set DNS to 8.8.8.8 in /etc/resolv.conf"
fi
echo ""
