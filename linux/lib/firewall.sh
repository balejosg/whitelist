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
# firewall.sh - Funciones de gestión de firewall (iptables)
# Parte del sistema dnsmasq URL Whitelist v3.5
################################################################################

# Activar firewall restrictivo
activate_firewall() {
    log "Activando firewall restrictivo..."
    
    # Validar IP del DNS primario
    if ! validate_ip "$PRIMARY_DNS"; then
        log "⚠ DNS primario '$PRIMARY_DNS' inválido - usando 8.8.8.8"
        PRIMARY_DNS="8.8.8.8"
    fi
    
    # Detectar gateway
    local GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)
    
    # Limpiar reglas existentes
    iptables -F OUTPUT 2>/dev/null || true
    
    # 1. Permitir tráfico local (loopback)
    iptables -A OUTPUT -o lo -j ACCEPT || true
    
    # 2. Permitir conexiones establecidas
    iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || true
    
    # 3. CRÍTICO: Permitir ICMP (ping) - necesario para diagnóstico y algunos portales
    iptables -A OUTPUT -p icmp -j ACCEPT || true
    
    # 4. Permitir DHCP (renovación de IP)
    iptables -A OUTPUT -p udp --dport 67:68 -j ACCEPT || true
    
    # 5. Permitir DNS solo a localhost (dnsmasq)
    iptables -A OUTPUT -p udp -d 127.0.0.1 --dport 53 -j ACCEPT || true
    iptables -A OUTPUT -p tcp -d 127.0.0.1 --dport 53 -j ACCEPT || true
    
    # 6. Permitir DNS al servidor upstream (para dnsmasq)
    iptables -A OUTPUT -p udp -d $PRIMARY_DNS --dport 53 -j ACCEPT || true
    iptables -A OUTPUT -p tcp -d $PRIMARY_DNS --dport 53 -j ACCEPT || true
    
    # 7. Si el gateway es diferente al DNS, permitir DNS al gateway también
    #    (algunos routers actúan como DNS)
    if [ -n "$GATEWAY" ] && [ "$GATEWAY" != "$PRIMARY_DNS" ]; then
        iptables -A OUTPUT -p udp -d $GATEWAY --dport 53 -j ACCEPT || true
        iptables -A OUTPUT -p tcp -d $GATEWAY --dport 53 -j ACCEPT || true
    fi
    
    # 8. Bloquear DNS a cualquier otro servidor
    iptables -A OUTPUT -p udp --dport 53 -j DROP || true
    iptables -A OUTPUT -p tcp --dport 53 -j DROP || true
    
    # 9. Bloquear DNS-over-TLS (DoT)
    iptables -A OUTPUT -p tcp --dport 853 -j DROP || true
    
    # 10. Bloquear VPN comunes
    iptables -A OUTPUT -p udp --dport 1194 -j DROP || true  # OpenVPN
    iptables -A OUTPUT -p udp --dport 51820 -j DROP || true # WireGuard
    iptables -A OUTPUT -p tcp --dport 1723 -j DROP || true  # PPTP
    
    # 11. Bloquear Tor
    iptables -A OUTPUT -p tcp --dport 9001 -j DROP || true
    iptables -A OUTPUT -p tcp --dport 9030 -j DROP || true
    
    # 12. Permitir HTTP/HTTPS (confiamos en DNS Sinkhole)
    iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT || true
    iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT || true
    
    # 13. Permitir NTP
    iptables -A OUTPUT -p udp --dport 123 -j ACCEPT || true
    
    # 14. Permitir redes privadas (para comunicación local y portales cautivos)
    iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT || true
    iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT || true
    iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT || true
    
    # 15. Bloquear todo lo demás
    iptables -A OUTPUT -j DROP || true
    
    # Persistir reglas
    save_firewall_rules
    
    log "✓ Firewall restrictivo activado (DNS: $PRIMARY_DNS, GW: $GATEWAY)"
}

# Desactivar firewall (modo permisivo)
deactivate_firewall() {
    log "Desactivando firewall..."
    
    iptables -F OUTPUT 2>/dev/null || true
    iptables -P OUTPUT ACCEPT 2>/dev/null || true
    
    save_firewall_rules
    
    log "✓ Firewall desactivado (modo permisivo)"
}

# Guardar reglas de firewall
save_firewall_rules() {
    if command -v iptables-save >/dev/null 2>&1; then
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
}

# Limpiar conexiones establecidas (para forzar reconexión)
flush_connections() {
    if command -v conntrack >/dev/null 2>&1; then
        conntrack -D -p tcp --dport 443 2>/dev/null || true
        conntrack -D -p tcp --dport 80 2>/dev/null || true
        log "✓ Conexiones HTTP/HTTPS limpiadas"
    else
        log "⚠ conntrack no disponible"
    fi
}

# Flush caché DNS de dnsmasq
flush_dns_cache() {
    if systemctl is-active --quiet dnsmasq; then
        pkill -HUP dnsmasq 2>/dev/null || true
        log "✓ Caché DNS limpiado"
    fi
}

# Verificar estado del firewall
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
