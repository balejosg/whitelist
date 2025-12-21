#!/bin/bash
################################################################################
# install.sh - Instalador del sistema dnsmasq URL Whitelist v3.5
#
# Este script instala y configura el sistema completo de whitelist DNS.
# Divide la funcionalidad en módulos para mejor mantenibilidad.
#
# Uso:
#   sudo ./install.sh
#   sudo ./install.sh --whitelist-url "https://tu-url.com/whitelist.txt"
#   sudo ./install.sh --unattended  (modo desatendido)
#   sudo ./install.sh --no-extension  (sin extensión Firefox)
#   sudo ./install.sh --with-native-host  (incluir native messaging)
#
################################################################################

set -e

VERSION="3.5"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Directorios de instalación
INSTALL_DIR="/usr/local/lib/whitelist-system"
SCRIPTS_DIR="/usr/local/bin"
CONFIG_DIR="/var/lib/url-whitelist"

# URL por defecto
DEFAULT_WHITELIST_URL="https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/refs/heads/main/Informatica%203.txt"

# Procesar argumentos
WHITELIST_URL="$DEFAULT_WHITELIST_URL"
UNATTENDED=false
INSTALL_EXTENSION=true
INSTALL_NATIVE_HOST=false
HEALTH_API_URL=""
HEALTH_API_SECRET=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --whitelist-url|--url)
            WHITELIST_URL="$2"
            shift 2
            ;;
        --health-api-url)
            HEALTH_API_URL="$2"
            shift 2
            ;;
        --health-api-secret)
            HEALTH_API_SECRET="$2"
            shift 2
            ;;
        --unattended)
            UNATTENDED=true
            shift
            ;;
        --no-extension)
            INSTALL_EXTENSION=false
            shift
            ;;
        --with-native-host)
            INSTALL_NATIVE_HOST=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Auto-elevación con sudo
if [ "$EUID" -ne 0 ]; then
    echo "Elevando permisos con sudo..."
    exec sudo "$0" "$@"
fi

echo "======================================================"
echo "  dnsmasq URL Whitelist System v$VERSION - Instalación"
echo "======================================================"
echo ""
echo "URL Whitelist: $WHITELIST_URL"
echo "Extensión Firefox: $INSTALL_EXTENSION"
echo ""

# ============================================================================
# [1/13] INSTALAR LIBRERÍAS
# ============================================================================
echo "[1/13] Instalando librerías..."

mkdir -p "$INSTALL_DIR/lib"
mkdir -p "$CONFIG_DIR"

# Copiar librerías
cp "$SCRIPT_DIR/lib/common.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/dns.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/firewall.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/browser.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/services.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/rollback.sh" "$INSTALL_DIR/lib/"

chmod +x "$INSTALL_DIR/lib/"*.sh
echo "✓ Librerías instaladas"

# Cargar librerías
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/dns.sh"
source "$INSTALL_DIR/lib/firewall.sh"
source "$INSTALL_DIR/lib/browser.sh"
source "$INSTALL_DIR/lib/services.sh"

# ============================================================================
# [2/13] INSTALAR DEPENDENCIAS
# ============================================================================
echo ""
echo "[2/13] Instalando dependencias..."

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    iptables iptables-persistent ipset curl \
    libcap2-bin dnsutils conntrack python3 >/dev/null

# Instalar dnsmasq sin iniciarlo
RUNLEVEL=1 apt-get install -y dnsmasq >/dev/null

# Evitar conflicto con resolvconf
if [ -d /etc/default ]; then
    grep -q "IGNORE_RESOLVCONF" /etc/default/dnsmasq 2>/dev/null || \
        echo "IGNORE_RESOLVCONF=yes" >> /etc/default/dnsmasq
fi

# Dar capacidades a dnsmasq
setcap 'cap_net_bind_service,cap_net_admin=+ep' /usr/sbin/dnsmasq 2>/dev/null || true

echo "✓ Dependencias instaladas"

# ============================================================================
# [3/13] LIBERAR PUERTO 53
# ============================================================================
echo ""
echo "[3/13] Liberando puerto 53..."

free_port_53
echo "✓ Puerto 53 liberado"

# ============================================================================
# [4/13] DETECTAR DNS
# ============================================================================
echo ""
echo "[4/13] Detectando DNS primario..."

PRIMARY_DNS=$(detect_primary_dns)
echo "$PRIMARY_DNS" > "$CONFIG_DIR/original-dns.conf"
echo "✓ DNS primario: $PRIMARY_DNS"

# ============================================================================
# [5/13] INSTALAR SCRIPTS
# ============================================================================
echo ""
echo "[5/13] Instalando scripts..."

# Script principal de actualización
cp "$SCRIPT_DIR/scripts/runtime/dnsmasq-whitelist.sh" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/dnsmasq-whitelist.sh"

# Script watchdog
cp "$SCRIPT_DIR/scripts/runtime/dnsmasq-watchdog.sh" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/dnsmasq-watchdog.sh"

# Script detector portal cautivo
cp "$SCRIPT_DIR/scripts/runtime/captive-portal-detector.sh" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/captive-portal-detector.sh"

# Comando unificado
cp "$SCRIPT_DIR/scripts/runtime/whitelist-cmd.sh" "$SCRIPTS_DIR/whitelist"
chmod +x "$SCRIPTS_DIR/whitelist"

# Script de inicialización DNS
create_dns_init_script

# Create config directory (Debian FHS compliant)
mkdir -p "$ETC_CONFIG_DIR"

# Guardar URL del whitelist
echo "$WHITELIST_URL" > "$WHITELIST_URL_CONF"

# Guardar configuración de health API (para monitoreo centralizado)
if [ -n "$HEALTH_API_URL" ]; then
    echo "$HEALTH_API_URL" > "$HEALTH_API_URL_CONF"
    echo "  → Health API URL configurada"
fi
if [ -n "$HEALTH_API_SECRET" ]; then
    echo "$HEALTH_API_SECRET" > "$HEALTH_API_SECRET_CONF"
    chmod 600 "$HEALTH_API_SECRET_CONF"
    echo "  → Health API secret configurado"
fi

echo "✓ Scripts instalados"

# ============================================================================
# [6/13] CONFIGURAR SUDOERS PARA WHITELIST
# ============================================================================
echo ""
echo "[6/13] Configurando permisos sudo..."

cat > /etc/sudoers.d/whitelist << 'EOF'
# Permitir a todos los usuarios ejecutar comandos whitelist sin contraseña
ALL ALL=(root) NOPASSWD: /usr/local/bin/whitelist *
ALL ALL=(root) NOPASSWD: /usr/local/bin/dnsmasq-whitelist.sh
ALL ALL=(root) NOPASSWD: /usr/local/bin/dnsmasq-watchdog.sh
EOF

chmod 440 /etc/sudoers.d/whitelist

echo "✓ Permisos sudo configurados"

# ============================================================================
# [7/13] CREAR SERVICIOS SYSTEMD
# ============================================================================
echo ""
echo "[7/13] Creando servicios systemd..."

create_systemd_services
create_logrotate_config
create_tmpfiles_config

echo "✓ Servicios creados"

# ============================================================================
# [8/13] CONFIGURAR DNS
# ============================================================================
echo ""
echo "[8/13] Configurando DNS..."

configure_upstream_dns
configure_resolv_conf

echo "✓ DNS configurado"

# ============================================================================
# [9/13] CONFIGURACIÓN INICIAL DNSMASQ
# ============================================================================
echo ""
echo "[9/13] Configurando dnsmasq..."

# Comentar directivas conflictivas en /etc/dnsmasq.conf para evitar duplicados
if [ -f /etc/dnsmasq.conf ]; then
    sed -i 's/^no-resolv/#no-resolv/g' /etc/dnsmasq.conf 2>/dev/null || true
    sed -i 's/^cache-size=/#cache-size=/g' /etc/dnsmasq.conf 2>/dev/null || true
fi

# Configuración inicial permisiva
cat > /etc/dnsmasq.d/url-whitelist.conf << EOF
# Configuración inicial - será sobrescrita por dnsmasq-whitelist.sh
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
server=$PRIMARY_DNS
EOF

# Reiniciar dnsmasq
systemctl restart dnsmasq
sleep 2

if systemctl is-active --quiet dnsmasq; then
    echo "✓ dnsmasq activo"
else
    echo "✗ ERROR: dnsmasq no arrancó"
    journalctl -u dnsmasq -n 10 --no-pager
    exit 1
fi

# ============================================================================
# [10/13] INSTALAR FIREFOX ESR
# ============================================================================
echo ""
echo "[10/13] Instalando Firefox ESR..."

install_firefox_esr
echo "✓ Firefox ESR instalado"

# ============================================================================
# [11/13] APLICAR POLÍTICAS DE NAVEGADORES
# ============================================================================
echo ""
echo "[11/13] Aplicando políticas de navegadores..."

apply_search_engine_policies
echo "✓ Políticas aplicadas"

# ============================================================================
# [12/13] INSTALAR EXTENSIÓN FIREFOX
# ============================================================================
echo ""
echo "[12/13] Instalando extensión Firefox..."

if [ "$INSTALL_EXTENSION" = true ]; then
    install_firefox_extension "$SCRIPT_DIR/firefox-extension"
    if [ "$INSTALL_NATIVE_HOST" = true ]; then
        install_native_host "$SCRIPT_DIR/firefox-extension/native"
    fi
    echo "✓ Extensión Firefox instalada"
else
    echo "⊘ Extensión Firefox omitida (--no-extension)"
fi

# ============================================================================
# [13/13] HABILITAR SERVICIOS Y PRIMERA EJECUCIÓN
# ============================================================================
echo ""
echo "[13/13] Habilitando servicios..."

enable_services

# Primera ejecución del whitelist
echo "Ejecutando primera actualización..."
"$SCRIPTS_DIR/dnsmasq-whitelist.sh" || echo "⚠ Primera actualización falló (el timer lo reintentará)"

echo "✓ Servicios habilitados"

# ============================================================================
# SMOKE TESTS POST-INSTALACIÓN
# ============================================================================

# Instalar script de smoke tests
if [ -f "$SCRIPT_DIR/scripts/runtime/smoke-test.sh" ]; then
    cp "$SCRIPT_DIR/scripts/runtime/smoke-test.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/smoke-test.sh"
fi

echo ""
echo "Ejecutando smoke tests..."
if "$SCRIPTS_DIR/smoke-test.sh" --quick 2>/dev/null; then
    SMOKE_STATUS="PASSED"
else
    SMOKE_STATUS="FAILED"
fi

# ============================================================================
# RESUMEN FINAL
# ============================================================================
echo ""
echo "======================================================"
echo "  ✓ INSTALACIÓN COMPLETADA"
echo "======================================================"
echo ""
echo "Estado:"
echo "  - dnsmasq: $(systemctl is-active dnsmasq)"
echo "  - Timer: $(systemctl is-active dnsmasq-whitelist.timer)"
echo "  - Watchdog: $(systemctl is-active dnsmasq-watchdog.timer)"
echo "  - Smoke Tests: $SMOKE_STATUS"
echo ""
echo "Configuración:"
echo "  - Whitelist: $WHITELIST_URL"
echo "  - DNS upstream: $PRIMARY_DNS"
echo ""
echo "Comando de gestión: whitelist"
echo "  whitelist status  - Ver estado"
echo "  whitelist test    - Probar DNS"
echo "  whitelist update  - Forzar actualización"
echo "  whitelist help    - Ver ayuda completa"
echo ""
echo "Tests manuales:"
echo "  sudo smoke-test.sh        - Ejecutar smoke tests completos"
echo "  sudo smoke-test.sh --quick - Solo tests críticos"
echo ""
echo "Desinstalar: sudo $SCRIPT_DIR/uninstall.sh"
echo ""
