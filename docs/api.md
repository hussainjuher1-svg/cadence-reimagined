# HTTP API

Base path: `/api/v1`. Requests/responses use JSON except successful export responses. Errors use `{ "error": { "code", "message", "requestId", "fieldErrors"? } }`. Request size is capped at 100 KiB, JSON content type is required for JSON endpoints, and unknown JSON fields are rejected where schemas are applied. A CSRF cookie/header and same-origin validation are required on state-changing requests.

## Authentication and settings

- `GET /health` — local health and server time.
- `GET /auth/me` — authentication state/current public user.
- `POST /auth/signup` — requires `Idempotency-Key`; registers account, signs in.
- `POST /auth/signin`, `POST /auth/signout`.
- `POST /auth/recovery/request`, `POST /auth/recovery/confirm` — local mailer only, no SMTP/email send.
- `POST /auth/password/change` — changes hash and revokes other sessions.
- `GET/PATCH /settings`, `POST/PATCH /onboarding` per current route implementation.
- `DELETE /account` — requires password and explicit `confirm: true`; hard delete.

## Session resources

- `GET/POST /sessions` — bounded list (limit ≤ 50) and create; creates require an idempotency key.
- `GET/PATCH/DELETE /sessions/:id` — versioned PATCH, confirmed hard deletion is a UI behavior.
- `GET /sessions/:id/workspace` — aggregated session, prep, checklist, entries, terms, follow-ups and server time.
- `PATCH /sessions/:id/prep`; `PATCH /sessions/:id/prep-checks`.
- `POST /sessions/:id/start`, `/complete`, `/cancel`.
- `POST/PATCH/DELETE /sessions/:id/entries[/:entryId]`.
- `POST/PATCH/DELETE /sessions/:id/terms[/:termId]`.
- `POST/PATCH/DELETE /sessions/:id/followups[/:followupId]`.
- `PATCH /sessions/:id/summary` — summary addendum after completion.
- `GET /sessions/:id/export?format=json|markdown` — completed sessions only; download response has content disposition.

The route handlers and shared UI API client in `client/src/api.js` are the executable contract. Error responses use status codes such as 400 validation, 401 unauthenticated, 404 missing/not-owned, 409 conflict/illegal lifecycle, 413 oversized body, 415 wrong content type, 429 rate limited and 500 unexpected error. Check exact response fields in implementation/tests before building another client; there is no separately generated OpenAPI file in this release.
