# Whitelist Request API

Home server REST API for handling domain whitelist requests.

## Overview

This is a lightweight Express.js server designed to run on your home network (Raspberry Pi, old PC, NAS with Docker). It handles domain requests from the Firefox extension and provides an admin API to approve/reject requests.

## Architecture

```
Firefox Extension → Home Server (this API) → GitHub Repository
                         ↓
                    Admin Dashboard
```

## Quick Start

### 1. Install dependencies

```bash
cd whitelist-request-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your settings
```

Required settings:
- `ADMIN_TOKEN`: Secret token for admin endpoints
- `GITHUB_TOKEN`: GitHub Personal Access Token (with repo write access)
- `GITHUB_OWNER`: GitHub username/org owning the whitelist repo
- `GITHUB_REPO`: Repository name

### 3. Run the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 4. Test it

```bash
# Health check
curl http://localhost:3000/health

# Submit a request
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "reason": "Testing"}'

# List requests (admin)
curl http://localhost:3000/api/requests \
  -H "Authorization: Bearer your-admin-token"
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api` | API documentation |
| POST | `/api/requests` | Submit domain request |
| GET | `/api/requests/status/:id` | Check request status |

### Admin Endpoints (require `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/requests` | List all requests |
| GET | `/api/requests/:id` | Get request details |
| POST | `/api/requests/:id/approve` | Approve & push to GitHub |
| POST | `/api/requests/:id/reject` | Reject request |
| DELETE | `/api/requests/:id` | Delete request |
| GET | `/api/requests/groups/list` | List whitelist groups |

## Request/Response Examples

### Submit Request

```bash
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "docs.google.com",
    "reason": "Need Google Docs for class project",
    "requester_email": "student@school.edu",
    "group_id": "informatica-3"
  }'
```

Response:
```json
{
  "success": true,
  "request_id": "req_a1b2c3d4",
  "status": "pending",
  "domain": "docs.google.com",
  "message": "Request created, waiting for admin approval",
  "created_at": "2025-12-17T10:30:00.000Z"
}
```

### Approve Request

```bash
curl -X POST http://localhost:3000/api/requests/req_a1b2c3d4/approve \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"group_id": "informatica-3"}'
```

Response:
```json
{
  "success": true,
  "message": "Domain docs.google.com approved and added to informatica-3",
  "domain": "docs.google.com",
  "group_id": "informatica-3",
  "status": "approved"
}
```

## Deployment

### Option A: Direct (recommended for testing)

```bash
npm start
```

### Option B: PM2 (production)

```bash
npm install -g pm2
pm2 start server.js --name whitelist-api
pm2 save
pm2 startup
```

### Option C: Docker

```bash
docker build -t whitelist-request-api .
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  whitelist-request-api
```

### Option D: Systemd service

Create `/etc/systemd/system/whitelist-request-api.service`:

```ini
[Unit]
Description=Whitelist Request API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/whitelist-request-api
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/pi/whitelist-request-api/.env

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable whitelist-request-api
sudo systemctl start whitelist-request-api
```

## Network Setup

### 1. Static local IP

Set a static IP for your server in your router's DHCP settings.

### 2. DuckDNS

Already configured (Phase 1). Your domain points to your public IP.

### 3. Port forwarding

Forward port 443 (or 3000) from your router to your server's local IP.

### 4. SSL (Phase 3)

For HTTPS, use Caddy or nginx with Let's Encrypt.

## Files

```
whitelist-request-api/
├── server.js           # Main entry point
├── package.json        # Dependencies
├── .env.example        # Environment template
├── .env                # Your configuration (git-ignored)
├── routes/
│   └── requests.js     # API endpoints
├── lib/
│   ├── storage.js      # JSON file persistence
│   └── github.js       # GitHub API client
└── data/
    └── requests.json   # Stored requests
```

## Security Notes

1. **ADMIN_TOKEN**: Generate a secure token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. **GITHUB_TOKEN**: Create at https://github.com/settings/tokens with `repo` scope
3. **CORS**: In production, set `CORS_ORIGINS` to your specific domains
4. **HTTPS**: Always use HTTPS in production (see Phase 3)

## Continuous Deployment

This API is automatically deployed to production on every push to `main` that modifies files in `whitelist-request-api/`. The GitHub Actions workflow handles:
- Pulling latest code
- Installing dependencies
- Restarting the service
- Health check verification

# Retry deployment
# Test CD after SSH fix
