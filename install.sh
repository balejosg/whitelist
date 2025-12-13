#!/bin/bash
################################################################################
# install.sh - Instalador del sistema dnsmasq URL Whitelist v3.4
#
# Este script instala y configura el sistema completo de whitelist DNS.
# Divide la funcionalidad en módulos para mejor mantenibilidad.
#
# Uso:
#   sudo ./install.sh
#   sudo ./install.sh --whitelist-url "https://tu-url.com/whitelist.txt"
#   sudo ./install.sh --unattended  (modo desatendido)
#
################################################################################

set -e

VERSION="3.4"
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

while [[ $# -gt 0 ]]; do
    case $1 in
        --whitelist-url)
            WHITELIST_URL="$2"
            shift 2
            ;;
        --unattended)
            UNATTENDED=true
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
echo ""

# ============================================================================
# [1/11] INSTALAR LIBRERÍAS
# ============================================================================
echo "[1/11] Instalando librerías..."

mkdir -p "$INSTALL_DIR/lib"
mkdir -p "$CONFIG_DIR"

# Copiar librerías
cp "$SCRIPT_DIR/lib/common.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/dns.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/firewall.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/browser.sh" "$INSTALL_DIR/lib/"
cp "$SCRIPT_DIR/lib/services.sh" "$INSTALL_DIR/lib/"

chmod +x "$INSTALL_DIR/lib/"*.sh
echo "✓ Librerías instaladas"

# Cargar librerías
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/dns.sh"
source "$INSTALL_DIR/lib/firewall.sh"
source "$INSTALL_DIR/lib/browser.sh"
source "$INSTALL_DIR/lib/services.sh"

# ============================================================================
# [2/11] INSTALAR DEPENDENCIAS
# ============================================================================
echo ""
echo "[2/11] Instalando dependencias..."

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
# [3/11] LIBERAR PUERTO 53
# ============================================================================
echo ""
echo "[3/11] Liberando puerto 53..."

free_port_53
echo "✓ Puerto 53 liberado"

# ============================================================================
# [4/11] DETECTAR DNS
# ============================================================================
echo ""
echo "[4/11] Detectando DNS primario..."

PRIMARY_DNS=$(detect_primary_dns)
echo "$PRIMARY_DNS" > "$CONFIG_DIR/original-dns.conf"
echo "✓ DNS primario: $PRIMARY_DNS"

# ============================================================================
# [5/11] INSTALAR SCRIPTS
# ============================================================================
echo ""
echo "[5/11] Instalando scripts..."

# Script principal de actualización
cp "$SCRIPT_DIR/scripts/dnsmasq-whitelist.sh" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/dnsmasq-whitelist.sh"

# Script watchdog
cp "$SCRIPT_DIR/scripts/dnsmasq-watchdog.sh" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/dnsmasq-watchdog.sh"

# Script detector portal cautivo
cp "$SCRIPT_DIR/scripts/captive-portal-detector.sh" "$SCRIPTS_DIR/"
chmod +x "$SCRIPTS_DIR/captive-portal-detector.sh"

# Comando unificado
cp "$SCRIPT_DIR/scripts/whitelist-cmd.sh" "$SCRIPTS_DIR/whitelist"
chmod +x "$SCRIPTS_DIR/whitelist"

# Script de inicialización DNS
create_dns_init_script

# Guardar URL del whitelist
echo "$WHITELIST_URL" > "$CONFIG_DIR/whitelist-url.conf"

echo "✓ Scripts instalados"

# ============================================================================
# [6/11] CONFIGURAR SUDOERS PARA WHITELIST
# ============================================================================
echo ""
echo "[6/11] Configurando permisos sudo..."

cat > /etc/sudoers.d/whitelist << 'EOF'
# Permitir a todos los usuarios ejecutar comandos whitelist sin contraseña
ALL ALL=(root) NOPASSWD: /usr/local/bin/whitelist *
ALL ALL=(root) NOPASSWD: /usr/local/bin/dnsmasq-whitelist.sh
ALL ALL=(root) NOPASSWD: /usr/local/bin/dnsmasq-watchdog.sh
EOF

chmod 440 /etc/sudoers.d/whitelist

echo "✓ Permisos sudo configurados"

# ============================================================================
# [7/11] CREAR SERVICIOS SYSTEMD
# ============================================================================
echo ""
echo "[7/11] Creando servicios systemd..."

create_systemd_services
create_logrotate_config
create_tmpfiles_config

echo "✓ Servicios creados"

# ============================================================================
# [8/11] CONFIGURAR DNS
# ============================================================================
echo ""
echo "[8/11] Configurando DNS..."

configure_upstream_dns
configure_resolv_conf

echo "✓ DNS configurado"

# ============================================================================
# [9/11] CONFIGURACIÓN INICIAL DNSMASQ
# ============================================================================
echo ""
echo "[9/11] Configurando dnsmasq..."

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
# [10/11] APLICAR POLÍTICAS DE NAVEGADORES
# ============================================================================
echo ""
echo "[10/11] Aplicando políticas de navegadores..."

apply_search_engine_policies
echo "✓ Políticas aplicadas"

# ============================================================================
# [11/11] HABILITAR SERVICIOS Y PRIMERA EJECUCIÓN
# ============================================================================
echo ""
echo "[11/11] Habilitando servicios..."

enable_services

# Primera ejecución del whitelist
echo "Ejecutando primera actualización..."
"$SCRIPTS_DIR/dnsmasq-whitelist.sh" || echo "⚠ Primera actualización falló (el timer lo reintentará)"

echo "✓ Servicios habilitados"

# ============================================================================
# SMOKE TESTS POST-INSTALACIÓN
# ============================================================================

# Instalar script de smoke tests
if [ -f "$SCRIPT_DIR/scripts/smoke-test.sh" ]; then
    cp "$SCRIPT_DIR/scripts/smoke-test.sh" "$SCRIPTS_DIR/"
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
