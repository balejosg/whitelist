#!/bin/bash

# Script para recolectar información de depuración para el sistema de whitelist.
# Ejecutar con sudo: sudo ./collect_debug_info.sh

OUTPUT_FILE="debug_info.txt"

# Limpiar el fichero de salida si ya existe
> "$OUTPUT_FILE"

echo "### Recolectando información de depuración... ###" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# --- Información del sistema ---
echo "--- Información del sistema ---" >> "$OUTPUT_FILE"
echo "Fecha: $(date)" >> "$OUTPUT_FILE"
echo "Kernel: $(uname -a)" >> "$OUTPUT_FILE"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "Distribución: $PRETTY_NAME" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# --- Estado de los servicios ---
echo "--- Estado de los servicios ---" >> "$OUTPUT_FILE"
echo ">> systemctl status dnsmasq" >> "$OUTPUT_FILE"
systemctl status dnsmasq >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo ">> systemctl status dnsmasq-whitelist.timer" >> "$OUTPUT_FILE"
systemctl status dnsmasq-whitelist.timer >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo ">> systemctl status captive-portal-detector.service" >> "$OUTPUT_FILE"
systemctl status captive-portal-detector.service >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

# --- Procesos ---
echo "--- Procesos ---" >> "$OUTPUT_FILE"
echo ">> ps aux | grep dnsmasq" >> "$OUTPUT_FILE"
ps aux | grep dnsmasq >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

# --- Configuración de red ---
echo "--- Configuración de red ---" >> "$OUTPUT_FILE"
echo ">> cat /etc/resolv.conf" >> "$OUTPUT_FILE"
cat /etc/resolv.conf >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

# --- Reglas de Firewall ---
echo "--- Reglas de Firewall ---" >> "$OUTPUT_FILE"
echo ">> iptables -L OUTPUT -n -v" >> "$OUTPUT_FILE"
iptables -L OUTPUT -n -v >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

# --- Configuración de dnsmasq ---
echo "--- Configuración de dnsmasq ---" >> "$OUTPUT_FILE"
echo ">> cat /etc/dnsmasq.conf" >> "$OUTPUT_FILE"
cat /etc/dnsmasq.conf >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo ">> cat /etc/dnsmasq.d/url-whitelist.conf" >> "$OUTPUT_FILE"
cat /etc/dnsmasq.d/url-whitelist.conf >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

# --- Logs ---
echo "--- Logs ---" >> "$OUTPUT_FILE"
echo ">> cat /var/log/url-whitelist.log" >> "$OUTPUT_FILE"
cat /var/log/url-whitelist.log >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo ">> cat /var/log/captive-portal-detector.log" >> "$OUTPUT_FILE"
cat /var/log/captive-portal-detector.log >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo ">> journalctl -u dnsmasq -n 50 --no-pager" >> "$OUTPUT_FILE"
journalctl -u dnsmasq -n 50 --no-pager >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

# --- Verificación de DNS ---
echo "--- Verificación de DNS ---" >> "$OUTPUT_FILE"
echo ">> dig google.com" >> "$OUTPUT_FILE"
dig google.com >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo ">> dig example.com" >> "$OUTPUT_FILE"
dig example.com >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "### ¡Recolección de información completada! ###" | tee -a "$OUTPUT_FILE"
echo "El fichero de depuración se ha guardado en: $OUTPUT_FILE" | tee -a "$OUTPUT_FILE"