#!/bin/bash
################################################################################
# install-native-host.sh - Instala el host de Native Messaging
# Parte del sistema Monitor de Bloqueos de Red
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Instalando Native Messaging Host...${NC}"
echo ""

# Verificar que existe el script
if [ ! -f "$SCRIPT_DIR/whitelist-native-host.py" ]; then
    echo -e "${RED}Error: whitelist-native-host.py no encontrado${NC}"
    exit 1
fi

# Instalar el script del host
echo "  → Instalando script en /usr/local/bin/..."
sudo cp "$SCRIPT_DIR/whitelist-native-host.py" /usr/local/bin/
sudo chmod +x /usr/local/bin/whitelist-native-host.py

# Crear directorio para manifests de usuario (sin sudo)
NATIVE_HOST_DIR="$HOME/.mozilla/native-messaging-hosts"
echo "  → Creando directorio $NATIVE_HOST_DIR..."
mkdir -p "$NATIVE_HOST_DIR"

# Instalar el manifest
echo "  → Instalando manifest de Native Messaging..."
cp "$SCRIPT_DIR/whitelist_native_host.json" "$NATIVE_HOST_DIR/"

# Crear archivo de log
echo "  → Configurando archivo de log..."
sudo touch /var/log/whitelist-native-host.log
sudo chmod 666 /var/log/whitelist-native-host.log

echo ""
echo -e "${GREEN}✓ Native Messaging Host instalado correctamente${NC}"
echo ""
echo "Para usar esta funcionalidad:"
echo "  1. Recarga la extensión en about:debugging"
echo "  2. El botón 'Verificar en Whitelist' estará disponible en el popup"
echo ""
