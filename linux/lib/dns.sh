#!/bin/bash

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

################################################################################
# dns.sh - DNS management functions
# Part of the OpenPath DNS system v3.5
################################################################################

# Free port 53 (stop systemd-resolved)
free_port_53() {
    log "Freeing port 53..."
    
    # Stop systemd-resolved socket and service
    systemctl stop systemd-resolved.socket 2>/dev/null || true
    systemctl disable systemd-resolved.socket 2>/dev/null || true
    systemctl stop systemd-resolved 2>/dev/null || true
    systemctl disable systemd-resolved 2>/dev/null || true
    
    # Wait for port to be released
    local retries=30
    while [ $retries -gt 0 ]; do
        if ! ss -tulpn 2>/dev/null | grep -q ":53 "; then
            log "✓ Port 53 freed"
            return 0
        fi
        sleep 1
        retries=$((retries - 1))
    done
    
    log "⚠ Port 53 still occupied after 30 seconds"
    return 1
}

# Configure /etc/resolv.conf to use local dnsmasq
configure_resolv_conf() {
    log "Configuring /etc/resolv.conf..."
    
    # Unprotect if protected
    chattr -i /etc/resolv.conf 2>/dev/null || true
    
    # Backup if symlink
    if [ -L /etc/resolv.conf ]; then
        local target=$(readlink -f /etc/resolv.conf)
        echo "$target" > "$CONFIG_DIR/resolv.conf.symlink.backup"
        rm -f /etc/resolv.conf
    elif [ -f /etc/resolv.conf ]; then
        cp /etc/resolv.conf "$CONFIG_DIR/resolv.conf.backup"
    fi
    
    # Crear nuevo resolv.conf
    cat > /etc/resolv.conf << 'EOF'
# Generado por openpath
# DNS local (dnsmasq)
nameserver 127.0.0.1
options edns0 trust-ad
search lan
EOF
    
    # Protect against overwriting
    chattr +i /etc/resolv.conf 2>/dev/null || true
    
    log "✓ /etc/resolv.conf configured"
}

# Configure upstream DNS for dnsmasq
configure_upstream_dns() {
    log "Configuring upstream DNS..."
    
    # Create directory
    mkdir -p /run/dnsmasq
    
    # Detect primary DNS
    PRIMARY_DNS=$(detect_primary_dns)
    
    # Save for future reference
    echo "$PRIMARY_DNS" > "$ORIGINAL_DNS_FILE"
    
    # Crear resolv.conf para dnsmasq
    cat > /run/dnsmasq/resolv.conf << EOF
# DNS upstream para dnsmasq
nameserver $PRIMARY_DNS
nameserver 8.8.8.8
EOF
    
    log "✓ Upstream DNS configured: $PRIMARY_DNS"
}

# Create DNS upstream initialization script
create_dns_init_script() {
    cat > "$SCRIPTS_DIR/dnsmasq-init-resolv.sh" << 'EOF'
#!/bin/bash
# Regenerate /run/dnsmasq/resolv.conf on each boot

mkdir -p /run/dnsmasq

# Read saved DNS
if [ -f /var/lib/openpath/original-dns.conf ]; then
    PRIMARY_DNS=$(cat /var/lib/openpath/original-dns.conf | head -1)
else
    # Detect via NetworkManager
    if command -v nmcli >/dev/null 2>&1; then
        PRIMARY_DNS=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS\[1\]" | awk '{print $2}' | head -1)
    fi
    # Fallback to gateway
    [ -z "$PRIMARY_DNS" ] && PRIMARY_DNS=$(ip route | grep default | awk '{print $3}' | head -1)
    # Absolute fallback
    [ -z "$PRIMARY_DNS" ] && PRIMARY_DNS="8.8.8.8"
fi

cat > /run/dnsmasq/resolv.conf << DNSEOF
nameserver $PRIMARY_DNS
nameserver 8.8.8.8
DNSEOF

echo "dnsmasq-init-resolv: DNS upstream configurado a $PRIMARY_DNS"
EOF
    chmod +x "$SCRIPTS_DIR/dnsmasq-init-resolv.sh"
}

# Create tmpfiles.d config for /run/dnsmasq
create_tmpfiles_config() {
    cat > /etc/tmpfiles.d/openpath-dnsmasq.conf << 'EOF'
# Create /run/dnsmasq directory on each boot
d /run/dnsmasq 0755 root root -
EOF
}

# Generate dnsmasq configuration
generate_dnsmasq_config() {
    log "Generating dnsmasq configuration..."
    
    local temp_conf="${DNSMASQ_CONF}.tmp"
    
    # Header with base config (NO date so hash is stable)
    cat > "$temp_conf" << EOF
# =============================================
# OpenPath - dnsmasq DNS Sinkhole v$VERSION
# =============================================

# Base configuration
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
max-cache-ttl=300
neg-ttl=60

# =============================================
# DEFAULT BLOCK (MUST BE FIRST)
# Everything not explicitly listed → NXDOMAIN
# =============================================
address=/#/

# =============================================
# ESSENTIAL DOMAINS (always allowed)
# Required for system operation
# =============================================

# Whitelist download (GitHub)
server=/raw.githubusercontent.com/${PRIMARY_DNS}
server=/github.com/${PRIMARY_DNS}
server=/githubusercontent.com/${PRIMARY_DNS}

# Captive portal detection
server=/detectportal.firefox.com/${PRIMARY_DNS}
server=/connectivity-check.ubuntu.com/${PRIMARY_DNS}
server=/captive.apple.com/${PRIMARY_DNS}
server=/www.msftconnecttest.com/${PRIMARY_DNS}
server=/clients3.google.com/${PRIMARY_DNS}

# NTP (time synchronization)
server=/ntp.ubuntu.com/${PRIMARY_DNS}
server=/time.google.com/${PRIMARY_DNS}

EOF
    
    # Add allowed domains from whitelist
    echo "# =============================================" >> "$temp_conf"
    echo "# WHITELIST DOMAINS (${#WHITELIST_DOMAINS[@]} domains)" >> "$temp_conf"
    echo "# =============================================" >> "$temp_conf"
    
    for domain in "${WHITELIST_DOMAINS[@]}"; do
        echo "server=/${domain}/${PRIMARY_DNS}" >> "$temp_conf"
    done
    
    echo "" >> "$temp_conf"
    
    # Add blocked subdomains (explicitly, just in case)
    if [ ${#BLOCKED_SUBDOMAINS[@]} -gt 0 ]; then
        echo "# Blocked subdomains (NXDOMAIN)" >> "$temp_conf"
        for blocked in "${BLOCKED_SUBDOMAINS[@]}"; do
            echo "address=/${blocked}/" >> "$temp_conf"
        done
        echo "" >> "$temp_conf"
    fi
    
    # Move to final location
    mv "$temp_conf" "$DNSMASQ_CONF"
    
    log "✓ dnsmasq configuration generated: ${#WHITELIST_DOMAINS[@]} domains + essentials"
}

# Validate dnsmasq configuration
validate_dnsmasq_config() {
    local output=$(dnsmasq --test 2>&1)
    if echo "$output" | grep -qi "syntax check OK\|sintaxis correcta"; then
        return 0
    else
        log "ERROR: Invalid dnsmasq configuration: $output"
        return 1
    fi
}

# Restart dnsmasq
restart_dnsmasq() {
    log "Restarting dnsmasq..."
    
    if ! validate_dnsmasq_config; then
        return 1
    fi
    
    if timeout 30 systemctl restart dnsmasq; then
        sleep 2
        if systemctl is-active --quiet dnsmasq; then
            log "✓ dnsmasq restarted successfully"
            return 0
        fi
    fi
    
    log "ERROR: Failed to restart dnsmasq"
    return 1
}

# Verify DNS is working
verify_dns() {
    if timeout 5 dig @127.0.0.1 google.com +short +time=3 >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Restore original DNS
restore_dns() {
    log "Restoring original DNS..."
    
    chattr -i /etc/resolv.conf 2>/dev/null || true
    
    if [ -f "$CONFIG_DIR/resolv.conf.symlink.backup" ]; then
        local target=$(cat "$CONFIG_DIR/resolv.conf.symlink.backup")
        ln -sf "$target" /etc/resolv.conf
    elif [ -f "$CONFIG_DIR/resolv.conf.backup" ]; then
        cp "$CONFIG_DIR/resolv.conf.backup" /etc/resolv.conf
    else
        cat > /etc/resolv.conf << EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF
    fi
    
    # Re-enable systemd-resolved
    systemctl enable systemd-resolved 2>/dev/null || true
    systemctl start systemd-resolved 2>/dev/null || true
    
    log "✓ DNS restored"
}
