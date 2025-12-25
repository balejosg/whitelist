# Guión de Prueba UI: Administrador TIC (María)

## Contexto del Rol

**Persona**: María - Coordinadora TIC del centro  
**Objetivo**: Configurar el sistema, gestionar usuarios, crear aulas y mantener el control general  
**Dispositivo**: Ordenador de escritorio (navegador Chrome/Firefox)

---

## Instrucciones para el LLM

Usarás el navegador para interactuar con la aplicación. Para cada test:
1. Ejecuta las acciones descritas en la UI
2. Verifica los resultados visuales
3. Toma capturas de pantalla de evidencia
4. Reporta cualquier problema encontrado

**URL de la aplicación**: `https://balejosg.github.io/openpath`

---

## Prerequisitos

> [!NOTE]
> **No necesitas instalar ningún servidor**. El SPA y la API ya están desplegados en la nube.
> Solo necesitas un navegador para estas pruebas.

---

## SECCIÓN 1: Acceso y Autenticación

### Test 1.1: Cargar la página de login

**Acciones**:
1. Abre el navegador y navega a la URL de la aplicación
2. Espera a que cargue completamente

**Verificaciones**:
- [ ] La página carga en menos de 3 segundos
- [ ] Se muestra un formulario de login con campos de email y contraseña
- [ ] Hay un botón de "Iniciar sesión" o "Login"
- [ ] El diseño es profesional y moderno
- [ ] Opcionalmente hay un enlace de "Registrarse"

**Captura**: Toma screenshot de la página de login

---

### Test 1.2: Registrar cuenta de administrador (primera vez)

**Acciones**:
1. Si hay enlace de "Registrarse", haz clic en él
2. Completa el formulario con:
   - **Email**: `maria@centro.edu`
   - **Nombre**: `María García`
   - **Contraseña**: `SecurePass123!`
   - **Confirmar contraseña**: `SecurePass123!`
3. Haz clic en el botón de registro

**Verificaciones**:
- [ ] El formulario valida que todos los campos están completos
- [ ] La contraseña requiere mínimo 8 caracteres
- [ ] Tras el registro exitoso, muestra mensaje de confirmación
- [ ] Redirige al dashboard o pide hacer login

**Captura**: Screenshot del formulario y del mensaje de éxito

---

### Test 1.3: Iniciar sesión como Admin

**Acciones**:
1. En la página de login, introduce:
   - **Email**: `maria@centro.edu`
   - **Contraseña**: `SecurePass123!`
2. Haz clic en "Iniciar sesión"

**Verificaciones**:
- [ ] El login se completa en menos de 2 segundos
- [ ] Redirige al dashboard principal
- [ ] Se muestra el nombre del usuario (María) en algún lugar
- [ ] Hay indicador de rol "Admin" o "Administrador" visible
- [ ] El menú de navegación muestra todas las opciones de admin

**Captura**: Screenshot del dashboard tras login

---

### Test 1.4: Intentar login con contraseña incorrecta

**Acciones**:
1. Cierra sesión (si hay opción) o abre pestaña de incógnito
2. Intenta login con:
   - **Email**: `maria@centro.edu`
   - **Contraseña**: `ContrasenaIncorrecta`
3. Haz clic en "Iniciar sesión"

**Verificaciones**:
- [ ] Muestra mensaje de error claro (ej: "Credenciales inválidas")
- [ ] El mensaje NO revela si el email existe o no
- [ ] Los campos de contraseña se borran
- [ ] El formulario no tarda más de 3 segundos en responder

**Captura**: Screenshot del mensaje de error

---

### Test 1.5: Verificar menú de navegación de Admin

**Acciones**:
1. Tras hacer login como María
2. Observa el menú de navegación (lateral o superior)

**Verificaciones** - El menú debe incluir:
- [ ] **Solicitudes** - Para ver/gestionar solicitudes de desbloqueo
- [ ] **Usuarios** - Para gestionar usuarios y roles
- [ ] **Aulas** - Para gestionar aulas y máquinas
- [ ] **Dominios** / **Whitelist** - Para gestionar dominios permitidos
- [ ] **Health** / **Estado** - Para ver estado de máquinas
- [ ] **Cerrar sesión** - Opción para logout

**Captura**: Screenshot del menú completo

---

## SECCIÓN 2: Gestión de Usuarios

### Test 2.1: Navegar a la sección de Usuarios

**Acciones**:
1. Haz clic en "Usuarios" en el menú
2. Espera a que cargue la lista

**Verificaciones**:
- [ ] Se muestra una tabla/lista de usuarios
- [ ] Cada usuario muestra: nombre, email, rol
- [ ] Hay un botón para "Añadir usuario" o "Nuevo usuario"
- [ ] María aparece en la lista con rol "Admin"

**Captura**: Screenshot de la lista de usuarios

---

### Test 2.2: Crear un nuevo usuario (Profesor Pedro)

**Acciones**:
1. Haz clic en "Añadir usuario" o "Nuevo usuario"
2. Completa el formulario:
   - **Nombre**: `Pedro Martínez`
   - **Email**: `pedro@centro.edu`
   - **Contraseña**: `ProfePass123!`
   - **Rol**: Selecciona "Profesor" o "Teacher"
3. Haz clic en "Guardar" o "Crear"

**Verificaciones**:
- [ ] Aparece modal o formulario para crear usuario
- [ ] Hay selector de rol (Admin/Profesor/Estudiante)
- [ ] Validación de campos requeridos
- [ ] Mensaje de éxito tras crear
- [ ] Pedro aparece en la lista de usuarios

**Captura**: Screenshot del formulario y de Pedro en la lista

---

### Test 2.3: Asignar grupos a un Profesor

**Acciones**:
1. En la lista de usuarios, haz clic en Pedro (o en "Editar")
2. Busca la sección de "Grupos asignados"
3. Añade los grupos: `ciencias-3eso`, `fisica-4eso`
4. Guarda los cambios

**Verificaciones**:
- [ ] Se pueden seleccionar múltiples grupos
- [ ] Los grupos aparecen como chips/tags o checkboxes
- [ ] Mensaje de confirmación al guardar
- [ ] Los grupos se muestran junto al perfil de Pedro

**Captura**: Screenshot de la asignación de grupos

---

### Test 2.4: Cambiar rol de usuario

**Acciones**:
1. En la lista de usuarios, selecciona a Pedro
2. Cambia su rol de "Profesor" a "Estudiante"
3. Guarda cambios
4. Vuelve a cambiar su rol a "Profesor"

**Verificaciones**:
- [ ] El cambio de rol se aplica inmediatamente
- [ ] Hay confirmación antes de quitar rol de Profesor
- [ ] El cambio se refleja en la tabla

**Captura**: Screenshot del cambio de rol

---

### Test 2.5: Ver detalles de usuario

**Acciones**:
1. Haz clic en el nombre de Pedro para ver su perfil completo

**Verificaciones**:
- [ ] Se muestra: nombre, email, rol, grupos asignados
- [ ] Fecha de creación visible
- [ ] Historial de actividad (si existe)
- [ ] Botones de editar/eliminar disponibles

**Captura**: Screenshot del perfil de usuario

---

### Test 2.6: Crear usuario Estudiante

**Acciones**:
1. Crea un nuevo usuario:
   - **Nombre**: `Ana López`
   - **Email**: `alumna@centro.edu`  
   - **Contraseña**: `AlumnaPass123!`
   - **Rol**: Estudiante

**Verificaciones**:
- [ ] El estudiante no tiene opción de asignar grupos
- [ ] El rol por defecto es "Estudiante"
- [ ] Aparece en la lista

---

## SECCIÓN 3: Gestión de Solicitudes

### Test 3.1: Navegar a Solicitudes

**Acciones**:
1. Haz clic en "Solicitudes" en el menú

**Verificaciones**:
- [ ] Se muestra lista de solicitudes pendientes
- [ ] Cada solicitud muestra: dominio, motivo, solicitante, fecha
- [ ] Hay filtros (pendientes/aprobadas/rechazadas)
- [ ] Hay indicador de cantidad pendiente

**Captura**: Screenshot de la lista de solicitudes

---

### Test 3.2: Aprobar una solicitud

**Acciones**:
1. Encuentra una solicitud pendiente en la lista
2. Haz clic en el botón "Aprobar" (✓ o texto)
3. Si aparece modal de confirmación, confirma

**Verificaciones**:
- [ ] El botón de aprobar es visible y claro
- [ ] La solicitud cambia de estado a "Aprobada"
- [ ] Desaparece de la lista de pendientes (o cambia color)
- [ ] Hay feedback visual (toast/notificación)

**Captura**: Screenshot antes y después de aprobar

---

### Test 3.3: Rechazar una solicitud

**Acciones**:
1. Encuentra una solicitud pendiente
2. Haz clic en "Rechazar" (✗ o texto)
3. Si pide motivo, escribe: "Dominio no educativo"
4. Confirma

**Verificaciones**:
- [ ] Se puede añadir motivo del rechazo
- [ ] La solicitud cambia a "Rechazada"
- [ ] Feedback visual de la acción

**Captura**: Screenshot del rechazo

---

### Test 3.4: Filtrar solicitudes por estado

**Acciones**:
1. Haz clic en filtro "Aprobadas"
2. Verifica que solo muestra aprobadas
3. Haz clic en filtro "Rechazadas"
4. Vuelve a "Pendientes"

**Verificaciones**:
- [ ] Los filtros funcionan correctamente
- [ ] El contador de cada estado es preciso
- [ ] Cambio de filtro es instantáneo

**Captura**: Screenshot de cada filtro

---

### Test 3.5: Buscar solicitud por dominio

**Acciones**:
1. Si hay campo de búsqueda, escribe: `youtube`
2. Verifica resultados

**Verificaciones**:
- [ ] La búsqueda filtra por dominio
- [ ] Resultados aparecen instantáneamente (debounce)
- [ ] Se puede limpiar la búsqueda

---

### Test 3.6: Ver detalles de una solicitud

**Acciones**:
1. Haz clic en una solicitud para ver detalles
2. Revisa toda la información

**Verificaciones**:
- [ ] Muestra: dominio completo, motivo, máquina, fecha/hora
- [ ] Muestra quién la solicitó
- [ ] Si fue aprobada/rechazada: por quién y cuándo
- [ ] Botones de acción si está pendiente

---

## SECCIÓN 4: Gestión de Aulas

### Test 4.1: Navegar a Aulas

**Acciones**:
1. Haz clic en "Aulas" en el menú

**Verificaciones**:
- [ ] Se muestra lista de aulas
- [ ] Cada aula muestra: nombre, grupo activo, nº máquinas
- [ ] Hay botón para "Nueva aula"

**Captura**: Screenshot de la lista de aulas

---

### Test 4.2: Crear una nueva aula

**Acciones**:
1. Haz clic en "Nueva aula"
2. Completa:
   - **Nombre**: `Informática 3`
   - **Identificador**: `informatica-3`
   - **Grupo por defecto**: Selecciona `base-centro`
3. Guarda

**Verificaciones**:
- [ ] Formulario claro con campos requeridos
- [ ] Selector de grupo por defecto funciona
- [ ] Aula aparece en la lista tras crear
- [ ] Mensaje de éxito

**Captura**: Screenshot del formulario y resultado

---

### Test 4.3: Ver detalle de aula con máquinas

**Acciones**:
1. Haz clic en el aula "Informática 3"

**Verificaciones**:
- [ ] Muestra lista de máquinas registradas (puede estar vacía)
- [ ] Muestra grupo activo actual
- [ ] Opción de cambiar grupo activo
- [ ] Estado de cada máquina (online/offline)

**Captura**: Screenshot del detalle de aula

---

### Test 4.4: Cambiar grupo activo del aula

**Acciones**:
1. En el detalle del aula, busca "Grupo activo"
2. Cambia de `base-centro` a `ciencias-3eso`
3. Guarda el cambio

**Verificaciones**:
- [ ] Selector de grupos funciona
- [ ] Cambio se aplica inmediatamente
- [ ] Mensaje indica que las máquinas sincronizarán

**Captura**: Screenshot del cambio de grupo

---

### Test 4.5: Editar un aula

**Acciones**:
1. Haz clic en "Editar" en el aula Informática 3
2. Cambia el nombre a "Aula Informática Principal"
3. Guarda

**Verificaciones**:
- [ ] Los campos son editables
- [ ] Cambios se guardan correctamente
- [ ] Nombre actualizado en la lista

---

### Test 4.6: Ver estado de máquinas del aula

**Acciones**:
1. En el detalle del aula, revisa la lista de máquinas

**Verificaciones**:
- [ ] Cada máquina muestra: hostname, última conexión
- [ ] Indicador visual de estado (verde=online, rojo=offline)
- [ ] Versión del agente instalado (si aplica)

---

### Test 4.7: Eliminar una máquina del aula

**Acciones**:
1. Selecciona una máquina
2. Haz clic en "Eliminar" o icono de papelera
3. Confirma la eliminación

**Verificaciones**:
- [ ] Pide confirmación antes de eliminar
- [ ] La máquina desaparece de la lista
- [ ] Mensaje de confirmación

---

### Test 4.8: Eliminar un aula

**Acciones**:
1. En la lista de aulas, selecciona un aula vacía
2. Haz clic en "Eliminar"
3. Confirma

**Verificaciones**:
- [ ] Pide confirmación (especialmente si tiene máquinas)
- [ ] El aula desaparece de la lista
- [ ] No se pueden eliminar aulas con máquinas (o advertencia clara)

---

## SECCIÓN 5: Gestión de Dominios / Whitelist

### Test 5.1: Navegar a Dominios

**Acciones**:
1. Haz clic en "Dominios" o "Whitelist" en el menú

**Verificaciones**:
- [ ] Se muestra lista de dominios permitidos
- [ ] Hay sección de dominios bloqueados
- [ ] Botón para añadir dominio

**Captura**: Screenshot de la gestión de dominios

---

### Test 5.2: Añadir dominio a whitelist

**Acciones**:
1. Haz clic en "Añadir dominio"
2. Escribe: `wikipedia.org`
3. Guarda

**Verificaciones**:
- [ ] Validación de formato de dominio
- [ ] Dominio aparece en la lista
- [ ] Mensaje de éxito

---

### Test 5.3: Ver dominios bloqueados

**Acciones**:
1. Navega a la sección de "Dominios bloqueados"

**Verificaciones**:
- [ ] Lista de dominios que nadie puede aprobar
- [ ] Ejemplos típicos: tiktok.com, instagram.com
- [ ] Opción de añadir/quitar (solo admin)

---

### Test 5.4: Añadir dominio a lista de bloqueados

**Acciones**:
1. Añade `juegos-online.com` a la lista de bloqueados
2. Guarda

**Verificaciones**:
- [ ] Dominio aparece en lista de bloqueados
- [ ] Ya no se podrá aprobar por profesores

---

### Test 5.5: Quitar dominio de lista de bloqueados

**Acciones**:
1. Elimina un dominio de la lista de bloqueados
2. Confirma

**Verificaciones**:
- [ ] El dominio ya no está bloqueado
- [ ] Ahora los profesores podrían aprobarlo

---

## SECCIÓN 6: Estado del Sistema (Health)

### Test 6.1: Navegar a Estado/Health

**Acciones**:
1. Haz clic en "Estado" o "Health" en el menú

**Verificaciones**:
- [ ] Dashboard con resumen del sistema
- [ ] Número de máquinas online/offline
- [ ] Alertas o problemas destacados
- [ ] Lista de máquinas con estado

**Captura**: Screenshot del dashboard de estado

---

### Test 6.2: Filtrar máquinas por estado

**Acciones**:
1. Filtra solo máquinas "Offline"
2. Verifica la lista

**Verificaciones**:
- [ ] Filtro funciona correctamente
- [ ] Se muestran solo máquinas sin conexión reciente
- [ ] Información de última conexión visible

---

### Test 6.3: Ver detalles de máquina

**Acciones**:
1. Haz clic en una máquina para ver detalles

**Verificaciones**:
- [ ] Hostname completo
- [ ] Aula asignada
- [ ] Última sincronización
- [ ] Versión del agente
- [ ] Estado de dnsmasq/whitelist

---

### Test 6.4: Identificar máquinas con problemas

**Acciones**:
1. Busca máquinas con indicadores rojos o amarillos
2. Revisa el motivo del problema

**Verificaciones**:
- [ ] Indicadores visuales claros
- [ ] Información del error/problema
- [ ] Sugerencia de acción (si aplica)

---

## SECCIÓN 7: Reservas de Aulas

### Test 7.1: Navegar a Reservas/Horarios

**Acciones**:
1. Haz clic en "Reservas" o busca en el detalle del aula

**Verificaciones**:
- [ ] Vista de calendario o grid semanal
- [ ] Se ven las reservas existentes
- [ ] Opción de crear nueva reserva

**Captura**: Screenshot del calendario de reservas

---

### Test 7.2: Crear una reserva

**Acciones**:
1. Haz clic en "Nueva reserva" o en hueco del calendario
2. Completa:
   - **Aula**: Informática 3
   - **Grupo**: ciencias-3eso
   - **Día**: Lunes
   - **Hora inicio**: 09:00
   - **Hora fin**: 10:00
3. Guarda

**Verificaciones**:
- [ ] Formulario intuitivo
- [ ] Selector de hora funciona
- [ ] Reserva aparece en el calendario
- [ ] Color/etiqueta del grupo visible

**Captura**: Screenshot de la reserva creada

---

### Test 7.3: Verificar conflicto de horario

**Acciones**:
1. Intenta crear otra reserva en el mismo horario
2. Observa el comportamiento

**Verificaciones**:
- [ ] Sistema detecta el conflicto
- [ ] Muestra mensaje de error claro
- [ ] No permite crear la reserva duplicada
- [ ] Sugiere horarios cercanos disponibles (bonus)

**Captura**: Screenshot del mensaje de conflicto

---

### Test 7.4: Editar una reserva

**Acciones**:
1. Haz clic en una reserva existente
2. Cambia la hora de fin a 10:30
3. Guarda

**Verificaciones**:
- [ ] La reserva se puede editar
- [ ] Cambios se reflejan en el calendario
- [ ] Sigue validando conflictos al editar

---

### Test 7.5: Eliminar una reserva

**Acciones**:
1. Haz clic en una reserva
2. Haz clic en "Eliminar"
3. Confirma

**Verificaciones**:
- [ ] Pide confirmación
- [ ] La reserva desaparece del calendario
- [ ] El hueco queda disponible

---

### Test 7.6: Ver reserva activa actual

**Acciones**:
1. Verifica si hay indicador de "Ahora" en el calendario
2. O busca sección "Reserva activa"

**Verificaciones**:
- [ ] Se destaca la reserva que está activa en este momento
- [ ] Muestra qué grupo debería estar activo

---

## SECCIÓN 8: Configuración y Perfil

### Test 8.1: Acceder a configuración de perfil

**Acciones**:
1. Haz clic en el nombre de usuario o avatar
2. Selecciona "Perfil" o "Configuración"

**Verificaciones**:
- [ ] Se muestra información del usuario
- [ ] Opción de cambiar contraseña
- [ ] Opción de cerrar sesión

**Captura**: Screenshot del perfil

---

### Test 8.2: Cerrar sesión

**Acciones**:
1. Haz clic en "Cerrar sesión"
2. Confirma si es necesario

**Verificaciones**:
- [ ] Se cierra la sesión correctamente
- [ ] Redirige a la página de login
- [ ] Intentar acceder a dashboard redirige a login

---

## SECCIÓN 9: Seguridad y Control de Acceso

### Test 9.1: Verificar acceso tras cerrar sesión

**Acciones**:
1. Tras cerrar sesión, intenta acceder directamente a `/dashboard` o `/users`

**Verificaciones**:
- [ ] Redirige a login
- [ ] No muestra información sin autenticar

---

### Test 9.2: Verificar que estudiante no ve opciones de admin

**Acciones**:
1. Inicia sesión como estudiante (`alumna@centro.edu`)
2. Observa el menú de navegación

**Verificaciones**:
- [ ] NO aparece "Usuarios"
- [ ] NO aparece "Aulas"
- [ ] NO aparece "Dominios bloqueados"
- [ ] Solo ve opciones apropiadas para estudiante

**Captura**: Screenshot del menú como estudiante

---

## SECCIÓN 10: Responsive y UX

### Test 10.1: Verificar vista en tablet

**Acciones**:
1. Redimensiona la ventana a 768px de ancho (o usa DevTools)
2. Navega por las secciones principales

**Verificaciones**:
- [ ] Menú se adapta (hamburguesa o colapsa)
- [ ] Tablas son scrollables o se adaptan
- [ ] Botones siguen siendo accesibles

**Captura**: Screenshot en vista tablet

---

### Test 10.2: Verificar accesibilidad básica

**Acciones**:
1. Intenta navegar usando solo teclado (Tab, Enter)
2. Verifica contraste de colores

**Verificaciones**:
- [ ] Se puede navegar con teclado
- [ ] Focus visible en elementos interactivos
- [ ] Texto legible contra el fondo

---

## Resumen de Tests

| # | Test | Descripción | Status |
|---|------|-------------|--------|
| 1.1 | Cargar login | Página inicial | ⬜ |
| 1.2 | Registrar admin | Primera cuenta | ⬜ |
| 1.3 | Login admin | Acceso correcto | ⬜ |
| 1.4 | Login incorrecto | Manejo de error | ⬜ |
| 1.5 | Menú navegación | Opciones admin | ⬜ |
| 2.1 | Navegar usuarios | Lista de usuarios | ⬜ |
| 2.2 | Crear profesor | Pedro | ⬜ |
| 2.3 | Asignar grupos | Grupos a Pedro | ⬜ |
| 2.4 | Cambiar rol | Profesor ↔ Estudiante | ⬜ |
| 2.5 | Ver detalles usuario | Perfil completo | ⬜ |
| 2.6 | Crear estudiante | Ana | ⬜ |
| 3.1 | Navegar solicitudes | Lista pendientes | ⬜ |
| 3.2 | Aprobar solicitud | Aprobación | ⬜ |
| 3.3 | Rechazar solicitud | Rechazo con motivo | ⬜ |
| 3.4 | Filtrar solicitudes | Por estado | ⬜ |
| 3.5 | Buscar solicitud | Por dominio | ⬜ |
| 3.6 | Ver detalles | Solicitud completa | ⬜ |
| 4.1 | Navegar aulas | Lista de aulas | ⬜ |
| 4.2 | Crear aula | Informática 3 | ⬜ |
| 4.3 | Ver detalle aula | Máquinas | ⬜ |
| 4.4 | Cambiar grupo activo | Whitelist | ⬜ |
| 4.5 | Editar aula | Modificar nombre | ⬜ |
| 4.6 | Estado máquinas | Online/Offline | ⬜ |
| 4.7 | Eliminar máquina | Dar de baja | ⬜ |
| 4.8 | Eliminar aula | Borrar aula | ⬜ |
| 5.1 | Navegar dominios | Whitelist | ⬜ |
| 5.2 | Añadir dominio | A whitelist | ⬜ |
| 5.3 | Ver bloqueados | Lista negra | ⬜ |
| 5.4 | Bloquear dominio | Añadir a bloqueados | ⬜ |
| 5.5 | Desbloquear | Quitar de bloqueados | ⬜ |
| 6.1 | Dashboard health | Estado sistema | ⬜ |
| 6.2 | Filtrar máquinas | Por estado | ⬜ |
| 6.3 | Detalles máquina | Info completa | ⬜ |
| 6.4 | Identificar problemas | Alertas | ⬜ |
| 7.1 | Ver reservas | Calendario | ⬜ |
| 7.2 | Crear reserva | Nueva | ⬜ |
| 7.3 | Conflicto horario | Validación | ⬜ |
| 7.4 | Editar reserva | Modificar | ⬜ |
| 7.5 | Eliminar reserva | Cancelar | ⬜ |
| 7.6 | Reserva activa | Indicador actual | ⬜ |
| 8.1 | Perfil usuario | Configuración | ⬜ |
| 8.2 | Cerrar sesión | Logout | ⬜ |
| 9.1 | Acceso sin sesión | Protección rutas | ⬜ |
| 9.2 | Vista estudiante | Menú limitado | ⬜ |
| 10.1 | Vista tablet | Responsive | ⬜ |
| 10.2 | Accesibilidad | Teclado | ⬜ |

**Total: 44 tests de UI**

---

## Formato de Reporte Final

```markdown
# Reporte de Pruebas - Admin TIC (María)
**Fecha**: [FECHA]
**Ejecutado por**: [LLM/Tester]
**Ambiente**: [URL probada]

## Resumen
- Tests ejecutados: XX
- Pasados: XX (XX%)
- Fallidos: XX
- Bloqueados: XX

## Tests Fallidos
| Test | Descripción | Error encontrado |
|------|-------------|------------------|
| X.X | ... | ... |

## Bugs Encontrados
1. **[SEVERIDAD]** Descripción del bug...

## Screenshots
[Adjuntar capturas relevantes]

## Recomendaciones
- ...
```
