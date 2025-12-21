#!/bin/bash
################################################################################
# dns.sh - Funciones de gestión DNS
# Parte del sistema OpenPath DNS v3.5
################################################################################

# Liberar puerto 53 (detener systemd-resolved)
free_port_53() {
    log "Liberando puerto 53..."
    
    # Detener socket y servicio de systemd-resolved
    systemctl stop systemd-resolved.socket 2>/dev/null || true
    systemctl disable systemd-resolved.socket 2>/dev/null || true
    systemctl stop systemd-resolved 2>/dev/null || true
    systemctl disable systemd-resolved 2>/dev/null || true
    
    # Esperar a que el puerto se libere
    local retries=30
    while [ $retries -gt 0 ]; do
        if ! ss -tulpn 2>/dev/null | grep -q ":53 "; then
            log "✓ Puerto 53 liberado"
            return 0
        fi
        sleep 1
        retries=$((retries - 1))
    done
    
    log "⚠ Puerto 53 aún ocupado después de 30 segundos"
    return 1
}

# Configurar /etc/resolv.conf para usar dnsmasq local
configure_resolv_conf() {
    log "Configurando /etc/resolv.conf..."
    
    # Desproteger si está protegido
    chattr -i /etc/resolv.conf 2>/dev/null || true
    
    # Backup si es symlink
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
    
    # Proteger contra sobrescritura
    chattr +i /etc/resolv.conf 2>/dev/null || true
    
    log "✓ /etc/resolv.conf configurado"
}

# Configurar DNS upstream para dnsmasq
configure_upstream_dns() {
    log "Configurando DNS upstream..."
    
    # Crear directorio
    mkdir -p /run/dnsmasq
    
    # Detectar DNS primario
    PRIMARY_DNS=$(detect_primary_dns)
    
    # Guardar para futuras referencias
    echo "$PRIMARY_DNS" > "$ORIGINAL_DNS_FILE"
    
    # Crear resolv.conf para dnsmasq
    cat > /run/dnsmasq/resolv.conf << EOF
# DNS upstream para dnsmasq
nameserver $PRIMARY_DNS
nameserver 8.8.8.8
EOF
    
    log "✓ DNS upstream configurado: $PRIMARY_DNS"
}

# Crear script de inicialización de DNS upstream
create_dns_init_script() {
    cat > "$SCRIPTS_DIR/dnsmasq-init-resolv.sh" << 'EOF'
#!/bin/bash
# Regenera /run/dnsmasq/resolv.conf en cada arranque

mkdir -p /run/dnsmasq

# Leer DNS guardado
if [ -f /var/lib/openpath/original-dns.conf ]; then
    PRIMARY_DNS=$(cat /var/lib/openpath/original-dns.conf | head -1)
else
    # Detectar vía NetworkManager
    if command -v nmcli >/dev/null 2>&1; then
        PRIMARY_DNS=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS\[1\]" | awk '{print $2}' | head -1)
    fi
    # Fallback a gateway
    [ -z "$PRIMARY_DNS" ] && PRIMARY_DNS=$(ip route | grep default | awk '{print $3}' | head -1)
    # Fallback absoluto
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

# Crear configuración tmpfiles.d para /run/dnsmasq
create_tmpfiles_config() {
    cat > /etc/tmpfiles.d/openpath-dnsmasq.conf << 'EOF'
# Crear directorio /run/dnsmasq en cada arranque
d /run/dnsmasq 0755 root root -
EOF
}

# Generar configuración de dnsmasq
generate_dnsmasq_config() {
    log "Generando configuración de dnsmasq..."
    
    local temp_conf="${DNSMASQ_CONF}.tmp"
    
    # Cabecera con configuración base (SIN fecha para que el hash sea estable)
    cat > "$temp_conf" << EOF
# =============================================
# OpenPath - dnsmasq DNS Sinkhole v$VERSION
# =============================================

# Configuración base
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
max-cache-ttl=300
neg-ttl=60

# =============================================
# BLOQUEO POR DEFECTO (DEBE IR PRIMERO)
# Todo lo no listado explícitamente → NXDOMAIN
# =============================================
address=/#/

# =============================================
# DOMINIOS ESENCIALES (siempre permitidos)
# Necesarios para el funcionamiento del sistema
# =============================================

# Descarga de whitelist (GitHub)
server=/raw.githubusercontent.com/${PRIMARY_DNS}
server=/github.com/${PRIMARY_DNS}
server=/githubusercontent.com/${PRIMARY_DNS}

# Detección de portal cautivo
server=/detectportal.firefox.com/${PRIMARY_DNS}
server=/connectivity-check.ubuntu.com/${PRIMARY_DNS}
server=/captive.apple.com/${PRIMARY_DNS}
server=/www.msftconnecttest.com/${PRIMARY_DNS}
server=/clients3.google.com/${PRIMARY_DNS}

# NTP (sincronización de hora)
server=/ntp.ubuntu.com/${PRIMARY_DNS}
server=/time.google.com/${PRIMARY_DNS}

EOF
    
    # Añadir dominios permitidos del whitelist
    echo "# =============================================" >> "$temp_conf"
    echo "# DOMINIOS DEL WHITELIST (${#WHITELIST_DOMAINS[@]} dominios)" >> "$temp_conf"
    echo "# =============================================" >> "$temp_conf"
    
    for domain in "${WHITELIST_DOMAINS[@]}"; do
        echo "server=/${domain}/${PRIMARY_DNS}" >> "$temp_conf"
    done
    
    echo "" >> "$temp_conf"
    
    # Añadir subdominios bloqueados (explícitamente, por si acaso)
    if [ ${#BLOCKED_SUBDOMAINS[@]} -gt 0 ]; then
        echo "# Subdominios bloqueados (NXDOMAIN)" >> "$temp_conf"
        for blocked in "${BLOCKED_SUBDOMAINS[@]}"; do
            echo "address=/${blocked}/" >> "$temp_conf"
        done
        echo "" >> "$temp_conf"
    fi
    
    # Mover a ubicación final
    mv "$temp_conf" "$DNSMASQ_CONF"
    
    log "✓ Configuración de dnsmasq generada: ${#WHITELIST_DOMAINS[@]} dominios + esenciales"
}

# Validar configuración de dnsmasq
validate_dnsmasq_config() {
    local output=$(dnsmasq --test 2>&1)
    if echo "$output" | grep -qi "syntax check OK\|sintaxis correcta"; then
        return 0
    else
        log "ERROR: Configuración de dnsmasq inválida: $output"
        return 1
    fi
}

# Reiniciar dnsmasq
restart_dnsmasq() {
    log "Reiniciando dnsmasq..."
    
    if ! validate_dnsmasq_config; then
        return 1
    fi
    
    if timeout 30 systemctl restart dnsmasq; then
        sleep 2
        if systemctl is-active --quiet dnsmasq; then
            log "✓ dnsmasq reiniciado correctamente"
            return 0
        fi
    fi
    
    log "ERROR: Fallo al reiniciar dnsmasq"
    return 1
}

# Verificar que DNS funciona
verify_dns() {
    if timeout 5 dig @127.0.0.1 google.com +short +time=3 >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Restaurar DNS original
restore_dns() {
    log "Restaurando DNS original..."
    
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
    
    # Re-habilitar systemd-resolved
    systemctl enable systemd-resolved 2>/dev/null || true
    systemctl start systemd-resolved 2>/dev/null || true
    
    log "✓ DNS restaurado"
}
