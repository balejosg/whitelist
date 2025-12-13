# Whitelist Web Static

SPA estática para gestionar reglas de whitelist DNS directamente en GitHub, sin backend.

## Características

✅ **Sin backend** - Todo client-side via GitHub API  
✅ Gestión de múltiples grupos  
✅ Editor de reglas (whitelist, subdominios, paths bloqueados)  
✅ Commit automático de cambios  
✅ Compatible con clientes dnsmasq  
✅ Desplegable en GitHub Pages  
✅ Tema oscuro moderno  

## Requisitos

- Un repositorio GitHub
- Personal Access Token (PAT) con permisos `repo`
- Navegador moderno

## Instalación

### Opción 1: GitHub Pages (Recomendado)

1. Copia el contenido de `whitelist-web-static/` a tu repositorio
2. Crea el directorio `grupos/` con al menos un archivo `.txt`
3. Activa GitHub Pages desde Settings → Pages → Branch: main / docs

### Opción 2: Servidor local

```bash
cd whitelist-web-static
python -m http.server 8080
# Abrir http://localhost:8080
```

## Configuración Inicial

1. Genera un Personal Access Token:
   - Ve a https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Selecciona scope `repo` (para repos públicos: `public_repo`)
   - Copia el token generado

2. Abre la SPA en el navegador

3. Configura:
   - **Token**: Tu PAT
   - **Usuario/Org**: Tu usuario o organización
   - **Repositorio**: Nombre del repo
   - **Rama**: `main` (o la que uses)
   - **Directorio**: `grupos` (donde están los .txt)

## Estructura del Repo

```
tu-repo/
├── grupos/
│   ├── informatica-1.txt
│   ├── informatica-2.txt
│   └── laboratorio.txt
└── whitelist-web-static/  (o en rama gh-pages)
    ├── index.html
    ├── css/style.css
    └── js/*.js
```

## Formato de Archivos

Cada archivo `.txt` representa un grupo:

```
## WHITELIST
google.com
youtube.com
wikipedia.org

## BLOCKED-SUBDOMAINS
ads.google.com
tracking.example.com

## BLOCKED-PATHS
facebook.com/games
```

## URL para Clientes dnsmasq

Los clientes pueden obtener la whitelist desde:

```
https://raw.githubusercontent.com/{usuario}/{repo}/main/grupos/{grupo}.txt
```

Ejemplo:
```bash
whitelist --set-url "https://raw.githubusercontent.com/mi-usuario/whitelist/main/grupos/informatica-1.txt"
```

## Seguridad

⚠️ El token se almacena en `localStorage` del navegador. Esto significa:
- Solo es accesible desde el mismo origen
- Se elimina al limpiar datos del navegador
- **No compartas tu token**

## Migración desde whitelist-web (Node.js)

1. Exporta los grupos desde la versión anterior
2. Coloca los archivos `.txt` en el directorio `grupos/`
3. Actualiza las URLs en los clientes

## Tecnologías

- HTML/CSS/JavaScript vanilla
- GitHub REST API v3
- Sin frameworks ni dependencias

## Licencia

MIT
