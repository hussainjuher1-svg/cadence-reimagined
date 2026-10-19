import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateTimeToUtc, validTimeZone } from '../server/time.mjs';
import { HttpError } from '../server/errors.mjs';

test('time-zone conversion validates IANA zones and daylight-saving gaps/overlaps', () => {
  assert.equal(validTimeZone('Asia/Dhaka'), true);
  assert.equal(validTimeZone('Not/AZone'), false);
  assert.throws(() => localDateTimeToUtc('2026-03-08T02:30','America/New_York'), error => error instanceof HttpError && error.code === 'NONEXISTENT_LOCAL_TIME');
  // During a fall-back overlap, 01:30 occurs twice; the contract selects the earliest instant.
  assert.equal(localDateTimeToUtc('2026-11-01T01:30','America/New_York'),'2026-11-01T05:30:00.000Z');
  assert.throws(() => localDateTimeToUtc('2026-10-15T10:30','Not/AZone'), error => error instanceof HttpError && error.code === 'INVALID_TIMEZONE');
  assert.throws(() => localDateTimeToUtc('2026-02-30T10:30','UTC'), error => error instanceof HttpError && error.code === 'INVALID_SCHEDULE');
});
