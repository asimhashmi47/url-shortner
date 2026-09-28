# Testing Strategy

Stack: **Vitest** (runner/assertions) + **Supertest** (HTTP integration against the Express `app` instance, no network binding needed).

Each integration test run points `DATABASE_PATH` at a fresh temp SQLite file (created in `beforeAll`, removed in `afterAll`) so tests are isolated and repeatable.

## Unit tests (`tests/unit/`)
- `urlValidator`: accepts valid http/https, rejects empty/malformed/unsupported schemes/oversized URLs.
- `excelSanitizer`: neutralizes `=`, `+`, `-`, `@`-led strings; leaves normal URLs untouched.
- `shortCode` generation: correct length/alphabet, collision-retry behavior.

## Integration tests (`tests/integration/`)
- **Single URL**: valid http, valid https, empty body, invalid URL, unsupported scheme, extremely long URL.
- **Redirect**: known code → 302 + Location header, unknown code → 404 HTML, click_count increments on each hit (verified via `GET /api/urls/:id`).
- **Bulk**: all valid, mixed valid/invalid, empty array, duplicate URLs, batch over the configured limit, malformed entries.
- **Delete**: existing id → 204, missing id → 404.
- **Excel export**: correct headers/columns, correct row values, multiple records, a URL crafted to start with `=`/`+`/`-`/`@` is sanitized in the output buffer.
- **Security probes**: SQL-injection-style strings in the `url` field (rejected as invalid URLs, not executed), `<script>`-bearing strings (rejected/escaped, never reflected unescaped), `javascript:`/`data:`/`file:` schemes rejected, rate limiter returns `429` after exceeding the configured threshold in a tight loop.
- **API contract**: status codes and the `{ error: { code, message } } ` envelope shape on failure paths.

## Commands
```
npm test          # single run
npm run test:watch
```

Coverage target: meaningful path coverage of services/controllers/repositories and the security-relevant utils — not a 100% mandate.

## Test Inventory
Each test file runs in its own Vitest worker process, so config, rate-limiter state and the DB connection never leak between files. `tests/helpers/testApp.js` pins every env var `src/config` reads (including `BASE_URL`, which Vite otherwise pre-sets to `/`), boots the app on a fresh temp SQLite file, and closes the connection before deleting it.

| File | Covers | Security regressions |
|---|---|---|
| `unit/urlValidator.test.js` | http/https normalization, empty/non-string, malformed, schemes, length cap | #1 userinfo, #4 self-links (incl. trailing-dot host), #5 post-normalization cap |
| `unit/excelSanitizer.test.js` | `= + - @` / tab / CR / LF prefixes, safe URLs, non-strings, idempotency | #10 padded and full-width triggers |
| `unit/shortCodeService.test.js` | length/alphabet, DB and in-batch collision retries, bounded give-up | |
| `unit/config.test.js` | defaults, `BASE_URL` trailing slash | #8 `TRUST_PROXY` parsing |
| `integration/urls.test.js` | create/get/list, validation errors, invalid JSON, 413, unknown routes, headers | #1, #4, #5 |
| `integration/redirect.test.js` | 302 + `Location`, HTML 404, click counting and stats, deleted links | |
| `integration/bulk.test.js` | all valid, mixed, empty, duplicates, full batch of 100, over limit | #6 non-string entries and truncated echoes |
| `integration/delete.test.js` | 204, 404, double delete, malformed ids | #9 strict ids, #2 limiter wired in |
| `integration/export.test.js` | headers/columns/values, id subset, dedupe, formula injection, no formula cells | #3 id cap after dedupe |
| `integration/security.test.js` | SQLi, XSS, malicious schemes, malformed requests, 500 without leaks | #7 malformed %-encoding → 400 |
| `integration/rateLimit.test.js` | shared write budget → 429, reads/redirects unlimited | #2 delete limit, #3 export limit, #8 spoofed `X-Forwarded-For` |

A formula-shaped URL cannot be created through the API (the validator only stores `http(s)` URLs), so the export test inserts those rows straight through the repository to prove the export route sanitizes what it writes.
