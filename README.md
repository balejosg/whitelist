# Sistema de Control de Acceso a Internet - Whitelist

Sistema de filtrado de contenido basado en dnsmasq para entornos educativos. Permite el acceso únicamente a dominios aprobados mediante una lista blanca centralizada y actualizable remotamente.

## Características principales

- **Filtrado DNS transparente**: Solo los dominios en la whitelist pueden resolver
- **Gestión centralizada**: Lista alojada en GitHub, editable desde cualquier navegador
- **Actualización automática**: Los cambios se propagan a todos los equipos en 5 minutos
- **Desactivación remota de emergencia**: Palabra clave `# DESACTIVADO` en la whitelist deshabilita restricciones
- **Fail-safe**: Si no puede descargar la whitelist, permite acceso completo (fail-open)
- **Detección de captive portals**: Se desactiva automáticamente ante portales de autenticación
- **Protección anti-bypass**: Bloquea VPN, Tor y DNS alternos
- **Instalación segura**: Validaciones múltiples previenen pérdida de conectividad

## Requisitos

- Ubuntu 20.04+ o Debian 10+ (arquitectura x86_64/amd64)
- Acceso root/sudo
- Conexión a internet durante instalación

## Instalación

```bash
git clone https://github.com/balejosg/whitelist.git
cd whitelist
sudo ./setup-dnsmasq-whitelist.sh
```

Durante la instalación se detecta automáticamente la configuración de red (gateway, DNS). El instalador pregunta qué URL de whitelist usar:

- **Por defecto**: `https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/refs/heads/main/Informatica%203.txt`
- **Personalizada**: Proporcionar URL alternativa de GitHub/GitLab (raw URL)

Para instalación desatendida con URL personalizada:

```bash
sudo ./setup-dnsmasq-whitelist.sh --whitelist-url "https://raw.githubusercontent.com/tu-org/repo/main/whitelist.txt"
```

El sistema queda activo inmediatamente y persiste tras reinicios.

## Gestión de la whitelist

### Formato del archivo

Archivo de texto plano, un dominio por línea. Comentarios permitidos con `#`.

```
# Educación
educamadrid.org
wikipedia.org
khanacademy.org

# Herramientas
google.com
github.com
```

**Nota**: No es necesario incluir subdomominios. `google.com` permite automáticamente `www.google.com`, `mail.google.com`, etc.

### Editar la whitelist (GitHub)

1. Acceder a la URL de tu whitelist en GitHub
2. Clic en botón **Edit** (ícono lápiz)
3. Realizar cambios
4. Clic en **Commit changes**
5. Los equipos descargarán la nueva versión en máximo 5 minutos

### Dominios siempre permitidos

Estos dominios están hardcodeados en el sistema y no requieren estar en la whitelist:

- `google.es`, `google.com` - Búsquedas básicas
- `github.com`, `githubusercontent.com` - Descarga de whitelist
- `ubuntu.com` - Actualizaciones del sistema (archive, security, packages)
- `educamadrid.org` - Plataforma educativa Madrid
- `detectportal.firefox.com` - Detección de captive portals
- `anthropic.com`, `claude.ai` - Herramientas IA educativas

Además, incluye CDNs comunes: `cloudflare.com`, `akamaized.net`, `cloudfront.net`, `googleapis.com`

## Desactivación de emergencia

### Método 1: Desactivación remota (todos los equipos simultáneamente)

Añadir la palabra clave `# DESACTIVADO` como primera línea del archivo whitelist en GitHub:

```
# DESACTIVADO
# Sistema deshabilitado temporalmente
wikipedia.org
google.com
...
```

**Efecto**: En máximo 5 minutos, todos los equipos eliminarán restricciones y permitirán acceso completo a internet.

**Para reactivar**: Eliminar la línea `# DESACTIVADO` del archivo y hacer commit. Las restricciones se restablecen en 5 minutos.

**Variantes detectadas**: `# DESACTIVADO`, `# desactivado`, `#DESACTIVADO`, `# Sistema desactivado` (case-insensitive)

### Método 2: Desactivación local (un solo equipo)

```bash
sudo systemctl stop dnsmasq-whitelist.timer
sudo systemctl stop dnsmasq-whitelist.service
```

Para reactivar:

```bash
sudo systemctl start dnsmasq-whitelist.timer
```

## Comandos de administración

| Acción | Comando |
|--------|---------|
| **Estado del sistema** | `sudo systemctl status dnsmasq-whitelist.timer` |
| **Ver logs en tiempo real** | `sudo tail -f /var/log/url-whitelist.log` |
| **Forzar actualización inmediata** | `sudo /usr/local/bin/dnsmasq-whitelist.sh` |
| **Ver whitelist actual** | `cat /var/lib/url-whitelist/whitelist.txt` |
| **Ver configuración dnsmasq** | `cat /etc/dnsmasq.d/url-whitelist.conf` |
| **Ver reglas firewall** | `sudo iptables -L OUTPUT -n -v` |
| **Desactivar sistema** | `sudo systemctl disable --now dnsmasq-whitelist.timer` |
| **Activar sistema** | `sudo systemctl enable --now dnsmasq-whitelist.timer` |
| **Desinstalar completamente** | `sudo ./rollback-dnsmasq-whitelist.sh` |

## Verificación y diagnóstico

### Verificar que el sistema está activo

```bash
sudo systemctl status dnsmasq-whitelist.timer
```

Debe mostrar `active (running)` en verde.

### Probar resolución DNS

Dominio permitido (debe resolver):
```bash
dig @127.0.0.1 google.com
```

Dominio NO permitido (debe retornar NXDOMAIN):
```bash
dig @127.0.0.1 facebook.com
```

### Ver logs de actividad

```bash
sudo tail -n 50 /var/log/url-whitelist.log
```

Buscar mensajes como:
- `✓ Whitelist descargado exitosamente`
- `DESACTIVACIÓN REMOTA DETECTADA` (si está desactivado)
- `=== SISTEMA DESACTIVADO REMOTAMENTE - Eliminando restricciones ===`

## Solución de problemas

**No puedo acceder a ninguna página web**

1. Verificar que el sistema está corriendo: `sudo systemctl status dnsmasq-whitelist.timer`
2. Revisar logs: `sudo tail -n 50 /var/log/url-whitelist.log`
3. Ejecutar manualmente: `sudo /usr/local/bin/dnsmasq-whitelist.sh`
4. Verificar DNS: `cat /etc/resolv.conf` (debe ser `nameserver 127.0.0.1`)

**Las páginas añadidas a la whitelist no funcionan**

1. Esperar 5 minutos tras editar en GitHub
2. Verificar formato correcto (dominio base, sin `http://` ni `www` innecesario)
3. Forzar actualización manual: `sudo /usr/local/bin/dnsmasq-whitelist.sh`
4. Ver whitelist descargada: `cat /var/lib/url-whitelist/whitelist.txt`

**El sistema no se actualiza automáticamente**

1. Verificar timer: `sudo systemctl status dnsmasq-whitelist.timer`
2. Si inactivo, activar: `sudo systemctl enable --now dnsmasq-whitelist.timer`

## Desinstalación

```bash
sudo ./rollback-dnsmasq-whitelist.sh
```

Restaura completamente la configuración original del sistema:
- Re-habilita systemd-resolved
- Restaura `/etc/resolv.conf` (preservando symlinks)
- Elimina reglas de firewall
- Elimina servicios systemd
- Valida conectividad final

## Preguntas frecuentes

**¿Funciona en Windows o Mac?**
No. Solo Ubuntu/Debian Linux.

**¿Afecta a todos los usuarios del ordenador?**
Sí, el filtrado se aplica a nivel de sistema.

**¿Puedo usar diferentes whitelists en diferentes equipos?**
Sí. Durante la instalación, proporcionar URL distinta en cada equipo, o usar `--whitelist-url` para instalaciones desatendidas.

**¿Qué pasa si se cae GitHub?**
El sistema mantiene la última whitelist descargada. Si no puede actualizar, continúa usando la versión cacheada en `/var/lib/url-whitelist/whitelist.txt`.

**¿Qué pasa si falla la descarga inicial durante instalación?**
El sistema entra en modo fail-open (permite todo). Los dominios hardcodeados (BASE_URLS) siempre están disponibles.

**¿Se puede burlar este sistema?**
Un usuario con permisos root puede desactivarlo. Recomendaciones:
- No otorgar sudo a estudiantes
- Contraseñas fuertes en cuentas administrativas
- Revisión periódica de logs

**¿Cómo funciona la detección de captive portals?**
El servicio `captive-portal-detector` monitoriza `http://detectportal.firefox.com/success.txt` cada 30 segundos. Si detecta portal de autenticación (ej: WEDU login), desactiva firewall temporalmente hasta completar autenticación.

## Documentación técnica

Para detalles de arquitectura, componentes, y desarrollo:
- [CLAUDE.md](CLAUDE.md) - Documentación completa de arquitectura y componentes internos

## Soporte

- **Issues**: https://github.com/balejosg/whitelist/issues
- **Logs del sistema**: `/var/log/url-whitelist.log`
- **Logs captive portal**: `/var/log/captive-portal-detector.log`

## Licencia

Código abierto, uso libre en entornos educativos.
