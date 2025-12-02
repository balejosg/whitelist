#!/bin/bash
################################################################################
# dnsmasq-whitelist.sh - Script de actualización de whitelist
# Parte del sistema dnsmasq URL Whitelist v3.4
#
# Este script se ejecuta periódicamente (via timer) para:
# - Descargar el whitelist desde GitHub
# - Actualizar la configuración de dnsmasq
# - Aplicar políticas de navegadores
# - Detectar desactivación remota
################################################################################

# Lock file para evitar ejecuciones simultáneas
LOCK_FILE="/var/run/whitelist-update.lock"

# Cleanup en caso de salida (normal o error)
cleanup_lock() {
    rm -f "$LOCK_FILE" 2>/dev/null || true
}
trap cleanup_lock EXIT

# Obtener lock exclusivo (evita race conditions con captive-portal-detector)
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Otra instancia está ejecutándose, saliendo..."
    exit 0
fi

# Cargar librerías
INSTALL_DIR="/usr/local/lib/whitelist-system"
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/dns.sh"
source "$INSTALL_DIR/lib/firewall.sh"
source "$INSTALL_DIR/lib/browser.sh"

# URL del whitelist (leer de config si existe)
if [ -f "$CONFIG_DIR/whitelist-url.conf" ]; then
    WHITELIST_URL=$(cat "$CONFIG_DIR/whitelist-url.conf")
else
    WHITELIST_URL="${WHITELIST_URL:-$DEFAULT_WHITELIST_URL}"
fi

# Verificar si hay portal cautivo (sin autenticar)
check_captive_portal() {
    # Intentar conectar al detector de Firefox
    local response=$(timeout 5 curl -s -L "http://detectportal.firefox.com/success.txt" 2>/dev/null | tr -d '\n\r')
    
    if [ "$response" = "success" ]; then
        return 1  # NO hay portal cautivo (autenticado)
    else
        return 0  # HAY portal cautivo (no autenticado)
    fi
}

# Descargar whitelist
download_whitelist() {
    log "Descargando whitelist desde: $WHITELIST_URL"
    
    local temp_file="${WHITELIST_FILE}.tmp"
    
    if timeout 30 curl -L -f -s "$WHITELIST_URL" -o "$temp_file" 2>/dev/null; then
        if [ -s "$temp_file" ]; then
            mv "$temp_file" "$WHITELIST_FILE"
            log "✓ Whitelist descargado correctamente"
            return 0
        fi
    fi
    
    rm -f "$temp_file"
    log "⚠ Error al descargar whitelist"
    return 1
}

# Verificar desactivación remota
check_emergency_disable() {
    if [ -f "$WHITELIST_FILE" ]; then
        local first_line=$(grep -v '^[[:space:]]*$' "$WHITELIST_FILE" | head -n 1)
        if echo "$first_line" | grep -iq "^#.*DESACTIVADO"; then
            return 0
        fi
    fi
    return 1
}

# Limpiar sistema (modo fail-open)
cleanup_system() {
    log "=== Activando modo fail-open ==="
    
    # Limpiar firewall
    deactivate_firewall
    
    # Limpiar políticas de navegadores
    cleanup_browser_policies
    
    # dnsmasq en modo passthrough
    cat > "$DNSMASQ_CONF" << EOF
# MODO FAIL-OPEN - Sin restricciones
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
server=$PRIMARY_DNS
EOF
    
    systemctl restart dnsmasq 2>/dev/null || true
    
    # Cerrar navegadores
    force_browser_close
    
    log "=== Sistema en modo fail-open ==="
}

# Forzar aplicación de cambios
force_apply_changes() {
    log "Forzando aplicación de cambios..."
    
    flush_connections
    flush_dns_cache
    force_browser_close
    
    log "✓ Cambios aplicados"
}

# Verificar si la configuración cambió
has_config_changed() {
    if [ ! -f "$DNSMASQ_CONF_HASH" ]; then
        return 0
    fi
    
    local new_hash=$(md5sum "$DNSMASQ_CONF" 2>/dev/null | cut -d' ' -f1)
    local old_hash=$(cat "$DNSMASQ_CONF_HASH" 2>/dev/null)
    
    [ "$new_hash" != "$old_hash" ]
}

# Lógica principal
main() {
    log "=== Iniciando actualización de whitelist ==="
    
    # Inicializar
    init_directories
    PRIMARY_DNS=$(detect_primary_dns)
    
    # CRÍTICO: Verificar portal cautivo ANTES de cualquier cambio
    # Si hay portal cautivo, desactivar firewall y esperar
    if check_captive_portal; then
        log "⚠ Portal cautivo detectado - desactivando firewall para autenticación"
        deactivate_firewall
        # No continuar hasta que el usuario se autentique
        # El servicio captive-portal-detector.service se encargará de reactivar
        return 0
    fi
    
    # Descargar whitelist
    if download_whitelist; then
        # Verificar desactivación remota
        if check_emergency_disable; then
            log "=== SISTEMA DESACTIVADO REMOTAMENTE ==="
            cleanup_system
            return
        fi
    else
        log "⚠ Usando whitelist existente"
        # Si no podemos descargar Y no hay whitelist previo, modo fail-open
        if [ ! -f "$WHITELIST_FILE" ]; then
            log "⚠ Sin whitelist disponible - modo fail-open"
            cleanup_system
            return
        fi
    fi
    
    # Parsear secciones
    parse_whitelist_sections "$WHITELIST_FILE"
    
    # Generar configuración
    generate_dnsmasq_config
    
    # Generar políticas de navegadores
    generate_firefox_policies
    generate_chromium_policies
    
    # Aplicar cambios si es necesario
    if has_config_changed; then
        log "Detectados cambios en configuración..."
        
        if restart_dnsmasq; then
            # Guardar hash
            md5sum "$DNSMASQ_CONF" | cut -d' ' -f1 > "$DNSMASQ_CONF_HASH"
            
            # Verificar DNS
            if verify_dns; then
                log "✓ DNS funcional"
                activate_firewall
                force_apply_changes
            else
                log "⚠ DNS no funcional - modo permisivo"
                deactivate_firewall
            fi
        else
            log "ERROR: Fallo al reiniciar dnsmasq"
            cleanup_system
            return
        fi
    else
        log "Sin cambios en configuración"
        
        # Solo activar firewall si DNS funciona
        if verify_dns; then
            if [ "$(check_firewall_status)" != "active" ]; then
                log "Firewall no activo - reconfigurando..."
                activate_firewall
            fi
        else
            log "⚠ DNS no funcional - manteniendo firewall permisivo"
            deactivate_firewall
        fi
    fi
    
    log "=== Actualización completada ==="
}

main "$@"
