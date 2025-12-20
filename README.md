# Sistema de Whitelist DNS basado en dnsmasq

Sistema modular de control de acceso a internet mediante DNS sinkhole. Bloquea todos los dominios por defecto, permitiendo únicamente aquellos incluidos en una lista blanca centralizada.

**Versión**: 3.5

## Características principales

✅ **DNS Sinkhole** - Bloquea todos los dominios excepto los de la whitelist
✅ **Protección multi-capa** - DNS, firewall iptables y políticas de navegadores
✅ **Detección de portales cautivos** - Autenticación automática en WiFi
✅ **Actualización automática** - Descarga la whitelist cada 5 minutos
✅ **Monitoreo de salud** - Verifica funcionamiento cada minuto
✅ **Desactivación remota** - Control centralizado via whitelist
✅ **Arquitectura modular** - Funcionalidad separada en librerías
✅ **Multi-plataforma** - Soporte para Linux (dnsmasq) y Windows (Acrylic DNS)
✅ **Gestión web** - SPA con autenticación GitHub OAuth para administrar reglas
✅ **Extensión Firefox** - Monitoreo de bloqueos en tiempo real

## Requisitos

- **Sistema operativo**: Ubuntu 20.04+ o Debian 10+
- **Arquitectura**: x86_64/amd64
- **Acceso**: root/sudo
- **Red**: Conexión a internet durante instalación

## Instalación

### Instalación básica

```bash
sudo ./install.sh
```

### Con URL de whitelist personalizada

```bash
sudo ./install.sh --whitelist-url "https://raw.githubusercontent.com/tu-org/repo/main/whitelist.txt"
```

### Instalación desatendida

```bash
sudo ./install.sh --unattended
```

**URL por defecto**: `https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/refs/heads/main/Informatica%203.txt`

El sistema se activa inmediatamente y persiste después de reinicios.

## Desinstalación

```bash
sudo ./uninstall.sh
```

## Estructura del proyecto

```
whitelist/
├── install.sh                      # Script de instalación principal (Linux)
├── uninstall.sh                    # Script de desinstalación (Linux)
├── lib/                            # Módulos de funcionalidad (Linux)
│   ├── common.sh                   # Variables y funciones comunes
│   ├── dns.sh                      # Gestión de dnsmasq
│   ├── firewall.sh                 # Reglas de iptables
│   ├── browser.sh                  # Políticas de navegadores
│   └── services.sh                 # Integración con systemd
├── scripts/                        # Scripts de ejecución (Linux)
│   ├── dnsmasq-whitelist.sh        # Actualiza whitelist (timer)
│   ├── dnsmasq-watchdog.sh         # Monitoreo de salud (timer)
│   ├── captive-portal-detector.sh  # Detección de portales WiFi
│   └── whitelist-cmd.sh            # Comando de usuario whitelist
├── whitelist-windows/              # Implementación Windows
│   ├── Install-Whitelist.ps1       # Instalador PowerShell
│   ├── Uninstall-Whitelist.ps1     # Desinstalador
│   └── lib/                        # Módulos PowerShell
├── whitelist-web-static/           # SPA para gestión de reglas
│   ├── index.html                  # Aplicación web
│   └── js/                         # Lógica JavaScript + GitHub OAuth
├── oauth-worker/                   # Cloudflare Worker para OAuth
│   └── worker.js                   # Backend serverless
├── firefox-extension/              # Extensión de monitoreo
│   └── manifest.json               # Firefox WebExtension
├── whitelist-request-api/          # API para solicitudes de dominios
│   └── server.js                   # Express.js REST API
└── tests/                          # Suite de tests
    ├── *.bats                      # 72 tests BATS para Linux
    └── e2e/                        # Tests E2E Linux/Windows
```

## Directorios de instalación

Después de instalar, el sistema se distribuye en:

```
/usr/local/lib/whitelist-system/    # Código e librerías
/usr/local/bin/                     # Ejecutables
  └── whitelist                     # Comando principal
/var/lib/url-whitelist/             # Configuración y estado
/etc/dnsmasq.d/                     # Configuración dnsmasq
/var/log/                           # Logs del sistema
```

## Formato de whitelist

El archivo de whitelist soporta tres secciones:

```
## WHITELIST
example.com
subdomain.example.com
google.com

## BLOCKED-SUBDOMAINS
ads.example.com

## BLOCKED-PATHS
example.com/tracking
facebook.com/ads
```

- **WHITELIST** - Dominios permitidos para resolución DNS
- **BLOCKED-SUBDOMAINS** - Subdominios bloqueados (incluso si el padre está whitelisteado)
- **BLOCKED-PATHS** - Rutas bloqueadas a nivel de navegador

## Componentes principales

### install.sh
Script de instalación que:
- Instala dependencias (dnsmasq, iptables, curl)
- Despliega módulos de librerías
- Configura servicios systemd
- Descarga whitelist inicial
- Configura firewall y políticas de navegadores

### lib/common.sh
Funciones compartidas:
- Variables de configuración global
- Funciones de logging
- Parseo de whitelist
- Detección de DNS upstream
- Funciones de utilidad

### lib/dns.sh
Gestión del DNS:
- Generación de configuración dnsmasq
- Inicialización de servicios DNS
- Validación de resolución DNS
- Configuración DNS upstream

### lib/firewall.sh
Reglas de iptables:
- Bloqueo de puertos alternativos
- Prevención de bypass (VPN, Tor, DNS alternos)
- Gestión de la tabla iptables
- Activación/desactivación de firewall

### lib/browser.sh
Políticas de navegadores:
- Generación de policies.json (Firefox)
- Generación de listas de bloqueo (Chromium)
- Configuración de motor de búsqueda
- Bloqueo de rutas específicas

### lib/services.sh
Integración systemd:
- Creación de units de servicio
- Creación de units de timer
- Activación de servicios

### scripts/dnsmasq-whitelist.sh
Actualización periódica:
- Descarga whitelist desde URL
- Regenera configuración dnsmasq
- Aplica políticas de navegadores
- Detecta desactivación remota (#DESACTIVADO)

### scripts/dnsmasq-watchdog.sh
Monitoreo de salud (cada 1 minuto):
- Verifica dnsmasq en ejecución
- Valida configuración DNS
- Auto-recuperación en fallos

### scripts/captive-portal-detector.sh
Detección de portales cautivos:
- Detecta WiFi con autenticación
- Desactiva firewall temporalmente
- Re-activa tras autenticación

## Servicios systemd

El sistema instala y activa automáticamente:

- **dnsmasq.service** - Servidor DNS principal
- **dnsmasq-whitelist.timer** - Actualiza whitelist (cada 5 min, 2 min después de boot)
- **dnsmasq-watchdog.timer** - Health check (cada 1 minuto)
- **captive-portal-detector.service** - Detección continua de portales

## Cómo funciona

### 1. DNS Sinkhole
dnsmasq se configura con:
- `address=/#/127.0.0.1` - Bloquea TODOS los dominios por defecto
- `server=/whitelisted.com/upstream.dns` - Solo resuelve whitelisteados

### 2. Protección multi-capa
1. **Capa DNS** - dnsmasq bloquea dominios no whitelisteados
2. **Capa Firewall** - iptables bloquea puertos alternativos (53, 853, VPN, Tor)
3. **Capa Navegador** - Firefox/Chromium bloquean rutas específicas

### 3. Monitoreo de salud
El watchdog:
- Verifica que dnsmasq está activo
- Comprueba configuración DNS upstream
- Valida que el sinkhole funciona
- Auto-recupera en caso de fallos

### 4. Manejo de portales cautivos
Sistema detecta automáticamente:
- Conexiones WiFi con portales de autenticación
- Desactiva firewall temporalmente para autenticación
- Re-activa restricciones tras autenticarse
- Comprueba cada 30 segundos

## Desarrollo

### Añadir nueva funcionalidad

1. Crear función en módulo apropiado en `lib/`
2. Importar con: `source "$INSTALL_DIR/lib/modulename.sh"`
3. Probar con: `sudo ./install.sh`

### Modificar configuración dnsmasq

1. Editar `generate_dnsmasq_config()` en `lib/dns.sh`
2. Aplicar cambios: `sudo systemctl restart dnsmasq`
3. Validar: `dnsmasq --test -C /etc/dnsmasq.d/url-whitelist.conf`

### Testing

**Quick validation before committing:**
```bash
./tests/validate-release.sh
```

This validates file permissions, directory structure, and package completeness.

**Manual DNS testing:**
```bash
# Probar resolución DNS local
dig @127.0.0.1 example.com

# Probar resolución del sistema
dig example.com

# Ver logs
tail -f /var/log/url-whitelist.log

# Estado del servicio
sudo systemctl status dnsmasq
sudo journalctl -u dnsmasq -f
```

## Seguridad

### Qué se bloquea

- ✓ Puertos DNS alternativos (53, 853)
- ✓ Protocolos VPN (OpenVPN, WireGuard, PPTP)
- ✓ Red Tor
- ✓ Dominios no whitelisteados
- ✓ Rutas bloqueadas en navegadores

### Qué NO se bloquea

- ✗ Conexiones SSH
- ✗ Red local (LAN)
- ✗ ICMP (ping)
- ✗ NTP (reloj del sistema)
- ✗ Direcciones IP hardcodeadas (requiere reglas adicionales)

## Desactivación remota

Modificar la whitelist para comenzar con:
```
#DESACTIVADO
```

El script la detectará y pasará a modo fail-open:
- DNS sin restricciones
- Firewall desactivado
- Políticas de navegador desactivadas

## Troubleshooting

### DNS no resuelve

```bash
# Verificar status de dnsmasq
sudo systemctl status dnsmasq

# Probar configuración
dnsmasq --test -C /etc/dnsmasq.d/url-whitelist.conf

# Verificar puerto 53
sudo ss -ulnp | grep :53
```

### Dominio no accesible

```bash
# Ver whitelist
sudo grep "^example.com" /var/lib/url-whitelist/whitelist.txt

# Probar DNS directamente
dig @127.0.0.1 example.com +short

# Ver últimos logs
tail -20 /var/log/url-whitelist.log
```

### Firewall bloqueando tráfico legítimo

```bash
# Desactivar temporalmente (debug)
sudo systemctl stop dnsmasq-whitelist.service
sudo iptables -F

# Restaurar
sudo systemctl restart dnsmasq
```

### Sistema en modo fail-safe

Activado cuando:
- Descarga de whitelist falla
- Sin conexión a internet
- Fallo de servicio crítico

Recuperación:
- Restaurar internet
- `sudo systemctl restart dnsmasq`

## Logs

```bash
# Logs principales
tail -f /var/log/url-whitelist.log

# Logs del servicio dnsmasq
sudo journalctl -u dnsmasq -f

# Logs de actualizaciones
sudo journalctl -u dnsmasq-whitelist.service -n 50

# Logs del watchdog
sudo journalctl -u dnsmasq-watchdog.service -f
```

## Licencia

Sistema para uso educativo e institucional.

---

## Componentes adicionales

| Componente | Plataforma | Documentación |
|------------|------------|---------------|
| [whitelist-windows](./whitelist-windows/) | Windows 10/11 | DNS con Acrylic Proxy |
| [whitelist-web](./whitelist-web/) | Docker | Gestión web con autenticación |
| [whitelist-web-static](./whitelist-web-static/) | Web (GitHub Pages) | SPA para gestión centralizada |
| [whitelist-request-api](./whitelist-request-api/) | Node.js | API REST para solicitudes de dominios |
| [oauth-worker](./oauth-worker/) | Cloudflare Workers | Backend OAuth para SPA |
| [firefox-extension](./firefox-extension/) | Firefox | Monitoreo de bloqueos |
| [tests/e2e](./tests/e2e/) | Linux/Windows | Tests End-to-End |

---

**Versión**: 3.5
**Última actualización**: Diciembre 2024

---

## CI/CD

Este proyecto utiliza GitHub Actions para integración y despliegue continuos.

| Workflow | Propósito | Trigger |
|----------|-----------|---------|
| `ci.yml` | Tests, linting, Docker build | Push/PR a main |
| `security.yml` | CodeQL, Shellcheck, Trivy, Gitleaks | Push/PR + semanal |
| `e2e-tests.yml` | Tests E2E Linux/Windows | Push/PR |
| `deploy.yml` | Deploy a GitHub Pages | Push a main |
| `deploy-api.yml` | Deploy API via SSH (con rollback) | Push a main |
| `release-please.yml` | Versionado semántico automático | Push a main |
| `perf-test.yml` | Tests de rendimiento | Semanal + manual |
| `release-extension.yml` | Release Firefox extension | Push a main |
| `release-scripts.yml` | Release scripts instalación | Push a main |

### Características CI/CD

- ✅ Control de concurrencia (cancela runs duplicados)
- ✅ Node.js 20 estandarizado
- ✅ Linting (ESLint) en todas las apps Node.js
- ✅ Rollback automático en deploy fallido
- ✅ Versionado semántico con Release Please
- ✅ Tests de rendimiento semanales
- ✅ Escaneo de seguridad multi-capa

