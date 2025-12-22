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
# lint.sh - Ejecuta shellcheck en todos los scripts del proyecto
#
# Uso:
#   ./scripts/lint.sh           # Verificar errores
#   ./scripts/lint.sh --fix     # Mostrar sugerencias de corrección
################################################################################

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Verificar shellcheck instalado
if ! command -v shellcheck &>/dev/null; then
    echo -e "${RED}ERROR: shellcheck no está instalado${NC}"
    echo ""
    echo "Instalar con:"
    echo "  Ubuntu/Debian: sudo apt install shellcheck"
    echo "  macOS:         brew install shellcheck"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Shellcheck Linting${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Encontrar todos los scripts
SCRIPTS=$(find . -type f -name "*.sh" ! -path "./node_modules/*" ! -path "./.git/*" 2>/dev/null)
TOTAL=$(echo "$SCRIPTS" | wc -l)
PASSED=0
FAILED=0

echo -e "Encontrados ${YELLOW}$TOTAL${NC} scripts"
echo ""

for script in $SCRIPTS; do
    if shellcheck --severity=error "$script" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $script"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $script"
        ((FAILED++))
        if [[ "$1" == "--fix" ]]; then
            echo ""
            shellcheck "$script"
            echo ""
        fi
    fi
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "  Resultados: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}✗ LINT FAILED${NC}"
    echo ""
    echo "Ejecutar './scripts/lint.sh --fix' para ver detalles"
    exit 1
else
    echo -e "${GREEN}✓ LINT PASSED${NC}"
    exit 0
fi
