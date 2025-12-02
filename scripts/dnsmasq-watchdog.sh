#!/bin/bash
################################################################################
# dnsmasq-watchdog.sh - Watchdog para dnsmasq
# Parte del sistema dnsmasq URL Whitelist v3.4
#
# Verifica la salud del sistema y recupera automáticamente si hay problemas
################################################################################

# Cargar librerías
INSTALL_DIR="/usr/local/lib/whitelist-system"
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/dns.sh"

HEALTH_FILE="$CONFIG_DIR/health-status"
FAIL_COUNT_FILE="$CONFIG_DIR/watchdog-fails"
MAX_CONSECUTIVE_FAILS=3

# Obtener/incrementar contador de fallos
get_fail_count() {
    if [ -f "$FAIL_COUNT_FILE" ]; then
        cat "$FAIL_COUNT_FILE"
    else
        echo "0"
    fi
}

increment_fail_count() {
    local count=$(get_fail_count)
    echo $((count + 1)) > "$FAIL_COUNT_FILE"
}

reset_fail_count() {
    echo "0" > "$FAIL_COUNT_FILE"
}

# Verificaciones
check_dnsmasq_running() {
    systemctl is-active --quiet dnsmasq
}

check_dns_resolving() {
    timeout 5 dig @127.0.0.1 google.com +short +time=3 >/dev/null 2>&1
}

check_upstream_dns() {
    [ -s /run/dnsmasq/resolv.conf ]
}

check_resolv_conf() {
    grep -q "nameserver 127.0.0.1" /etc/resolv.conf 2>/dev/null
}

# Recuperaciones
recover_upstream_dns() {
    log "[WATCHDOG] Recuperando DNS upstream..."
    if [ -x "$SCRIPTS_DIR/dnsmasq-init-resolv.sh" ]; then
        "$SCRIPTS_DIR/dnsmasq-init-resolv.sh"
    else
        mkdir -p /run/dnsmasq
        local dns=$(cat "$ORIGINAL_DNS_FILE" 2>/dev/null | head -1)
        [ -z "$dns" ] && dns="8.8.8.8"
        echo "nameserver $dns" > /run/dnsmasq/resolv.conf
        echo "nameserver 8.8.8.8" >> /run/dnsmasq/resolv.conf
    fi
}

recover_resolv_conf() {
    log "[WATCHDOG] Recuperando /etc/resolv.conf..."
    chattr -i /etc/resolv.conf 2>/dev/null || true
    cat > /etc/resolv.conf << 'EOF'
nameserver 127.0.0.1
options edns0 trust-ad
search lan
EOF
    chattr +i /etc/resolv.conf 2>/dev/null || true
}

# Principal
main() {
    local status="OK"
    local actions=""
    local fail_count=$(get_fail_count)
    
    # Protección contra loop infinito de reinicios
    if [ "$fail_count" -ge "$MAX_CONSECUTIVE_FAILS" ]; then
        log "[WATCHDOG] ALERTA: $fail_count fallos consecutivos - entrando en modo fail-open"
        source "$INSTALL_DIR/lib/firewall.sh"
        deactivate_firewall
        
        # Guardar estado
        cat > "$HEALTH_FILE" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "status": "FAIL_OPEN",
    "message": "Demasiados fallos consecutivos - sistema en modo permisivo",
    "fail_count": $fail_count
}
EOF
        # No resetear contador - requiere intervención manual
        return 1
    fi
    
    # Check 1: dnsmasq running
    if ! check_dnsmasq_running; then
        status="CRITICAL"
        actions="dnsmasq_restart"
        log "[WATCHDOG] CRÍTICO: dnsmasq no está corriendo"
    fi
    
    # Check 2: upstream DNS config
    if ! check_upstream_dns; then
        [ "$status" = "OK" ] && status="WARNING"
        actions="$actions upstream_dns"
        log "[WATCHDOG] ADVERTENCIA: /run/dnsmasq/resolv.conf no existe"
    fi
    
    # Check 3: resolv.conf
    if ! check_resolv_conf; then
        [ "$status" = "OK" ] && status="WARNING"
        actions="$actions resolv_conf"
        log "[WATCHDOG] ADVERTENCIA: /etc/resolv.conf no apunta a localhost"
    fi
    
    # Ejecutar recuperaciones
    if [ -n "$actions" ]; then
        log "[WATCHDOG] Iniciando recuperación: $actions"
        
        for action in $actions; do
            case "$action" in
                upstream_dns)
                    recover_upstream_dns
                    ;;
                resolv_conf)
                    recover_resolv_conf
                    ;;
                dnsmasq_restart)
                    recover_upstream_dns
                    recover_resolv_conf
                    systemctl restart dnsmasq
                    sleep 3
                    if check_dnsmasq_running; then
                        log "[WATCHDOG] ✓ dnsmasq reiniciado"
                        status="RECOVERED"
                    else
                        status="FAILED"
                        increment_fail_count
                    fi
                    ;;
            esac
        done
    fi
    
    # Si todo OK, resetear contador de fallos
    if [ "$status" = "OK" ] || [ "$status" = "RECOVERED" ]; then
        reset_fail_count
    fi
    
    # Guardar estado
    cat > "$HEALTH_FILE" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "status": "$status",
    "dnsmasq_running": $(check_dnsmasq_running && echo "true" || echo "false"),
    "dns_resolving": $(check_dns_resolving && echo "true" || echo "false"),
    "fail_count": $(get_fail_count),
    "actions": "$actions"
}
EOF
    
    [ "$status" = "OK" ] || [ "$status" = "RECOVERED" ]
}

main "$@"
