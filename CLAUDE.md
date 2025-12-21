# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **multi-platform DNS-based URL whitelist enforcement system** (v3.5) that uses DNS sinkhole technology to restrict network access to only whitelisted domains. It's designed for educational environments to control internet access on workstations.

**Supported Platforms:**
- **Linux**: Uses `dnsmasq` as DNS sinkhole with iptables firewall
- **Windows**: Uses `Acrylic DNS Proxy` with Windows Firewall

**Key Concept**: The system blocks all DNS resolution by default (NXDOMAIN), then explicitly allows only whitelisted domains to resolve. Combined with restrictive iptables rules that force all DNS through localhost, this creates an effective content filter.

## Architecture

### Core Components

1. **dnsmasq DNS Sinkhole** (`/etc/dnsmasq.d/url-whitelist.conf`)
   - Returns NXDOMAIN for all domains by default via `address=/#/`
   - Explicitly allows whitelisted domains via `server=/domain.com/$PRIMARY_DNS`
   - Essential system domains (GitHub, captive portal detection, NTP) are always allowed

2. **Firewall Layer** (`lib/firewall.sh`)
   - Blocks all external DNS queries (port 53, 853) except to localhost and upstream DNS
   - Blocks common VPN ports (OpenVPN, WireGuard, PPTP) and Tor
   - Allows HTTP/HTTPS (trusts DNS sinkhole for enforcement)
   - Allows ICMP, DHCP, NTP, and private networks (for captive portals)

3. **Browser Policies** (`lib/browser.sh`)
   - Firefox: Enforces WebsiteFilter and SearchEngines policies via `/etc/firefox/policies/policies.json`
   - Chromium/Chrome: Enforces URLBlocklist via managed policies
   - Forces DuckDuckGo as default search engine, blocks Google search

4. **Whitelist Management** (`linux/scripts/runtime/dnsmasq-whitelist.sh`)
   - Downloads whitelist from configurable URL (default: GitHub)
   - Parses three sections: `## WHITELIST`, `## BLOCKED-SUBDOMAINS`, `## BLOCKED-PATHS`
   - Supports remote emergency disable via `# DESACTIVADO` marker
   - Runs every 5 minutes via systemd timer
   - Closes browsers only when policies change (to avoid disruption)

5. **Watchdog** (`linux/scripts/runtime/dnsmasq-watchdog.sh`)
   - Health checks every 1 minute
   - Auto-recovers dnsmasq, upstream DNS config, and resolv.conf
   - Enters fail-open mode after 3 consecutive failures

6. **Captive Portal Detector** (`linux/scripts/runtime/captive-portal-detector.sh`)
   - Detects captive portals via `http://detectportal.firefox.com/success.txt`
   - Temporarily disables firewall when captive portal detected
   - Re-enables firewall after authentication
   - Runs continuously as a service

### Modular Library Structure

All functionality is split into reusable libraries in `/usr/local/lib/openpath/lib/` (source in `linux/lib/`):
- `common.sh` - Shared variables, logging, whitelist parsing
- `dns.sh` - DNS configuration, dnsmasq management
- `firewall.sh` - iptables rules, connection flushing
- `browser.sh` - Browser policy generation and enforcement
- `services.sh` - systemd service creation and management

### Web Management (spa)

7. **Static SPA** (`spa/`)
   - Client-side only, deployable on GitHub Pages
   - Manages whitelist rules via GitHub API
   - Supports GitHub OAuth authentication via Cloudflare Worker
   - Permission-based access (repo write access required for edits)
   - Includes domain request management panel (connects to home server API)

8. **Auth Worker** (`auth-worker/`)
   - Cloudflare Worker handling GitHub OAuth flow
   - Exchanges authorization codes for access tokens
   - Validates repository permissions

### Home Server API (api)

9. **Request API** (`api/`)
   - Express.js REST API for domain requests
   - Designed for home server deployment (Raspberry Pi, NAS, Docker)
   - Endpoints:
     - `POST /api/requests` - Submit domain request (public)
     - `GET /api/requests` - List pending requests (admin)
     - `POST /api/requests/:id/approve` - Approve and push to GitHub (admin)
     - `POST /api/requests/:id/reject` - Reject request (admin)
   - Uses JSON file storage (`data/requests.json`)
   - Integrates with GitHub API to push approved domains
   - Exposed via DuckDNS + port forwarding (or Cloudflare Tunnel)

### Firefox Extension (firefox-extension)

10. **Network Block Monitor**
    - Detects DNS/firewall blocks in real-time
    - Shows blocked domains per tab with badge count
    - Native Messaging integration for local whitelist verification
    - Domain request feature (submits to home server API)

### Windows Implementation (windows)

11. **Acrylic DNS Proxy** - Windows DNS sinkhole equivalent
12. **Windows Firewall** - PowerShell-managed firewall rules
13. **Task Scheduler** - Scheduled updates and watchdog

## Installation Paths

- **Scripts**: `/usr/local/bin/`
  - `openpath-update.sh` - Main update script
  - `dnsmasq-watchdog.sh` - Health monitoring
  - `captive-portal-detector.sh` - Captive portal handling
  - `dnsmasq-init-resolv.sh` - DNS upstream initialization
  - `whitelist` - Unified CLI command

- **Libraries**: `/usr/local/lib/openpath/lib/*.sh` (source: `linux/lib/`)

- **Configuration**: `/var/lib/url-whitelist/`
  - `whitelist.txt` - Downloaded whitelist
  - `original-dns.conf` - Detected upstream DNS
  - `whitelist-url.conf` - Whitelist source URL
  - `dnsmasq.hash` - Config change detection
  - `browser-policies.hash` - Browser policy change detection

- **Logs**: `/var/log/url-whitelist.log` (rotated daily, 7 days)

## Common Development Tasks

### Building and Testing

There is no build process. This is a bash-based system.

**Install the system:**
```bash
cd linux
sudo ./install.sh
# Or with custom whitelist URL:
sudo ./install.sh --whitelist-url "https://example.com/whitelist.txt"
# Or unattended (no prompts):
sudo ./install.sh --unattended
```

**Test the system:**
```bash
whitelist status    # Check all services and DNS
whitelist test      # Test DNS resolution
whitelist domains   # List whitelisted domains
whitelist check google.com  # Check specific domain
whitelist health    # Run health checks
```

**View logs:**
```bash
whitelist logs      # Follow logs in real-time
whitelist log 100   # Show last 100 lines
```

**Force updates:**
```bash
sudo whitelist update    # Force whitelist download and apply
sudo whitelist force     # Force apply changes (closes browsers, flushes connections)
sudo whitelist restart   # Restart all services
```

**Uninstall:**
```bash
cd linux
sudo ./uninstall.sh
# Or unattended:
sudo ./uninstall.sh --unattended
```

**Quick reinstall (for development):**
```bash
sudo ./auto-reinstall.sh
```

### Testing Changes to Scripts

After modifying scripts in the repository:

1. **For library changes** (`lib/*.sh`):
   ```bash
   sudo cp lib/*.sh /usr/local/lib/openpath/lib/
   sudo whitelist restart
   ```

2. **For main scripts** (`scripts/*.sh`):
   ```bash
   sudo cp linux/scripts/runtime/openpath-update.sh /usr/local/bin/
   sudo systemctl restart openpath-dnsmasq.timer
   ```

3. **For full reinstall** (recommended during development):
   ```bash
   sudo ./auto-reinstall.sh
   ```

### Debugging

**Check service status:**
```bash
systemctl status dnsmasq
systemctl status dnsmasq-whitelist.timer
systemctl status dnsmasq-watchdog.timer
systemctl status captive-portal-detector.service
```

**View service logs:**
```bash
journalctl -u dnsmasq -f
journalctl -u dnsmasq-whitelist.service -f
journalctl -u dnsmasq-watchdog.service -f
```

**Check firewall rules:**
```bash
sudo iptables -L OUTPUT -n -v
```

**Check DNS configuration:**
```bash
cat /etc/dnsmasq.d/url-whitelist.conf
cat /etc/resolv.conf
cat /run/dnsmasq/resolv.conf
```

**Test DNS resolution manually:**
```bash
dig @127.0.0.1 google.com
dig @127.0.0.1 example.com +short
nslookup google.com 127.0.0.1
```

**Check browser policies:**
```bash
cat /etc/firefox/policies/policies.json | python3 -m json.tool
cat /etc/chromium/policies/managed/url-whitelist.json | python3 -m json.tool
```

## Key Implementation Details

### Whitelist File Format

The whitelist file supports three sections:

```
# Comments are allowed
google.com
github.com

## BLOCKED-SUBDOMAINS
# These subdomains are explicitly blocked even if parent domain is allowed
ads.example.com

## BLOCKED-PATHS
# These URL patterns are blocked in browsers via WebsiteFilter/URLBlocklist
*/ads/*
*/tracking/*
```

### Emergency Remote Disable

If the first non-empty line of the whitelist contains `# DESACTIVADO` (case-insensitive), the system enters fail-open mode:
- Disables firewall (allows all traffic)
- Clears browser policies
- Configures dnsmasq as passthrough
- Closes all browsers

This allows remote emergency shutdown by modifying the whitelist URL.

### Change Detection and Browser Closure

The system uses MD5 hashes to detect configuration changes:
- `dnsmasq.hash` - Tracks DNS configuration changes
- `browser-policies.hash` - Tracks browser policy changes

**Browsers are only closed when:**
1. Browser policies change (WebsiteFilter or SearchEngines)
2. System transitions from disabled to enabled (firewall reactivation)
3. Remote disable is triggered

This minimizes disruption while ensuring policy enforcement.

### DNS Upstream Detection

The system attempts to detect the upstream DNS in this order:
1. Previously saved DNS from `/var/lib/url-whitelist/original-dns.conf`
2. NetworkManager via `nmcli dev show`
3. systemd-resolved from `/run/systemd/resolve/resolv.conf`
4. Gateway IP as DNS
5. Fallback to Google DNS (8.8.8.8)

The detected DNS is validated by testing resolution of `google.com`.

### Fail-Open Design Philosophy

The system is designed to fail open (permissive) rather than fail closed (restrictive) to avoid breaking network connectivity:
- If whitelist download fails, uses existing whitelist
- If dnsmasq fails to start 3 times, disables firewall
- If captive portal detected, disables firewall
- Watchdog automatically recovers from transient failures

### Locking and Race Conditions

- `dnsmasq-whitelist.sh` and `captive-portal-detector.sh` share a lock file (`/var/run/whitelist-update.lock`) via `flock` to prevent concurrent firewall modifications
- Lock is automatically released on script exit (via trap)

## Critical DNS Sinkhole Pattern

The order of rules in dnsmasq configuration is critical:

```
# MUST BE FIRST - blocks everything by default
address=/#/

# THEN - explicitly allow domains
server=/github.com/8.8.8.8
server=/google.com/8.8.8.8
```

If the order is reversed, the whitelist won't work. The `address=/#/` directive catches all domains not explicitly allowed by previous `server=` directives.

## System Requirements

- Linux with systemd
- Root/sudo access
- Packages: `iptables`, `iptables-persistent`, `ipset`, `curl`, `dnsmasq`, `libcap2-bin`, `dnsutils`, `conntrack`, `python3`
- Port 53 must be available (systemd-resolved is disabled during install)

## Version History

Current version: **3.5**

Version is stored in:
- `install.sh` - `VERSION="3.5"`
- `lib/common.sh` - `VERSION="3.5"`
- Comments in all major scripts

## Testing

### BATS Tests (72 tests)
Shell library tests in `tests/`:
```bash
cd tests && bats *.bats
# Or run all tests:
./run-tests.sh
```

### E2E Tests
- Linux: `tests/e2e/linux-e2e-tests.sh`
- Windows: `tests/e2e/Windows-E2E.Tests.ps1`

### Web API Tests
```bash
cd dashboard && npm test
```

### CI/CD
Workflows in `.github/workflows/`:
- `ci.yml` - BATS tests, web tests
- `lint.yml` - ShellCheck and ESLint linting
- `e2e-tests.yml` - Full E2E on Linux/Windows
- `deploy.yml` - GitHub Pages deployment
- `deploy-api.yml` - API deployment
