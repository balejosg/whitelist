#!/bin/bash
################################################################################
# linux-e2e-tests.sh - End-to-End tests for Linux whitelist system
# 
# Validates the complete installation and operation of the dnsmasq-based
# DNS whitelist system including DNS resolution, blocking, and firewall.
#
# Usage: sudo ./linux-e2e-tests.sh
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# ============== Helper Functions ==============

test_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

test_fail() {
    echo -e "  ${RED}✗${NC} $1"
    FAILED=$((FAILED + 1))
}

test_section() {
    echo ""
    echo -e "${BLUE}[$1]${NC} $2"
}

# ============== E2E Tests ==============

test_dnsmasq_active() {
    test_section "1/7" "dnsmasq service status"
    
    if systemctl is-active --quiet dnsmasq; then
        test_pass "dnsmasq is active"
    else
        test_fail "dnsmasq is not active"
    fi
}

test_port_53_listening() {
    test_section "2/7" "Port 53 listening"
    
    if ss -ulnp 2>/dev/null | grep -q ":53 "; then
        test_pass "Port 53 UDP is listening"
    else
        test_fail "Port 53 UDP is not listening"
    fi
    
    if ss -tlnp 2>/dev/null | grep -q ":53 "; then
        test_pass "Port 53 TCP is listening"
    else
        # TCP is optional for dnsmasq
        echo -e "  ${YELLOW}⚠${NC} Port 53 TCP not listening (optional)"
    fi
}

test_whitelisted_domains_resolve() {
    test_section "3/7" "Whitelisted domains resolve"
    
    local domains=("google.com" "github.com")
    
    for domain in "${domains[@]}"; do
        local result
        result=$(timeout 5 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
        
        if [ -n "$result" ]; then
            test_pass "$domain → $result"
        else
            test_fail "$domain does not resolve"
        fi
    done
}

test_blocked_domains_nxdomain() {
    test_section "4/7" "Non-whitelisted domains blocked"
    
    local blocked_domains=(
        "malware-test-domain.com"
        "should-be-blocked-12345.net"
        "random-blocked-site.org"
    )
    
    for domain in "${blocked_domains[@]}"; do
        local result
        result=$(timeout 3 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
        
        if [ -z "$result" ] || [ "$result" == "0.0.0.0" ] || [ "$result" == "127.0.0.1" ]; then
            test_pass "$domain blocked (NXDOMAIN/sinkhole)"
        else
            test_fail "$domain resolved to $result (should be blocked)"
        fi
    done
}

test_config_files_exist() {
    test_section "5/7" "Configuration files"
    
    local required_files=(
        "/etc/dnsmasq.d/url-whitelist.conf"
        "/var/lib/url-whitelist/whitelist-url.conf"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            test_pass "$file exists"
        else
            test_fail "$file missing"
        fi
    done
    
    # Check whitelist was downloaded
    if [ -f "/var/lib/url-whitelist/whitelist.txt" ]; then
        local count
        count=$(grep -v "^#" /var/lib/url-whitelist/whitelist.txt 2>/dev/null | grep -v "^$" | wc -l)
        test_pass "Whitelist downloaded ($count entries)"
    else
        echo -e "  ${YELLOW}⚠${NC} Whitelist not yet downloaded (timer will fetch)"
    fi
}

test_systemd_timers() {
    test_section "6/7" "Systemd timers"
    
    if systemctl is-active --quiet dnsmasq-whitelist.timer 2>/dev/null; then
        test_pass "dnsmasq-whitelist.timer is active"
    else
        echo -e "  ${YELLOW}⚠${NC} dnsmasq-whitelist.timer not active"
    fi
    
    if systemctl is-active --quiet dnsmasq-watchdog.timer 2>/dev/null; then
        test_pass "dnsmasq-watchdog.timer is active"
    else
        echo -e "  ${YELLOW}⚠${NC} dnsmasq-watchdog.timer not active"
    fi
}

test_iptables_rules() {
    test_section "7/7" "Firewall rules"
    
    if ! command -v iptables &>/dev/null; then
        echo -e "  ${YELLOW}⚠${NC} iptables not available"
        return 0
    fi
    
    # Check for DNS blocking rules
    local output_rules
    output_rules=$(iptables -L OUTPUT -n 2>/dev/null | wc -l)
    
    if [ "$output_rules" -gt 3 ]; then
        test_pass "OUTPUT chain has rules ($((output_rules - 2)) rules)"
    else
        echo -e "  ${YELLOW}⚠${NC} OUTPUT chain appears empty"
    fi
    
    # Check for port 53 rules specifically
    if iptables -L OUTPUT -n 2>/dev/null | grep -q "dpt:53"; then
        test_pass "DNS port blocking rules exist"
    else
        echo -e "  ${YELLOW}⚠${NC} No explicit DNS port blocking rules"
    fi
}

# ============== Main ==============

main() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  E2E Tests - Linux Whitelist System${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    
    test_dnsmasq_active
    test_port_53_listening
    test_whitelisted_domains_resolve
    test_blocked_domains_nxdomain
    test_config_files_exist
    test_systemd_timers
    test_iptables_rules
    
    # Summary
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "  Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ "$FAILED" -gt 0 ]; then
        echo -e "${RED}✗ E2E TESTS FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ E2E TESTS PASSED${NC}"
        exit 0
    fi
}

# Require root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Run with sudo"
    exit 1
fi

main "$@"
