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
# firewall.sh - Firewall management functions (iptables)
# Part of the OpenPath DNS system v3.5
################################################################################

# Activate restrictive firewall
activate_firewall() {
    log "Activating restrictive firewall..."
    
    # Validate primary DNS IP
    if ! validate_ip "$PRIMARY_DNS"; then
        log "⚠ DNS primario '$PRIMARY_DNS' inválido - usando 8.8.8.8"
        PRIMARY_DNS="8.8.8.8"
    fi
    
    # Detect gateway
    local GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)
    
    # Clear existing rules
    iptables -F OUTPUT 2>/dev/null || true
    
    # 1. Allow local traffic (loopback)
    iptables -A OUTPUT -o lo -j ACCEPT || true
    
    # 2. Allow established connections
    iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || true
    
    # 3. CRITICAL: Allow ICMP (ping) - needed for diagnostics and some portals
    iptables -A OUTPUT -p icmp -j ACCEPT || true
    
    # 4. Allow DHCP (IP renewal)
    iptables -A OUTPUT -p udp --dport 67:68 -j ACCEPT || true
    
    # 5. Allow DNS only to localhost (dnsmasq)
    iptables -A OUTPUT -p udp -d 127.0.0.1 --dport 53 -j ACCEPT || true
    iptables -A OUTPUT -p tcp -d 127.0.0.1 --dport 53 -j ACCEPT || true
    
    # 6. Allow DNS to upstream server (for dnsmasq)
    iptables -A OUTPUT -p udp -d "$PRIMARY_DNS" --dport 53 -j ACCEPT || true
    iptables -A OUTPUT -p tcp -d "$PRIMARY_DNS" --dport 53 -j ACCEPT || true

    # 7. If gateway is different from DNS, allow DNS to gateway too
    #    (some routers act as DNS)
    if [ -n "$GATEWAY" ] && [ "$GATEWAY" != "$PRIMARY_DNS" ]; then
        iptables -A OUTPUT -p udp -d "$GATEWAY" --dport 53 -j ACCEPT || true
        iptables -A OUTPUT -p tcp -d "$GATEWAY" --dport 53 -j ACCEPT || true
    fi
    
    # 8. Block DNS to any other server
    iptables -A OUTPUT -p udp --dport 53 -j DROP || true
    iptables -A OUTPUT -p tcp --dport 53 -j DROP || true
    
    # 9. Block DNS-over-TLS (DoT)
    iptables -A OUTPUT -p tcp --dport 853 -j DROP || true
    
    # 10. Block common VPNs
    iptables -A OUTPUT -p udp --dport 1194 -j DROP || true  # OpenVPN
    iptables -A OUTPUT -p udp --dport 51820 -j DROP || true # WireGuard
    iptables -A OUTPUT -p tcp --dport 1723 -j DROP || true  # PPTP
    
    # 11. Block Tor
    iptables -A OUTPUT -p tcp --dport 9001 -j DROP || true
    iptables -A OUTPUT -p tcp --dport 9030 -j DROP || true
    
    # 12. Allow HTTP/HTTPS (trust DNS sinkhole for enforcement)
    iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT || true
    iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT || true
    
    # 13. Allow NTP
    iptables -A OUTPUT -p udp --dport 123 -j ACCEPT || true
    
    # 14. Allow private networks (for local communication and captive portals)
    iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT || true
    iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT || true
    iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT || true
    
    # 15. Block everything else
    iptables -A OUTPUT -j DROP || true
    
    # Persist rules
    save_firewall_rules
    
    log "✓ Restrictive firewall activated (DNS: $PRIMARY_DNS, GW: $GATEWAY)"
}

# Deactivate firewall (permissive mode)
deactivate_firewall() {
    log "Deactivating firewall..."
    
    iptables -F OUTPUT 2>/dev/null || true
    iptables -P OUTPUT ACCEPT 2>/dev/null || true
    
    save_firewall_rules
    
    log "✓ Firewall deactivated (permissive mode)"
}

# Save firewall rules
save_firewall_rules() {
    if command -v iptables-save >/dev/null 2>&1; then
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
}

# Flush established connections (force reconnection)
flush_connections() {
    if command -v conntrack >/dev/null 2>&1; then
        conntrack -D -p tcp --dport 443 2>/dev/null || true
        conntrack -D -p tcp --dport 80 2>/dev/null || true
        log "✓ HTTP/HTTPS connections flushed"
    else
        log "⚠ conntrack not available"
    fi
}

# Flush dnsmasq DNS cache
flush_dns_cache() {
    if systemctl is-active --quiet dnsmasq; then
        pkill -HUP dnsmasq 2>/dev/null || true
        log "✓ DNS cache flushed"
    fi
}

# Check firewall status
check_firewall_status() {
    local rules=$(iptables -L OUTPUT -n 2>/dev/null | grep "DROP.*dpt:53" | wc -l)
    if [ "$rules" -ge 2 ]; then
        echo "active"
        return 0
    else
        echo "inactive"
        return 1
    fi
}
