# Legacy project audit

## Scope and method

The supplied `cadence-fullstack(1).zip` was extracted to an isolated scratch directory. The original archive was not edited. Inspected the file inventory, `package.json`, `README.md`, `server.mjs`, `public/index.html`, `scripts/smoke.mjs`, and `data/` metadata. Ran the existing `npm test` from the extracted legacy project. This was a code/readthrough audit plus its smoke test, not a complete manual browser journey through every legacy control.

## Observed inventory

The ZIP has ten archive entries and the app is concentrated in a single `public/index.html` of 191,058 bytes / about 3,174 lines plus `server.mjs` (31,521 bytes / about 478 lines), `package.json`, one `scripts/smoke.mjs`, README and `data/`. There is no modular client/server package structure or comprehensive authorization/lifecycle test suite. **OBSERVED:** `npm test` completed with `Cadence smoke test: PASS` and exit code 0; that test exercises one happy path and does not establish the full product/security contract.

## Findings (observed, not assumptions)

| Finding | Evidence | Risk / decision |
|---|---|---|
| One very large HTML file owns UI, CSS and client behavior | `public/index.html`, 191,058 bytes; 3,174-line file | Hard to test and reason about screen/state boundaries. Replaced by separated HTML entry, modules and CSS. |
| Legacy app references third-party font CDNs | `public/index.html` around lines 7–9 | Local mode makes runtime requests outside the computer. Removed from new app. |
| Demo account/credentials are disclosed and seeded | `server.mjs` around lines 282–291; `public/index.html` around line 2252; `README.md` includes credentials | Private-workspace trust boundary is undermined. No account is seeded in new build. |
| Password hashing/verification uses synchronous scrypt | `server.mjs` import at line 6 and password routines around lines 170–180 | Blocks the event loop during password operations. New server uses asynchronous `scrypt` via promise wrapper. |
| A hard-coded medical-consultation session/client is produced by session creation/default demo seeding | `server.mjs` around lines 270–291 and 404 | Fabricated content can be mistaken for user data; removed from real-user flow. |
| Session completion trusts client-supplied duration/turn count/summary | `server.mjs` around line 430 | Client can dictate persisted facts. New server computes timestamps/duration itself and accepts only user-written summary. |
| Note/“memory” counts are incremented separately from inserts | `server.mjs` around lines 415 and 421 | Denormalized counters can drift. New dashboard uses query-derived child counts; cross-session memories are deferred. |
| Client contains scripted demo/live-looking interactions | `public/index.html` contains `data-demo` content and scripted timeout interactions around the demo controls | Simulated activity can be mistaken for a live interpretation feature. New workspace is manual-entry only and explicitly says transcription is unavailable. |
| Test coverage is one smoke path | `scripts/smoke.mjs`; `npm test` result above | No evidence for lifecycle, concurrency, authorization matrix, CSRF or exports. New tests add API-level negative and cross-user checks. |

## Suspected / not exhaustively verified

- The precise reachability of every legacy API route without a session was not individually probed.
- Every visual click target in the monolithic page was not browser-walked, so fake-control coverage is not claimed as complete.
- Legacy rate-limit and activity-log retention behavior was not exhaustively tested.

## Retain / repair / replace rationale

- **Retain as requirements, not as a code import:** interpreting-session vocabulary and the basic create/start/complete workflow are useful product intent.
- **Replace:** the monolithic client, seeded demo account and demo data, synchronous password path, and client-authoritative completion logic are unsafe or too entangled to reuse.
- **Rebuild with verification:** persisted preparation, entries, per-session terminology, follow-ups, account lifecycle, summary, exports, owner-scoped queries and version conflicts are implemented behind repository/schema boundaries. The new tests, not the existence of code, are the evidence for the flows marked verified.
- **Original preserved:** the supplied ZIP remains the recovery backup; work was performed in a separate `cadence-reimagined/` folder.
