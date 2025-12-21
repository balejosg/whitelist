# OpenPath

**Strict Internet Access Control. Zero Administration Headaches.**

OpenPath is a robust, "default-deny" internet access control system designed for classrooms, laboratories, and corporate environments. It blocks everything by default, allowing only explicitly approved domains.

Unlike traditional firewalls that require manual rule updates and complex VPNs, OpenPath decentralizes enforcement to the endpoints while centralizing control in a modern web dashboard.

## Why OpenPath?

- **🚫 Default Deny Security**: If it's not whitelisted, it doesn't exist. Eliminate distractions and security risks at the DNS level.
- **🧠 GitOps Logic**: Your whitelist is just a text file in a GitHub repository. Every change is a commit. You get version history, audit logs, and instant rollbacks for free.
- **⚡ Self-Service Workflow**: Users hitting a block page can request access instantly. Admins approve requests in a dashboard, and the system handles the rest.
- **🛡️ Resilient Architecture**: Endpoints download and cache rules locally. If your central server or internet connection goes down, the filtering rules remain active.
- **🔋 Batteries Included**: Comes with DNS sinkholing (dnsmasq), firewall rules (iptables), and browser policies (Firefox/Chrome) out of the box.

---

## How It Works

1. **The User** tries to access `blocked-site.com`. Access is denied.
2. **The Request**: User submits an unblock request via the portal.
3. **The Decision**: Admin reviews the request in the Dashboard and clicks "Approve".
4. **The Magic**: The system commits the change to the GitHub repository.
5. **The Sync**: All connected endpoints pull the new whitelist within minutes.

## Installation

### Linux (Debian/Ubuntu)

One-line installation via APT. Sets up `dnsmasq`, `iptables` rules, and the update watchdog.

```bash
# Setup repository and install
curl -fsSL https://balejosg.github.io/whitelist/apt/apt-setup.sh | sudo bash
sudo apt install whitelist-dnsmasq
```

### Windows

PowerShell-based installation using Acrylic DNS Proxy.

```powershell
./windows/Install-Whitelist.ps1
```

## System Architecture

The ecosystem consists of four main pillars:

1. **Request API**: Node.js backend that handles user requests and telemetry.
2. **Dashboard**: Web interface for visualizing requests, managing domain groups, and monitoring endpoint health.
3. **Endpoint Agents**: Lightweight scripts (Bash/PowerShell) running on client machines. They enforce rules via `dnsmasq` or `Acrylic`.
4. **Git Storage**: The single source of truth. All rules live in `whitelist.txt` in your repo.

## Configuration

### Changing the Whitelist URL

Point your agents to your own repository:

```bash
echo "https://your-repo.com/whitelist.txt" | sudo tee /etc/openpath/whitelist-url.conf
sudo whitelist update
```

### Whitelist Format

Simple, readable text format.

```ini
## WHITELIST
google.com
github.com
# Comments are allowed

## BLOCKED-SUBDOMAINS
# Allow domain.com but block ads.domain.com
ads.domain.com

## BLOCKED-PATHS
# Browser-level blocking (advanced)
facebook.com/gaming
```

## Troubleshooting

### Check Status

```bash
whitelist status
```

### Force Update

```bash
whitelist update
```

**Emergency Disable**
Add `#DESACTIVADO` to the start of your remote whitelist file. Endpoints will pick it up and fail-open (disable all blocking) automatically.

---

**License**: Educational/Institutional Use.
