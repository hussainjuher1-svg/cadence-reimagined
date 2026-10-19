# Design review

## Review questions by screen

| Screen | User goal / primary action | Necessary information kept visible | Removed / limited | Truth check and review status |
|---|---|---|---|---|
| Homepage | Understand Cadence and create account | Intended user, prepare/work/review workflow, real capabilities, privacy boundary | No decorative KPI, fake tour, repetitive promotional bands or fake AI claims | Copy states transcription/AI are unavailable; static page and route smoke check. Responsive screenshot/overflow check status in test report. |
| Sign in / sign up / recovery | Authenticate or recover local account | Local-mode notice, labelled input errors, truthful mailer explanation | No seeded login or demo credential | Server response gates the state change; reset makes no email claim. |
| Onboarding | Save name, language defaults and timezone | Four small optional/default fields and an explicit next action | No long questionnaire or forced animation | Persisted onboarding and route-on-return tested via API; browser journey status in report. |
| Dashboard | Return to in-progress/next session or create one | Actual date, saved next session, computed prep summary, upcoming and recent rows | No decorative counts, fabricated activity or sample records | API-backed query, real session records; empty state does not invent work. |
| Create/edit session | Record known assignment facts | Required title/language/time/timezone, optional client label | No silent default title/client or stale metadata overwrite | Server validates requirements, converts local time, idempotency/version contracts. |
| Preparation | Prepare and rehearse before a session | Goal/context/instructions; optional details; explicit checklist; browser-local rehearsal scan for complex sentence, figure/unit, acronym and possible name candidates | No AI claims, no automatic translation, no false certainty | Scan is deterministic pattern matching; review report must be manually inspected and explicitly saved. Unit tests cover example figures, decimal handling, text bounds and non-Latin word counting. |
| Workspace | Record manual stream, terms and follow-ups | Session header, current status and timer, one focused work surface | No scripted live stream, fake AI alert or transcription button | Content is loaded from aggregated workspace API; timer derives from server timestamps. |
| Finish / summary | Review then complete/export | Duration preview, actual entries/terms/follow-ups, user-written summary | No generated narrative | Server completes record; completed data reload equality and exports API tested. |
| Settings | Change preferences/password or delete account | Minimal preferences and explicit deletion warning | Billing, profile extras, theme and integrations | Settings API/ownership and deletion cascade tests. |
| Sample page | See the workflow without mixing sample content into personal data | Persistent sample/read-only warning, fixed fictional arts-workshop data | No save controls or live/AI claims | Standalone HTML not sent through real user API; excluded from exports and dashboard. |

## System consistency

- `tokens.css` is the color/typography/spacing source; `lint.mjs` rejects raw color literals in component CSS, inline styles, unsafe HTML insertion, browser localStorage, external runtime links and selected legacy demo markers. The palette is warm white/graphite/evergreen; the wordmark has no decorative dot and cards/buttons do not use glow shadows.
- The same public and app navigation/wordmark carries across pages. One font stack is declared, with system fallback. The header places core session metadata once.
- Below 320 CSS px overflow, desktop/mobile keyboard paths and assistive-technology behavior should be checked on real target platforms before deployment; the local Chromium automation is a useful regression check, not a replacement for a manual WCAG evaluation.
- The browser E2E run was attempted but Chromium navigation to loopback was blocked by environment policy (`net::ERR_BLOCKED_BY_ADMINISTRATOR`). No browser screenshot or visual confirmation is claimed for this build; manual Windows/Edge review is still needed.
