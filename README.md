# URLShortener

A small, fast, secure URL shortener — built as a portfolio-quality Node.js MVP. Paste a long URL, get a short one instantly, track clicks, shorten in bulk, and export everything to Excel.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)

## Features

- **Single URL shortening** — paste a long URL, get a short one instantly.
- **Redirects with click tracking** — every visit to a short link is counted and redirects to the original URL.
- **URL management dashboard** — see every link you've created, copy/open/delete it.
- **Bulk URL shortening** — paste up to 100 URLs at once; valid ones are shortened, invalid ones are reported with a reason.
- **Excel export** — download your URLs (or a specific bulk batch) as a clean, formatted `.xlsx` file.
- **Security by default** — Helmet CSP, rate limiting, strict server-side URL validation, parameterized SQL, and Excel formula-injection protection. See [SECURITY.md](SECURITY.md) and [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## Screenshots

> _Add screenshots of the dashboard, bulk shortener, and 404 page here before publishing (e.g. `docs/screenshot-dashboard.png`)._

| Dashboard | Bulk Shortener | 404 Page |
|---|---|---|
| _screenshot_ | _screenshot_ | _screenshot_ |

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no framework, no build step) |
| Backend | Node.js + Express.js |
| Database | SQLite via `better-sqlite3` |
| Short IDs | `nanoid` |
| Excel export | `exceljs` |
| Security | `helmet`, `express-rate-limit` |
| Logging | `morgan` |
| Testing | `vitest` + `supertest` |

## Architecture

Small modular monolith: routes → controllers → services → repositories, with SQLite accessed synchronously through `better-sqlite3` (no ORM). The frontend is static HTML/CSS/JS served directly by Express — no build step, no client-side framework. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown (request flow, folder structure, redirect/bulk/export flows), [DATABASE.md](DATABASE.md) for the schema, and [API.md](API.md) for the full API reference.

## Installation

Requires **Node.js 18+**.

```bash
git clone <this-repo-url>
cd url-shortner
npm install
cp .env.example .env
npm run dev
```

The app starts on `http://localhost:3000` (configurable via `.env`). The SQLite database is created automatically on first run — no manual setup required.

```bash
npm start        # production mode
npm run dev       # development mode, auto-restarts on file changes
```

## Testing

```bash
npm test          # run the full suite once
npm run test:watch  # watch mode
npm run lint       # ESLint
```

See [TESTING.md](TESTING.md) for the testing strategy and what's covered.

## API

Full reference in [API.md](API.md). Summary:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/urls` | Create one shortened URL |
| `GET` | `/api/urls` | List all URLs + stats |
| `GET` | `/api/urls/:id` | Get one URL's details |
| `DELETE` | `/api/urls/:id` | Delete a URL |
| `POST` | `/api/urls/bulk` | Create many URLs at once |
| `GET` | `/api/urls/export` | Download all (or selected) URLs as `.xlsx` |
| `GET` | `/:shortCode` | Redirect to the original URL |

## Project Structure

```
src/
  server.js, app.js       # entry point + Express app
  config/                 # env-driven configuration
  routes/                 # route definitions
  controllers/            # HTTP layer
  services/               # business logic (validation, short codes, bulk, Excel)
  repositories/            # parameterized SQL access
  middleware/              # security headers, rate limiting, error handling
  database/                # SQLite connection + schema init
  utils/                   # URL validation, Excel sanitizer, error types
public/
  index.html, bulk.html, 404.html
  css/, js/                # vanilla CSS + JS, no build step
tests/
  unit/, integration/       # Vitest + Supertest
```

## Security

- Server-side URL validation: only `http`/`https` accepted, malicious schemes (`javascript:`, `data:`, `file:`, etc.) and userinfo-disguised URLs (`https://trusted.com@evil.com`) are rejected.
- Parameterized SQL everywhere — no string-concatenated queries.
- Excel formula-injection protection on every exported cell.
- Rate limiting on all write endpoints (create, bulk create, delete) and on Excel export.
- Helmet security headers with a strict same-origin Content-Security-Policy (no inline scripts/styles).
- Centralized error handling — no stack traces, SQL errors, or internal paths ever reach an HTTP response.

Full audit trail in [SECURITY.md](SECURITY.md) (design) and [SECURITY_REVIEW.md](SECURITY_REVIEW.md) (point-in-time review with concrete fixes applied).

## License

[MIT](LICENSE)
