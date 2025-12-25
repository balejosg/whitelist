# Guiones de Prueba LLM para OpenPath K-12

## Instrucciones Generales

Estos guiones están diseñados para que un **LLM con capacidad de control de navegador** pruebe exhaustivamente la aplicación OpenPath desde la perspectiva de usuarios reales. Cada guión cubre un rol específico y verifica toda la funcionalidad correspondiente.

> [!IMPORTANT]
> Los tests se realizan a través de **interfaces web** (SPA, extensión Firefox) como lo haría un usuario real  , nunca llamadas directas a API.

---

## Prerrequisitos del Entorno

Antes de ejecutar cualquier guión:

1. **Servidor API** corriendo en `http://localhost:3000`
2. **SPA** accesible en `http://localhost:8080`
3. **Agente Linux** instalado en al menos 1 máquina de prueba
4. **Firefox con extensión OpenPath** instalada
5. **Datos de prueba** inicializados (o base de datos limpia)

### Variables del Entorno de Prueba

```
URL_SPA=http://localhost:8080
URL_API=http://localhost:3000

# Credenciales de prueba
ADMIN_EMAIL=maria@centro.edu
ADMIN_PASS=TestPass123!

TEACHER_EMAIL=pedro@centro.edu
TEACHER_PASS=TestPass123!

STUDENT_EMAIL=alumna@centro.edu
STUDENT_PASS=TestPass123!
```

---

## Índice de Guiones

| # | Archivo | Rol / Área | Tests | Tiempo Est. |
|---|---------|------------|-------|-------------|
| 1 | [01_admin_tic.md](./01_admin_tic.md) | 👩‍💼 **Admin TIC (María)** | 44 | 45 min |
| 2 | [02_profesor.md](./02_profesor.md) | 👨‍🏫 **Profesor (Pedro)** | 39 | 35 min |
| 3 | [03_alumno.md](./03_alumno.md) | 👧 **Alumno (Ana)** | 28 | 25 min |
| 4 | [04_agente_linux.md](./04_agente_linux.md) | 🖥️ **Agente Linux** | 41 | 40 min |
| 5 | [05_flujo_e2e.md](./05_flujo_e2e.md) | 🔄 **Flujo E2E Completo** | 28 | 60 min |
| 6 | [06_edge_cases_seguridad.md](./06_edge_cases_seguridad.md) | 🚨 **Edge Cases & Seguridad** | 48 | 45 min |
| | | **TOTAL** | **228** | **~4.5 hrs** |

---

## Descripción de Cada Guión

### 01. Admin TIC (María)
Coordinadora TIC del centro. Cubre:
- ✅ Autenticación y registro
- ✅ Gestión de usuarios y roles
- ✅ Aprobación/rechazo de solicitudes
- ✅ Gestión de aulas y máquinas
- ✅ Gestión de dominios (whitelist/blacklist)
- ✅ Dashboard de Health/Estado
- ✅ Sistema de reservas
- ✅ Control de acceso y seguridad

### 02. Profesor (Pedro)
Profesor que usa el sistema durante clase. Cubre:
- ✅ Login y vista de profesor
- ✅ Dashboard simplificado
- ✅ Aprobación rápida (< 60s, ≤2 clics)
- ✅ Rechazo con motivo
- ✅ Notificaciones push
- ✅ **Uso en móvil** (crítico)
- ✅ Reservas de aulas
- ✅ Restricciones de permisos

### 03. Alumno (Ana)
Estudiante que solicita desbloqueos. Cubre:
- ✅ Experiencia de bloqueo
- ✅ Extensión Firefox
- ✅ Solicitud de desbloqueo
- ✅ Ver estado de solicitudes
- ✅ Notificaciones de resultado
- ✅ Vista SPA limitada
- ✅ Usabilidad para edad escolar

### 04. Agente Linux
Instalación y operación del cliente en PCs. Cubre:
- ✅ Instalación (con y sin aula)
- ✅ Servicios systemd
- ✅ Funcionamiento de dnsmasq
- ✅ Firewall iptables
- ✅ Watchdog y recuperación
- ✅ Políticas de navegador
- ✅ Health reports
- ✅ Comandos CLI
- ✅ Desinstalación

### 05. Flujo E2E Completo
Simula un día típico en un centro educativo:
- ✅ Inicio del día (María revisa sistema)
- ✅ Primera clase (Pedro, Ana, solicitudes)
- ✅ Cambio automático de grupo
- ✅ Segunda clase (persistencia de aprobaciones)
- ✅ Incidencias (máquina offline)
- ✅ Fin del día (revisión, configuración)
- ✅ Preparación día siguiente
- ✅ Integración de todos los componentes

### 06. Edge Cases y Seguridad
Intenta romper el sistema:
- ✅ Escalada de privilegios
- ✅ Ataques XSS, SQL injection
- ✅ Fuerza bruta
- ✅ Validación de datos
- ✅ Casos límite de negocio
- ✅ Problemas de UI/UX
- ✅ Rendimiento bajo carga
- ✅ Compatibilidad de navegadores
- ✅ Recuperación de errores

---

## Orden de Ejecución Recomendado

### Ejecución Rápida (Sanity Check) - 1 hora
1. **01_admin_tic.md** → Tests 1.1-1.5, 2.1-2.3, 3.1-3.2
2. **02_profesor.md** → Tests 1.1, 2.1, 2.4, 4.1-4.2
3. **03_alumno.md** → Tests 2.1, 3.1

### Ejecución Completa - 4.5 horas
1. **01_admin_tic.md** → Setup inicial
2. **02_profesor.md** → Flujo de profesor
3. **03_alumno.md** → Flujo de alumno
4. **04_agente_linux.md** → Verificar instalación
5. **05_flujo_e2e.md** → Integración completa
6. **06_edge_cases_seguridad.md** → Pruebas adversarias

---

## Formato de Reporte

Para cada guión ejecutado, generar un reporte con este formato:

```markdown
# Reporte de Pruebas: [Nombre del Guión]

**Fecha**: YYYY-MM-DD
**Ejecutado por**: [LLM/Tester]
**Ambiente**: [URL probada]
**Versión**: [Versión del sistema]

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| Tests ejecutados | XX |
| Pasados | XX (XX%) |
| Fallidos | XX |
| Bloqueados | XX |

## Tests Fallidos

| # Test | Descripción | Error | Severidad |
|--------|-------------|-------|-----------|
| X.X | ... | ... | 🔴/🟡/🟢 |

## Bugs Encontrados

### Bug #1: [Título]
- **Severidad**: 🔴 Crítica / 🟠 Alta / 🟡 Media / 🟢 Baja
- **Descripción**: ...
- **Pasos para reproducir**: ...
- **Resultado esperado**: ...
- **Resultado obtenido**: ...
- **Screenshot**: [Si aplica]

## KPIs Medidos

| KPI | Objetivo | Resultado | ✓/✗ |
|-----|----------|-----------|-----|
| Tiempo aprobación | < 60s | Xs | ⬜ |
| Clics para aprobar | ≤ 2 | X | ⬜ |
| Carga dashboard | < 2s | Xs | ⬜ |

## Recomendaciones

1. ...
2. ...

## Capturas de Pantalla

[Adjuntar evidencias relevantes]
```

---

## Métricas Globales de Cobertura

Al finalizar todos los guiones, reportar:

| Área | Tests | Pasados | Fallidos | Cobertura |
|------|-------|---------|----------|-----------|
| Autenticación | X | X | X | X% |
| Gestión usuarios | X | X | X | X% |
| Solicitudes | X | X | X | X% |
| Aulas | X | X | X | X% |
| Reservas | X | X | X | X% |
| Health | X | X | X | X% |
| Agente Linux | X | X | X | X% |
| Extensión Firefox | X | X | X | X% |
| Notificaciones | X | X | X | X% |
| Seguridad | X | X | X | X% |
| **TOTAL** | **228** | **X** | **X** | **X%** |

---

## Prioridad de Bugs

Clasificar los bugs encontrados:

| Prioridad | Descripción | Acción |
|-----------|-------------|--------|
| 🔴 **P0 - Blocker** | Sistema no funciona, pérdida de datos | Fix inmediato |
| 🟠 **P1 - Crítico** | Funcionalidad principal rota | Fix en 24h |
| 🟡 **P2 - Mayor** | Funcionalidad afectada pero hay workaround | Fix en sprint actual |
| 🟢 **P3 - Menor** | Cosmético, UX mejorable | Backlog |

---

## Notas Adicionales

- Los guiones asumen un entorno Linux (Ubuntu 22.04/24.04)
- Todos los tests de UI deben incluir capturas de pantalla como evidencia
- Para tests de móvil, usar DevTools con device emulation
- Los tiempos son orientativos, pueden variar según el entorno
