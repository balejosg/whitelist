# PLAN: Separación Upstream (OSS) / Downstream (SaaS)

## Objetivo
Separar el repositorio actual en:
- **Upstream (OSS)**: Código genérico reutilizable por cualquier organización
- **Downstream (SaaS)**: Tu instancia específica con configuración y features propias

## Principio guía
El upstream NO debe contener:
- URLs hardcodeadas de tu instancia
- Credenciales o secrets de tu infraestructura
- Workflows de deploy a TU infraestructura
- Código que solo tiene sentido para tu SaaS

---

## Hallazgos: Código específico de instancia a limpiar

### 1. CORS hardcodeado (CRÍTICO)

**Archivo: `api/src/config.ts` (línea 91)**
```typescript
? ['https://balejosg.github.io']  // ← QUITAR
```

**Archivo: `api/src/server.ts` (líneas 121-123)**
```typescript
forced: 'https://balejosg.github.io'  // ← QUITAR
corsOrigins = ['https://balejosg.github.io'];  // ← QUITAR
```

**Acción**: Cambiar a valores neutros o vacíos. En producción se configura vía `CORS_ORIGINS` env var.

---

### 2. URLs de whitelist hardcodeadas

**Archivo: `linux/install.sh` (línea 45)**
```bash
DEFAULT_WHITELIST_URL="https://raw.githubusercontent.com/LasEncinasIT/Whitelist-por-aula/..."
```

**Archivo: `linux/lib/common.sh` (línea 73)**
```bash
DEFAULT_WHITELIST_URL="...LasEncinasIT/Whitelist-por-aula..."
```

**Archivo: `linux/quick-install.sh` (líneas 32, 37)**
```bash
WHITELIST_URL="...balejosg/openpath..."
REPO_URL="https://github.com/balejosg/openpath"
```

**Archivo: `windows/data/config.json` (línea 2)**
```json
"whitelistUrl": "https://raw.githubusercontent.com/LasEncinasIT/..."
```

**Acción**: 
- OSS: Usar placeholder genérico o requerir configuración explícita
- Eliminar referencias a `LasEncinasIT` (tu organización específica)

---

### 3. GitHub owner/repo hardcodeado

**Archivo: `api/src/services/classroom.service.ts` (línea 260)**
```typescript
const owner = process.env.GITHUB_OWNER ?? 'LasEncinasIT';
```

**Acción**: Cambiar default a string vacío o `'your-org'` placeholder.

---

### 4. URLs de API específicas de instancia

**Archivo: `firefox-extension/src/config.ts` (línea 36)**
```typescript
requestApiUrl: 'https://openpath-api.duckdns.org',
```

**Archivo: `spa/src/oauth.ts` (línea 11)**
```typescript
const DEFAULT_OAUTH_WORKER_URL = 'https://openpath-oauth.bruno-alejosgomez.workers.dev';
```

**Archivo: `spa/e2e/fixtures/api-fixtures.ts` (línea 8)**
```typescript
const API_BASE_URL = process.env['API_URL'] ?? 'https://openpath-api.duckdns.org';
```

**Archivo: `spa/e2e/fixtures/auth.ts` (línea 81)**
```typescript
const API_URL = process.env['API_URL'] ?? 'https://openpath-api.duckdns.org';
```

**Acción**: 
- OSS: Usar `localhost` o placeholder vacío como default
- Mover tu duckdns URL a downstream

---

### 5. Swagger/docs con tu URL

**Archivo: `api/src/lib/swagger.ts` (línea 50)**
```typescript
url: 'https://github.com/balejosg/openpath'
```

**Acción**: Cambiar a URL genérica del proyecto OSS.

---

### 6. Package.json con tu repo

**Archivo: `package.json` (línea 38)**
```json
"url": "git+https://github.com/balejosg/openpath.git"
```

**Acción**: Esto puede quedarse si el OSS vive en tu cuenta, o cambiar a una org dedicada.

---

### 7. Docker compose con tu registry

**Archivo: `docker-compose.prod.yml` (línea 25)**
```yaml
image: ghcr.io/${GITHUB_REPOSITORY:-balejosg/openpath}/api:latest
```

**Acción**: El default `balejosg/openpath` es específico. Cambiar a placeholder o requerir variable.

---

### 8. Firefox extension con tu URL

**Archivo: `firefox-extension/manifest.json` (líneas 7, 10)**
```json
"homepage_url": "https://github.com/balejosg/openpath",
"url": "https://github.com/balejosg/openpath"
```

**Acción**: Mantener si el OSS vive en tu cuenta, o cambiar a org dedicada.

---

## Componentes a MOVER a downstream (no deben estar en OSS)

### 1. `auth-worker/` (TODO el directorio)
- Es un Cloudflare Worker para **tu** OAuth flow
- Contiene `wrangler.toml` con configuración de **tu** cuenta
- OSS users implementarán su propio auth o usarán otro método

**Acción**: Mover a repo downstream o eliminar de OSS y documentar como "implementa tu propio OAuth worker".

### 2. Workflows de deploy específicos
Estos workflows despliegan a **tu** infraestructura:

| Workflow | Razón para mover |
|----------|------------------|
| `deploy.yml` | Despliega SPA a tu GitHub Pages |
| `deploy-api.yml` | Despliega API a tu servidor |
| `reusable-deploy.yml` | Template para tus deploys |

**Acción**: Mover a downstream. OSS solo necesita CI (lint, test, build).

### 3. Workflows que pueden quedarse en OSS

| Workflow | Razón |
|----------|-------|
| `ci.yml` | Tests genéricos |
| `e2e-tests.yml` | Tests E2E genéricos |
| `e2e-comprehensive.yml` | Tests E2E exhaustivos |
| `build-deb.yml` | Build de paquete Debian |
| `release-please.yml` | Automatiza releases |
| `security.yml` | Escaneo de seguridad |
| `lighthouse.yml` | Performance audits |

---

## Plan de ejecución (orden recomendado)

### Fase 1: Limpiar hardcodes en OSS (sin romper funcionalidad)

1. **`api/src/config.ts`**: Cambiar CORS default de `balejosg.github.io` a `[]` (requiere env var en prod)
2. **`api/src/server.ts`**: Eliminar override forzado de CORS
3. **`api/src/services/classroom.service.ts`**: Cambiar `LasEncinasIT` a placeholder
4. **`linux/install.sh`, `linux/lib/common.sh`**: Cambiar URL default a placeholder
5. **`windows/data/config.json`**: Cambiar URL a placeholder
6. **`spa/src/oauth.ts`**: Cambiar worker URL a placeholder
7. **`firefox-extension/src/config.ts`**: Cambiar API URL a localhost default
8. **`spa/e2e/fixtures/`**: Cambiar API URL default a localhost

### Fase 2: Mover auth-worker a downstream

1. Crear repo downstream (o branch)
2. Mover `auth-worker/` completo
3. Actualizar `package.json` workspaces
4. Actualizar docs indicando que auth-worker es opcional/externo

### Fase 3: Mover workflows de deploy

1. Identificar secretos usados en workflows de deploy
2. Mover `deploy.yml`, `deploy-api.yml`, `reusable-deploy.yml` a downstream
3. Mantener CI workflows en OSS

### Fase 4: Documentar límites OSS vs SaaS

1. Actualizar `README.md` con instrucciones para self-host
2. Crear `docs/SELF-HOST.md` con guía de configuración
3. Documentar qué env vars son requeridas
4. Documentar qué componentes son opcionales (auth-worker, etc.)

---

## Decisiones pendientes

1. **¿El repo OSS vive en `balejosg/openpath` o en una org separada?**
   - Si queda en tu cuenta: URLs de package.json/manifest.json pueden quedarse
   - Si mueves a org: hay que actualizar todas las referencias

2. **¿Cómo distribuyes el downstream?**
   - Opción A: Repo privado separado que importa OSS como dependencia
   - Opción B: Fork privado con tus cambios encima
   - Opción C: Monorepo con carpeta `downstream/` (no recomendado)

3. **¿Mantienes compatibilidad con GitHub como source of truth en OSS?**
   - Si sí: classroom.service.ts sigue construyendo GitHub raw URLs
   - Si no: implementas token delivery como única opción

---

## Archivos modificados hasta ahora (token delivery - PAUSADO)

Estos cambios ya se hicieron para token delivery pero están incompletos:
- `api/src/db/schema.ts` - Añadidas columnas `downloadTokenHash`, `downloadTokenLastRotatedAt`
- `api/drizzle/0003_machine_download_token.sql` - Migración creada
- `api/src/lib/machine-download-token.ts` - Nuevo helper creado
- `api/src/lib/classroom-storage.ts` - Funciones añadidas
- `api/src/lib/logger.ts` - Redacción de tokens añadida

Estos cambios son **compatibles** con OSS y pueden quedarse. Los endpoints REST del plan no se implementaron.
