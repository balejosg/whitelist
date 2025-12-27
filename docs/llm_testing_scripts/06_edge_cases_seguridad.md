# Guión de Prueba: Casos Edge, Seguridad y Errores

## Contexto

Este guión cubre casos límite, escenarios de error, y pruebas de seguridad. Es el guión más "adversario" - intenta romper el sistema de todas las formas posibles.

> [!NOTE]
> Este guión puede usar DevTools Console y llamadas `fetch(...)` para comprobar protecciones.

---

## SECCIÓN 1: Seguridad - Escalada de Privilegios

### Test 1.1: Estudiante intenta aprobar solicitudes

**Acciones**:
1. Login como estudiante (Ana)
2. Intenta navegar directamente a `/requests` o `/admin`
3. Si hay botón de aprobar visible (bug), intenta usarlo

**Verificaciones**:
- [ ] No puede ver solicitudes de otros
- [ ] No puede aprobar/rechazar
- [ ] Redirige o muestra error de permisos

---

### Test 1.2: Profesor intenta ver todos los usuarios

**Acciones**:
1. Login como profesor (Pedro)
2. Intenta navegar a `/users`

**Verificaciones**:
- [ ] Acceso denegado
- [ ] No puede ver lista de usuarios
- [ ] Solo admin tiene acceso

---

### Test 1.3: Profesor intenta asignarse más grupos

**Acciones**:
1. Login como Pedro
2. En su perfil, intenta editar sus grupos asignados
3. Añadir `matematicas-4eso` (no asignado)

**Verificaciones**:
- [ ] No puede modificar sus propios grupos
- [ ] Solo admin puede asignar grupos
- [ ] Mensaje de error apropiado

---

### Test 1.4: Profesor intenta aprobar solicitud de otro grupo

**Acciones**:
1. Pedro tiene grupos `ciencias-3eso`
2. Intenta acceder/aprobar solicitud de `matematicas-4eso`

**Verificaciones**:
- [ ] No puede ver esa solicitud
- [ ] Si intenta por URL directa, error 403

---

### Test 1.5: Usuario intenta ser admin

**Acciones**:
1. Login como cualquier usuario no-admin
2. Intenta cambiar su rol a admin en su perfil

**Verificaciones**:
- [ ] Campo de rol no editable
- [ ] Si manipula la petición, servidor rechaza

---

### Test 1.6: Manipulación de token JWT

**Acciones**:
1. Obtener un token JWT válido
2. Modificar el payload para cambiar `role: "admin"`
3. Usar el token modificado

**Verificaciones**:
- [ ] Token rechazado (firma inválida)
- [ ] No se puede escalar privilegios via JWT

---

## SECCIÓN 1B: Seguridad - Bootstrap / Primer Admin

### Test 1B.1: La pantalla de setup se bloquea tras configurar

**Acciones**:
1. Abre `https://balejosg.github.io/openpath/setup.html`
2. Si el sistema ya está configurado, verifica que muestra "Sistema Configurado" y enlace a login

**Verificaciones**:
- [ ] No ofrece formulario de creación si ya existe admin

### Test 1B.2: Intentar crear el primer admin por segunda vez (bloqueo)

**Acciones** (DevTools Console en `https://openpath-api.duckdns.org` o desde cualquier origen con `fetch`):
1. Ejecuta:
    ```javascript
    fetch('https://openpath-api.duckdns.org/api/setup/first-admin', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ email: 'evil@school.edu', name: 'Evil', password: 'SecurePass123!' })
    }).then(r => r.json().then(b => ({ status: r.status, body: b })));
    ```

**Verificaciones**:
- [ ] Responde `403` (o equivalente) con mensaje tipo "Setup already completed"

### Test 1B.3: Rate limiting del endpoint de setup

**Acciones**:
1. Ejecuta 4+ llamadas seguidas al endpoint anterior (cambiando email si hace falta)

**Verificaciones**:
- [ ] A partir de cierto número, responde `429` (rate limit) con mensaje apropiado

### Test 1B.4: Validación del token de registro (errores)

**Acciones**:
1. Ejecuta:
    ```javascript
    fetch('https://openpath-api.duckdns.org/api/setup/validate-token', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ token: 'invalid-token' })
    }).then(r => r.json().then(b => ({ status: r.status, body: b })));
    ```
2. Ejecuta lo mismo sin `token` en el body

**Verificaciones**:
- [ ] Token incorrecto devuelve `valid:false`
- [ ] Sin token devuelve `400` y `valid:false`

---

## SECCIÓN 2: Seguridad - Ataques Comunes

### Test 2.1: Inyección XSS en motivo de solicitud

**Acciones**:
1. Crear solicitud con motivo:
   ```html
   <script>alert('XSS')</script>
   ```
2. Ver cómo se muestra en la UI

**Verificaciones**:
- [ ] Script NO se ejecuta
- [ ] Se escapa HTML correctamente
- [ ] Se muestra como texto plano

---

### Test 2.2: Inyección SQL (si aplica)

**Acciones**:
1. En campo de búsqueda o login, probar:
   ```
   ' OR '1'='1
   ```
2. En campos de formulario:
   ```
   '; DROP TABLE users; --
   ```

**Verificaciones**:
- [ ] No hay errores de SQL expuestos
- [ ] Las consultas están parametrizadas
- [ ] Sistema sigue funcionando

---

### Test 2.3: Fuerza bruta en login

**Acciones**:
1. Intentar login con contraseña incorrecta 10+ veces
2. Verificar si hay rate limiting

**Verificaciones**:
- [ ] Rate limiting activo
- [ ] Mensaje: "Demasiados intentos, espera X segundos"
- [ ] Cuenta no se bloquea permanentemente (o sí, según política)

---

### Test 2.4: CSRF en acciones críticas

**Acciones**:
1. Abre DevTools (F12) > Console
2. Intenta ejecutar:
   ```javascript
   fetch('/api/requests/1/approve', {method: 'POST'})
   ```
3. Verifica que requiera autenticación válida
4. Opcionalmente, crea un archivo HTML local con un formulario que apunte a la API

**Verificaciones**:
- [ ] Requiere autenticación válida
- [ ] No se puede aprobar desde sitio externo
- [ ] Las cookies HttpOnly protegen el token

---

### Test 2.5: Enumeración de usuarios

**Acciones**:
1. Intentar login con emails aleatorios
2. Observar mensajes de error

**Verificaciones**:
- [ ] Mensaje genérico: "Credenciales inválidas"
- [ ] NO diferencia entre "usuario no existe" y "contraseña incorrecta"

---

## SECCIÓN 3: Validación de Datos

### Test 3.1: Email inválido en registro

**Acciones**:
1. Intentar registrar con emails inválidos:
   - `notanemail`
   - `missing@domain`
   - `spaces in@email.com`

**Verificaciones**:
- [ ] Validación de formato de email
- [ ] Mensaje de error claro

---

### Test 3.2: Contraseña débil

**Acciones**:
1. Intentar registrar con contraseñas:
   - `123`
   - `password`
   - `aaaa`

**Verificaciones**:
- [ ] Mínimo 8 caracteres (o lo que configure)
- [ ] Mensaje de requisitos de contraseña

---

### Test 3.3: Dominio inválido en solicitud

**Acciones**:
1. Intentar solicitar dominios inválidos:
   - `not a domain`
   - `http://google.com` (URL completa)
   - `*.wildcard.com`
   - Vacío

**Verificaciones**:
- [ ] Validación de formato de dominio
- [ ] Se normaliza o se rechaza

---

### Test 3.4: Campos vacíos en formularios

**Acciones**:
1. Intentar enviar formularios con campos requeridos vacíos

**Verificaciones**:
- [ ] Validación en frontend (no permite enviar)
- [ ] Validación en backend (si se salta frontend)

---

### Test 3.5: Campos muy largos

**Acciones**:
1. Intentar con valores extremadamente largos:
   - Nombre de 10,000 caracteres
   - Motivo de solicitud de 50,000 caracteres

**Verificaciones**:
- [ ] Hay límite de longitud
- [ ] No crashea el sistema
- [ ] Mensaje de error apropiado

---

## SECCIÓN 4: Casos Edge de Negocio

### Test 4.1: Solicitar dominio que ya está en whitelist

**Acciones**:
1. Dominio `google.com` ya está permitido
2. Intentar solicitar `google.com`

**Verificaciones**:
- [ ] Mensaje: "Este dominio ya está permitido"
- [ ] O no se muestra como bloqueado
- [ ] No se crea solicitud duplicada

---

### Test 4.2: Aprobar dominio que ya fue aprobado

**Acciones**:
1. Solicitud de `wikipedia.org` ya fue aprobada
2. Intentar aprobarla de nuevo (si es posible)

**Verificaciones**:
- [ ] Mensaje: "Ya está aprobada"
- [ ] No hay duplicados en whitelist
- [ ] Manejo gracioso

---

### Test 4.3: Profesor sin grupos asignados

**Acciones**:
1. Admin quita todos los grupos a Pedro
2. Pedro accede al dashboard

**Verificaciones**:
- [ ] Dashboard muestra mensaje amigable
- [ ] No hay errores técnicos
- [ ] "No tienes clases asignadas. Contacta al administrador."

---

### Test 4.4: Grupo sin dominios

**Acciones**:
1. Crear grupo `nuevo-grupo` vacío
2. Asignar a un aula

**Verificaciones**:
- [ ] El grupo funciona (solo dominios base del sistema)
- [ ] No hay errores
- [ ] Se puede añadir dominios después

---

### Test 4.5: Eliminar grupo con reservas activas

**Acciones**:
1. Grupo `ciencias-3eso` tiene reservas
2. Intentar eliminar el grupo

**Verificaciones**:
- [ ] Advertencia sobre reservas existentes
- [ ] O no permite eliminar con dependencias
- [ ] Cascada clara si se permite

---

### Test 4.6: Eliminar aula con máquinas

**Acciones**:
1. Aula Informática 1 tiene 20 máquinas
2. Intentar eliminar el aula

**Verificaciones**:
- [ ] Advertencia sobre máquinas registradas
- [ ] Qué pasa con las máquinas huérfanas
- [ ] Comportamiento claro

---

### Test 4.7: Reserva en horario pasado

**Acciones**:
1. Intentar crear reserva para ayer

**Verificaciones**:
- [ ] No permite reservas en el pasado
- [ ] O muestra advertencia

---

### Test 4.8: Reserva superpuesta exacta

**Acciones**:
1. Crear reserva: Lunes 09:00-10:00
2. Intentar crear otra: Lunes 09:00-10:00

**Verificaciones**:
- [ ] Conflicto detectado
- [ ] No permite duplicado

---

### Test 4.9: Reserva parcialmente superpuesta

**Acciones**:
1. Crear reserva: Lunes 09:00-10:00
2. Intentar crear: Lunes 09:30-10:30

**Verificaciones**:
- [ ] Conflicto detectado (solapamiento parcial)

---

## SECCIÓN 5: Casos Edge de UI

### Test 5.1: Sesión expirada durante uso

**Acciones**:
1. Dejar sesión inactiva 15+ minutos
2. Intentar una acción

**Verificaciones**:
- [ ] Mensaje de sesión expirada
- [ ] Redirige a login
- [ ] No pierde acción a medias

---

### Test 5.2: Doble clic en aprobar

**Acciones**:
1. Hacer doble clic rápido en "Aprobar"

**Verificaciones**:
- [ ] Solo se procesa una vez
- [ ] Botón se deshabilita tras primer clic
- [ ] No hay error de duplicado

---

### Test 5.3: Múltiples pestañas abiertas

**Acciones**:
1. Abrir dashboard en 2 pestañas
2. Aprobar solicitud en pestaña 1
3. Intentar aprobar la misma en pestaña 2

**Verificaciones**:
- [ ] Pestaña 2 detecta que ya fue aprobada
- [ ] Mensaje informativo
- [ ] No hay errores

---

### Test 5.4: Acciones durante desconexión

**Acciones**:
1. Desconectar internet (DevTools > Offline)
2. Intentar aprobar solicitud

**Verificaciones**:
- [ ] Mensaje de error de conexión
- [ ] No se pierde la información
- [ ] Reintento posible al reconectar

---

### Test 5.5: Página con datos obsoletos (stale)

**Acciones**:
1. Cargar lista de solicitudes
2. Desde otra sesión, aprobar una
3. Refrescar la primera sesión

**Verificaciones**:
- [ ] Los datos se actualizan
- [ ] Polling o refresh manual funciona
- [ ] Estado consistente

---

## SECCIÓN 6: Rendimiento y Límites

### Test 6.1: Muchas solicitudes pendientes

**Acciones**:
1. Crear 500+ solicitudes pendientes
2. Cargar el dashboard

**Verificaciones**:
- [ ] Paginación o virtualización
- [ ] No se congela el navegador
- [ ] Tiempo de carga razonable

---

### Test 6.2: Muchas máquinas en health

**Acciones**:
1. Simular 1000 máquinas registradas
2. Cargar dashboard de health

**Verificaciones**:
- [ ] Paginación implementada
- [ ] Búsqueda/filtro funciona
- [ ] Rendimiento aceptable

---

### Test 6.3: Rate limiting de API

> [!NOTE]
> Esta prueba se realiza como **setup técnico previo** al UAT, no durante la prueba de usuario.

**Acciones**:
1. Usar herramienta de carga (k6, artillery) o script de setup
2. O desde DevTools > Console:
   ```javascript
   for(let i=0; i<200; i++) fetch('/api/health')
   ```
3. Observar comportamiento

**Verificaciones**:
- [ ] Rate limiting activo
- [ ] Respuesta 429 Too Many Requests
- [ ] Headers de rate limit presentes

---

### Test 6.4: Subida de archivo grande (si aplica)

**Acciones**:
1. Si hay opción de subir archivos (ej: import de whitelist)
2. Intentar subir archivo de 100MB

**Verificaciones**:
- [ ] Límite de tamaño aplicado
- [ ] Mensaje de error claro
- [ ] No crashea el servidor

---

## SECCIÓN 7: Casos Edge de Agente Linux

### Test 7.1: Whitelist corrupta

**Acciones**:
1. Modificar whitelist remota con sintaxis inválida
2. Forzar update en agente

**Verificaciones**:
- [ ] Agente detecta error
- [ ] Mantiene whitelist anterior
- [ ] Log con error claro

---

### Test 7.2: DNS upstream caído

**Acciones**:
1. Bloquear el DNS upstream (8.8.8.8)
2. Verificar comportamiento

**Verificaciones**:
- [ ] Watchdog detecta el problema
- [ ] Intenta recuperar con DNS alternativo
- [ ] Logs informativos

---

### Test 7.3: Disco lleno

**Acciones**:
1. Llenar el disco del sistema
2. Verificar comportamiento del agente

**Verificaciones**:
- [ ] No crashea
- [ ] Logs indican problema de espacio
- [ ] Continúa funcionando lo que puede

---

### Test 7.4: Resolv.conf modificado externamente

**Acciones**:
1. Otro proceso modifica /etc/resolv.conf
2. Verificar que el agente lo detecta

**Verificaciones**:
- [ ] Watchdog restaura la configuración
- [ ] DNS sigue apuntando a localhost
- [ ] Sistemas de protección funcionan

---

### Test 7.5: Usuario intenta detener servicios

**Acciones**:
1. Usuario normal (no root) intenta:
   ```bash
   sudo systemctl stop dnsmasq
   ```

**Verificaciones**:
- [ ] Requiere contraseña de sudo
- [ ] Si logra detener, watchdog reinicia
- [ ] Registro del intento (si aplica)

---

## SECCIÓN 8: Casos Edge de Notificaciones

### Test 8.1: Navegador no soporta push

**Acciones**:
1. Usar navegador sin soporte de Push API (ej: Safari antiguo)
2. Intentar activar notificaciones

**Verificaciones**:
- [ ] Mensaje: "Tu navegador no soporta notificaciones"
- [ ] Funcionalidad degradada pero funcional
- [ ] Polling como fallback

---

### Test 8.2: Usuario rechaza permiso de notificaciones

**Acciones**:
1. Cuando aparece diálogo de permisos, rechazar
2. Intentar activar notificaciones después

**Verificaciones**:
- [ ] Mensaje explicando que fueron rechazadas
- [ ] Instrucciones para habilitar en config del navegador
- [ ] Sistema funciona sin push

---

### Test 8.3: Service Worker no instalado

**Acciones**:
1. Borrar Service Worker manualmente (DevTools)
2. Verificar comportamiento

**Verificaciones**:
- [ ] Se reinstala automáticamente
- [ ] O mensaje para refrescar la página

---

## SECCIÓN 9: Compatibilidad

### Test 9.1: Navegadores diferentes

**Probar en**:
- [ ] Chrome (última versión)
- [ ] Firefox (última versión)
- [ ] Edge (última versión)
- [ ] Safari (si aplica)

**Verificaciones para cada uno**:
- [ ] Login funciona
- [ ] Dashboard carga
- [ ] Acciones básicas funcionan
- [ ] Notificaciones (donde soportado)

---

### Test 9.2: Resoluciones de pantalla

**Probar en**:
- [ ] 1920x1080 (desktop)
- [ ] 1366x768 (laptop)
- [ ] 768x1024 (tablet portrait)
- [ ] 375x812 (móvil)

**Verificaciones**:
- [ ] Contenido visible
- [ ] No hay elementos cortados
- [ ] Navegación accesible

---

### Test 9.3: Con JavaScript deshabilitado

**Acciones**:
1. Deshabilitar JavaScript en el navegador
2. Intentar usar la aplicación

**Verificaciones**:
- [ ] Mensaje de que requiere JavaScript
- [ ] O funcionalidad básica (degración graceful)

---

## SECCIÓN 10: Recuperación de Errores

### Test 10.1: Servidor API reiniciado

**Acciones**:
1. Reiniciar el servidor API
2. Usuario tenía sesión activa

**Verificaciones**:
- [ ] Sesión sigue válida (JWT)
- [ ] O redirige a login
- [ ] Sin pérdida de datos

---

### Test 10.2: Base de datos corrupta (si aplica)

**Acciones**:
1. Simular corrupción de datos
2. Verificar arranque del servidor

**Verificaciones**:
- [ ] Mensajes de error informativos
- [ ] Backup disponible
- [ ] Proceso de recuperación documentado

---

### Test 10.3: Migración de versión

**Acciones**:
1. Actualizar de versión N a N+1
2. Verificar funcionamiento

**Verificaciones**:
- [ ] Datos migrados correctamente
- [ ] Sesiones existentes funcionan
- [ ] No hay regresiones

---

## Resumen de Tests

| Sección | # Tests | Prioridad |
|---------|---------|-----------|
| 1. Escalada privilegios | 6 | 🔴 Alta |
| 2. Ataques comunes | 5 | 🔴 Alta |
| 3. Validación datos | 5 | 🟡 Media |
| 4. Edge negocio | 9 | 🟡 Media |
| 5. Edge UI | 5 | 🟡 Media |
| 6. Rendimiento | 4 | 🟡 Media |
| 7. Edge Linux | 5 | 🟡 Media |
| 8. Edge notificaciones | 3 | 🟢 Baja |
| 9. Compatibilidad | 3 | 🟢 Baja |
| 10. Recuperación | 3 | 🟡 Media |
| **TOTAL** | **48** | - |

---

## Formato de Reporte de Vulnerabilidades

```markdown
## Vulnerabilidad #X

**Severidad**: 🔴 Crítica / 🟠 Alta / 🟡 Media / 🟢 Baja

**Título**: [Descripción corta]

**Descripción**:
[Explicación detallada del problema]

**Pasos para reproducir**:
1. ...
2. ...

**Impacto**:
[Qué puede hacer un atacante con esto]

**Sugerencia de fix**:
[Cómo solucionarlo]

**Evidencia**:
[Screenshot, log, etc.]
```
