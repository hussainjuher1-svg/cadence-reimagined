# Supabase migration path — design only, not implemented

The application ships with exactly one provider: local SQLite. There is no Supabase adapter, Supabase client, Supabase credential or remote data traffic in this release. This file maps likely changes; it is not evidence of an integration.

## Mapping

| Current local table | Candidate Postgres table | Notes |
|---|---|---|
| `users` | Supabase Auth users + `profiles` | Password hashes move to Supabase Auth; never migrate local password hashes into an app-managed password table. |
| `auth_sessions` | Supabase Auth sessions | Replace local opaque-cookie lifecycle with Supabase Auth's verified session lifecycle. |
| `password_reset_tokens` | Supabase Auth recovery | Remove local reset token table when provider-managed recovery is active. |
| `sessions` | `public.sessions` | Keep UUID PK, owner UUID FK, UTC instants, IANA zone, state, version and server-computed duration. |
| `session_prep`, `prep_checks` | matching tables | RLS via parent ownership or owner id. |
| `entries`, `terms`, `followups` | matching tables | RLS on owner and parent references; preserve per-session isolation. |
| `activity_log` | `activity_log` or managed telemetry | Do not record session text. Add retention policy. |
| Rate/idempotency tables | Postgres tables or gateway controls | Transactional conflict handling must be maintained; consider provider/edge rate limiting. |

## Required work before enabling it

1. Add a single startup-selected provider interface implementing the same repository/service contracts. Do not run SQLite and Supabase as concurrent sources of truth.
2. Implement and test Supabase Auth and server-side JWT/session verification; update `AuthProvider` and cookie/CSRF strategy in light of the deployment architecture.
3. Write RLS policies for every private table. For session children, prove ownership through the parent relation or immutable `owner_id`; use both RLS and application checks, not only random UUIDs.
4. Keep the service-role key on the server only. Never put it in public Vite/client variables.
5. Translate SQLite migration constraints/indexes to reviewed Postgres migrations; preserve lifecycle checks, optimistic concurrency and cascade behavior.
6. Create per-user isolated integration tests for every private route/resource, recovery, export and destructive operation. Re-evaluate retention, backups, region/data residency, incident response and privacy claims.
7. Build a deliberate, auditable export/import path for existing local records; validate timestamps and ownership, and do not automatically upload data without the user's explicit action.

## Status

**Not implemented.** No remote project credentials were supplied or required. No schema, RLS policy, hosted service or production integration is claimed.
