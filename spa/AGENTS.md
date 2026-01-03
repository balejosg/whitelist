# SPA AGENTS.md

Vanilla TypeScript SPA. No framework. ES modules. Deployed to GitHub Pages.

## Structure

```
spa/
├── src/
│   ├── main.ts        # Entry point
│   ├── modules/       # Feature modules (app-core, ui, schedules)
│   ├── trpc.ts        # tRPC client for API
│   ├── github-api.ts  # Direct GitHub API calls
│   └── types/         # Local type extensions
├── e2e/               # Playwright E2E tests
├── css/style.css      # All styles (1900+ lines, dark/light themes)
└── index.html         # Single HTML file with all screens
```

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | All UI structure (screens, modals) |
| `css/style.css` | Complete styling, theme system |
| `src/main.ts` | App initialization, routing |
| `src/trpc.ts` | Type-safe API client |
| `src/config.ts` | Runtime configuration |
| `src/auth.ts` | JWT/OAuth authentication |

## Conventions

- **No framework**: Vanilla DOM manipulation
- **ES Modules**: Browser-native imports
- **Types**: Extend `@openpath/shared`, don't duplicate
- **Console**: Use `lib/logger.ts` wrapper, not raw `console.*`

## Testing

```bash
npm run test:e2e              # All Playwright tests
npm run test:e2e:headed       # With browser UI
npx playwright test --grep "blocked-domain"  # Single test
```

E2E config: `playwright.config.ts` (visual regression: 0.2% threshold)

## Build

```bash
npm run build   # Compiles TS → dist/
npm run dev     # Watch mode
```

No bundler - browser loads ES modules directly.

## Anti-Patterns

- Adding framework dependencies
- Direct `console.*` (use logger)
- Duplicating shared schemas locally
- Inline styles (use CSS file)
