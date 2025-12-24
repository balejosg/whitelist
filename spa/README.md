# OpenPath SPA (Single Page Application)

Web dashboard for managing DNS whitelist and domain access requests.

## Features

✅ **No backend required** - Client-side via GitHub API
✅ **Dual authentication** - GitHub OAuth or JWT email/password
✅ Multiple group management
✅ Rule editor (whitelist, blocked subdomains, blocked paths)
✅ Automatic commit of changes
✅ Compatible with dnsmasq clients
✅ Deployable on GitHub Pages
✅ Modern dark theme

## Quick Start

```bash
# Serve locally
cd spa
python -m http.server 8080
# Open http://localhost:8080
```

## Architecture

The SPA uses vanilla JavaScript with ES6 modules. No build step required.

### Module Structure

```
spa/js/
├── app.js              # Standalone version (legacy)
└── modules/            # Modular ES6 version
    ├── app-core.js     # Init, auth, UI setup
    ├── classrooms.js   # Classroom CRUD operations
    ├── groups.js       # Group management
    ├── main.js         # Event listeners, entry point
    ├── requests.js     # Domain request handling
    ├── schedules.js    # Reservation scheduling
    ├── state.js        # Global application state
    ├── ui.js           # Screen, modal, tabs
    ├── users.js        # User management (admin)
    └── utils.js        # Toast, escapeHtml, helpers
```

### External API Clients

```
spa/js/
├── auth.js            # JWT authentication
├── classrooms-api.js  # Classrooms REST client
├── config.js          # Local storage config
├── github-api.js      # GitHub API client
├── oauth.js           # GitHub OAuth flow
├── push.js            # Push notifications
├── requests-api.js    # Domain requests client
├── schedules-api.js   # Schedules REST client
├── users-api.js       # Users REST client
└── whitelist-parser.js # Whitelist file parser
```

## Initial Configuration

1. Generate a Personal Access Token:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scope `repo` (for public repos: `public_repo`)
   - Copy the generated token

2. Open the SPA in browser

3. Configure:
   - **Token**: Your PAT
   - **User/Org**: Your username or organization
   - **Repository**: Repo name
   - **Branch**: `main` (or your branch)
   - **Directory**: `grupos` (where .txt files are)

## File Format

Each `.txt` file represents a group:

```ini
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

## URL for dnsmasq Clients

Clients can obtain the whitelist from:

```
https://raw.githubusercontent.com/{user}/{repo}/main/grupos/{group}.txt
```

## Testing

```bash
# E2E tests with Playwright
npm run test:e2e

# With browser UI
npm run test:e2e:headed
```

## Technologies

- HTML/CSS/JavaScript vanilla (ES6 modules)
- GitHub REST API v3
- No frameworks or external dependencies

## License

AGPL-3.0 - See [LICENSING.md](../LICENSING.md)
