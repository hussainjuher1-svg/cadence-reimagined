import { analyzeRehearsalText } from './rehearsal.js';

const PROMPT_KEYS = ['rehearse', 'figures', 'acronyms', 'terminology', 'unresolved', 'closeout'];

function lead(text) { return { role: 'assistant', text }; }
function bullets(items) { return items.map(item => `- ${item}`).join('\n'); }

function cleanList(items, limit = 10) {
  const seen = new Set(); const out = [];
  for (const item of items) {
    const value = String(item ?? '').trim();
    if (!value || seen.has(value.toLocaleLowerCase())) continue;
    seen.add(value.toLocaleLowerCase()); out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function truncate(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function assistantAnswer(promptKey, context = {}) {
  const { workspace = null, rehearsalResult = null } = context;
  const scan = rehearsalResult && !rehearsalResult.empty ? rehearsalResult : null;
  const prep = workspace?.preparation || {};
  const terms = workspace?.terms || [];
  const followups = workspace?.followups || [];
  if (!PROMPT_KEYS.includes(promptKey)) return lead(freeTextAnswer(promptKey, scan, workspace));
  const key = promptKey;
  if (key === 'rehearse') return lead(rehearseAnswer(scan, workspace));
  if (key === 'figures') return lead(figuresAnswer(scan));
  if (key === 'acronyms') return lead(acronymsAnswer(scan));
  if (key === 'terminology') return lead(terminologyAnswer(scan, terms));
  if (key === 'unresolved') return lead(unresolvedAnswer(prep, followups));
  if (key === 'closeout') return lead(closeoutAnswer(prep, followups, terms));
  return lead(freeTextAnswer(promptKey, scan, workspace));
}

function matchFreeText(text) {
  const q = String(text || '').toLocaleLowerCase();
  if (!q) return 'rehearse';
  if (/\b(rehearse|rehears|practice|prepare|difficult|complex|long sentence)\b/.test(q)) return 'rehearse';
  if (/\b(figure|number|numeric|amount|percentage|percent|unit|date|range)\b/.test(q)) return 'figures';
  if (/\b(acronym|abbreviation|initialism|capital)\b/.test(q)) return 'acronyms';
  if (/\b(term|terminology|glossary|word|phrase|equiv)\b/.test(q)) return 'terminology';
  if (/\b(unresolved|open question|question|follow.?up|outstanding|gap|missing)\b/.test(q)) return 'unresolved';
  if (/\b(closeout|close out|finish|summary|wrap|debrief)\b/.test(q)) return 'closeout';
  return 'rehearse';
}

function rehearseAnswer(scan, workspace) {
  if (!scan) {
    const tips = ['Paste a permitted source-text excerpt into Preparation Review and run the scan first.', 'The scan flags long or complex sentences, figures/units, acronyms and possible names — all as heuristic cues.', 'Review every flag yourself; the scan does not interpret meaning or produce a translation.'];
    const openQ = workspace?.preparation?.openQuestions?.trim();
    if (openQ) tips.push(`You have saved open questions to revisit: ${truncate(openQ, 160)}`);
    return `Nothing has been scanned yet, so there are no rehearsal cues to summarise.\n\n${bullets(tips)}`;
  }
  const lines = [`Here is what deserves rehearsal based on the local text scan (${scan.wordCount} words checked).`];
  if (scan.longSentences.length) { lines.push(`\nLong / complex sentences (${scan.longSentences.length}):`); lines.push(bullets(scan.longSentences.slice(0, 5).map(s => `Sentence ${s.index} (${s.wordCount} words) — ${s.reasons.join(', ')}. Rehearse the main claim, conditions and contrast.`))); }
  if (scan.figures.length) lines.push(`\nFigures / units to check (${scan.figures.length}): ${cleanList(scan.figures, 10).join(', ')}. Confirm value, unit, timeframe and comparison baseline.`);
  if (scan.acronyms.length) lines.push(`\nAcronyms to expand and verify (${scan.acronyms.length}): ${cleanList(scan.acronyms, 10).join(', ')}.`);
  if (scan.nameCandidates.length) lines.push(`\nPossible names / terms (${scan.nameCandidates.length}): ${cleanList(scan.nameCandidates, 6).join(', ')}. These are candidates only — verify each manually.`);
  if (!scan.longSentences.length && !scan.figures.length && !scan.acronyms.length && !scan.nameCandidates.length) lines.push('\nNo heuristic flags were found in this excerpt. That does not mean the text is easy — use your own judgement.');
  lines.push('\nEvery cue above is a pattern flag, not a judgement of meaning or translation quality. Verify before use.');
  return lines.join('\n');
}

function figuresAnswer(scan) {
  if (!scan) return 'Paste and scan a permitted excerpt first. The figures list is produced by the same local text-pattern scan as Preparation Review.';
  if (!scan.figures.length) return 'No number, unit, date or range patterns were found in the scanned excerpt. If you expected figures, try a longer excerpt or check the format.';
  const lines = [`Figures, units, dates and ranges found in the scanned text (${scan.figures.length}):`];
  lines.push(bullets(cleanList(scan.figures, 12)));
  lines.push('\nFor each: confirm the exact value, the unit, the timeframe, and the comparison baseline. The scan does not verify that these numbers are correct.');
  return lines.join('\n');
}

function acronymsAnswer(scan) {
  if (!scan) return 'Paste and scan a permitted excerpt first. All-capital acronyms are detected by the local text-pattern scan.';
  if (!scan.acronyms.length) return 'No all-capital acronyms were found in the scanned excerpt.';
  const lines = [`Acronym candidates found (${scan.acronyms.length}):`];
  lines.push(bullets(cleanList(scan.acronyms, 12).map(v => `${v} — look up the full form and the target-language convention.`)));
  lines.push('\nThese are pattern candidates; some may be false positives. Verify each expansion against a reliable source.');
  return lines.join('\n');
}

function terminologyAnswer(scan, terms) {
  const lines = [];
  if (terms.length) { lines.push(`Saved terminology for this session (${terms.length} term${terms.length === 1 ? '' : 's'}):`); lines.push(bullets(terms.slice(0, 10).map(t => `${t.sourceTerm} → ${t.targetTerm}${t.contextRegister ? ` (${truncate(t.contextRegister, 60)})` : ''}`))); }
  else lines.push('No terminology has been saved for this session yet.');
  const nameCandidates = scan ? cleanList(scan.nameCandidates, 8) : [];
  const savedSources = new Set(terms.map(t => t.sourceTerm.toLocaleLowerCase()));
  const gaps = nameCandidates.filter(name => !savedSources.has(name.toLocaleLowerCase()));
  if (gaps.length) { lines.push('\nPossible terminology gaps — these capitalized candidates appear in the scanned text but have no saved target equivalent:'); lines.push(bullets(gaps.map(g => `${g} — verify whether it is a proper name or term, then add it to terminology if needed.`))); }
  else if (scan && nameCandidates.length) lines.push('\nAll capitalized candidates from the scan already have a saved source term. Check whether the existing targets cover the usage in this excerpt.');
  else if (scan) lines.push('\nNo capitalized name/term candidates were found in the scanned text, so no terminology gaps were detected by the pattern scan.');
  lines.push('\nThis is a heuristic comparison, not a semantic match. Verify each candidate manually.');
  return lines.join('\n');
}

function unresolvedAnswer(prep, followups) {
  const lines = [];
  const openQ = prep.openQuestions?.trim();
  if (openQ) { lines.push('Your saved open questions and unresolved terminology:'); lines.push(truncate(openQ, 400)); }
  else lines.push('No open questions have been recorded in preparation yet.');
  const open = followups.filter(f => f.status === 'open');
  if (open.length) { lines.push(`\nOpen follow-ups (${open.length}):`); lines.push(bullets(open.slice(0, 8).map(f => truncate(f.text, 120)))); }
  else lines.push('\nNo open follow-ups for this session.');
  const incomplete = [];
  if (!prep.goal?.trim()) incomplete.push('session goal');
  if (!prep.context?.trim()) incomplete.push('assignment context');
  if (!prep.instructions?.trim()) incomplete.push('interpretation instructions');
  if (incomplete.length) lines.push(`\nPreparation fields still blank: ${incomplete.join(', ')}. Consider filling them so you have the full picture.`);
  lines.push('\nResolve each item before the assignment; update preparation when you have answers.');
  return lines.join('\n');
}

function closeoutAnswer(prep, followups, terms) {
  const lines = ['Here is a summary of what is still open, to help you write your closeout notes.'];
  const openQ = prep.openQuestions?.trim();
  const open = followups.filter(f => f.status === 'open');
  if (openQ) lines.push(`\nUnresolved questions: ${truncate(openQ, 300)}`);
  if (open.length) lines.push(`\nOpen follow-ups (${open.length}): ${bullets(open.slice(0, 6).map(f => truncate(f.text, 100)))}`);
  if (terms.length) lines.push(`\nTerminology recorded: ${terms.length} term${terms.length === 1 ? '' : 's'}. Review whether any target equivalents need a correction note.`);
  if (!openQ && !open.length) lines.push('\nNo open questions or follow-ups remain. You can write a concise summary of what was covered.');
  lines.push('\nThis is drawn from your own saved data, not generated analysis. Write your own summary; Cadence does not compose one for you.');
  return lines.join('\n');
}

function freeTextAnswer(text, scan, workspace) {
  const q = String(text || '').trim();
  if (!q) return 'Ask about what to rehearse, which figures or acronyms to check, terminology gaps, or unresolved questions. I answer from your saved session data and the local text scan.';
  const matched = matchFreeText(q);
  const response = assistantAnswer(matched, { workspace, rehearsalResult: scan });
  return `${response.text}\n\n(This answer was matched from your question to the closest preparation topic. It is a rules-based helper, not a language model — verify everything against approved sources.)`;
}

export const ASSISTANT_PROMPTS = [
  { key: 'rehearse', label: 'What should I rehearse?' },
  { key: 'figures', label: 'Which figures need checking?' },
  { key: 'acronyms', label: 'Which acronyms are unverified?' },
  { key: 'terminology', label: 'Are there gaps in my terminology?' },
  { key: 'unresolved', label: "What's still unresolved?" },
];
