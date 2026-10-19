const MAX_TEXT = 12000;
const MAX_FINDINGS = 12;
const COMPLEXITY_CUES = /\b(?:although|because|which|that|whereas|while|if|unless|since|despite|provided that|even though|as long as|who|whose|whom|whether|before|after|until|so that|in order to|rather than|given that)\b/giu;
const UNIT_SUFFIX = '(?:%|percent(?:age points?)?|pp|bps|basis points?|kg|kilograms?|g|grams?|mg|mcg|µg|m³|m3|metric tons?|tonnes?|tons?|MW|GW|kWh|MWh|GWh|TWh|ml|mL|lit(?:re|er)s?|km|cm|mm|m²|km²|°C|°F|celsius|fahrenheit|mph|km/h|kPa|MPa|mmHg|mg/dL|USD|EUR|GBP|CAD|AUD|JPY|CNY|INR|BDT|million|billion|thousand|million euros?|billion dollars?)';
const FIGURE_PATTERN = new RegExp(String.raw`(?:[$€£¥₹৳]\s*)?\b\d{1,4}(?:[,\u00A0\u202F ]\d{3})*(?:[.,]\d+)?\b(?:\s?${UNIT_SUFFIX})?(?:\s*(?:-|–|—|to)\s*(?:[$€£¥৳]\s*)?\d{1,4}(?:[,\u00A0\u202F ]\d{3})*(?:[.,]\d+)?(?:\s?${UNIT_SUFFIX})?)?`, 'giu');
const DATE_TIME_PATTERN = /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|\d{1,2}:\d{2}(?:\s?[AP]M)?)\b/giu;
const ACRONYM_PATTERN = /\b(?:[A-Z]{2,}(?:[-/][A-Z0-9]{2,})*|[A-Z]{1,}[0-9]{1,}[A-Z0-9-]*)\b/gu;
const NAME_CANDIDATE_PATTERN = /\b[A-Z][a-z]{2,}(?:(?:\s+(?:of|and|for|the|de|van|von)\s+|\s+)[A-Z][a-z]{2,}){1,3}\b/gu;

function unique(items, limit = MAX_FINDINGS) {
  return [...new Set(items.map(item => item.trim()).filter(Boolean))].slice(0, limit);
}
function words(text) {
  return text.match(/[\p{L}\p{N}]+(?:[.,:/][\p{L}\p{N}]+)*(?:[’'-][\p{L}\p{N}]+)*/gu) || [];
}
function sentenceRanges(text) {
  const sentences = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const mark = text[i];
    if (!'.!?'.includes(mark)) continue;
    if (mark === '.' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '')) continue;
    if (i < text.length - 1 && !/\s/.test(text[i + 1])) continue;
    const value = text.slice(start, i + 1).trim();
    if (value) sentences.push({ sentence: value, start, end: i + 1 });
    start = i + 1;
    while (start < text.length && /\s/.test(text[start])) start += 1;
    i = start - 1;
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push({ sentence: tail, start, end: text.length });
  return sentences.length ? sentences : [{ sentence: text, start: 0, end: text.length }];
}
function splitSentences(text) { return sentenceRanges(text).map(item => item.sentence); }
function contextualCandidates(matches, ranges, limit = MAX_FINDINGS) {
  const seen = new Set();
  const result = [];
  for (const match of matches) {
    const value = String(match.value ?? '').trim();
    if (!value || seen.has(value.toLocaleLowerCase())) continue;
    seen.add(value.toLocaleLowerCase());
    const index = ranges.findIndex(range => match.index >= range.start && match.index < range.end);
    const source = ranges[index] || null;
    result.push({ value, sentenceIndex: index >= 0 ? index + 1 : null, sentence: source?.sentence || '' });
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * A transparent, browser-local heuristic for rehearsal prioritization.
 * It does not translate, interpret, infer meaning, or call a remote service.
 */
export function analyzeRehearsalText(input) {
  const raw = String(input ?? '').replace(/\r\n?/g, '\n').trim();
  const truncated = raw.length > MAX_TEXT;
  const text = raw.slice(0, MAX_TEXT);
  if (!text) return { empty: true, truncated: false, characters: 0, wordCount: 0, longSentences: [], figures: [], acronyms: [], nameCandidates: [] };

  const ranges = sentenceRanges(text);
  const sentenceList = ranges.map(item => item.sentence);
  const longSentences = sentenceList.map((sentence, index) => {
    const wordCount = words(sentence).length;
    const cues = sentence.match(COMPLEXITY_CUES) || [];
    const clauseCount = cues.length;
    const punctuationCues = (sentence.match(/[;:—]/g) || []).length;
    const long = wordCount >= 24;
    const multiClause = wordCount >= 16 && clauseCount >= 2;
    const dense = wordCount >= 18 && punctuationCues >= 1;
    if (!long && !multiClause && !dense) return null;
    const reasons = [];
    if (long) reasons.push('long sentence');
    if (multiClause) reasons.push('multiple clause cues');
    if (dense) reasons.push('dense punctuation');
    return { index: index + 1, sentence, wordCount, reasons };
  }).filter(Boolean).slice(0, 8);

  const dateTimeMatches = [...text.matchAll(DATE_TIME_PATTERN)].map(match => ({ value: match[0], start: match.index, index: match.index, end: match.index + match[0].length }));
  const numericMatches = [...text.matchAll(FIGURE_PATTERN)].filter(match => !dateTimeMatches.some(date => match.index >= date.start && match.index + match[0].length <= date.end)).map(match => ({ value: match[0], index: match.index }));
  const figureContexts = contextualCandidates([...dateTimeMatches, ...numericMatches], ranges);
  const figures = figureContexts.map(item => item.value);
  const acronymContexts = contextualCandidates([...text.matchAll(ACRONYM_PATTERN)].map(match => ({ value: match[0], index: match.index })), ranges);
  const acronyms = acronymContexts.map(item => item.value);
  const nameContexts = contextualCandidates([...text.matchAll(NAME_CANDIDATE_PATTERN)].map(match => ({ value: match[0], index: match.index })), ranges).filter(item => !/^(The|This|That|These|Those|However|Although|Because|According To)$/i.test(item.value));
  const nameCandidates = nameContexts.map(item => item.value);
  return {
    empty: false,
    truncated,
    characters: text.length,
    wordCount: words(text).length,
    longSentences,
    figures,
    figureContexts,
    acronyms,
    acronymContexts,
    nameCandidates,
    nameContexts,
  };
}

/** Keeps saved notes compact: it never copies full source sentences into the record. */
export function formatRehearsalNotes(result) {
  if (!result || result.empty) return '';
  const lines = [
    'PRE-ASSIGNMENT REHEARSAL REVIEW (automated heuristic; verify manually)',
    `Source scan: ${result.wordCount} words; ${result.longSentences.length} sentence(s) flagged for review.`,
  ];
  if (result.longSentences.length) {
    lines.push('Long/complex sentences to rehearse:');
    for (const item of result.longSentences.slice(0, 5)) lines.push(`- Sentence ${item.index} (${item.wordCount} words): rehearse main claim, conditions, contrast and caveats.`);
  }
  if (result.figures.length) lines.push(`Figures / dates / units to verify: ${result.figures.slice(0, 10).join(', ')}. Confirm value, unit, timeframe and comparator.`);
  if (result.acronyms.length) lines.push(`Acronyms to verify and expand: ${result.acronyms.slice(0, 10).join(', ')}.`);
  if (result.nameCandidates.length) lines.push(`Capitalized phrase candidates to verify: ${result.nameCandidates.slice(0, 6).join(', ')}.`);
  lines.push('Practice prompts: identify the central claim; preserve conditions and contrasts; rehearse exact figures with units and comparison baseline; verify acronym expansions and names.');
  lines.push('This scan flags patterns only; it does not verify facts, translations, names or intended meaning.');
  return lines.join('\n').slice(0, 2400);
}
