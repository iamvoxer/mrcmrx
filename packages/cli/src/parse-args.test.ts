import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForwardArgs, parseForwardCToXArgs } from './parse-args.js';

test('parseForwardArgs: npm positional last + note', () => {
  const r = parseForwardArgs(['1', 'Execute per this conclusion'], {});
  assert.equal(r.last, 1);
  assert.equal(r.note, 'Execute per this conclusion');
});

test('parseForwardArgs: note only when last omitted', () => {
  const r = parseForwardArgs(['Note text only'], {});
  assert.equal(r.last, 1);
  assert.equal(r.note, 'Note text only');
});

test('parseForwardArgs: flags win when present', () => {
  const r = parseForwardArgs([], { last: '2', note: 'from flag' });
  assert.equal(r.last, 2);
  assert.equal(r.note, 'from flag');
});

test('parseForwardCToXArgs: trailing diff token', () => {
  const r = parseForwardCToXArgs(['1', 'Please review', 'diff'], {});
  assert.equal(r.last, 1);
  assert.equal(r.note, 'Please review');
  assert.equal(r.includeDiff, true);
});
