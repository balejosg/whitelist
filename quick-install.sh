#!/bin/bash
################################################################################
# quick-install.sh - One-liner installation script
#
# Usage (run on each student PC):
#   curl -sSL https://raw.githubusercontent.com/balejosg/whitelist/main/quick-install.sh | sudo bash
#
# Or with wget:
#   wget -qO- https://raw.githubusercontent.com/balejosg/whitelist/main/quick-install.sh | sudo bash
################################################################################

set -e

# ========== CONFIGURE THESE VALUES ==========
WHITELIST_URL="https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/main/Informatica%203.txt"
HEALTH_API_URL="https://your-api-host.duckdns.org"
HEALTH_API_SECRET="your-shared-secret-here"
# =============================================

REPO_URL="https://github.com/balejosg/whitelist"
BRANCH="main"

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║     🛡️  Whitelist System Quick Install            ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Create temp directory
TMPDIR=$(mktemp -d)
cd "$TMPDIR"

echo "📥 Downloading latest release..."
curl -sSL "${REPO_URL}/archive/refs/heads/${BRANCH}.tar.gz" | tar -xz
cd whitelist-${BRANCH}

echo "🚀 Running installer..."
./install.sh --unattended \
    --url "$WHITELIST_URL" \
    --health-api-url "$HEALTH_API_URL" \
    --health-api-secret "$HEALTH_API_SECRET"

# Cleanup
cd /
rm -rf "$TMPDIR"

echo ""
echo "✅ Installation complete!"
echo ""
