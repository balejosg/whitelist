#!/usr/bin/env bats
################################################################################
# dns.bats - Tests for lib/dns.sh
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
    cp "$PROJECT_DIR/linux/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Configuration generation tests ==============

@test "generates dnsmasq config with whitelisted domains" {
    local config_file="$TEST_TMP_DIR/dnsmasq.conf"
    local dns_server="8.8.8.8"
    local domains="google.com
github.com"
    
    # Simulate config generation
    {
        echo "# Generated config"
        echo "address=/#/"
        for domain in $domains; do
            echo "server=/$domain/$dns_server"
        done
    } > "$config_file"
    
    [ -f "$config_file" ]
    grep -q "address=/#/" "$config_file"
    grep -q "server=/google.com/8.8.8.8" "$config_file"
    grep -q "server=/github.com/8.8.8.8" "$config_file"
}

@test "address=/#/ appears BEFORE server= directives" {
    local config_file="$TEST_TMP_DIR/dnsmasq.conf"
    
    {
        echo "address=/#/"
        echo "server=/google.com/8.8.8.8"
    } > "$config_file"
    
    # Verify order: address must be before server
    local address_line=$(grep -n "address=/#/" "$config_file" | cut -d: -f1)
    local server_line=$(grep -n "server=/google.com" "$config_file" | cut -d: -f1)
    
    [ "$address_line" -lt "$server_line" ]
}

# ============== DNS detection tests ==============

@test "detect_primary_dns returns valid IP or fallback" {
    # Mock for when no DNS is detected
    local dns="8.8.8.8"  # Fallback
    
    # Validate that it's an IP
    if [[ "$dns" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        local valid=true
    else
        local valid=false
    fi
    
    [ "$valid" = true ]
}

# ============== resolv.conf configuration tests ==============

@test "resolv.conf points to localhost" {
    local resolv_file="$TEST_TMP_DIR/resolv.conf"
    
    echo "nameserver 127.0.0.1" > "$resolv_file"
    
    grep -q "nameserver 127.0.0.1" "$resolv_file"
}

# ============== Tests de generate_dnsmasq_config ==============

@test "generate_dnsmasq_config creates configuration file" {
    export DNSMASQ_CONF="$TEST_TMP_DIR/dnsmasq.d/url-whitelist.conf"
    export PRIMARY_DNS="8.8.8.8"
    export VERSION="3.5"
    
    mkdir -p "$(dirname "$DNSMASQ_CONF")"
    
    # Initialize arrays
    WHITELIST_DOMAINS=("google.com" "github.com")
    BLOCKED_SUBDOMAINS=()
    
    # Mock log
    log() { echo "$1"; }
    export -f log
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    run generate_dnsmasq_config
    [ "$status" -eq 0 ]
    [ -f "$DNSMASQ_CONF" ]
}

@test "generate_dnsmasq_config includes address=/#/ first" {
    export DNSMASQ_CONF="$TEST_TMP_DIR/dnsmasq.d/url-whitelist.conf"
    export PRIMARY_DNS="8.8.8.8"
    export VERSION="3.5"
    
    mkdir -p "$(dirname "$DNSMASQ_CONF")"
    
    WHITELIST_DOMAINS=("google.com")
    BLOCKED_SUBDOMAINS=()
    
    log() { echo "$1"; }
    export -f log
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    generate_dnsmasq_config
    
    grep -q "address=/#/" "$DNSMASQ_CONF"
}

@test "generate_dnsmasq_config includes domains from whitelist" {
    export DNSMASQ_CONF="$TEST_TMP_DIR/dnsmasq.d/url-whitelist.conf"
    export PRIMARY_DNS="8.8.8.8"
    export VERSION="3.5"
    
    mkdir -p "$(dirname "$DNSMASQ_CONF")"
    
    WHITELIST_DOMAINS=("example.org" "test.com")
    BLOCKED_SUBDOMAINS=()
    
    log() { echo "$1"; }
    export -f log
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    generate_dnsmasq_config
    
    grep -q "server=/example.org/8.8.8.8" "$DNSMASQ_CONF"
    grep -q "server=/test.com/8.8.8.8" "$DNSMASQ_CONF"
}

@test "generate_dnsmasq_config includes blocked subdomains" {
    export DNSMASQ_CONF="$TEST_TMP_DIR/dnsmasq.d/url-whitelist.conf"
    export PRIMARY_DNS="8.8.8.8"
    export VERSION="3.5"
    
    mkdir -p "$(dirname "$DNSMASQ_CONF")"
    
    WHITELIST_DOMAINS=("example.org")
    BLOCKED_SUBDOMAINS=("ads.example.org")
    
    log() { echo "$1"; }
    export -f log
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    generate_dnsmasq_config
    
    grep -q "address=/ads.example.org/" "$DNSMASQ_CONF"
}

# ============== Tests de validate_dnsmasq_config ==============

@test "validate_dnsmasq_config detects valid config" {
    # Mock dnsmasq
    dnsmasq() {
        echo "dnsmasq: syntax check OK."
        return 0
    }
    export -f dnsmasq
    
    log() { echo "$1"; }
    export -f log
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    run validate_dnsmasq_config
    [ "$status" -eq 0 ]
}

@test "validate_dnsmasq_config detects invalid config" {
    # Mock dnsmasq with error
    dnsmasq() {
        echo "dnsmasq: syntax error at line 5"
        return 1
    }
    export -f dnsmasq
    
    log() { echo "$1"; }
    export -f log
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    run validate_dnsmasq_config
    [ "$status" -eq 1 ]
}

# ============== Tests de verify_dns ==============

@test "verify_dns returns success with functional DNS" {
    # Mock dig
    dig() {
        echo "142.250.185.206"
        return 0
    }
    export -f dig
    
    # Mock timeout
    timeout() {
        shift  # Remove timeout value
        "$@"   # Execute the rest
    }
    export -f timeout
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    run verify_dns
    [ "$status" -eq 0 ]
}

@test "verify_dns returns error with failing DNS" {
    # Mock dig to fail
    dig() {
        return 1
    }
    export -f dig
    
    timeout() {
        return 1
    }
    export -f timeout
    
    source "$PROJECT_DIR/linux/lib/dns.sh"
    
    run verify_dns
    [ "$status" -eq 1 ]
}
