# TODO - Whitelist DNS System

Project improvement tasks based on code analysis (Dec 2024).

---

## 🔴 Critical

- [x] **Fix version inconsistencies** - Updated v3.4 → v3.5 in:
  - `scripts/dnsmasq-whitelist.sh`
  - `scripts/dnsmasq-watchdog.sh`

---

## 🟠 Security

- [x] **Add API rate limiting** - Installed `express-rate-limit` in whitelist-request-api
- [x] **Fix timing-safe token comparison** - Using `crypto.timingSafeEqual()` in `routes/requests.js`
- [x] **Sanitize input fields** - Added length limits and HTML stripping to domain request reasons

---

## 🟡 Code Quality

- [x] **Fix Express route ordering** - Moved `/groups/list` before `/:id` in `routes/requests.js`
- [x] **Replace MD5 with SHA-256** - Updated hash functions in `dnsmasq-whitelist.sh`
- [x] **Add custom error classes** - Created `lib/errors.js` with APIError class hierarchy

---

## 🔵 Enhancements

- [x] **Add structured logging** - Implemented log levels (INFO/WARN/ERROR/DEBUG) in `lib/common.sh`
- [x] **Enhance health endpoint** - Added storage, GitHub, memory, and auth checks
- [x] **Add lint npm scripts** - Added eslint configuration to whitelist-request-api
- [x] **Improve Firefox extension** - Added storage-based config, retry settings, and fallback URLs
- [x] **Add Dependabot config** - Already existed in `.github/dependabot.yml`
- [x] **Add pre-commit hooks** - Created `.github/hooks/pre-commit` with ShellCheck/ESLint
- [x] **Create dev docker-compose** - Added `docker-compose.dev.yml` for local development
- [x] **Prepare Firefox extension for AMO** - Added PRIVACY.md, AMO.md, manifest metadata
- [ ] **Publish Firefox extension to AMO** - Submit to addons.mozilla.org

---

## ✅ All Complete!

**14/14 items implemented** - All identified improvements have been applied.
