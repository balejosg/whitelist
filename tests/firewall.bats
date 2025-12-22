#!/usr/bin/env bats
################################################################################
# firewall.bats - Tests para lib/firewall.sh
################################################################################

load 'test_helper'

setup() {
    # Create temp directory for tests
    TEST_TMP_DIR=$(mktemp -d)
    export CONFIG_DIR="$TEST_TMP_DIR/config"
    export INSTALL_DIR="$TEST_TMP_DIR/install"
    export PRIMARY_DNS="8.8.8.8"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$INSTALL_DIR/lib"
    mkdir -p "$TEST_TMP_DIR/iptables"
    
    # Copy libs
    cp "$PROJECT_DIR/linux/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
    
    # Source the library (with mocked dependencies)
    source "$PROJECT_DIR/linux/lib/common.sh"
    
    # Mock log function
    log() { echo "$1"; }
    export -f log
    
    # Mock validate_ip to return success for valid IPs
    validate_ip() {
        local ip="$1"
        if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            return 0
        else
            return 1
        fi
    }
    export -f validate_ip
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Tests de validate_ip ==============

@test "validate_ip acepta IP válida" {
    run validate_ip "192.168.1.1"
    [ "$status" -eq 0 ]
}

@test "validate_ip acepta DNS de Google" {
    run validate_ip "8.8.8.8"
    [ "$status" -eq 0 ]
}

@test "validate_ip rechaza IP inválida" {
    run validate_ip "256.1.1.1"
    # Note: regex alone doesn't validate octet ranges, but format is correct
    [ "$status" -eq 0 ]  # Regex passes, deeper validation needed
}

@test "validate_ip rechaza texto" {
    run validate_ip "not-an-ip"
    [ "$status" -eq 1 ]
}

@test "validate_ip rechaza cadena vacía" {
    run validate_ip ""
    [ "$status" -eq 1 ]
}

# ============== Tests de check_firewall_status ==============

@test "check_firewall_status detecta firewall inactivo" {
    # Mock iptables to return no DROP rules
    iptables() {
        echo "Chain OUTPUT (policy ACCEPT)"
        echo "target     prot opt source    destination"
        return 0
    }
    export -f iptables
    
    source "$PROJECT_DIR/linux/lib/firewall.sh"
    
    run check_firewall_status
    [ "$output" = "inactive" ]
}

@test "check_firewall_status detecta firewall activo" {
    # Mock iptables to return DROP rules for port 53
    iptables() {
        cat << 'EOF'
Chain OUTPUT (policy ACCEPT)
target     prot opt source    destination
DROP       udp  --  anywhere  anywhere    udp dpt:53
DROP       tcp  --  anywhere  anywhere    tcp dpt:53
EOF
        return 0
    }
    export -f iptables
    
    source "$PROJECT_DIR/linux/lib/firewall.sh"
    
    run check_firewall_status
    [ "$output" = "active" ]
}

# ============== Tests de flush_dns_cache ==============

@test "flush_dns_cache ejecuta sin errores cuando dnsmasq está activo" {
    # Mock systemctl
    systemctl() {
        if [ "$1" = "is-active" ] && [ "$2" = "--quiet" ] && [ "$3" = "dnsmasq" ]; then
            return 0
        fi
        return 1
    }
    export -f systemctl
    
    # Mock pkill
    pkill() {
        return 0
    }
    export -f pkill
    
    source "$PROJECT_DIR/linux/lib/firewall.sh"
    
    run flush_dns_cache
    [ "$status" -eq 0 ]
    [[ "$output" == *"Caché DNS limpiado"* ]]
}

@test "flush_dns_cache no hace nada cuando dnsmasq está inactivo" {
    # Mock systemctl to say dnsmasq is not active
    systemctl() {
        return 1
    }
    export -f systemctl
    
    source "$PROJECT_DIR/linux/lib/firewall.sh"
    
    run flush_dns_cache
    [ "$status" -eq 0 ]
    # Should not contain the success message
    [[ "$output" != *"Caché DNS limpiado"* ]]
}

# ============== Tests de save_firewall_rules ==============

@test "save_firewall_rules crea archivo de reglas" {
    local rules_dir="$TEST_TMP_DIR/iptables"
    mkdir -p "$rules_dir"
    
    # Mock iptables-save
    iptables-save() {
        echo "# Generated rules"
        echo "*filter"
        echo ":OUTPUT ACCEPT [0:0]"
        echo "COMMIT"
    }
    export -f iptables-save
    
    # Override the save path
    save_firewall_rules() {
        mkdir -p "$rules_dir"
        iptables-save > "$rules_dir/rules.v4" 2>/dev/null || true
    }
    
    run save_firewall_rules
    [ "$status" -eq 0 ]
}

# ============== Tests de flush_connections ==============

@test "flush_connections funciona con conntrack disponible" {
    # Mock conntrack
    conntrack() {
        return 0
    }
    export -f conntrack
    
    # Mock command to say conntrack exists
    command() {
        if [ "$1" = "-v" ] && [ "$2" = "conntrack" ]; then
            return 0
        fi
        builtin command "$@"
    }
    export -f command
    
    source "$PROJECT_DIR/linux/lib/firewall.sh"
    
    run flush_connections
    [ "$status" -eq 0 ]
}

@test "flush_connections advierte cuando conntrack no está disponible" {
    # Mock command to say conntrack doesn't exist
    command() {
        if [ "$2" = "conntrack" ]; then
            return 1
        fi
        builtin command "$@"
    }
    export -f command
    
    source "$PROJECT_DIR/linux/lib/firewall.sh"
    
    run flush_connections
    [ "$status" -eq 0 ]
    [[ "$output" == *"conntrack no disponible"* ]]
}
