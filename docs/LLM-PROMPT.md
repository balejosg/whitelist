# LLM Continuation Prompt

Copy and paste this prompt to continue quality improvement work on OpenPath:

---

## Prompt

```
You are continuing quality improvement work on the OpenPath project, a DNS-based URL whitelist system.

## Context
- Project: Multi-platform DNS whitelist enforcement (Linux/Windows)
- Tech: TypeScript monorepo, PostgreSQL, tRPC, Zod, shell scripts
- Location: Read CLAUDE.md for full project overview

## Your Task
Continue implementing the gap analysis fixes. Read these files first:
1. `CLAUDE.md` - Project overview and architecture
2. `docs/IMPLEMENTATION-GUIDE.md` - Detailed implementation plan with code examples

## Remaining Work (in priority order)

### Critical - Testing (Phase 1)
- [ ] Create `shared/tests/schemas.test.ts` - Test all Zod schemas
- [ ] Create `auth-worker/tests/worker.test.ts` - Test OAuth flow
- [ ] Create `api/tests/github.test.ts` - Test GitHub API integration
- [ ] Expand `api/tests/security.test.ts` - Authorization boundary tests

### High - Logging (Phase 2)
- [ ] Create `spa/src/lib/logger.ts` - Browser logger wrapper
- [ ] Create `firefox-extension/src/lib/logger.ts` - Extension logger
- [ ] Create `dashboard/src/lib/logger.ts` - Winston logger
- [ ] Replace 26 console calls in spa/
- [ ] Replace 19 console calls in firefox-extension/
- [ ] Replace 3 console calls in dashboard/

### Medium - Infrastructure (Phase 3)
- [ ] Add c8 coverage to spa/package.json
- [ ] Add c8 coverage to firefox-extension/package.json
- [ ] Standardize tsconfig.json settings across packages

### Low - Documentation (Phase 4)
- [ ] Extract hardcoded config to environment variables
- [ ] Add JSDoc to api/src/lib/*.ts functions

## Rules
1. Read existing code before modifying
2. Follow patterns in IMPLEMENTATION-GUIDE.md
3. Run `npm run verify` after changes
4. Keep changes minimal and focused
5. Update IMPLEMENTATION-GUIDE.md status when completing tasks

## Verification Commands
```bash
npm run verify                    # Full lint + typecheck
npm run test --workspace=@openpath/shared   # After adding shared tests
cd tests && bats *.bats          # Shell tests
```

## Start By
1. Read CLAUDE.md and docs/IMPLEMENTATION-GUIDE.md
2. Pick ONE task from the list above
3. Implement it following the guide's code examples
4. Verify with npm run verify
5. Report what you completed

Which task would you like me to work on?
```

---

## Alternative: Specific Task Prompts

### For Testing Work
```
Continue OpenPath quality work. Focus on TESTING only.

Read docs/IMPLEMENTATION-GUIDE.md section "Gap 2: Testing Coverage"

Tasks:
1. Create shared/tests/schemas.test.ts with tests for all Zod schemas
2. Update shared/package.json with test scripts
3. Run: npm run test --workspace=@openpath/shared

Reference the code examples in the implementation guide. Use Node's built-in test runner.
```

### For Logging Work
```
Continue OpenPath quality work. Focus on LOGGING only.

Read docs/IMPLEMENTATION-GUIDE.md section "Gap 1: Console Logging"

Tasks:
1. Create spa/src/lib/logger.ts (browser logger - see guide for pattern)
2. Replace all console.* calls in spa/src/*.ts with logger
3. Run: npm run verify

Do NOT use Winston for browser code. Use the simple wrapper pattern in the guide.
```

### For Config Extraction
```
Continue OpenPath quality work. Focus on CONFIG EXTRACTION only.

Read docs/IMPLEMENTATION-GUIDE.md section "Gap 4: Hardcoded Configuration"

Tasks:
1. Create api/src/config.ts with environment variable defaults
2. Update api/src/lib/user-storage.ts to use config.bcryptRounds
3. Update api/src/server.ts to use config for rate limits and CORS
4. Run: npm run verify
```

### For JSDoc Documentation
```
Continue OpenPath quality work. Focus on JSDOC only.

Read docs/IMPLEMENTATION-GUIDE.md section "Gap 3: Documentation"

Tasks:
1. Add JSDoc to all exported functions in api/src/lib/github.ts
2. Add JSDoc to all exported functions in api/src/lib/push.ts
3. Follow the JSDoc pattern shown in the implementation guide

Do NOT change any logic, only add documentation comments.
```

---

## Quick Reference Card

| Gap | Files to Create/Modify | Verify Command |
|-----|------------------------|----------------|
| Testing | shared/tests/*.ts, auth-worker/tests/*.ts | `npm test` |
| Logging | */src/lib/logger.ts | `npm run verify` |
| Config | api/src/config.ts | `npm run verify` |
| JSDoc | api/src/lib/*.ts | `npm run typecheck` |
| tsconfig | */tsconfig.json | `npm run typecheck` |

## Files an LLM Should Read First
1. `CLAUDE.md` - Project overview
2. `docs/IMPLEMENTATION-GUIDE.md` - Implementation details
3. `api/src/lib/logger.ts` - Reference logger implementation
4. `shared/src/schemas/index.ts` - Schemas needing tests
