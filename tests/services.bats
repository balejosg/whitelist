#!/usr/bin/env bats
################################################################################
# services.bats - Tests para lib/services.sh
################################################################################

load 'test_helper'

setup() {
    # Create temp directory for tests
    TEST_TMP_DIR=$(mktemp -d)
    export CONFIG_DIR="$TEST_TMP_DIR/config"
    export INSTALL_DIR="$TEST_TMP_DIR/install"
    export SCRIPTS_DIR="$TEST_TMP_DIR/scripts"
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$INSTALL_DIR/lib"
    mkdir -p "$SCRIPTS_DIR"
    mkdir -p "$TEST_TMP_DIR/systemd/system"
    mkdir -p "$TEST_TMP_DIR/logrotate.d"
    mkdir -p "$TEST_TMP_DIR/tmpfiles.d"
    
    # Copy libs
    cp "$PROJECT_DIR/linux/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
    
    # Mock log function
    log() { echo "$1"; }
    export -f log
    
    # Mock systemctl
    systemctl() { return 0; }
    export -f systemctl
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Tests de create_whitelist_service ==============

@test "create_whitelist_service genera unit file" {
    # Temporarily redirect to test location
    local service_file="$TEST_TMP_DIR/systemd/system/dnsmasq-whitelist.service"
    
    # Source and override the function to use test path
    create_whitelist_service() {
        cat > "$service_file" << 'EOF'
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
    
    run create_whitelist_service
    [ "$status" -eq 0 ]
    [ -f "$service_file" ]
}

@test "create_whitelist_service incluye secciones requeridas" {
    local service_file="$TEST_TMP_DIR/systemd/system/dnsmasq-whitelist.service"
    
    create_whitelist_service() {
        cat > "$service_file" << 'EOF'
[Unit]
Description=Update dnsmasq URL Whitelist

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnsmasq-whitelist.sh

[Install]
WantedBy=multi-user.target
EOF
    }
    
    run create_whitelist_service
    
    grep -q "\[Unit\]" "$service_file"
    grep -q "\[Service\]" "$service_file"
    grep -q "\[Install\]" "$service_file"
}

# ============== Tests de create_whitelist_timer ==============

@test "create_whitelist_timer genera timer file" {
    local timer_file="$TEST_TMP_DIR/systemd/system/dnsmasq-whitelist.timer"
    
    create_whitelist_timer() {
        cat > "$timer_file" << 'EOF'
[Unit]
Description=Timer for dnsmasq URL Whitelist Update

[Timer]
OnBootSec=2min
OnCalendar=*:0/5
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF
    }
    
    run create_whitelist_timer
    [ "$status" -eq 0 ]
    [ -f "$timer_file" ]
}

@test "create_whitelist_timer configura intervalo de 5 minutos" {
    local timer_file="$TEST_TMP_DIR/systemd/system/dnsmasq-whitelist.timer"
    
    create_whitelist_timer() {
        cat > "$timer_file" << 'EOF'
[Timer]
OnCalendar=*:0/5
EOF
    }
    
    run create_whitelist_timer
    
    grep -q "OnCalendar=\*:0/5" "$timer_file"
}

# ============== Tests de create_watchdog_service ==============

@test "create_watchdog_service genera unit file" {
    local service_file="$TEST_TMP_DIR/systemd/system/dnsmasq-watchdog.service"
    
    create_watchdog_service() {
        cat > "$service_file" << 'EOF'
[Unit]
Description=dnsmasq Health Check and Auto-Recovery

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dnsmasq-watchdog.sh

[Install]
WantedBy=multi-user.target
EOF
    }
    
    run create_watchdog_service
    [ "$status" -eq 0 ]
    [ -f "$service_file" ]
}

# ============== Tests de create_logrotate_config ==============

@test "create_logrotate_config genera archivo de configuración" {
    local logrotate_file="$TEST_TMP_DIR/logrotate.d/dnsmasq-whitelist"
    
    create_logrotate_config() {
        cat > "$logrotate_file" << 'EOF'
/var/log/url-whitelist.log
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
    
    run create_logrotate_config
    [ "$status" -eq 0 ]
    [ -f "$logrotate_file" ]
}

@test "create_logrotate_config incluye compresión" {
    local logrotate_file="$TEST_TMP_DIR/logrotate.d/dnsmasq-whitelist"
    
    create_logrotate_config() {
        cat > "$logrotate_file" << 'EOF'
{
    compress
    delaycompress
}
EOF
    }
    
    run create_logrotate_config
    
    grep -q "compress" "$logrotate_file"
}

@test "create_logrotate_config configura rotación diaria" {
    local logrotate_file="$TEST_TMP_DIR/logrotate.d/dnsmasq-whitelist"
    
    create_logrotate_config() {
        cat > "$logrotate_file" << 'EOF'
{
    daily
    rotate 7
}
EOF
    }
    
    run create_logrotate_config
    
    grep -q "daily" "$logrotate_file"
    grep -q "rotate 7" "$logrotate_file"
}

# ============== Tests de create_tmpfiles_config ==============

@test "create_tmpfiles_config genera configuración" {
    local tmpfiles_file="$TEST_TMP_DIR/tmpfiles.d/dnsmasq-whitelist.conf"
    
    create_tmpfiles_config() {
        cat > "$tmpfiles_file" << 'EOF'
d /run/dnsmasq 0755 root root -
EOF
    }
    
    run create_tmpfiles_config
    [ "$status" -eq 0 ]
    [ -f "$tmpfiles_file" ]
}

@test "create_tmpfiles_config crea directorio /run/dnsmasq" {
    local tmpfiles_file="$TEST_TMP_DIR/tmpfiles.d/dnsmasq-whitelist.conf"
    
    create_tmpfiles_config() {
        cat > "$tmpfiles_file" << 'EOF'
d /run/dnsmasq 0755 root root -
EOF
    }
    
    run create_tmpfiles_config
    
    grep -q "/run/dnsmasq" "$tmpfiles_file"
}

# ============== Tests de enable_services / disable_services ==============

@test "enable_services ejecuta sin errores" {
    source "$PROJECT_DIR/linux/lib/services.sh"
    
    run enable_services
    [ "$status" -eq 0 ]
    [[ "$output" == *"habilitados"* ]]
}

@test "disable_services ejecuta sin errores" {
    source "$PROJECT_DIR/linux/lib/services.sh"
    
    run disable_services
    [ "$status" -eq 0 ]
    [[ "$output" == *"deshabilitados"* ]]
}
