# OAuth Worker

Cloudflare Worker para manejar OAuth con GitHub.

## Setup

### 1. Registrar GitHub OAuth App

1. Ve a https://github.com/settings/developers
2. Click "New OAuth App"
3. Completa:
   - **Application name**: OpenPath (o tu nombre)
   - **Homepage URL**: Tu URL del SPA
   - **Authorization callback URL**: `https://<TU_WORKER>.<TU_SUBDOMINIO>.workers.dev/auth/callback`
4. Guarda Client ID y Client Secret

### 2. Configurar wrangler.toml

Edita `wrangler.toml` y configura `FRONTEND_URL` con la URL de tu SPA.

### 3. Desplegar Worker

```bash
cd auth-worker
npm install

# Configurar secretos
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put WORKER_URL  # https://<TU_WORKER>.<TU_SUBDOMINIO>.workers.dev

# Desplegar
npm run deploy
```

### 4. Configurar SPA

En el navegador, configura la URL del worker:
```javascript
localStorage.setItem('openpath-oauth-worker', 'https://<TU_WORKER>.<TU_SUBDOMINIO>.workers.dev')
```

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `GITHUB_CLIENT_ID` | Client ID de la OAuth App (secreto) |
| `GITHUB_CLIENT_SECRET` | Client Secret de la OAuth App (secreto) |
| `WORKER_URL` | URL pública del worker (secreto) |
| `FRONTEND_URL` | URL de la SPA (en wrangler.toml) |
