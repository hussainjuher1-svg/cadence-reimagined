# Cadence product direction — October 2026

## One-line product definition

Cadence is a preparation-and-rehearsal workspace for independent conference interpreters who handle dense technical, policy, financial or institutional source material. The initial job is to help them identify which source-text details deserve rehearsal before an assignment, without pretending to interpret live speech.

## Narrow first customer

- Independent/freelance conference interpreters preparing for technical, policy, financial or institutional sessions.
- They receive slides, briefs or scripts and need to check complex sentences, figures/units, acronyms and unfamiliar names before work begins.
- First target is not all interpreters. Validate one language pair and one broad specialty using real sanitized assignment workflows.

## Current first-release feature: Preparation Review

- Paste a source-text excerpt that the user is permitted to process.
- In the browser, scan for long/complex-sentence candidates, number/date/range/measurement patterns, all-capital acronyms and possible capitalized names/terms.
- Show the original sentence for sentence flags and explain why it was flagged; standalone figure/acronym/name candidates do not yet carry source offsets or document-page provenance.
- Provide practice cues: preserve the main claim, conditions and contrasts; rehearse exact figures with units/timeframe/comparator; verify acronym expansion and names.
- Let the interpreter insert a compact report into preparation questions, inspect it, and explicitly save through the existing preparation form.
- The scan is deterministic and local; it makes no network call and sends no text to a remote AI provider.
- Findings are heuristics, not fact-checking, terminology verification, accurate clause parsing, speaker-intent prediction or interpretation.

## Exact add / defer / reject list

### Add now

- **Local source-text rehearsal review:** the first working feature. Why: directly addresses the user's selected pain point around long sentences, figures and acronyms during preparation, while remaining technically small and testable.
- **Compact practice prompts and sentence drill:** ask the interpreter to write their own core claim and identify conditions/contrasts/caveats, plus check figures with units, timeframe and comparator. Why: turns detection into an active rehearsal task while avoiding unsupported machine interpretation. Sentence notes are collapsed until requested to limit clutter.
- **Explicit uncertainty and provenance language:** show that each flag is heuristic and require human verification. Why: interpreter research shows cautious openness to technology, with cognitive-load and ethics concerns.
- **Permission-aware data copy:** warn users not to paste restricted/client-sensitive material unless allowed; local-only scan; explicit save. Why: confidentiality policies vary by institution and assignment.
- **Context anticipation exercise (optional and collapsed):** the interpreter records a likely next point and the evidence/alternative they considered. Why: supports deliberate preparation without automated speaker-intent claims. It remains a user-authored hypothesis, not an AI prediction.
- **A simple first-use guide:** Prepare → Rehearse → Work → Review. Why: the existing product was unclear to a first-time user.
- **Exportable preparation notes:** keep output compact, editable and portable. Why: avoid trapping the user's work in Cadence.

### Add only after validation

- **Packet inventory and missing-material checklist.** Why: plausible problem, but prove users repeatedly receive multi-file packets and need this layer.
- **Document version comparison / change report.** Why: differentiated hypothesis for revised slides/materials; it needs robust parsing and a test set before promising accuracy.
- **Source-linked candidate terminology with verify/reject/correct states.** Why: useful next step, but don't make a generated glossary the generic main promise.
- **Approved personal term memory and correction history.** Why: recurring verified knowledge might accumulate into value; only build after permissions, cross-client boundaries, delete/export and confidentiality rules are settled.
- **A narrowly defined domain pack** (technical, finance/policy, or another confirmed segment). Why: narrower data and evaluation standards can beat vague breadth, but the first domain must come from interviews.
- **Remote-session readiness checklist.** Why: useful companion if customer interviews show it is part of the same buyer's repeat workflow.
- **Medical pre-briefing workflow.** Why: separate evidence-backed opportunity, but likely a separate niche and compliance workflow; don't mix it into the first conference-interpreter product.
- **Beginner drills and skill review.** Why: meaningful for training, but a different user/job and competitors already provide practice content.
- **Calendar/admin interoperability.** Why: useful later, but generic scheduling, invoicing and agency management already have focused products.

### Explicitly do not add to the first release

- **Live interpreting / auto-translation / transcript capture.** Why: different reliability, latency, audio and confidentiality problem; current product has no audio/ASR provider.
- **An AI chatbot that claims to understand everything.** Why: broad, difficult to evaluate, adds cognitive burden and is easy to commoditize.
- **Automatic speaker-intent predictions presented as fact.** Why: context can support hypotheses, not reliable claims about what someone will say. At most show clearly labelled questions to investigate, tied to sources.
- **Medical/legal decision support or suggested clinical/legal answers.** Why: high-consequence work requires specialist governance and must preserve role boundaries.
- **Generic glossary generation as the core differentiator.** Why: established competitors already extract and translate terms from documents and generate practice speeches.
- **Agency marketplace, recruitment, CRM, invoices, payroll, tax tools and broad client portals.** Why: different buyers, operational burden and active competition.
- **Burnout diagnosis, therapy chatbot or emotional-surveillance analytics.** Why: sensitive, clinically inappropriate for a first product, and doesn't solve the preparation workflow.
- **Qualification/certification advice across every jurisdiction.** Why: requirements differ by jurisdiction and change. Potential future career guide must be jurisdiction- and source-specific.
- **Fake dashboard metrics, noisy progress gamification, glow effects, extra navigation or placeholder AI buttons.** Why: increases clutter without improving the core job.

## Point-by-point pain map

| Pain | What people do manually | First product response | First-release decision |
|---|---|---|---|
| 1. Unfamiliar or late assignment material | Read decks/docs, search web, ask organizer, build glossary, reuse old files | Local rehearsal review now; inventory/missing-material report later | Narrow support now; packet automation later |
| 2. Dense sentences, numbers, names, units, acronym load | Take notes, anticipate from context, practise speeches, check references, rehearse number rendering | Flag sentence/figure/acronym candidates and provide practice cues before the assignment | **First feature now**; no promise to solve live cognition automatically |
| 3. Remote audio/logistics | Test headset/network, message organizer, reconnect, request repetitions | Simple preflight checklist later; do not build conferencing infrastructure first | Defer until validated with the same users |
| 4. Sensitive encounters with missing context | Request a pre-brief, study terms, ask permitted clarifying questions | Medical pre-brief checklist and missing-context questions | Separate later niche; do not mix with first launch |
| 5. Fatigue and emotional load | Breaks, colleague support, debriefing, personal routines | Low-friction break/workload prompts only if requested | No wellbeing bot or diagnosis |
| 6. Repeated administration | Copy dates across calendars, track hours, expenses, invoices across tools | Import/export or lightweight integrations after primary value is proven | No CRM or invoicing now |
| 7. Beginner uncertainty | Search association/certification sites, ask mentors, take courses, practice | Source-backed jurisdiction-specific learning paths if validated | Later product line, not first-release scope |

## Main product trap

The trap is turning every pain point into a module. These pain points span different buyers (freelancer, healthcare interpreter, agency coordinator, training institution), jobs and risk models. A product becomes crowded and weak if those users are treated as one persona. Begin with one user, one frequent job and one measurable outcome; expand only when repeat use proves adjacency.

## Pain-point-two boundary

Pain point 2 is not a realistic problem for Cadence to “solve” by prompting a person during a live interpretation. The first product can support preparation: flag a likely dense sentence, let the interpreter write a short core-claim and condition/contrast cue, rehearse a figure with its unit/timeframe/comparator, verify an acronym/name, and form their own context hypothesis with evidence plus an alternative. It must not pretend to parse meaning reliably or predict the speaker.

Speech-practice content is not an empty market. The European Commission's Speech Repository offers thousands of practice speeches across multiple languages, and InterpretBank can generate training speeches using glossary terms. That makes generic speech generation a poor initial differentiator. Test the workflow against real (permitted/sanitized) assignment material, with a user's own correction and preparation history, before expanding into generated practice material.

## Validation gates

Treat these as experiment targets, not market benchmarks:

- Interview 15–20 interpreters in one defined segment; ask them to walk through their most recent actual preparation workflow using sanitized materials.
- Run a concierge test on five permitted source packets. Measure time to find useful rehearsal items, review burden, false positives and whether the interpreter reuses the report.
- Test if at least three of five pilot users voluntarily return for a second assignment; test payment with at least two. If not, revisit the problem before adding features.
- Do not claim percentage time savings until measured against a baseline.

## Evidence and its limits

- 496 conference interpreters, mostly AIIC members, were surveyed on technology readiness, with 25 interviews. Findings reported cautious openness with cognitive-load and ethical concerns: https://www.benjamins.com/catalog/intp.00110.fan
- 397 conference interpreters answered a practitioner survey about AI and confidentiality. It reports uneven use of dedicated AI preparation tools and raises confidentiality/accuracy concerns; it is not a random global sample: https://interpretersoapbox.com/ai-tools-confidentiality-conference-interpreters-survey/
- A 2024 study with 23 professional simultaneous interpreters tested subtitle accuracy and cognitive load under controlled conditions. It is a small experimental study, not proof that any particular product improves real-world work: https://www.benjamins.com/catalog/intp.00111.li
- A 94-respondent healthcare-interpreter survey found lack of prior context and guilt around delivering bad news among common concerns, and suggested prebriefing and debriefing. Its results are specific to healthcare/difficult conversations and do not justify blending healthcare into the first conference-interpreter niche: https://pubmed.ncbi.nlm.nih.gov/34312185/
- InterpretBank already advertises document-based glossary creation, automatic term translation, topic glossaries, training speeches, fast lookup and live transcription; its docs describe local and cloud approaches. Do not claim these features are absent in the market: https://interpretbank.com/ ; https://interpretbank.com/docs/desktop.html ; https://interpretbank.com/docs/asr.html
- A nearly 500-interpreter survey examined glossary practice and how professionals prepare/manage glossaries: https://www.benjamins.com/catalog/intp.15.1.04jia

## Status labels

- **FACT:** directly supported by a cited source or the current code.
- **INFERENCE:** product interpretation of the evidence.
- **HYPOTHESIS:** a specific claim to test with users before building more.
