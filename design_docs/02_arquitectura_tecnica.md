# Arquitectura Técnica y APIs

## 1. Estructura de la Extensión (Manifest V2/V3)

Recomendamos usar **Manifest V2** por su madurez o **Manifest V3** si se busca longevidad, pero dado que solo necesitamos observar (no bloquear activamente desde la extensión), V3 con `webRequest` (non-blocking) es suficiente y compatible.

### Componentes Principales
1. **Manifest.json**: Definición de permisos.
2. **Background Script (Service Worker en V3)**: Escucha eventos de red globalmente.
3. **Popup (Browser Action)**: Interfaz de usuario para mostrar resultados.
4. **Runtime Storage**: Almacenamiento temporal de los errores capturados.

## 2. Permisos Requeridos

```json
{
  "permissions": [
    "webRequest",
    "tabs",
    "storage" // Opcional si persistimos configuración
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

Es necesario `<all_urls>` para poder escuchar errores en cualquier dominio, incluidos los iframes de terceros y CDNs.

## 3. Lógica de Detección (Background Script)

El núcleo de la lógica reside en el evento `browser.webRequest.onErrorOccurred`.

### Flujo de Datos
1. El usuario navega a una URL.
2. El navegador intenta resolver DNS y conectar.
3. **Escenario de Bloqueo (DNSmasq/Hosts):**
   - El sistema devuelve `NXDOMAIN` o `0.0.0.0`.
   - Firefox dispara `onErrorOccurred` con `error: "NS_ERROR_UNKNOWN_HOST"` o `error: "NS_ERROR_CONNECTION_REFUSED"`.
4. **Captura:**
   - El script captura el evento.
   - Extrae el `tabId` y la `url`.
   - Parsea el dominio (hostname) de la URL.
   - Almacena el dominio en un objeto en memoria: `blockedDomains[tabId] = Set(dominios)`.
   - Actualiza el "Badge" (contador rojo) en el icono de la extensión para esa pestaña.

### Filtrado de Ruido
Es importante ignorar errores generados por la propia cancelación del usuario (`NS_BINDING_ABORTED`). Nos interesan específicamente:
- `NS_ERROR_UNKNOWN_HOST` (Típico de bloqueo DNS).
- `NS_ERROR_CONNECTION_REFUSED` (Típico de bloqueo por Firewall/IP).
- `NS_ERROR_NET_TIMEOUT` (Típico de paquetes descartados/DROP).

## 4. Gestión de Estado
- **Al cargar una página (`onBeforeNavigate` en top-level):** Limpiar la lista de errores para ese `tabId`.
- **Al cerrar pestaña (`onRemoved`):** Eliminar la entrada del objeto en memoria para evitar fugas de memoria.
