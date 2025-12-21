#!/bin/bash
################################################################################
# browser.sh - Funciones de gestión de políticas de navegadores
# Parte del sistema dnsmasq URL Whitelist v3.5
################################################################################

# Calcular hash de las políticas actuales
get_policies_hash() {
    local hash=""
    if [ -f "$FIREFOX_POLICIES" ]; then
        hash="${hash}$(md5sum "$FIREFOX_POLICIES" 2>/dev/null | cut -d' ' -f1)"
    fi
    # Añadir hash de blocked_paths para detectar cambios en WebsiteFilter
    hash="${hash}$(echo "${BLOCKED_PATHS[*]}" | md5sum | cut -d' ' -f1)"
    echo "$hash"
}

# Generar políticas de Firefox
generate_firefox_policies() {
    log "Generando políticas de Firefox..."
    
    local policies_file="$FIREFOX_POLICIES"
    mkdir -p "$(dirname "$policies_file")"
    
    # Usar Python para hacer merge (preserva SearchEngines)
    python3 << PYEOF
import json
import os

policies_file = "$policies_file"
blocked_paths_str = """${BLOCKED_PATHS[*]}"""
blocked_paths = blocked_paths_str.split() if blocked_paths_str.strip() else []

def normalize_path(path):
    clean = path
    for prefix in ['http://', 'https://', '*://']:
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    
    if '/' not in clean and '.' not in clean and '*' not in clean:
        clean = f"*{clean}*"
    else:
        if not clean.endswith('*'):
            clean = f"{clean}*"
    
    if clean.startswith('*.'):
        return f"*://{clean}"
    elif clean.startswith('*/'):
        return f"*://*{clean[1:]}"
    elif '.' in clean and '/' in clean:
        return f"*://*.{clean}"
    else:
        return f"*://{clean}"

# Leer políticas existentes o crear nuevas
if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
    except:
        policies = {"policies": {}}
else:
    policies = {"policies": {}}

if "policies" not in policies:
    policies["policies"] = {}

# Actualizar WebsiteFilter
normalized_paths = [normalize_path(p) for p in blocked_paths if p.strip()]
policies["policies"]["WebsiteFilter"] = {"Block": normalized_paths}

with open(policies_file, 'w') as f:
    json.dump(policies, f, indent=2)

print(f"Firefox: {len(normalized_paths)} paths bloqueados")
PYEOF
    
    log "✓ Políticas de Firefox generadas"
}

# Generar políticas de Chromium/Chrome
generate_chromium_policies() {
    log "Generando políticas de Chromium..."
    
    local dirs=(
        "$CHROMIUM_POLICIES_BASE"
        "/etc/chromium-browser/policies/managed"
        "/etc/opt/chrome/policies/managed"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        
        if [ ${#BLOCKED_PATHS[@]} -gt 0 ]; then
            # Generar JSON con URLBlocklist
            python3 << PYEOF
import json

blocked_paths_str = """${BLOCKED_PATHS[*]}"""
blocked_paths = blocked_paths_str.split() if blocked_paths_str.strip() else []

def normalize_path(path):
    clean = path
    for prefix in ['http://', 'https://', '*://']:
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    if not clean.endswith('*'):
        clean = f"{clean}*"
    return clean

normalized = [normalize_path(p) for p in blocked_paths if p.strip()]

policy = {"URLBlocklist": normalized}

with open("$dir/url-whitelist.json", 'w') as f:
    json.dump(policy, f, indent=2)
PYEOF
        else
            echo '{"URLBlocklist": []}' > "$dir/url-whitelist.json"
        fi
    done
    
    log "✓ Políticas de Chromium generadas"
}

# Aplicar políticas de motores de búsqueda (eliminar Google)
apply_search_engine_policies() {
    log "Aplicando políticas de motores de búsqueda..."
    
    local policies_file="$FIREFOX_POLICIES"
    
    # CRÍTICO: Crear directorio si no existe
    mkdir -p "$(dirname "$policies_file")"
    
    python3 << 'PYEOF'
import json
import os

policies_file = os.environ.get('FIREFOX_POLICIES', '/etc/firefox/policies/policies.json')

# Crear directorio si no existe
os.makedirs(os.path.dirname(policies_file), exist_ok=True)

# Leer o crear políticas
if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
    except:
        policies = {"policies": {}}
else:
    policies = {"policies": {}}

if "policies" not in policies:
    policies["policies"] = {}

# Añadir SearchEngines
policies["policies"]["SearchEngines"] = {
    "Remove": ["Google", "Bing"],
    "Default": "DuckDuckGo",
    "Add": [
        {
            "Name": "DuckDuckGo",
            "Description": "Motor de búsqueda centrado en privacidad",
            "Alias": "ddg",
            "Method": "GET",
            "URLTemplate": "https://duckduckgo.com/?q={searchTerms}",
            "IconURL": "https://duckduckgo.com/favicon.ico",
            "SuggestURLTemplate": "https://ac.duckduckgo.com/ac/?q={searchTerms}&type=list"
        },
        {
            "Name": "Wikipedia (ES)",
            "Description": "Enciclopedia libre",
            "Alias": "wiki",
            "Method": "GET",
            "URLTemplate": "https://es.wikipedia.org/wiki/Special:Search?search={searchTerms}",
            "IconURL": "https://es.wikipedia.org/static/favicon/wikipedia.ico"
        }
    ]
}

# Añadir bloqueos de búsqueda de Google a WebsiteFilter
if "WebsiteFilter" not in policies["policies"]:
    policies["policies"]["WebsiteFilter"] = {"Block": []}

google_blocks = [
    "*://www.google.com/search*",
    "*://www.google.es/search*",
    "*://google.com/search*",
    "*://google.es/search*"
]

for block in google_blocks:
    if block not in policies["policies"]["WebsiteFilter"]["Block"]:
        policies["policies"]["WebsiteFilter"]["Block"].append(block)

with open(policies_file, 'w') as f:
    json.dump(policies, f, indent=2)

print("SearchEngines y bloqueos de Google aplicados")
PYEOF
    
    log "✓ Motores de búsqueda configurados"
}

# Limpiar políticas de navegadores
cleanup_browser_policies() {
    log "Limpiando políticas de navegadores..."
    
    # Firefox - Limpiar policies.json
    if [ -f "$FIREFOX_POLICIES" ]; then
        echo '{"policies": {}}' > "$FIREFOX_POLICIES"
        log "✓ Políticas de Firefox limpiadas"
    fi
    
    # Chromium/Chrome
    local dirs=(
        "$CHROMIUM_POLICIES_BASE"
        "/etc/chromium-browser/policies/managed"
        "/etc/opt/chrome/policies/managed"
    )
    
    for dir in "${dirs[@]}"; do
        rm -f "$dir/url-whitelist.json" 2>/dev/null || true
        rm -f "$dir/search-engines.json" 2>/dev/null || true
    done
    
    log "✓ Políticas de navegadores limpiadas"
}

# Cerrar navegadores para aplicar políticas
force_browser_close() {
    log "Cerrando navegadores..."
    
    local closed=0
    
    # Método 1: pkill por nombre de proceso (funciona para nativos y Snap)
    # -f busca en toda la línea de comando
    for pattern in "firefox" "chromium" "chrome"; do
        if pgrep -f "$pattern" >/dev/null 2>&1; then
            log "Detectado proceso: $pattern - enviando SIGTERM..."
            pkill -TERM -f "$pattern" 2>/dev/null || true
            closed=$((closed + 1))
        fi
    done
    
    # Esperar a que cierren gracefully
    if [ $closed -gt 0 ]; then
        log "Esperando cierre de $closed navegador(es)..."
        sleep 3
        
        # SIGKILL para los que no respondieron
        for pattern in "firefox" "chromium" "chrome"; do
            if pgrep -f "$pattern" >/dev/null 2>&1; then
                log "Forzando cierre de: $pattern"
                pkill -9 -f "$pattern" 2>/dev/null || true
            fi
        done
        
        sleep 1
        log "✓ Navegadores cerrados"
    else
        log "No se detectaron navegadores abiertos"
    fi
}
# ============================================================================
# FIREFOX ESR INSTALLATION
# ============================================================================

# Install Firefox ESR, removing Snap Firefox if present
install_firefox_esr() {
    log "Verificando instalación de Firefox..."
    
    # Check if Snap Firefox is installed
    if snap list firefox &>/dev/null 2>&1; then
        log "⚠ Firefox Snap detectado - removiendo..."
        
        # Close any running Firefox first
        pkill -9 -f firefox 2>/dev/null || true
        sleep 2
        
        # Remove Snap Firefox
        snap remove --purge firefox 2>/dev/null || snap remove firefox 2>/dev/null || true
        
        log "✓ Firefox Snap removido"
    fi
    
    # Check if Firefox ESR is already installed via APT
    if dpkg -l firefox-esr &>/dev/null 2>&1; then
        log "✓ Firefox ESR ya instalado"
        return 0
    fi
    
    # Check if regular Firefox (non-snap) is installed
    if dpkg -l firefox &>/dev/null 2>&1 && ! snap list firefox &>/dev/null 2>&1; then
        log "✓ Firefox (APT) ya instalado"
        return 0
    fi
    
    log "Instalando Firefox ESR..."
    
    # Add Mozilla team PPA for Ubuntu (provides firefox-esr)
    if command -v add-apt-repository &>/dev/null; then
        # For Ubuntu: use Mozilla PPA
        add-apt-repository -y ppa:mozillateam/ppa 2>/dev/null || true
        
        # Set Firefox ESR as priority over Snap
        cat > /etc/apt/preferences.d/mozilla-firefox << 'EOF'
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001

Package: firefox
Pin: version 1:1snap*
Pin-Priority: -1
EOF
    fi
    
    apt-get update -qq
    
    # Try firefox-esr first (Debian), then firefox (Ubuntu with PPA)
    if apt-cache show firefox-esr &>/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y firefox-esr
        log "✓ Firefox ESR instalado"
    else
        DEBIAN_FRONTEND=noninteractive apt-get install -y firefox
        log "✓ Firefox instalado desde PPA"
    fi
}

# Detect Firefox installation directory
detect_firefox_dir() {
    local dirs=(
        "/usr/lib/firefox-esr"
        "/usr/lib/firefox"
        "/opt/firefox"
    )
    
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ] && [ -f "$dir/firefox" -o -f "$dir/firefox-bin" ]; then
            echo "$dir"
            return 0
        fi
    done
    
    # Fallback: find firefox binary and get its directory
    local firefox_bin=$(which firefox-esr 2>/dev/null || which firefox 2>/dev/null)
    if [ -n "$firefox_bin" ]; then
        local real_path=$(readlink -f "$firefox_bin")
        dirname "$real_path"
        return 0
    fi
    
    return 1
}

# Generate Firefox autoconfig to disable signature requirements
generate_firefox_autoconfig() {
    local firefox_dir=$(detect_firefox_dir)
    
    if [ -z "$firefox_dir" ]; then
        log "⚠ Firefox no detectado, saltando autoconfig"
        return 1
    fi
    
    log "Generando autoconfig en $firefox_dir..."
    
    # Create autoconfig.js in defaults/pref
    mkdir -p "$firefox_dir/defaults/pref"
    cat > "$firefox_dir/defaults/pref/autoconfig.js" << 'EOF'
// Autoconfig para Whitelist System
pref("general.config.filename", "mozilla.cfg");
pref("general.config.obscure_value", 0);
EOF
    
    # Create mozilla.cfg (must start with comment line - it's a JS file)
    cat > "$firefox_dir/mozilla.cfg" << 'EOF'
// Whitelist System Configuration
// Disable signature requirement for local extensions
lockPref("xpinstall.signatures.required", false);
lockPref("extensions.langpacks.signatures.required", false);
// Prevent extension blocklist from blocking our extension
lockPref("extensions.blocklist.enabled", false);
EOF
    
    log "✓ Firefox autoconfig generado"
    return 0
}

# ============================================================================
# FIREFOX EXTENSION INSTALLATION
# ============================================================================

# Install Firefox extension system-wide
install_firefox_extension() {
    local ext_source="${1:-$INSTALL_DIR/firefox-extension}"
    local ext_id="monitor-bloqueos@whitelist-system"
    local firefox_app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
    local ext_dir="/usr/share/mozilla/extensions/$firefox_app_id"
    
    if [ ! -d "$ext_source" ]; then
        log "⚠ Directorio de extensión no encontrado: $ext_source"
        return 1
    fi
    
    log "Instalando extensión Firefox..."
    
    # First, generate autoconfig to disable signature requirements
    generate_firefox_autoconfig
    
    # Create extension directory
    mkdir -p "$ext_dir/$ext_id"
    
    # Copy extension files (excluding native host and build scripts)
    cp "$ext_source/manifest.json" "$ext_dir/$ext_id/"
    cp "$ext_source/background.js" "$ext_dir/$ext_id/"
    [ -f "$ext_source/config.js" ] && cp "$ext_source/config.js" "$ext_dir/$ext_id/"
    cp -r "$ext_source/popup" "$ext_dir/$ext_id/"
    cp -r "$ext_source/icons" "$ext_dir/$ext_id/"
    
    # Set permissions
    chmod -R 755 "$ext_dir/$ext_id"
    
    log "✓ Extensión copiada a $ext_dir/$ext_id"
    
    # Update policies.json to force-install the extension
    add_extension_to_policies "$ext_id" "$ext_dir/$ext_id"
    
    log "✓ Extensión Firefox instalada"
    return 0
}

# Add extension to Firefox policies for force-install
add_extension_to_policies() {
    local ext_id="$1"
    local ext_path="$2"
    
    local policies_file="$FIREFOX_POLICIES"
    mkdir -p "$(dirname "$policies_file")"
    
    python3 << PYEOF
import json
import os

policies_file = "$policies_file"
ext_id = "$ext_id"
ext_path = "$ext_path"

# Read existing policies or create new
if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
    except:
        policies = {"policies": {}}
else:
    policies = {"policies": {}}

if "policies" not in policies:
    policies["policies"] = {}

# Add ExtensionSettings for force-install
if "ExtensionSettings" not in policies["policies"]:
    policies["policies"]["ExtensionSettings"] = {}

policies["policies"]["ExtensionSettings"][ext_id] = {
    "installation_mode": "force_installed",
    "install_url": f"file://{ext_path}"
}

# Also add to Extensions.Install list
if "Extensions" not in policies["policies"]:
    policies["policies"]["Extensions"] = {}

if "Install" not in policies["policies"]["Extensions"]:
    policies["policies"]["Extensions"]["Install"] = []

# Add path if not already present
if ext_path not in policies["policies"]["Extensions"]["Install"]:
    policies["policies"]["Extensions"]["Install"].append(ext_path)

# Lock the extension so users can't disable it
if "Locked" not in policies["policies"]["Extensions"]:
    policies["policies"]["Extensions"]["Locked"] = []

if ext_id not in policies["policies"]["Extensions"]["Locked"]:
    policies["policies"]["Extensions"]["Locked"].append(ext_id)

with open(policies_file, 'w') as f:
    json.dump(policies, f, indent=2)

print(f"Extensión {ext_id} añadida a políticas")
PYEOF
    
    log "✓ Extensión añadida a policies.json"
}

# Install native messaging host for the extension
install_native_host() {
    local native_source="${1:-$INSTALL_DIR/firefox-extension/native}"
    local native_manifest_dir="/usr/lib/mozilla/native-messaging-hosts"
    local native_script_dir="/usr/local/lib/whitelist-system"
    
    if [ ! -d "$native_source" ]; then
        log "⚠ Directorio native host no encontrado: $native_source"
        return 1
    fi
    
    log "Instalando native messaging host..."
    
    # Create directories
    mkdir -p "$native_manifest_dir"
    mkdir -p "$native_script_dir"
    
    # Copy Python script
    cp "$native_source/whitelist-native-host.py" "$native_script_dir/"
    chmod +x "$native_script_dir/whitelist-native-host.py"
    
    # Generate manifest with correct path
    cat > "$native_manifest_dir/whitelist_native_host.json" << EOF
{
    "name": "whitelist_native_host",
    "description": "Whitelist System Native Messaging Host",
    "path": "$native_script_dir/whitelist-native-host.py",
    "type": "stdio",
    "allowed_extensions": ["monitor-bloqueos@whitelist-system"]
}
EOF
    
    log "✓ Native messaging host instalado"
    return 0
}

# Remove Firefox extension (for uninstall)
remove_firefox_extension() {
    local ext_id="monitor-bloqueos@whitelist-system"
    local firefox_app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
    local ext_dir="/usr/share/mozilla/extensions/$firefox_app_id/$ext_id"
    
    log "Removiendo extensión Firefox..."
    
    # Remove extension directory
    rm -rf "$ext_dir" 2>/dev/null || true
    
    # Remove from policies.json
    if [ -f "$FIREFOX_POLICIES" ]; then
        python3 << PYEOF
import json
import os

policies_file = "$FIREFOX_POLICIES"
ext_id = "$ext_id"

if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
        
        # Remove from ExtensionSettings
        if "policies" in policies and "ExtensionSettings" in policies["policies"]:
            policies["policies"]["ExtensionSettings"].pop(ext_id, None)
        
        # Remove from Extensions lists
        if "policies" in policies and "Extensions" in policies["policies"]:
            ext = policies["policies"]["Extensions"]
            if "Install" in ext:
                ext["Install"] = [p for p in ext["Install"] if ext_id not in p]
            if "Locked" in ext:
                ext["Locked"] = [e for e in ext["Locked"] if e != ext_id]
        
        with open(policies_file, 'w') as f:
            json.dump(policies, f, indent=2)
    except:
        pass
PYEOF
    fi
    
    # Remove native host
    rm -f "/usr/lib/mozilla/native-messaging-hosts/whitelist_native_host.json" 2>/dev/null || true
    rm -f "/usr/local/lib/whitelist-system/whitelist-native-host.py" 2>/dev/null || true
    
    # Remove autoconfig
    local firefox_dir=$(detect_firefox_dir 2>/dev/null)
    if [ -n "$firefox_dir" ]; then
        rm -f "$firefox_dir/defaults/pref/autoconfig.js" 2>/dev/null || true
        rm -f "$firefox_dir/mozilla.cfg" 2>/dev/null || true
    fi
    
    log "✓ Extensión Firefox removida"
}