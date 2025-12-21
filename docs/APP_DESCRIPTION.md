# Análisis de Mercado: Descripción Técnica del Sistema "OpenPath"

Este documento contiene una descripción detallada de la aplicación "OpenPath" basada estrictamente en el análisis de su código fuente. Su propósito es servir como referencia para el análisis de mercado y benchmarking.

## 1. Resumen del Producto

**OpenPath** es una solución integral para la gestión centralizada de acceso a internet en entornos controlados (probablemente aulas educativas o laboratorios corporativos). El sistema opera bajo un modelo de "lista blanca" (whitelist), donde todo el tráfico está bloqueado por defecto excepto los dominios explícitamente permitidos.

Se distingue por delegar la aplicación de reglas a los clientes finales (endpoints) mientras centraliza la gestión y el monitoreo en un panel web moderno.

## 2. Arquitectura del Sistema

El sistema se compone de cuatro pilares fundamentales:

1. **API de Gestión de Solicitudes (`whitelist-request-api`)**:
   - Backend centralizado (Node.js/Express).
   - Gestiona las peticiones de desbloqueo de los usuarios.
   - Recibe reportes de salud (telemetría) de los clientes.
   - Se integra con GitHub para la persistencia de datos (GitOps).

2. **Dashboard Administrativo (`dashboard` + `spa`)**:
   - Portal web para administradores y usuarios.
   - Permite la gestión visual de grupos de reglas y dominios.
   - Interface para aprobar/rechazar solicitudes.
   - Dashboard de monitoreo de estado de la red.

3. **Agentes de Endpoint (Linux/Windows)**:
   - Scripts de sistema (`bash`/`powershell`) que se ejecutan en las máquinas de los usuarios.
   - `watchdog`: Monitorea la integridad del filtrado y reporta el estado al API central.
   - Aplicación de reglas a nivel de DNS (dnsmasq) y Firewall.

4. **Almacenamiento y Sincronización**:
   - Uso de **GitHub** como backend de almacenamiento para las listas de reglas (archivos `.txt` en el repositorio).
   - Base de datos local (SQLite) en el Dashboard para gestión de sesiones y caché.

## 3. Funcionalidades Clave

### A. Gestión de Acceso (Filtering)

El sistema permite una granularidad alta en el control de acceso:

- **Whitelist**: Dominios permitidos explícitamente.
- **Blocked Subdomains**: Bloqueo específico de subdominios dentro de dominios permitidos.
- **Blocked Paths**: Restricción de rutas específicas URL (funcionalidad avanzada, probablemente vía proxy o inspección).
- **Grupos**: Capacidad de crear perfiles de filtrado distintos (ej. "clase-matematicas", "examen-final") y asignarlos a diferentes conjuntos de máquinas.

### B. Flujo de Solicitudes (User-Admin Loop)

Soluciona la fricción típica de las whitelists mediante un sistema de autoservicio:

1. El usuario intenta acceder a un sitio bloqueado.
2. Envía una solicitud desde el portal (`POST /api/requests`).
3. El administrador recibe la solicitud en el Dashboard.
4. **Aprobación/Rechazo**: Si se aprueba, el sistema actualiza automáticamente el repositorio (Git commit), lo que propaga el cambio a todos los clientes.
5. **Auto-Inclusión**: Existe lógica para aprobar automáticamente ciertos dominios bajo condiciones específicas (validación de token y origen), ideal para recursos incrustados dinámicos.

### C. Monitoreo y Telemetría (Health Reports)

El sistema no es "fire and forget". Los agentes clientes reportan activamente:

- **Estado**: OK, WARNING, CRITICAL, FAIL_OPEN (cuando el filtro falla y deja pasar todo).
- **Estado de Servicios**: Si `dnsmasq` está corriendo y resolviendo.
- **Alertas**: El Dashboard muestra qué máquinas tienen problemas o han dejado de reportar (stale hosts).

### D. Seguridad y Administración

- **Autenticación**:
  - Usuarios/Admins vía **GitHub OAuth**.
  - Tokens de API para comunicación entre servicios.
  - "Shared Secret" para autenticar reportes de los clientes.
- **Rate Limiting**: Protección contra abuso en los endpoints públicos de solicitud.
- **Modo Pánico**: Botón de "Sistema Activo/Desactivado" en el Dashboard para deshabilitar el filtrado globalmente en caso de emergencia.

## 4. Diferenciadores Tecnológicos (para el Analista)

- **Enfoque GitOps**: Al usar un repositorio como base de datos de reglas, se obtiene un historial de auditoría perfecto (quién aprobó qué y cuándo) y rollback sencillo.
- **Resiliencia**: Los clientes descargan las listas; si el servidor central cae, el filtrado sigue funcionando con la última versión conocida.
- **Transparencia**: El usuario final puede ver el estado de su solicitud.

## 5. Público Objetivo Inferido

Instituciones educativas (K-12, Universidades) o centros de examen donde:

1. Se requiere bloqueo estricto por defecto.
2. Los profesores/instructores necesitan autonomía para desbloquear recursos rápidamente.
3. Se gestionan múltiples aulas con necesidades diferentes.
