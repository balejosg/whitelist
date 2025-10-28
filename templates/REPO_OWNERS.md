# Administradores del Whitelist

Este documento lista las personas con permisos para modificar la lista de URLs permitidas.

## 👑 Propietarios (Owners)

Tienen control total sobre el repositorio, pueden agregar/eliminar administradores.

| Nombre | Usuario GitHub | Email | Rol | Desde |
|--------|----------------|-------|-----|-------|
| [Nombre Completo] | @usuario-github | email@educamadrid.org | Director IT | 2025-01 |
| [Nombre Completo] | @usuario-github | email@educamadrid.org | Coordinador TIC | 2025-01 |

## ✏️ Editores (Maintainers)

Pueden editar el whitelist pero no modificar administradores.

| Nombre | Usuario GitHub | Email | Departamento | Desde |
|--------|----------------|-------|--------------|-------|
| [Nombre Completo] | @usuario-github | email@educamadrid.org | Informática | 2025-01 |
| [Nombre Completo] | @usuario-github | email@educamadrid.org | Tecnología | 2025-01 |
| [Nombre Completo] | @usuario-github | email@educamadrid.org | Coordinación | 2025-01 |

## 📋 Proceso de Cambios de Administradores

### Agregar Nuevo Administrador

1. **Requisito**: Decisión del equipo directivo o coordinación TIC
2. **Proceso**:
   - Crear cuenta GitHub (si no tiene): https://github.com/signup
   - Owner agrega usuario a la organización
   - Owner asigna permisos apropiados (Owner o Maintainer)
   - Actualizar este documento con los datos del nuevo administrador
   - Notificar al resto del equipo

### Remover Administrador

**Situaciones que requieren remoción:**
- Profesor deja el centro educativo
- Cambio de rol/responsabilidades
- Periodo de inactividad prolongado (>6 meses)
- Solicitud del propio administrador

**Proceso:**
1. Owner remueve permisos en GitHub
2. Actualizar este documento
3. Notificar al resto del equipo
4. Si el administrador removido era Owner, verificar que quedan al menos 2 Owners activos

### Transferencia de Responsabilidades

Cuando un administrador deja el centro:

1. **ANTES de que se vaya** (idealmente 2 semanas antes):
   - Documentar cualquier cambio pendiente
   - Transferir conocimiento a otro administrador
   - Remover su acceso
   - Actualizar documentación

2. **Si sale abruptamente**:
   - Owner remueve acceso inmediatamente
   - Revisar últimos cambios realizados por esa persona
   - Verificar que no haya cambios programados/en progreso

## 🔐 Seguridad

### Mejores Prácticas

✅ **SÍ hacer:**
- Usar autenticación de 2 factores (2FA) en GitHub
- Revisar cambios de otros antes de aprobar (code review)
- Documentar cambios importantes en el commit message
- Notificar cambios grandes al equipo antes de aplicarlos

❌ **NO hacer:**
- Compartir credenciales de GitHub
- Hacer cambios sin justificación
- Eliminar dominios sin consultar (salvo emergencia)
- Agregar dominios personales no educativos

### Auditoría

- Todos los cambios quedan registrados en el historial de Git
- Mensajes de commit deben ser descriptivos
- Revisar este documento cada 6 meses (enero y julio)

## 📞 Contacto

Para solicitudes de cambio en el whitelist o permisos:

**Vía Email (Preferida):**
- Enviar a: [lista-it@tucolegio.edu]
- Asunto: "Whitelist - [Acción solicitada]"
- Incluir: dominio, justificación, departamento

**Vía Presencial:**
- Despacho IT: [Ubicación]
- Horario: L-V 8:00-16:00

**Urgencias:**
- Teléfono: [XXX-XXX-XXX]
- Solo para: desactivación de emergencia, bloqueos críticos

## 📜 Historial de Cambios en Administradores

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 2025-01-XX | Creación inicial del equipo | Implementación del sistema |
| | | |

---

📅 **Última revisión**: [Fecha]
🔄 **Próxima revisión**: [Fecha + 6 meses]
🏫 **Centro**: [Nombre del Centro Educativo]
