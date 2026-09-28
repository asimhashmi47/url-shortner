# Database Design

Engine: SQLite (file: `data/urls.db`, path configurable via `DATABASE_PATH`), accessed via `better-sqlite3`.

The database initializes automatically on server start (`src/database/db.js`) via `CREATE TABLE IF NOT EXISTS` + index creation — no separate migration step needed for this MVP.

## Table: `urls`

| Column        | Type     | Constraints                        | Notes                                 |
|---------------|----------|-------------------------------------|----------------------------------------|
| id            | INTEGER  | PRIMARY KEY AUTOINCREMENT           | Internal ID, never exposed as the short code |
| short_code    | TEXT     | NOT NULL, UNIQUE                    | nanoid(7), URL-safe                    |
| original_url  | TEXT     | NOT NULL                            | Validated http/https URL               |
| click_count   | INTEGER  | NOT NULL DEFAULT 0                  | Incremented on each redirect           |
| created_at    | TEXT     | NOT NULL DEFAULT (current timestamp)| ISO 8601 string                        |
| updated_at    | TEXT     | NOT NULL DEFAULT (current timestamp)| Bumped on click increment              |

## Indexes
- `UNIQUE` index on `short_code` (via column constraint) — required for O(log n) redirect lookups and to guarantee no collisions.
- Index on `created_at` for the dashboard's default sort order.

## Notes
- No `users`/`sessions`/other tables — out of scope per product decision (no auth).
- Deletes are hard deletes (no soft-delete flag) — keeps the MVP simple; acceptable for a portfolio project.
- `data/urls.db` is git-ignored; the app creates it on first run.
