# Data model

The data provider shipped in v1 is SQLite only. `server/db.mjs` creates a versioned `schema_migrations` ledger and applies migration 1 transactionally. Startup enables and verifies `PRAGMA foreign_keys=ON`; the DB uses a busy timeout and WAL mode. SQLite is the single source of truth.

## Tables

- `users`: normalized unique email, display name, async scrypt hash, default time zone/languages, onboarding step/completion and timestamps.
- `auth_sessions`: user FK with cascade; SHA-256 hash of opaque token, creation/last-seen, idle/absolute expiry and revocation timestamps.
- `password_reset_tokens`: user FK, token hash, creation/expiry/used timestamps.
- `sessions`: owner FK, UUID, title/client label, source/target language tags, UTC scheduled start plus IANA zone, status, server `started_at`/`ended_at`/`cancelled_at`, completion duration/summary, optimistic `version` and timestamps.
- `session_prep` (one row/session): goal, context, instructions, tone/register, names/pronunciation, open questions and update timestamp.
- `prep_checks`: session + item key, pending/done/not-needed, timestamp. Derived items are computed and only explicit judgement marks are stored.
- `entries`: session/user FKs, kind (`source`, `interpretation`, `note`), body, ordered sequence, create/edit timestamps.
- `terms`: session/user FKs, source/target terms, context/register and timestamps.
- `followups`: session/user FKs, text, open/done, create/resolve/update timestamps.
- `rate_limit_buckets`: operational keyed counters with window start/hits.
- `activity_log`: event kind, identifiers and timestamp only—never session content.
- `request_idempotency`: request key/hash/purpose and created user id for signup replay; explicitly removed at account deletion and pruned after 24 hours.
- `idempotency_keys`: user-scoped key/hash/resource/time for create replay; it does not duplicate session content.

## Invariants

The session owner is checked on every session and child-resource read/write; knowing a UUID does not confer access. Private resource misses—including another user's resource—respond with 404. Foreign keys cascade session and account deletion. Counts are derived by queries and not maintained as independent counters. User text is rendered as text and Markdown export escapes structural characters.

Legal state transitions are `scheduled → in_progress → completed` and `scheduled → cancelled`. Completed/cancelled are terminal; start is idempotent and preserves the first `started_at`. Completion time and duration are server-derived; client-supplied status, end time and duration do not establish persisted facts. `version` is required for updates to core session metadata to reject stale tabs.

Time inputs are local date-time plus IANA timezone; the server stores UTC ISO timestamps. DST gaps are rejected; overlaps select the earliest matching occurrence. The default timezone is initially `UTC` until onboarding/settings saves a choice.

## Known design trade-offs

`request_idempotency` has no `users` foreign key because it stores the created user identifier before and across the signup replay boundary; cleanup is explicit on account deletion and by maintenance pruning. SQLite is suitable for a local one-computer development deployment, not a substitute for a multi-instance managed database. Backups are not implemented.
