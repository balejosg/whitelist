# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **multi-platform DNS-based URL whitelist enforcement system** (v4.1.0) that uses DNS sinkhole technology to restrict network access to only whitelisted domains. It's designed for educational environments to control internet access on workstations.

**Supported Platforms:**
- **Linux**: Uses `dnsmasq` as DNS sinkhole with iptables firewall
- **Windows**: Uses `Acrylic DNS Proxy` with Windows Firewall

**Key Concept**: The system blocks all DNS resolution by default (NXDOMAIN), then explicitly allows only whitelisted domains to resolve. Combined with restrictive iptables rules that force all DNS through localhost, this creates an effective content filter.

## Architecture

### Core Components

1. **dnsmasq DNS Sinkhole** (`/etc/dnsmasq.d/openpath.conf`)
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

4. **Whitelist Management** (`linux/scripts/runtime/openpath-update.sh`)
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
   - Express.js + tRPC API for domain requests
   - Designed for home server deployment (Raspberry Pi, NAS, Docker)
   - tRPC routers: `auth`, `users`, `requests`, `classrooms`, `schedules`, `push`
   - PostgreSQL database with Drizzle ORM
   - JWT authentication with role-based access control
   - Push notifications for teachers (Web Push API)
   - Integrates with GitHub API to push approved domains
   - Exposed via DuckDNS + port forwarding (or Cloudflare Tunnel)

### Database Layer

10. **PostgreSQL Database** (`api/src/db/`)
    - Drizzle ORM for type-safe queries
    - Schema in `api/src/db/schema.ts`
    - Migrations via `drizzle-kit`
    - Tables: users, roles, requests, classrooms, schedules, push_subscriptions

### Classroom Management

11. **Classroom System** (`api/src/trpc/routers/`)
    - Classroom CRUD operations
    - Schedule reservations (US2)
    - Teacher delegation approval (US3)
    - Push notifications for new requests (US5)

### Firefox Extension (firefox-extension)

12. **Network Block Monitor**
    - Detects DNS/firewall blocks in real-time
    - Shows blocked domains per tab with badge count
    - Native Messaging integration for local whitelist verification
    - Domain request feature (submits to home server API)

### Windows Implementation (windows)

13. **Acrylic DNS Proxy** - Windows DNS sinkhole equivalent
14. **Windows Firewall** - PowerShell-managed firewall rules
15. **Task Scheduler** - Scheduled updates and watchdog

## Installation Paths

- **Scripts**: `/usr/local/bin/`
  - `openpath-update.sh` - Main update script
  - `dnsmasq-watchdog.sh` - Health monitoring
  - `captive-portal-detector.sh` - Captive portal handling
  - `whitelist` - Unified CLI command

- **Libraries**: `/usr/local/lib/openpath/lib/*.sh` (source: `linux/lib/`)

- **Configuration**: `/etc/openpath/`
  - `whitelist.txt` - Downloaded whitelist
  - `original-dns.conf` - Detected upstream DNS
  - `whitelist-url.conf` - Whitelist source URL
  - `dnsmasq.hash` - Config change detection
  - `browser-policies.hash` - Browser policy change detection

- **Logs**: `/var/log/openpath.log` (rotated daily, 7 days)

## Common Development Tasks

### Building and Testing

There is no build process for the Linux agent (Bash). However, the TypeScript workspaces (api, spa, dashboard, etc.) DO require a build step (`npm run build`).

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
openpath status    # Check all services and DNS
openpath test      # Test DNS resolution
openpath domains   # List whitelisted domains
openpath check google.com  # Check specific domain
openpath health    # Run health checks
```

**View logs:**
```bash
openpath logs      # Follow logs in real-time
openpath log 100   # Show last 100 lines
```

**Force updates:**
```bash
sudo openpath update    # Force whitelist download and apply
sudo openpath force     # Force apply changes (closes browsers, flushes connections)
sudo openpath restart   # Restart all services
```

**Uninstall:**
```bash
cd linux
sudo ./uninstall.sh
# Or unattended:
sudo ./uninstall.sh --unattended
```

### Testing Changes to Scripts

After modifying scripts in the repository:

1. **For library changes** (`lib/*.sh`):
   ```bash
   sudo cp lib/*.sh /usr/local/lib/openpath/lib/
   sudo openpath restart
   ```

2. **For main scripts** (`scripts/*.sh`):
   ```bash
   sudo cp linux/scripts/runtime/openpath-update.sh /usr/local/bin/
   sudo systemctl restart openpath-dnsmasq.timer
   ```

### Debugging

**Check service status:**
```bash
systemctl status dnsmasq
systemctl status openpath-dnsmasq.timer
systemctl status dnsmasq-watchdog.timer
systemctl status captive-portal-detector.service
```

**View service logs:**
```bash
journalctl -u dnsmasq -f
journalctl -u openpath-dnsmasq.service -f
journalctl -u dnsmasq-watchdog.service -f
```

**Check firewall rules:**
```bash
sudo iptables -L OUTPUT -n -v
```

**Check DNS configuration:**
```bash
cat /etc/dnsmasq.d/openpath.conf
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
cat /etc/chromium/policies/managed/openpath.json | python3 -m json.tool
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
1. Previously saved DNS from `/etc/openpath/original-dns.conf`
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

- `openpath-update.sh` and `captive-portal-detector.sh` share a lock file (`/var/run/openpath-update.lock`) via `flock` to prevent concurrent firewall modifications
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

Current version: **4.1.0**

Key changes from v3.x:
- PostgreSQL database (replaces JSON file storage)
- tRPC API layer with type-safe routers
- Classroom management system
- Teacher delegation approval workflow
- Push notifications for teachers
- JWT authentication with RBAC

Version is stored in:
- `lib/common.sh` - `VERSION="4.1.0"`
- `CHANGELOG.md` - Full release history

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

### API Tests (TypeScript)
```bash
npm run test --workspace=@openpath/api           # All tests
npm run test:coverage --workspace=@openpath/api  # With coverage
npm run test:security --workspace=@openpath/api  # Security tests
```

### Dashboard Tests
```bash
cd dashboard && npm test
```

### CI/CD
Workflows in `.github/workflows/`:
- `ci.yml` - BATS tests, web tests, Windows Pester tests, ShellCheck, ESLint, PSScriptAnalyzer linting
- `e2e-tests.yml` - Full E2E on Linux/Windows
- `deploy.yml` - GitHub Pages deployment
- `deploy-api.yml` - API deployment

## Verification

```bash
npm run verify    # Lint + typecheck + tests (all packages)
cd tests && bats *.bats   # Shell tests
```
