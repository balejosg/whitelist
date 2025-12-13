# Whitelist Web Manager

Portal web para gestionar reglas de whitelist DNS, sustituyendo el fichero alojado en GitHub.

## Características

✅ Gestión de múltiples aulas/grupos  
✅ Editor de reglas (whitelist, subdominios bloqueados, paths bloqueados)  
✅ Exportación automática en formato compatible con dnsmasq  
✅ Autenticación básica  
✅ Interfaz moderna con tema oscuro  

## Requisitos

- Node.js 18+ o Docker

## Instalación Rápida

### Con Docker (Recomendado)

```bash
cd whitelist-web

# Copiar configuración (opcional)
export ADMIN_PASSWORD="tu-contraseña-segura"

# Construir y ejecutar
docker compose up -d

# Ver logs
docker compose logs -f
```

### Sin Docker

```bash
cd whitelist-web

# Instalar dependencias
npm install

# Configurar contraseña admin (opcional)
export ADMIN_PASSWORD="tu-contraseña-segura"

# Ejecutar
npm start
```

## Acceso

- URL: `http://localhost:3000`
- Usuario: `admin`
- Contraseña: `admin123` (o la configurada en `ADMIN_PASSWORD`)

> ⚠️ **Importante**: Cambia la contraseña por defecto antes de exponer a internet.

## Uso

### 1. Crear un grupo/aula

1. Accede al dashboard
2. Click en "Nuevo grupo"
3. Introduce el identificador (ej: `informatica-3`) y nombre visible

### 2. Añadir dominios a la whitelist

1. Click en el grupo creado
2. En la pestaña "Whitelist", click en "+ Añadir"
3. Introduce el dominio (ej: `google.com`)

### 3. Configurar los clientes

Actualiza la URL en el script `install.sh` o configura cada cliente:

```bash
sudo whitelist --set-url "http://tu-servidor:3000/export/informatica-3.txt"
```

O modifica `/var/lib/url-whitelist/whitelist-url.conf` con la nueva URL.

## API

| Endpoint | Descripción |
|----------|-------------|
| `GET /export/:nombre.txt` | Descarga whitelist (público) |
| `POST /api/auth/login` | Autenticación |
| `GET /api/groups` | Listar grupos |
| `POST /api/groups` | Crear grupo |
| `GET /api/groups/:id/rules` | Listar reglas |
| `POST /api/groups/:id/rules` | Añadir regla |
| `DELETE /api/rules/:id` | Eliminar regla |

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servidor | 3000 |
| `ADMIN_PASSWORD` | Contraseña inicial del admin | admin123 |
| `SESSION_SECRET` | Secreto para sesiones | auto-generado |
| `DATA_DIR` | Directorio de datos | ./data |

## Estructura

```
whitelist-web/
├── server/
│   ├── index.js       # Servidor Express
│   └── db.js          # Base de datos SQLite
├── public/
│   ├── index.html     # SPA
│   ├── css/style.css  # Estilos
│   └── js/app.js      # JavaScript
├── data/              # Datos persistentes
│   ├── whitelist.db   # Base de datos
│   └── export/        # Ficheros TXT generados
├── Dockerfile
└── docker-compose.yml
```

## Despliegue en Producción

### Con nginx (proxy inverso + SSL)

```nginx
server {
    listen 443 ssl;
    server_name whitelist.tu-dominio.org;
    
    ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Con DuckDNS

Si ya tienes DuckDNS configurado:

```bash
# Exponer puerto 3000 en el router
# Actualizar URL en clientes:
http://tu-subdominio.duckdns.org:3000/export/informatica-3.txt
```

## Migrar desde GitHub

1. Descarga el fichero actual de GitHub
2. Crea un grupo con el mismo nombre
3. Usa "Añadir múltiples" para importar dominios
4. Actualiza la URL en los clientes

## Licencia

MIT
