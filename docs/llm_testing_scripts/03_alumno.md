# Guión de Prueba UI: Alumno

## Contexto del Rol

**Persona**: Ana López - Estudiante de 14 años, 3º ESO  
**Objetivo**: Acceder a recursos web para sus tareas de clase  
**Dispositivo**: Ordenador del aula de informática (PC con Linux)  
**Frustración**: "La página que necesito para el trabajo no carga"

---

## Instrucciones para el LLM

El alumno interactúa con el sistema de dos formas:
1. **Extensión de Firefox**: Cuando una página está bloqueada
2. **SPA Web** (opcional): Para ver estado de sus solicitudes

La experiencia debe ser simple y sin fricciones.

---

## Prerequisitos

- [ ] PC de aula con agente OpenPath instalado
- [ ] Firefox con extensión OpenPath instalada
- [ ] Usuario Ana creado con rol "Estudiante"
- [ ] Credenciales: `alumna@centro.edu` / `AlumnaPass123!`
- [ ] Dominios de prueba bloqueados (ej: `wikipedia.org` si no está en whitelist)

---

## SECCIÓN 1: Experiencia de Bloqueo

### Test 1.1: Intentar acceder a dominio bloqueado

**Acciones**:
1. Abre Firefox en el PC del aula
2. Intenta navegar a un dominio que sabemos que está bloqueado (ej: `facebook.com`)

**Verificaciones**:
- [ ] La página NO carga (timeout o error DNS)
- [ ] La extensión OpenPath muestra indicador de bloqueo
- [ ] Hay forma clara de solicitar desbloqueo
- [ ] No hay mensaje confuso tipo "No se puede conectar"

**Captura**: Screenshot de la página bloqueada

---

### Test 1.2: Ver contador de dominios bloqueados en extensión

**Acciones**:
1. Navega a varias páginas (algunas bloqueadas)
2. Observa el icono de la extensión OpenPath

**Verificaciones**:
- [ ] El icono muestra badge/contador de bloqueados
- [ ] El contador aumenta cuando hay más bloqueos
- [ ] Es visible y entendible

---

### Test 1.3: Abrir popup de la extensión

**Acciones**:
1. Haz clic en el icono de la extensión OpenPath
2. Observa el contenido del popup

**Verificaciones**:
- [ ] Muestra lista de dominios bloqueados en esta pestaña
- [ ] Hay botón para "📨 Solicitar desbloqueo"
- [ ] Botones disponibles: 📋 Copiar, 🔍 Verificar, 📨 Solicitar, 🗑️ Limpiar
- [ ] Interface simple y clara
- [ ] No requiere conocimientos técnicos

**Captura**: Screenshot del popup de la extensión

---

## SECCIÓN 2: Solicitar Desbloqueo

### Test 2.1: Solicitar desbloqueo desde extensión

**Acciones**:
1. Después de intentar acceder a `wikipedia.org` (si está bloqueado)
2. Abre el popup de la extensión
3. Haz clic en "📨 Solicitar" para wikipedia.org
4. Si pide motivo, escribe: "Necesito buscar información para el trabajo de Historia"
5. Envía la solicitud

**Verificaciones**:
- [ ] Formulario simple con campo de motivo
- [ ] Se puede enviar la solicitud
- [ ] Confirmación visual: "Solicitud enviada"
- [ ] El dominio cambia de estado en la lista

**Captura**: Screenshot del formulario y confirmación

---

### Test 2.2: Solicitud sin motivo (si es opcional)

**Acciones**:
1. Intenta enviar solicitud sin escribir motivo

**Verificaciones**:
- [ ] Si es obligatorio: mensaje de validación
- [ ] Si es opcional: se envía igualmente
- [ ] El comportamiento es consistente

---

### Test 2.3: Solicitar mismo dominio dos veces

**Acciones**:
1. Solicita desbloqueo de un dominio
2. Intenta solicitar el mismo dominio otra vez

**Verificaciones**:
- [ ] Mensaje: "Ya existe una solicitud pendiente para este dominio"
- [ ] No se crean duplicados
- [ ] Muestra estado de la solicitud existente

---

### Test 2.4: Ver estado de mis solicitudes

**Acciones**:
1. Después de solicitar varios dominios
2. Busca opción de "Ver mis solicitudes" en la extensión

**Verificaciones**:
- [ ] Lista de solicitudes enviadas
- [ ] Estado de cada una: Pendiente, Aprobada, Rechazada
- [ ] Fecha/hora de cada solicitud

---

## SECCIÓN 3: Después de la Aprobación

### Test 3.1: Acceder a dominio recién aprobado

**Acciones**:
1. Después de que el profesor apruebe la solicitud
2. Espera 2-5 minutos (tiempo de sincronización)
3. Intenta acceder a `wikipedia.org` de nuevo

**Verificaciones**:
- [ ] La página ahora carga correctamente
- [ ] El dominio ya no aparece como bloqueado
- [ ] La experiencia es normal

**Captura**: Screenshot de la página cargando

---

### Test 3.2: Recibir notificación de aprobación (si existe)

**Acciones**:
1. Después de que aprueben tu solicitud
2. Observa si hay notificación

**Verificaciones**:
- [ ] Notificación en la extensión o badge
- [ ] Mensaje: "Tu solicitud de wikipedia.org fue aprobada"
- [ ] Enlace directo para acceder

---

### Test 3.3: Recibir notificación de rechazo

**Acciones**:
1. Si alguna solicitud fue rechazada
2. Observa la notificación

**Verificaciones**:
- [ ] Mensaje claro de rechazo
- [ ] Se muestra el motivo (si el profesor lo escribió)
- [ ] No es frustrante o confuso

---

## SECCIÓN 4: Acceso al SPA como Estudiante

### Test 4.1: Login como estudiante en SPA

**Acciones**:
1. Abre el navegador y ve a la URL del SPA
2. Inicia sesión con `alumna@centro.edu`

**Verificaciones**:
- [ ] Login exitoso
- [ ] Vista muy limitada (solo lo necesario)
- [ ] NO ve opciones de admin ni profesor

**Captura**: Screenshot del dashboard de estudiante

---

### Test 4.2: Ver mis solicitudes en SPA

**Acciones**:
1. Busca sección "Mis solicitudes"

**Verificaciones**:
- [ ] Lista de todas sus solicitudes
- [ ] Estado de cada una
- [ ] Motivo de rechazo (si aplica)

---

### Test 4.3: Solicitar dominio desde SPA (si se permite)

**Acciones**:
1. Busca opción de "Nueva solicitud"
2. Intenta crear solicitud para `google.com`

**Verificaciones**:
- [ ] Formulario simple
- [ ] Campos: dominio, motivo
- [ ] Se crea la solicitud

---

### Test 4.4: Verificar qué NO puede hacer un estudiante

**Acciones**:
1. Revisa el menú de navegación
2. Intenta acceder a URLs de admin

**Verificaciones**:
- [ ] NO puede ver usuarios
- [ ] NO puede aprobar/rechazar solicitudes (de otros)
- [ ] NO puede gestionar aulas
- [ ] NO puede ver health del sistema

---

## SECCIÓN 5: Casos Edge del Alumno

### Test 5.1: Solicitar dominio que ya está permitido

**Acciones**:
1. Intenta solicitar un dominio que ya está en whitelist (ej: `google.com`)

**Verificaciones**:
- [ ] Mensaje: "Este dominio ya está permitido"
- [ ] O simplemente la página carga sin problemas
- [ ] No se crea solicitud innecesaria

---

### Test 5.2: Solicitar dominio bloqueado por admin

**Acciones**:
1. Intenta solicitar `tiktok.com` (bloqueado globalmente)

**Verificaciones**:
- [ ] Puede crear la solicitud (para que el profesor la vea)
- [ ] O mensaje indicando que está bloqueado y no se puede aprobar
- [ ] El alumno entiende que es una restricción del centro

---

### Test 5.3: Muchas solicitudes pendientes

**Acciones**:
1. Crea 5+ solicitudes rápidamente

**Verificaciones**:
- [ ] Sistema acepta múltiples solicitudes
- [ ] O hay límite razonable (ej: 10 pendientes máx)
- [ ] No hay rate limiting excesivo

---

### Test 5.4: Extensión con SPA cerrado

**Acciones**:
1. Cierra el SPA
2. Usa solo la extensión para solicitar

**Verificaciones**:
- [ ] La extensión funciona independientemente
- [ ] Las solicitudes se envían correctamente
- [ ] No requiere tener el SPA abierto

---

### Test 5.5: PC sin conexión a internet

**Acciones**:
1. Desconecta la red
2. Intenta solicitar un dominio

**Verificaciones**:
- [ ] Mensaje de error claro
- [ ] "Sin conexión, intenta más tarde"
- [ ] No se pierde información escrita

---

## SECCIÓN 6: Extensión de Firefox - Detalles

### Test 6.1: Instalación de la extensión

**Acciones**:
1. Si la extensión no está instalada
2. Verificar que está preinstalada (política del centro)
3. O instalar manualmente desde archivo .xpi

**Verificaciones**:
- [ ] Extensión aparece en Firefox
- [ ] Icono visible en barra de herramientas
- [ ] No requiere permisos excesivos

---

### Test 6.2: Configuración de la extensión

**Acciones**:
1. Haz clic derecho en el icono > Opciones
2. Revisa la configuración

**Verificaciones**:
- [ ] URL del servidor API configurada
- [ ] Opciones mínimas (no confundir al alumno)
- [ ] Funciona sin configuración manual

---

### Test 6.3: Extensión detecta bloqueos correctamente

**Acciones**:
1. Navega a dominio bloqueado
2. Navega a dominio permitido
3. Verifica badge de la extensión

**Verificaciones**:
- [ ] Solo cuenta los realmente bloqueados
- [ ] No cuenta errores de red normales
- [ ] Precisión en la detección

---

### Test 6.4: Lista de dominios bloqueados por pestaña

**Acciones**:
1. Abre múltiples pestañas con diferentes dominios bloqueados
2. Revisa la extensión en cada pestaña

**Verificaciones**:
- [ ] Cada pestaña muestra sus propios bloqueados
- [ ] No mezcla información entre pestañas
- [ ] Contexto correcto siempre

---

## SECCIÓN 7: Usabilidad para Estudiantes

### Test 7.1: Lenguaje apropiado para edad escolar

**Acciones**:
1. Revisa todos los textos de la extensión y SPA

**Verificaciones**:
- [ ] Lenguaje simple, sin jerga técnica
- [ ] "📨 Solicitar" en vez de jerga técnica
- [ ] Mensajes amigables, no intimidantes

---

### Test 7.2: Iconos e indicadores visuales claros

**Acciones**:
1. Observa iconos y colores usados

**Verificaciones**:
- [ ] Rojo = bloqueado, Verde = permitido
- [ ] Iconos intuitivos (candado, check, etc.)
- [ ] No requiere leer para entender

---

### Test 7.3: Experiencia sin frustración

**Acciones**:
1. Simula el flujo completo de un alumno típico
2. Evalúa la experiencia general

**Verificaciones**:
- [ ] El proceso es rápido (< 30 segundos para solicitar)
- [ ] Mensajes de éxito/error claros
- [ ] El alumno sabe qué hacer en cada paso
- [ ] Puede pedir ayuda al profesor si es necesario

---

## SECCIÓN 8: Flujo Completo - Escenario Real

### Test 8.1: Escenario "Necesito Wikipedia para el trabajo"

**Simular este escenario**:

1. **Ana** está en clase de Historia
2. El profesor pide buscar información sobre la Revolución Francesa
3. Ana intenta acceder a `wikipedia.org`
4. **La página no carga** (está bloqueada)
5. Ana ve el icono de la extensión con badge "1"
6. Ana **hace clic en la extensión**
7. Escribe: "Trabajo de Historia sobre Revolución Francesa"
8. Hace clic en **"Solicitar"**
9. Ve mensaje **"Solicitud enviada"**
10. **Espera** (levanta la mano si es urgente)
11. El profesor Pedro **aprueba** desde su móvil
12. En 2 minutos, Ana **refresca** y Wikipedia carga

**Medir tiempo total**: Desde bloqueo hasta acceso

**Verificaciones**:
- [ ] Flujo completo funciona
- [ ] Ana no necesita ayuda técnica
- [ ] Tiempo razonable para clase
- [ ] Experiencia no frustrante

**Captura**: Screenshots de cada paso

---

### Test 8.2: Escenario "Dominio rechazado"

**Simular**:
1. Ana solicita `instagram.com` (bloqueado por política)
2. El profesor lo rechaza
3. Ana ve el rechazo

**Verificaciones**:
- [ ] Ana entiende que fue rechazado
- [ ] Ve el motivo si lo hay
- [ ] No puede solicitar de nuevo (o mensaje claro)
- [ ] Acepta y busca alternativas

---

## Resumen de Tests

| # | Test | Descripción | Status |
|---|------|-------------|--------|
| 1.1 | Dominio bloqueado | Experiencia de bloqueo | ⬜ |
| 1.2 | Contador extensión | Badge con número | ⬜ |
| 1.3 | Popup extensión | Abrir y ver | ⬜ |
| 2.1 | Solicitar | Desde extensión | ⬜ |
| 2.2 | Sin motivo | Validación | ⬜ |
| 2.3 | Duplicado | Mismo dominio | ⬜ |
| 2.4 | Ver estado | Mis solicitudes | ⬜ |
| 3.1 | Post-aprobación | Dominio accesible | ⬜ |
| 3.2 | Notif aprobación | Feedback | ⬜ |
| 3.3 | Notif rechazo | Con motivo | ⬜ |
| 4.1 | Login SPA | Como estudiante | ⬜ |
| 4.2 | Ver solicitudes | En SPA | ⬜ |
| 4.3 | Solicitar SPA | Nueva solicitud | ⬜ |
| 4.4 | Restricciones | Qué NO puede | ⬜ |
| 5.1 | Ya permitido | No duplicar | ⬜ |
| 5.2 | Bloqueado admin | Restricción global | ⬜ |
| 5.3 | Muchas solicitudes | Límites | ⬜ |
| 5.4 | Sin SPA | Solo extensión | ⬜ |
| 5.5 | Offline | Sin internet | ⬜ |
| 6.1 | Instalación ext | Setup | ⬜ |
| 6.2 | Config ext | Opciones | ⬜ |
| 6.3 | Detección | Precisión | ⬜ |
| 6.4 | Por pestaña | Contexto | ⬜ |
| 7.1 | Lenguaje | Apropiado | ⬜ |
| 7.2 | Iconos | Claridad | ⬜ |
| 7.3 | Sin frustración | UX general | ⬜ |
| 8.1 | Wikipedia | Escenario real | ⬜ |
| 8.2 | Instagram | Rechazo | ⬜ |

### Total: 28 tests de UI**

---

## KPIs a Medir

| Métrica | Objetivo | Resultado |
|---------|----------|-----------|
| Tiempo para solicitar | < 30 segundos | ⬜ |
| Clics para solicitar | ≤ 3 | ⬜ |
| Comprensión del proceso | Sin ayuda | ⬜ |
| Satisfacción alumno | Sin frustración | ⬜ |
