# API Reference

Base URL: `http://localhost:3000`

All responses are JSON except `GET /:shortCode` (redirect/HTML 404) and `GET /api/urls/export` (binary xlsx).

Error envelope (all 4xx/5xx JSON responses):
```json
{ "error": { "code": "INVALID_URL", "message": "Please provide a valid HTTP or HTTPS URL." } }
```

## POST /api/urls
Create one shortened URL.

Request:
```json
{ "url": "https://example.com/some/very/long/url" }
```
Response `201`:
```json
{
  "id": 1,
  "shortCode": "abc123z",
  "shortUrl": "http://localhost:3000/abc123z",
  "originalUrl": "https://example.com/some/very/long/url",
  "clickCount": 0,
  "createdAt": "2026-09-28T12:00:00.000Z"
}
```
Errors: `400 INVALID_URL` / `400 MISSING_URL`.

## GET /api/urls
List all URLs, newest first.

Response `200`: `{ "urls": [ { ...same shape as above... }, ... ], "stats": { "totalUrls": 5, "totalClicks": 42 } }`

## GET /api/urls/:id
Return one URL's details. `404 NOT_FOUND` if missing.

## DELETE /api/urls/:id
Delete a URL. `204` on success, `404 NOT_FOUND` if missing.

## POST /api/urls/bulk
Create many URLs at once (max configurable, default 100 per request).

Request:
```json
{ "urls": ["https://google.com", "https://github.com", "not-a-url"] }
```
Response `200`:
```json
{
  "created": [ { "id": 2, "shortCode": "...", "shortUrl": "...", "originalUrl": "https://google.com", "clickCount": 0, "createdAt": "..." } ],
  "invalid": [ { "url": "not-a-url", "reason": "Please provide a valid HTTP or HTTPS URL." } ]
}
```
Errors: `400 EMPTY_BATCH`, `400 BATCH_TOO_LARGE`.

## GET /api/urls/export
Streams an `.xlsx` file of all URLs (`Content-Disposition: attachment; filename="urls.xlsx"`). Optional `?ids=1,2,3` to export a specific subset (e.g. the last bulk-created batch).

## GET /:shortCode
Redirects (`302`) to the original URL and increments `click_count`. Unknown codes render the branded 404 HTML page (`404` status). Registered **after** all `/api/*` routes so it never shadows the API.

## Status Codes Used
`200` OK · `201` Created · `204` No Content · `302` Found (redirect) · `400` Validation error · `404` Not found · `413` Payload too large · `429` Rate limited · `500` Unexpected error (generic message only).
