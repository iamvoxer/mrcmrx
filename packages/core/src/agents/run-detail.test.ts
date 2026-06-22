import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRunDetail, formatAgentCommand } from './run-detail.js';

test('formatAgentCommand quotes paths with spaces', () => {
  const cmd = formatAgentCommand('C:\\Program Files\\codex.exe', ['exec', '-C', 'C:\\my project']);
  assert.ok(cmd.includes('"C:\\Program Files\\codex.exe"'));
  assert.ok(cmd.includes('"C:\\my project"'));
});

test('buildRunDetail captures invocation', () => {
  const detail = buildRunDetail('msg-1', {
    text: 'hello',
    stderr: 'warn',
    exitCode: 0,
    invocation: {
      provider: 'codex',
      label: 'codex exec resume',
      bin: 'codex.exe',
      args: ['-a', 'never', 'exec', 'resume'],
      cwd: 'C:\\proj',
      stdin: 'prompt text',
    },
    stdoutRaw: '{"type":"item.completed"}',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:03.000Z',
    durationMs: 3000,
  });
  assert.ok(detail);
  assert.equal(detail!.id, 'msg-1');
  assert.equal(detail!.provider, 'codex');
  assert.ok(detail!.command.includes('codex.exe'));
  assert.equal(detail!.stdin, 'prompt text');
});

test('buildRunDetail captures spawn env meta', () => {
  const detail = buildRunDetail('msg-2', {
    text: 'ok',
    stderr: '',
    exitCode: 0,
    invocation: {
      provider: 'codex',
      label: 'codex exec',
      bin: 'codex.exe',
      args: [],
      cwd: 'C:\\proj',
    },
    spawnEnv: {
      rgPath: 'C:\\tools\\rg.exe',
      pathPrefix: ['C:\\tools', 'C:\\Program Files\\Git\\cmd'],
    },
  });
  assert.equal(detail!.rgPath, 'C:\\tools\\rg.exe');
  assert.deepEqual(detail!.pathPrefix, ['C:\\tools', 'C:\\Program Files\\Git\\cmd']);
});
