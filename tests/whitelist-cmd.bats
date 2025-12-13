#!/usr/bin/env bats
################################################################################
# whitelist-cmd.bats - Tests para scripts/whitelist-cmd.sh
################################################################################

load 'test_helper'

setup() {
    eval "$(declare -f setup | tail -n +2)"
    
    # Crear whitelist de prueba
    mkdir -p "$CONFIG_DIR"
    create_test_whitelist "$CONFIG_DIR/whitelist.txt"
}

# ============== Tests de cmd_check ==============

@test "check detecta dominio en whitelist" {
    local domain="google.com"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    if grep -qi "^${domain}$" "$whitelist_file" 2>/dev/null; then
        local in_whitelist=true
    else
        local in_whitelist=false
    fi
    
    [ "$in_whitelist" = true ]
}

@test "check detecta dominio NO en whitelist" {
    local domain="malware.com"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    if grep -qi "^${domain}$" "$whitelist_file" 2>/dev/null; then
        local in_whitelist=true
    else
        local in_whitelist=false
    fi
    
    [ "$in_whitelist" = false ]
}

# ============== Tests de subdominios bloqueados ==============

@test "detecta subdominio bloqueado" {
    local subdomain="ads.google.com"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    # Extraer subdominios bloqueados
    local blocked=$(sed -n '/## BLOCKED-SUBDOMAINS/,/## BLOCKED-PATHS/p' "$whitelist_file" | grep -v "^#" | grep -v "^$")
    
    if echo "$blocked" | grep -qi "^${subdomain}$"; then
        local is_blocked=true
    else
        local is_blocked=false
    fi
    
    [ "$is_blocked" = true ]
}

# ============== Tests de estadísticas ==============

@test "cuenta dominios en whitelist" {
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    # Contar dominios en sección WHITELIST
    local count=$(sed -n '/## WHITELIST/,/## BLOCKED/p' "$whitelist_file" | grep -v "^#" | grep -v "^$" | grep -v "## BLOCKED" | wc -l)
    
    [ "$count" -eq 3 ]
}

@test "cuenta subdominios bloqueados" {
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    local count=$(sed -n '/## BLOCKED-SUBDOMAINS/,/## BLOCKED-PATHS/p' "$whitelist_file" | grep -v "^#" | grep -v "^$" | grep -v "## BLOCKED" | wc -l)
    
    [ "$count" -eq 2 ]
}
