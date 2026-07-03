import assert from 'node:assert/strict';
import test from 'node:test';
import { importRowNumber } from './import.js';

test('uses the logical spreadsheet row supplied by the CSV parser', () => {
  assert.equal(importRowNumber({ __row: 7 }, 0), 7);
  assert.equal(importRowNumber({ row: 12 }, 1), 12);
});

test('falls back to the array position for legacy API callers', () => {
  assert.equal(importRowNumber({}, 0), 2);
  assert.equal(importRowNumber({ __row: 'invalid' }, 3), 5);
});
