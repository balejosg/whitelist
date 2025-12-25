# Guión de Prueba: Agente Linux (Instalación y Operación)

## Contexto

Este guión cubre la instalación y operación del agente OpenPath en máquinas Linux del aula. Está pensado para que un LLM con acceso a terminal verifique el funcionamiento del sistema.

**Objetivo**: Verificar que el agente se instala correctamente, sincroniza la whitelist, y bloquea/permite dominios según configuración.

---

## Prerequisitos

- [ ] Máquina Linux (Ubuntu 22.04/24.04 recomendado)
- [ ] Acceso sudo/root
- [ ] Conexión a internet
- [ ] URL del servidor API conocida
- [ ] Credenciales o API key para el servidor

---

## SECCIÓN 1: Pre-Instalación

### Test 1.1: Verificar requisitos del sistema

**Acciones**:
1. Verifica la versión del sistema operativo:
   ```bash
   lsb_release -a
   ```

2. Verifica que systemd está disponible:
   ```bash
   systemctl --version
   ```

3. Verifica conexión a internet:
   ```bash
   ping -c 3 google.com
   ```

**Verificaciones**:
- [ ] Ubuntu 22.04 o 24.04 (o derivado de Debian)
- [ ] systemd disponible
- [ ] Hay conexión a internet

---

### Test 1.2: Verificar que dnsmasq no está instalado previamente

**Acciones**:
```bash
systemctl status dnsmasq
dpkg -l | grep dnsmasq
```

**Verificaciones**:
- [ ] dnsmasq no está instalado (o será reconfigurado)
- [ ] Si está instalado, el instalador lo configura

---

## SECCIÓN 2: Instalación

### Test 2.1: Descargar el instalador

**Acciones**:
```bash
cd /tmp
git clone https://github.com/balejosg/whitelist.git openpath-install
cd openpath-install/linux
ls -la
```

**Verificaciones**:
- [ ] Se descarga correctamente
- [ ] `install.sh` está presente
- [ ] Tiene permisos de ejecución

---

### Test 2.2: Ver ayuda del instalador

**Acciones**:
```bash
sudo ./install.sh --help
```

**Verificaciones**:
- [ ] Muestra opciones disponibles:
  - `--whitelist-url`
  - `--classroom`
  - `--api-url`
  - `--unattended`

---

### Test 2.3: Instalación básica

**Acciones**:
```bash
sudo ./install.sh --unattended \
  --whitelist-url "https://raw.githubusercontent.com/balejosg/whitelist/main/whitelist.txt"
```

**Verificaciones**:
- [ ] Instalación completa sin errores
- [ ] Mensaje de éxito al final
- [ ] No hay prompts (modo unattended)

**Captura**: Salida completa del instalador

---

### Test 2.4: Instalación con aula

**Acciones** (en otra máquina o desinstalando primero):
```bash
sudo ./install.sh --unattended \
  --classroom "informatica-3" \
  --api-url "http://api.centro.edu:3000" \
  --health-api-secret "mi-secret-seguro"
```

**Verificaciones**:
- [ ] Se configura con el aula
- [ ] Se guarda la URL del API
- [ ] La máquina se registra en el aula

---

### Test 2.5: Verificar servicios instalados

**Acciones**:
```bash
systemctl status dnsmasq
systemctl status openpath-dnsmasq.timer
systemctl status dnsmasq-watchdog.timer
systemctl status captive-portal-detector.service
```

**Verificaciones**:
- [ ] dnsmasq está `active (running)`
- [ ] Timer de actualización `active`
- [ ] Watchdog `active`
- [ ] Captive portal detector `active`

---

### Test 2.6: Verificar archivos de configuración

**Acciones**:
```bash
ls -la /etc/openpath/
cat /etc/openpath/whitelist-url.conf
cat /etc/dnsmasq.d/openpath.conf | head -20
```

**Verificaciones**:
- [ ] Directorio `/etc/openpath/` existe
- [ ] `whitelist-url.conf` contiene la URL correcta
- [ ] `openpath.conf` tiene reglas de DNS

---

## SECCIÓN 3: Funcionamiento Básico

### Test 3.1: Verificar que dnsmasq está resolviendo

**Acciones**:
```bash
dig @127.0.0.1 google.com +short
```

**Verificaciones**:
- [ ] Devuelve IP si google.com está en whitelist
- [ ] Devuelve vacío/NXDOMAIN si no está

---

### Test 3.2: Verificar dominio bloqueado

**Acciones**:
```bash
dig @127.0.0.1 facebook.com +short
```

**Verificaciones**:
- [ ] No devuelve IP (NXDOMAIN o vacío)
- [ ] El dominio está efectivamente bloqueado

---

### Test 3.3: Verificar dominio permitido

**Acciones**:
```bash
dig @127.0.0.1 github.com +short
```

**Verificaciones**:
- [ ] Devuelve IP válida
- [ ] El dominio está en la whitelist

---

### Test 3.4: Probar acceso HTTP a dominio permitido

**Acciones**:
```bash
curl -I https://github.com --max-time 10
```

**Verificaciones**:
- [ ] Respuesta HTTP 200 o redirect
- [ ] Conexión exitosa

---

### Test 3.5: Probar acceso HTTP a dominio bloqueado

**Acciones**:
```bash
curl -I https://facebook.com --max-time 10
```

**Verificaciones**:
- [ ] Timeout o error de conexión
- [ ] No resuelve DNS

---

### Test 3.6: Ver lista de dominios permitidos

**Acciones**:
```bash
openpath domains
```

**Verificaciones**:
- [ ] Lista de dominios en whitelist
- [ ] Formato legible

---

### Test 3.7: Verificar un dominio específico

**Acciones**:
```bash
openpath check youtube.com
```

**Verificaciones**:
- [ ] Indica si está permitido o no
- [ ] Información clara

---

## SECCIÓN 4: Actualización de Whitelist

### Test 4.1: Forzar actualización

**Acciones**:
```bash
sudo openpath update
```

**Verificaciones**:
- [ ] Descarga la whitelist
- [ ] Aplica cambios si hay
- [ ] Mensaje de éxito

---

### Test 4.2: Verificar logs de actualización

**Acciones**:
```bash
openpath log 50
# O
tail -50 /var/log/openpath.log
```

**Verificaciones**:
- [ ] Logs con timestamps
- [ ] Información de última sincronización
- [ ] Sin errores críticos

---

### Test 4.3: Verificar timer de actualización

**Acciones**:
```bash
systemctl list-timers | grep openpath
```

**Verificaciones**:
- [ ] Timer programado cada 5 minutos
- [ ] Próxima ejecución visible

---

### Test 4.4: Simular cambio en whitelist remota

**Acciones** (requiere modificar el archivo remoto):
1. Añadir dominio nuevo a la whitelist remota
2. Esperar 5 minutos o forzar update
3. Verificar el dominio

```bash
sudo openpath update
dig @127.0.0.1 nuevo-dominio.com +short
```

**Verificaciones**:
- [ ] El nuevo dominio se sincroniza
- [ ] Ahora resuelve correctamente

---

## SECCIÓN 5: Watchdog y Recuperación

### Test 5.1: Verificar watchdog funcionando

**Acciones**:
```bash
systemctl status dnsmasq-watchdog.timer
systemctl list-timers | grep watchdog
```

**Verificaciones**:
- [ ] Timer activo
- [ ] Se ejecuta cada 1 minuto

---

### Test 5.2: Simular fallo de dnsmasq

**Acciones**:
```bash
# Detener dnsmasq
sudo systemctl stop dnsmasq

# Esperar 1-2 minutos para que watchdog lo detecte
sleep 120

# Verificar estado
systemctl status dnsmasq
```

**Verificaciones**:
- [ ] Watchdog detecta el fallo
- [ ] Reinicia dnsmasq automáticamente
- [ ] El servicio vuelve a estar activo

---

### Test 5.3: Verificar health checks

**Acciones**:
```bash
sudo openpath health
```

**Verificaciones**:
- [ ] Resumen del estado del sistema
- [ ] DNS funcionando
- [ ] Firewall activo
- [ ] Sin problemas críticos

---

## SECCIÓN 6: Firewall

### Test 6.1: Verificar reglas iptables

**Acciones**:
```bash
sudo iptables -L OUTPUT -n -v
```

**Verificaciones**:
- [ ] DNS externo bloqueado (puerto 53)
- [ ] DNS localhost permitido
- [ ] VPN bloqueada
- [ ] HTTP/HTTPS permitido

---

### Test 6.2: Verificar bloqueo de VPN

**Acciones**:
```bash
# Intentar conectar a puerto típico de OpenVPN
nc -zv openvpn-server.com 1194 2>&1 | head -1
```

**Verificaciones**:
- [ ] Conexión rechazada/timeout
- [ ] El firewall bloquea VPN

---

### Test 6.3: Verificar que no hay bypass DNS

**Acciones**:
```bash
# Intentar usar DNS externo directamente
dig @8.8.8.8 google.com +short
```

**Verificaciones**:
- [ ] Timeout (DNS externo bloqueado)
- [ ] Solo el DNS local funciona

---

## SECCIÓN 7: Browser Policies

### Test 7.1: Verificar políticas de Firefox

**Acciones**:
```bash
cat /etc/firefox/policies/policies.json
```

**Verificaciones**:
- [ ] Archivo existe
- [ ] Contiene WebsiteFilter
- [ ] Buscador por defecto configurado

---

### Test 7.2: Verificar políticas de Chromium

**Acciones**:
```bash
cat /etc/chromium/policies/managed/openpath.json
```

**Verificaciones**:
- [ ] Archivo existe
- [ ] Contiene URLBlocklist
- [ ] Políticas activas

---

### Test 7.3: Abrir Firefox y verificar políticas

**Acciones**:
1. Abre Firefox
2. Navega a `about:policies`

**Verificaciones**:
- [ ] Políticas de OpenPath activas
- [ ] WebsiteFilter visible
- [ ] SearchEngines configurado

---

## SECCIÓN 8: Health Reports al Servidor

### Test 8.1: Verificar envío de health report

**Acciones** (si se configuró con --api-url):
```bash
# Ver logs de última sincronización
grep "health" /var/log/openpath.log | tail -5
```

**Verificaciones**:
- [ ] Se envían reportes periódicos
- [ ] Sin errores de conexión

---

### Test 8.2: Verificar registro de máquina en servidor

**Acciones** (en el servidor API o desde navegador):
1. Ir al dashboard admin
2. Sección Health o Aulas
3. Buscar el hostname de esta máquina

**Verificaciones**:
- [ ] Máquina aparece en el listado
- [ ] Última conexión reciente
- [ ] Estado "online"

---

## SECCIÓN 9: Comandos CLI

### Test 9.1: Verificar comando openpath

**Acciones**:
```bash
openpath
# O
openpath help
```

**Verificaciones**:
- [ ] Muestra ayuda con subcomandos disponibles
- [ ] status, domains, check, update, log, etc.

---

### Test 9.2: openpath status

**Acciones**:
```bash
openpath status
```

**Verificaciones**:
- [ ] Estado de dnsmasq
- [ ] Estado de firewall
- [ ] Última sincronización
- [ ] Versión instalada

---

### Test 9.3: openpath test

**Acciones**:
```bash
openpath test
```

**Verificaciones**:
- [ ] Prueba resolución DNS
- [ ] Indica si funciona correctamente

---

### Test 9.4: openpath logs en tiempo real

**Acciones**:
```bash
openpath logs
# Ctrl+C para salir
```

**Verificaciones**:
- [ ] Muestra logs en tiempo real
- [ ] Útil para debugging

---

## SECCIÓN 10: Desinstalación

### Test 10.1: Ejecutar desinstalación

**Acciones**:
```bash
cd /tmp/openpath-install/linux
sudo ./uninstall.sh --unattended
```

**Verificaciones**:
- [ ] Desinstala sin errores
- [ ] Restaura configuración anterior
- [ ] Quita servicios de systemd

---

### Test 10.2: Verificar restauración

**Acciones**:
```bash
systemctl status dnsmasq
cat /etc/resolv.conf
dig @8.8.8.8 google.com +short
```

**Verificaciones**:
- [ ] dnsmasq vuelve a config normal (o desinstalado)
- [ ] DNS funciona como antes
- [ ] Internet accesible sin restricciones

---

## SECCIÓN 11: Captive Portal

### Test 11.1: Simular portal cautivo

**Acciones** (en red con portal cautivo):
1. Conectar a WiFi con portal
2. Verificar comportamiento

**Verificaciones**:
- [ ] El sistema detecta el portal
- [ ] Permite autenticarse temporalmente
- [ ] Reactiva el firewall después

---

## SECCIÓN 12: Edge Cases

### Test 12.1: Reinicio del sistema

**Acciones**:
```bash
sudo reboot
# Después de reiniciar
openpath status
```

**Verificaciones**:
- [ ] Servicios arrancan automáticamente
- [ ] Filtrado activo tras reinicio
- [ ] Sin intervención manual

---

### Test 12.2: Sin conexión a internet

**Acciones**:
1. Desconecta la red
2. Verifica el comportamiento

**Verificaciones**:
- [ ] Usa whitelist cacheada
- [ ] No falla catastróficamente
- [ ] Logs indican el problema

---

### Test 12.3: URL de whitelist inaccesible

**Acciones**:
1. Configura URL inválida
2. Fuerza update

**Verificaciones**:
- [ ] Mensaje de error claro
- [ ] Mantiene whitelist anterior
- [ ] No rompe el sistema

---

### Test 12.4: Desactivación de emergencia remota

**Acciones** (modificar whitelist remota):
1. Añadir `# DESACTIVADO` al inicio del archivo remoto
2. Forzar update

**Verificaciones**:
- [ ] Sistema entra en modo fail-open
- [ ] Firewall se desactiva
- [ ] Todo internet accesible temporalmente

---

## Resumen de Tests

| # | Test | Descripción | Status |
|---|------|-------------|--------|
| 1.1 | Requisitos | Sistema compatible | ⬜ |
| 1.2 | Pre-dnsmasq | Estado previo | ⬜ |
| 2.1 | Descargar | Git clone | ⬜ |
| 2.2 | Help | Ayuda instalador | ⬜ |
| 2.3 | Install básico | Sin aula | ⬜ |
| 2.4 | Install aula | Con classroom | ⬜ |
| 2.5 | Servicios | Systemd activo | ⬜ |
| 2.6 | Config files | Archivos creados | ⬜ |
| 3.1 | DNS resolve | dnsmasq funciona | ⬜ |
| 3.2 | Bloqueado | Dominio no resuelve | ⬜ |
| 3.3 | Permitido | Dominio resuelve | ⬜ |
| 3.4 | HTTP ok | Acceso permitido | ⬜ |
| 3.5 | HTTP block | Acceso bloqueado | ⬜ |
| 3.6 | Dominios | Lista whitelist | ⬜ |
| 3.7 | Check | Verificar dominio | ⬜ |
| 4.1 | Update | Forzar sync | ⬜ |
| 4.2 | Logs | Ver logs | ⬜ |
| 4.3 | Timer | Actualización automática | ⬜ |
| 4.4 | Cambio remoto | Sincroniza cambios | ⬜ |
| 5.1 | Watchdog | Timer activo | ⬜ |
| 5.2 | Recuperación | Auto-restart | ⬜ |
| 5.3 | Health | Estado general | ⬜ |
| 6.1 | iptables | Reglas firewall | ⬜ |
| 6.2 | VPN block | Bloqueo VPN | ⬜ |
| 6.3 | DNS bypass | Bloqueo DNS ext | ⬜ |
| 7.1 | Firefox | Políticas | ⬜ |
| 7.2 | Chromium | Políticas | ⬜ |
| 7.3 | Firefox verify | about:policies | ⬜ |
| 8.1 | Health report | Envío al server | ⬜ |
| 8.2 | Registro | Máquina en dashboard | ⬜ |
| 9.1 | CLI help | Comando openpath | ⬜ |
| 9.2 | CLI status | Estado | ⬜ |
| 9.3 | CLI test | Prueba DNS | ⬜ |
| 9.4 | CLI logs | Tiempo real | ⬜ |
| 10.1 | Uninstall | Desinstalar | ⬜ |
| 10.2 | Restore | Restaurar config | ⬜ |
| 11.1 | Captive portal | Detección | ⬜ |
| 12.1 | Reboot | Persistencia | ⬜ |
| 12.2 | Offline | Sin internet | ⬜ |
| 12.3 | URL inválida | Manejo errores | ⬜ |
| 12.4 | Emergency | Desactivación remota | ⬜ |

### Total: 41 tests de sistema**
