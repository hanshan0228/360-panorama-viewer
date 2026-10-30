import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationAgeError, MINIMUM_REGISTRATION_AGE, AGE_SCREEN_ERROR, AGE_SCREEN_DENIED } from '../src/utils/registrationAge.mjs';

test('18+ eligibility changes on the birthday, using a consistent UTC date', () => {
  assert.equal(MINIMUM_REGISTRATION_AGE, 18);
  const now = new Date('2026-10-25T00:01:00Z');
  assert.equal(registrationAgeError('2008-10-25', now), null);
  assert.equal(registrationAgeError('2008-10-26', now), AGE_SCREEN_DENIED);
  assert.equal(registrationAgeError('1990-01-01', now), null);
  assert.equal(registrationAgeError('2020-01-01', now), AGE_SCREEN_DENIED);
});

test('dates must be real calendar dates, not normalized or coerced inputs', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  for (const input of [undefined, null, 19900101, {}, [], '', '1990-1-01', '1990-01-01T00:00:00Z', '2026-10-26', '2008-02-30', '2007-02-29', '0000-01-01', '1899-12-31']) {
    assert.equal(registrationAgeError(input, now), AGE_SCREEN_ERROR, JSON.stringify(input));
  }
});

test('February 29 birthdays reach the threshold on March 1 in non-leap years', () => {
  assert.equal(registrationAgeError('2008-02-29', new Date('2026-02-28T23:59:59Z')), AGE_SCREEN_DENIED);
  assert.equal(registrationAgeError('2008-02-29', new Date('2026-03-01T00:00:00Z')), null);
});
