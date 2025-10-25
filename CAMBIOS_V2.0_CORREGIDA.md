# Correcciones Críticas v2.0 - Resumen de Cambios

**Fecha:** 2025-10-25
**Versión:** v2.0 CORREGIDA

---

## 🚨 Problemas Críticos Solucionados

### 1. DNS Sinkhole Incompleto → SOLUCIONADO ✅

**Problema:**
- El script solo configuraba `server=/domain/gateway` para dominios whitelisted
- No bloqueaba explícitamente dominios NO en whitelist
- Comentario erróneo decía no usar `address=/#/`

**Solución:**
- Añadida directiva `address=/#/127.0.0.1` para bloquear dominios no-whitelist
- Corregido comentario explicando que `address=` NO sobrescribe `server=`
- **Archivo:** setup-dnsmasq-whitelist.sh líneas 394-398

---

### 2. Firewall Permitía HTTP/HTTPS a CUALQUIER IP → SOLUCIONADO ✅

**Problema (CRÍTICO):**
```bash
# ANTES (INSEGURO):
iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
```
Esto permitía conexiones HTTP/HTTPS a cualquier destino sin validación.

**Solución:**
```bash
# DESPUÉS (SEGURO):
iptables -A OUTPUT -p tcp --dport 80 -m set --match-set url_whitelist dst -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set url_whitelist dst -j ACCEPT
```
Ahora valida que la IP destino esté en ipset antes de permitir conexión.
- **Archivo:** setup-dnsmasq-whitelist.sh líneas 170-173

---

### 3. Falta de ipset para Validación de IPs → SOLUCIONADO ✅

**Problema:**
- v2.0 eliminó ipset completamente
- Confiaba solo en filtrado DNS
- Fácil bypass con IPs cacheadas

**Solución:**
- Reintroducido ipset `url_whitelist`
- dnsmasq añade IPs automáticamente: `ipset=/domain/url_whitelist`
- Pre-población de IPs de dominios base al inicio
- **Archivo:** setup-dnsmasq-whitelist.sh líneas 386-390, 422-451

---

### 4. Rollback Podía Dejar Sistema sin Internet → SOLUCIONADO ✅

**Problemas:**
- `set -e` causaba salidas abruptas en errores
- Orden de operaciones incorrecto (dnsmasq antes de DNS)
- Sin validación de servicios restaurados
- Sin plan de emergencia

**Solución:**
- Eliminado `set -e`, añadido manejo explícito de errores
- Orden correcto: systemd-resolved → dnsmasq → resolv.conf → validación
- Validación de DNS y conectividad
- DNS de emergencia (8.8.8.8) si falla restauración
- **Archivo:** rollback-dnsmasq-whitelist.sh (completo)

---

### 5. Liberación de Puerto 53 Mejorada → SOLUCIONADO ✅

**Mejoras:**
- Detiene `systemd-resolved.socket` además del servicio
- Timeout extendido de 10s a 30s
- Mejor diagnóstico de errores (muestra procesos usando puerto 53)
- **Archivo:** setup-dnsmasq-whitelist.sh líneas 72-98

---

## 📐 Nueva Arquitectura v2.0 Corregida

### Defensa en Tres Capas

**Capa 1: DNS Sinkhole (dnsmasq)**
- Dominios whitelisted: `server=/domain/gateway` + `ipset=/domain/url_whitelist`
- Dominios NO whitelisted: `address=/#/127.0.0.1` (bloqueados)
- dnsmasq añade IPs a ipset automáticamente en tiempo real

**Capa 2: Validación de IPs (ipset)**
- ipset `url_whitelist` mantiene lista de IPs permitidas
- Pre-poblado con dominios base al inicio
- Actualizado automáticamente por dnsmasq al resolver dominios

**Capa 3: Firewall (iptables)**
- Bloquea DNS a servidores no-localhost
- Bloquea puertos VPN (OpenVPN, WireGuard, PPTP)
- Bloquea puertos Tor
- **HTTP/HTTPS solo a IPs en ipset** ← FIX CRÍTICO
- Bloquea acceso directo por IP (excepto redes privadas)

### Detector de Portal Cautivo

Mantiene funcionalidad para WEDU:
- Modo NO autenticado: firewall desactivado (permite login WEDU)
- Modo autenticado: firewall activado (whitelist activa)
- Verifica estado cada 30 segundos

---

## 🛡️ Prevención de Bypass

| Método de Bypass | Cómo se Previene |
|------------------|------------------|
| DNS alternativo | iptables bloquea DNS excepto localhost |
| IPs cacheadas | ipset valida IPs en firewall |
| Acceso directo por IP | iptables requiere ipset match para HTTP/HTTPS |
| VPN | iptables bloquea puertos VPN comunes |
| Proxy | Combinación DNS + IP validation |
| /etc/hosts | Combinación DNS + IP validation |

---

## 📦 Archivos Modificados

1. **setup-dnsmasq-whitelist.sh** - Script de instalación
   - DNS sinkhole funcional (address=/#/)
   - ipset reintroducido y configurado
   - Firewall con validación ipset
   - Mejor liberación puerto 53
   - Instalación de dependencias (añadido ipset, dnsutils)

2. **rollback-dnsmasq-whitelist.sh** - Script de rollback
   - Manejo seguro de errores
   - Orden de operaciones correcto
   - Validación de DNS y conectividad
   - DNS de emergencia

3. **CLAUDE.md** - Documentación
   - Nueva sección "Architecture v2.0 Corrections"
   - Documentación completa de bugs y fixes
   - Explicación de nueva arquitectura
   - Guía de prevención de bypass

---

## ✅ Testing Recomendado

Antes de desplegar en otras máquinas:

1. **Test DNS Sinkhole:**
   ```bash
   nslookup facebook.com 127.0.0.1  # Debe retornar 127.0.0.1
   nslookup google.es 127.0.0.1    # Debe retornar IP real
   ```

2. **Test ipset:**
   ```bash
   sudo ipset list url_whitelist    # Debe mostrar IPs
   ```

3. **Test Firewall:**
   ```bash
   curl -v https://google.es        # Debe funcionar
   curl -v https://facebook.com     # Debe fallar
   curl -v http://142.250.XXX.XXX   # Debe fallar (IP directa bloqueada)
   ```

4. **Test Rollback:**
   ```bash
   sudo ./rollback-dnsmasq-whitelist.sh
   # Debe restaurar internet completamente
   ```

---

## 🚀 Próximos Pasos

1. **Probar rollback en máquina afectada** para restaurar internet
2. **Desinstalar versión v2.0 rota** en todas las máquinas
3. **Instalar versión v2.0 corregida**
4. **Validar funcionamiento** en cada máquina
5. **Actualizar repositorio** con commit descriptivo

---

## 📝 Notas de Despliegue

- El rollback corregido es seguro de ejecutar
- Si falla, aplicará DNS de emergencia (8.8.8.8)
- La nueva instalación requiere las mismas dependencias
- Compatible con sistemas existentes (sobrescribe configuración)
- Mantiene compatibilidad con portal cautivo WEDU

---

**Autor:** Claude Code
**Revisión:** v2.0 CORREGIDA - 2025-10-25
