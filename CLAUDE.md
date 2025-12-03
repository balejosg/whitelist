# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modular DNS whitelist system (v3.4) based on dnsmasq that implements a "deny all, allow specific" internet access control policy. The system blocks all DNS domains by default, only allowing those explicitly whitelisted. It combines DNS sinkholing with firewall rules and browser policies for multi-layered protection.

**Language**: Bash (shell scripts)
**Target OS**: Ubuntu 20.04+ / Debian 10+ (x86_64)
**Requires**: root/sudo access

## Architecture

The system is divided into **5 core modules** that separate concerns:

### Core Modules (lib/)

1. **common.sh** - Shared infrastructure
   - Global configuration variables and paths
   - Logging functions
   - Whitelist parsing (domains, blocked-subdomains, blocked-paths)
   - DNS detection (finds upstream DNS server from NetworkManager, systemd-resolved, or resolv.conf)
   - Utility functions (IP validation, etc.)

2. **dns.sh** - DNS sinkhole configuration
   - Manages dnsmasq service startup/config
   - Generates dnsmasq config files (denies all by default, allows whitelisted domains)
   - Configures /etc/resolv.conf to use localhost DNS
   - Handles port 53 conflicts (stops systemd-resolved)
   - Detects and saves upstream DNS server

3. **firewall.sh** - Multi-layer traffic blocking
   - iptables rules to block alternative DNS ports (53, 853)
   - VPN protocol blocking (OpenVPN, WireGuard, PPTP)
   - Tor network blocking
   - Allows only essential traffic (DHCP, ICMP, loopback, established connections)
   - Can be activated/deactivated

4. **browser.sh** - Client-side enforcement
   - Generates Firefox policies.json for policy-based blocking
   - Generates Chromium extension blocklists
   - Blocks specific URL paths listed in whitelist

5. **services.sh** - systemd integration
   - Creates service units (dnsmasq service)
   - Creates timer units (dnsmasq-whitelist.timer runs every 5 min, dnsmasq-watchdog.timer every 1 min)
   - Enables/disables services

### Operational Scripts (scripts/)

1. **install.sh** - Main installation orchestrator
   - Parses CLI flags (--whitelist-url, --unattended)
   - Loads all modules sequentially
   - Installs dependencies (apt-get)
   - Deploys code to system directories
   - Performs 10-step installation (see install.sh for full details)

2. **dnsmasq-whitelist.sh** - Periodic whitelist updater (runs via timer)
   - Downloads whitelist from configured URL
   - Detects `#DESACTIVADO` flag for remote disabling (fail-open mode)
   - Regenerates dnsmasq config
   - Applies browser policies
   - Handles captive portal detection

3. **dnsmasq-watchdog.sh** - Health monitor (runs via timer)
   - Verifies dnsmasq process is running
   - Tests DNS resolution validity
   - Auto-recovers from failures
   - Validates upstream DNS connectivity

4. **captive-portal-detector.sh** - WiFi authentication handler
   - Continuously checks for captive portals
   - Temporarily disables firewall for authentication
   - Re-enables firewall after successful auth
   - Runs as system service

5. **whitelist-cmd.sh** - User-facing CLI tool
   - `whitelist` command for manual operations
   - View/modify whitelist settings
   - Check system status

## Installation Directories

After installation, the system is distributed to:

```
/usr/local/lib/whitelist-system/    # Code and library modules
/usr/local/bin/whitelist            # User command
/var/lib/url-whitelist/             # Configuration (whitelist.txt, url config)
/etc/dnsmasq.d/                     # dnsmasq config files
/var/log/                           # System logs (url-whitelist.log)
```

## Whitelist Format

The whitelist file supports three sections (downloaded via timer from remote URL):

```
## WHITELIST
example.com
subdomain.example.com

## BLOCKED-SUBDOMAINS
ads.example.com

## BLOCKED-PATHS
example.com/tracking
```

Special flag: `#DESACTIVADO` at file start enables fail-open mode (all access allowed, firewall disabled).

## Development Commands

### Build/Deployment
```bash
# Full installation (requires sudo, copies code to system)
sudo ./install.sh

# Custom whitelist URL
sudo ./install.sh --whitelist-url "https://example.com/whitelist.txt"

# Unattended installation (no prompts)
sudo ./install.sh --unattended

# Uninstall system
sudo ./uninstall.sh
```

### Testing & Debugging
```bash
# Test DNS resolution (local dnsmasq)
dig @127.0.0.1 example.com

# Test system DNS
dig example.com

# Validate dnsmasq configuration
dnsmasq --test -C /etc/dnsmasq.d/url-whitelist.conf

# Check dnsmasq status
sudo systemctl status dnsmasq
sudo journalctl -u dnsmasq -f

# View whitelist update logs
sudo journalctl -u dnsmasq-whitelist.service -n 50

# View watchdog logs
sudo journalctl -u dnsmasq-watchdog.service -f

# Check main log file
tail -f /var/log/url-whitelist.log

# View whitelist content
sudo grep "^example.com" /var/lib/url-whitelist/whitelist.txt

# Check firewall rules
sudo iptables -L OUTPUT
```

### Common Development Tasks

**Adding a new whitelist section/feature**: Edit the parsing logic in `lib/common.sh` and regeneration logic in relevant module (dns.sh for DNS, browser.sh for browser policies, etc.)

**Modifying dnsmasq behavior**: Edit `generate_dnsmasq_config()` function in `lib/dns.sh`, then restart: `sudo systemctl restart dnsmasq`

**Adding firewall rules**: Edit `activate_firewall()` in `lib/firewall.sh`

**Testing installation locally**: Run `sudo ./install.sh` in development directory. To reset, run `sudo ./uninstall.sh` and clean /var/lib/url-whitelist and /var/log/url-whitelist.log

## Key Implementation Patterns

### Module Loading
All scripts that need functionality source the required modules:
```bash
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/dns.sh"
```

### Logging
Use the shared `log()` function (defined in common.sh):
```bash
log "This message appears in /var/log/url-whitelist.log with timestamp"
```

### Locking
The dnsmasq-whitelist.sh script uses flock to prevent race conditions with captive-portal-detector:
```bash
exec 200>"$LOCK_FILE"
flock -n 200  # Exclusive lock, non-blocking
```

### Error Handling
install.sh uses `set -e` to exit on any error. Other scripts handle errors individually where needed.

### Configuration Persistence
Whitelist URL is stored in `/var/lib/url-whitelist/whitelist-url.conf`
Original upstream DNS is saved in `/var/lib/url-whitelist/original-dns.conf`

## Systemd Services & Timers

The system creates:
- `dnsmasq.service` - Main DNS server
- `dnsmasq-whitelist.timer` - Runs dnsmasq-whitelist.service every 5 minutes (2 min after boot)
- `dnsmasq-watchdog.timer` - Runs dnsmasq-watchdog.service every 1 minute
- `captive-portal-detector.service` - Continuous WiFi portal detection

View timer status: `sudo systemctl list-timers`

## Multi-Layer Protection Strategy

The system implements defense-in-depth:

1. **DNS Layer** (dnsmasq)
   - `address=/#/127.0.0.1` blocks all domains
   - `server=/whitelisted.com/upstream-dns` allows specific domains
   - Blocks DNS-over-HTTPS on alternate ports

2. **Firewall Layer** (iptables)
   - Blocks alternative DNS ports (53, 853, 5053)
   - Blocks VPN protocols
   - Blocks Tor entry nodes
   - Only allows essential services

3. **Browser Layer** (browser policies)
   - Firefox: policies.json enforces search engine, blocks extensions
   - Chromium: managed policies block specific URLs
   - Blocks specific URL paths even if domain is whitelisted

## Important Notes

- The system runs with `set -e` in install.sh, so any command failure stops execution
- DNS upstream detection is smart - tries saved config, NetworkManager, systemd-resolved, then /etc/resolv.conf
- Whitelist updates are idempotent - can be run multiple times safely
- Captive portal detection happens in background and temporarily disables firewall
- The #DESACTIVADO flag provides emergency remote shutdown capability
