#!/bin/bash
################################################################################
# apt-setup.sh - Set up Whitelist System APT repository on a client machine
#
# Usage (one-liner install):
#   curl -fsSL https://lasencinas.github.io/whitelist/apt/apt-setup.sh | sudo bash
#
# After running:
#   sudo apt install whitelist-dnsmasq
################################################################################

set -e

# Configuration
REPO_URL="https://balejosg.github.io/whitelist/apt"
GPG_KEY_URL="$REPO_URL/pubkey.gpg"
KEYRING_PATH="/usr/share/keyrings/whitelist-system.gpg"
SOURCES_PATH="/etc/apt/sources.list.d/whitelist-system.list"

echo "=============================================="
echo "  Whitelist System APT Repository Setup"
echo "=============================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)"
    exit 1
fi

# Step 1: Download and install GPG key
echo "[1/3] Downloading GPG key..."
if command -v curl &> /dev/null; then
    curl -fsSL "$GPG_KEY_URL" | gpg --dearmor -o "$KEYRING_PATH"
elif command -v wget &> /dev/null; then
    wget -qO- "$GPG_KEY_URL" | gpg --dearmor -o "$KEYRING_PATH"
else
    echo "ERROR: curl or wget required"
    exit 1
fi
chmod 644 "$KEYRING_PATH"
echo "  ✓ GPG key installed"

# Step 2: Add repository to sources.list
echo "[2/3] Adding repository..."
cat > "$SOURCES_PATH" << EOF
# Whitelist System APT Repository
# https://github.com/LasEncinasIT/Whitelist-por-aula
deb [signed-by=$KEYRING_PATH] $REPO_URL stable main
EOF
echo "  ✓ Repository added"

# Step 3: Update package lists
echo "[3/3] Updating package lists..."
apt-get update -qq

echo ""
echo "=============================================="
echo "  ✓ Repository configured successfully!"
echo "=============================================="
echo ""
echo "To install the whitelist system:"
echo "  sudo apt install whitelist-dnsmasq"
echo ""
echo "To remove:"
echo "  sudo apt remove whitelist-dnsmasq     # Keep configuration"
echo "  sudo apt purge whitelist-dnsmasq      # Remove everything"
echo ""
