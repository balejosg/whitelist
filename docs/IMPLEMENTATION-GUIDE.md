# OpenPath Implementation Guide for AI Assistants

This document provides context and instructions for AI assistants continuing quality improvement work on the OpenPath codebase.

## Project Context

OpenPath is a multi-platform DNS-based URL whitelist enforcement system (v4.1.0) for educational environments. It uses DNS sinkhole technology to restrict network access.

**Tech Stack:**
- Linux shell scripts (bash) with dnsmasq/iptables
- Windows PowerShell with Acrylic DNS Proxy
- Node.js/TypeScript monorepo (npm workspaces)
- PostgreSQL + Drizzle ORM
- tRPC API layer
- Zod schema validation

## Completed Work

### Phase 0: Initial Quality Fixes (DONE)

1. **Logging Standardization in API** - Replaced 34 `console.*` calls with Winston logger
   - Files modified: `api/src/lib/auth.ts`, `api/src/lib/push.ts`, `api/src/db/index.ts`, `api/src/trpc/routers/push.ts`, `api/src/server.ts`
   - Logger module: `api/src/lib/logger.ts` (Winston with JSON format, request ID correlation)

2. **Windows CI Integration** - Added to `.github/workflows/ci.yml`
   - PSScriptAnalyzer linting
   - Pester tests (windows/tests/)
   - Created `windows/tests/Pre-Install-Validation.ps1`

3. **Coverage Infrastructure**
   - Created `codecov.yml` for Codecov integration
   - Added coverage badges to `README.md`
   - Added c8 coverage to `dashboard/package.json`

4. **Version Sync** - Updated to 4.1.0 in `linux/lib/common.sh`, `CLAUDE.md`, `docs/ADR.md`

### Phase 1: Testing Coverage (DONE)

1. **Shared Package Tests** - Validated `shared/tests/schemas.test.ts`
   - Covers all Zod schemas (Enums, Entities, DTOs)
   - 65 tests passing

2. **Auth-Worker Tests** - Created `auth-worker/tests/worker.test.ts`
   - Covers cookie utilities (`getCookie`, `serializeCookie`)
   - Covers OAuth flow (`handleLogin`, `handleCallback`) with mocks
   - 33 tests passing

3. **GitHub API Tests** - Created `api/tests/github.test.ts`
   - Covers `getFileContent` and `updateFile`
   - Mocks `node:https` to prevent network requests
   - 4 tests passing

4. **Security Tests** - Expanded `api/tests/security.test.ts`
   - Added Rate Limiting tests (enforced by environment hacking)
   - Added Authorization Boundary tests (Student/Teacher role checks)
   - 13 tests passing

---

## Remaining Work (Gap Analysis)

### Gap 1: Console Logging in Non-API Packages

**Status:** DONE

Browser/Extension logging has been migrated to `lib/logger.ts` wrappers.
Dashboard uses Winston.

### Gap 2: Testing Coverage

**Status:** DONE (See Phase 1 above)

#### 2.1 Shared Package Tests

Create `shared/tests/schemas.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    DomainSchema,
    RequestStatus,
    RequestPriority,
    UserRole,
    DomainRequest,
    User,
    SafeUser,
    CreateRequestDTO,
    CreateUserDTO,
    LoginDTO,
    // ... other schemas
} from '../src/schemas/index.js';

describe('Enum Schemas', () => {
    describe('RequestStatus', () => {
        it('accepts valid values', () => {
            assert.doesNotThrow(() => RequestStatus.parse('pending'));
            assert.doesNotThrow(() => RequestStatus.parse('approved'));
            assert.doesNotThrow(() => RequestStatus.parse('rejected'));
        });

        it('rejects invalid values', () => {
            assert.throws(() => RequestStatus.parse('invalid'));
        });
    });
    // Similar for RequestPriority, UserRole, MachineStatus, HealthStatus
});

describe('DomainSchema', () => {
    it('accepts valid domains', () => {
        const valid = ['google.com', 'sub.domain.co.uk', '*.example.com', 'a-b.test.org'];
        valid.forEach(d => assert.doesNotThrow(() => DomainSchema.parse(d)));
    });

    it('rejects invalid domains', () => {
        const invalid = ['', 'a', '-invalid.com', 'no_underscores.com', 'double..dots.com', '.startdot.com'];
        invalid.forEach(d => assert.throws(() => DomainSchema.parse(d)));
    });

    it('enforces max length (253 chars)', () => {
        const longDomain = 'a'.repeat(250) + '.com';
        assert.throws(() => DomainSchema.parse(longDomain));
    });

    it('enforces label max length (63 chars)', () => {
        const longLabel = 'a'.repeat(64) + '.com';
        assert.throws(() => DomainSchema.parse(longLabel));
    });
});

describe('Entity Schemas', () => {
    describe('DomainRequest', () => {
        it('validates complete request object', () => {
            const validRequest = {
                id: 'req-123',
                domain: 'example.com',
                reason: 'For testing',
                requesterEmail: 'test@example.com',
                groupId: 'group-1',
                priority: 'normal',
                status: 'pending',
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
                resolvedAt: null,
                resolvedBy: null,
            };
            assert.doesNotThrow(() => DomainRequest.parse(validRequest));
        });
    });
    // Similar for User, SafeUser, Role, Classroom, Machine, Schedule, etc.
});

describe('DTO Schemas', () => {
    describe('CreateRequestDTO', () => {
        it('accepts minimal valid input', () => {
            assert.doesNotThrow(() => CreateRequestDTO.parse({ domain: 'example.com' }));
        });

        it('accepts full valid input', () => {
            const full = {
                domain: 'example.com',
                reason: 'Need for research',
                requesterEmail: 'user@school.edu',
                groupId: 'class-a',
                priority: 'high',
            };
            assert.doesNotThrow(() => CreateRequestDTO.parse(full));
        });

        it('rejects invalid email', () => {
            assert.throws(() => CreateRequestDTO.parse({
                domain: 'example.com',
                requesterEmail: 'not-an-email',
            }));
        });
    });

    describe('CreateUserDTO', () => {
        it('validates password requirements', () => {
            assert.throws(() => CreateUserDTO.parse({
                email: 'test@example.com',
                name: 'Test User',
                password: 'short', // < 8 chars
            }));
        });
    });

    describe('LoginDTO', () => {
        it('requires valid email and password', () => {
            assert.doesNotThrow(() => LoginDTO.parse({
                email: 'user@example.com',
                password: 'password123',
            }));
        });
    });
});
```

Update `shared/package.json`:

```json
{
    "scripts": {
        "test": "node --import tsx --test tests/*.test.ts",
        "test:coverage": "c8 node --import tsx --test tests/*.test.ts"
    },
    "devDependencies": {
        "tsx": "^4.7.0",
        "c8": "^10.1.3"
    }
}
```

#### 2.2 Auth-Worker Tests

Create `auth-worker/tests/worker.test.ts`:

```typescript
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

// Test helper functions (export them from worker.ts or extract to utils)
describe('Cookie Functions', () => {
    describe('getCookie', () => {
        it('extracts cookie value from header', () => {
            const mockRequest = {
                headers: {
                    get: (name: string) => name === 'Cookie' ? 'session=abc123; other=value' : null
                }
            } as unknown as Request;
            // Test implementation
        });

        it('returns undefined for missing cookie', () => {
            // Test implementation
        });

        it('handles URL-encoded values', () => {
            // Test implementation
        });
    });

    describe('serializeCookie', () => {
        it('creates valid Set-Cookie header', () => {
            // Test implementation
        });

        it('includes all security attributes', () => {
            // Test implementation
        });
    });
});

describe('OAuth Flow', () => {
    describe('handleLogin', () => {
        it('redirects to GitHub with correct params', () => {
            // Test implementation
        });

        it('sets state cookie', () => {
            // Test implementation
        });
    });

    describe('handleCallback', () => {
        it('validates state parameter', () => {
            // Test implementation
        });

        it('handles missing code error', () => {
            // Test implementation
        });

        it('handles GitHub API errors', () => {
            // Test implementation
        });
    });
});
```

**Note:** Auth-worker tests require mocking fetch and crypto.randomUUID. Consider using `miniflare` for Cloudflare Worker testing:

```bash
npm install -D miniflare vitest
```

#### 2.3 GitHub API Tests

Create `api/tests/github.test.ts` to test `api/src/lib/github.ts`:

- Test `getWhitelistContent()`
- Test `updateWhitelistFile()`
- Test `validateGitHubToken()`
- Test error handling for rate limits, auth failures

#### 2.4 Security Tests

Expand `api/tests/security.test.ts`:

```typescript
describe('Authorization Boundaries', () => {
    it('prevents students from approving requests', async () => {
        // Login as student, attempt to approve request
    });

    it('prevents cross-group access', async () => {
        // Teacher in group A cannot access group B requests
    });

    it('enforces rate limiting on auth endpoints', async () => {
        // Make 11 requests, verify 429 response
    });
});
```

---

### Gap 3: Documentation (JSDoc)

**Status:** DONE

Added comprehensive JSDoc to:
- `api/src/lib/github.ts`
- `api/src/lib/push.ts`
- `api/src/lib/classroom-storage.ts`
- `api/src/lib/user-storage.ts`
- `api/src/lib/role-storage.ts`

### Gap 4: Hardcoded Configuration

**Status:** DONE

Configuration extracted to `api/src/config.ts`.
Key components (`server.ts`, `user-storage.ts`, `push.ts`) updated to use `config`.

### Gap 5: Type Safety Standardization

**Status:** DONE

Standardized `tsconfig.json` across packages with strict settings:
- `strict`: true
- `exactOptionalPropertyTypes`: true
- `noUncheckedIndexedAccess`: true
- `strictPropertyInitialization`: true

Updated code in `dashboard` and `spa` to handle stricter types.

### Gap 6: tRPC Documentation

**Status:** DONE

Options:
1. **trpc-openapi** - Auto-generate OpenAPI from tRPC schemas
2. **Manual README section** - Document each procedure
3. **Typedoc** - Generate from JSDoc comments

Implemented: Added JSDoc to tRPC routers (`requests`, `auth`).

---

## File Structure Reference

```
openpath/
├── api/                    # Express + tRPC API
│   ├── src/
│   │   ├── db/            # Drizzle ORM
│   │   ├── lib/           # Business logic (needs JSDoc)
│   │   │   ├── logger.ts  # Winston logger (reference implementation)
│   │   │   ├── auth.ts    # ✓ Logging migrated
│   │   │   ├── push.ts    # ✓ Logging migrated
│   │   │   └── github.ts  # Needs tests
│   │   ├── trpc/routers/  # API endpoints
│   │   └── server.ts      # ✓ Logging migrated
│   └── tests/             # Existing tests
├── shared/                # Zod schemas
│   ├── src/schemas/       # Schema definitions
│   └── tests/             # Schema tests
├── auth-worker/           # Cloudflare Worker
│   ├── src/worker.ts      # OAuth implementation
│   └── tests/             # Worker tests
├── spa/                   # Static SPA
│   └── src/lib/           # Shared libraries (logger, etc.)
├── firefox-extension/     # Browser extension
│   └── src/lib/           # Shared libraries (logger, etc.)
├── dashboard/             # Express dashboard
│   └── src/lib/           # Shared libraries (logger, etc.)
├── linux/                 # Shell scripts
│   └── lib/               # Modular bash libraries
├── windows/               # PowerShell scripts
│   └── tests/             # Pester tests
└── docs/
    ├── IMPLEMENTATION-GUIDE.md  # THIS FILE
    └── ADR.md                   # Architecture decisions
```

---

## Verification Commands

After making changes, run these commands to verify:

```bash
# Static Verification (Lint + Typecheck)
npm run verify

# Individual checks
npm run lint                    # ESLint all packages
npm run typecheck               # TypeScript all packages
npm run test                    # All tests

# Package-specific
npm run test --workspace=@openpath/api
npm run test --workspace=@openpath/shared
npm run test --workspace=@openpath/dashboard

# Shell tests
cd tests && bats *.bats

# Windows tests (on Windows or CI)
Invoke-Pester -Path windows/tests
```

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Simple browser loggers (not Winston) | Browser environment, no file I/O needed |
| Winston for dashboard | Node.js server-side rendering |
| c8 for coverage (not nyc) | Better ESM support, faster |
| Node test runner (not Jest) | Native, zero config, good enough |
| Keep console in CLI scripts | User feedback during interactive operations |

---

## Quality Metrics Target

| Metric | Current | Target |
|--------|---------|--------|
| Console calls in production | 53 | 0 |
| Packages with tests | 4/6 | 6/6 |
| Packages with coverage | 2/6 | 5/6 |
| Functions with JSDoc | ~20% | 80% |
| Hardcoded config values | 25+ | 0 |

---

## Getting Started (For AI Assistants)

1. Read `CLAUDE.md` for project overview
2. Check this guide for remaining work
3. Pick a gap category to work on
4. Use `npm run verify` after changes
5. Update this guide with progress

**Priority Order:**
1. Gap 2 (Testing) - Highest impact on reliability
2. Gap 1 (Logging) - Consistency across packages
3. Gap 4 (Config) - Security and maintainability
4. Gap 3 (JSDoc) - Developer experience
5. Gap 5 (Types) - Minor improvements
6. Gap 6 (tRPC docs) - API consumers
