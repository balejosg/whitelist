# Whitelist DNS para Windows

Sistema de control de acceso a internet mediante DNS sinkhole para Windows, usando Acrylic DNS Proxy.

## Características

✅ **DNS Sinkhole** - Bloquea todos los dominios excepto whitelist  
✅ **Acrylic DNS Proxy** - Servidor DNS local con soporte wildcards  
✅ **Windows Firewall** - Bloquea DNS externo, VPNs, Tor  
✅ **Políticas de navegadores** - Firefox y Chrome/Edge  
✅ **Actualización automática** - Cada 5 minutos vía Task Scheduler  
✅ **Watchdog** - Auto-recuperación de fallos  

## Requisitos

- Windows 10/11 o Windows Server 2016+
- PowerShell 5.1+
- Privilegios de administrador

## Instalación Rápida

```powershell
# Ejecutar como Administrador
.\Install-Whitelist.ps1 -WhitelistUrl "http://tu-servidor:3000/export/grupo.txt"
```

## Verificar Instalación

```powershell
# Probar DNS (debe resolver)
nslookup google.com 127.0.0.1

# Probar sinkhole (debe fallar)
nslookup facebook.com 127.0.0.1

# Ver tareas programadas
Get-ScheduledTask -TaskName "Whitelist-*"

# Ver reglas de firewall
Get-NetFirewallRule -DisplayName "Whitelist-*"
```

## Estructura

```
C:\Whitelist\
├── Install-Whitelist.ps1       # Instalador
├── Uninstall-Whitelist.ps1     # Desinstalador
├── lib\
│   ├── Common.psm1             # Funciones comunes
│   ├── DNS.psm1                # Gestión Acrylic
│   ├── Firewall.psm1           # Windows Firewall
│   ├── Browser.psm1            # Políticas navegadores
│   └── Services.psm1           # Task Scheduler
├── scripts\
│   ├── Update-Whitelist.ps1    # Actualización periódica
│   └── Test-DNSHealth.ps1      # Watchdog
└── data\
    ├── config.json             # Configuración
    ├── whitelist.txt           # Whitelist local
    └── logs\                   # Logs
```

## Configuración

Editar `C:\Whitelist\data\config.json`:

```json
{
    "whitelistUrl": "http://servidor:3000/export/grupo.txt",
    "updateIntervalMinutes": 5,
    "primaryDNS": "8.8.8.8",
    "enableFirewall": true,
    "enableBrowserPolicies": true
}
```

## Desinstalación

```powershell
# Ejecutar como Administrador
.\Uninstall-Whitelist.ps1
```

## Troubleshooting

### DNS no resuelve

```powershell
# Verificar servicio Acrylic
Get-Service -DisplayName "*Acrylic*"

# Reiniciar Acrylic
Restart-Service -DisplayName "*Acrylic*"

# Ver logs
Get-Content C:\Whitelist\data\logs\whitelist.log -Tail 50
```

### Firewall bloqueando

```powershell
# Verificar reglas
Get-NetFirewallRule -DisplayName "Whitelist-*" | Format-Table

# Deshabilitar temporalmente
Get-NetFirewallRule -DisplayName "Whitelist-*" | Disable-NetFirewallRule
```

## Compatibilidad con Linux

Este sistema es el equivalente Windows del [sistema Linux](../README.md) basado en dnsmasq. Ambos sistemas:

- Usan el mismo formato de whitelist
- Son compatibles con [whitelist-web](../whitelist-web/) para gestión centralizada
- Implementan la misma lógica de sinkhole DNS

## Licencia

MIT
