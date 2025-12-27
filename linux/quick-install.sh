#!/bin/bash

# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

################################################################################
# quick-install.sh - One-liner installation script
#
# Usage (run on each student PC):
#   curl -sSL https://raw.githubusercontent.com/balejosg/openpath/main/quick-install.sh | sudo bash
#
# Or with wget:
#   wget -qO- https://raw.githubusercontent.com/balejosg/openpath/main/quick-install.sh | sudo bash
################################################################################

set -e

# ========== CONFIGURE THESE VALUES ==========
WHITELIST_URL="https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/main/Informatica%203.txt"
HEALTH_API_URL="https://openpath-api.duckdns.org"
HEALTH_API_SECRET="your-shared-secret-here"
# =============================================

REPO_URL="https://github.com/balejosg/openpath"
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
