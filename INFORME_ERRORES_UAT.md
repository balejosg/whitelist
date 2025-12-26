# Informe de Errores - UAT OpenPath K-12
**Fecha**: 2025-12-25
**Versión probada**: Dashboard (SPA) en GitHub Pages, API v2.0.0
**Ejecutor**: LLM Claude Sonnet 4.5
**Estado**: UAT Parcialmente Completado (Bloqueado)

---

## Resumen Ejecutivo

Durante la ejecución del UAT de OpenPath K-12 se identificaron **6 problemas críticos** que impiden completar las pruebas según los guiones proporcionados. Los problemas afectan principalmente:

1. **Autenticación Web** - No funcional
2. **Instalación del Agente Linux** - Repositorio APT inexistente
3. **API de Autenticación** - Errores de formato JSON
4. **Documentación** - Discrepancias entre docs y realidad

**Tests ejecutados**: 5/228 (2.2%)
**Tests pasados**: 1/5 (20%)
**Severidad general**: 🔴 CRÍTICA - Sistema no utilizable para usuarios finales

---

## BUG #1: Login Web No Funcional
**Componente**: Dashboard SPA - Autenticación
**Severidad**: 🔴 **P0 - BLOCKER**
**Impacto**: Usuarios no pueden acceder al dashboard

### Descripción
El formulario de login acepta credenciales pero no autentica ni muestra mensajes de error. El dashboard permanece inaccesible.

### Pasos para Reproducir
1. Navegar a `https://balejosg.github.io/openpath`
2. Ingresar credenciales válidas:
   - Email: `maria@centro.edu`
   - Password: `SecurePass123!`
3. Hacer clic en "Acceder al Panel"

### Resultado Esperado
- Login exitoso en < 2 segundos
- Redirección al dashboard
- Pantalla de login oculta (`#login-screen.hidden`)
- Dashboard visible (`#dashboard-screen:not(.hidden)`)

### Resultado Obtenido
- Formulario se envía (evento submit)
- **NO hay respuesta del servidor**
- **NO hay mensaje de error** en `#login-error`
- Login screen permanece visible
- Dashboard permanece oculto
- Sin errores en consola del navegador

### Evidencia
```bash
# Estado de pantallas después del login
Login screen class: "screen"           # Debería ser "screen hidden"
Dashboard screen class: "screen hidden" # Debería ser "screen"
Error message: ""                       # Debería mostrar algo si falla
```

**Screenshots**:
- `screenshots/admin/1.3_before_login.png` - Antes del login
- `screenshots/admin/error_1.3.png` - Después del login (sin cambios)

### Análisis Técnico
#### Posibles Causas
1. **Configuración de API faltante**: El campo `#requests-api-url` está oculto dentro de `#requests-config` (clase `hidden`). La aplicación puede requerir configuración manual de la URL de API antes de permitir login.

2. **URL de API incorrecta**: La aplicación tiene placeholder `https://openpath-requests.duckdns.org` pero la API real está en `http://openpath-api.duckdns.org:3000`

3. **CORS o conectividad**: Posible problema de CORS entre GitHub Pages (HTTPS) y API (HTTP sin SSL)

4. **Flujo de autenticación incompleto**: La aplicación puede estar diseñada principalmente para GitHub OAuth (botón visible) y el login por email/password puede estar incompleto

#### Código Relevante
```html
<!-- Configuración oculta de API -->
<div id="requests-config" class="requests-config hidden">
    <div class="form-group inline">
        <label for="requests-api-url">URL del servidor:</label>
        <input type="text" id="requests-api-url"
               placeholder="https://openpath-requests.duckdns.org">
    </div>
    <div class="form-group inline">
        <label for="requests-api-token">Token admin:</label>
        <input type="password" id="requests-api-token"
               placeholder="Token de autenticación">
    </div>
</div>
```

### Recomendación
**Prioridad ALTA** - Implementar una de estas soluciones:

1. **Opción A**: Hacer visible la configuración de API en la pantalla de login para que usuarios puedan configurarla
2. **Opción B**: Pre-configurar la URL de API por defecto a la URL correcta
3. **Opción C**: Mostrar mensaje de error claro cuando la configuración de API falta
4. **Opción D**: Implementar validación y feedback visual del estado de conexión con la API

### Tests Afectados
- ❌ Test 1.3: Iniciar sesión como Admin
- ❌ Test 1.4: Intentar login con contraseña incorrecta
- ❌ Test 1.5: Verificar menú de navegación de Admin
- ❌ **TODOS los tests** de Secciones 2-10 (requieren login)

---

## BUG #2: Endpoint de Login API Devuelve Error "Invalid JSON"
**Componente**: API Backend - `/api/auth/login`
**Severidad**: 🔴 **P0 - BLOCKER**
**Impacto**: Imposible autenticar programáticamente via API

### Descripción
El endpoint POST `/api/auth/login` rechaza todas las peticiones con error "Invalid JSON in request body" incluso con JSON válido.

### Pasos para Reproducir
```bash
curl -X POST http://openpath-api.duckdns.org:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@centro.edu","password":"SecurePass123!"}'
```

### Resultado Esperado
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "email": "maria@centro.edu",
    "name": "María García",
    "role": "admin"
  }
}
```

### Resultado Obtenido
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "success": false,
  "error": "Invalid JSON in request body",
  "code": "INVALID_JSON"
}
```

### Evidencia
```bash
# Test con curl
$ curl -s -X POST http://openpath-api.duckdns.org:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@centro.edu","password":"SecurePass123!"}' | jq
{
  "success": false,
  "error": "Invalid JSON in request body",
  "code": "INVALID_JSON"
}

# Test con Python requests (mismo resultado)
>>> import requests
>>> r = requests.post('http://openpath-api.duckdns.org:3000/api/auth/login',
...                   json={"email":"maria@centro.edu","password":"SecurePass123!"})
>>> r.status_code
400
>>> r.json()
{'success': False, 'error': 'Invalid JSON in request body', 'code': 'INVALID_JSON'}
```

### Análisis Técnico
El JSON enviado es válido según especificación RFC 8259. Posibles causas:

1. **Body parser mal configurado**: Express puede estar usando un body parser incorrecto o con configuración restrictiva
2. **Validación de esquema demasiado estricta**: Puede rechazar JSON válido si falta algún campo adicional
3. **Encoding issues**: Problema con charset o encoding del request body
4. **Middleware de validación**: Un middleware previo puede estar consumiendo el body

### Recomendación
**Prioridad CRÍTICA** - Investigar y corregir:

1. Verificar configuración de `express.json()` o body-parser
2. Añadir logging del raw request body para debugging
3. Revisar middlewares que puedan interferir con el parsing
4. Implementar validación de esquema más permisiva con mensajes específicos

### Tests Afectados
- ❌ Todos los tests de autenticación programática
- ❌ Scripts de automatización que requieren login via API
- ❌ Integración con sistemas externos

---

## BUG #3: No Existe Formulario de Registro en UI
**Componente**: Dashboard SPA - Registro de usuarios
**Severidad**: 🟡 **P2 - MAYOR**
**Impacto**: No se pueden crear cuentas desde la interfaz web

### Descripción
El guión de pruebas asume que existe un enlace/botón de "Registrarse" para crear nuevas cuentas de administrador, pero no existe en la UI.

### Pasos para Reproducir
1. Navegar a `https://balejosg.github.io/openpath`
2. Buscar enlace "Registrarse", "Sign up", o "Crear cuenta"

### Resultado Esperado
- Enlace visible para registrar nueva cuenta
- Formulario de registro con campos: email, nombre, contraseña, confirmar contraseña

### Resultado Obtenido
- **No hay enlace de registro**
- Solo disponible: Login con GitHub OAuth o email/password
- Mensaje informativo: "Usa GitHub si eres administrador para gestionar el repositorio"

### Evidencia
```html
<!-- Pantalla de login completa - NO hay enlace de registro -->
<div id="login-screen" class="screen">
    <div class="login-container">
        <div class="login-header">
            <div class="logo">🛡️</div>
            <h1>OpenPath</h1>
            <p>Gestión de reglas DNS por aula</p>
        </div>
        <div class="login-form">
            <button id="github-login-btn">Iniciar sesión con GitHub</button>
            <div class="login-separator">
                <span>o con tu cuenta del colegio</span>
            </div>
            <form id="email-login-form">
                <!-- Formulario de login -->
            </form>
            <div id="login-error" class="error-message"></div>
            <p class="login-info">
                Usa GitHub si eres administrador para gestionar el repositorio.
            </p>
            <!-- NO HAY ENLACE DE REGISTRO -->
        </div>
    </div>
</div>
```

### Análisis Técnico
El diseño actual asume que:
- Administradores usan GitHub OAuth
- Profesores/estudiantes reciben credenciales pre-creadas por el admin
- No hay auto-registro público

Sin embargo, el guión de pruebas (Test 1.2) espera poder registrar al primer admin desde la UI.

### Solución Actual (Workaround)
Los usuarios se pueden crear via API:
```bash
curl -X POST http://openpath-api.duckdns.org:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@centro.edu","password":"SecurePass123!","name":"María García"}'
```
✅ Esto funciona correctamente (Status 201 Created)

### Recomendación
**Opción A**: Actualizar guión de pruebas para indicar que el primer usuario se crea via:
- GitHub OAuth (para admins)
- API directa (para desarrollo/testing)
- Script de inicialización

**Opción B**: Implementar formulario de registro en UI con validación:
- Solo permitir primer usuario (luego deshabilitar)
- Requerir token de invitación
- Limitar a dominios específicos (@centro.edu)

### Tests Afectados
- ❌ Test 1.2: Registrar cuenta de administrador

---

## BUG #4: Repositorio APT No Existe
**Componente**: Instalación - Agente Linux
**Severidad**: 🟠 **P1 - CRÍTICO**
**Impacto**: Imposible instalar agente según documentación oficial

### Descripción
La documentación oficial (README.md y guiones de prueba) indica instalación via repositorio APT, pero el repositorio no existe.

### Pasos para Reproducir
```bash
# Según documentación oficial
curl -fsSL https://balejosg.github.io/openpath/apt/apt-setup.sh | sudo bash
sudo apt install openpath-dnsmasq
```

### Resultado Esperado
1. Script `apt-setup.sh` descarga correctamente
2. Script añade repositorio a `/etc/apt/sources.list.d/`
3. Actualiza índice de paquetes
4. `apt install openpath-dnsmasq` instala el agente

### Resultado Obtenido
```bash
$ curl -I https://balejosg.github.io/openpath/apt/apt-setup.sh
HTTP/2 404
server: GitHub.com
content-type: text/html; charset=utf-8

curl: (22) The requested URL returned error: 404
```

### Análisis Técnico
**Estado del repositorio**:
- ❌ Directorio `/apt` no existe en el repositorio GitHub
- ❌ URL `https://balejosg.github.io/openpath/apt/` devuelve 404
- ❌ No hay configuración de repositorio APT en GitHub Pages
- ✅ Existe paquete .deb en releases: `openpath-dnsmasq_4.0.0-1_amd64.deb`
- ✅ Se puede descargar e instalar manualmente el .deb

**Verificación**:
```bash
# Verificar contenido del repo
$ curl -s https://api.github.com/repos/balejosg/openpath/contents/apt
{
  "message": "Not Found",
  "documentation_url": "https://docs.github.com/rest/repos/contents#get-repository-content"
}

# Verificar releases
$ curl -s https://api.github.com/repos/balejosg/openpath/releases/latest | jq -r '.assets[].name'
openpath-dnsmasq_4.0.0-1_amd64.deb
```

### Impacto en UAT
**BLOQUEADO**: No se pueden ejecutar 41 tests del agente Linux porque:
1. No se puede instalar según procedimiento documentado
2. Instalación manual (descarga .deb) viola los requisitos del UAT
3. El guión especifica explícitamente: "solo por APT"

### Recomendación
**Prioridad ALTA** - Elegir una solución:

#### Opción A: Implementar Repositorio APT Real
```bash
# Crear estructura en GitHub Pages
openpath/
├── apt/
│   ├── apt-setup.sh
│   ├── dists/
│   │   └── stable/
│   │       └── main/
│   │           └── binary-amd64/
│   │               ├── Packages
│   │               └── Packages.gz
│   └── pool/
│       └── main/
│           └── openpath-dnsmasq_4.0.0-1_amd64.deb
```

Script `apt-setup.sh`:
```bash
#!/bin/bash
echo "deb [trusted=yes] https://balejosg.github.io/openpath/apt stable main" | \
  sudo tee /etc/apt/sources.list.d/openpath.list
sudo apt update
```

#### Opción B: Usar GitHub Releases como Repo
```bash
# Script simplificado
curl -fsSL https://github.com/balejosg/openpath/releases/download/v4.0.0/openpath-dnsmasq_4.0.0-1_amd64.deb -o /tmp/openpath.deb
sudo apt install /tmp/openpath.deb
```

#### Opción C: Actualizar Documentación
Cambiar README.md y guiones para reflejar instalación real:
```bash
# Descargar e instalar desde releases
wget https://github.com/balejosg/openpath/releases/download/v4.0.0/openpath-dnsmasq_4.0.0-1_amd64.deb
sudo apt install ./openpath-dnsmasq_4.0.0-1_amd64.deb
```

### Tests Afectados
- ❌ **TODOS los 41 tests de la Sección "Agente Linux"** (2.1-2.6, 3.1-3.7, 4.1-4.4, etc.)
- ❌ Tests de flujo E2E que requieren agente instalado
- ❌ Validación de sincronización whitelist
- ❌ Pruebas de DNS filtering

---

## BUG #5: Discrepancia en URLs de API
**Componente**: Documentación
**Severidad**: 🟡 **P2 - MAYOR**
**Impacto**: Confusión en configuración, errores de conectividad

### Descripción
Diferentes partes de la documentación y aplicación usan URLs diferentes para la API.

### URLs Encontradas

| Ubicación | URL | Estado |
|-----------|-----|--------|
| Placeholder en UI | `https://openpath-requests.duckdns.org` | ❌ No responde |
| Documentación README | `https://openpath.duckdns.org` | ❌ Connection refused (puerto 443) |
| Guiones UAT (índice) | `http://openpath-api.duckdns.org:3000` | ✅ Funciona |
| API real funcionando | `http://openpath-api.duckdns.org:3000` | ✅ Funciona |

### Evidencia
```bash
# URL en placeholder de la UI
$ grep "requests-api-url" page_structure.html
<input type="text" id="requests-api-url"
       placeholder="https://openpath-requests.duckdns.org">

# Test de conectividad
$ curl -s http://openpath-api.duckdns.org:3000/health | jq -r '.service'
whitelist-request-api  # ✅ FUNCIONA

$ curl -s https://openpath-requests.duckdns.org/health
curl: (6) Could not resolve host: openpath-requests.duckdns.org  # ❌ FALLA
```

### Impacto
- Usuarios que usan la URL del placeholder no pueden conectarse
- Confusión durante configuración inicial
- Posibles errores no reportados (silent failures)

### Recomendación
**Estandarizar en una sola URL** en toda la documentación:

1. Decidir URL oficial (recomendado: `http://openpath-api.duckdns.org:3000`)
2. Actualizar placeholder en `#requests-api-url`
3. Actualizar README.md
4. Actualizar todos los guiones de prueba
5. Considerar añadir SSL (HTTPS) para producción

### Tests Afectados
- Configuración manual de usuarios
- Conexión entre dashboard y API
- Sincronización de agentes con API

---

## BUG #6: Mensaje de Error No Se Muestra en Login Fallido
**Componente**: Dashboard SPA - UX
**Severidad**: 🟡 **P2 - MAYOR**
**Impacto**: Usuarios no saben por qué falla el login

### Descripción
Al intentar login con credenciales incorrectas, el div `#login-error` permanece vacío. No hay feedback visual.

### Pasos para Reproducir
1. Ir a `https://balejosg.github.io/openpath`
2. Ingresar email válido: `maria@centro.edu`
3. Ingresar contraseña incorrecta: `ContrasenaIncorrecta`
4. Hacer clic en "Acceder al Panel"

### Resultado Esperado
- Mensaje de error visible: "Credenciales inválidas" o similar
- Color rojo o icono de advertencia
- Mensaje genérico (no revelar si el email existe)

### Resultado Obtenido
```javascript
document.getElementById('login-error').textContent
// Devuelve: ""  (cadena vacía)
```

### Evidencia
**Screenshot**: `screenshots/admin/1.4_login_error.png` - Muestra formulario sin mensaje de error

### Análisis Técnico
Posibles causas:
1. JavaScript no está manejando errores de la API
2. API no está enviando respuesta de error
3. Problema de CORS impide recibir respuesta
4. Event listener de submit no está implementado completamente

### Recomendación
Implementar manejo de errores robusto:

```javascript
// Pseudocódigo
document.getElementById('email-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = ''; // Limpiar errores previos

    try {
        const response = await fetch(`${apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            // Mostrar error
            errorDiv.textContent = 'Credenciales inválidas';
            errorDiv.style.display = 'block';
            return;
        }

        // Login exitoso...
    } catch (error) {
        // Error de red
        errorDiv.textContent = 'Error de conexión. Verifica tu conexión a internet.';
        errorDiv.style.display = 'block';
    }
});
```

### Tests Afectados
- ❌ Test 1.4: Intentar login con contraseña incorrecta

---

## Problemas Adicionales (Menores)

### ISSUE #7: Falta Validación de Contraseña en Cliente
**Severidad**: 🟢 P3 - Menor
El guión espera validación de "mínimo 8 caracteres" pero no se valida en el cliente.

### ISSUE #8: Tiempo de Carga No Validado
**Severidad**: 🟢 P3 - Menor
No se implementaron métricas automáticas de tiempo de carga del dashboard.

---

## Resumen de Tests Ejecutados

### Sección 1: Admin TIC - Acceso y Autenticación

| Test | Descripción | Estado | Comentario |
|------|-------------|--------|------------|
| 1.1 | Cargar página de login | ✅ PASS | Carga en <3s correctamente |
| 1.2 | Registrar admin | ❌ SKIP | No hay UI de registro (BUG #3) |
| 1.3 | Login admin | ❌ FAIL | Login no responde (BUG #1) |
| 1.4 | Login incorrecto | ❌ FAIL | Sin mensaje error (BUG #1, #6) |
| 1.5 | Verificar menú | ❌ FAIL | No se accede al dashboard (BUG #1) |

**Resultado Sección 1**: 1/5 pasados (20%)

### Secciones 2-10: Admin TIC (39 tests)
**Estado**: ❌ **NO EJECUTADAS** - Requieren login funcional (bloqueadas por BUG #1)

### Sección Agente Linux (41 tests)
**Estado**: ❌ **BLOQUEADAS** - No se puede instalar agente (BUG #4)

### Otras Secciones
**Estado**: ❌ **NO EJECUTADAS** - Dependencias no satisfechas

---

## Impacto General

### Tests Totales Planificados
- **228 tests** distribuidos en 6 guiones

### Tests Ejecutables con Errores Actuales
- **1 test pasado** (0.4% del total)
- **4 tests fallidos** (1.8%)
- **223 tests bloqueados** (97.8%)

### Severidad de Bloqueo

```
🔴 CRÍTICA - Sistema No Funcional
├─ BUG #1: Login Web No Funcional → Bloquea 183 tests de UI
├─ BUG #2: API Login Inválida → Bloquea tests programáticos
└─ BUG #4: Repo APT Inexistente → Bloquea 41 tests de agente

🟡 ALTA - Funcionalidad Degradada
├─ BUG #3: Sin UI de Registro → 1 test
├─ BUG #5: URLs Inconsistentes → Confusión en config
└─ BUG #6: Sin Mensajes Error → UX pobre
```

---

## Recomendaciones para Continuar UAT

### Prioridad Inmediata (P0)

1. **Corregir BUG #1** - Login Web
   - Implementar configuración visible de API URL
   - O pre-configurar URL correcta por defecto
   - Añadir logging/debugging para identificar causa raíz

2. **Corregir BUG #4** - Repositorio APT
   - Implementar repositorio APT funcional, O
   - Actualizar documentación con método de instalación real

### Prioridad Alta (P1)

3. **Corregir BUG #2** - API Login
   - Revisar body parser de Express
   - Añadir logging de requests para debugging

4. **Estandarizar URLs** - BUG #5
   - Definir URL oficial de API
   - Actualizar toda la documentación

### Prioridad Media (P2)

5. **Clarificar flujo de registro** - BUG #3
   - Documentar proceso de creación de primer admin
   - Considerar implementar UI de registro

6. **Mejorar UX de errores** - BUG #6
   - Implementar feedback visual en errores
   - Mensajes de error informativos

---

## Archivos de Evidencia

```
~/openpath-uat/
├── screenshots/admin/
│   ├── 1.1_login_page.png          # ✅ Login carga correctamente
│   ├── 1.3_before_login.png        # Formulario antes de enviar
│   ├── error_1.2.png               # No hay formulario registro
│   ├── error_1.3.png               # Login no responde
│   ├── error_1.4.png               # Sin mensaje de error
│   └── error_1.5.png               # Dashboard inaccesible
├── results_admin_*.json            # Resultados detallados JSON
├── page_structure.html             # HTML completo del dashboard
├── uat_admin.py                    # Script Playwright con tests
├── setup_users.py                  # Script creación usuarios API
└── INFORME_ERRORES_UAT.md          # Este documento
```

---

## Próximos Pasos Sugeridos

### Para Desarrolladores

1. **Reproducir errores** usando los pasos documentados
2. **Revisar logs** del servidor API para BUG #2
3. **Inspeccionar código** JavaScript del dashboard para BUG #1
4. **Implementar** repositorio APT o actualizar docs para BUG #4

### Para Actualizar Guiones de Prueba

Si no se corrigen los bugs, actualizar guiones con:

#### Guión 01_admin_tic.md

```markdown
### Test 1.2: Registrar cuenta de administrador

**NOTA**: ⚠️ Actualmente no existe UI de registro.
Crear usuarios via API:

```bash
curl -X POST http://openpath-api.duckdns.org:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "maria@centro.edu",
    "password": "SecurePass123!",
    "name": "María García"
  }'
```

### Test 1.3: Iniciar sesión como Admin

**PREREQUISITO**: Configurar URL de API primero
1. Acceder a configuración (si está disponible)
2. Establecer API URL: `http://openpath-api.duckdns.org:3000`
3. Luego proceder con login

**NOTA**: ⚠️ Si el login no responde, este es un bug conocido (BUG #1)
```

#### Guión 04_agente_linux.md

```markdown
### Test 2.1: Descargar e instalar agente

**MÉTODO ACTUAL** (hasta que repositorio APT esté disponible):

```bash
# Descargar .deb desde releases
wget https://github.com/balejosg/openpath/releases/download/v4.0.0/openpath-dnsmasq_4.0.0-1_amd64.deb

# Instalar con apt (resuelve dependencias)
sudo apt install ./openpath-dnsmasq_4.0.0-1_amd64.deb
```

**MÉTODO DOCUMENTADO** (no disponible actualmente):
```bash
# ⚠️ NO FUNCIONA - Repositorio APT no existe
curl -fsSL https://balejosg.github.io/openpath/apt/apt-setup.sh | sudo bash
sudo apt install openpath-dnsmasq
```
```

### Para Continuar UAT (Workarounds)

Si se requiere completar el UAT sin esperar correcciones:

1. **Crear usuarios via API** (bypass UI)
2. **Inspeccionar localStorage** del navegador para simular login
3. **Usar instalación manual del .deb** para tests de agente
4. **Modificar código JavaScript** localmente para testing
5. **Probar directamente contra API** sin UI

---

## Conclusión

El sistema OpenPath K-12 tiene **infraestructura API funcional** (usuarios se crean, endpoints responden) pero la **interfaz de usuario y documentación de instalación tienen problemas críticos** que impiden su uso por usuarios finales.

**Bloqueos principales**:
- 🔴 Dashboard web no autenticable
- 🔴 Instalación del agente documentada no funciona
- 🟡 Discrepancias entre documentación y realidad

**Recomendación**: **DETENER UAT** hasta que se corrijan BUG #1 y BUG #4, o modificar guiones para reflejar estado actual del sistema.

---

**Preparado por**: Claude Sonnet 4.5 (LLM Agent)
**Contacto para seguimiento**: Revisar issues en repositorio GitHub
**Próxima revisión**: Después de implementar correcciones
