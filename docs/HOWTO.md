# How-To Guide: OpenPath DNS System

## Quick Start

### Install on a Single PC

```bash
curl -fsSL https://balejosg.github.io/whitelist/apt/apt-setup.sh | sudo bash
sudo apt install whitelist-dnsmasq
```

The system will be active immediately.

---

## Configure After Installation

### Change Whitelist URL

```bash
echo "https://your-url.com/whitelist.txt" | sudo tee /etc/whitelist-system/whitelist-url.conf
sudo whitelist update
```

### Use Interactive Configuration

```bash
sudo dpkg-reconfigure whitelist-dnsmasq
```

---

## Deploy to Multiple PCs (Classroom Setup)

### Option 1: One-liner via SSH

```bash
ssh user@pc-01 "curl -fsSL https://balejosg.github.io/whitelist/apt/apt-setup.sh | sudo bash && sudo apt install -y whitelist-dnsmasq"
```

### Option 2: Ansible Playbook

```yaml
# whitelist-install.yml
- hosts: classroom_pcs
  become: yes
  tasks:
    - name: Add GPG key
      apt_key:
        url: https://balejosg.github.io/whitelist/apt/pubkey.gpg
        keyring: /usr/share/keyrings/whitelist-system.gpg

    - name: Add APT repository
      apt_repository:
        repo: "deb [signed-by=/usr/share/keyrings/whitelist-system.gpg] https://balejosg.github.io/whitelist/apt stable main"
        filename: whitelist-system

    - name: Install whitelist-dnsmasq
      apt:
        name: whitelist-dnsmasq
        state: present
        update_cache: yes

    - name: Set whitelist URL
      copy:
        content: "https://your-url.com/whitelist.txt"
        dest: /etc/whitelist-system/whitelist-url.conf

    - name: Apply configuration
      command: whitelist update
```

Run with:
```bash
ansible-playbook -i inventory.ini whitelist-install.yml
```

---

## Common Tasks

### Check System Status

```bash
whitelist status
```

### Test DNS Resolution

```bash
whitelist test
```

### Force Whitelist Update

```bash
sudo whitelist update
```

### View Logs

```bash
sudo journalctl -u dnsmasq -f
sudo tail -f /var/log/url-whitelist.log
```

### Temporarily Disable (Fail-open)

Add `# DESACTIVADO` as the first line of your remote whitelist file.
The system will automatically enter fail-open mode.

---

## Troubleshooting

### DNS Not Resolving

```bash
# Check dnsmasq status
sudo systemctl status dnsmasq

# Check port 53
sudo ss -ulnp | grep :53

# Verify resolv.conf
cat /etc/resolv.conf
```

### Firewall Blocking Everything

```bash
# Check firewall rules
sudo iptables -L OUTPUT -n

# Temporarily disable
sudo iptables -P OUTPUT ACCEPT
```

### Whitelist Not Updating

```bash
# Check timer status
systemctl status dnsmasq-whitelist.timer

# Manual update
sudo /usr/local/bin/dnsmasq-whitelist.sh
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `/etc/whitelist-system/whitelist-url.conf` | URL to fetch whitelist from |
| `/etc/whitelist-system/health-api-url.conf` | Health API endpoint (optional) |
| `/etc/whitelist-system/health-api-secret.conf` | Health API secret (optional) |
| `/var/lib/url-whitelist/whitelist.txt` | Downloaded whitelist (cache) |
| `/etc/dnsmasq.d/url-whitelist.conf` | dnsmasq configuration |

---

## Update to Latest Version

```bash
sudo apt update
sudo apt upgrade whitelist-dnsmasq
```

---

## Uninstall

### Keep configuration (can reinstall later)

```bash
sudo apt remove whitelist-dnsmasq
```

### Complete removal

```bash
sudo apt purge whitelist-dnsmasq
```

---

## APT Repository Details

- **URL**: https://balejosg.github.io/whitelist/apt/
- **Distribution**: stable
- **Component**: main
- **Architecture**: amd64
- **GPG Key**: https://balejosg.github.io/whitelist/apt/pubkey.gpg
