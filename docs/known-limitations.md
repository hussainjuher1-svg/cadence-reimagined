# Known limitations and feature boundaries

## Working, with verification in automated tests

- Browser-local Preparation Review: deterministic heuristics flag candidate long/complex sentences, number/date/unit expressions, uppercase acronyms and possible multiword capitalized names. The source excerpt is not sent to an API. The result now includes a collapsed one-sentence practice form per heuristic sentence flag and an optional context-anticipation exercise with a user-authored hypothesis plus evidence/alternative. The compact report and user-authored notes can be inserted into the existing preparation questions field; the user must explicitly Save preparation. This feature does not use AI or verify meaning/facts/translations.

- Local signup/signin/signout, cookie-backed auth session, onboarding and account settings.
- Password recovery link creation in local terminal/outbox, token expiry/use checks and active-session revocation after reset. **No email is sent.**
- Session create/list/read/PATCH with idempotency and version conflict, lifecycle start/complete/cancel rules, preparation/checklist, entries, per-session terms, follow-ups, completion, persisted summary and JSON/Markdown export.
- Server computes lifecycle timestamps and duration; user child data is owner-scoped and persists in SQLite.
- Read-only static sample page separated from real tables and real exports.

Use `docs/test-report.md` for exact outcomes; don't infer a feature is fully tested just because its endpoint exists.

## Working but not fully verified

- Full CSS accessibility review across all color schemes/assistive technology and manual keyboard testing.
- Cross-platform Windows/macOS installation and Node `node:sqlite` availability/version behavior; only Linux was run here.
- Edge-case behavior on very long entry streams and all unusual IANA/DST histories.
- Maintenance pruning is implemented, but its scheduled six-hour run has not been load/long-duration tested.

## Deferred — intentionally no primary-workflow UI

- Document upload/OCR/PDF parsing, version comparison, source-linked AI term extraction, live speech transcription, audio capture and AI interpretation/analysis: no provider/parser, no permissions and no controls pretending they exist. The current rehearsal checker uses text-pattern heuristics only.
- Cross-session AI memory, global glossary, automatic term suggestions or reuse: privacy/retention and review semantics require explicit design.
- Independent client portal, invitations, interpreter recruitment/network, payments, billing, advanced analytics, collaboration, PDF export and external integrations.
- Production Supabase/Postgres provider: migration path is documentation only.

## Architecture and security caveats

- Current app deviates from requested React/Vite/TypeScript because npm registry resolution failed during preflight. It uses native browser modules and Node 22's experimental `node:sqlite` API. A Vite production bundle/typecheck is not available in this archive.
- Local development authentication is not production authentication. The app refuses `NODE_ENV=production`; keep the server on loopback and the database/outbox private.
- There is no backup/restore service, no encryption-at-rest layer, no SMTP/email service, and no formal threat/penetration review.
- The sample workspace is fictional, static, read-only, and excluded from user APIs/counts/exports. It does not demonstrate server-backed write capability.


## Preparation Review limits

- Sentence segmentation is punctuation-based and can mishandle abbreviations, quotes, decimals, or unusual punctuation. “Long/complex” flags are heuristic only; no syntax parser is present.
- Number and unit detection uses pattern matching. It may miss locale-specific number formats, ranges or unusual units, and may flag irrelevant values.
- Acronyms are pattern candidates and may not match a true abbreviation. Multiword capitalized phrases are only possible name/term candidates; sentence starts and headings can produce false positives.
- The feature does not translate, verify terminology, fact-check figures, segment meaning reliably, or predict what a speaker will say. The sentence drill requires the interpreter to articulate their own core claim and qualifiers; the context exercise records the interpreter’s hypothesis and its evidence, not an automated prediction. A human must review each flag.
- It is intended for pre-assignment rehearsal, never for typing while listening if doing so would distract from interpretation.
