#!/bin/bash

################################################################################
# Script de Instalación: dnsmasq URL Whitelist System v3.3
#
# Arquitectura Híbrida (DNS Sinkhole + Firewall Selectivo):
# - DNS Sinkhole: dnsmasq retorna NXDOMAIN para dominios bloqueados
# - Firewall: permite HTTP/HTTPS a cualquier IP (confía en DNS Sinkhole)
# - Bloquea bypass: DNS alternativo, VPN, Tor
# - Detector de portal cautivo: desactiva firewall si no estás autenticado
# - Detección DINÁMICA de DNS (NetworkManager, backup, gateway)
# - URL CONFIGURABLE con prompt interactivo (predeterminada: LasEncinasIT)
# - Fail-open: si algo falla, permite todo
# - NO usa ipset (elimina problema de IPs dinámicas de CDN)
#
# Uso:
#   sudo ./setup-dnsmasq-whitelist.sh
#   sudo ./setup-dnsmasq-whitelist.sh --whitelist-url "https://tu-url.com/file.txt"
#
################################################################################

# NO usar set -e: necesitamos manejo de errores explícito para fail-safe

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Este script debe ejecutarse como root (usar sudo)"
    exit 1
fi

# URL predeterminada institucional (LasEncinasIT)
DEFAULT_WHITELIST_URL="https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/refs/heads/main/Informatica%203.txt"

# Procesar argumentos de línea de comandos
SKIP_WHITELIST_PROMPT=false
WHITELIST_URL=""

if [ "$1" = "--whitelist-url" ] && [ -n "$2" ]; then
    WHITELIST_URL="$2"
    SKIP_WHITELIST_PROMPT=true
    echo "Usando URL personalizada: $WHITELIST_URL"
fi

echo "======================================================"
echo "  dnsmasq URL Whitelist System v3.3 - Instalación"
echo "  DNS dinámico + URL configurable + WEDU"
echo "======================================================"
echo ""

# Verificar idempotencia - detectar instalación existente
if [ -f /usr/local/bin/dnsmasq-whitelist.sh ]; then
    echo "⚠⚠⚠ INSTALACIÓN EXISTENTE DETECTADA ⚠⚠⚠"
    echo ""
    echo "El sistema ya tiene una instalación del whitelist."
    echo ""

    # Verificar estado de los servicios
    DNSMASQ_ACTIVE=false
    TIMER_ACTIVE=false

    if systemctl is-active --quiet dnsmasq 2>/dev/null; then
        DNSMASQ_ACTIVE=true
    fi

    if systemctl is-active --quiet dnsmasq-whitelist.timer 2>/dev/null; then
        TIMER_ACTIVE=true
    fi

    echo "Estado actual:"
    if [ "$DNSMASQ_ACTIVE" = true ]; then
        echo "  ✓ dnsmasq: ACTIVO"
    else
        echo "  ✗ dnsmasq: INACTIVO o FALLANDO"
    fi

    if [ "$TIMER_ACTIVE" = true ]; then
        echo "  ✓ Timer whitelist: ACTIVO"
    else
        echo "  ✗ Timer whitelist: INACTIVO"
    fi
    echo ""

    echo "Opciones disponibles:"
    echo "  1) REINSTALAR - Elimina instalación anterior y reinstala desde cero"
    echo "                  (Usa esto si el sistema está roto o quieres empezar limpio)"
    echo ""
    echo "  2) REPARAR    - Intenta arreglar la instalación actual"
    echo "                  (Usa esto si solo quieres actualizar configuración)"
    echo ""
    echo "  3) CANCELAR   - Salir sin hacer cambios"
    echo ""

    while true; do
        read -p "Selecciona una opción (1/2/3): " choice

        case "$choice" in
            1)
                echo ""
                echo "======================================================"
                echo "  Modo REINSTALAR seleccionado"
                echo "======================================================"
                echo ""

                # Verificar si existe script de rollback
                if [ -f /usr/local/bin/rollback-dnsmasq-whitelist.sh ]; then
                    echo "Ejecutando rollback para limpiar instalación anterior..."
                    echo ""

                    # Ejecutar rollback automáticamente (sin confirmación)
                    if bash /usr/local/bin/rollback-dnsmasq-whitelist.sh --auto-yes 2>&1; then
                        echo ""
                        echo "✓ Rollback completado - Procediendo con instalación limpia..."
                        sleep 2
                    else
                        echo ""
                        echo "⚠ ADVERTENCIA: Rollback falló o está incompleto"
                        read -p "¿Continuar con instalación de todas formas? (y/N): " continue_anyway
                        if [[ ! "$continue_anyway" =~ ^[Yy]$ ]]; then
                            echo "Instalación cancelada"
                            exit 0
                        fi
                    fi
                else
                    echo "⚠ Script de rollback no encontrado - limpiando manualmente..."
                    # Limpieza manual básica
                    systemctl disable --now dnsmasq-whitelist.timer 2>/dev/null || true
                    systemctl disable --now dnsmasq-whitelist.service 2>/dev/null || true
                    systemctl disable --now captive-portal-detector.service 2>/dev/null || true
                    systemctl stop dnsmasq 2>/dev/null || true
                fi

                echo ""
                break
                ;;
            2)
                echo ""
                echo "======================================================"
                echo "  Modo REPARAR seleccionado"
                echo "======================================================"
                echo ""
                echo "⚠ IMPORTANTE: Este modo sobrescribirá configuraciones existentes"
                echo ""
                read -p "¿Estás seguro de continuar? (y/N): " confirm_repair

                if [[ ! "$confirm_repair" =~ ^[Yy]$ ]]; then
                    echo "Operación cancelada"
                    exit 0
                fi

                echo "✓ Continuando en modo reparación..."
                echo "  (Los archivos existentes serán sobrescritos)"
                echo ""
                sleep 2
                break
                ;;
            3)
                echo ""
                echo "Instalación cancelada por el usuario"
                exit 0
                ;;
            *)
                echo "✗ Opción inválida. Por favor selecciona 1, 2 o 3"
                ;;
        esac
    done
fi

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
echo "Puerta de enlace detectado: $GATEWAY_IP"

# Detectar servidores DNS reales del sistema
# IMPORTANTE: El gateway NO siempre es el servidor DNS
# Priorizar DNS guardado de instalación previa (si existe y funciona)
DNS_SERVERS=""
PRIMARY_DNS=""

echo "Detectando servidores DNS del sistema..."

# MÉTODO 1: DNS guardado de instalación previa (más confiable)
if [ -f /var/lib/url-whitelist/original-dns.conf ]; then
    SAVED_DNS=$(head -1 /var/lib/url-whitelist/original-dns.conf 2>/dev/null | tr -d '[:space:]')
    if [ -n "$SAVED_DNS" ]; then
        echo "  DNS guardado encontrado: $SAVED_DNS"
        # Validar que el DNS guardado funciona
        if timeout 5 dig @$SAVED_DNS google.com +short >/dev/null 2>&1; then
            echo "  ✓ DNS guardado válido y funcional"
            PRIMARY_DNS="$SAVED_DNS"
            DNS_SERVERS="$SAVED_DNS"
        else
            echo "  ⚠ DNS guardado no responde - buscando alternativas"
        fi
    fi
fi

# MÉTODO 2: NetworkManager (más confiable para DHCP en redes institucionales)
if [ -z "$PRIMARY_DNS" ] && command -v nmcli >/dev/null 2>&1; then
    echo "  Intentando detección vía NetworkManager..."
    NM_DNS=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS[1]" | awk '{print $2}' | head -1)
    if [ -n "$NM_DNS" ] && [ "$NM_DNS" != "127.0.0.1" ]; then
        echo "  DNS detectado por NetworkManager: $NM_DNS"
        # Validar que funciona
        if timeout 5 dig @$NM_DNS google.com +short >/dev/null 2>&1; then
            echo "  ✓ DNS de NetworkManager válido"
            PRIMARY_DNS="$NM_DNS"
            DNS_SERVERS="$NM_DNS"
        else
            echo "  ⚠ DNS de NetworkManager no responde"
        fi
    fi
fi

# MÉTODO 3: systemd-resolved (solo si está activo y no corrupto)
if [ -z "$PRIMARY_DNS" ] && systemctl is-active --quiet systemd-resolved; then
    echo "  Intentando detección vía systemd-resolved..."
    if [ -f /run/systemd/resolve/resolv.conf ]; then
        RESOLVED_DNS=$(grep "^nameserver" /run/systemd/resolve/resolv.conf | awk '{print $2}' | grep -v "^127\." | head -1)
        # Filtrar gateway si aparece como DNS (es probablemente incorrecto)
        if [ -n "$RESOLVED_DNS" ] && [ "$RESOLVED_DNS" != "$GATEWAY_IP" ]; then
            echo "  DNS detectado por systemd-resolved: $RESOLVED_DNS"
            if timeout 5 dig @$RESOLVED_DNS google.com +short >/dev/null 2>&1; then
                echo "  ✓ DNS de systemd-resolved válido"
                PRIMARY_DNS="$RESOLVED_DNS"
                DNS_SERVERS="$RESOLVED_DNS"
            else
                echo "  ⚠ DNS de systemd-resolved no responde"
            fi
        fi
    fi
fi

# MÉTODO 4: /etc/resolv.conf directo (puede estar corrupto)
if [ -z "$PRIMARY_DNS" ] && [ -f /etc/resolv.conf ]; then
    echo "  Intentando detección vía /etc/resolv.conf..."
    RESOLV_DNS=$(grep "^nameserver" /etc/resolv.conf | awk '{print $2}' | grep -v "^127\." | head -1)
    if [ -n "$RESOLV_DNS" ]; then
        echo "  DNS detectado en /etc/resolv.conf: $RESOLV_DNS"
        if timeout 5 dig @$RESOLV_DNS google.com +short >/dev/null 2>&1; then
            echo "  ✓ DNS de /etc/resolv.conf válido"
            PRIMARY_DNS="$RESOLV_DNS"
            DNS_SERVERS="$RESOLV_DNS"
        else
            echo "  ⚠ DNS de /etc/resolv.conf no responde"
        fi
    fi
fi

# MÉTODO 5: Probar gateway como DNS (último recurso)
if [ -z "$PRIMARY_DNS" ]; then
    echo "  No se detectó DNS funcional - probando gateway como DNS..."
    if timeout 5 dig @$GATEWAY_IP google.com +short >/dev/null 2>&1; then
        echo "  ✓ Gateway funciona como DNS"
        PRIMARY_DNS="$GATEWAY_IP"
        DNS_SERVERS="$GATEWAY_IP"
    else
        echo "  ⚠ Gateway no funciona como DNS"
    fi
fi

# FALLBACK FINAL: DNS públicos (Google DNS)
if [ -z "$PRIMARY_DNS" ]; then
    echo ""
    echo "⚠⚠⚠ ADVERTENCIA CRÍTICA ⚠⚠⚠"
    echo "No se pudo detectar ningún servidor DNS funcional en tu red."
    echo "Usando Google DNS (8.8.8.8) como fallback de emergencia."
    echo ""
    PRIMARY_DNS="8.8.8.8"
    DNS_SERVERS="8.8.8.8,8.8.4.4"
fi

echo ""
echo "Configuración DNS final:"
echo "  Servidores DNS detectados: $DNS_SERVERS"
echo "  Servidor DNS principal a usar: $PRIMARY_DNS"

# Función para verificar conectividad a internet (detección de portal cautivo)
check_internet_connectivity() {
    echo ""
    echo "Verificando conectividad completa a internet..."

    # Probar acceso a portal de detección de Firefox
    if timeout 10 curl -s http://detectportal.firefox.com/success.txt 2>/dev/null | grep -q "success"; then
        echo "✓ Conectividad a internet OK - Puede continuar la instalación"
        return 0
    fi

    # Si falla, verificar si es portal cautivo o problema de red
    if ping -c 3 -W 5 8.8.8.8 >/dev/null 2>&1; then
        echo ""
        echo "⚠⚠⚠ ADVERTENCIA: PORTAL CAUTIVO DETECTADO ⚠⚠⚠"
        echo ""
        echo "Causas posibles:"
        echo "  - Estás conectado a WEDU pero NO AUTENTICADO"
        echo "  - Firewall corporativo bloqueando HTTP/HTTPS"
        echo "  - Proxy obligatorio no configurado"
        echo ""
        echo "IMPORTANTE: Si continúas sin autenticarte primero:"
        echo "  1. La descarga de whitelist desde GitHub FALLARÁ"
        echo "  2. Se instalará en modo OFFLINE (solo URLs hardcodeadas)"
        echo "  3. El timer descargará la whitelist cuando te autentiques"
        echo ""
        echo "RECOMENDACIÓN:"
        echo "  1. Cancela esta instalación (presiona N abajo)"
        echo "  2. Auténticate en el portal WEDU"
        echo "  3. Verifica que puedes navegar (abre un navegador)"
        echo "  4. Vuelve a ejecutar este script"
        echo ""
        read -p "¿Quieres continuar en MODO OFFLINE? (y/N): " response

        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo "✓ Modo OFFLINE activado - Usando solo URLs hardcodeadas"
            export OFFLINE_MODE=true
            return 0
        else
            echo "Instalación cancelada. Auténticate y vuelve a ejecutar."
            exit 0
        fi
    else
        echo "✗ ERROR: Sin conectividad de red básica"
        echo "No se puede hacer ping a 8.8.8.8"
        echo "Verifica tu conexión de red antes de continuar"
        exit 1
    fi
}

# Ejecutar verificación de conectividad
check_internet_connectivity

# Configuración de URL del whitelist (si no se pasó por argumento)
if [ "$SKIP_WHITELIST_PROMPT" = false ]; then
    echo ""
    echo "======================================================"
    echo "  Configuración de Whitelist"
    echo "======================================================"
    echo ""
    echo "URL predeterminada (LasEncinasIT - Informática 3):"
    echo "  $DEFAULT_WHITELIST_URL"
    echo ""
    read -p "¿Usar esta URL? (Y/n): " use_default

    if [[ "$use_default" =~ ^[Nn]$ ]]; then
        echo ""
        echo "Introduce la URL del whitelist:"
        echo "Ejemplo: https://raw.githubusercontent.com/org/repo/main/whitelist.txt"
        echo ""
        read -p "URL: " custom_url

        # Validar URL
        echo "Validando URL..."
        if timeout 10 curl -L -f -s -I "$custom_url" >/dev/null 2>&1; then
            WHITELIST_URL="$custom_url"
            echo "✓ URL validada: $WHITELIST_URL"
        else
            echo "✗ ADVERTENCIA: No se puede acceder a la URL proporcionada"
            echo "Usando URL predeterminada como fallback"
            WHITELIST_URL="$DEFAULT_WHITELIST_URL"
        fi
    else
        WHITELIST_URL="$DEFAULT_WHITELIST_URL"
        echo "✓ Usando URL predeterminada"
    fi
    echo ""
fi

# Si aún no hay URL configurada, usar la predeterminada
if [ -z "$WHITELIST_URL" ]; then
    WHITELIST_URL="$DEFAULT_WHITELIST_URL"
fi

echo "URL del whitelist configurada: $WHITELIST_URL"
echo ""

# Función para validar que dnsmasq está funcionando correctamente
validate_dnsmasq() {
    local max_attempts=10
    local attempt=1
    local retry_delay=2  # Aumentado de 1 a 2 segundos entre reintentos

    echo "Validando dnsmasq (hasta $max_attempts intentos)..."

    # IMPORTANTE: Dar tiempo inicial para que dnsmasq se inicialice completamente
    echo "  Esperando que dnsmasq se inicialice completamente..."
    sleep 3

    while [ $attempt -le $max_attempts ]; do
        echo "  Intento $attempt/$max_attempts..."

        # 1. Verificar que dnsmasq está corriendo
        if ! systemctl is-active --quiet dnsmasq; then
            echo "    ✗ dnsmasq no está activo"
            attempt=$((attempt + 1))
            sleep $retry_delay
            continue
        fi
        echo "    ✓ dnsmasq está activo"

        # 2. Verificar que está escuchando en puerto 53
        if ! ss -tulpn 2>/dev/null | grep ":53 " | grep -q "dnsmasq"; then
            echo "    ✗ dnsmasq no está escuchando en puerto 53"
            attempt=$((attempt + 1))
            sleep $retry_delay
            continue
        fi
        echo "    ✓ dnsmasq escuchando en puerto 53"

        # 3. Probar resolución DNS
        if timeout 5 nslookup google.com 127.0.0.1 >/dev/null 2>&1; then
            echo "    ✓ dnsmasq resuelve DNS correctamente"
            echo "✓ Validación de dnsmasq exitosa"
            return 0
        else
            echo "    ✗ dnsmasq no puede resolver DNS"
        fi

        attempt=$((attempt + 1))
        sleep $retry_delay
    done

    echo "✗ ERROR: dnsmasq no pasó la validación después de $max_attempts intentos"
    return 1
}

# Función para limpiar instalación fallida y restaurar sistema
cleanup_failed_installation() {
    echo ""
    echo "======================================================"
    echo "  Limpiando instalación fallida..."
    echo "======================================================"
    echo ""

    # 1. Detener y deshabilitar dnsmasq
    echo "[1/5] Deteniendo dnsmasq..."
    systemctl stop dnsmasq 2>/dev/null || true
    systemctl disable dnsmasq 2>/dev/null || true
    echo "✓ dnsmasq detenido"

    # 2. Re-habilitar y reiniciar systemd-resolved
    echo "[2/5] Restaurando systemd-resolved..."
    if [ -f /etc/systemd/resolved.conf.backup-whitelist ]; then
        cp /etc/systemd/resolved.conf.backup-whitelist /etc/systemd/resolved.conf
        echo "✓ Configuración de systemd-resolved restaurada"
    fi

    systemctl enable systemd-resolved 2>/dev/null || true
    systemctl start systemd-resolved.socket 2>/dev/null || true
    systemctl start systemd-resolved 2>/dev/null || true
    sleep 2

    if systemctl is-active --quiet systemd-resolved; then
        echo "✓ systemd-resolved reiniciado"
    else
        echo "⚠ ADVERTENCIA: No se pudo reiniciar systemd-resolved"
    fi

    # 3. Restaurar /etc/resolv.conf
    echo "[3/5] Restaurando /etc/resolv.conf..."
    if [ -f /etc/resolv.conf.backup-whitelist.symlink ]; then
        # Era un symlink - restaurarlo
        local target=$(cat /etc/resolv.conf.backup-whitelist.symlink)
        rm -f /etc/resolv.conf
        ln -sf "$target" /etc/resolv.conf
        echo "✓ Symlink /etc/resolv.conf restaurado a $target"
    elif [ -f /etc/resolv.conf.backup-whitelist ]; then
        # Era un archivo - restaurar contenido
        cp /etc/resolv.conf.backup-whitelist /etc/resolv.conf
        echo "✓ Archivo /etc/resolv.conf restaurado"
    else
        # No hay backup - crear configuración de emergencia
        echo "⚠ No hay backup de resolv.conf - usando configuración de emergencia"
        echo "nameserver 8.8.8.8" > /etc/resolv.conf
        echo "nameserver 8.8.4.4" >> /etc/resolv.conf
        echo "✓ DNS configurado a Google DNS (8.8.8.8)"
    fi

    # 4. Verificar conectividad
    echo "[4/5] Verificando conectividad a internet..."
    sleep 2
    if timeout 10 curl -s http://detectportal.firefox.com/success.txt 2>/dev/null | grep -q "success"; then
        echo "✓ Conectividad a internet FUNCIONANDO"
    elif ping -c 3 8.8.8.8 >/dev/null 2>&1; then
        echo "⚠ Conectividad de red OK, pero posible portal cautivo"
    else
        echo "✗ Sin conectividad - verifica tu conexión de red"
    fi

    # 5. Limpiar timers y servicios parcialmente instalados
    echo "[5/5] Limpiando servicios parcialmente instalados..."
    systemctl disable --now dnsmasq-whitelist.timer 2>/dev/null || true
    systemctl disable --now dnsmasq-whitelist.service 2>/dev/null || true
    systemctl disable --now captive-portal-detector.service 2>/dev/null || true
    echo "✓ Servicios limpiados"

    echo ""
    echo "======================================================"
    echo "  ✓ Sistema restaurado a configuración previa"
    echo "======================================================"
    echo ""
    echo "El sistema debería tener acceso normal a internet."
    echo "Revisa los logs para diagnosticar el problema:"
    echo "  - sudo journalctl -u dnsmasq -n 50"
    echo "  - sudo dnsmasq --test"
    echo ""
}

# Función para escribir /etc/resolv.conf preservando symlinks
write_resolv_conf() {
    local content="$1"

    if [ -L /etc/resolv.conf ]; then
        # Es symlink - escribir al destino real sin destruir el symlink
        local target=$(readlink -f /etc/resolv.conf)
        echo "$content" > "$target"
        echo "DNS actualizado (preservando symlink a $target)"
    else
        # Es archivo regular - sobrescribir directamente
        echo "$content" > /etc/resolv.conf
        echo "DNS actualizado (archivo regular)"
    fi
}

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

# PASO 1: Detectar y detener dnsmasq existente (de instalaciones previas)
echo "Verificando si dnsmasq ya está corriendo..."
if systemctl is-active --quiet dnsmasq 2>/dev/null; then
    echo "⚠ dnsmasq detectado de instalación previa - deteniéndolo..."
    systemctl stop dnsmasq 2>/dev/null || true
    systemctl disable dnsmasq 2>/dev/null || true
    sleep 2
    echo "✓ dnsmasq previo detenido"
elif pgrep -x dnsmasq >/dev/null 2>&1; then
    echo "⚠ Proceso dnsmasq detectado (sin systemd) - terminándolo..."
    pkill -9 dnsmasq 2>/dev/null || true
    sleep 1
    echo "✓ Proceso dnsmasq terminado"
else
    echo "✓ No se detectó dnsmasq previo"
fi

# PASO 2: Detener systemd-resolved si está activo
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

    # DETENER Y DESHABILITAR systemd-resolved para liberar puerto 53 permanentemente
    echo "Deteniendo y deshabilitando systemd-resolved..."
    systemctl stop systemd-resolved.socket 2>/dev/null || true
    systemctl stop systemd-resolved
    systemctl disable systemd-resolved 2>/dev/null || true
    echo "✓ systemd-resolved deshabilitado permanentemente"
fi

# PASO 3: Verificar que puerto 53 está libre (con identificación inteligente)
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
    echo ""
    echo "✗ ERROR: Puerto 53 aún está ocupado después de 30 segundos"
    echo ""
    echo "Procesos usando puerto 53:"
    ss -tulpn 2>/dev/null | grep ":53 " || echo "  (ninguno visible)"
    lsof -i :53 2>/dev/null || echo "  (lsof no disponible)"
    echo ""

    # Identificar inteligentemente qué proceso está usando el puerto
    if ss -tulpn 2>/dev/null | grep ":53 " | grep -q "dnsmasq"; then
        echo "✗ DIAGNÓSTICO: dnsmasq sigue usando puerto 53"
        echo ""
        echo "Soluciones sugeridas:"
        echo "  1. Ejecuta: sudo systemctl stop dnsmasq && sudo pkill -9 dnsmasq"
        echo "  2. Espera 5 segundos"
        echo "  3. Vuelve a ejecutar este script"
    elif ss -tulpn 2>/dev/null | grep ":53 " | grep -q "systemd-resolve"; then
        echo "✗ DIAGNÓSTICO: systemd-resolved sigue usando puerto 53"
        echo ""
        echo "Soluciones sugeridas:"
        echo "  1. Ejecuta: sudo systemctl stop systemd-resolved.socket"
        echo "  2. Ejecuta: sudo systemctl stop systemd-resolved"
        echo "  3. Vuelve a ejecutar este script"
    else
        echo "✗ DIAGNÓSTICO: Proceso desconocido usando puerto 53"
        echo ""
        echo "Investiga con: sudo lsof -i :53"
    fi
    echo ""

    # Intentar recuperación
    echo "Intentando recuperación automática..."
    pkill -9 dnsmasq 2>/dev/null || true
    systemctl stop systemd-resolved 2>/dev/null || true
    sleep 3

    if ! ss -tulpn 2>/dev/null | grep -q ":53 "; then
        echo "✓ Puerto 53 liberado después de recuperación"
    else
        echo "✗ Recuperación fallida - Restaurando systemd-resolved..."
        systemctl start systemd-resolved
        exit 1
    fi
fi

# Instalar dependencias
echo ""
echo "[2/10] Instalando dependencias..."
apt-get update -qq
if ! DEBIAN_FRONTEND=noninteractive apt-get install -y iptables iptables-persistent ipset curl libcap2-bin dnsutils; then
    echo "ERROR: Fallo al instalar dependencias básicas"
    exit 1
fi

# Instalar dnsmasq sin iniciarlo
if ! RUNLEVEL=1 apt-get install -y dnsmasq; then
    echo "ERROR: Fallo al instalar dnsmasq"
    echo "Intentando reiniciar systemd-resolved..."
    systemctl start systemd-resolved 2>/dev/null || true
    exit 1
fi

# Verificar que dnsmasq se instaló correctamente
if ! command -v dnsmasq >/dev/null 2>&1; then
    echo "ERROR: dnsmasq no está disponible después de la instalación"
    systemctl start systemd-resolved 2>/dev/null || true
    exit 1
fi
echo "✓ dnsmasq instalado correctamente"

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

# Guardar DNS original para detección dinámica posterior
echo ""
echo "Guardando configuración DNS original..."
mkdir -p /var/lib/url-whitelist
echo "$PRIMARY_DNS" > /var/lib/url-whitelist/original-dns.conf
echo "DNS original guardado: $PRIMARY_DNS (usado como fallback)"

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

# Función para detectar DNS primario dinámicamente
detect_primary_dns() {
    local DNS=""

    # Método 1: NetworkManager (más confiable para DHCP)
    if command -v nmcli >/dev/null 2>&1; then
        DNS=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS[1]" | awk '{print $2}' | head -1)
        if [ -n "$DNS" ]; then
            echo "$DNS"
            return 0
        fi
    fi

    # Método 2: Backup DNS original (guardado durante instalación)
    if [ -f /var/lib/url-whitelist/original-dns.conf ]; then
        DNS=$(cat /var/lib/url-whitelist/original-dns.conf 2>/dev/null | head -1)
        if [ -n "$DNS" ]; then
            echo "$DNS"
            return 0
        fi
    fi

    # Método 3: Gateway como último recurso
    local GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)
    if [ -n "$GATEWAY" ]; then
        echo "$GATEWAY"
        return 0
    fi

    # Fallback absoluto
    echo "8.8.8.8"
}

# Crear directorio de logs
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$STATE_FILE")"

# Función para activar firewall restrictivo (SIN ipset)
activate_firewall() {
    # Detectar DNS primario dinámicamente
    local PRIMARY_DNS=$(detect_primary_dns)
    log "Activando firewall restrictivo (DNS Sinkhole mode)..."
    log "DNS primario detectado: $PRIMARY_DNS"

    # Limpiar reglas existentes
    iptables -F OUTPUT 2>/dev/null || true

    # 1. Permitir tráfico local (loopback)
    iptables -A OUTPUT -o lo -j ACCEPT

    # 2. Permitir conexiones ya establecidas
    iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # 3. Permitir DNS SOLO a localhost (forzar uso de dnsmasq local)
    iptables -A OUTPUT -p udp -d 127.0.0.1 --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d 127.0.0.1 --dport 53 -j ACCEPT

    # 4. ✅ PERMITIR DNS A PRIMARY_DNS (para que dnsmasq pueda resolver)
    iptables -A OUTPUT -p udp -d $PRIMARY_DNS --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d $PRIMARY_DNS --dport 53 -j ACCEPT

    # 5. BLOQUEAR DNS a cualquier otro servidor (anti-bypass)
    iptables -A OUTPUT -p udp --dport 53 -j DROP
    iptables -A OUTPUT -p tcp --dport 53 -j DROP

    # 6. Bloquear puertos VPN comunes (anti-bypass)
    iptables -A OUTPUT -p udp --dport 1194 -j DROP  # OpenVPN
    iptables -A OUTPUT -p udp --dport 51820 -j DROP # WireGuard
    iptables -A OUTPUT -p tcp --dport 1723 -j DROP  # PPTP

    # 7. Bloquear Tor
    iptables -A OUTPUT -p tcp --dport 9001 -j DROP
    iptables -A OUTPUT -p tcp --dport 9030 -j DROP

    # 8. ✅ PERMITIR HTTP/HTTPS A CUALQUIER IP (confiamos en DNS Sinkhole)
    iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

    # 9. Permitir NTP (sincronización de hora)
    iptables -A OUTPUT -p udp --dport 123 -j ACCEPT

    # 10. Permitir acceso a redes privadas
    iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT
    iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
    iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

    # 11. BLOQUEAR todo lo demás
    iptables -A OUTPUT -j DROP

    log "✓ Firewall restrictivo activado (DNS Sinkhole mode)"
    return 0
}

# Función para desactivar firewall (modo permisivo)
deactivate_firewall() {
    log "Desactivando firewall (modo permisivo para portal cautivo)..."

    # Limpiar TODAS las reglas
    iptables -F OUTPUT 2>/dev/null || true

    log "✓ Firewall desactivado - Acceso libre"
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
log "Esperando 60 segundos para que el sistema complete el arranque..."
sleep 60

while true; do
    if check_authentication; then
        CURRENT_STATE="authenticated"

        if [ "$PREVIOUS_STATE" != "authenticated" ]; then
            log "Estado: AUTENTICADO en red"

            # Activar firewall restrictivo
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
echo "Captive portal detector creado (usa detección DNS dinámica)"

# Crear script principal de whitelist
echo ""
echo "[6/10] Creando script principal dnsmasq-whitelist.sh..."
cat > /usr/local/bin/dnsmasq-whitelist.sh << 'SCRIPT_EOF'
#!/bin/bash

#############################################
# dnsmasq Whitelist Manager v3.3
# Arquitectura Híbrida: DNS Sinkhole + Firewall Selectivo
# - DNS Selectivo: solo resuelve dominios whitelisted
# - Firewall previene bypass (VPN, Tor, DNS alternativo)
# - URL configurable durante instalación
# - NO usa ipset (confía en DNS Selectivo)
#############################################

# Configuración
# URL del whitelist (configurada durante instalación)
WHITELIST_URL="__WHITELIST_URL__"

WHITELIST_FILE="/var/lib/url-whitelist/whitelist.txt"
DNSMASQ_CONF="/etc/dnsmasq.d/url-whitelist.conf"
DNSMASQ_CONF_HASH="/var/lib/url-whitelist/dnsmasq.hash"
DNS_CACHE_FILE="/var/lib/url-whitelist/current-dns.cache"
LOG_FILE="/var/log/url-whitelist.log"

# URLs base (hardcoded) - necesarias para bootstrap
# NOTA: Solo dominios BASE - dnsmasq automáticamente resuelve subdominios
# Ejemplo: "google.com" resuelve google.com, www.google.com, api.google.com, etc.
BASE_URLS=(
    # Búsqueda y servicios básicos
    "google.es"
    "google.com"

    # GitHub y servicios de desarrollo
    "github.com"
    "githubusercontent.com"  # Cubre gist, raw, avatars, etc.
    "github.io"              # GitHub Pages

    # CDN comunes (para soporte universal)
    "gstatic.com"            # Google CDN
    "googleapis.com"         # Google APIs
    "googleusercontent.com"  # Google user content
    "ggpht.com"             # Google Photos CDN
    "cloudflare.com"         # Cloudflare CDN
    "cdnjs.cloudflare.com"   # CDNJS
    "akamaihd.net"          # Akamai CDN
    "akamaized.net"         # Akamai CDN
    "cloudfront.net"        # AWS CloudFront
    "amazonaws.com"         # AWS general

    # Educación Madrid
    "nce.wedu.comunidad.madrid"
    "max.educa.madrid.org"
    "educa.madrid.org"      # Cubre todos los subdominios educativos

    # Ubuntu
    "ubuntu.com"            # Cubre archive, security, packages

    # Anthropic
    "anthropic.com"         # Cubre www, api, etc.
    "claude.ai"

    # Conectividad
    "detectportal.firefox.com"
    "connectivity-check.ubuntu.com"
)

# Función de logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Función para detectar DNS primario dinámicamente
detect_primary_dns() {
    local DNS=""

    # Método 1: NetworkManager (más confiable para DHCP)
    if command -v nmcli >/dev/null 2>&1; then
        DNS=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS[1]" | awk '{print $2}' | head -1)
        if [ -n "$DNS" ]; then
            echo "$DNS"
            return 0
        fi
    fi

    # Método 2: Backup DNS original (guardado durante instalación)
    if [ -f /var/lib/url-whitelist/original-dns.conf ]; then
        DNS=$(cat /var/lib/url-whitelist/original-dns.conf 2>/dev/null | head -1)
        if [ -n "$DNS" ]; then
            echo "$DNS"
            return 0
        fi
    fi

    # Método 3: Gateway como último recurso
    local GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)
    if [ -n "$GATEWAY" ]; then
        echo "$GATEWAY"
        return 0
    fi

    # Fallback absoluto
    echo "8.8.8.8"
}

# Crear directorios necesarios
mkdir -p /var/lib/url-whitelist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p /etc/dnsmasq.d

log "=== Iniciando actualización de whitelist (dnsmasq v3.3 - DNS dinámico + URL configurable) ==="

# Detectar DNS primario actual
PRIMARY_DNS=$(detect_primary_dns)
log "DNS primario detectado: $PRIMARY_DNS"

# Verificar si DNS cambió desde última ejecución
DNS_CHANGED=false
if [ -f "$DNS_CACHE_FILE" ]; then
    CACHED_DNS=$(cat "$DNS_CACHE_FILE" 2>/dev/null)
    if [ "$CACHED_DNS" != "$PRIMARY_DNS" ]; then
        log "DNS cambió: $CACHED_DNS → $PRIMARY_DNS"
        DNS_CHANGED=true
    fi
else
    # Primera ejecución - crear cache
    DNS_CHANGED=true
fi

# Guardar DNS actual en cache
echo "$PRIMARY_DNS" > "$DNS_CACHE_FILE"

# Función para limpiar firewall (fail-safe)
cleanup_firewall() {
    log "Limpiando firewall - Modo permisivo"

    # Flush todas las reglas de OUTPUT
    iptables -F OUTPUT 2>/dev/null || true
    iptables -P OUTPUT ACCEPT 2>/dev/null || true

    # Guardar reglas vacías con iptables-persistent
    if command -v iptables-save >/dev/null 2>&1; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
        log "✓ Firewall en modo permisivo (guardado)"
    fi
}

# Función para configurar firewall (SIN ipset - confía en DNS Sinkhole)
configure_firewall() {
    log "Configurando firewall (DNS Sinkhole + Bloqueo de bypass)..."

    # Flush reglas existentes de OUTPUT
    iptables -F OUTPUT

    # 1. Permitir tráfico loopback
    iptables -A OUTPUT -o lo -j ACCEPT

    # 2. Permitir conexiones establecidas
    iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # 3. Permitir DNS a localhost (para consultas a dnsmasq)
    iptables -A OUTPUT -p udp -d 127.0.0.1 --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d 127.0.0.1 --dport 53 -j ACCEPT

    # 4. ✅ PERMITIR DNS A PRIMARY_DNS (para que dnsmasq pueda resolver)
    # Esta regla es CRÍTICA: sin ella, dnsmasq no puede contactar al DNS upstream
    iptables -A OUTPUT -p udp -d $PRIMARY_DNS --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d $PRIMARY_DNS --dport 53 -j ACCEPT

    # 5. Bloquear DNS a otros servidores (previene bypass)
    iptables -A OUTPUT -p udp --dport 53 -j DROP
    iptables -A OUTPUT -p tcp --dport 53 -j DROP

    # 6. Bloquear VPN (previene bypass)
    iptables -A OUTPUT -p udp --dport 1194 -j DROP  # OpenVPN
    iptables -A OUTPUT -p udp --dport 51820 -j DROP # WireGuard
    iptables -A OUTPUT -p tcp --dport 1723 -j DROP  # PPTP

    # 7. Bloquear Tor (previene bypass)
    iptables -A OUTPUT -p tcp --dport 9001 -j DROP
    iptables -A OUTPUT -p tcp --dport 9030 -j DROP

    # 8. ✅ PERMITIR HTTP/HTTPS A CUALQUIER IP (confiamos en DNS Sinkhole)
    iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

    # 9. Permitir NTP
    iptables -A OUTPUT -p udp --dport 123 -j ACCEPT

    # 10. Permitir tráfico a redes privadas
    iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT
    iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
    iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

    # 11. Denegar todo lo demás
    iptables -A OUTPUT -j DROP

    # Guardar reglas con iptables-persistent
    if command -v iptables-save >/dev/null 2>&1; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
        log "✓ Firewall configurado y guardado (DNS Sinkhole mode)"
    else
        log "⚠️  iptables-save no disponible - reglas NO persistirán"
    fi

    return 0
}

# Función para limpiar sistema (fail-open)
cleanup_system() {
    log "Limpiando sistema - Modo fail-open activado"

    # Limpiar firewall PRIMERO (para no bloquear nada)
    cleanup_firewall

    # Configurar dnsmasq en modo passthrough (resuelve todo)
    cat > "$DNSMASQ_CONF" << EOF
# =============================================
# URL Whitelist - MODO FAIL-OPEN
# dnsmasq en modo passthrough (permite todo)
# =============================================

# Resolver todo contra DNS primario
server=$PRIMARY_DNS
EOF

    # Reiniciar dnsmasq
    systemctl restart dnsmasq 2>/dev/null || true
    sleep 2

    # CRÍTICO: Verificar que dnsmasq reinició correctamente
    if ! systemctl is-active --quiet dnsmasq 2>/dev/null; then
        log "⚠ ADVERTENCIA: dnsmasq falló al reiniciar en modo passthrough"
        log "Configurando DNS directo a $PRIMARY_DNS (bypass de dnsmasq)"

        # Cambiar /etc/resolv.conf para apuntar directamente al DNS upstream
        # Esto asegura que el DNS funciona incluso si dnsmasq está caído
        cat > /etc/resolv.conf << EOF
# Configuración de emergencia - DNS directo (bypass dnsmasq)
nameserver $PRIMARY_DNS
nameserver 8.8.8.8
search lan
EOF
        log "✓ DNS configurado directamente a $PRIMARY_DNS"
    else
        # dnsmasq funciona - asegurar que /etc/resolv.conf apunta a localhost
        if ! grep -q "nameserver 127.0.0.1" /etc/resolv.conf 2>/dev/null; then
            cat > /etc/resolv.conf << EOF
nameserver 127.0.0.1
search lan
EOF
            log "✓ DNS configurado a localhost (dnsmasq en modo passthrough)"
        fi
    fi

    log "Sistema en modo fail-open - Sin restricciones"
}

# Función para descargar whitelist
download_whitelist() {
    # Verificar si estamos en modo offline
    if [ "${OFFLINE_MODE:-false}" = true ]; then
        log "MODO OFFLINE: Saltando descarga de whitelist (usando solo BASE_URLS)"
        return 1  # Retornar 1 para que main() use solo BASE_URLS
    fi

    log "Descargando whitelist desde: $WHITELIST_URL"

    if timeout 30 curl -L -f -s "$WHITELIST_URL" -o "${WHITELIST_FILE}.tmp" 2>/dev/null; then
        if [ -s "${WHITELIST_FILE}.tmp" ]; then
            mv "${WHITELIST_FILE}.tmp" "$WHITELIST_FILE"
            log "✓ Whitelist descargado exitosamente"
            return 0
        else
            log "ERROR: Archivo descargado está vacío"
            rm -f "${WHITELIST_FILE}.tmp"
            return 1
        fi
    else
        log "ERROR: No se pudo descargar whitelist"
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

    # Deduplicar dominios - eliminar subdominios si dominio base existe
    # Ejemplo: si "google.com" existe, eliminar "www.google.com", "api.google.com"
    DEDUPLICATED_URLS=()
    for domain in "${ALL_URLS[@]}"; do
        # Verificar si algún dominio base de este dominio ya existe
        IS_REDUNDANT=false

        # Extraer partes del dominio (ejemplo: www.api.google.com → google.com)
        # Intentar con cada sufijo posible
        PARTS=(${domain//./ })
        NUM_PARTS=${#PARTS[@]}

        # Intentar combinaciones: google.com, api.google.com, www.api.google.com
        for ((i=1; i<$NUM_PARS; i++)); do
            BASE_DOMAIN="${PARTS[@]:$i}"
            BASE_DOMAIN="${BASE_DOMAIN// /.}"

            # Verificar si este dominio base ya existe en la lista
            for existing in "${DEDUPLICATED_URLS[@]}"; do
                if [ "$existing" = "$BASE_DOMAIN" ]; then
                    IS_REDUNDANT=true
                    break 2
                fi
            done
        done

        if [ "$IS_REDUNDANT" = false ]; then
            DEDUPLICATED_URLS+=("$domain")
        fi
    done

    ALL_URLS=("${DEDUPLICATED_URLS[@]}")
    log "Total de dominios en whitelist (después de deduplicación): ${#ALL_URLS[@]}"

    # Resolver solo dominios en whitelist contra DNS primario
    echo "# Dominios permitidos (resueltos contra DNS primario: $PRIMARY_DNS)" >> "$TEMP_CONF"
    for domain in "${ALL_URLS[@]}"; do
        # Resolver este dominio contra el DNS primario
        echo "server=/${domain}/${PRIMARY_DNS}" >> "$TEMP_CONF"
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

    # NO usar address=/#/127.0.0.1 - bloquea TODO (incluida whitelist)
    # Los dominios no-whitelist retornan NXDOMAIN naturalmente (sin server=)
    echo "# Dominios no en whitelist retornan NXDOMAIN (no resuelven)" >> "$TEMP_CONF"

    mv "$TEMP_CONF" "$DNSMASQ_CONF"

    if [ "$IPSET_SUPPORTED" = true ]; then
        log "Configuración dnsmasq generada con ${#ALL_URLS[@]} dominios + ipset + DNS sinkhole"
    else
        log "Configuración dnsmasq generada con ${#ALL_URLS[@]} dominios + DNS sinkhole (sin ipset)"
    fi
}

# Función para verificar si la configuración cambió
has_config_changed() {
    # Si DNS cambió, forzar actualización
    if [ "$DNS_CHANGED" = true ]; then
        log "DNS cambió - forzando actualización de configuración"
        return 0
    fi

    if [ ! -f "$DNSMASQ_CONF_HASH" ]; then
        return 0
    fi

    NEW_HASH=$(md5sum "$DNSMASQ_CONF" | cut -d' ' -f1)
    OLD_HASH=$(cat "$DNSMASQ_CONF_HASH" 2>/dev/null || echo "")

    if [ "$NEW_HASH" != "$OLD_HASH" ]; then
        log "Detectado cambio en configuración dnsmasq"
        return 0
    else
        log "No hay cambios en configuración ni en DNS"
        return 1
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
    DOWNLOAD_SUCCESS=false
    if download_whitelist; then
        DOWNLOAD_SUCCESS=true
        if check_emergency_disable; then
            log "=== SISTEMA DESACTIVADO REMOTAMENTE ==="
            cleanup_system
            return
        fi
    else
        # Si falla descarga, verificar si es modo offline
        if [ "${OFFLINE_MODE:-false}" = true ]; then
            log "=== Modo OFFLINE: Usando solo BASE_URLS hardcodeadas ==="
            # Continuar con configuración usando solo BASE_URLS
        else
            # Fallo real de descarga (no modo offline)
            log "=== No se pudo descargar whitelist - Modo fail-open ==="
            cleanup_system
            return
        fi
    fi

    # Generar config dnsmasq
    generate_dnsmasq_config

    if has_config_changed; then
        # Validar configuración de dnsmasq antes de reiniciar
        log "Validando configuración de dnsmasq..."
        DNSMASQ_TEST_OUTPUT=$(dnsmasq --test 2>&1)
        if ! echo "$DNSMASQ_TEST_OUTPUT" | grep -qi "syntax check OK\|sintaxis correcta"; then
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

                # VALIDAR DNS antes de configurar firewall
                log "Validando que dnsmasq resuelve DNS correctamente..."
                if timeout 5 dig @127.0.0.1 google.com +short +time=3 >/dev/null 2>&1; then
                    log "✓ DNS funcional - Procediendo con firewall"

                    # Configurar firewall SOLO si todo está validado
                    configure_firewall
                else
                    log "⚠️  DNS no funcional - firewall en modo permisivo (fail-safe)"
                    cleanup_firewall
                fi
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
    else
        # Si la config no cambió, verificar que firewall sigue configurado
        log "Configuración sin cambios - Verificando firewall..."
        # Verificar si hay regla que bloquea DNS a servidores alternativos
        CURRENT_RULES=$(iptables -L OUTPUT -n 2>/dev/null | grep -c "dpt:53.*DROP" || echo "0")
        if [ "$CURRENT_RULES" -lt 2 ]; then
            log "⚠️  Firewall no configurado correctamente - Reconfigurando..."
            configure_firewall
        else
            log "✓ Firewall ya configurado ($CURRENT_RULES reglas de bloqueo DNS)"
        fi
    fi

    if [ "$DOWNLOAD_SUCCESS" = true ]; then
        log "=== Sistema actualizado exitosamente ==="
    else
        log "=== Sistema configurado en MODO OFFLINE (solo BASE_URLS) ==="
        log "El timer descargará la whitelist completa cuando haya conectividad"
    fi
}

main
log "=== Proceso finalizado ==="
SCRIPT_EOF

# Reemplazar placeholder con URL configurada
sed -i "s|__WHITELIST_URL__|$WHITELIST_URL|g" /usr/local/bin/dnsmasq-whitelist.sh

chmod +x /usr/local/bin/dnsmasq-whitelist.sh
echo "Script dnsmasq-whitelist creado con URL: $WHITELIST_URL"

# Configurar dnsmasq base
echo ""
echo "[7/10] Configurando dnsmasq..."
if [ ! -f /etc/dnsmasq.conf.backup-whitelist ]; then
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup-whitelist 2>/dev/null || true
    echo "Backup creado: /etc/dnsmasq.conf.backup-whitelist"
fi

# Eliminar configuración previa del whitelist si existe (evitar duplicados)
if grep -q "URL Whitelist Configuration" /etc/dnsmasq.conf 2>/dev/null; then
    echo "Eliminando configuración previa del whitelist..."
    # Restaurar desde backup y limpiar
    if [ -f /etc/dnsmasq.conf.backup-whitelist ]; then
        cp /etc/dnsmasq.conf.backup-whitelist /etc/dnsmasq.conf
        echo "✓ Configuración restaurada desde backup"
    else
        # Si no hay backup, eliminar manualmente la sección del whitelist
        sed -i '/# URL Whitelist Configuration/,/^$/d' /etc/dnsmasq.conf
        echo "✓ Configuración previa eliminada"
    fi
fi

cat >> /etc/dnsmasq.conf << DNSMASQ_EOF

# =============================================
# URL Whitelist Configuration v2.0
# =============================================

# Listen only on localhost
listen-address=127.0.0.1
# bind-interfaces removed - can cause issues with localhost

# Don't read /etc/resolv.conf (usaremos server= explícito)
no-resolv

# Read configuration from this directory
conf-dir=/etc/dnsmasq.d/,*.conf

# Cache size
cache-size=1000

# La configuración del servidor DNS upstream es gestionada dinámicamente por dnsmasq-whitelist.sh
# No se debe definir un servidor global en este fichero.

# Enable logging for debugging (uncomment if needed)
#log-queries
#log-facility=/var/log/dnsmasq.log
DNSMASQ_EOF

# Crear override de systemd para evitar --local-service
echo "Creando override de systemd para dnsmasq..."
mkdir -p /etc/systemd/system/dnsmasq.service.d
cat > /etc/systemd/system/dnsmasq.service.d/override.conf << 'OVERRIDE_EOF'
[Unit]
# Limpiar dependencias del servicio original
Requires=
Wants=
Before=
After=network-online.target

[Service]
# Limpiar todo del servicio original
Type=simple
PIDFile=
ExecStart=
ExecStartPre=
ExecStartPost=
ExecStop=
Environment=

# Definir el nuevo comportamiento
ExecStart=/usr/sbin/dnsmasq --keep-in-foreground --no-resolv --conf-file=/etc/dnsmasq.conf
StandardOutput=journal
StandardError=journal
Restart=always
RestartSec=5
OVERRIDE_EOF
echo "✓ Override de systemd creado"
systemctl daemon-reload
echo "✓ Systemd recargado"

# Configurar DNS del sistema
echo ""
echo "[8/10] Configurando DNS del sistema..."

# Crear backup de /etc/resolv.conf preservando su tipo (symlink o archivo)
if [ ! -f /etc/resolv.conf.backup-whitelist ] && [ ! -f /etc/resolv.conf.backup-whitelist.symlink ]; then
    if [ -L /etc/resolv.conf ]; then
        # Es symlink - guardar la ruta del symlink
        readlink /etc/resolv.conf > /etc/resolv.conf.backup-whitelist.symlink
        echo "Backup creado: /etc/resolv.conf.backup-whitelist.symlink (era symlink)"
    elif [ -f /etc/resolv.conf ]; then
        # Es archivo regular - copiar contenido
        cp /etc/resolv.conf /etc/resolv.conf.backup-whitelist
        echo "Backup creado: /etc/resolv.conf.backup-whitelist (era archivo)"
    fi
fi

# NO cambiar DNS aquí - lo haremos DESPUÉS de validar dnsmasq
# La descarga de whitelist se hará con el DNS actual del sistema
echo "Manteniendo DNS actual del sistema durante la instalación inicial..."

# Crear servicios systemd
echo ""
echo "[9/10] Creando servicios systemd..."

# Servicio de whitelist
cat > /etc/systemd/system/dnsmasq-whitelist.service << 'SERVICE_EOF'
[Unit]
Description=dnsmasq URL Whitelist Manager
After=network-online.target dnsmasq.service
Wants=network-online.target
Requires=dnsmasq.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnsmasq-whitelist.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

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
Wants=network-online.target
Requires=dnsmasq.service dnsmasq-whitelist.service

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

# Configurar logrotate para evitar que los logs crezcan indefinidamente
echo "Configurando rotación de logs..."
cat > /etc/logrotate.d/url-whitelist << 'LOGROTATE_EOF'
/var/log/url-whitelist.log /var/log/captive-portal-detector.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    sharedscripts
    postrotate
        systemctl reload dnsmasq >/dev/null 2>&1 || true
    endscript
}
LOGROTATE_EOF
echo "✓ Configuración de logrotate creada"

# Recargar systemd
systemctl daemon-reload

# Deshabilitar servicios antiguos si existen
if systemctl is-enabled url-whitelist.timer &>/dev/null; then
    echo "Deshabilitando timer antiguo url-whitelist.timer..."
    systemctl disable --now url-whitelist.timer 2>/dev/null || true
fi

# Habilitar servicios
systemctl enable dnsmasq.service
systemctl enable dnsmasq-whitelist.service
systemctl enable dnsmasq-whitelist.timer
systemctl enable captive-portal-detector.service

echo "✓ Servicios habilitados para arranque automático"

# Inicializar sistema
echo ""
echo "[10/10] Inicializando sistema..."

# PASO 1: Ejecutar script de whitelist para configurar y arrancar dnsmasq
echo "Ejecutando configuración inicial de whitelist y arrancando dnsmasq..."

# Pasar variable de entorno OFFLINE_MODE al script de whitelist
if [ "${OFFLINE_MODE:-false}" = true ]; then
    export OFFLINE_MODE=true
fi

if ! /usr/local/bin/dnsmasq-whitelist.sh; then
    echo ""
    echo "✗ ERROR: El script de whitelist falló"
    cleanup_failed_installation
    echo "Revisa los logs en: /var/log/url-whitelist.log"
    echo "Para intentar de nuevo después de arreglar el problema:"
    echo "  sudo ./setup-dnsmasq-whitelist.sh"
    exit 1
fi
echo "✓ Script de whitelist ejecutado y dnsmasq configurado"

# PASO 2: VALIDAR que dnsmasq funciona correctamente
echo ""
echo "Validando que dnsmasq está funcionando correctamente..."
if ! validate_dnsmasq; then
    echo ""
    echo "✗ ERROR: dnsmasq no funciona correctamente"
    echo ""
    echo "Estado de dnsmasq:"
    systemctl status dnsmasq --no-pager || true
    echo ""
    cleanup_failed_installation
    echo "Para diagnosticar el problema:"
    echo "  1. Revisa logs: sudo journalctl -u dnsmasq -n 50"
    echo "  2. Revisa configuración: sudo dnsmasq --test"
    echo "  3. Vuelve a intentar la instalación: sudo ./setup-dnsmasq-whitelist.sh"
    exit 1
fi
echo "✓ dnsmasq validado correctamente"

# PASO 3: Validar de nuevo que dnsmasq sigue funcionando después de la configuración
echo ""
echo "Re-validando dnsmasq después de aplicar configuración..."
if ! validate_dnsmasq; then
    echo ""
    echo "✗ ERROR: dnsmasq dejó de funcionar después de aplicar la configuración"
    echo ""
    cleanup_failed_installation
    echo "La configuración generada puede tener errores de sintaxis"
    echo "Revisa: sudo dnsmasq --test"
    exit 1
fi
echo "✓ dnsmasq funciona correctamente con la nueva configuración"

# Verificar que ipset está poblado
IPSET_COUNT=$(ipset list url_whitelist 2>/dev/null | grep "^[0-9]" | wc -l)
echo "ipset contiene $IPSET_COUNT IPs"
if [ "$IPSET_COUNT" -eq 0 ]; then
    echo "⚠ ADVERTENCIA: ipset está vacío, pero continuando (dnsmasq lo poblará dinámicamente)"
fi

# TODO VALIDADO - Configurar DNS final (apuntar a localhost)
echo ""
echo "✓ Todas las validaciones pasadas - Configurando DNS a localhost..."
# Eliminar symlink si existe y crear archivo estático
rm -f /etc/resolv.conf
cat > /etc/resolv.conf << EOF
nameserver 127.0.0.1
search lan
EOF
chmod 644 /etc/resolv.conf
echo "✓ /etc/resolv.conf configurado como archivo estático (no symlink)"

# Probar resolución a través de localhost
echo "Probando resolución DNS a través de localhost..."
if ! timeout 5 nslookup google.com 127.0.0.1 >/dev/null 2>&1; then
    echo "✗ ERROR: No se puede resolver DNS a través de localhost"
    echo "ERROR CRÍTICO: dnsmasq no está resolviendo correctamente"
    echo "Esto NO debería ocurrir después de las validaciones previas"
    echo ""
    echo "Manteniendo DNS actual (no se cambiará)"
    echo "Revisa: sudo journalctl -u dnsmasq -n 50"
    exit 1
fi
echo "✓ DNS funcionando correctamente a través de localhost"

# Iniciar servicios
echo ""
echo "Iniciando servicios systemd..."
systemctl start dnsmasq-whitelist.timer
echo "✓ Timer de whitelist iniciado"

# Esperar brevemente y verificar que ipset sigue poblado
sleep 3
IPSET_COUNT_AFTER=$(ipset list url_whitelist 2>/dev/null | grep "^[0-9]" | wc -l)
echo "ipset después de iniciar timer: $IPSET_COUNT_AFTER IPs"

# Iniciar detector de portal cautivo
systemctl start captive-portal-detector.service
echo "✓ Detector de portal cautivo iniciado"

echo ""
echo "======================================================"
echo "  ¡Instalación completada exitosamente!"
echo "======================================================"
echo ""
echo "Arquitectura v3.0 CORREGIDA (Híbrida):"
echo "  ✓ DNS Selectivo: solo resuelve dominios whitelisted (NXDOMAIN para resto)"
echo "  ✓ Firewall simplificado: permite HTTP/HTTPS a cualquier IP (confía en DNS)"
echo "  ✓ Bloqueo de bypass: VPN, Tor, DNS alternativo bloqueados"
echo "  ✓ Detector portal cautivo: desactiva firewall si no estás autenticado"
echo "  ✓ SIN ipset: elimina problemas con IPs dinámicas de CDN"
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