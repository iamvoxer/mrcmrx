import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { formatCwdMismatchWarning, formatRoomCreatePathHint } from './ux-hints.js';

test('formatRoomCreatePathHint mentions cd and -p when paths differ', () => {
  const projectPath = path.join('C:', 'Work', '2026', 'mrcmrx', 'test1');
  const hint = formatRoomCreatePathHint(projectPath);
  assert.match(hint, /Important/);
  assert.match(hint, /cd .+test1/);
  assert.match(hint, /-p .+test1/);
  assert.match(hint, /config proxy set/);
});

test('formatCwdMismatchWarning is generic (no hardcoded project name)', () => {
  const msg = formatCwdMismatchWarning('C:\\parent', 'C:\\parent\\child', 'C:\\parent\\child');
  assert.match(msg, /⚠/);
  assert.match(msg, /Room\.projectPath/);
  assert.doesNotMatch(msg, /test1/);
});
