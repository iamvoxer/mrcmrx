import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAgentRunOk, formatAgentRunFailure } from './agents/agent-run.js';
import { MrcxError } from './services/context.js';

test('assertAgentRunOk rejects failed runs', () => {
  assert.throws(
    () => assertAgentRunOk('Codex', { text: 'hi', exitCode: 1, stderr: 'boom' }),
    MrcxError,
  );
  assert.throws(
    () => assertAgentRunOk('Cursor', { text: '', exitCode: 0, stderr: '', timedOut: true }),
    MrcxError,
  );
  assert.doesNotThrow(() =>
    assertAgentRunOk('Codex', { text: 'ok', exitCode: 0, stderr: '' }),
  );
});

test('formatAgentRunFailure includes exit code', () => {
  const msg = formatAgentRunFailure('Cursor', { text: '', exitCode: 2, stderr: 'auth required' });
  assert.match(msg, /exit 2/);
  assert.match(msg, /auth required/);
});
