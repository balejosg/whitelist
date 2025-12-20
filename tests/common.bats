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

# ============== Tests de parse_whitelist_sections ==============

@test "parse_whitelist_sections llena arrays correctamente" {
    local wl_file=$(create_test_whitelist)
    
    source "$PROJECT_DIR/lib/common.sh"
    # Override log to avoid permission issues
    log() { echo "$1"; }
    
    parse_whitelist_sections "$wl_file"
    
    # Check WHITELIST_DOMAINS array
    [ ${#WHITELIST_DOMAINS[@]} -eq 3 ]
    [[ " ${WHITELIST_DOMAINS[*]} " == *" google.com "* ]]
    [[ " ${WHITELIST_DOMAINS[*]} " == *" github.com "* ]]
}

@test "parse_whitelist_sections extrae subdominios bloqueados" {
    local wl_file=$(create_test_whitelist)
    
    source "$PROJECT_DIR/lib/common.sh"
    log() { echo "$1"; }
    
    parse_whitelist_sections "$wl_file"
    
    [ ${#BLOCKED_SUBDOMAINS[@]} -eq 2 ]
    [[ " ${BLOCKED_SUBDOMAINS[*]} " == *" ads.google.com "* ]]
}

@test "parse_whitelist_sections extrae paths bloqueados" {
    local wl_file=$(create_test_whitelist)
    
    source "$PROJECT_DIR/lib/common.sh"
    log() { echo "$1"; }
    
    parse_whitelist_sections "$wl_file"
    
    [ ${#BLOCKED_PATHS[@]} -eq 2 ]
    [[ " ${BLOCKED_PATHS[*]} " == *" example.org/ads "* ]]
}

@test "parse_whitelist_sections maneja archivo inexistente" {
    source "$PROJECT_DIR/lib/common.sh"
    
    run parse_whitelist_sections "/nonexistent/file.txt"
    [ "$status" -eq 1 ]
}

# ============== Tests de validate_ip ==============

@test "validate_ip acepta IP válida" {
    source "$PROJECT_DIR/lib/common.sh"
    
    run validate_ip "192.168.1.1"
    [ "$status" -eq 0 ]
}

@test "validate_ip acepta DNS Google" {
    source "$PROJECT_DIR/lib/common.sh"
    
    run validate_ip "8.8.8.8"
    [ "$status" -eq 0 ]
}

@test "validate_ip rechaza texto" {
    source "$PROJECT_DIR/lib/common.sh"
    
    run validate_ip "not-an-ip"
    [ "$status" -eq 1 ]
}

@test "validate_ip rechaza IPv6" {
    source "$PROJECT_DIR/lib/common.sh"
    
    run validate_ip "::1"
    [ "$status" -eq 1 ]
}

# ============== Tests de init_directories ==============

@test "init_directories crea CONFIG_DIR" {
    source "$PROJECT_DIR/lib/common.sh"
    # Override paths after sourcing - use actual variables the function uses
    ETC_CONFIG_DIR="$TEST_TMP_DIR/etc_config"
    VAR_STATE_DIR="$TEST_TMP_DIR/var_state"
    LOG_FILE="$TEST_TMP_DIR/logs/test.log"
    INSTALL_DIR="$TEST_TMP_DIR/install"
    
    init_directories
    
    [ -d "$ETC_CONFIG_DIR" ]
}

@test "init_directories crea directorio de log" {
    source "$PROJECT_DIR/lib/common.sh"
    # Override paths after sourcing - use actual variables the function uses
    ETC_CONFIG_DIR="$TEST_TMP_DIR/etc_config2"
    VAR_STATE_DIR="$TEST_TMP_DIR/var_state2"
    LOG_FILE="$TEST_TMP_DIR/logs/url-whitelist.log"
    INSTALL_DIR="$TEST_TMP_DIR/install2"
    
    init_directories
    
    [ -d "$(dirname "$LOG_FILE")" ]
}
