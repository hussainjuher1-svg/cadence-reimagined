# Market evidence notes — interpreter workflows

Research date: 2026-10-16. This is a representative public-source scan, not a census of private requests, internal agency tickets or every language/region.

## Supported observations

- **FACT — cautious openness to technology.** A 2024 study surveyed 496 conference interpreters, mostly AIIC members, and interviewed 25; the authors report cautious openness to AI/digital technologies balanced against cognitive-load, ethical and skill concerns. This does not prove a given product gap. https://www.benjamins.com/catalog/intp.00110.fan
- **FACT — tools and confidentiality are linked.** A 2024 practitioner survey with 397 conference interpreter respondents examines AI use for summarization, terminology extraction, glossary creation and transcription, plus confidentiality practices. It is self-selected and should not be interpreted as a population-representative adoption rate. https://interpretersoapbox.com/ai-tools-confidentiality-conference-interpreters-survey/
- **FACT — terminology preparation is established work.** A survey of nearly 500 interpreters investigated glossary practices in simultaneous interpreting. https://www.benjamins.com/catalog/intp.15.1.04jia
- **FACT — subtitle support is plausible but not settled.** A 2024 controlled study involved 23 professional simultaneous interpreters and tested ASR subtitles with different levels of accuracy, using performance and cognitive-load measurements. Small sample and study setup limit product extrapolation. https://www.benjamins.com/catalog/intp.00111.li
- **FACT — healthcare prebriefing has a distinct need.** A study of 94 healthcare interpreters identified not knowing the conversation content beforehand and difficulty delivering bad news among common concerns, and recommended prebriefing/debriefing. Do not generalize these findings to all interpreters. https://pubmed.ncbi.nlm.nih.gov/34312185/
- **FACT — generic glossary generation is already competitive.** InterpretBank currently lists document ingestion, glossary extraction and translation, topic-based glossaries, practice speech generation, term lookup and live transcription, including documented local/cloud paths. https://interpretbank.com/ ; https://interpretbank.com/docs/desktop.html ; https://interpretbank.com/docs/asr.html

## What we have not proved

- Which pain ranks first by willingness to pay.
- That last-minute document version changes occur often enough in one chosen segment to support a standalone product.
- That interpreters want automated sentence, number or acronym flags in their existing preparation workflow.
- That a browser-local regex prototype saves net preparation time after false positives are reviewed.
- That the target segment is reachable at an affordable customer-acquisition cost.
- That current competitors fail to support change detection across all relevant document types.

## Competitive evaluation tasks before any major build

Test current versions, with a fixed public/fictitious packet, of: InterpretBank (document glossary creation, source traceability, practice, local/cloud controls), at least one general AI workflow used by interpreters, and the user's current manual workflow. Record outputs, human correction time, false positives, missing terms, privacy controls and export effort. Do not make “no competitor has feature X” claims without this hands-on test.
