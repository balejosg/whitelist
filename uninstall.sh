#!/bin/bash
################################################################################
# uninstall.sh - Desinstalador del sistema whitelist
# Parte del sistema dnsmasq URL Whitelist v3.4
################################################################################

set -e

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Ejecutar con sudo"
    exit 1
fi

echo "======================================================"
echo "  Desinstalación: dnsmasq URL Whitelist System"
echo "======================================================"
echo ""

# Confirmar
if [ "${1:-}" != "--auto-yes" ]; then
    read -p "¿Desinstalar el sistema? (y/N): " confirm
    [[ ! "$confirm" =~ ^[Yy]$ ]] && { echo "Cancelado"; exit 0; }
fi

echo ""
echo "[1/6] Deteniendo servicios..."
systemctl stop dnsmasq-whitelist.timer 2>/dev/null || true
systemctl stop dnsmasq-watchdog.timer 2>/dev/null || true
systemctl stop captive-portal-detector.service 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true

echo "[2/6] Deshabilitando servicios..."
systemctl disable dnsmasq-whitelist.timer 2>/dev/null || true
systemctl disable dnsmasq-watchdog.timer 2>/dev/null || true
systemctl disable captive-portal-detector.service 2>/dev/null || true

echo "[3/6] Eliminando servicios systemd..."
rm -f /etc/systemd/system/dnsmasq-whitelist.service
rm -f /etc/systemd/system/dnsmasq-whitelist.timer
rm -f /etc/systemd/system/dnsmasq-watchdog.service
rm -f /etc/systemd/system/dnsmasq-watchdog.timer
rm -f /etc/systemd/system/captive-portal-detector.service
rm -rf /etc/systemd/system/dnsmasq.service.d
systemctl daemon-reload

echo "[4/6] Restaurando DNS..."
chattr -i /etc/resolv.conf 2>/dev/null || true

if [ -f /var/lib/url-whitelist/resolv.conf.symlink.backup ]; then
    target=$(cat /var/lib/url-whitelist/resolv.conf.symlink.backup)
    ln -sf "$target" /etc/resolv.conf
elif [ -f /var/lib/url-whitelist/resolv.conf.backup ]; then
    cp /var/lib/url-whitelist/resolv.conf.backup /etc/resolv.conf
else
    cat > /etc/resolv.conf << EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF
fi

systemctl enable systemd-resolved 2>/dev/null || true
systemctl enable systemd-resolved.socket 2>/dev/null || true
systemctl start systemd-resolved 2>/dev/null || true

echo "[5/6] Limpiando firewall..."
iptables -F OUTPUT 2>/dev/null || true
iptables -P OUTPUT ACCEPT 2>/dev/null || true
iptables-save > /etc/iptables/rules.v4 2>/dev/null || true

echo "[6/6] Eliminando archivos..."
rm -f /usr/local/bin/dnsmasq-whitelist.sh
rm -f /usr/local/bin/dnsmasq-watchdog.sh
rm -f /usr/local/bin/dnsmasq-init-resolv.sh
rm -f /usr/local/bin/captive-portal-detector.sh
rm -f /usr/local/bin/whitelist
rm -rf /usr/local/lib/whitelist-system
rm -f /etc/dnsmasq.d/url-whitelist.conf
rm -rf /var/lib/url-whitelist
rm -f /var/log/url-whitelist.log
rm -f /var/log/captive-portal-detector.log
rm -f /etc/tmpfiles.d/dnsmasq-whitelist.conf
rm -f /etc/logrotate.d/dnsmasq-whitelist
rm -rf /run/dnsmasq

# Limpiar políticas de navegadores
echo '{"policies": {}}' > /etc/firefox/policies/policies.json 2>/dev/null || true
rm -f /etc/chromium/policies/managed/url-whitelist.json 2>/dev/null || true
rm -f /etc/chromium-browser/policies/managed/url-whitelist.json 2>/dev/null || true
rm -f /etc/opt/chrome/policies/managed/url-whitelist.json 2>/dev/null || true

echo ""
echo "======================================================"
echo "  ✓ DESINSTALACIÓN COMPLETADA"
echo "======================================================"
echo ""
echo "Verifica conectividad: ping google.com"
echo ""

# Test
if ping -c 2 8.8.8.8 >/dev/null 2>&1; then
    echo "✓ Conectividad: OK"
else
    echo "✗ Sin conectividad"
fi

if timeout 5 nslookup google.com >/dev/null 2>&1; then
    echo "✓ DNS: OK"
else
    echo "⚠ DNS puede necesitar reinicio"
fi
