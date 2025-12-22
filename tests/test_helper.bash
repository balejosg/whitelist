#!/bin/bash
################################################################################
# test_helper.bash - Funciones comunes para tests bats
################################################################################

# Directorio de tests
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$TEST_DIR/.." && pwd)"

# Directorio temporal para tests
TEST_TMP_DIR=""

# Setup antes de cada test
setup() {
    # Crear directorio temporal único para este test
    TEST_TMP_DIR=$(mktemp -d)
    export CONFIG_DIR="$TEST_TMP_DIR/config"
    export INSTALL_DIR="$TEST_TMP_DIR/install"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$INSTALL_DIR/lib"
    
    # Copiar librerías al directorio de test
    cp "$PROJECT_DIR/linux/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
}

# Teardown después de cada test
teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# Helper: crear whitelist de prueba
create_test_whitelist() {
    local file="${1:-$TEST_TMP_DIR/whitelist.txt}"
    cat > "$file" << 'EOF'
## WHITELIST
google.com
github.com
example.org

## BLOCKED-SUBDOMAINS
ads.google.com
tracking.example.org

## BLOCKED-PATHS
example.org/ads
google.com/tracking
EOF
    echo "$file"
}

# Helper: crear whitelist desactivada
create_disabled_whitelist() {
    local file="${1:-$TEST_TMP_DIR/whitelist.txt}"
    cat > "$file" << 'EOF'
#DESACTIVADO

## WHITELIST
google.com
EOF
    echo "$file"
}

# Helper: mock de un comando
mock_command() {
    local cmd="$1"
    local output="$2"
    local exit_code="${3:-0}"
    
    eval "$cmd() { echo '$output'; return $exit_code; }"
    export -f "$cmd"
}
