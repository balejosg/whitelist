# PLAN: Token delivery único (upstream + downstream)

## Objetivo
Unificar el mecanismo de entrega de whitelist para **upstream (OSS)** y **downstream (SaaS)** usando **únicamente** URLs tokenizadas por máquina:

- Descarga pública sin auth:
  - `GET /w/:machineToken/whitelist.txt`
- El servidor guarda **solo el hash** del token (no guarda token en claro).
- El token se entrega **una sola vez** durante el registro/instalación del endpoint.
- Rotación de token es requisito:
  - El endpoint solicita rotación usando **SHARED_SECRET global**.

**Fail-open obligatorio:**
- Si hay cualquier error en la descarga (token inválido, DB error, machine sin classroom, etc.), el server responde `200 text/plain` con primera línea `#DESACTIVADO`.

---

## Decisiones cerradas
1. **Token delivery es la única opción** en upstream y downstream (no GitHub raw URLs para agentes).
2. Token en URL, servidor almacena **solo hash**.
3. Token **por máquina** (no por grupo).
4. Rotación de token: **requisito**.
5. Endpoint público sin auth (protegido por token).
6. Shared secret para operaciones privadas es **global** (mismo para todas las máquinas).
7. No se requiere retrocompatibilidad (se aceptan cambios breaking para instalaciones anteriores).
8. Windows guarda shared secret en `config.json`.
9. **Ver URL = Rotar** (Opción A): No hay endpoint para "ver" la URL sin rotarla. Si se necesita la URL, se rota el token y se obtiene una nueva.

---

## Hallazgos críticos verificados en código

### ⚠️ CRÍTICO: Endpoint REST `/api/setup/validate-token` NO EXISTE
- `linux/install.sh` (línea 126) llama a `POST $API_URL/api/setup/validate-token`
- `api/src/server.ts` **no tiene** ningún handler `/api/setup/*`
- Solo existe el equivalente tRPC `setup.validateToken` en `api/src/trpc/routers/setup.ts`
- `dashboard/src/index.ts` tampoco lo implementa

**Acción requerida:** Implementar handlers REST en `api/src/server.ts` para:
- `POST /api/setup/validate-token`
- `POST /api/machines/register`
- `POST /api/machines/:hostname/rotate-download-token`

### Multi-tenancy (downstream SaaS)
- El schema actual (`api/src/db/schema.ts`) es **100% single-tenant**
- No existe ninguna columna `tenantId` en ninguna tabla
- Para SaaS multi-tenant, downstream deberá:
  - Añadir `tenantId` a `machines`, `classrooms`, `whitelistGroups`, etc.
  - Filtrar siempre por tenant en lookups

**Nota:** Este plan es válido para OSS; downstream añade tenants sobre esta base.

### Rate limiting: YA CUBIERTO
- `api/src/server.ts` tiene `globalLimiter` (200 req/min por IP) aplicado a todo
- El nuevo endpoint `/w/:token/...` estará cubierto automáticamente
- Rate limit específico es **opcional** (no bloqueante)

### Redacción de tokens en logs: NECESARIA
- `api/src/lib/logger.ts` loguea `req.path` directamente
- URLs tipo `/w/abc123secret.../whitelist.txt` expondrían tokens en logs
- **Acción:** Modificar `requestMiddleware` para redactar paths `/w/:token/`:
  ```typescript
  const safePath = req.path.startsWith('/w/') 
    ? req.path.replace(/^\/w\/[^/]+/, '/w/[REDACTED]')
    : req.path;
  ```

### Migración de máquinas existentes
- Tabla `machines` actual no tiene `downloadTokenHash`
- Estrategia:
  1. Añadir columna nullable en migración
  2. Máquinas existentes sin hash → fail en `/w/...` hasta re-registro o rotación forzada
  3. Documentar que tras despliegue, endpoints deben re-registrarse

---

## Contexto del repo (hallazgos relevantes)
- En `api/src/server.ts` actualmente se ve:
  - `/health`
  - `/export/:name.txt`
  - `/trpc`
  - Swagger (opcional)
  - SPA static
  - **No** hay handlers REST `/api/*`
- El "registration token" ya existe y se guarda en `settings.key = 'registration_token'`.
  - `api/src/lib/setup-storage.ts` implementa:
    - `validateRegistrationToken(token)` con timing-safe equal.
- `sharedSecretProcedure` (tRPC) valida contra `process.env.SHARED_SECRET`.
- `config.publicUrl` existe en `api/src/config.ts` para construir URLs públicas.

---

## Contratos HTTP finales

### Público (sin auth)
#### 1) Descargar whitelist tokenizada
`GET /w/:machineToken/whitelist.txt`

**Respuesta OK**:
- `200 text/plain`
- contenido generado por `groupsStorage.exportGroup(groupId)` del grupo actual de la máquina.

**Respuesta fail-open (cualquier error)**:
- `200 text/plain`
- body mínimo: `#DESACTIVADO\n`

---

### Privado (bootstrap: registration token)
#### 2) Registrar máquina y entregar token por única vez
`POST /api/machines/register`

**Auth**:
- `Authorization: Bearer <REGISTRATION_TOKEN>`

**Body (JSON)**:
- `hostname: string` (obligatorio)
- `classroomName: string` (obligatorio)
- `version?: string` (opcional)

**Side effects**:
- Upsert machine (hostname único).
- Asociar machine a classroom.
- Generar `machineToken` aleatorio y guardar **hash** en DB.

**Respuesta**:
```json
{
  "success": true,
  "whitelistUrl": "https://<PUBLIC_URL>/w/<machineToken>/whitelist.txt"
}
```

---

### Privado (operaciones posteriores: SHARED_SECRET global)
#### 3) Rotar token de descarga
`POST /api/machines/:hostname/rotate-download-token`

**Auth**:
- `Authorization: Bearer <SHARED_SECRET>`

**Side effects**:
- Genera token nuevo.
- Sustituye el hash anterior por el nuevo.
- Actualiza `downloadTokenLastRotatedAt`.

**Respuesta**:
```json
{
  "success": true,
  "whitelistUrl": "https://<PUBLIC_URL>/w/<newToken>/whitelist.txt"
}
```

---

### Endpoint REST para validación (requerido por instalador Linux)
#### 4) Validar registration token
`POST /api/setup/validate-token`

**Auth**: Ninguna (público)

**Body (JSON)**:
- `token: string`

**Respuesta**:
```json
{ "valid": true }
```
o
```json
{ "valid": false }
```

**Implementación**: Llamar a `SetupService.validateToken(token)` existente.

---

## Cambios de DB (upstream + downstream)

Tabla `machines`:
- `downloadTokenHash` (string, nullable inicialmente → NOT NULL después de backfill)
- `downloadTokenLastRotatedAt` (timestamp nullable)

Índices:
- `UNIQUE(downloadTokenHash)` recomendado

Hashing:
- El server calcula `hash = sha256(machineToken)` y hace lookup por igualdad indexable:
  - `SELECT ... FROM machines WHERE download_token_hash = $hash LIMIT 1`

---

## Utilidades crypto
Crear helper `api/src/lib/machine-download-token.ts`:
- `generateMachineToken()`:
  - randomBytes(32) → base64url (o hex) suficientemente largo/no guessable.
- `hashMachineToken(token)`:
  - sha256 → hex (o base64); consistente en toda la app.

No se requiere `timingSafeEqual` en verificación del token de descarga porque no se compara contra múltiples hashes: se hace lookup por igualdad del hash.

---

## Lógica de "grupo actual"
El server debe resolver, dado `machine -> classroom`:
- `activeGroupId` manual override si existe
- si no: `scheduleStorage.getCurrentSchedule(classroomId, now)` para grupo por horario
- si no: `defaultGroupId`
- Luego exporta whitelist con `groupsStorage.exportGroup(groupId)`

Si el grupo está deshabilitado, `exportGroup` ya inserta `#DESACTIVADO` (comportamiento existente), lo cual cumple fail-open.

Aun así, el endpoint público debe envolver todo con "fail-open on error" devolviendo `#DESACTIVADO`.

---

## Cambios en API (código)

### Archivos a crear/modificar en `api/`

| Archivo | Acción |
|---------|--------|
| `api/src/db/schema.ts` | Añadir `downloadTokenHash`, `downloadTokenLastRotatedAt` a `machines` |
| `api/drizzle/XXXX_add_download_token.sql` | Nueva migración |
| `api/src/lib/machine-download-token.ts` | **Nuevo**: generación + hash |
| `api/src/lib/classroom-storage.ts` | Añadir `getMachineByDownloadTokenHash()`, `updateDownloadToken()` |
| `api/src/lib/logger.ts` | Redactar paths `/w/:token/` en `requestMiddleware` |
| `api/src/server.ts` | Añadir handlers REST: `/api/setup/validate-token`, `/api/machines/register`, `/api/machines/:hostname/rotate-download-token`, `/w/:machineToken/whitelist.txt` |

---

## Cambios en Linux agent

### Objetivo de Linux
- No pedir más "whitelist-url dinámica" al server.
- Guardar directamente en `/etc/openpath/whitelist-url.conf` una URL tokenizada estable.

### Cambios requeridos
1) `linux/install.sh`
- Dejar `--registration-token` (bootstrap).
- Añadir `--shared-secret` (global) o pedir interactive.
- Guardar SHARED_SECRET global en `/etc/openpath/api-secret.conf` (chmod 600).
- Reemplazar el registro actual `POST /api/classrooms/machines/register` por:
  - `POST /api/machines/register` con Authorization Bearer REGISTRATION_TOKEN
- Parsear respuesta y guardar `whitelistUrl` en `/etc/openpath/whitelist-url.conf`.

2) `linux/scripts/runtime/openpath-update.sh`
- Eliminar bloque "Modo Aula: obtener URL dinámica desde API".
- Siempre leer `whitelist-url.conf` como fuente principal.

3) Rotación
- Añadir comando `openpath rotate-token` (en `linux/scripts/runtime/openpath-cmd.sh`):
  - `POST /api/machines/:hostname/rotate-download-token` con Authorization Bearer SHARED_SECRET
  - Actualiza `/etc/openpath/whitelist-url.conf`.

---

## Cambios en Windows agent

### Objetivo de Windows
- Guardar `whitelistUrl` tokenizada y `sharedSecret` global dentro de `C:\OpenPath\data\config.json`.

### Cambios requeridos
1) `windows/data/config.json`
- Añadir `sharedSecret` (string).

2) `windows/Install-OpenPath.ps1`
- En modo aula / central:
  - llamar `POST /api/machines/register` con registration token
  - guardar `whitelistUrl`
  - guardar `sharedSecret` en config.json

3) Rotación
- Nuevo script `windows/scripts/Rotate-Token.ps1` (o integrado en Update):
  - llama `POST /api/machines/:hostname/rotate-download-token` con sharedSecret
  - actualiza config.json

---

## Dashboard: mostrar estado del token (sin exponer URL)

Para que admins tengan visibilidad sin necesidad de rotar, el dashboard debe mostrar:

```
Máquina: pc-lab-01
Classroom: Informática 3
Token configurado: ✅ Sí / ❌ No
Última rotación: 2025-01-04 10:30 (o "Nunca")
[Rotar y obtener URL]  ← botón que rota y muestra la nueva URL UNA VEZ
```

Esto requiere exponer en la API (tRPC o REST admin):
- `hasDownloadToken: boolean`
- `downloadTokenLastRotatedAt: string | null`

Sin exponer el token real.

---

## Tests requeridos (API)
Añadir/ajustar tests para:
- `/w/:token/whitelist.txt`
  - token válido → contenido whitelist
  - token inválido → `#DESACTIVADO` con 200
- `/api/setup/validate-token`
  - token válido → `{ valid: true }`
  - token inválido → `{ valid: false }`
- `/api/machines/register`
  - registration token válido → devuelve whitelistUrl
  - registration token inválido → 401/403
  - crea machine con `downloadTokenHash`
- `/api/machines/:hostname/rotate-download-token`
  - con shared secret válido → devuelve nueva URL
  - token viejo deja de funcionar (devuelve `#DESACTIVADO`)
  - token nuevo funciona

---

## Seguridad / Operación
- **Redacción de tokens en logs**: Implementar en `api/src/lib/logger.ts`
- SHARED_SECRET global debe ser tratado como secreto de infraestructura:
  - bien protegido y rotado manualmente (no por endpoint).
- Rotar download token:
  - invalida inmediatamente token previo, por lo que endpoints deben actualizar su config tras rotación.

---

## Entregables
1) API soporta token delivery único con los endpoints definidos.
2) Endpoint REST `/api/setup/validate-token` implementado (fix bug existente).
3) Linux installer guarda whitelist tokenizada y ya no pide URL dinámica.
4) Windows installer guarda whitelist tokenizada y shared secret en config.json.
5) Scripts de rotación en Linux y Windows.
6) Redacción de tokens en logs implementada.
7) Dashboard muestra `hasDownloadToken` y `lastRotatedAt` con botón "Rotar".
8) Tests actualizados para reflejar el nuevo mecanismo.
