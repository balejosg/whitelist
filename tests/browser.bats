#!/usr/bin/env bats
################################################################################
# browser.bats - Tests para lib/browser.sh
################################################################################

load 'test_helper'

setup() {
    # Create temp directory for tests
    TEST_TMP_DIR=$(mktemp -d)
    export CONFIG_DIR="$TEST_TMP_DIR/config"
    export INSTALL_DIR="$TEST_TMP_DIR/install"
    export FIREFOX_POLICIES="$TEST_TMP_DIR/firefox/policies/policies.json"
    export CHROMIUM_POLICIES_BASE="$TEST_TMP_DIR/chromium/policies/managed"
    export BROWSER_POLICIES_HASH="$CONFIG_DIR/browser-policies.hash"
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$INSTALL_DIR/lib"
    mkdir -p "$(dirname "$FIREFOX_POLICIES")"
    mkdir -p "$CHROMIUM_POLICIES_BASE"
    
    # Copy libs
    cp "$PROJECT_DIR/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
    
    # Initialize arrays
    BLOCKED_PATHS=()
    BLOCKED_SUBDOMAINS=()
    WHITELIST_DOMAINS=()
    
    # Mock log function
    log() { echo "$1"; }
    export -f log
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Tests de get_policies_hash ==============

@test "get_policies_hash retorna hash vacío sin archivos" {
    source "$PROJECT_DIR/lib/browser.sh"
    
    run get_policies_hash
    [ "$status" -eq 0 ]
    # Should return a hash based on empty BLOCKED_PATHS
    [ -n "$output" ]
}

@test "get_policies_hash cambia con diferentes BLOCKED_PATHS" {
    source "$PROJECT_DIR/lib/browser.sh"
    
    BLOCKED_PATHS=()
    hash1=$(get_policies_hash)
    
    BLOCKED_PATHS=("example.com/ads")
    hash2=$(get_policies_hash)
    
    [ "$hash1" != "$hash2" ]
}

@test "get_policies_hash incluye hash de políticas Firefox" {
    # Create a Firefox policy file
    echo '{"policies": {}}' > "$FIREFOX_POLICIES"
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run get_policies_hash
    [ "$status" -eq 0 ]
    [ -n "$output" ]
}

# ============== Tests de generate_firefox_policies ==============

@test "generate_firefox_policies crea directorio si no existe" {
    rm -rf "$(dirname "$FIREFOX_POLICIES")"
    
    BLOCKED_PATHS=()
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run generate_firefox_policies
    [ "$status" -eq 0 ]
    [ -d "$(dirname "$FIREFOX_POLICIES")" ]
}

@test "generate_firefox_policies crea JSON válido" {
    BLOCKED_PATHS=("example.com/ads" "test.org/tracking")
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run generate_firefox_policies
    [ "$status" -eq 0 ]
    
    # Verify JSON is valid
    python3 -c "import json; json.load(open('$FIREFOX_POLICIES'))"
    [ $? -eq 0 ]
}

@test "generate_firefox_policies incluye WebsiteFilter" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run generate_firefox_policies
    [ "$status" -eq 0 ]
    
    # Check for WebsiteFilter in JSON
    grep -q "WebsiteFilter" "$FIREFOX_POLICIES"
}

# ============== Tests de generate_chromium_policies ==============

@test "generate_chromium_policies crea directorios" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run generate_chromium_policies
    [ "$status" -eq 0 ]
    [ -d "$CHROMIUM_POLICIES_BASE" ]
}

@test "generate_chromium_policies crea archivo de políticas" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run generate_chromium_policies
    [ "$status" -eq 0 ]
    [ -f "$CHROMIUM_POLICIES_BASE/url-whitelist.json" ]
}

@test "generate_chromium_policies JSON contiene URLBlocklist" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run generate_chromium_policies
    
    grep -q "URLBlocklist" "$CHROMIUM_POLICIES_BASE/url-whitelist.json"
}

# ============== Tests de cleanup_browser_policies ==============

@test "cleanup_browser_policies limpia Firefox" {
    echo '{"policies": {"WebsiteFilter": {"Block": ["test"]}}}' > "$FIREFOX_POLICIES"
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run cleanup_browser_policies
    [ "$status" -eq 0 ]
    
    # Should be reset to empty policies
    grep -q '"policies": {}' "$FIREFOX_POLICIES"
}

@test "cleanup_browser_policies elimina archivos Chromium" {
    echo '{"URLBlocklist": ["test"]}' > "$CHROMIUM_POLICIES_BASE/url-whitelist.json"
    
    source "$PROJECT_DIR/lib/browser.sh"
    
    run cleanup_browser_policies
    [ "$status" -eq 0 ]
    
    # File should be removed
    [ ! -f "$CHROMIUM_POLICIES_BASE/url-whitelist.json" ]
}

# ============== Tests de apply_search_engine_policies ==============

@test "apply_search_engine_policies añade SearchEngines" {
    source "$PROJECT_DIR/lib/browser.sh"
    
    run apply_search_engine_policies
    [ "$status" -eq 0 ]
    
    grep -q "SearchEngines" "$FIREFOX_POLICIES"
}

@test "apply_search_engine_policies configura DuckDuckGo" {
    source "$PROJECT_DIR/lib/browser.sh"
    
    run apply_search_engine_policies
    [ "$status" -eq 0 ]
    
    grep -q "DuckDuckGo" "$FIREFOX_POLICIES"
}

@test "apply_search_engine_policies bloquea búsqueda Google" {
    source "$PROJECT_DIR/lib/browser.sh"
    
    run apply_search_engine_policies
    [ "$status" -eq 0 ]
    
    grep -q "google.com/search" "$FIREFOX_POLICIES"
}
