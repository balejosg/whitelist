# Análisis de Inconsistencias de Migración

Este informe documenta las inconsistencias identificadas tras los refactors recientes que añadieron Drizzle ORM, tRPC, y Zod al stack tecnológico.

---

## 🔴 Crítico: Duplicación de Definiciones de Tipos

### 1. Tipos de Entidades Duplicados en 4+ Ubicaciones

Los tipos `User`, `Role`, `Machine`, `Classroom`, `Schedule` están definidos en múltiples lugares con diferencias sutiles:

| Entidad | Ubicaciones | Conflictos |
|---------|------------;|------------|
| `User` | `api/src/types/index.ts`, `shared/src/schemas/index.ts`, `spa/src/types/index.ts`, `dashboard/src/db.ts` | La versión de SPA tiene `login?`, `avatarUrl?`, `roles?`; Dashboard usa `password_hash` (snake_case) |
| `Role` | `api/src/types/index.ts`, `shared/src/schemas/index.ts` | API usa `groupIds`, Drizzle schema usa `groups` |
| `RoleInfo` | `api/src/types/index.ts`, `api/src/lib/auth.ts`, `shared/src/schemas/index.ts` | Definido 3 veces idénticamente |

**Archivos afectados:**
- [api/src/types/index.ts](file:///home/run0/whitelist/api/src/types/index.ts#L38-L64)
- [shared/src/schemas/index.ts](file:///home/run0/whitelist/shared/src/schemas/index.ts#L32-L57)
- [spa/src/types/index.ts](file:///home/run0/whitelist/spa/src/types/index.ts#L49-L103)
- [dashboard/src/db.ts](file:///home/run0/whitelist/dashboard/src/db.ts#L46-L73)

---

## 🔴 Crítico: Inconsistencia Drizzle Schema vs TypeScript Interfaces

### 2. Campo `groups` vs `groupIds`

El schema Drizzle exporta tipos automáticamente, pero la definición de campo es inconsistente:

```diff
// api/src/db/schema.ts (Drizzle)
export const roles = pgTable('roles', {
-   groups: text('groups').array(),  // ← Se llama "groups"
});

// api/src/types/index.ts (TypeScript Interface)
export interface Role {
+   groupIds: string[];  // ← Se llama "groupIds"
}

// shared/src/schemas/index.ts (Zod)
export const Role = z.object({
+   groupIds: z.array(z.string()),  // ← Se llama "groupIds"
});
```

**Impacto:** Los tipos inferidos de Drizzle (`Role`) tienen propiedad `groups`, pero las interfaces manuales esperan `groupIds`. Esto puede causar errores de runtime al mapear datos de la base de datos a las interfaces.

---

## 🟠 Alto: `@openpath/shared` Subutilizado

### 3. Adopción Incompleta del Paquete Shared

El paquete `shared` fue creado para centralizar tipos, pero sólo **2 archivos** lo importan:

```bash
$ grep 'from.*@openpath/shared'
api/src/trpc/routers/users.ts:   import { UserRole } from '@openpath/shared';
api/src/trpc/routers/requests.ts: import { RequestStatus, RequestPriority } from '@openpath/shared';
```

**Todos los demás archivos** siguen usando definiciones locales de tipos:
- `api/src/types/index.ts` - 337 líneas de tipos duplicados
- `spa/src/types/index.ts` - 452 líneas de tipos (parcialmente re-exporta de `api`)
- `dashboard/src/db.ts` - Tipos locales incompatibles

---

## 🟠 Alto: Convenciones de Naming Inconsistentes

### 4. snake_case vs camelCase

El `dashboard` usa snake_case mientras el resto del monorepo usa camelCase:

| Package | Convención | Ejemplo |
|---------|------------|---------|
| `api` | camelCase | `passwordHash`, `displayName`, `groupId` |
| `spa` | camelCase | `groupIds`, `createdAt` |
| `shared` | camelCase | `passwordHash`, `emailVerified` |
| **`dashboard`** | **snake_case** | **`password_hash`**, **`display_name`**, **`group_id`** |

**Archivo afectado:**
- [dashboard/src/db.ts](file:///home/run0/whitelist/dashboard/src/db.ts#L46-L73)

---

## 🟠 Alto: Tipos Schema vs API Desincronizados

### 5. Campos Faltantes/Extra entre Definiciones

| Campo | Drizzle Schema | Zod (shared) | TypeScript (api/types) | SPA |
|-------|---------------|--------------|------------------------|-----|
| `Role.expiresAt` | ❌ No existe | ✅ | ✅ | ❌ |
| `Role.createdBy` | ✅ | ❌ | ❌ | ✅ (`UserRoleInfo`) |
| `Schedule.active` | ❌ | ✅ optional | ✅ | ✅ |
| `Schedule.recurrence` | ✅ | ❌ | ❌ | ❌ |
| `HealthReport.classroomId` | ❌ | ✅ | ✅ | N/A |

---

## 🟡 Medio: Export Inconsistente desde API

### 6. api/src/index.ts Exporta de Forma Parcial

El [index.ts](file:///home/run0/whitelist/api/src/index.ts) intenta evitar conflictos pero causa confusión:

```typescript
export * from './db/schema.js';  // Exporta tipos Drizzle
export type {
    // Explícitamente excluye User, Role, Machine, etc. 
    // porque vienen de schema.js via Drizzle $inferSelect
    DomainRequest,  // Pero DomainRequest NO está en Drizzle...
    // ...
} from './types/index.js';
```

**Problema:** `DomainRequest` se exporta desde `types/index.ts` pero está definido también en `shared/src/schemas/index.ts` con validación Zod.

---

## 🟡 Medio: PushSubscription Estructura Diferente

### 7. Estructura de Keys Anidada vs Campos Planos

```typescript
// shared/src/schemas/index.ts & api/src/types/index.ts
export interface PushSubscription {
    keys: {
        p256dh: string;
        auth: string;
    };
}

// api/src/db/schema.ts (Drizzle)
export const pushSubscriptions = pgTable('push_subscriptions', {
    p256dh: text('p256dh').notNull(),  // Campos planos
    auth: text('auth').notNull(),
});
```

**Impacto:** Los tipos esperan `subscription.keys.p256dh` pero la DB guarda como `subscription.p256dh`.

---

## 🟡 Medio: Dashboard Error Legado en Mensajes

### 8. Mensaje de Error SQLite en Código PostgreSQL

```typescript
// dashboard/src/db.ts:145
if (existing) {
    throw new Error('SQLITE_CONSTRAINT_UNIQUE');  // ← Error SQLite en código PostgreSQL
}
```

---

## Resumen de Acciones Recomendadas

1. **Consolidar tipos en `@openpath/shared`** como single source of truth
2. **Alinear Drizzle schema** con interfaces: renombrar `groups` → `groupIds`
3. **Migrar `dashboard/src/db.ts`** a camelCase o usar funciones de mapeo
4. **Actualizar imports** en todo el monorepo para usar `@openpath/shared`
5. **Eliminar definiciones duplicadas** en `api/src/types/index.ts`
6. **Revisar estructura de `PushSubscription`** - decidir entre nested keys o campos planos
7. **Actualizar mensajes de error** legacy de SQLite

---

> [!WARNING]
> Las inconsistencias en los tipos `Role` (groups vs groupIds) son **críticas** pues pueden causar errores de runtime difíciles de debuggear. El tipado estricto de TypeScript no protege si los tipos están definidos incorrectamente.
