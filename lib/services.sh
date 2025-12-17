#!/bin/bash
################################################################################
# services.sh - Funciones de gestión de servicios systemd
# Parte del sistema dnsmasq URL Whitelist v3.5
################################################################################

# Crear todos los servicios systemd
create_systemd_services() {
    log "Creando servicios systemd..."
    
    create_whitelist_service
    create_whitelist_timer
    create_watchdog_service
    create_watchdog_timer
    create_captive_portal_service
    create_dnsmasq_override
    create_tmpfiles_config
    
    systemctl daemon-reload
    
    log "✓ Servicios systemd creados"
}

# Servicio de actualización de whitelist
create_whitelist_service() {
    cat > /etc/systemd/system/dnsmasq-whitelist.service << 'EOF'
[Unit]
Description=Update dnsmasq URL Whitelist
After=network-online.target dnsmasq.service
Wants=network-online.target
Requires=dnsmasq.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnsmasq-whitelist.sh
TimeoutStartSec=120
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
}

# Timer para actualización periódica
create_whitelist_timer() {
    cat > /etc/systemd/system/dnsmasq-whitelist.timer << 'EOF'
[Unit]
Description=Timer for dnsmasq URL Whitelist Update
After=network-online.target

[Timer]
OnBootSec=2min
OnCalendar=*:0/5
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF
}

# Servicio watchdog
create_watchdog_service() {
    cat > /etc/systemd/system/dnsmasq-watchdog.service << 'EOF'
[Unit]
Description=dnsmasq Health Check and Auto-Recovery
After=dnsmasq.service
Wants=dnsmasq.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnsmasq-watchdog.sh
StandardOutput=journal
StandardError=journal
SuccessExitStatus=0 1

[Install]
WantedBy=multi-user.target
EOF
}

# Timer watchdog
create_watchdog_timer() {
    cat > /etc/systemd/system/dnsmasq-watchdog.timer << 'EOF'
[Unit]
Description=Timer for dnsmasq Health Check
After=dnsmasq.service

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=10s
Persistent=true

[Install]
WantedBy=timers.target
EOF
}

# Servicio detector de portal cautivo
create_captive_portal_service() {
    cat > /etc/systemd/system/captive-portal-detector.service << 'EOF'
[Unit]
Description=Captive Portal Detector for URL Whitelist
After=network-online.target dnsmasq.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/captive-portal-detector.sh
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
}

# Override de dnsmasq para inicializar DNS upstream
create_dnsmasq_override() {
    mkdir -p /etc/systemd/system/dnsmasq.service.d
    cat > /etc/systemd/system/dnsmasq.service.d/whitelist-override.conf << 'EOF'
[Service]
ExecStartPre=/usr/local/bin/dnsmasq-init-resolv.sh
EOF
}

# Habilitar y arrancar servicios
enable_services() {
    log "Habilitando servicios..."
    
    systemctl enable dnsmasq
    systemctl enable dnsmasq-whitelist.timer
    systemctl enable dnsmasq-watchdog.timer
    systemctl enable captive-portal-detector.service
    
    systemctl start dnsmasq-whitelist.timer
    systemctl start dnsmasq-watchdog.timer
    systemctl start captive-portal-detector.service
    
    log "✓ Servicios habilitados y arrancados"
}

# Deshabilitar servicios
disable_services() {
    log "Deshabilitando servicios..."
    
    systemctl stop dnsmasq-whitelist.timer 2>/dev/null || true
    systemctl stop dnsmasq-watchdog.timer 2>/dev/null || true
    systemctl stop captive-portal-detector.service 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true
    
    systemctl disable dnsmasq-whitelist.timer 2>/dev/null || true
    systemctl disable dnsmasq-watchdog.timer 2>/dev/null || true
    systemctl disable captive-portal-detector.service 2>/dev/null || true
    
    log "✓ Servicios deshabilitados"
}

# Eliminar servicios
remove_services() {
    log "Eliminando servicios..."
    
    disable_services
    
    rm -f /etc/systemd/system/dnsmasq-whitelist.service
    rm -f /etc/systemd/system/dnsmasq-whitelist.timer
    rm -f /etc/systemd/system/dnsmasq-watchdog.service
    rm -f /etc/systemd/system/dnsmasq-watchdog.timer
    rm -f /etc/systemd/system/captive-portal-detector.service
    rm -rf /etc/systemd/system/dnsmasq.service.d
    
    systemctl daemon-reload
    
    log "✓ Servicios eliminados"
}

# Configurar logrotate
create_logrotate_config() {
    cat > /etc/logrotate.d/dnsmasq-whitelist << 'EOF'
/var/log/url-whitelist.log
/var/log/captive-portal-detector.log
{
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
    size 10M
}
EOF
}
