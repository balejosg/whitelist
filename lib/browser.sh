#!/bin/bash
################################################################################
# browser.sh - Funciones de gestión de políticas de navegadores
# Parte del sistema dnsmasq URL Whitelist v3.4
################################################################################

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
    
    python3 << 'PYEOF'
import json
import os

policies_file = os.environ.get('FIREFOX_POLICIES', '/etc/firefox/policies/policies.json')

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
    
    # Navegadores Snap (Ubuntu)
    if command -v snap >/dev/null 2>&1; then
        snap stop firefox 2>/dev/null && closed=$((closed + 1)) || true
        snap stop chromium 2>/dev/null && closed=$((closed + 1)) || true
    fi
    
    # Navegadores nativos - SIGTERM
    for browser in firefox firefox-esr chromium chromium-browser chrome google-chrome; do
        if pgrep -x "$browser" >/dev/null 2>&1; then
            pkill -TERM -x "$browser" 2>/dev/null || true
            closed=$((closed + 1))
        fi
    done
    
    if [ $closed -gt 0 ]; then
        sleep 2
        # SIGKILL si no respondieron
        for browser in firefox firefox-esr chromium chromium-browser chrome google-chrome; do
            pkill -9 -x "$browser" 2>/dev/null || true
        done
        log "✓ $closed navegador(es) cerrado(s)"
    fi
}
