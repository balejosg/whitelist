#!/bin/bash
################################################################################
# auto-reinstall-unattended.sh - Reinstalación 100% desatendida con password
#
# ⚠️  ADVERTENCIA DE SEGURIDAD ⚠️
# Este script contiene la contraseña de root en texto plano.
# SOLO PARA USO EDUCATIVO/DEMOSTRATIVO.
# NO usar en entornos de producción.
#
# Uso:
#   ./auto-reinstall-unattended.sh
#
# No requiere ejecutarse como root ni con sudo - lo hace automáticamente.
################################################################################

# Contraseña de root (⚠️ MALA PRÁCTICA - solo para fines educativos)
ROOT_PASSWORD="Encinas2023"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Auto Reinstall DESATENDIDO - Whitelist System${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  Script con contraseña hardcodeada${NC}"
echo -e "${YELLOW}⚠️  Solo para uso educativo/demostrativo${NC}"
echo ""

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Log file
LOG_FILE="/tmp/auto-reinstall-$(date +%Y%m%d-%H%M%S).log"

# Función para ejecutar comandos con sudo usando la contraseña
run_sudo() {
    echo "$ROOT_PASSWORD" | sudo -S "$@"
}

# Validar que los scripts existen
if [ ! -f "./uninstall.sh" ]; then
    echo -e "${RED}ERROR: ./uninstall.sh no encontrado${NC}"
    exit 1
fi

if [ ! -f "./install.sh" ]; then
    echo -e "${RED}ERROR: ./install.sh no encontrado${NC}"
    exit 1
fi

# Verificar que la contraseña es correcta
echo "Verificando credenciales..."
if ! echo "$ROOT_PASSWORD" | sudo -S -v 2>/dev/null; then
    echo -e "${RED}ERROR: Contraseña incorrecta${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Credenciales válidas${NC}"
echo ""

echo -e "${YELLOW}[1/2] Desinstalando sistema anterior...${NC}"
echo ""

# Ejecutar uninstall.sh en modo desatendido
# Continuamos aunque falle (puede no estar instalado)
echo "$ROOT_PASSWORD" | sudo -S bash ./uninstall.sh --unattended 2>&1 | tee -a "$LOG_FILE" || true

echo ""
echo -e "${YELLOW}[2/2] Instalando sistema nuevo...${NC}"
echo ""

# Asegurar que no hay procesos dnsmasq residuales
echo "Limpiando procesos residuales..."
run_sudo pkill -9 dnsmasq 2>/dev/null || true
sleep 1

# Verificar puerto 53
if ss -tulpn 2>/dev/null | grep -q ":53 "; then
    echo -e "${YELLOW}⚠ Puerto 53 ocupado, forzando liberación...${NC}"
    run_sudo fuser -k 53/udp 2>/dev/null || true
    run_sudo fuser -k 53/tcp 2>/dev/null || true
    sleep 1
fi

# Verificar que DNS funciona antes de instalar
echo "Verificando DNS antes de instalar..."
if ! timeout 10 nslookup google.com >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ DNS no responde, intentando reparar...${NC}"

    # Intentar reiniciar systemd-resolved
    run_sudo systemctl restart systemd-resolved 2>/dev/null || true
    sleep 2

    if run_sudo systemctl is-active --quiet systemd-resolved; then
        run_sudo rm -f /etc/resolv.conf 2>/dev/null || true
        run_sudo ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
    else
        # Usar Google DNS como último recurso para poder instalar
        echo -e "nameserver 8.8.8.8\nnameserver 8.8.4.4" | run_sudo tee /etc/resolv.conf > /dev/null
    fi

    # Verificar de nuevo
    if timeout 10 nslookup google.com >/dev/null 2>&1; then
        echo -e "${GREEN}✓ DNS reparado${NC}"
    else
        echo -e "${RED}✗ DNS sigue sin funcionar - la instalación puede fallar${NC}"
    fi
fi
echo ""

# Ejecutar install.sh en modo desatendido
echo "$ROOT_PASSWORD" | sudo -S bash ./install.sh --unattended 2>&1 | tee -a "$LOG_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}✓ Reinstalación completada exitosamente${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "Logs guardados en: $LOG_FILE"
    echo ""
    echo "Comandos útiles:"
    echo "  whitelist status  - Ver estado"
    echo "  whitelist test    - Probar DNS"
    echo "  whitelist logs    - Ver logs en tiempo real"
else
    echo ""
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}✗ Error durante la instalación${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    echo "Revisa los logs: $LOG_FILE"
    exit 1
fi
