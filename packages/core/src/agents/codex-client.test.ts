import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCodexCreateArgs,
  buildCodexResumeArgs,
  codexAddDirArgs,
  codexExtraDirConfigArgs,
  codexExtraArgs,
  extractCodexDisplayText,
  extractCodexChatText,
  CodexJsonlStreamParser,
} from './codex-client.js';

test('codexExtraArgs includes skip-git-repo-check by default', () => {
  const args = codexExtraArgs({});
  assert.ok(args.includes('--skip-git-repo-check'));
});

test('codexExtraArgs merges MRCX_CODEX_EXTRA_ARGS', () => {
  const args = codexExtraArgs({ MRCX_CODEX_EXTRA_ARGS: '--ephemeral,-m,gpt-5' });
  assert.ok(args.includes('--skip-git-repo-check'));
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('-m'));
  assert.ok(args.includes('gpt-5'));
});

test('codexAddDirArgs empty by default', () => {
  assert.deepEqual(codexAddDirArgs(), []);
});

test('buildCodexResumeArgs puts add-dir before exec', () => {
  const args = buildCodexResumeArgs('thread-1', ['C:\\Work\\ref']);
  const configIndex = args.indexOf('-c');
  const addDirIndex = args.indexOf('--add-dir');
  const refIndex = args.indexOf('C:\\Work\\ref');
  const execIndex = args.indexOf('exec');
  const resumeIndex = args.indexOf('resume');
  const skipGitIndex = args.indexOf('--skip-git-repo-check');
  const jsonIndex = args.indexOf('--json');
  const sessionIndex = args.indexOf('thread-1');
  assert.equal(configIndex, -1);
  assert.ok(addDirIndex >= 0);
  assert.ok(addDirIndex < execIndex);
  assert.ok(refIndex === addDirIndex + 1);
  assert.ok(execIndex < resumeIndex);
  assert.ok(resumeIndex < skipGitIndex);
  assert.ok(skipGitIndex < jsonIndex);
  assert.ok(jsonIndex < sessionIndex);
  assert.equal(args.at(-1), '-');
});

test('buildCodexCreateArgs puts add-dir before exec', () => {
  const args = buildCodexCreateArgs('C:\\Work\\main', false, ['C:\\Work\\ref']);
  const addDirIndex = args.indexOf('--add-dir');
  const execIndex = args.indexOf('exec');
  assert.ok(addDirIndex >= 0);
  assert.ok(addDirIndex < execIndex);
  assert.ok(args.includes('C:\\Work\\ref'));
  assert.ok(args.includes('-C'));
  assert.ok(args.includes('C:\\Work\\main'));
  assert.ok(args.includes('--skip-git-repo-check'));
  assert.ok(args.includes('--json'));
});

test('buildCodexCreateArgs adds sandbox_permissions when env set', () => {
  const args = buildCodexCreateArgs('C:\\Work\\main', false, ['C:\\Work\\ref']);
  const withEnv = buildCodexCreateArgs('C:\\Work\\main', false, ['C:\\Work\\ref']);
  assert.equal(withEnv.indexOf('-c'), -1);
  const configArgs = codexExtraDirConfigArgs(['C:\\Work\\ref'], {
    MRCX_CODEX_SANDBOX_PERMISSIONS: '["disk-full-read-access"]',
  });
  assert.deepEqual(configArgs, ['-c', 'sandbox_permissions=["disk-full-read-access"]']);
});

test('codexExtraDirConfigArgs empty when no extra dirs', () => {
  assert.deepEqual(codexExtraDirConfigArgs([]), []);
});

test('codexExtraDirConfigArgs respects MRCX_CODEX_SANDBOX_PERMISSIONS', () => {
  const args = codexExtraDirConfigArgs(['C:\\x'], {
    MRCX_CODEX_SANDBOX_PERMISSIONS: '["custom-perm"]',
  });
  assert.deepEqual(args, ['-c', 'sandbox_permissions=["custom-perm"]']);
});

const SAMPLE_STDOUT = [
  '{"type":"thread.started","thread_id":"t1"}',
  '{"type":"turn.started"}',
  '{"type":"error","message":"Reconnecting... 2/5 (request timed out)"}',
  '{"type":"error","message":"Reconnecting... 3/5 (request timed out)"}',
  '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"powershell -Command Get-ChildItem ref"}}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"第一句说明。"}}',
  '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"第二句：工作目录已切换。"}}',
  '{"type":"turn.completed","usage":{}}',
].join('\n');

function parseSampleEvents() {
  const events: Parameters<typeof extractCodexChatText>[0] = [];
  for (const line of SAMPLE_STDOUT.split('\n')) {
    events.push(JSON.parse(line) as Parameters<typeof extractCodexChatText>[0][number]);
  }
  return events;
}

test('extractCodexChatText is body only (no errors or commands)', () => {
  const text = extractCodexChatText(parseSampleEvents());
  assert.ok(!text.includes('Reconnecting'));
  assert.ok(!text.includes('Get-ChildItem'));
  assert.ok(text.includes('第一句说明。'));
  assert.ok(text.includes('第二句：工作目录已切换。'));
});

test('extractCodexDisplayText includes errors, commands, and body', () => {
  const text = extractCodexDisplayText(parseSampleEvents());
  assert.ok(text.includes('Reconnecting... 2/5'));
  assert.ok(text.includes('Reconnecting... 3/5'));
  assert.ok(text.includes('▶'));
  assert.ok(text.includes('Get-ChildItem'));
  assert.ok(text.includes('第一句说明。'));
  assert.ok(text.indexOf('Reconnecting') < text.indexOf('第一句'));
});

test('extractCodexChatText is empty when only errors and commands', () => {
  const stdout = [
    '{"type":"error","message":"Reconnecting... 2/5 (request timed out)"}',
    '{"type":"item.started","item":{"type":"command_execution","command":"powershell -Command dir"}}',
    '{"type":"item.completed","item":{"type":"command_execution","command":"dir","aggregated_output":"ok","exit_code":0,"status":"completed"}}',
  ].join('\n');
  const events: Parameters<typeof extractCodexChatText>[0] = [];
  for (const line of stdout.split('\n')) {
    events.push(JSON.parse(line) as Parameters<typeof extractCodexChatText>[0][number]);
  }
  assert.equal(extractCodexChatText(events), '');
  const display = extractCodexDisplayText(events);
  assert.ok(display.includes('Reconnecting... 2/5'));
  assert.ok(display.includes('▶'));
});

test('CodexJsonlStreamParser streams display text including errors', () => {
  const parser = new CodexJsonlStreamParser();
  assert.ok(parser.push('{"type":"error","message":"Reconnecting... 1/5"}\n').includes('Reconnecting'));
  const text = parser.push(
    '{"type":"item.completed","item":{"type":"agent_message","text":"part2"}}\n',
  );
  assert.ok(text.includes('Reconnecting'));
  assert.ok(text.includes('part2'));
});
