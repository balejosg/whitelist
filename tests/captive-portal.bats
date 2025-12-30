#!/usr/bin/env bats
################################################################################
# captive-portal.bats - Tests for captive portal detection
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

    # Mock log function
    log() { echo "$1"; }
    export -f log
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== check_captive_portal tests ==============

@test "check_captive_portal returns 1 (no portal) when response matches expected" {
    # Mock curl to return success response
    curl() {
        echo "success"
        return 0
    }
    export -f curl

    # Mock timeout to pass through
    timeout() {
        shift  # Remove timeout value
        "$@"   # Execute the rest
    }
    export -f timeout

    # Set expected values
    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run check_captive_portal
    [ "$status" -eq 1 ]  # 1 means NO captive portal
}

@test "check_captive_portal returns 0 (portal detected) when response differs" {
    # Mock curl to return captive portal redirect
    curl() {
        echo "<html>Please login...</html>"
        return 0
    }
    export -f curl

    timeout() {
        shift
        "$@"
    }
    export -f timeout

    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run check_captive_portal
    [ "$status" -eq 0 ]  # 0 means captive portal detected
}

@test "check_captive_portal returns 0 (portal detected) when curl times out" {
    # Mock curl to hang (simulated by returning empty)
    curl() {
        return 1
    }
    export -f curl

    timeout() {
        return 124  # Timeout exit code
    }
    export -f timeout

    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run check_captive_portal
    [ "$status" -eq 0 ]  # Timeout = captive portal (or no network)
}

@test "check_captive_portal returns 0 (portal detected) when curl fails" {
    # Mock curl to fail (network error)
    curl() {
        return 7  # Connection refused
    }
    export -f curl

    timeout() {
        shift
        "$@"
    }
    export -f timeout

    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run check_captive_portal
    [ "$status" -eq 0 ]  # Network error = assumed captive portal
}

# ============== is_network_authenticated tests ==============

@test "is_network_authenticated returns 0 when authenticated" {
    curl() {
        echo "success"
        return 0
    }
    export -f curl

    timeout() {
        shift
        "$@"
    }
    export -f timeout

    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run is_network_authenticated
    [ "$status" -eq 0 ]
}

@test "is_network_authenticated returns 1 when not authenticated" {
    curl() {
        echo "redirected to login"
        return 0
    }
    export -f curl

    timeout() {
        shift
        "$@"
    }
    export -f timeout

    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run is_network_authenticated
    [ "$status" -eq 1 ]
}

@test "is_network_authenticated handles empty response" {
    curl() {
        echo ""
        return 0
    }
    export -f curl

    timeout() {
        shift
        "$@"
    }
    export -f timeout

    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run is_network_authenticated
    [ "$status" -eq 1 ]  # Empty != expected
}

@test "is_network_authenticated strips whitespace from response" {
    curl() {
        printf "success\r\n"  # Windows-style line ending
        return 0
    }
    export -f curl

    timeout() {
        shift
        "$@"
    }
    export -f timeout

    export CAPTIVE_PORTAL_CHECK_URL="http://detectportal.firefox.com/success.txt"
    export CAPTIVE_PORTAL_CHECK_EXPECTED="success"

    source "$PROJECT_DIR/linux/lib/common.sh"

    run is_network_authenticated
    [ "$status" -eq 0 ]  # Should match after stripping
}

# ============== Configuration tests ==============

@test "captive portal uses configurable URL from defaults.conf" {
    # Source defaults.conf to verify CAPTIVE_PORTAL_URL is configurable
    if [ -f "$PROJECT_DIR/linux/lib/defaults.conf" ]; then
        source "$PROJECT_DIR/linux/lib/defaults.conf"
        [ -n "$CAPTIVE_PORTAL_URL" ]
    else
        skip "defaults.conf not found"
    fi
}

@test "CAPTIVE_PORTAL_URL can be overridden via environment" {
    export OPENPATH_CAPTIVE_PORTAL_URL="http://custom-portal.example.com/check"

    source "$PROJECT_DIR/linux/lib/defaults.conf"

    [ "$CAPTIVE_PORTAL_URL" = "http://custom-portal.example.com/check" ]
}
