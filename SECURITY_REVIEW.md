# Security Review — Phase 6

A point-in-time audit of the MVP against `repo-prompt.md` §12 (Security), §13 (Rate Limiting) and the Phase 6 checklist, run after the Phase 5 code review. The design-time threat model is in `SECURITY.md`. This document records what was actually verified, what was fixed, and what was deliberately left alone.

## Scope & Methodology

- **Code read in full:** every file in `src/`, `public/js/*.js`, `public/*.html`, plus a grep of `public/css` for external resources.
- **Dynamic probing:** booted the app on a throwaway port with a temporary database and sent crafted requests with `curl`: malicious schemes, CRLF/HTML payloads in URLs, userinfo URLs, malformed percent-encoding, non-string bulk entries, cross-origin-style `text/plain` and form posts, CORS preflights, `X-Forwarded-For` spoofing, static-file traversal (`..%2f`, `//evil.com`), and rate-limit exhaustion. The exported `.xlsx` was read back with ExcelJS to confirm its contents.
- **Unit-level probing:** ran `utils/urlValidator` and `utils/excelSanitizer` directly against edge-case inputs.
- **Dependencies:** checked the installed versions of security-relevant packages and ran `npm audit --omit=dev`.
- **Proportionality:** anything on the §24 "DO NOT ADD" list (auth, Redis, etc.) was out of bounds, and so was general enterprise hardening.

## Verdicts by Area

| Area | Verdict | Notes |
|---|---|---|
| SQL injection | **Pass** | All SQL is in `urlRepository` and uses prepared statements. The only dynamic SQL is the `IN (?,?,…)` placeholder list, built from a count and never from values. |
| XSS (stored / reflected / DOM) | **Pass** | No `innerHTML` with data (it is only cleared with `''`). `originalUrl` goes through `textContent`/`title` and is **never** used as an `href`, since only the server-built `shortUrl` is. Express's redirect body HTML-escapes the target, and stored URLs are WHATWG-serialized (`"><script>` becomes `%22%3E%3Cscript%3E`). |
| CSP / inline code | **Pass** | Verified: no inline `<script>`, `style="…"`, `on*=` handlers or `javascript:` hrefs in `public/`, and no external CSS/font/`@import`. `Util.copyToClipboard`'s `el.style.x = …` is CSSOM, which `style-src 'self'` does not block. |
| CSRF | **Pass (N/A, verified)** | No cookies or sessions are ever set, so there's no ambient authority to ride. Verified: `express.json()` ignores the "simple" content types (`text/plain` and form posts get `400 MISSING_URL`), `DELETE`/JSON `POST` need a preflight, and the preflight gets no `Access-Control-Allow-*` headers, so browsers block it. A forged request could do nothing an attacker can't already do directly. |
| SSRF | **Pass (N/A)** | The server never fetches, resolves or previews a stored URL. It only emits a `Location` header. Internal-looking targets (`http://127.0.0.1`) are only ever reached by the visitor's own browser. |
| Open redirect | **Fixed** (#1, #4) / Accepted | Redirect targets come only from the DB, never from a query param. Static-dir redirects collapse `//evil.com` to a local path (verified). Abuse vectors closed: userinfo disguises and self-chaining. See accepted risks for the inherent "public redirector" part. |
| Malicious schemes | **Pass** | `javascript:` (any case, leading whitespace/tab, embedded `\n`), `data:`, `file:`, `vbscript:` and `ftp:` are all rejected. Only `http:`/`https:` with a hostname are accepted. |
| Header injection | **Pass** | Raw CR/LF are stripped by the URL parser and `%0d%0a` stays encoded, so the `Location` header can't be split. `Content-Disposition` is static. `shortUrl` uses `BASE_URL`, never the `Host` header. |
| Input validation | **Fixed** (#5, #6, #9) | See below. |
| Rate limiting | **Fixed** (#2, #3, #8) | Writes, delete and export are all limited now, and keyed correctly behind a proxy. |
| HTTP headers | **Pass** | Helmet sends CSP (`default-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`, `frame-ancestors 'none'`), `nosniff`, `Referrer-Policy: no-referrer` (on the 302 too, so destinations don't learn the short link), COOP/CORP, and no `X-Powered-By`. There is no CORS middleware (removed in Phase 5). |
| Error leakage | **Fixed** (#7) | Responses never carried stack traces or SQL. The remaining gap was client-caused errors turning into 500s with full stack logs. |
| Excel formula injection | **Fixed** (#10) | See below. |
| Resource exhaustion / bulk abuse | **Fixed** (#3) / Pass | 100 kb JSON limit (returns `413`), a 100-URL bulk cap checked before any per-item work, and a single transaction per batch. |
| Dependencies | **Pass / Accepted** | `express` 4.22.3 (past the `res.redirect` XSS and open-redirect advisories), `path-to-regexp` 0.1.13, `nanoid` 3.3.19 (past CVE-2024-55565), `helmet` 7.2, `express-rate-limit` 7.5. `npm audit` shows only a moderate `uuid` advisory via `exceljs`, which is accepted (see below). |

## Findings & Fixes

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | URLs with userinfo were accepted: `https://paypal.com@evil.com` actually goes to `evil.com`. That's a classic phishing disguise for a public shortener, and real `user:pass@` credentials would sit in the world-readable list and Excel export. | Medium | Rejected with `400 INVALID_URL` when `username`/`password` is present. [urlValidator.js:52-56](src/utils/urlValidator.js#L52-L56) |
| 2 | `DELETE /api/urls/:id` had no rate limit. With no auth and sequential ids, a one-line loop could wipe every link in seconds. | Medium | Added the existing `writeRateLimiter` (shared budget with create/bulk). [apiRoutes.js:14](src/routes/apiRoutes.js#L14) |
| 3 | `GET /api/urls/export` was the most expensive request (it builds the whole table as an in-memory workbook) and had no rate limit. Its `ids` list was also unbounded and not de-duplicated. | Medium | Added a separate `exportRateLimiter` (`RATE_LIMIT_EXPORT_MAX`, default 10/window). [rateLimiter.js:28-34](src/middleware/rateLimiter.js#L28-L34), [apiRoutes.js:9](src/routes/apiRoutes.js#L9), [config/index.js:27](src/config/index.js#L27). `ids` is now de-duplicated, and more than `BULK_MAX_URLS` ids returns `400 BATCH_TOO_LARGE`. [urlController.js:41-60](src/controllers/urlController.js#L41-L60) |
| 4 | Links pointing back at the shortener itself were accepted, allowing short→short chains that hide the final destination and survive deletion of the visible link. | Low | Rejected when the target host equals `BASE_URL`'s host. [urlValidator.js:5-13](src/utils/urlValidator.js#L5-L13), [:58-60](src/utils/urlValidator.js#L58-L60) |
| 5 | The 2048-char cap was checked **before** normalization. Percent-encoding can grow input 6× (1,500 × `é` became 9,000+ stored chars), so stored/redirected URLs could exceed the cap. | Low | The cap is now also enforced on the normalized string that is actually stored. [urlValidator.js:62-68](src/utils/urlValidator.js#L62-L68) |
| 6 | A bulk entry like `{"toString":1}` made `String(raw)` throw, returning `500` with a stack trace in the logs. Oversized invalid entries were also echoed back verbatim. | Low | New `describeInvalidEntry()` uses `JSON.stringify` for non-strings and truncates echoes to 300 chars. [urlService.js:70](src/services/urlService.js#L70), [:88-98](src/services/urlService.js#L88-L98) |
| 7 | Client-caused errors from Express/body-parser (e.g. `/api/urls/%E0%A4%A` gives a `URIError`) returned `500 INTERNAL_ERROR` and logged a full stack each time, so junk requests could flood the logs. | Low | The error handler maps any `err.status` 4xx to a generic `{ code: 'BAD_REQUEST' }` at that status, with no stack logging. [errorHandler.js:28-37](src/middleware/errorHandler.js#L28-L37) |
| 8 | `trust proxy` was never configured. Behind any reverse proxy or PaaS, every client shares the proxy's IP and therefore one rate-limit bucket (one abuser blocks everyone). Blindly setting it to `true` instead would let `X-Forwarded-For` spoofing bypass limits. | Low | New `TRUST_PROXY` env (hop count, default off). A bare `true` is coerced to 1 hop. Verified: spoofed XFF is ignored by default, and with `TRUST_PROXY=1` distinct clients get distinct buckets. [config/index.js:3-16](src/config/index.js#L3-L16), [app.js:14-16](src/app.js#L14-L16), `.env.example` |
| 9 | `parseId` used `parseInt`, so `DELETE /api/urls/1abc` (or `1e3`) silently deleted id `1`. | Low | Strict `^\d{1,15}$` match. Anything else returns `404`. [urlController.js:87-94](src/controllers/urlController.js#L87-L94) |
| 10 | The Excel sanitizer only inspected the literal first character. Leading padding (`" =1+1"`, NBSP + `@SUM(...)`, `\0=cmd`), `\n`, and full-width `＝＋－＠` (which some locales/IMEs turn into ASCII) were not neutralized. It is reusable, so it has to hold up for arbitrary strings, not just today's `http…` values. | Low (defense-in-depth) | Checks the first character after stripping leading whitespace/control characters, and adds `\n` and the full-width variants. [excelSanitizer.js:1-17](src/utils/excelSanitizer.js#L1-L17) |

All fixes were re-verified against a running instance, and `npm run lint` is clean.

## Excel Export: Detail

- **Where it applies:** `originalUrl` and `shortUrl` (the only strings) go through `sanitizeExcelCell`. `clickCount` is written as a numeric cell and `createdAt` as a date cell. Typed cells are never parsed as formulas, so they are correctly left untouched.
- **Why XLSX is lower-risk than CSV:** ExcelJS writes JS strings as shared-string cells. It only emits a `<f>` formula for `{ formula }` objects, which we never create. The realistic attack path is a user re-saving as CSV or editing a cell (F2 → Enter), and the `'` prefix covers that.
- **Trade-off:** ExcelJS has no `quotePrefix` style support, so the apostrophe is stored as a visible character. That's the standard OWASP mitigation, and it only ever fires on values that can't be valid stored URLs anyway.

## Accepted Risks / Not Fixed

| Item | Rationale |
|---|---|
| The app is an unauthenticated public redirector: anyone can shorten a phishing or malware link, list **all** links (`GET /api/urls`) and delete **any** link. | This is inherent to the specified product (§24 forbids login/users/roles). Mitigated by the scheme allow-list, userinfo and self-chaining rejection, rate limits on every write, and `Referrer-Policy: no-referrer`. Link scanning (Safe Browsing), interstitial warning pages and ownership would all be new features, not fixes. |
| Redirect route (`GET /:shortCode`) and `GET /api/urls` have no rate limit. | §13 makes redirect limiting optional, and a limit there would throttle legitimate link traffic. The worst case is click-count inflation, which is cosmetic (no billing or analytics depend on it). `GET /api/urls` is the dashboard's main call, and pagination is feature work rather than a security fix. |
| Bulk requests count as 1 hit against the write budget (≈ 30 × 100 URLs/min/IP). | Bounded, and still small for SQLite. Weighting by batch size adds complexity for little gain at MVP scale. |
| In-memory rate-limit store (per process, resets on restart). | Correct for a single-process MVP. Redis-backed/distributed limiting is explicitly out of scope (§24). |
| Private/loopback targets (`http://127.0.0.1`, `http://0x7f.1`) are accepted. | Not SSRF: the server never requests them. Blocking IP literals gives no real protection (any DNS name can resolve to one) and would reject legitimate LAN/dev links. |
| `uuid` < 11.1.1 (moderate, via `exceljs`). | The advisory affects `v3`/`v5`/`v6` when a caller passes `buf`. ExcelJS only calls `v4()` without a buffer (conditional-formatting ids), so it's not reachable. The only "fix" downgrades ExcelJS to 3.4.0. Revisit when ExcelJS updates. |
| HSTS / `upgrade-insecure-requests` sent over plain HTTP. | Harmless: browsers ignore HSTS over HTTP, and production is expected behind TLS. |
| `HEAD /:shortCode` increments the click count (Express routes `HEAD` to `GET`). | Accuracy, not security. It's on the same footing as the click-inflation item above. |

## New Configuration

| Variable | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_EXPORT_MAX` | `10` | Excel exports per client per `RATE_LIMIT_WINDOW_MS`. |
| `TRUST_PROXY` | unset (off) | Number of reverse-proxy hops in front of the app (usually `1` on PaaS hosts). Keeps `req.ip`, and therefore rate limiting, accurate and unspoofable. |

## Outcome

10 concrete issues fixed (3 Medium, 7 Low). None were critical. SQL injection, XSS, scheme filtering, header injection and error-body leakage were already sound, and have now been verified with live probes rather than assumed. No blocking security issues remain for the QA phase. Phase 7 should add regression tests for findings #1–#10 (e.g. userinfo rejection, `DELETE` 429, `{"toString":1}` bulk entry, `%E0%A4%A` returning 400, and leading-space/full-width formula cells).
