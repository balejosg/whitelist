#!/bin/bash

# Rollback script for dnsmasq URL whitelist system
# This script removes all components installed by setup-dnsmasq-whitelist.sh
# Must be run as root/sudo

set -e

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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root. Please use sudo."
    exit 1
fi

echo "================================================"
echo "dnsmasq URL Whitelist System - ROLLBACK"
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
if systemctl is-active --quiet dnsmasq-whitelist.timer; then
    systemctl stop dnsmasq-whitelist.timer
    log "Stopped dnsmasq-whitelist.timer"
fi

if systemctl is-enabled --quiet dnsmasq-whitelist.timer 2>/dev/null; then
    systemctl disable dnsmasq-whitelist.timer
    log "Disabled dnsmasq-whitelist.timer"
fi

if systemctl is-active --quiet dnsmasq-whitelist.service; then
    systemctl stop dnsmasq-whitelist.service
    log "Stopped dnsmasq-whitelist.service"
fi

# Step 2: Remove firewall rules and ipset
log "Removing firewall rules and ipset..."

# Remove iptables rules (in reverse order of creation)
if iptables -C OUTPUT -j DROP 2>/dev/null; then
    iptables -D OUTPUT -j DROP
    log "Removed DROP rule from OUTPUT chain"
fi

if iptables -C OUTPUT -m set --match-set url_whitelist dst -j ACCEPT 2>/dev/null; then
    iptables -D OUTPUT -m set --match-set url_whitelist dst -j ACCEPT
    log "Removed ipset ACCEPT rule from OUTPUT chain"
fi

if iptables -C OUTPUT -p udp --dport 53 -j ACCEPT 2>/dev/null; then
    iptables -D OUTPUT -p udp --dport 53 -j ACCEPT
    log "Removed DNS ACCEPT rule from OUTPUT chain"
fi

if iptables -C OUTPUT -p tcp --dport 53 -j ACCEPT 2>/dev/null; then
    iptables -D OUTPUT -p tcp --dport 53 -j ACCEPT
    log "Removed DNS ACCEPT rule from OUTPUT chain"
fi

if iptables -C OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null; then
    iptables -D OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    log "Removed ESTABLISHED,RELATED rule from OUTPUT chain"
fi

if iptables -C OUTPUT -o lo -j ACCEPT 2>/dev/null; then
    iptables -D OUTPUT -o lo -j ACCEPT
    log "Removed loopback ACCEPT rule from OUTPUT chain"
fi

# Destroy ipset
if ipset list url_whitelist &>/dev/null; then
    ipset destroy url_whitelist
    log "Destroyed ipset 'url_whitelist'"
fi

# Step 3: Remove systemd service files
log "Removing systemd service files..."
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

# Step 4: Remove whitelist manager script
log "Removing whitelist manager script..."
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

# Step 6: Remove log file
log "Removing log file..."
if [ -f /var/log/url-whitelist.log ]; then
    rm -f /var/log/url-whitelist.log
    log "Removed /var/log/url-whitelist.log"
fi

# Step 7: Remove dnsmasq configuration
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

# Step 8: Restore DNS configuration
log "Restoring DNS configuration..."

# Check if we modified systemd-resolved
if [ -f /etc/systemd/resolved.conf.backup-whitelist ]; then
    mv /etc/systemd/resolved.conf.backup-whitelist /etc/systemd/resolved.conf
    log "Restored original /etc/systemd/resolved.conf from backup"

    if systemctl is-active --quiet systemd-resolved; then
        systemctl restart systemd-resolved
        log "Restarted systemd-resolved"
    fi
fi

# Check if we modified resolv.conf
if [ -f /etc/resolv.conf.backup-whitelist ]; then
    # Remove symlink if it exists
    if [ -L /etc/resolv.conf ]; then
        rm /etc/resolv.conf
    fi
    mv /etc/resolv.conf.backup-whitelist /etc/resolv.conf
    log "Restored original /etc/resolv.conf from backup"
else
    warn "No backup found for /etc/resolv.conf. You may need to manually restore DNS settings."
fi

# Step 9: Restart dnsmasq (or stop it if it wasn't running before)
log "Managing dnsmasq service..."
if systemctl is-active --quiet dnsmasq; then
    systemctl restart dnsmasq
    log "Restarted dnsmasq service"
else
    warn "dnsmasq service is not running. It may not have been running before installation."
fi

# Step 10: Optional package removal
echo ""
warn "The following packages were installed by the setup script:"
echo "  - ipset"
echo "  - iptables"
echo "  - dnsmasq"
echo "  - curl"
echo ""
echo "These packages may be used by other services on your system."
read -p "Do you want to remove these packages? (yes/no): " remove_packages

if [ "$remove_packages" = "yes" ]; then
    log "Removing packages..."
    apt-get remove --purge -y ipset dnsmasq 2>/dev/null || warn "Failed to remove some packages"
    apt-get autoremove -y 2>/dev/null || warn "Failed to autoremove packages"
    log "Packages removed (iptables and curl were kept as they're commonly used)"
else
    log "Skipping package removal"
fi

# Final summary
echo ""
echo "================================================"
log "Rollback completed successfully!"
echo "================================================"
echo ""
echo "Summary of changes:"
echo "  ✓ Stopped and disabled systemd services"
echo "  ✓ Removed firewall rules and ipset"
echo "  ✓ Removed systemd service files"
echo "  ✓ Removed whitelist manager script"
echo "  ✓ Removed whitelist data directory"
echo "  ✓ Removed dnsmasq configuration"
echo "  ✓ Restored DNS settings"
echo ""
warn "Please verify your internet connectivity and DNS resolution:"
echo "  ping -c 3 8.8.8.8"
echo "  nslookup google.com"
echo ""
warn "If you experience DNS issues, you may need to manually check:"
echo "  - /etc/resolv.conf"
echo "  - /etc/systemd/resolved.conf"
echo "  - systemctl status systemd-resolved"
echo ""
