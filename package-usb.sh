#!/bin/bash
################################################################################
# package-usb.sh - Create USB installation package
#
# Usage:
#   1. First, create .usb-config with your secrets (gitignored)
#   2. Run: ./package-usb.sh /media/usb-drive
################################################################################

set -e

USB_PATH="${1:-./usb-package}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/.usb-config"

# Check for config file
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Missing .usb-config file!"
    echo ""
    echo "Create it with:"
    echo "cat > .usb-config << 'EOF'"
    echo 'WHITELIST_URL="https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/main/Informatica%203.txt"'
    echo 'HEALTH_API_URL="https://your-api.duckdns.org"'
    echo 'HEALTH_API_SECRET="your-secret-here"'
    echo 'SUDO_PASS="your-sudo-password"'
    echo "EOF"
    exit 1
fi

# Load config
source "$CONFIG_FILE"

echo "╔═══════════════════════════════════════════════════╗"
echo "║     📦 Creating USB Installation Package          ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "Config: $CONFIG_FILE"
echo "  WHITELIST_URL: $WHITELIST_URL"
echo "  HEALTH_API_URL: $HEALTH_API_URL"
echo ""

# Create output directory
mkdir -p "$USB_PATH"

echo "📁 Copying installation files..."
cp "$SCRIPT_DIR/install.sh" "$USB_PATH/"
cp "$SCRIPT_DIR/uninstall.sh" "$USB_PATH/"
cp -r "$SCRIPT_DIR/lib" "$USB_PATH/"
cp -r "$SCRIPT_DIR/scripts" "$USB_PATH/"
cp -r "$SCRIPT_DIR/firefox-extension" "$USB_PATH/"

echo "📝 Creating run.sh with your config..."
cat > "$USB_PATH/run.sh" << RUNSCRIPT
#!/bin/bash
cd "\$(dirname "\$0")"

echo "$SUDO_PASS" | sudo -S ./install.sh --unattended \\
    --url "$WHITELIST_URL" \\
    --health-api-url "$HEALTH_API_URL" \\
    --health-api-secret "$HEALTH_API_SECRET"

echo ""
echo "✅ Done! You can remove the USB now."
RUNSCRIPT

chmod +x "$USB_PATH/run.sh"
chmod +x "$USB_PATH/install.sh"
chmod +x "$USB_PATH/uninstall.sh"

echo ""
echo "✅ USB package created at: $USB_PATH"
echo ""
echo "📌 To install on each PC:"
echo "   bash /media/*/USBNAME/run.sh"
echo ""
