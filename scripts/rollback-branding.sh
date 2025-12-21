#!/bin/bash
# scripts/rollback-branding.sh
# Emergency rollback for OpenPath rebranding configuration changes

echo "🔄 Rolling back configuration changes..."

# 1. Revert SPA Config Key
sed -i "s/STORAGE_KEY: 'openpath-spa-config'/STORAGE_KEY: 'whitelist-spa-config'/g" spa/js/config.js
echo "✅ Reverted spa/js/config.js"

# 2. Revert OAuth Token Key
sed -i "s/STORAGE_KEY: 'openpath-oauth-token'/STORAGE_KEY: 'whitelist-oauth-token'/g" spa/js/oauth.js
echo "✅ Reverted spa/js/oauth.js"

# 3. Revert Firefox Extension ID
sed -i 's/"id": "monitor-bloqueos@openpath"/"id": "monitor-bloqueos@whitelist-system"/g' firefox-extension/manifest.json
echo "✅ Reverted firefox-extension/manifest.json"

# 4. Revert Native Host Allowed Origin
sed -i 's/"monitor-bloqueos@openpath"/"monitor-bloqueos@whitelist-system"/g' firefox-extension/native/whitelist_native_host.json
echo "✅ Reverted firefox-extension/native/whitelist_native_host.json"

echo "🎉 Rollback complete. Verify with 'git diff'"
