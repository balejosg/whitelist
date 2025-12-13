# OAuth Worker

Cloudflare Worker para manejar OAuth con GitHub.

## Setup

### 1. Registrar GitHub OAuth App

1. Ve a https://github.com/settings/developers
2. Click "New OAuth App"
3. Completa:
   - **Application name**: Whitelist Manager
   - **Homepage URL**: https://balejosg.github.io/whitelist
   - **Authorization callback URL**: `https://whitelist-oauth.<TU_SUBDOMINIO>.workers.dev/auth/callback`
4. Guarda Client ID y Client Secret

### 2. Desplegar Worker

```bash
cd oauth-worker
npm install

# Configurar secretos
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put WORKER_URL  # https://whitelist-oauth.<TU_SUBDOMINIO>.workers.dev

# Desplegar
npm run deploy
```

### 3. Actualizar SPA

En `whitelist-web-static/js/oauth.js`, actualiza `WORKER_URL` con la URL de tu Worker desplegado.

### 4. Redesplegar SPA

```bash
git checkout gh-pages
cp ../whitelist-web-static/* . -r
git add .
git commit -m "Add OAuth support"
git push
```

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `GITHUB_CLIENT_ID` | Client ID de la OAuth App |
| `GITHUB_CLIENT_SECRET` | Client Secret de la OAuth App |
| `WORKER_URL` | URL pública del worker |
| `FRONTEND_URL` | URL de la SPA (configurado en wrangler.toml) |
