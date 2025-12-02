#!/bin/bash
################################################################################
# whitelist - Comando unificado de gestión
# Parte del sistema dnsmasq URL Whitelist v3.4
################################################################################

# Cargar librerías
INSTALL_DIR="/usr/local/lib/whitelist-system"
source "$INSTALL_DIR/lib/common.sh" 2>/dev/null || {
    echo "ERROR: Sistema no instalado correctamente"
    exit 1
}

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Verificar root
require_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}ERROR: Requiere sudo${NC}"
        exit 1
    fi
}

# Mostrar estado
cmd_status() {
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Sistema dnsmasq URL Whitelist v$VERSION${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    
    echo -e "${YELLOW}Servicios:${NC}"
    for svc in dnsmasq dnsmasq-whitelist.timer dnsmasq-watchdog.timer captive-portal-detector; do
        if systemctl is-active --quiet $svc 2>/dev/null; then
            echo -e "  $svc: ${GREEN}● activo${NC}"
        else
            echo -e "  $svc: ${RED}● inactivo${NC}"
        fi
    done
    
    echo ""
    echo -e "${YELLOW}DNS:${NC}"
    if timeout 3 dig @127.0.0.1 google.com +short >/dev/null 2>&1; then
        echo -e "  Resolución: ${GREEN}● funcional${NC}"
    else
        echo -e "  Resolución: ${RED}● fallando${NC}"
    fi
    
    if [ -f /run/dnsmasq/resolv.conf ]; then
        local upstream=$(grep "^nameserver" /run/dnsmasq/resolv.conf | head -1 | awk '{print $2}')
        echo "  DNS upstream: $upstream"
    fi
    
    echo ""
    echo -e "${YELLOW}Whitelist:${NC}"
    if [ -f "$WHITELIST_FILE" ]; then
        local domains=$(grep -v "^#" "$WHITELIST_FILE" 2>/dev/null | grep -v "^$" | wc -l)
        echo "  Dominios: $domains"
    fi
    echo ""
}

# Forzar actualización
cmd_update() {
    require_root
    echo -e "${BLUE}Actualizando whitelist...${NC}"
    /usr/local/bin/dnsmasq-whitelist.sh
}

# Test DNS
cmd_test() {
    echo -e "${BLUE}Probando DNS...${NC}"
    echo ""
    
    for domain in google.com github.com duckduckgo.com; do
        echo -n "  $domain: "
        local result=$(timeout 3 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
        if [ -n "$result" ]; then
            echo -e "${GREEN}✓${NC} ($result)"
        else
            echo -e "${RED}✗${NC}"
        fi
    done
    echo ""
}

# Ver logs
cmd_logs() {
    tail -f "$LOG_FILE"
}

cmd_log() {
    local lines="${1:-50}"
    tail -n "$lines" "$LOG_FILE"
}

# Listar dominios
cmd_domains() {
    local filter="${1:-}"
    
    if [ ! -f "$WHITELIST_FILE" ]; then
        echo -e "${RED}Whitelist no encontrado${NC}"
        exit 1
    fi
    
    if [ -n "$filter" ]; then
        grep -i "$filter" "$WHITELIST_FILE" | grep -v "^#" | grep -v "^$" | sort
    else
        grep -v "^#" "$WHITELIST_FILE" | grep -v "^$" | sort
    fi
}

# Verificar dominio
cmd_check() {
    local domain="$1"
    [ -z "$domain" ] && { echo "Uso: whitelist check <dominio>"; exit 1; }
    
    echo -e "${BLUE}Verificando: $domain${NC}"
    echo ""
    
    if grep -qi "^${domain}$" "$WHITELIST_FILE" 2>/dev/null; then
        echo -e "  En whitelist: ${GREEN}✓ SÍ${NC}"
    else
        echo -e "  En whitelist: ${YELLOW}✗ NO${NC}"
    fi
    
    echo -n "  Resuelve: "
    local result=$(timeout 3 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
    if [ -n "$result" ]; then
        echo -e "${GREEN}✓${NC} → $result"
    else
        echo -e "${RED}✗${NC}"
    fi
    echo ""
}

# Health check
cmd_health() {
    require_root
    /usr/local/bin/dnsmasq-watchdog.sh
    echo ""
    if [ -f "$CONFIG_DIR/health-status" ]; then
        cat "$CONFIG_DIR/health-status"
    fi
}

# Forzar aplicación
cmd_force() {
    require_root
    source "$INSTALL_DIR/lib/firewall.sh"
    source "$INSTALL_DIR/lib/browser.sh"
    
    echo -e "${BLUE}Forzando aplicación de cambios...${NC}"
    echo -e "${YELLOW}Se cerrarán los navegadores${NC}"
    echo ""
    
    flush_connections
    flush_dns_cache
    force_browser_close
    
    echo -e "${GREEN}✓ Cambios aplicados${NC}"
}

# Habilitar
cmd_enable() {
    require_root
    source "$INSTALL_DIR/lib/services.sh"
    
    echo -e "${BLUE}Habilitando sistema...${NC}"
    enable_services
    /usr/local/bin/dnsmasq-whitelist.sh
}

# Deshabilitar
cmd_disable() {
    require_root
    source "$INSTALL_DIR/lib/firewall.sh"
    source "$INSTALL_DIR/lib/browser.sh"
    
    echo -e "${YELLOW}Deshabilitando sistema...${NC}"
    
    systemctl stop dnsmasq-whitelist.timer
    systemctl stop dnsmasq-watchdog.timer
    
    deactivate_firewall
    cleanup_browser_policies
    
    # dnsmasq passthrough
    cat > "$DNSMASQ_CONF" << EOF
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
server=$(cat "$ORIGINAL_DNS_FILE" 2>/dev/null | head -1 || echo "8.8.8.8")
EOF
    
    systemctl restart dnsmasq
    force_browser_close
    
    echo -e "${GREEN}✓ Sistema deshabilitado${NC}"
}

# Reiniciar
cmd_restart() {
    require_root
    echo -e "${BLUE}Reiniciando servicios...${NC}"
    
    systemctl restart dnsmasq
    systemctl restart dnsmasq-whitelist.timer
    systemctl restart dnsmasq-watchdog.timer
    systemctl restart captive-portal-detector.service 2>/dev/null || true
    
    sleep 2
    cmd_status
}

# Ayuda
cmd_help() {
    echo -e "${BLUE}whitelist - Gestión del sistema URL Whitelist v$VERSION${NC}"
    echo ""
    echo "Uso: whitelist <comando> [opciones]"
    echo ""
    echo "Comandos:"
    echo "  status          Estado del sistema"
    echo "  update          Forzar actualización (sudo)"
    echo "  test            Probar resolución DNS"
    echo "  logs            Ver logs en tiempo real"
    echo "  log [N]         Ver últimas N líneas del log"
    echo "  domains [texto] Listar dominios (filtrar opcional)"
    echo "  check <dominio> Verificar si dominio está permitido"
    echo "  health          Verificar salud del sistema (sudo)"
    echo "  force           Forzar aplicación de cambios (sudo)"
    echo "  enable          Habilitar sistema (sudo)"
    echo "  disable         Deshabilitar sistema (sudo)"
    echo "  restart         Reiniciar servicios (sudo)"
    echo "  help            Mostrar esta ayuda"
    echo ""
}

# Procesar comando
case "${1:-status}" in
    status)     cmd_status ;;
    update)     cmd_update ;;
    test)       cmd_test ;;
    logs)       cmd_logs ;;
    log)        cmd_log "$2" ;;
    domains)    cmd_domains "$2" ;;
    check)      cmd_check "$2" ;;
    health)     cmd_health ;;
    force)      cmd_force ;;
    enable)     cmd_enable ;;
    disable)    cmd_disable ;;
    restart)    cmd_restart ;;
    help|--help|-h) cmd_help ;;
    *)
        echo -e "${RED}Comando desconocido: $1${NC}"
        cmd_help
        exit 1
        ;;
esac
