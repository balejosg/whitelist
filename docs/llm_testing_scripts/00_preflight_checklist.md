# UAT Pre-flight Checklist

> [!CAUTION]
> **NO DEBE EJECUTARSE NINGÚN TEST SIN COMPLETAR ESTA CHECKLIST PRIMERO**
> 
> Si algún punto falla, los tests UAT no tienen validez y deben postponerse hasta resolver el problema.

## 1. Verificación de Infraestructura

### 1.1 API Accesible
```bash
# Ejecutar ANTES de cualquier test
curl -s --connect-timeout 10 https://openpath-api.duckdns.org/health
```

**Resultado esperado:**
```json
{"status":"ok","service":"openpath-api"}
```

- [ ] ✅ API responde con status 200
- [ ] ✅ JSON contiene `"status":"ok"`

> [!WARNING]
> Si curl falla o devuelve error, **DETENER** las pruebas y reportar el problema.

### 1.2 SPA Accesible
```bash
curl -s --connect-timeout 10 -o /dev/null -w "%{http_code}" https://balejosg.github.io/openpath/
```

**Resultado esperado:** `200`

- [ ] ✅ SPA carga correctamente (HTTP 200)

### 1.3 Conexión API ↔ SPA
Abrir el navegador en https://balejosg.github.io/openpath/ y verificar en DevTools → Network que:

- [ ] ✅ Las peticiones a `openpath-api.duckdns.org` no dan CORS errors
- [ ] ✅ El endpoint `/trpc/setup.checkSetup` responde

---

## 2. Verificación de Credenciales

### 2.1 Cuenta Admin Disponible
- [ ] ✅ Existe cuenta de admin con email conocido
- [ ] ✅ Contraseña de admin disponible
- [ ] ✅ Login de admin funciona

### 2.2 Token de Registro (si aplica tests de agente)
- [ ] ✅ Token de registro disponible para tests del agente Linux

---

## 3. Estado del Sistema

### 3.1 Base de Datos
- [ ] ✅ La API puede conectar a PostgreSQL (verificado por /health)

### 3.2 Versión Desplegada
```bash
# Verificar que el commit desplegado es el esperado
curl -s https://openpath-api.duckdns.org/trpc/healthcheck.version 2>/dev/null || echo "Endpoint no disponible"
```

---

## 4. Registro de Verificación

**Fecha de verificación:** ____________________
**Verificado por:** ____________________
**Commit/Versión:** ____________________

| Check | Estado | Notas |
|-------|--------|-------|
| API Health | ⬜ | |
| SPA Carga | ⬜ | |
| CORS OK | ⬜ | |
| Login Admin | ⬜ | |
| DB Conectada | ⬜ | |

---

## 5. Procedimiento si Falla la Verificación

1. **NO EJECUTAR** ningún test UAT
2. Documentar el error encontrado
3. Crear un issue o notificar al equipo
4. Resolver el problema de infraestructura PRIMERO
5. Volver a ejecutar esta checklist desde el principio

---

> [!IMPORTANT]
> **Esta checklist es OBLIGATORIA antes de cada sesión de UAT.**
> Los reportes de UAT sin esta verificación previa no tienen validez.
