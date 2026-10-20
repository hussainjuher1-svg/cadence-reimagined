import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantAnswer, ASSISTANT_PROMPTS } from '../client/src/assistant.js';
import { analyzeRehearsalText } from '../client/src/rehearsal.js';

const sample = 'The regional transport authority expects annual operating costs to increase by 18.5% by 2030, although the revised baseline assumes a 2.4°C temperature rise if investment is delayed. The International Energy Agency (IEA) estimates that the programme could require $4.2 billion over five years, while the current plan allocates only €3.6 billion.';

const workspace = {
  session: { id: 's1', title: 'Climate policy briefing', status: 'scheduled' },
  preparation: { goal: 'Explain the emissions framework.', context: 'A policy briefing for delegates.', instructions: 'Keep terms consistent.', namesPronunciation: '', toneRegister: 'Formal', openQuestions: 'Confirm the exact baseline year and whether IEA figures are provisional.' },
  terms: [
    { id: 't1', sourceTerm: 'emissions', targetTerm: 'émissions', contextRegister: 'Policy' },
    { id: 't2', sourceTerm: 'baseline', targetTerm: 'référence', contextRegister: '' },
  ],
  followups: [
    { id: 'f1', text: 'Send the bilingual glossary to the organizer.', status: 'open' },
    { id: 'f2', text: 'Verify IEA figure source.', status: 'open' },
    { id: 'f3', text: 'Completed task.', status: 'done' },
  ],
};

test('rehearse prompt summarises scan flags and labels them as heuristic', () => {
  const scan = analyzeRehearsalText(sample);
  const answer = assistantAnswer('rehearse', { workspace, rehearsalResult: scan });
  assert.equal(answer.role, 'assistant');
  assert.match(answer.text, /deserves rehearsal/);
  assert.match(answer.text, /Long \/ complex sentences/);
  assert.match(answer.text, /18\.5%/);
  assert.match(answer.text, /IEA/);
  assert.match(answer.text, /not a judgement/i);
});

test('rehearse prompt without a scan gives guidance to scan first', () => {
  const answer = assistantAnswer('rehearse', { workspace });
  assert.match(answer.text, /Nothing has been scanned yet/);
  assert.match(answer.text, /open questions/i);
});

test('figures prompt lists numbers, units and dates from the scan', () => {
  const scan = analyzeRehearsalText(sample);
  const answer = assistantAnswer('figures', { workspace, rehearsalResult: scan });
  assert.match(answer.text, /18\.5%/);
  assert.match(answer.text, /\$4\.2 billion/);
  assert.match(answer.text, /2030/);
  assert.match(answer.text, /does not verify/i);
});

test('figures prompt with no scan instructs to paste first', () => {
  const answer = assistantAnswer('figures', { workspace });
  assert.match(answer.text, /Paste and scan/i);
});

test('acronyms prompt lists uppercase acronym candidates', () => {
  const scan = analyzeRehearsalText(sample);
  const answer = assistantAnswer('acronyms', { workspace, rehearsalResult: scan });
  assert.match(answer.text, /IEA/);
  assert.match(answer.text, /false positives/i);
});

test('terminology prompt compares scan candidates against saved terms and flags gaps', () => {
  const scan = analyzeRehearsalText(sample);
  const answer = assistantAnswer('terminology', { workspace, rehearsalResult: scan });
  assert.match(answer.text, /emissions → émissions/);
  assert.match(answer.text, /International Energy Agency/i);
  assert.match(answer.text, /no saved target equivalent/i);
});

test('terminology prompt with empty session notes no saved terms', () => {
  const empty = { session: {}, preparation: {}, terms: [], followups: [] };
  const answer = assistantAnswer('terminology', { workspace: empty });
  assert.match(answer.text, /No terminology has been saved/);
});

test('unresolved prompt surfaces open questions and open follow-ups', () => {
  const answer = assistantAnswer('unresolved', { workspace });
  assert.match(answer.text, /baseline year/i);
  assert.match(answer.text, /Send the bilingual glossary/i);
  assert.match(answer.text, /Open follow-ups \(2\)/);
});

test('closeout prompt summarises open items for summary writing', () => {
  const answer = assistantAnswer('closeout', { workspace });
  assert.match(answer.text, /Unresolved questions/);
  assert.match(answer.text, /Open follow-ups/);
  assert.match(answer.text, /does not compose one for you/i);
});

test('free-text question routes to the closest topic', () => {
  const scan = analyzeRehearsalText(sample);
  const answer = assistantAnswer('what numbers should I check?', { workspace, rehearsalResult: scan });
  assert.match(answer.text, /18\.5%/);
  assert.match(answer.text, /rules-based helper/i);
});

test('empty free-text returns a help message', () => {
  const answer = assistantAnswer('', { workspace });
  assert.match(answer.text, /Ask about/);
});

test('all declared prompts have a key and label', () => {
  for (const prompt of ASSISTANT_PROMPTS) {
    assert.ok(prompt.key, 'prompt missing key');
    assert.ok(prompt.label, 'prompt missing label');
    assert.doesNotThrow(() => assistantAnswer(prompt.key, { workspace }), `prompt ${prompt.key} threw`);
  }
});

test('answers never claim to translate or verify facts', () => {
  const scan = analyzeRehearsalText(sample);
  for (const key of ['rehearse', 'figures', 'acronyms', 'terminology', 'unresolved', 'closeout']) {
    const answer = assistantAnswer(key, { workspace, rehearsalResult: scan });
    assert.ok(!/i (can|will) translate/i.test(answer.text), `${key} claimed translation`);
    assert.ok(!/this (is |is a )correct/i.test(answer.text), `${key} claimed correctness`);
  }
});
