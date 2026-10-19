# Assumptions and environment ledger

## Preflight recorded in this build environment

- OS/shell: Linux x86_64, bash (not Windows).
- Node: `v22.16.0`.
- npm: `10.9.2`.
- `node:sqlite`: available and exercised by the integration suite (Node emits its experimental API warning).
- ZIP tools: `/usr/bin/zip` and `unzip` available.
- Headless browser: `/usr/bin/chromium` available; browser automation is attempted through Chrome DevTools Protocol when the E2E script is run.
- File write access: project folder writable.
- npm registry: `npm ping --fetch-timeout=8000 --fetch-retries=0` failed with `EAI_AGAIN registry.npmjs.org`. Third-party dependency installation and web research were not possible during this build.
- Typography: platform-native system stack (Apple system fonts on Apple devices; Segoe UI on Windows; Inter/Helvetica/Arial and language-aware Noto fallbacks if installed). No runtime font CDN is used.
- Original project: supplied ZIP extracted to an isolated scratch directory; original ZIP preserved. See `legacy-audit.md`.

## Reversible assumptions

| Area | Chosen default | Reason / consequence |
|---|---|---|
| Client/backend stack | Native ES modules + Node HTTP, not React/Vite/TS | npm registry unreachable; no dependency download. Must be described as a deviation and can be migrated later if registry access and a deliberate refactor are available. |
| Data provider | SQLite only | One local source of truth and no credentials needed. |
| Server interface | Bind to `127.0.0.1` | Never expose development auth/storage to the LAN. |
| Session lifetime | 7-day idle, 30-day absolute | Local defaults, documented in `shared/constants.mjs`. |
| Password reset | 30-minute, single use; local terminal + outbox | A testable mailer fallback; no claim of email delivery. |
| Rate limits | Sign-in: 5 failures/15 min/account and 20 attempts/15 min/IP; signup 10/hour/IP; recovery 5/hour/IP | Reasonable local protection, not an edge/WAF replacement. |
| Body / field sizes | Body ≤ 100 KiB; title 200, client 160, entry 5000, terms 200/context 500, follow-up 1000, summary 4000 | Limit abuse and oversized payloads. |
| Pagination | ≤ 50 session rows per request | Keep dashboard query bounded. |
| Activity retention | 90 days; content not logged | Minimal operational trail. |
| Idempotency retention | 24 hours | Bound storage of replay records. |
| Time zones | Browser/system choice as starting default; user can edit IANA zone | Avoid inventing a locale setting. Server persists UTC instants + zone. |
| Multiple sessions | Multiple in-progress sessions supported; no pause/resume | Simpler, predictable first release. |
| Deletion | Hard delete | UI asks for confirmation/password for account; cascade verified in integration test. |
| Exports | JSON and Markdown; PDF deferred | Verifiable formats with no PDF library dependency. |
| Type family | Platform-native system stack with script-aware fallbacks | Familiar platform rendering; no external font request or bundled font asset. |

## Not verified by this environment

Production deployment, Windows/macOS installs, a genuine TypeScript typecheck, Vite build, full manual accessibility audit with assistive technology, independent security review, and remote/Supabase integration were not completed. Test report gives command-specific statuses.
