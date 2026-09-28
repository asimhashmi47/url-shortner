# Security Design

This is a small public-facing MVP with no authentication; the security posture focuses on the concrete risks of "accept a URL, store it, redirect to it, export it."

## Threats & Mitigations

| Threat | Mitigation |
|---|---|
| SQL Injection | `better-sqlite3` prepared statements everywhere; no string-concatenated SQL. |
| XSS | Frontend uses `textContent`/attribute setters (never `innerHTML` with untrusted data); `helmet` sends a restrictive `Content-Security-Policy`. |
| Malicious URL schemes (`javascript:`, `data:`, `file:`, `vbscript:`, etc.) | `utils/urlValidator` allow-lists only `http:`/`https:` at creation time — a link can never be stored, let alone redirected to, with another scheme. |
| Open redirect abuse | By design the app *is* a redirector; mitigated by only ever storing pre-validated http/https URLs (no way to inject a stored value post-validation) and by not accepting a redirect target as a query parameter (only the DB-stored value is used). |
| Excel formula injection | `utils/sanitizeExcelCell` prefixes any string cell starting with `= + - @` (or tab/CR control chars) with a leading `'` before writing via `exceljs`. |
| Resource exhaustion / bulk abuse | `BULK_MAX_URLS` cap (default 100) rejects oversized batches with `400 BATCH_TOO_LARGE`; `express.json({ limit })` caps request body size. |
| Brute force / scripted abuse of write endpoints | `express-rate-limit` on `POST /api/urls` and `POST /api/urls/bulk`. |
| Header injection | All response headers are set by Express/helmet from static/controlled values; user input never reaches a raw header call. |
| Information disclosure | Centralized error handler strips stack traces / SQL errors / file paths in responses; `morgan` logs server-side only. |
| Clickjacking / MIME sniffing / etc. | `helmet` defaults (X-Frame-Options, X-Content-Type-Options, etc.). |

## Non-Goals
No authentication/authorization (no user accounts by design), no CSRF tokens (no session/cookie-based auth exists to protect — all mutating endpoints are plain JSON APIs with no ambient credentials, so classic CSRF does not apply), no WAF/IDS.

See `SECURITY_REVIEW.md` for the point-in-time audit and any follow-up fixes applied during Phase 6.
