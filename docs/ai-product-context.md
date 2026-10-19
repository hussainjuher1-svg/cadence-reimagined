# Cadence AI/product context — compact implementation brief

Use this as the standing context for future coding tasks in this repository. It is intentionally narrow; do not paste a generic “build an all-in-one AI interpreter platform” prompt.

## Product

- **Target user:** independent/freelance conference interpreter preparing for dense technical, policy, financial or institutional material.
- **First job:** decide what to rehearse in permitted source text before the assignment: complex/long sentence candidates, figures/units/ranges, acronyms and possible names/terms.
- **Current feature:** `client/src/rehearsal.js` runs deterministic pattern detection in the browser. Results are heuristic; long-sentence flags show the pasted sentence in context, while number/acronym/name lists are candidates only. Precise document/page provenance is not implemented. The compact summary does not copy full source sentences into saved notes.
- **Current limits:** no microphone access, transcription, live interpretation, automatic translation, remote AI provider or file upload. Don't claim otherwise.
- **Core principle:** show evidence and uncertainty, preserve interpreter control, reduce time to useful preparation, don't distract during live delivery.

## Constraints for every implementation

- Keep current real account/session/preparation/terminology/entry/follow-up/export flows functional.
- Use existing design tokens and low-decoration warm-white/graphite/evergreen UI. No glow/dot backgrounds, gratuitous shadows, neon gradients, fake metrics or dead buttons.
- Do not add new navigation modules until a user need is validated.
- Keep browser-local source-text scan offline. Never add a remote API or upload source text without explicit, informed user action and a real provider/security design.
- Every finding must be labelled as a candidate/heuristic until human-verified; do not output an automatically “correct” translation or claim to predict intent.
- Respect client confidentiality: warning before use, minimum collection, explicit save, edit/delete/export.
- Any new interaction must do real work, show loading/success/error feedback where appropriate and be keyboard/mobile accessible.
- Add deterministic tests for extracted patterns, multilingual Unicode, empty input, bounds and report-length limits; run `npm run lint`, `npm run build`, and `npm test`.
- Update `docs/product-direction.md`, `docs/market-evidence.md`, `docs/known-limitations.md` and this file if the product scope changes.

## Decision filter

Before implementing a feature, answer these points in this order:

1. Which exact interpreter segment needs it?
2. What manual task are they repeating today?
3. What evidence shows the task is frequent and costly?
4. Why do current tools/workarounds fail for this segment?
5. What is the smallest real workflow that changes the outcome?
6. How will we measure time saved, corrections, repeat use and willingness to pay?
7. What new accuracy, privacy, safety or maintenance risks does it create?
8. If those answers are missing, add it to research backlog rather than the primary UI.

## Roadmap order

1. Validate local rehearsal review and the manual sentence/context drills with real permitted material.
2. If useful, build packet inventory and robust source-linked document parsing.
3. If the evidence supports it, build version-aware change detection and reviewed terminology candidates.
4. Only later consider domain-specific packs, healthcare prebriefing, remote readiness, learning tools or admin integration as separate evidence-gated expansions.
