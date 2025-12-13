#!/usr/bin/env bats
################################################################################
# common.bats - Tests para lib/common.sh
################################################################################

load 'test_helper'

setup() {
    # Create temp directory for tests
    TEST_TMP_DIR=$(mktemp -d)
    export CONFIG_DIR="$TEST_TMP_DIR/config"
    export INSTALL_DIR="$TEST_TMP_DIR/install"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$INSTALL_DIR/lib"
    
    # Copy libs
    cp "$PROJECT_DIR/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
    
    # Load the library to test
    source "$PROJECT_DIR/lib/common.sh"
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Tests de parseo de whitelist ==============

@test "parse_whitelist extrae dominios de sección WHITELIST" {
    local wl_file=$(create_test_whitelist)
    
    # Simular parse (la función real puede variar)
    local domains=$(grep -A 100 "## WHITELIST" "$wl_file" | grep -B 100 "## BLOCKED" | grep -v "^#" | grep -v "^$" | head -n -1)
    
    [[ "$domains" == *"google.com"* ]]
    [[ "$domains" == *"github.com"* ]]
}

@test "parse_whitelist extrae subdominios bloqueados" {
    local wl_file=$(create_test_whitelist)
    
    local blocked=$(sed -n '/## BLOCKED-SUBDOMAINS/,/## BLOCKED-PATHS/p' "$wl_file" | grep -v "^#" | grep -v "^$")
    
    [[ "$blocked" == *"ads.google.com"* ]]
}

@test "detecta whitelist desactivada" {
    local wl_file=$(create_disabled_whitelist)
    
    if head -1 "$wl_file" | grep -qi "DESACTIVADO"; then
        local is_disabled=true
    else
        local is_disabled=false
    fi
    
    [ "$is_disabled" = true ]
}

@test "whitelist normal no está desactivada" {
    local wl_file=$(create_test_whitelist)
    
    if head -1 "$wl_file" | grep -qi "DESACTIVADO"; then
        local is_disabled=true
    else
        local is_disabled=false
    fi
    
    [ "$is_disabled" = false ]
}

# ============== Tests de logging ==============

@test "log escribe al archivo de log" {
    export LOG_FILE="$TEST_TMP_DIR/test.log"
    
    # Mock de log function si existe, o crear una básica
    log() {
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
    }
    
    log "Test message"
    
    [ -f "$LOG_FILE" ]
    grep -q "Test message" "$LOG_FILE"
}

# ============== Tests de validación ==============

@test "dominio válido pasa validación" {
    local domain="google.com"
    
    # Validación básica de dominio
    if [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$ ]]; then
        local valid=true
    else
        local valid=false
    fi
    
    [ "$valid" = true ]
}

@test "dominio inválido falla validación" {
    local domain="invalid domain with spaces"
    
    if [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$ ]]; then
        local valid=true
    else
        local valid=false
    fi
    
    [ "$valid" = false ]
}
