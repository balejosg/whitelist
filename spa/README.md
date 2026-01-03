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

## Architecture

The SPA is built with **TypeScript**, compiled to ES Module JavaScript for the browser.

### Module Structure

```
spa/src/
├── main.ts             # Application entry point
├── modules/
│   ├── app-core.ts     # Core logic
│   ├── ui.ts           # UI Management
│   ├── schedules.ts    # Schedule management
│   └── ...
├── trpc.ts             # tRPC Client definition
└── types/              # Shared types
```

### External API Clients

The application uses **tRPC** (via `@trpc/client`) for most server communication, providing end-to-end type safety.

```
spa/src/
├── trpc.ts            # tRPC Client instance
├── auth.ts            # Authentication logic
├── github-api.ts      # GitHub API client (direct)
└── ...
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
# Smoke tests (14 critical tests, fast)
npx playwright test --grep @smoke --project=chromium

# All E2E tests (279+ tests)
npm run test:e2e

# With browser UI
npm run test:e2e:headed

# Single spec
npx playwright test e2e/auth.spec.ts
```

CI runs smoke tests on every PR. Full suite runs on main, nightly, or with `e2e` label.

## Technologies

- HTML/CSS/JavaScript vanilla (ES6 modules)
- GitHub REST API v3
- No frameworks or external dependencies

## License

AGPL-3.0 - See [LICENSING.md](../LICENSING.md)
