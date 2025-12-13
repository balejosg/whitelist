# Diseño de Interfaz de Usuario (UI/UX)

## 1. Icono y Notificaciones (Badge)
- **Estado Normal:** Icono gris o verde si no hay errores detectados.
- **Estado Alerta:** Si se detectan dominios bloqueados en la pestaña activa, se superpone un "Badge" (texto pequeño sobre el icono) con el número de dominios únicos fallidos (ej. "3", "12").
- **Color:** Rojo (`#FF0000`) para indicar bloqueo crítico.

## 2. Popup (Al hacer clic)

El popup es una ventana pequeña HTML/CSS/JS.

### Layout Propuesto
```
+--------------------------------------------------+
|  Monitor de Bloqueos                         [x] |  <- Header
+--------------------------------------------------+
| Pestaña: nytimes.com                             |  <- Contexto
+--------------------------------------------------+
| Dominios Bloqueados (5):                         |  <- Lista
|                                                  |
|  [!] cdn.optimizely.com                          |  <- Item
|      (NS_ERROR_UNKNOWN_HOST)                     |
|                                                  |
|  [!] tracking.google-analytics.com               |
|      (NS_ERROR_CONNECTION_REFUSED)               |
|                                                  |
|  ...                                             |
+--------------------------------------------------+
| [ Copiar Lista ]    [ Limpiar ]                  |  <- Acciones
+--------------------------------------------------+
```

### Funcionalidades del Popup
1. **Listado:**
   - Debe mostrar solo el `hostname` (no la URL completa para reducir ruido), a menos que el usuario pida detalles.
   - Debe de-duplicar: Si fallan 10 imágenes de `cdn.test.com`, solo mostrar `cdn.test.com` una vez.
   - Opcional: Mostrar el tipo de error técnico al pasar el mouse (tooltip).

2. **Acción Principal: "Copiar Lista"**
   - **Objetivo:** Permitir al usuario pegar esto rápidamente en una terminal.
   - **Formato:** Texto plano, un dominio por línea.
   - **Ejemplo de copiado:**
     ```
     cdn.optimizely.com
     tracking.google-analytics.com
     ```
   - Esto permite usar un pipe o pegar directamente en el script `whitelist-cmd.sh`.

3. **Acción Secundaria: "Añadir a Whitelist" (Avanzado)**
   - Si se integra con Native Messaging (más complejo), podría ejecutar el script directamente. Para esta versión v1, nos limitaremos al portapapeles.

## 3. Estilos
- Minimalista.
- Fuente monoespaciada para los dominios (facilita lectura técnica).
- Indicadores visuales claros de error (iconos de advertencia).
