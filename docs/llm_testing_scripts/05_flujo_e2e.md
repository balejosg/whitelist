# Guión de Prueba: Flujo E2E Completo - Día Típico en Centro Educativo

## Contexto

Este guión simula un **día completo de uso** del sistema OpenPath en un centro educativo K-12. Involucra todos los roles y verifica la integración end-to-end de todas las funcionalidades.

**Duración estimada**: 45-60 minutos  
**Roles involucrados**: Admin TIC, Profesor, Alumno, Sistema

---

## Escenario del Centro

**Centro**: IES Ejemplo  
**Usuarios**:
- María García - Coordinadora TIC (Admin)
- Pedro Martínez - Profesor de Ciencias
- Ana López - Alumna de 3º ESO
- Carlos Ruiz - Profesor de Matemáticas

**Aulas**:
- Aula Informática 1 (20 PCs)
- Aula Informática 2 (15 PCs)

**Grupos**:
- `base-centro` - Whitelist básica
- `ciencias-3eso` - Grupo de Pedro
- `matematicas-3eso` - Grupo de Carlos

---

## FASE 0: Setup inicial (solo primera instalación en un centro)

> [!NOTE]
> Si el centro ya está configurado (ya existe un admin), esta fase no aplica.

### 0.1: Crear primer administrador y obtener token de registro

**Acciones**:
1. Abre `https://balejosg.github.io/openpath/setup.html`
2. Si ves "Sistema Configurado", anota que no aplica y continúa con Fase 1
3. Si ves "Configuración Inicial", crea el primer admin (María) y copia el **Token de Registro para PCs Cliente**

**Verificaciones**:
- [ ] El sistema permite crear el primer admin solo una vez
- [ ] El token de registro se muestra y se puede copiar

**Captura**: Screenshot del token de registro

---

## FASE 1: Inicio del Día (8:00 - 8:30)

### 1.1: María prepara el centro

**Acciones de María (Admin)**:
1. Abre el navegador y accede al dashboard
2. Inicia sesión con sus credenciales
3. Revisa el panel de Health/Estado

**Verificaciones**:
- [ ] Todas las máquinas del aula 1 están online (20/20)
- [ ] Todas las máquinas del aula 2 están online (15/15)
- [ ] No hay alertas críticas
- [ ] Última sincronización < 10 minutos

**Captura**: Screenshot del dashboard de health

---

### 1.2: María configura el horario del día

**Acciones**:
1. Va a la sección de Aulas
2. Verifica las reservas de hoy:
   - 09:00-10:00: Aula 1 → ciencias-3eso (Pedro)
   - 10:00-11:00: Aula 1 → matematicas-3eso (Carlos)
   - 11:00-12:00: Aula 2 → ciencias-3eso (Pedro)

**Verificaciones**:
- [ ] Reservas visibles en el calendario
- [ ] No hay conflictos de horario
- [ ] Los grupos activos cambiarán automáticamente

---

### 1.3: María crea un nuevo profesor

**Acciones**:
1. Navega a Usuarios
2. Crea usuario para Carlos Ruiz:
   - Email: carlos@centro.edu
   - Rol: Profesor
   - Grupos: matematicas-3eso

**Verificaciones**:
- [ ] Usuario creado correctamente
- [ ] Grupos asignados
- [ ] Carlos puede hacer login

---

## FASE 2: Primera Clase (9:00 - 10:00)

### 2.1: Pedro llega a clase de Ciencias

**Contexto**: Pedro tiene clase de Física con 3º ESO en Aula Informática 1

**Acciones de Pedro**:
1. Abre su móvil
2. Accede al dashboard de profesor
3. Verifica que ve el grupo `ciencias-3eso`

**Verificaciones**:
- [ ] Dashboard carga rápido en móvil
- [ ] Ve sus grupos asignados
- [ ] No hay solicitudes pendientes (aún)

---

### 2.2: Alumnos entran al aula

**Contexto**: Los alumnos encienden sus PCs

**Verificaciones en las máquinas**:
- [ ] Los PCs sincronizaron con grupo `ciencias-3eso`
- [ ] La whitelist del grupo está activa
- [ ] Dominios base (google.com, etc.) funcionan

---

### 2.3: Ana necesita Wikipedia

**Acciones de Ana**:
1. Abre Firefox en su PC
2. Intenta acceder a `wikipedia.org`
3. ❌ La página no carga (dominio no en whitelist)

**Verificaciones**:
- [ ] Extensión OpenPath muestra badge "1"
- [ ] Ana entiende que está bloqueado

---

### 2.4: Ana solicita desbloqueo

**Acciones de Ana**:
1. Hace clic en el icono de la extensión
2. Ve `wikipedia.org` en la lista de bloqueados
3. Escribe motivo: "Necesito buscar información sobre Newton para el ejercicio"
4. Hace clic en "Solicitar desbloqueo"

**Verificaciones**:
- [ ] Formulario simple
- [ ] Solicitud enviada con éxito
- [ ] Ana ve confirmación

**Captura**: Screenshots del flujo de solicitud

---

### 2.5: Pedro recibe notificación

**Acciones de Pedro** (en su móvil):
1. Recibe notificación push: "Nueva solicitud: wikipedia.org"
2. Hace clic en la notificación
3. Ve la solicitud con el motivo de Ana

**Verificaciones**:
- [ ] Notificación llegó en < 5 segundos
- [ ] Abre el dashboard directamente
- [ ] La solicitud está destacada

---

### 2.6: Pedro aprueba el dominio

**Acciones de Pedro**:
1. Lee el motivo: "información sobre Newton"
2. Considera que es apropiado para la clase
3. Hace clic en "Aprobar"

**Verificaciones**:
- [ ] Aprobación en 2 clics máximo
- [ ] Confirmación visual
- [ ] Tiempo total desde solicitud < 60 segundos

**Medir**: ⏱️ Tiempo desde solicitud de Ana hasta aprobación

---

### 2.7: Ana accede a Wikipedia

**Acciones de Ana**:
1. Espera ~2 minutos (sincronización)
2. Refresca la página de Wikipedia

**Verificaciones**:
- [ ] Wikipedia ahora carga
- [ ] Ana puede usar el recurso
- [ ] La clase continúa sin más interrupciones

**Captura**: Screenshot de Wikipedia funcionando

---

### 2.8: Otro alumno solicita YouTube

**Contexto**: Un alumno solicita `youtube.com` para ver un video educativo

**Acciones**:
1. El alumno envía solicitud con motivo: "Video sobre las leyes de Newton - Khan Academy"
2. Pedro recibe notificación
3. Pedro aprueba

**Verificaciones**:
- [ ] Flujo funciona igual
- [ ] YouTube accesible tras sincronización

---

### 2.9: Solicitud inapropiada

**Contexto**: Un alumno travieso solicita `instagram.com`

**Acciones**:
1. Alumno solicita con motivo: "Quiero ver fotos"
2. Pedro recibe notificación
3. Pedro ve que es instagram.com
4. Pedro rechaza con motivo: "Red social no permitida en horario escolar"

**Verificaciones**:
- [ ] Pedro puede rechazar
- [ ] El alumno ve el rechazo
- [ ] El motivo del rechazo es visible

---

## FASE 3: Cambio de Clase (10:00 - 10:05)

### 3.1: Fin de clase de Pedro

**Contexto**: La hora de Pedro termina, entra Carlos con Matemáticas

**Verificaciones automáticas**:
- [ ] El sistema detecta el cambio de horario
- [ ] El grupo activo cambia de `ciencias-3eso` a `matematicas-3eso`
- [ ] Las máquinas sincronizan la nueva whitelist

---

### 3.2: Dominios aprobados para Ciencias ya no aplican

**Verificaciones**:
- [ ] Wikipedia sigue disponible (si está en base-centro)
- [ ] O se bloquea (si solo estaba en ciencias-3eso)
- [ ] YouTube ídem

---

### 3.3: Carlos inicia su clase

**Acciones de Carlos**:
1. Abre su dashboard de profesor (primer uso)
2. Inicia sesión con las credenciales que María le dio
3. Ve su grupo `matematicas-3eso`

**Verificaciones**:
- [ ] Carlos puede ver sus solicitudes
- [ ] No ve solicitudes de otros grupos
- [ ] Dashboard funciona correctamente

---

## FASE 4: Segunda Clase de Pedro (11:00 - 12:00)

### 4.1: Pedro en otra aula

**Contexto**: Pedro tiene clase en Aula Informática 2

**Acciones de Pedro**:
1. Va al Aula 2
2. Verifica que el grupo activo es `ciencias-3eso`

**Verificaciones**:
- [ ] Reserva activa correcta
- [ ] Grupo sincronizado

---

### 4.2: Los dominios aprobados antes están disponibles

**Contexto**: Wikipedia y YouTube fueron aprobados en la primera clase

**Verificaciones**:
- [ ] Los dominios aprobados para el grupo persisten
- [ ] Los alumnos pueden acceder directamente
- [ ] No hace falta solicitar de nuevo

---

## FASE 5: Incidencia Durante el Día (12:30)

### 5.1: Máquina offline

**Contexto**: El PC-05 del Aula 1 se apaga por un problema eléctrico

**Acciones de María** (cuando lo detecta):
1. Revisa el dashboard de Health
2. Ve que PC-05 aparece como "offline"

**Verificaciones**:
- [ ] Alerta visible de máquina offline
- [ ] Última conexión registrada
- [ ] Fácil identificar el problema

---

### 5.2: María investiga

**Acciones**:
1. Hace clic en PC-05 para ver detalles
2. Ve que dejó de reportar hace 15 minutos

**Verificaciones**:
- [ ] Información de diagnóstico útil
- [ ] Puede identificar si es problema de red o hardware

---

## FASE 6: Fin del Día (14:00)

### 6.1: María revisa actividad del día

**Acciones**:
1. Navega a Solicitudes
2. Filtra por "Hoy" o las últimas 24 horas

**Verificaciones**:
- [ ] Ve todas las solicitudes del día
- [ ] Cuántas aprobadas vs rechazadas
- [ ] Qué dominios fueron más solicitados

---

### 6.2: María añade dominio permanente

**Contexto**: Wikipedia se solicita constantemente, decide añadirla a base-centro

**Acciones**:
1. Navega a Dominios/Whitelist
2. Añade `wikipedia.org` a la whitelist base

**Verificaciones**:
- [ ] Dominio añadido al grupo base
- [ ] Ya no será necesario aprobarla nunca más
- [ ] Se propagará a todas las máquinas

---

### 6.3: María bloquea dominio problemático

**Contexto**: Los alumnos han solicitado `juegos-online.com` varias veces

**Acciones**:
1. Navega a Dominios Bloqueados
2. Añade `juegos-online.com` a la lista negra

**Verificaciones**:
- [ ] Dominio añadido a bloqueados
- [ ] Los profesores ya no podrán aprobarlo
- [ ] El mensaje será claro si alguien lo solicita

---

### 6.4: María revoca permisos temporales (si aplica)

**Contexto**: Si el sistema tiene aprobaciones temporales, revisar cuáles expiran

**Verificaciones**:
- [ ] Aprobaciones temporales visibles (si existe la feature)
- [ ] Expiración clara

---

## FASE 7: Preparación para el Día Siguiente

### 7.1: Pedro crea reserva para mañana

**Acciones de Pedro**:
1. Abre sección de Reservas
2. Crea reserva para mañana:
   - Aula: Informática 1
   - Grupo: ciencias-3eso
   - Hora: 10:00-11:00

**Verificaciones**:
- [ ] Reserva creada correctamente
- [ ] Visible en el calendario
- [ ] El grupo se activará automáticamente

---

### 7.2: María verifica estado final

**Acciones**:
1. Revisa dashboard de Health
2. Verifica que todas las máquinas sincronizaron

**Verificaciones**:
- [ ] 34/35 máquinas online (PC-05 sigue offline)
- [ ] Última sincronización de cada una < 5 minutos
- [ ] Sistema listo para mañana

---

## Resumen del Flujo E2E

### Timeline del Día

```
08:00 │ María revisa dashboard, todo OK
      │ 
09:00 │ Pedro inicia clase en Aula 1
      │ ↳ Ana solicita Wikipedia
      │ ↳ Pedro aprueba (< 60s)
      │ ↳ Ana accede a Wikipedia
      │ ↳ Pedro aprueba YouTube
      │ ↳ Pedro rechaza Instagram
      │
10:00 │ Cambio de clase: Carlos (Matemáticas)
      │ ↳ Grupo activo cambia automáticamente
      │
11:00 │ Pedro en Aula 2
      │ ↳ Dominios aprobados persisten
      │
12:30 │ María detecta PC-05 offline
      │
14:00 │ María revisa actividad
      │ ↳ Añade Wikipedia a base-centro
      │ ↳ Bloquea juegos-online.com
      │
14:30 │ Pedro crea reserva para mañana
```

### Métricas del Día

| Métrica | Valor | Target | ✓/✗ |
|---------|-------|--------|-----|
| Solicitudes totales | X | - | - |
| Aprobadas por profesores | X | >70% | ⬜ |
| Tiempo promedio aprobación | Xs | <60s | ⬜ |
| Solicitudes escaladas a Admin | X | <10% | ⬜ |
| Máquinas online | 34/35 | >95% | ⬜ |
| Incidencias críticas | 1 | 0 | ⬜ |

---

## Checklist de Integración E2E

### Flujo Admin → Sistema
- [ ] Dashboard muestra datos en tiempo real
- [ ] Gestión de usuarios funciona
- [ ] Gestión de aulas funciona
- [ ] Whitelist se sincroniza

### Flujo Profesor → Alumno
- [ ] Profesor ve solicitudes de sus grupos
- [ ] Aprobación llega al agente
- [ ] El alumno puede acceder tras aprobación

### Flujo Alumno → Profesor
- [ ] Extensión detecta bloqueos
- [ ] Solicitud llega al servidor
- [ ] Profesor recibe notificación push

### Sistema → Sistema
- [ ] Reservas cambian grupo activo
- [ ] Agentes sincronizan periódicamente
- [ ] Watchdog detecta fallos
- [ ] Health reports llegan al dashboard

---

## Casos de Fallo a Probar

### F1: Servidor API caído

**Simular**:
1. Detener el servidor API
2. Alumno intenta solicitar
3. Profesor intenta aprobar

**Verificaciones**:
- [ ] Mensaje de error claro
- [ ] Los agentes siguen funcionando con caché
- [ ] El sistema se recupera al restaurar API

---

### F2: Pérdida de conexión del profesor

**Simular**:
1. Profesor está aprobando
2. Pierde conexión WiFi
3. Reconecta

**Verificaciones**:
- [ ] La aprobación pendiente se puede reintentar
- [ ] No se pierde información
- [ ] Mensaje de error adecuado

---

### F3: Todos los agentes desconectados

**Simular**:
1. Apagar la red del aula
2. Verificar comportamiento

**Verificaciones**:
- [ ] Agentes usan whitelist cacheada
- [ ] Dashboard muestra offline
- [ ] Al reconectar, sincronizan

---

## Resultado Final

### Tests Ejecutados

| Fase | Tests | Pasados | Fallidos |
|------|-------|---------|----------|
| 1. Inicio día | 3 | ⬜ | ⬜ |
| 2. Primera clase | 9 | ⬜ | ⬜ |
| 3. Cambio clase | 3 | ⬜ | ⬜ |
| 4. Segunda clase | 2 | ⬜ | ⬜ |
| 5. Incidencia | 2 | ⬜ | ⬜ |
| 6. Fin día | 4 | ⬜ | ⬜ |
| 7. Preparación | 2 | ⬜ | ⬜ |
| Casos fallo | 3 | ⬜ | ⬜ |
| **TOTAL** | **28** | ⬜ | ⬜ |

### Veredicto E2E

- [ ] ✅ **APROBADO**: El sistema funciona como un todo integrado
- [ ] ⚠️ **PARCIAL**: Funciona con algunos problemas menores
- [ ] ❌ **FALLIDO**: Hay problemas críticos de integración

---

## Captura de Evidencias

Incluir screenshots/recordings de:
1. Dashboard al inicio del día
2. Flujo completo de solicitud/aprobación
3. Cambio de grupo automático
4. Dashboard de health
5. Cualquier error encontrado
