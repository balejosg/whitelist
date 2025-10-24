#!/bin/bash

################################################################################
# Script de Instalación: dnsmasq URL Whitelist System
#
# Este script instala y configura el sistema de whitelist de URLs basado en dnsmasq
# para controlar el acceso a internet en sistemas Ubuntu/Debian.
#
# Uso: sudo ./setup-dnsmasq-whitelist.sh
#
# Características:
# - Whitelist basada en archivo remoto (GitHub Gist)
# - Actualización cada 5 minutos
# - Fail-open: si el servidor no es alcanzable, no se aplican restricciones
# - Aplicable a todos los usuarios del sistema
# - Soluciona el problema de IPs dinámicas usando dnsmasq + ipset
#
################################################################################

set -e

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Este script debe ejecutarse como root (usar sudo)"
    exit 1
fi

echo "======================================================"
echo "  dnsmasq URL Whitelist System - Instalación"
echo "======================================================"
echo ""

# Detectar puerta de enlace (gateway)
GATEWAY_IP=$(ip route | grep default | awk '{print $3}' | head -n 1)
if [ -z "$GATEWAY_IP" ]; then
    echo "ERROR: No se pudo detectar la puerta de enlace (gateway) automáticamente."
    read -p "Por favor, introduce la IP de tu router/gateway: " GATEWAY_IP
    if [ -z "$GATEWAY_IP" ]; then
        echo "ERROR: No se proporcionó IP. Saliendo."
        exit 1
    fi
fi
echo "Puerta de enlace a usar: $GATEWAY_IP"

# Detectar distribución
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    echo "Distribución detectada: $PRETTY_NAME"
else
    echo "ERROR: No se pudo detectar la distribución del sistema"
    exit 1
fi

# Instalar dependencias
echo ""
echo "[1/8] Instalando dependencias..."
apt-get update -qq
apt-get install -y ipset iptables curl dnsmasq libcap2-bin

# Dar capacidades a dnsmasq para modificar ipset
echo ""
echo "[2/8] Configurando capacidades de dnsmasq..."
setcap 'cap_net_admin=+ep' /usr/sbin/dnsmasq
echo "dnsmasq puede ahora modificar ipset (CAP_NET_ADMIN)"

# Configurar systemd-resolved para liberar el puerto 53
echo ""
echo "[3/8] Configurando systemd-resolved..."
if systemctl is-active --quiet systemd-resolved; then
    # Deshabilitar DNSStubListener
    sed -i 's/#DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
    sed -i 's/DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf

    # Configurar DNS upstream (el router)
    if ! grep -q "^DNS=" /etc/systemd/resolved.conf; then
        sed -i "s/#DNS=/DNS=$GATEWAY_IP/" /etc/systemd/resolved.conf
    fi

    systemctl restart systemd-resolved
    echo "systemd-resolved configurado"
fi

# Crear script principal
echo ""
echo "[4/8] Creando script principal dnsmasq-whitelist.sh..."
cat > /usr/local/bin/dnsmasq-whitelist.sh << 'SCRIPT_EOF'
#!/bin/bash

#############################################
# dnsmasq Whitelist Manager
# Descarga whitelist desde GitHub Gist y configura dnsmasq
# Comportamiento: Fail-Open (si no se puede descargar, no restringe)
#############################################

set -e

# Configuración
WHITELIST_URL="https://gist.githubusercontent.com/balejosg/9a81340e7e7bfd044cc031f41af6acdc/raw/0b0a2339e8eb513dde8197cdc3eab487abd5f3cf/whitelist.txt"
WHITELIST_FILE="/var/lib/url-whitelist/whitelist.txt"
WHITELIST_HASH="/var/lib/url-whitelist/whitelist.hash"
DNSMASQ_CONF="/etc/dnsmasq.d/url-whitelist.conf"
DNSMASQ_CONF_HASH="/var/lib/url-whitelist/dnsmasq.hash"
LOG_FILE="/var/log/url-whitelist.log"
IPSET_NAME="url_whitelist"

# URLs base (hardcoded) - necesarias para bootstrap y operación básica
BASE_URLS=(
    "google.es"
    "www.google.es"
    "github.com"
    "gist.githubusercontent.com"
    "nce.wedu.comunidad.madrid"
    "archive.ubuntu.com"
    "security.ubuntu.com"
    "max.educa.madrid.org"
    "deb.nodesource.com"
    "anthropic.com"
    "api.anthropic.com"
    "www.anthropic.com"
    "claude.ai"
)

# Función de logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Crear directorios necesarios
mkdir -p /var/lib/url-whitelist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p /etc/dnsmasq.d

log "=== Iniciando actualización de whitelist (dnsmasq) ==="

# Función para limpiar reglas de firewall (fail-open)
cleanup_firewall() {
    log "Limpiando sistema - Acceso libre a internet"

    # Detener dnsmasq
    systemctl stop dnsmasq 2>/dev/null || true

    # Destruir ipset si existe
    ipset destroy "$IPSET_NAME" 2>/dev/null || true

    # Limpiar TODAS las reglas de la cadena OUTPUT
    iptables -F OUTPUT 2>/dev/null || true

    # Eliminar configuración dnsmasq
    rm -f "$DNSMASQ_CONF"

    log "Sistema limpiado - Sin restricciones activas"
}

# Función para descargar archivo de whitelist
download_whitelist() {
    log "Intentando descargar whitelist desde GitHub Gist..."

    # Intentar descargar con timeout de 30 segundos
    if timeout 30 curl -L -f -s "$WHITELIST_URL" -o "${WHITELIST_FILE}.tmp" 2>/dev/null; then
        # Verificar que el archivo no esté vacío
        if [ -s "${WHITELIST_FILE}.tmp" ]; then
            mv "${WHITELIST_FILE}.tmp" "$WHITELIST_FILE"
            log "Whitelist descargado exitosamente"
            return 0
        else
            log "ERROR: Archivo descargado está vacío"
            rm -f "${WHITELIST_FILE}.tmp"
            return 1
        fi
    else
        log "ERROR: No se pudo descargar whitelist desde GitHub Gist"
        rm -f "${WHITELIST_FILE}.tmp"
        return 1
    fi
}

# Función para generar configuración dnsmasq
generate_dnsmasq_config() {
    log "Generando configuración dnsmasq..."

    # Archivo temporal
    TEMP_CONF="${DNSMASQ_CONF}.tmp"

    # Encabezado
    cat > "$TEMP_CONF" << 'EOF'
# =============================================
# URL Whitelist - dnsmasq Configuration
# Auto-generated - Do not edit manually
# =============================================

EOF

    # Combinar URLs base con URLs del archivo descargado
    ALL_URLS=("${BASE_URLS[@]}")

    if [ -f "$WHITELIST_FILE" ]; then
        while IFS= read -r line; do
            # Ignorar líneas vacías y comentarios
            line=$(echo "$line" | sed 's/#.*//' | xargs)
            if [ -n "$line" ]; then
                ALL_URLS+=("$line")
            fi
        done < "$WHITELIST_FILE"
    fi

    log "Total de dominios en whitelist: ${#ALL_URLS[@]}"

    # Generar líneas ipset para cada dominio
    for domain in "${ALL_URLS[@]}"; do
        # Añadir dominio al ipset automáticamente cuando se resuelva
        echo "ipset=/${domain}/${IPSET_NAME}" >> "$TEMP_CONF"
    done

    # Mover a ubicación final
    mv "$TEMP_CONF" "$DNSMASQ_CONF"

    log "Configuración dnsmasq generada con ${#ALL_URLS[@]} dominios"
}

# Función para verificar si la configuración ha cambiado
has_config_changed() {
    if [ ! -f "$DNSMASQ_CONF_HASH" ]; then
        return 0  # No hay hash previo, considerar como cambio
    fi

    NEW_HASH=$(md5sum "$DNSMASQ_CONF" | cut -d' ' -f1)
    OLD_HASH=$(cat "$DNSMASQ_CONF_HASH" 2>/dev/null || echo "")

    if [ "$NEW_HASH" != "$OLD_HASH" ]; then
        log "Detectado cambio en configuración dnsmasq"
        return 0
    else
        log "No hay cambios en configuración"
        return 1
    fi
}

# Función para verificar si las reglas de firewall están activas
firewall_rules_active() {
    # Contar reglas en OUTPUT (debe haber al menos 5)
    RULE_COUNT=$(iptables -L OUTPUT -n 2>/dev/null | grep -c "^ACCEPT\|^DROP" || echo "0")

    if [ "$RULE_COUNT" -ge 5 ]; then
        return 0  # Reglas activas
    else
        log "ADVERTENCIA: Reglas de firewall no detectadas ($RULE_COUNT reglas)"
        return 1
    fi
}

# Función para configurar firewall
configure_firewall() {
    log "Configurando firewall con dnsmasq..."

    # Crear ipset si no existe
    if ! ipset list "$IPSET_NAME" &>/dev/null; then
        ipset create "$IPSET_NAME" hash:ip timeout 0 2>/dev/null || true
        log "ipset creado: $IPSET_NAME"
    fi

    # Limpiar TODAS las reglas antiguas primero (flush completo)
    iptables -F OUTPUT 2>/dev/null || true

    # Configurar nuevas reglas de iptables
    # 1. Permitir tráfico local (loopback)
    iptables -A OUTPUT -o lo -j ACCEPT

    # 2. Permitir conexiones ya establecidas
    iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # 3. Permitir DNS (necesario para resolver nombres)
    iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

    # 4. Permitir tráfico a IPs de la whitelist (añadidas por dnsmasq)
    iptables -A OUTPUT -m set --match-set "$IPSET_NAME" dst -j ACCEPT

    # 5. BLOQUEAR todo lo demás
    iptables -A OUTPUT -j DROP

    log "Firewall configurado - Restricciones activas"
}

# Función para reiniciar dnsmasq
restart_dnsmasq() {
    log "Reiniciando dnsmasq..."

    if systemctl restart dnsmasq; then
        log "dnsmasq reiniciado exitosamente"

        # Guardar hash de la configuración actual
        md5sum "$DNSMASQ_CONF" | cut -d' ' -f1 > "$DNSMASQ_CONF_HASH"
        return 0
    else
        log "ERROR: No se pudo reiniciar dnsmasq"
        return 1
    fi
}

# Función para verificar si el sistema está desactivado remotamente
check_emergency_disable() {
    # Verificar si la primera línea del whitelist contiene la palabra clave de desactivación
    if [ -f "$WHITELIST_FILE" ]; then
        # Leer primera línea no vacía
        FIRST_LINE=$(grep -v '^[[:space:]]*$' "$WHITELIST_FILE" | head -n 1 | xargs)

        # Verificar si contiene la palabra clave (case-insensitive)
        if echo "$FIRST_LINE" | grep -iq "^#.*DESACTIVADO"; then
            log "DESACTIVACIÓN REMOTA DETECTADA en whitelist"
            return 0  # Sistema desactivado
        fi
    fi
    return 1  # Sistema activo
}

# Lógica principal
main() {
    # Intentar descargar whitelist
    if download_whitelist; then
        # Verificar si hay orden de desactivación remota
        if check_emergency_disable; then
            log "=== SISTEMA DESACTIVADO REMOTAMENTE - Eliminando restricciones ==="
            cleanup_firewall
            return
        fi

        # Descarga exitosa - generar configuración
        generate_dnsmasq_config

        # Verificar si la configuración ha cambiado O si las reglas están ausentes
        CONFIG_CHANGED=false
        RULES_MISSING=false

        if has_config_changed; then
            CONFIG_CHANGED=true
        fi

        if ! firewall_rules_active; then
            RULES_MISSING=true
        fi

        if [ "$CONFIG_CHANGED" = true ] || [ "$RULES_MISSING" = true ]; then
            # Configurar firewall (siempre, si las reglas están ausentes)
            configure_firewall

            # Reiniciar dnsmasq solo si la configuración cambió
            if [ "$CONFIG_CHANGED" = true ]; then
                if restart_dnsmasq; then
                    log "=== Sistema actualizado exitosamente ==="
                else
                    log "=== ERROR al reiniciar dnsmasq - Activando fail-open ==="
                    cleanup_firewall
                fi
            else
                # Solo restauramos las reglas, no reiniciamos dnsmasq
                log "=== Reglas de firewall restauradas (dnsmasq ya estaba configurado) ==="
                # Guardar hash para marcar que ahora está sincronizado
                md5sum "$DNSMASQ_CONF" | cut -d' ' -f1 > "$DNSMASQ_CONF_HASH"
            fi
        else
            log "=== Sin cambios - Sistema operando correctamente ==="
        fi
    else
        # No se pudo descargar - comportamiento fail-open
        log "=== No se pudo acceder al servidor - Eliminando restricciones ==="
        cleanup_firewall
    fi
}

# Ejecutar
main

log "=== Proceso finalizado ==="
SCRIPT_EOF

chmod +x /usr/local/bin/dnsmasq-whitelist.sh

# Configurar dnsmasq
echo ""
echo "[5/8] Configurando dnsmasq..."
# Se elimina el entrecomillado de DNSMASQ_EOF para permitir la expansión de la variable $GATEWAY_IP
cat >> /etc/dnsmasq.conf << DNSMASQ_EOF

# =============================================
# URL Whitelist Configuration
# =============================================

# Listen only on localhost
listen-address=127.0.0.1

# Use router as upstream DNS
server=$GATEWAY_IP

# Don't read /etc/resolv.conf
no-resolv

# Read configuration from this directory
conf-dir=/etc/dnsmasq.d/,*.conf

# Enable logging for debugging (uncomment if needed)
#log-queries
#log-facility=/var/log/dnsmasq.log
DNSMASQ_EOF

# Configurar DNS del sistema
echo ""
echo "[6/8] Configurando DNS del sistema..."
rm -f /etc/resolv.conf
cat > /etc/resolv.conf << 'RESOLV_EOF'
nameserver 127.0.0.1
search lan
RESOLV_EOF

# Crear servicio systemd
echo ""
echo "[7/8] Creando servicios systemd..."
cat > /etc/systemd/system/dnsmasq-whitelist.service << 'SERVICE_EOF'
[Unit]
Description=dnsmasq URL Whitelist Manager
Documentation=man:iptables(8)
After=network-online.target
Wants=network-online.target
Before=dnsmasq.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnsmasq-whitelist.sh
RemainAfterExit=no
StandardOutput=journal
StandardError=journal

# Reintentar si falla
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Crear timer systemd
cat > /etc/systemd/system/dnsmasq-whitelist.timer << 'TIMER_EOF'
[Unit]
Description=dnsmasq URL Whitelist Update Timer (Every 5 minutes)
Requires=dnsmasq-whitelist.service

[Timer]
# Ejecutar cada 5 minutos
OnBootSec=1min
OnUnitActiveSec=5min
AccuracySec=1s

[Install]
WantedBy=timers.target
TIMER_EOF

# Recargar systemd
systemctl daemon-reload

# Deshabilitar timer antiguo si existe
if systemctl is-enabled url-whitelist.timer &>/dev/null; then
    echo "Deshabilitando timer antiguo url-whitelist.timer..."
    systemctl disable --now url-whitelist.timer 2>/dev/null || true
fi

# Habilitar servicios
systemctl enable dnsmasq.service
systemctl enable dnsmasq-whitelist.timer

# Inicializar sistema
echo ""
echo "[8/8] Inicializando sistema..."

# Temporalmente usar DNS del router para la primera descarga
# Se elimina el entrecomillado de RESOLV_TEMP_EOF para permitir la expansión de la variable $GATEWAY_IP
cat > /etc/resolv.conf << RESOLV_TEMP_EOF
nameserver $GATEWAY_IP
search lan
RESOLV_TEMP_EOF

# Ejecutar script inicial
/usr/local/bin/dnsmasq-whitelist.sh

# Iniciar timer
systemctl start dnsmasq-whitelist.timer

echo ""
echo "======================================================"
echo "  ¡Instalación completada exitosamente!"
echo "======================================================"
echo ""
echo "Información del sistema:"
echo "  - Script principal: /usr/local/bin/dnsmasq-whitelist.sh"
echo "  - Logs: /var/log/url-whitelist.log"
echo "  - Whitelist local: /var/lib/url-whitelist/whitelist.txt"
echo "  - Configuración dnsmasq: /etc/dnsmasq.d/url-whitelist.conf"
echo ""
echo "Comandos útiles:"
echo "  - Ver estado: systemctl status dnsmasq-whitelist.timer"
echo "  - Ver logs: tail -f /var/log/url-whitelist.log"
echo "  - Ejecutar manualmente: sudo /usr/local/bin/dnsmasq-whitelist.sh"
echo "  - Deshabilitar: sudo systemctl disable --now dnsmasq-whitelist.timer"
echo "  - Ver ipset: sudo ipset list url_whitelist"
echo "  - Ver reglas firewall: sudo iptables -L OUTPUT -n -v"
echo ""
echo "El sistema descargará el whitelist desde GitHub Gist cada 5 minutos."
echo "Si el servidor no es accesible, NO se aplicarán restricciones (fail-open)."
echo ""
echo "Ventajas de dnsmasq vs iptables directo:"
echo "  - Soluciona el problema de IPs dinámicas"
echo "  - dnsmasq añade IPs al ipset en tiempo real al resolver DNS"
echo "  - No necesita resolver todas las IPs cada 5 minutos"
echo "  - Funciona perfectamente con servicios como Google que usan DNS round-robin"
echo ""
echo "¡Listo! El sistema está configurado y funcionando."
