#!/bin/bash

################################################################################
# Script de Instalación: dnsmasq URL Whitelist System v2.0
#
# Nueva arquitectura para portales cautivos (WEDU):
# - DNS Sinkhole: dnsmasq solo resuelve dominios en whitelist
# - Detector de portal cautivo: activa restricciones solo después de autenticarse
# - Funciona con IPs dinámicas (no necesita ipset)
# - Fail-open: si no puede conectar, permite todo
# - Resistente a bypass técnicos
#
# Uso: sudo ./setup-dnsmasq-whitelist.sh
#
################################################################################

set -e

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Este script debe ejecutarse como root (usar sudo)"
    exit 1
fi

echo "======================================================"
echo "  dnsmasq URL Whitelist System v2.0 - Instalación"
echo "  Optimizado para portales cautivos (WEDU)"
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

# Liberar puerto 53 ANTES de instalar dnsmasq
echo ""
echo "[1/10] Liberando puerto 53..."
if systemctl is-active --quiet systemd-resolved; then
    # Crear backup de resolved.conf si no existe
    if [ ! -f /etc/systemd/resolved.conf.backup-whitelist ]; then
        cp /etc/systemd/resolved.conf /etc/systemd/resolved.conf.backup-whitelist
        echo "Backup creado: /etc/systemd/resolved.conf.backup-whitelist"
    fi

    # Deshabilitar DNSStubListener
    sed -i 's/#DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
    sed -i 's/DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf

    # Configurar DNS upstream (el router)
    if ! grep -q "^DNS=" /etc/systemd/resolved.conf; then
        sed -i "s/#DNS=/DNS=$GATEWAY_IP/" /etc/systemd/resolved.conf
    fi

    # DETENER systemd-resolved Y su socket para liberar puerto 53
    echo "Deteniendo systemd-resolved y systemd-resolved.socket..."
    systemctl stop systemd-resolved.socket 2>/dev/null || true
    systemctl stop systemd-resolved

    # Verificar que puerto 53 está libre (timeout extendido a 30s)
    echo "Verificando que puerto 53 está libre..."
    PORT_FREE=false
    for i in {1..30}; do
        if ! ss -tulpn 2>/dev/null | grep -q ":53 "; then
            echo "✓ Puerto 53 liberado (intento $i/30)"
            PORT_FREE=true
            break
        fi
        sleep 1
    done

    if [ "$PORT_FREE" = false ]; then
        echo "ERROR: Puerto 53 aún está ocupado después de 30 segundos"
        echo "Procesos usando puerto 53:"
        ss -tulpn 2>/dev/null | grep ":53 " || echo "  (ninguno visible)"
        lsof -i :53 2>/dev/null || echo "  (lsof no disponible)"
        echo ""
        echo "Intentando reiniciar systemd-resolved..."
        systemctl start systemd-resolved
        exit 1
    fi
fi

# Instalar dependencias
echo ""
echo "[2/10] Instalando dependencias..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y iptables ipset curl libcap2-bin dnsutils
# Instalar dnsmasq sin iniciarlo
RUNLEVEL=1 apt-get install -y dnsmasq

# Dar capacidades a dnsmasq
echo ""
echo "[3/10] Configurando capacidades de dnsmasq..."
setcap 'cap_net_bind_service,cap_net_admin=+ep' /usr/sbin/dnsmasq
echo "dnsmasq configurado con capacidades CAP_NET_BIND_SERVICE y CAP_NET_ADMIN"

# Reconfigurar systemd-resolved
echo ""
echo "[4/10] Reconfigurando systemd-resolved..."
if [ -f /etc/systemd/resolved.conf.backup-whitelist ]; then
    systemctl restart systemd-resolved
    echo "systemd-resolved reconfigurado (sin puerto 53)"
fi

# Crear script de detección de portal cautivo
echo ""
echo "[5/10] Creando detector de portal cautivo..."
cat > /usr/local/bin/captive-portal-detector.sh << 'DETECTOR_EOF'
#!/bin/bash

#############################################
# Captive Portal Detector
# Detecta si estás autenticado en portal cautivo (WEDU)
# y activa/desactiva firewall según el estado
#############################################

LOG_FILE="/var/log/captive-portal-detector.log"
STATE_FILE="/var/run/captive-portal-state"
CHECK_URL="http://detectportal.firefox.com/success.txt"
EXPECTED_RESPONSE="success"

# Función de logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Crear directorio de logs
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$STATE_FILE")"

# Función para activar firewall restrictivo
activate_firewall() {
    log "Activando firewall restrictivo..."

    # Verificar que ipset existe, si no, crearlo vacío
    if ! ipset list url_whitelist >/dev/null 2>&1; then
        log "ipset 'url_whitelist' no existe - creándolo..."
        ipset create url_whitelist hash:ip timeout 0 2>/dev/null || true
        log "ipset creado - será poblado por dnsmasq-whitelist.sh"
    fi

    # Limpiar reglas existentes
    iptables -F OUTPUT 2>/dev/null || true

    # 1. Permitir tráfico local (loopback)
    iptables -A OUTPUT -o lo -j ACCEPT

    # 2. Permitir conexiones ya establecidas
    iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # 3. Permitir DNS SOLO a localhost (forzar uso de dnsmasq local)
    iptables -A OUTPUT -p udp -d 127.0.0.1 --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d 127.0.0.1 --dport 53 -j ACCEPT

    # 4. Permitir a 'root' y 'dnsmasq' hacer consultas DNS externas
    # Esto es CRÍTICO para que dnsmasq pueda resolver y el script de refresco pueda popular el ipset.
    iptables -A OUTPUT -p udp --dport 53 -m owner --uid-owner 0 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 53 -m owner --uid-owner 0 -j ACCEPT
    iptables -A OUTPUT -p udp --dport 53 -m owner --uid-owner dnsmasq -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 53 -m owner --uid-owner dnsmasq -j ACCEPT

    # 5. BLOQUEAR DNS a cualquier otro servidor (anti-bypass para el resto de usuarios)
    iptables -A OUTPUT -p udp --dport 53 -j DROP
    iptables -A OUTPUT -p tcp --dport 53 -j DROP

    # 6. Bloquear puertos VPN comunes (anti-bypass)
    iptables -A OUTPUT -p udp --dport 1194 -j DROP  # OpenVPN
    iptables -A OUTPUT -p udp --dport 51820 -j DROP # WireGuard
    iptables -A OUTPUT -p tcp --dport 1723 -j DROP  # PPTP

    # 7. Bloquear Tor
    iptables -A OUTPUT -p tcp --dport 9001 -j DROP
    iptables -A OUTPUT -p tcp --dport 9030 -j DROP

    # 8. Permitir HTTP/HTTPS SOLO a IPs en whitelist (validación con ipset)
    # CRÍTICO: Esto valida que la IP destino esté en el ipset antes de permitir
    iptables -A OUTPUT -p tcp --dport 80 -m set --match-set url_whitelist dst -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 443 -m set --match-set url_whitelist dst -j ACCEPT

    # 9. Permitir NTP (sincronización de hora)
    iptables -A OUTPUT -p udp --dport 123 -j ACCEPT

    # 10. BLOQUEAR acceso directo por IP (forzar uso de DNS)
    # Excepto redes privadas y gateway
    iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT
    iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
    iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

    # 11. BLOQUEAR todo lo demás
    iptables -A OUTPUT -j DROP

    log "Firewall restrictivo activado"
}

# Función para desactivar firewall (modo permisivo)
deactivate_firewall() {
    log "Desactivando firewall (modo permisivo para portal cautivo)..."

    # Limpiar TODAS las reglas
    iptables -F OUTPUT 2>/dev/null || true

    # NOTA: NO eliminamos ipset aquí, solo las reglas de firewall
    # El ipset seguirá siendo gestionado por dnsmasq-whitelist.sh

    log "Firewall desactivado - Acceso libre"
}

# Función para verificar si estamos autenticados
check_authentication() {
    # Intentar acceder a URL de detección con timeout de 5 segundos
    RESPONSE=$(timeout 5 curl -s -L "$CHECK_URL" 2>/dev/null | tr -d '\n\r' || echo "")

    if [ "$RESPONSE" = "$EXPECTED_RESPONSE" ]; then
        return 0  # Autenticado
    else
        return 1  # NO autenticado
    fi
}

# Estado anterior (para detectar cambios)
PREVIOUS_STATE=""
if [ -f "$STATE_FILE" ]; then
    PREVIOUS_STATE=$(cat "$STATE_FILE")
fi

# Loop principal
log "=== Iniciando detector de portal cautivo ==="

while true; do
    if check_authentication; then
        CURRENT_STATE="authenticated"

        if [ "$PREVIOUS_STATE" != "authenticated" ]; then
            log "Estado: AUTENTICADO en red"
            activate_firewall
            echo "authenticated" > "$STATE_FILE"
            PREVIOUS_STATE="authenticated"
        fi
    else
        CURRENT_STATE="not_authenticated"

        if [ "$PREVIOUS_STATE" != "not_authenticated" ]; then
            log "Estado: NO AUTENTICADO en red (portal cautivo activo)"
            deactivate_firewall
            echo "not_authenticated" > "$STATE_FILE"
            PREVIOUS_STATE="not_authenticated"
        fi
    fi

    # Esperar 30 segundos antes de la siguiente comprobación
    sleep 30
done
DETECTOR_EOF

chmod +x /usr/local/bin/captive-portal-detector.sh

# Crear script principal de whitelist
echo ""
echo "[6/10] Creando script principal dnsmasq-whitelist.sh..."
cat > /usr/local/bin/dnsmasq-whitelist.sh << 'SCRIPT_EOF'
#!/bin/bash

#############################################
# dnsmasq Whitelist Manager v2.0
# DNS Sinkhole: solo resuelve dominios en whitelist
# Funciona con IPs dinámicas (no necesita ipset)
#############################################

# Configuración
WHITELIST_URL="https://gist.githubusercontent.com/balejosg/9a81340e7e7bfd044cc031f41af6acdc/raw/whitelist.txt"
WHITELIST_FILE="/var/lib/url-whitelist/whitelist.txt"
DNSMASQ_CONF="/etc/dnsmasq.d/url-whitelist.conf"
DNSMASQ_CONF_HASH="/var/lib/url-whitelist/dnsmasq.hash"
LOG_FILE="/var/log/url-whitelist.log"

# Obtener gateway dinámicamente
GATEWAY_IP=$(ip route | grep default | awk '{print $3}' | head -n 1)

# URLs base (hardcoded) - necesarias para bootstrap
BASE_URLS=(
    "google.es"
    "www.google.es"
    "google.com"
    "www.google.com"
    "github.com"
    "gist.githubusercontent.com"
    "raw.githubusercontent.com"
    "nce.wedu.comunidad.madrid"
    "archive.ubuntu.com"
    "security.ubuntu.com"
    "packages.ubuntu.com"
    "max.educa.madrid.org"
    "anthropic.com"
    "api.anthropic.com"
    "www.anthropic.com"
    "claude.ai"
    "detectportal.firefox.com"
    "connectivity-check.ubuntu.com"
    "connectivitycheck.gstatic.com"
)

# Función de logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Crear directorios necesarios
mkdir -p /var/lib/url-whitelist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p /etc/dnsmasq.d

log "=== Iniciando actualización de whitelist (dnsmasq v2.0) ==="

# Función para limpiar sistema (fail-open)
cleanup_system() {
    log "Limpiando sistema - Modo fail-open activado"

    # Limpiar ipset si existe
    if ipset list url_whitelist >/dev/null 2>&1; then
        ipset destroy url_whitelist 2>/dev/null || true
        log "ipset eliminado"
    fi

    # Configurar dnsmasq en modo passthrough (resuelve todo)
    cat > "$DNSMASQ_CONF" << EOF
# =============================================
# URL Whitelist - MODO FAIL-OPEN
# dnsmasq en modo passthrough (permite todo)
# =============================================

# Resolver todo contra gateway
server=$GATEWAY_IP
EOF

    # Reiniciar dnsmasq
    systemctl restart dnsmasq 2>/dev/null || true

    log "Sistema en modo fail-open - Sin restricciones"
}

# Función para descargar whitelist
download_whitelist() {
    log "Intentando descargar whitelist desde GitHub Gist..."

    if timeout 30 curl -L -f -s "$WHITELIST_URL" -o "${WHITELIST_FILE}.tmp" 2>/dev/null; then
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

# Función para verificar si dnsmasq soporta ipset
check_dnsmasq_ipset_support() {
    # Crear archivo de prueba
    local TEST_CONF="/tmp/dnsmasq_ipset_test.conf"
    cat > "$TEST_CONF" << 'EOF'
listen-address=127.0.0.1
no-resolv
server=/test.com/8.8.8.8
ipset=/test.com/test_set
EOF

    # Probar configuración
    if dnsmasq --test --conf-file="$TEST_CONF" 2>&1 | grep -q "syntax check OK"; then
        rm -f "$TEST_CONF"
        return 0
    else
        rm -f "$TEST_CONF"
        return 1
    fi
}

# Función para generar configuración dnsmasq (DNS Sinkhole)
generate_dnsmasq_config() {
    log "Generando configuración dnsmasq (DNS Sinkhole)..."

    # Verificar soporte de ipset
    IPSET_SUPPORTED=false
    if check_dnsmasq_ipset_support; then
        IPSET_SUPPORTED=true
        export IPSET_MANUAL_MODE=false
        log "dnsmasq soporta ipset - habilitando integración ipset automática"
    else
        export IPSET_MANUAL_MODE=true
        log "ADVERTENCIA: dnsmasq no soporta ipset - usando población manual de ipset"
    fi

    TEMP_CONF="${DNSMASQ_CONF}.tmp"

    # Encabezado
    cat > "$TEMP_CONF" << 'EOF'
# =============================================
# URL Whitelist - dnsmasq DNS Sinkhole
# Solo resuelve dominios en whitelist
# Auto-generated - Do not edit manually
# =============================================

EOF

    # Combinar URLs base con URLs del archivo
    ALL_URLS=("${BASE_URLS[@]}")

    if [ -f "$WHITELIST_FILE" ]; then
        while IFS= read -r line; do
            line=$(echo "$line" | sed 's/#.*//' | xargs)
            if [ -n "$line" ]; then
                ALL_URLS+=("$line")
            fi
        done < "$WHITELIST_FILE"
    fi

    log "Total de dominios en whitelist: ${#ALL_URLS[@]}"

    # Resolver solo dominios en whitelist contra gateway
    echo "# Dominios permitidos (resueltos contra gateway)" >> "$TEMP_CONF"
    for domain in "${ALL_URLS[@]}"; do
        # Resolver este dominio contra el gateway
        echo "server=/${domain}/${GATEWAY_IP}" >> "$TEMP_CONF"
    done

    echo "" >> "$TEMP_CONF"

    # Añadir ipset SOLO si está soportado
    if [ "$IPSET_SUPPORTED" = true ]; then
        echo "# Añadir IPs resueltas al ipset (para validación de firewall)" >> "$TEMP_CONF"
        for domain in "${ALL_URLS[@]}"; do
            echo "ipset=/${domain}/url_whitelist" >> "$TEMP_CONF"
        done
        echo "" >> "$TEMP_CONF"
    else
        echo "# ipset no soportado por esta versión de dnsmasq" >> "$TEMP_CONF"
        echo "" >> "$TEMP_CONF"
    fi

    # BLOQUEAR dominios NO en whitelist (DNS Sinkhole)
    # address=/#/ retorna 127.0.0.1 para dominios que NO coincidan con server=
    # Esto NO sobrescribe los server= anteriores - el orden importa
    echo "# DNS Sinkhole: dominios NO en whitelist retornan 127.0.0.1 (bloqueados)" >> "$TEMP_CONF"
    echo "address=/#/127.0.0.1" >> "$TEMP_CONF"

    mv "$TEMP_CONF" "$DNSMASQ_CONF"

    if [ "$IPSET_SUPPORTED" = true ]; then
        log "Configuración dnsmasq generada con ${#ALL_URLS[@]} dominios + ipset + DNS sinkhole"
    else
        log "Configuración dnsmasq generada con ${#ALL_URLS[@]} dominios + DNS sinkhole (sin ipset)"
    fi
}

# Función para verificar si la configuración cambió
has_config_changed() {
    if [ ! -f "$DNSMASQ_CONF_HASH" ]; then
        return 0
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

# Función para poblar ipset manualmente (cuando dnsmasq no lo soporta)
populate_ipset_manually() {
    log "Poblando ipset manualmente (dnsmasq no soporta ipset automático)..."

    # Combinar URLs base con URLs del archivo
    local ALL_URLS=("${BASE_URLS[@]}")
    if [ -f "$WHITELIST_FILE" ]; then
        while IFS= read -r line; do
            line=$(echo "$line" | sed 's/#.*//' | xargs)
            if [ -n "$line" ]; then
                ALL_URLS+=("$line")
            fi
        done < "$WHITELIST_FILE"
    fi

    local POPULATED=0
    for domain in "${ALL_URLS[@]}"; do
        # Intentar resolver el dominio con timeout de 2 segundos
        IPS=$(timeout 2 dig +short +time=1 +tries=1 "$domain" @"$GATEWAY_IP" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
        if [ -n "$IPS" ]; then
            while IFS= read -r ip; do
                ipset add url_whitelist "$ip" 2>/dev/null || true
                ((POPULATED++)) || true
            done <<< "$IPS"
        fi
    done
    log "Pobladas $POPULATED IPs en ipset manualmente"
}

# Función para configurar ipset
setup_ipset() {
    log "Configurando ipset para validación de IPs..."

    # Crear ipset si no existe
    if ! ipset list url_whitelist >/dev/null 2>&1; then
        ipset create url_whitelist hash:ip timeout 0 2>/dev/null || true
        log "ipset 'url_whitelist' creado"
    else
        log "ipset 'url_whitelist' ya existe"
    fi

    # Verificar si necesitamos población manual
    # (se establece en generate_dnsmasq_config)
    if [ "${IPSET_MANUAL_MODE:-false}" = true ]; then
        # En modo manual, limpiar y re-poblar cada vez
        ipset flush url_whitelist 2>/dev/null || true
        populate_ipset_manually
    else
        # En modo automático (dnsmasq con ipset), solo pre-poblar si está vacío
        CURRENT_SIZE=$(ipset list url_whitelist | grep -c "^[0-9]" || echo "0")
        if [ "$CURRENT_SIZE" -eq 0 ]; then
            log "Pre-poblando ipset con IPs de dominios base..."
            populate_ipset_manually
        else
            log "ipset ya tiene $CURRENT_SIZE IPs - dnsmasq lo gestionará dinámicamente"
        fi
    fi
}

# Función para verificar desactivación remota
check_emergency_disable() {
    if [ -f "$WHITELIST_FILE" ]; then
        FIRST_LINE=$(grep -v '^[[:space:]]*$' "$WHITELIST_FILE" | head -n 1 | xargs)
        if echo "$FIRST_LINE" | grep -iq "^#.*DESACTIVADO"; then
            log "DESACTIVACIÓN REMOTA DETECTADA"
            return 0
        fi
    fi
    return 1
}

# Lógica principal
main() {
    if download_whitelist; then
        if check_emergency_disable; then
            log "=== SISTEMA DESACTIVADO REMOTAMENTE ==="
            cleanup_system
            return
        fi

        # Generar config dnsmasq PRIMERO (esto establece IPSET_MANUAL_MODE)
        generate_dnsmasq_config

        # Configurar ipset DESPUÉS (usa IPSET_MANUAL_MODE establecido arriba)
        setup_ipset

        if has_config_changed; then
            # Validar configuración de dnsmasq antes de reiniciar
            log "Validando configuración de dnsmasq..."
            DNSMASQ_TEST_OUTPUT=$(dnsmasq --test 2>&1)
            if ! echo "$DNSMASQ_TEST_OUTPUT" | grep -q "syntax check OK"; then
                log "ERROR: Configuración de dnsmasq inválida"
                log "Salida completa de dnsmasq --test:"
                echo "$DNSMASQ_TEST_OUTPUT" | while read line; do log "  $line"; done
                log ""
                log "Configuración generada en: $DNSMASQ_CONF"
                log "Últimas 10 líneas de la configuración:"
                tail -10 "$DNSMASQ_CONF" | while read line; do log "  $line"; done
                cleanup_system
                return
            fi
            log "Configuración de dnsmasq válida"

            log "Reiniciando dnsmasq..."
            # Usar timeout para evitar bloqueos indefinidos
            if timeout 30 systemctl restart dnsmasq; then
                # Verificar que dnsmasq realmente está corriendo
                sleep 2
                if systemctl is-active --quiet dnsmasq; then
                    md5sum "$DNSMASQ_CONF" | cut -d' ' -f1 > "$DNSMASQ_CONF_HASH"
                    log "dnsmasq reiniciado exitosamente"
                else
                    log "ERROR: dnsmasq no está activo después del reinicio"
                    cleanup_system
                    return
                fi
            else
                log "ERROR: Timeout o fallo al reiniciar dnsmasq"
                cleanup_system
                return
            fi
        fi

        log "=== Sistema actualizado exitosamente ==="
    else
        log "=== No se pudo descargar whitelist - Modo fail-open ==="
        cleanup_system
    fi
}

main
log "=== Proceso finalizado ==="
SCRIPT_EOF

chmod +x /usr/local/bin/dnsmasq-whitelist.sh

# Configurar dnsmasq base
echo ""
echo "[7/10] Configurando dnsmasq..."
if [ ! -f /etc/dnsmasq.conf.backup-whitelist ]; then
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup-whitelist 2>/dev/null || true
    echo "Backup creado: /etc/dnsmasq.conf.backup-whitelist"
fi

cat >> /etc/dnsmasq.conf << DNSMASQ_EOF

# =============================================
# URL Whitelist Configuration v2.0
# =============================================

# Listen only on localhost
listen-address=127.0.0.1

# Don't read /etc/resolv.conf (usaremos server= explícito)
no-resolv

# Read configuration from this directory
conf-dir=/etc/dnsmasq.d/,*.conf

# Cache size
cache-size=1000

# Enable logging for debugging (uncomment if needed)
#log-queries
#log-facility=/var/log/dnsmasq.log
DNSMASQ_EOF

# Configurar DNS del sistema
echo ""
echo "[8/10] Configurando DNS del sistema..."
if [ ! -f /etc/resolv.conf.backup-whitelist ] && [ -f /etc/resolv.conf ]; then
    cp /etc/resolv.conf /etc/resolv.conf.backup-whitelist
    echo "Backup creado: /etc/resolv.conf.backup-whitelist"
fi

# Temporalmente usar DNS del router para la primera descarga
cat > /etc/resolv.conf << RESOLV_TEMP_EOF
nameserver $GATEWAY_IP
search lan
RESOLV_TEMP_EOF

# Crear servicios systemd
echo ""
echo "[9/10] Creando servicios systemd..."

# Servicio de whitelist
cat > /etc/systemd/system/dnsmasq-whitelist.service << 'SERVICE_EOF'
[Unit]
Description=dnsmasq URL Whitelist Manager
After=network-online.target
Wants=network-online.target
Before=dnsmasq.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnsmasq-whitelist.sh
RemainAfterExit=no
StandardOutput=journal
StandardError=journal
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Timer de whitelist
cat > /etc/systemd/system/dnsmasq-whitelist.timer << 'TIMER_EOF'
[Unit]
Description=dnsmasq URL Whitelist Update Timer (Every 5 minutes)
Requires=dnsmasq-whitelist.service

[Timer]
OnBootSec=10sec
OnUnitActiveSec=5min
AccuracySec=1s

[Install]
WantedBy=timers.target
TIMER_EOF

# Servicio detector de portal cautivo
cat > /etc/systemd/system/captive-portal-detector.service << 'DETECTOR_SERVICE_EOF'
[Unit]
Description=Captive Portal Detector (WEDU)
After=network-online.target dnsmasq.service dnsmasq-whitelist.service
Wants=network-online.target dnsmasq-whitelist.service
Requires=dnsmasq.service

[Service]
Type=simple
ExecStart=/usr/local/bin/captive-portal-detector.sh
Restart=always
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
DETECTOR_SERVICE_EOF

# Recargar systemd
systemctl daemon-reload

# Deshabilitar servicios antiguos si existen
if systemctl is-enabled url-whitelist.timer &>/dev/null; then
    echo "Deshabilitando timer antiguo url-whitelist.timer..."
    systemctl disable --now url-whitelist.timer 2>/dev/null || true
fi

# Habilitar servicios
systemctl enable dnsmasq.service
systemctl enable dnsmasq-whitelist.timer
systemctl enable captive-portal-detector.service

# Inicializar sistema
echo ""
echo "[10/10] Inicializando sistema..."

# Configurar DNS temporal (usar gateway durante inicialización)
cat > /etc/resolv.conf << RESOLV_TEMP_EOF
nameserver $GATEWAY_IP
search lan
RESOLV_TEMP_EOF

# Ejecutar script inicial PRIMERO (crea ipset y configura dnsmasq)
echo "Ejecutando configuración inicial de whitelist..."
/usr/local/bin/dnsmasq-whitelist.sh

# Configurar DNS final (apuntar a localhost)
cat > /etc/resolv.conf << 'RESOLV_FINAL_EOF'
nameserver 127.0.0.1
search lan
RESOLV_FINAL_EOF

# Iniciar servicios
echo "Iniciando servicios..."
systemctl start dnsmasq-whitelist.timer
# Esperar 2 segundos para asegurar que ipset está poblado
sleep 2
systemctl start captive-portal-detector.service

echo ""
echo "======================================================"
echo "  ¡Instalación completada exitosamente!"
echo "======================================================"
echo ""
echo "Arquitectura v2.0 CORREGIDA:"
echo "  ✓ DNS Sinkhole funcional: address=/#/127.0.0.1 bloquea dominios no-whitelist"
echo "  ✓ ipset para validación de IPs: dnsmasq añade IPs dinámicamente"
echo "  ✓ Firewall con validación ipset: solo permite HTTP/HTTPS a IPs whitelisted"
echo "  ✓ Detector portal cautivo: activa firewall tras autenticarse en WEDU"
echo "  ✓ Compatible con IPs dinámicas (ipset + dnsmasq)"
echo "  ✓ Fail-open: si no conecta, permite todo"
echo "  ✓ Anti-bypass: bloquea DNS externos, VPN, Tor, acceso directo por IP"
echo ""
echo "Información del sistema:"
echo "  - Script whitelist: /usr/local/bin/dnsmasq-whitelist.sh"
echo "  - Detector portal: /usr/local/bin/captive-portal-detector.sh"
echo "  - Logs whitelist: /var/log/url-whitelist.log"
echo "  - Logs detector: /var/log/captive-portal-detector.log"
echo "  - Whitelist local: /var/lib/url-whitelist/whitelist.txt"
echo "  - Config dnsmasq: /etc/dnsmasq.d/url-whitelist.conf"
echo ""
echo "Comandos útiles:"
echo "  - Estado whitelist: systemctl status dnsmasq-whitelist.timer"
echo "  - Estado detector: systemctl status captive-portal-detector.service"
echo "  - Ver logs whitelist: tail -f /var/log/url-whitelist.log"
echo "  - Ver logs detector: tail -f /var/log/captive-portal-detector.log"
echo "  - Ejecutar whitelist manualmente: sudo /usr/local/bin/dnsmasq-whitelist.sh"
echo "  - Deshabilitar: sudo systemctl disable --now dnsmasq-whitelist.timer captive-portal-detector.service"
echo "  - Ver reglas firewall: sudo iptables -L OUTPUT -n -v"
echo ""
echo "Funcionamiento con portal cautivo WEDU:"
echo "  1. Al conectar a WEDU: firewall en modo PERMISIVO (permite login)"
echo "  2. Después de autenticarse: firewall en modo RESTRICTIVO (whitelist activa)"
echo "  3. Detector verifica estado cada 30 segundos"
echo "  4. Si pierde conexión: vuelve a modo PERMISIVO automáticamente"
echo ""
echo "¡Listo! El sistema está configurado y funcionando."
