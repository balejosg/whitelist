#!/bin/bash
################################################################################
# common.sh - Variables y funciones comunes
# Parte del sistema dnsmasq URL Whitelist v3.4
################################################################################

# Versión del sistema
VERSION="3.5"

# Directorios y archivos
INSTALL_DIR="/usr/local/lib/whitelist-system"
SCRIPTS_DIR="/usr/local/bin"
CONFIG_DIR="/var/lib/url-whitelist"
LOG_FILE="/var/log/url-whitelist.log"

# Archivos de configuración
DNSMASQ_CONF="/etc/dnsmasq.d/url-whitelist.conf"
DNSMASQ_CONF_HASH="$CONFIG_DIR/dnsmasq.hash"
BROWSER_POLICIES_HASH="$CONFIG_DIR/browser-policies.hash"
SYSTEM_DISABLED_FLAG="$CONFIG_DIR/system-disabled.flag"
WHITELIST_FILE="$CONFIG_DIR/whitelist.txt"
ORIGINAL_DNS_FILE="$CONFIG_DIR/original-dns.conf"

# Políticas de navegadores
FIREFOX_POLICIES="/etc/firefox/policies/policies.json"
CHROMIUM_POLICIES_BASE="/etc/chromium/policies/managed"

# URL por defecto
DEFAULT_WHITELIST_URL="https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/refs/heads/main/Informatica%203.txt"

# Variables globales (se inicializan en runtime)
PRIMARY_DNS=""
GATEWAY_IP=""
DNS_CHANGED=false

# Arrays para parsing de whitelist
WHITELIST_DOMAINS=()
BLOCKED_SUBDOMAINS=()
BLOCKED_PATHS=()

# Función de logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Crear directorios necesarios
init_directories() {
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$INSTALL_DIR/lib"
}

# Detectar DNS primario dinámicamente
detect_primary_dns() {
    local dns=""
    
    # 1. Intentar leer DNS guardado
    if [ -f "$ORIGINAL_DNS_FILE" ]; then
        local saved_dns=$(cat "$ORIGINAL_DNS_FILE" | head -1)
        if [ -n "$saved_dns" ] && timeout 5 dig @$saved_dns google.com +short >/dev/null 2>&1; then
            echo "$saved_dns"
            return 0
        fi
    fi
    
    # 2. NetworkManager
    if command -v nmcli >/dev/null 2>&1; then
        dns=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS\[1\]" | awk '{print $2}' | head -1)
        if [ -n "$dns" ] && timeout 5 dig @$dns google.com +short >/dev/null 2>&1; then
            echo "$dns"
            return 0
        fi
    fi
    
    # 3. systemd-resolved
    if [ -f /run/systemd/resolve/resolv.conf ]; then
        dns=$(grep "^nameserver" /run/systemd/resolve/resolv.conf | head -1 | awk '{print $2}')
        if [ -n "$dns" ] && [ "$dns" != "127.0.0.53" ]; then
            if timeout 5 dig @$dns google.com +short >/dev/null 2>&1; then
                echo "$dns"
                return 0
            fi
        fi
    fi
    
    # 4. Gateway como DNS
    local gw=$(ip route | grep default | awk '{print $3}' | head -1)
    if [ -n "$gw" ] && timeout 5 dig @$gw google.com +short >/dev/null 2>&1; then
        echo "$gw"
        return 0
    fi
    
    # 5. Fallback a Google DNS
    echo "8.8.8.8"
}

# Validar dirección IP
validate_ip() {
    local ip="$1"
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Verificar conectividad a internet
check_internet() {
    if timeout 10 curl -s http://detectportal.firefox.com/success.txt 2>/dev/null | grep -q "success"; then
        return 0
    fi
    if ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Parsear secciones del archivo whitelist
parse_whitelist_sections() {
    local file="$1"
    
    WHITELIST_DOMAINS=()
    BLOCKED_SUBDOMAINS=()
    BLOCKED_PATHS=()
    
    if [ ! -f "$file" ]; then
        log "Archivo whitelist no encontrado: $file"
        return 1
    fi
    
    local section=""
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Detectar secciones
        if [[ "$line" == "## WHITELIST" ]]; then
            section="whitelist"
            continue
        elif [[ "$line" == "## BLOCKED-SUBDOMAINS" ]]; then
            section="blocked_sub"
            continue
        elif [[ "$line" == "## BLOCKED-PATHS" ]]; then
            section="blocked_path"
            continue
        fi
        
        # Ignorar comentarios y líneas vacías
        [[ "$line" =~ ^#.*$ ]] && continue
        [[ -z "$line" ]] && continue
        
        # Asumir whitelist si no hay sección
        [ -z "$section" ] && section="whitelist"
        
        case "$section" in
            "whitelist")
                WHITELIST_DOMAINS+=("$line")
                ;;
            "blocked_sub")
                BLOCKED_SUBDOMAINS+=("$line")
                ;;
            "blocked_path")
                BLOCKED_PATHS+=("$line")
                ;;
        esac
    done < "$file"
    
    log "Parseado: ${#WHITELIST_DOMAINS[@]} dominios, ${#BLOCKED_SUBDOMAINS[@]} subdominios bloqueados, ${#BLOCKED_PATHS[@]} paths bloqueados"
}

# Verificar si el script se ejecuta como root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: Este script debe ejecutarse como root"
        exit 1
    fi
}

# Cargar todas las librerías
load_libraries() {
    local lib_dir="${1:-$INSTALL_DIR/lib}"
    
    for lib in dns.sh firewall.sh browser.sh services.sh; do
        if [ -f "$lib_dir/$lib" ]; then
            source "$lib_dir/$lib"
        fi
    done
}
