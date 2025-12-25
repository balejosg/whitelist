# Guión de Prueba UI: Profesor (Pedro)

## Contexto del Rol

**Persona**: Pedro Martínez - Profesor de Ciencias  
**Objetivo**: Aprobar solicitudes de sus alumnos en menos de 60 segundos durante clase  
**Dispositivo**: Smartphone (principal) y ordenador (secundario)  
**Frustración**: "Preparo la clase con un video de YouTube y luego no funciona"

---

## Instrucciones para el LLM

Probarás la aplicación desde la perspectiva de un profesor que usa principalmente el móvil durante clase. Presta especial atención a:
- Velocidad de las acciones (objetivo: aprobar en < 60 segundos)
- Usabilidad en móvil (botones grandes, pocos clics)
- Claridad de la información mostrada

**URL de la aplicación**: `http://localhost:8080`

---

## Prerequisitos

- [ ] Usuario Pedro creado con rol "Profesor" (test previo de Admin)
- [ ] Pedro tiene grupos asignados: `ciencias-3eso`, `fisica-4eso`
- [ ] Existen solicitudes pendientes de esos grupos
- [ ] Credenciales: `pedro@centro.edu` / `ProfePass123!`

---

## SECCIÓN 1: Acceso como Profesor

### Test 1.1: Iniciar sesión como Profesor

**Acciones**:
1. Abre el navegador y navega a la URL de la aplicación
2. Introduce email: `pedro@centro.edu`
3. Introduce contraseña: `ProfePass123!`
4. Haz clic en "Iniciar sesión"

**Verificaciones**:
- [ ] Login exitoso en menos de 2 segundos
- [ ] Se muestra el dashboard de profesor
- [ ] El nombre "Pedro" aparece en la interfaz
- [ ] Hay indicador de rol "Profesor" visible
- [ ] El menú es DIFERENTE al de admin (más simple)

**Captura**: Screenshot del dashboard de profesor

---

### Test 1.2: Verificar menú de navegación de Profesor

**Acciones**:
1. Observa el menú de navegación (lateral o superior)

**Verificaciones** - El menú de profesor debe mostrar:
- [ ] **Solicitudes** - Para ver y aprobar/rechazar
- [ ] **Mis Clases** o **Grupos** - Sus grupos asignados
- [ ] **Reservas** o **Horarios** - Para reservar aulas
- [ ] **Notificaciones** - Configurar push (si existe)
- [ ] **Cerrar sesión**

**El menú NO debe mostrar** (solo admin):
- [ ] ❌ Usuarios
- [ ] ❌ Gestión de Aulas
- [ ] ❌ Dominios bloqueados
- [ ] ❌ Health/Estado del sistema

**Captura**: Screenshot del menú como profesor

---

### Test 1.3: Ver perfil propio

**Acciones**:
1. Haz clic en tu nombre o avatar
2. Selecciona "Perfil" o "Mi cuenta"

**Verificaciones**:
- [ ] Muestra nombre y email de Pedro
- [ ] Muestra rol "Profesor"
- [ ] Muestra grupos asignados: ciencias-3eso, fisica-4eso
- [ ] Opción de cambiar contraseña disponible

**Captura**: Screenshot del perfil

---

## SECCIÓN 2: Dashboard de Solicitudes

### Test 2.1: Ver solicitudes pendientes de mis grupos

**Acciones**:
1. Navega a "Solicitudes" o ya estás en el dashboard principal
2. Observa la lista de solicitudes

**Verificaciones**:
- [ ] Solo aparecen solicitudes de `ciencias-3eso` y `fisica-4eso`
- [ ] NO aparecen solicitudes de otros grupos (matemáticas, etc.)
- [ ] Cada solicitud muestra: dominio, motivo, quién la pidió, cuándo
- [ ] Las pendientes están destacadas
- [ ] Hay contador de pendientes visible

**Captura**: Screenshot de la lista de solicitudes

---

### Test 2.2: Verificar información de cada solicitud

**Acciones**:
1. Observa una solicitud en la lista

**Verificaciones** - Debe mostrar claramente:
- [ ] **Dominio**: ej. `youtube.com`
- [ ] **Motivo**: ej. "Video de experimento de física"
- [ ] **Solicitante**: Nombre del alumno o máquina
- [ ] **Fecha/hora**: Cuándo se solicitó
- [ ] **Botones de acción**: Aprobar ✓ y Rechazar ✗

---

### Test 2.3: Contar número de clics para aprobar

**Acciones**:
1. Desde la lista de solicitudes
2. Cuenta los clics necesarios para aprobar una solicitud
3. Ejecuta la aprobación

**Verificaciones**:
- [ ] **Máximo 2 clics** para completar aprobación:
  - Clic 1: Botón "Aprobar"
  - Clic 2: Confirmar (si hay modal) - o ninguno si es inmediato
- [ ] La aprobación toma menos de 3 segundos
- [ ] Feedback visual inmediato (toast, cambio de color, etc.)

**Tiempo objetivo**: < 5 segundos desde ver la solicitud hasta aprobarla

---

### Test 2.4: Aprobar solicitud - flujo completo

**Acciones**:
1. Encuentra una solicitud pendiente (ej: `youtube.com`)
2. Haz clic en el botón "Aprobar" (✓)
3. Si aparece modal de confirmación, confirma
4. Observa el resultado

**Verificaciones**:
- [ ] La solicitud desaparece de pendientes o cambia de estado
- [ ] Aparece mensaje de éxito (toast/notificación)
- [ ] El contador de pendientes disminuye
- [ ] La acción fue rápida (< 3 segundos)

**Captura**: Screenshot antes y después de aprobar

---

### Test 2.5: Rechazar solicitud con motivo

**Acciones**:
1. Encuentra una solicitud inapropiada
2. Haz clic en "Rechazar" (✗)
3. Si pide motivo, escribe: "No es contenido educativo"
4. Confirma

**Verificaciones**:
- [ ] Opción de añadir motivo del rechazo
- [ ] La solicitud cambia a estado "Rechazada"
- [ ] Feedback visual de la acción
- [ ] El motivo se guarda (verificable en historial)

**Captura**: Screenshot del rechazo

---

### Test 2.6: Aprobar múltiples solicitudes consecutivas

**Acciones**:
1. Si hay varias solicitudes pendientes
2. Aprueba 3 solicitudes una tras otra rápidamente

**Verificaciones**:
- [ ] El sistema responde a cada aprobación
- [ ] No hay lag entre aprobaciones
- [ ] La lista se actualiza correctamente
- [ ] No hay errores de concurrencia

**Medir tiempo**: ¿Cuánto tardaste en aprobar las 3?

---

### Test 2.7: Filtrar solicitudes por grupo

**Acciones**:
1. Si tienes múltiples grupos, busca un filtro por grupo
2. Filtra solo `ciencias-3eso`
3. Luego filtra `fisica-4eso`

**Verificaciones**:
- [ ] El filtro funciona correctamente
- [ ] Solo muestra solicitudes del grupo seleccionado
- [ ] Opción de ver "Todos mis grupos"

---

### Test 2.8: Ver historial de aprobaciones

**Acciones**:
1. Busca filtro o pestaña "Aprobadas" o "Historial"
2. Visualiza solicitudes que ya aprobaste

**Verificaciones**:
- [ ] Se pueden ver solicitudes pasadas
- [ ] Muestra quién y cuándo aprobó
- [ ] Útil para revisar qué se desbloqueó

---

## SECCIÓN 3: Verificación de Dominios Bloqueados

### Test 3.1: Intentar aprobar dominio bloqueado por Admin

**Acciones**:
1. Si existe una solicitud de un dominio bloqueado (ej: `tiktok.com`)
2. Intenta aprobarla

**Verificaciones**:
- [ ] El sistema NO permite la aprobación
- [ ] Mensaje de error claro: "Este dominio está bloqueado por el administrador"
- [ ] Sugiere contactar al admin
- [ ] El botón de aprobar podría estar deshabilitado

**Captura**: Screenshot del mensaje de error

---

### Test 3.2: Ver por qué un dominio está bloqueado

**Acciones**:
1. Si la solicitud de dominio bloqueado muestra información
2. Busca indicador de "bloqueado"

**Verificaciones**:
- [ ] Hay indicador visual de que el dominio está en lista negra
- [ ] Posible tooltip o icono explicativo
- [ ] El profesor entiende que no puede hacer nada (contactar admin)

---

### Test 3.3: Aprobar dominio que ya existe en whitelist

**Acciones**:
1. Si hay solicitud de un dominio que ya fue aprobado antes
2. Apruébala de nuevo

**Verificaciones**:
- [ ] El sistema maneja el duplicado graciosamente
- [ ] Mensaje: "Este dominio ya está permitido" o similar
- [ ] No se genera error
- [ ] La solicitud se marca como resuelta

---

## SECCIÓN 4: Vista Móvil (CRÍTICO para Profesor)

### Test 4.1: Dashboard en smartphone

**Acciones**:
1. Abre DevTools (F12)
2. Activa "Toggle device toolbar" (Ctrl+Shift+M)
3. Selecciona iPhone 12 o viewport 390px
4. Navega por el dashboard

**Verificaciones**:
- [ ] El menú es accesible (hamburguesa o inferior)
- [ ] Las solicitudes se ven completas
- [ ] Los botones Aprobar/Rechazar son grandes (mínimo 44x44px)
- [ ] Se puede usar con pulgar fácilmente
- [ ] No hay scroll horizontal

**Captura**: Screenshot en vista móvil

---

### Test 4.2: Aprobar desde móvil - flujo táctil

**Acciones**:
1. Mantén la vista móvil
2. Simula taps (clics) para aprobar una solicitud
3. Mide si es cómodo para uso con una mano

**Verificaciones**:
- [ ] Aprobar requiere máximo 2 taps
- [ ] Los botones son suficientemente grandes para toque táctil
- [ ] No hay elementos demasiado juntos
- [ ] Feedback visual claro tras tap

---

### Test 4.3: Rendimiento en móvil

**Acciones**:
1. En DevTools, activa throttling de red "3G"
2. Recarga la página
3. Mide tiempo de carga

**Verificaciones**:
- [ ] Dashboard carga en < 5 segundos en 3G
- [ ] Las solicitudes aparecen rápidamente
- [ ] La aprobación funciona incluso con latencia

---

### Test 4.4: Modo offline o conexión intermitente

**Acciones**:
1. Carga el dashboard
2. Desactiva la red (DevTools > Network > Offline)
3. Intenta aprobar una solicitud

**Verificaciones**:
- [ ] Mensaje de error claro si está offline
- [ ] Los datos cargados previamente siguen visibles
- [ ] Al reconectar, la acción se puede reintentar

---

## SECCIÓN 5: Notificaciones Push

### Test 5.1: Configurar notificaciones

**Acciones**:
1. Busca botón de "🔔 Notificaciones" en el header o menú
2. Haz clic para activar

**Verificaciones**:
- [ ] El navegador pide permiso para notificaciones
- [ ] Si aceptas, se muestra "Notificaciones activadas"
- [ ] Hay toggle para desactivar
- [ ] Estado persistente entre sesiones

**Captura**: Screenshot del diálogo de permisos

---

### Test 5.2: Recibir notificación de nueva solicitud

**Acciones**:
1. Activa notificaciones
2. Crea una nueva solicitud (desde otra pestaña o terminal):
   ```
   POST /api/requests con groupId = ciencias-3eso
   ```
3. Observa si llega notificación

**Verificaciones**:
- [ ] Notificación push aparece en < 5 segundos
- [ ] Título claro: "Nueva solicitud"
- [ ] Muestra el dominio solicitado
- [ ] Al hacer clic, abre el dashboard con la solicitud

**Captura**: Screenshot de la notificación

---

### Test 5.3: Notificación con SPA cerrado

**Acciones**:
1. Asegúrate de tener notificaciones activadas
2. Cierra la pestaña del SPA (pero no el navegador)
3. Genera una nueva solicitud

**Verificaciones**:
- [ ] La notificación llega aunque el SPA esté cerrado
- [ ] El Service Worker está funcionando
- [ ] Al hacer clic, abre el SPA

---

### Test 5.4: Desactivar notificaciones

**Acciones**:
1. Ve a configuración de notificaciones
2. Desactívalas
3. Genera una nueva solicitud

**Verificaciones**:
- [ ] El toggle cambia a "Desactivado"
- [ ] NO llegan más notificaciones
- [ ] Las solicitudes siguen visibles en dashboard (solo sin push)

---

## SECCIÓN 6: Reservas de Aulas

### Test 6.1: Ver mis reservas

**Acciones**:
1. Navega a "Reservas" o "Mis clases"

**Verificaciones**:
- [ ] Vista de calendario o lista de reservas
- [ ] Solo aparecen las reservas de Pedro
- [ ] Muestra: aula, grupo, día, hora
- [ ] Botón para crear nueva reserva

**Captura**: Screenshot de las reservas

---

### Test 6.2: Crear una reserva

**Acciones**:
1. Haz clic en "Nueva reserva" o en un hueco del calendario
2. Completa:
   - **Aula**: Selecciona un aula disponible
   - **Grupo**: `ciencias-3eso`
   - **Día**: Martes
   - **Hora**: 11:00 - 12:00
3. Guarda

**Verificaciones**:
- [ ] Formulario intuitivo
- [ ] Solo puede seleccionar grupos asignados a él
- [ ] Muestra aulas disponibles
- [ ] La reserva se crea correctamente

**Captura**: Screenshot del formulario y resultado

---

### Test 6.3: Ver horario de un aula

**Acciones**:
1. Selecciona un aula para ver su horario completo

**Verificaciones**:
- [ ] Vista semanal del aula
- [ ] Se ven todas las reservas (de todos los profesores)
- [ ] Huecos libres visibles
- [ ] Puede crear reserva en huecos libres

---

### Test 6.4: Intentar crear reserva en horario ocupado

**Acciones**:
1. Intenta reservar en un horario que ya está ocupado

**Verificaciones**:
- [ ] El sistema detecta el conflicto
- [ ] Mensaje de error: "Este horario ya está reservado"
- [ ] Muestra quién tiene la reserva
- [ ] Sugiere horarios cercanos disponibles (opcional)

---

### Test 6.5: Editar mi reserva

**Acciones**:
1. Haz clic en una reserva tuya
2. Cambia la hora de fin
3. Guarda

**Verificaciones**:
- [ ] Puedo editar mis propias reservas
- [ ] Los cambios se guardan correctamente
- [ ] Se validan conflictos al editar

---

### Test 6.6: Intentar editar reserva de otro profesor

**Acciones**:
1. Haz clic en una reserva que NO sea tuya
2. Intenta editarla

**Verificaciones**:
- [ ] No hay botón de editar para reservas ajenas
- [ ] O si aparece, da error de permisos
- [ ] Mensaje claro: "Solo puedes modificar tus reservas"

---

### Test 6.7: Eliminar mi reserva

**Acciones**:
1. Haz clic en una reserva tuya
2. Haz clic en "Eliminar" o "Cancelar"
3. Confirma

**Verificaciones**:
- [ ] Pide confirmación
- [ ] La reserva desaparece
- [ ] El hueco queda disponible

---

## SECCIÓN 7: Casos Edge y Seguridad

### Test 7.1: Profesor sin grupos asignados

**Objetivo**: Verificar comportamiento si admin quita todos los grupos

**Acciones** (requiere que admin quite los grupos primero):
1. Login como Pedro después de que le quitaron grupos

**Verificaciones**:
- [ ] Dashboard no muestra error
- [ ] Mensaje amigable: "No tienes grupos asignados. Contacta al administrador."
- [ ] No puede crear reservas
- [ ] No ve solicitudes

---

### Test 7.2: Intentar acceder a funciones de Admin

**Acciones**:
1. Intenta navegar manualmente a URLs de admin:
   - `/users` o `/admin/users`
   - `/classrooms/manage`
   - `/domains/blocked`
2. Observa el comportamiento

**Verificaciones**:
- [ ] Redirige a página de "No autorizado" o al dashboard
- [ ] No muestra información de admin
- [ ] Mensaje de error apropiado

---

### Test 7.3: Sesión expirada durante uso

**Acciones**:
1. Deja la sesión inactiva por 15-20 minutos
2. Intenta aprobar una solicitud

**Verificaciones**:
- [ ] Si el token expiró, pide volver a hacer login
- [ ] O renueva automáticamente el token (ideal)
- [ ] No pierde el trabajo no guardado

---

### Test 7.4: Profesor ve solicitud y otro profesor la aprueba primero

**Acciones**:
1. Pedro tiene solicitud en pantalla
2. Otro profesor (o admin) la aprueba (desde otra sesión)
3. Pedro intenta aprobarla

**Verificaciones**:
- [ ] Pedro ve que ya fue aprobada
- [ ] Mensaje: "Esta solicitud ya fue procesada"
- [ ] La lista se actualiza mostrando estado actual

---

### Test 7.5: Rol revocado mientras sesión activa

**Objetivo**: Verificar que perder el rol tiene efecto inmediato

**Acciones** (requiere que admin cambie rol):
1. Pedro tiene sesión activa
2. Admin cambia rol de Pedro a "Estudiante"
3. Pedro intenta aprobar una solicitud

**Verificaciones**:
- [ ] Pedro recibe error de permisos
- [ ] Se le pide volver a iniciar sesión
- [ ] Ya no ve el dashboard de profesor

---

## SECCIÓN 8: Rendimiento

### Test 8.1: Tiempo de carga del dashboard

**Acciones**:
1. Abre DevTools > Performance o Network
2. Recarga la página (Ctrl+Shift+R)
3. Mide tiempo hasta que las solicitudes aparecen

**Verificaciones**:
- [ ] Tiempo total < 2 segundos (objetivo del negocio)
- [ ] First Contentful Paint < 1s
- [ ] Las solicitudes cargan sin spinner largo

---

### Test 8.2: Con muchas solicitudes (stress)

**Objetivo**: Verificar rendimiento con volumen alto

**Acciones**:
1. Si es posible, crear 100+ solicitudes de prueba
2. Cargar el dashboard

**Verificaciones**:
- [ ] Se implementa paginación o virtualización
- [ ] No se congela el navegador
- [ ] Scroll fluido

---

### Test 8.3: Lighthouse en mobile

**Acciones**:
1. Abre DevTools > Lighthouse
2. Selecciona "Mobile" y "Performance"
3. Ejecuta el análisis

**Verificaciones**:
- [ ] Performance Score > 70
- [ ] No hay bloqueos de render
- [ ] Imágenes optimizadas

---

## SECCIÓN 9: Flujo Completo - Escenario Real

### Test 9.1: Escenario "Alumno solicita YouTube en clase"

**Simular este escenario completo**:

1. **Contexto**: Pedro está en clase de Física, un alumno necesita ver un video
2. **Alumno solicita**: youtube.com (esto lo simula otra persona o test previo)
3. **Pedro recibe notificación** (si están activadas)
4. **Pedro abre el móvil**, ve la solicitud
5. **Pedro verifica** que es un dominio apropiado
6. **Pedro aprueba** con 1-2 toques
7. **El alumno** ya puede acceder

**Medir tiempo total**: Desde que llega la solicitud hasta aprobación

**Objetivo**: < 60 segundos (KPI del negocio)

**Verificaciones**:
- [ ] Todo el flujo funciona
- [ ] El tiempo es aceptable para uso en clase
- [ ] Pedro no necesita ayuda técnica

**Captura**: Screenshots del flujo completo

---

### Test 9.2: Escenario "Preparar clase con antelación"

**Simular**:
1. El día antes de la clase
2. Pedro revisa su dashboard
3. Aprueba varios dominios que sabe que necesitará
4. Programa una reserva de aula

**Verificaciones**:
- [ ] Puede pre-aprobar dominios
- [ ] Las aprobaciones persisten
- [ ] La reserva se crea correctamente

---

## Resumen de Tests

| # | Test | Descripción | Status |
|---|------|-------------|--------|
| 1.1 | Login profesor | Acceso correcto | ⬜ |
| 1.2 | Menú navegación | Opciones limitadas | ⬜ |
| 1.3 | Ver perfil | Info personal | ⬜ |
| 2.1 | Ver solicitudes | Solo mis grupos | ⬜ |
| 2.2 | Info solicitud | Datos completos | ⬜ |
| 2.3 | Contar clics | Máx 2 para aprobar | ⬜ |
| 2.4 | Aprobar | Flujo completo | ⬜ |
| 2.5 | Rechazar | Con motivo | ⬜ |
| 2.6 | Aprobar múltiples | Consecutivas | ⬜ |
| 2.7 | Filtrar grupo | Por clase | ⬜ |
| 2.8 | Historial | Aprobaciones pasadas | ⬜ |
| 3.1 | Dominio bloqueado | No puede aprobar | ⬜ |
| 3.2 | Ver bloqueado | Indicador visual | ⬜ |
| 3.3 | Dominio duplicado | Ya en whitelist | ⬜ |
| 4.1 | Dashboard móvil | Responsive | ⬜ |
| 4.2 | Aprobar móvil | Flujo táctil | ⬜ |
| 4.3 | Rendimiento 3G | Carga aceptable | ⬜ |
| 4.4 | Modo offline | Manejo errores | ⬜ |
| 5.1 | Config notifs | Activar | ⬜ |
| 5.2 | Recibir push | Nueva solicitud | ⬜ |
| 5.3 | Push cerrado | Sin SPA abierto | ⬜ |
| 5.4 | Desactivar push | Toggle | ⬜ |
| 6.1 | Mis reservas | Lista | ⬜ |
| 6.2 | Crear reserva | Nueva | ⬜ |
| 6.3 | Horario aula | Vista semanal | ⬜ |
| 6.4 | Conflicto | Horario ocupado | ⬜ |
| 6.5 | Editar reserva | Mi reserva | ⬜ |
| 6.6 | Reserva ajena | No puede editar | ⬜ |
| 6.7 | Eliminar reserva | Cancelar | ⬜ |
| 7.1 | Sin grupos | Mensaje amigable | ⬜ |
| 7.2 | URLs admin | Acceso denegado | ⬜ |
| 7.3 | Sesión expirada | Manejo | ⬜ |
| 7.4 | Solicitud ya aprobada | Conflicto | ⬜ |
| 7.5 | Rol revocado | Efecto inmediato | ⬜ |
| 8.1 | Tiempo carga | < 2 segundos | ⬜ |
| 8.2 | Muchas solicitudes | Paginación | ⬜ |
| 8.3 | Lighthouse | Performance | ⬜ |
| 9.1 | Flujo YouTube | Escenario real | ⬜ |
| 9.2 | Preparar clase | Pre-aprobación | ⬜ |

**Total: 39 tests de UI**

---

## KPIs a Medir

| Métrica | Objetivo | Resultado |
|---------|----------|-----------|
| Tiempo aprobación | < 60 segundos | ⬜ |
| Clics para aprobar | ≤ 2 | ⬜ |
| Carga dashboard | < 2 segundos | ⬜ |
| Carga móvil 3G | < 5 segundos | ⬜ |
| Notificación push | < 5 segundos | ⬜ |
