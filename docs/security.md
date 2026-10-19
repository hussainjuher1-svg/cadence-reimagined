# Security and privacy notes

## Implemented in the local development build

- SQLite parameterized statements, startup foreign-key check, user/session owner scoping and 404 on absent/not-owned records.
- Password hashes use asynchronous Node `scrypt` with parameters embedded in the stored hash and timing-safe digest comparison; sign-in performs a dummy hash verification for unknown users.
- Signup idempotency records do not store a fast hash containing the raw password; a replay verifies the submitted password against the stored asynchronous scrypt hash. Session-create idempotency records keep only a hash and resource ID, not a duplicate serialized session record.
- Opaque random session tokens are stored hashed, not plaintext. Browser session cookie is HttpOnly/SameSite=Lax; the server listens on loopback, and `Secure` is not set in this HTTP-only local mode. Idle/absolute expiry defaults are 7/30 days. Sign-out, password change and reset revoke existing sessions.
- State changes require CSRF cookie/header matching, same-origin host validation when Origin is supplied, and cross-site fetch rejection. Security headers include CSP, `X-Content-Type-Options`, `Referrer-Policy`, frame denial and a restrictive Permissions Policy.
- Server-side validation, 100 KiB request-body cap, content-type checks, unknown-field checks for defined request shapes, field-length limits, request IDs and generic client error messages.
- Static serving confines path resolution to public/assets trees; ignores dotfiles and rejects decoded NUL/path traversal attempts.
- User input is inserted as escaped text; it is not passed to `dangerouslySetInnerHTML`. Server logs omit session content and error messages are generic. Activity records contain event types/IDs only.
- Reset links have a 30-minute expiry, are single-use and stored hashed; a reset revokes active auth sessions. The local mailer writes the full reset URL to terminal and a development outbox, with the UI explicitly warning that no email was sent.
- Startup and periodic pruning of expired auth sessions/reset tokens, old idempotency/rate-limit data and activity older than 90 days. Hard-deleting a session/account uses cascading relationships, with an API test of deletion behavior.
- The application refuses `NODE_ENV=production` because production auth, HTTPS termination, secret management, backups and monitoring are not configured.

## Not a complete or production security review

This is local development authentication and a single-user-machine data store. The following remain incomplete/unverified and must not be inferred from the implemented controls:

- Production hosting, TLS/HTTPS termination, secure cookie behavior behind a reverse proxy and HSTS setup.
- Independent security review, threat modeling, penetration tests and full route-registry-generated authorization coverage for every possible future endpoint.
- Backups, encrypted-at-rest storage, recovery drills and retention policy governance.
- Secrets management, centralized monitoring, alerting, incident response, log rotation and operational access controls.
- Third-party dependency audit and software supply-chain scanning (this project intentionally has no npm dependencies; no package audit can certify the Node runtime/OS).
- Automated cross-platform tests on Windows and macOS; development work took place in Linux.
- Email delivery: none configured. Local reset URLs in the outbox are sensitive and should not be shared.

Do not expose the server to a LAN or the public internet. Treat `data/` as sensitive. Export and backup handling are manual; a database file or outbox copied elsewhere may expose records or active reset links.
