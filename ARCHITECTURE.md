# Architecture

## Overview
Small modular monolith: Express API + server-rendered redirect route + a static vanilla-JS SaaS frontend, backed by SQLite via `better-sqlite3` (synchronous, no ORM overhead).

## Folder Structure
```
src/
  server.js          # process entry: starts HTTP listener
  app.js             # express app: middleware + route wiring, no listen()
  config/            # env-driven config (port, base URL, rate limits, bulk limits)
  routes/            # thin route definitions -> controllers
  controllers/       # HTTP layer: parse req, call services, shape res
  services/          # business logic: validation, short-code generation, bulk orchestration, excel building
  repositories/       # SQL access (parameterized queries only)
  middleware/         # security headers, rate limiting, error handler, not-found handler
  database/           # connection + schema init/migration-on-boot
  utils/              # url validation, excel-cell sanitizer, async handler wrapper
public/
  index.html          # dashboard
  bulk.html           # bulk shortener
  css/                # design tokens + component styles
  js/                 # fetch-based API client + page controllers
tests/
  unit/               # service/util unit tests
  integration/         # supertest API tests
```

## Request Flow
1. `server.js` boots DB (create table/indexes if missing), then starts `app.js`'s Express app.
2. Static frontend served from `public/`.
3. `POST /api/urls`, `GET /api/urls`, `GET /api/urls/:id`, `DELETE /api/urls/:id`, `POST /api/urls/bulk`, `GET /api/urls/export` are registered under `/api` **before** the catch-all `GET /:shortCode` redirect route, so API paths never fall through to the redirect handler.
4. Redirect route looks up the code, 302s on hit (after an async click-count increment), renders the 404 page on miss.
5. Centralized error middleware catches all thrown/`next(err)` errors and returns the standard JSON error shape (HTML 404 page only for the redirect miss and unmatched web routes).

## Database Design
Single table `urls` (see `DATABASE.md`). No ORM — a thin repository layer wraps prepared statements.

## API Design
See `API.md`. REST-ish JSON API under `/api/urls`, consistent error envelope `{ error: { code, message } }`.

## URL Shortening Flow
1. Controller receives `{ url }`, delegates to `urlService.createShortUrl`.
2. Service validates via `utils/urlValidator` (protocol allow-list `http:`/`https:`, length cap, well-formed `URL` parse).
3. Service generates a `nanoid(7)` short code, retries on unique-constraint collision (rare, bounded retries).
4. Repository inserts the row; controller returns the created resource + absolute short URL.

## Redirect Flow
1. `GET /:shortCode` → repository `findByCode`.
2. Not found → render 404 page (no data leak, generic message).
3. Found → repository increments `click_count` in the same request, then `res.redirect(302, original_url)`.

## Bulk Processing Flow
1. Controller receives `{ urls: string[] }` (frontend also accepts a textarea split by newline).
2. Service caps the batch size (`BULK_MAX_URLS`, default 100) to prevent abuse.
3. Each line is trimmed/deduped/validated independently; valid ones are inserted (bulk `better-sqlite3` transaction for performance), invalid ones are collected with a reason.
4. Response returns `{ created: [...], invalid: [...] }`.

## Excel Export Flow
1. `GET /api/urls/export` (optionally filtered to the most recent bulk result via query ids) pulls rows from the repository.
2. `excelService` builds a workbook with `exceljs`: header row styling, sensible column widths, date formatting, autofilter.
3. Every string cell is passed through `sanitizeExcelCell` (utils) to neutralize formula-injection prefixes (`= + - @` and tab/CR) before being written.
4. Response streams the `.xlsx` with proper `Content-Disposition`/`Content-Type` headers.

## Security Architecture
See `SECURITY.md`. Helmet, rate limiting on write endpoints, strict input validation, parameterized SQL, generic error responses, Excel formula-injection sanitization, request body size limits.

## Error Handling
- `utils/asyncHandler` wraps async controllers so rejected promises reach `next(err)`.
- Domain errors are thrown as a small `AppError { statusCode, code, message }`; anything else is logged and returned as a generic 500 with no internal detail.

## Testing Strategy
See `TESTING.md`. Vitest for unit tests (validators, sanitizer, short-code service) and Supertest for integration tests against the Express app (in-memory/temp SQLite file per test run).
