# Code Review — Phase 5

Reviewed as a Senior Principal Software Engineer before security/QA passes.

## Architecture
- Layering (routes → controllers → services → repositories) is thin and each layer earns its place: controllers only parse/shape HTTP, services hold the actual business rules (validation orchestration, short-code retries, bulk dedup), repositories are the only place SQL is written. No unnecessary abstraction (no interfaces/DI container/base classes for a 6-table-less app).
- `/api/*` is registered before the `/:shortCode` catch-all, and `/api/urls/export` is registered before `/api/urls/:id` — verified both orderings hold (a literal `export` id lookup would otherwise have shadowed the export route).

## Findings & Fixes

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `cors()` was mounted with default (fully permissive, `Access-Control-Allow-Origin: *`) options even though the frontend is same-origin and the API needs no cross-origin access. This is unnecessary attack surface (any third-party page could read a visitor's `/api/urls` list cross-origin). | Medium | Removed the `cors` middleware and dependency entirely ([app.js](src/app.js)). |
| 2 | `npm run lint` had no ESLint config, so it would fail immediately. | Low | Added [.eslintrc.json](.eslintrc.json) (`eslint:recommended` + browser/node overrides for `public/js` vs `src`/`tests`); project now lints clean. |
| 3 | Inline `style="..."` attributes existed in two HTML files, which a strict `style-src 'self'` CSP (see below) would silently fail to apply. | Low | Replaced with dedicated CSS classes (`section-heading--flush`, `table-card--spaced`, `th-actions`) in [components.css](public/css/components.css). |
| 4 | Table loading/empty/error toggling used `element.style.display` from JS, which is also blocked under a strict `style-src` CSP without `unsafe-inline` in some engines. | Low | Switched to a `.is-hidden { display: none !important; }` utility class toggled via `classList`. |

## Code Quality
- Naming is consistent and intention-revealing (`serializeUrl`, `generateUniqueShortCode`, `sanitizeExcelCell`).
- No duplicated SQL — all access goes through `urlRepository`.
- Async handlers are uniformly wrapped via `asyncHandler`; no unhandled promise rejections possible in controllers.
- Domain errors use a single `AppError` shape end-to-end into the JSON envelope; no ad-hoc `res.status().json()` error shapes scattered around.

## Backend
- API design matches `API.md` exactly (status codes, error envelope, route order).
- Validation is centralized in `urlValidator` and applied both to single and bulk creation — no duplicated validation logic.
- The bulk-insert path uses a single `better-sqlite3` transaction (`db.transaction`) rather than N individual round trips, and short-code collisions are checked against both the DB and the in-flight batch (`usedCodes` set) so two rows in the same request can never collide.
- HTTP status codes are correct throughout: `201` create, `200` read/bulk, `204` delete, `302` redirect, `404`/`400`/`413` error paths.

## Frontend
- All DOM insertion of untrusted data (`originalUrl`, `shortUrl`, error messages) goes through `textContent`/property assignment — no `innerHTML` with user data anywhere in `public/js`.
- Loading/empty/error/success states are implemented for both the dashboard table and the bulk results panel, per requirement.
- Delete requires an explicit confirm-modal step (Escape/backdrop-click/Cancel all dismiss without side effects).
- Accessibility: skip link, semantic `<table>`/`<th scope>`, labelled inputs (visually-hidden `<label>` where a placeholder alone would otherwise be the only cue), `aria-live` on toasts/results, `role="alert"` on field errors, visible focus rings via `:focus-visible`.

## Database
- Single `urls` table, `short_code` uniquely indexed, `created_at` indexed for the default list order — matches `DATABASE.md`, no speculative tables added.

## Outcome
All findings above were fixed in this pass. No blocking issues remain from an architecture/code-quality standpoint going into the security review.
