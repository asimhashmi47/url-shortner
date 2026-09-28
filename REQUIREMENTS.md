# Requirements

## Functional
- FR1: User submits a single URL and receives a short URL.
- FR2: Visiting `/:shortCode` redirects to the original URL and increments its click count.
- FR3: Unknown short codes render a friendly 404 page.
- FR4: Dashboard lists all created URLs (original, short, clicks, created date) with copy/open/delete actions.
- FR5: User submits multiple URLs (one per line) and gets a short URL for each valid one; invalid lines are reported separately.
- FR6: User can export the URL list (or bulk results) as a formatted `.xlsx` file.

## Non-Functional
- NFR1: Runs fully locally with SQLite — no external services required.
- NFR2: Fast startup, minimal dependencies, no build step for the frontend (vanilla HTML/CSS/JS).
- NFR3: Responsive from 320px to 1440px+.
- NFR4: Consistent JSON error shape from the API; no internal details leaked to clients.
- NFR5: Reasonable rate limits on write endpoints; does not hinder local dev/testing.

## Risks
- Open redirect / SSRF-adjacent risk: the app redirects to arbitrary user-supplied URLs — mitigated by strict scheme allow-listing (http/https only) at creation time, not at redirect time (avoids TOCTOU weirdness while keeping redirects simple).
- Excel formula injection via original URL text landing in `.xlsx` cells — mitigated by cell sanitization.
- Abuse of bulk endpoint (resource exhaustion) — mitigated by a max line/URL count per request and rate limiting.
- SQL injection — mitigated by `better-sqlite3` parameterized statements exclusively.
- Short-code collisions — mitigated by unique DB constraint + regeneration retry loop.

## UX Requirements
- Premium, light-theme SaaS look; instant feedback (loading, success, error, empty states); toast notifications; copy-to-clipboard; delete confirmation.

## Testing Requirements
- Vitest + Supertest covering: URL creation/validation, redirect + click tracking, bulk create (valid/invalid mix), delete, Excel export (including formula-injection protection), and basic security probes (SQLi/XSS payloads, bad schemes, rate limiting).
