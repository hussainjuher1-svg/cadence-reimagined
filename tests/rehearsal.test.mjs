import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRehearsalText, formatRehearsalNotes } from '../client/src/rehearsal.js';

const sample = 'The regional transport authority expects annual operating costs to increase by 18.5% by 2030, although the revised baseline assumes a 2.4°C temperature rise if investment is delayed. The International Energy Agency (IEA) estimates that the programme could require $4.2 billion over five years, while the current plan allocates only €3.6 billion.';

test('flags long or multi-clause sentences and preserves decimal values', () => {
  const result = analyzeRehearsalText(sample);
  assert.equal(result.empty, false);
  assert.equal(result.longSentences.length, 2);
  assert.match(result.longSentences[0].sentence, /18\.5%/);
  assert.match(result.longSentences[0].sentence, /2\.4°C/);
  assert.ok(result.longSentences[0].reasons.includes('multiple clause cues'));
});

test('detects number, unit and acronym candidates without claiming they are verified', () => {
  const result = analyzeRehearsalText(sample);
  assert.ok(result.figures.includes('18.5%'));
  assert.ok(result.figures.includes('2.4°C'));
  assert.ok(result.figures.includes('$4.2 billion'));
  assert.ok(result.figures.includes('€3.6 billion'));
  assert.ok(result.acronyms.includes('IEA'));
  assert.ok(result.nameCandidates.some(item => item.includes('International Energy Agency')));
});

test('empty text returns empty findings and no report', () => {
  const result = analyzeRehearsalText('   ');
  assert.equal(result.empty, true);
  assert.equal(formatRehearsalNotes(result), '');
});

test('bounds scanned input and keeps stored report compact without copying whole source sentences', () => {
  const longInput = `${sample} ${'Additional context without figures. '.repeat(500)}`;
  const result = analyzeRehearsalText(longInput);
  assert.equal(result.truncated, true);
  const report = formatRehearsalNotes(result);
  assert.ok(report.length <= 2400);
  assert.ok(report.includes('verify manually'));
  assert.ok(!report.includes(result.longSentences[0].sentence));
});

test('supports non-Latin script when counting source words', () => {
  const result = analyzeRehearsalText('El costo aumentó 12,5 % y llegará a 2030.');
  assert.ok(result.wordCount >= 7);
  assert.ok(result.figures.length > 0);
});

test('keeps range, date and time expressions intact', () => {
  const result = analyzeRehearsalText('Emissions fall from 1,250 to 940 tonnes between 2027 and 2030. The review begins on 2026-10-16 at 14:30.');
  assert.ok(result.figures.includes('1,250 to 940 tonnes'));
  assert.ok(result.figures.includes('2026-10-16'));
  assert.ok(result.figures.includes('14:30'));
});
