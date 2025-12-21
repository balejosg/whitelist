#!/bin/bash
################################################################################
# captive-portal-detector.sh - Detector de portal cautivo
# Parte del sistema dnsmasq URL Whitelist v3.4
#
# Detecta si hay un portal cautivo (WiFi hotel, aeropuerto, etc.)
# y desactiva temporalmente el firewall para permitir autenticación
################################################################################

# Cargar librerías
INSTALL_DIR="/usr/local/lib/whitelist-system"
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/firewall.sh"

# Lock file compartido con dnsmasq-whitelist.sh
LOCK_FILE="/var/run/whitelist-update.lock"

# Configuración
CHECK_INTERVAL=30
CHECK_URL="http://detectportal.firefox.com/success.txt"
EXPECTED_RESPONSE="success"
CAPTIVE_PORTAL_DETECTED=false

# Verificar autenticación
check_authentication() {
    local response=$(timeout 5 curl -s -L "$CHECK_URL" 2>/dev/null | tr -d '\n\r')
    
    if [ "$response" = "$EXPECTED_RESPONSE" ]; then
        return 0  # Autenticado
    else
        return 1  # Portal cautivo detectado
    fi
}

# Modificar firewall con lock
modify_firewall_locked() {
    local action="$1"
    
    exec 200>"$LOCK_FILE"
    flock 200
    
    PRIMARY_DNS=$(detect_primary_dns)
    
    if [ "$action" = "activate" ]; then
        activate_firewall
    else
        deactivate_firewall
    fi
    
    flock -u 200
}

# Bucle principal
main() {
    log "[CAPTIVE] Iniciando detector de portal cautivo"
    
    while true; do
        if check_authentication; then
            if [ "$CAPTIVE_PORTAL_DETECTED" = true ]; then
                log "[CAPTIVE] Autenticación completada - reactivando firewall"
                modify_firewall_locked "activate"
                CAPTIVE_PORTAL_DETECTED=false
            fi
        else
            if [ "$CAPTIVE_PORTAL_DETECTED" = false ]; then
                log "[CAPTIVE] Portal cautivo detectado - desactivando firewall"
                modify_firewall_locked "deactivate"
                CAPTIVE_PORTAL_DETECTED=true
            fi
        fi
        
        sleep $CHECK_INTERVAL
    done
}

main "$@"
