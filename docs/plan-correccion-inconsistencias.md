# Plan de Corrección de Inconsistencias de Migración

## Resumen

Corregir todas las inconsistencias identificadas tras la migración a Zod/Drizzle/tRPC/PostgreSQL.

**Decisiones del usuario:**
- ✅ Corregir TODAS las inconsistencias
- ✅ Eliminar Joi, usar solo Zod
- ✅ Schedule: solo lunes-viernes (1-5)

---

## Fase 1: Alinear Schemas Zod ↔ Drizzle

### 1.1 Corregir Schedule.dayOfWeek
**Archivo:** `shared/src/schemas/index.ts`
```typescript
// ANTES (línea 87)
dayOfWeek: z.number().min(0).max(6),

// DESPUÉS
dayOfWeek: z.number().min(1).max(5),
```
También en `CreateScheduleDTO` (línea 208).

### 1.2 Corregir HealthReport para coincidir con DB
**Archivo:** `shared/src/schemas/index.ts`
```typescript
// ANTES (líneas 98-105)
export const HealthReport = z.object({
    id: z.string(),
    hostname: z.string(),
    classroomId: z.string(),  // ❌ No existe en DB
    status: HealthStatus,
    details: z.record(z.unknown()),  // ❌ No existe en DB
    reportedAt: z.string(),
});

// DESPUÉS - reflejar estructura real de DB
export const HealthReport = z.object({
    id: z.string(),
    hostname: z.string(),
    status: HealthStatus,
    dnsmasqRunning: z.number().nullable(),
    dnsResolving: z.number().nullable(),
    failCount: z.number().default(0),
    actions: z.string().nullable(),
    version: z.string().nullable(),
    reportedAt: z.string(),
});
```

### 1.3 Sincronizar Schedule con DB
**Opción A (recomendada):** Eliminar campos que no están en DB
```typescript
// shared/src/schemas/index.ts - remover:
subject: z.string().optional(),  // ❌ eliminar
active: z.boolean().optional(),  // ❌ eliminar
// Añadir:
recurrence: z.string().optional(),  // ✅ añadir (está en DB)
```

### 1.4 Añadir Role.expiresAt a Drizzle
**Archivo:** `api/src/db/schema.ts` (línea 48)
```typescript
// Añadir después de createdAt:
expiresAt: timestamp('expires_at', { withTimezone: true }),
```

---

## Fase 2: Eliminar Validación Joi

### 2.1 Eliminar archivo de validación Joi
**Acción:** Eliminar `api/src/lib/validation.ts` (265 líneas)
- Actualmente NO se usa en ningún router (verificado con grep)
- Los tRPC routers ya usan Zod via `@openpath/shared`

### 2.2 Actualizar CreateRequestDTO regex
**Archivo:** `shared/src/schemas/index.ts` (línea 178)
```typescript
// Añadir max(128) a password
password: z.string().min(8).max(128),
```

### 2.3 Eliminar dependencia Joi
**Archivo:** `api/package.json`
```bash
npm uninstall joi
```

---

## Fase 3: Limpiar Exports Conflictivos

### 3.1 Simplificar api/src/index.ts
**Archivo:** `api/src/index.ts`
```typescript
// ANTES - exporta tipos conflictivos de Drizzle Y shared
export * from './db/schema.js';
export type { Schedule, Machine, Classroom... } from './types/index.js';

// DESPUÉS - solo exportar tipos inferidos de Drizzle para operaciones DB
// Los tipos de dominio vienen de @openpath/shared
export type { AppRouter } from './trpc/routers/index.js';
export {
    // Solo tablas Drizzle (para queries)
    users, roles, requests, classrooms, machines, schedules,
    tokens, settings, pushSubscriptions, healthReports,
    whitelistGroups, whitelistRules, dashboardUsers,
} from './db/schema.js';
// Tipos inferidos solo para operaciones DB internas
export type {
    NewUser, NewRole, NewRequest, NewClassroom, NewMachine,
    NewSchedule, NewToken, NewSetting, NewPushSubscription,
    NewHealthReport, NewWhitelistGroup, NewWhitelistRule,
} from './db/schema.js';
// Re-export domain types from shared
export * from '@openpath/shared';
// API-specific types
export type {
    JWTPayload, DecodedToken, AuthenticatedRequest,
    RequestWithGroups, Middleware, AuthMiddleware, Config,
} from './types/index.js';
```

### 3.2 Actualizar SPA imports
**Archivo:** `spa/src/types/index.ts`
```typescript
// ANTES
import type { ... } from '@openpath/api';

// DESPUÉS
import type { ... } from '@openpath/shared';
```

---

## Fase 4: Configuración TypeScript

### 4.1 Habilitar noImplicitAny en SPA
**Archivo:** `spa/tsconfig.json` (línea 19)
```json
"noImplicitAny": true,
```
Esto puede revelar errores que habrá que corregir.

### 4.2 Estandarizar skipLibCheck
Establecer `skipLibCheck: true` en todos los proyectos para consistencia:
- `spa/tsconfig.json` - cambiar a true (ya lo tiene)
- `auth-worker/tsconfig.json` - cambiar a true
- `firefox-extension/tsconfig.json` - cambiar a true
- `shared/tsconfig.json` - cambiar a true

---

## Fase 5: Código Legacy

### 5.1 Buscar y corregir referencias SQLite
```bash
grep -r "SQLITE" api/src/
```
Reemplazar mensajes de error con equivalentes PostgreSQL.

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `shared/src/schemas/index.ts` | dayOfWeek, HealthReport, Schedule, password max |
| `api/src/db/schema.ts` | Role.expiresAt |
| `api/src/lib/validation.ts` | **ELIMINAR** |
| `api/src/index.ts` | Limpiar exports conflictivos |
| `api/package.json` | Eliminar Joi |
| `spa/src/types/index.ts` | Cambiar imports a @openpath/shared |
| `spa/tsconfig.json` | noImplicitAny: true |
| `auth-worker/tsconfig.json` | skipLibCheck: true |
| `firefox-extension/tsconfig.json` | skipLibCheck: true |
| `shared/tsconfig.json` | skipLibCheck: true |

---

## Orden de Ejecución

1. **Schemas** - Corregir shared/schemas primero (source of truth)
2. **Drizzle** - Añadir Role.expiresAt, generar migración
3. **Eliminar Joi** - Borrar validation.ts y dependencia
4. **Exports** - Limpiar api/src/index.ts
5. **SPA imports** - Actualizar imports
6. **TypeScript config** - Habilitar noImplicitAny, skipLibCheck
7. **Verificar** - npm run typecheck en todos los paquetes
8. **Tests** - npm test para verificar que todo funciona
