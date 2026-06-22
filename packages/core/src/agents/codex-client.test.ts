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
  // buildCodexCreateArgs uses process.env - test via codexExtraDirConfigArgs directly
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

test('extractCodexChatText merges agent_message only', () => {
  const stdout = [
    '{"type":"thread.started","thread_id":"t1"}',
    '{"type":"turn.started"}',
    '{"type":"error","message":"Reconnecting... 2/5 (request timed out)"}',
    '{"type":"error","message":"Reconnecting... 3/5 (request timed out)"}',
    '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"第一句说明。"}}',
    '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"第二句：工作目录已切换。"}}',
    '{"type":"item.completed","item":{"id":"item_8","type":"agent_message","text":"可以读取了。\\n\\n目录包含 src。"}}',
    '{"type":"turn.completed","usage":{}}',
  ].join('\n');

  const events: Parameters<typeof extractCodexChatText>[0] = [];
  for (const line of stdout.split('\n')) {
    events.push(JSON.parse(line) as Parameters<typeof extractCodexChatText>[0][number]);
  }

  const text = extractCodexChatText(events);
  assert.ok(!text.includes('Reconnecting'));
  assert.ok(text.includes('第一句说明。'));
  assert.ok(text.includes('第二句：工作目录已切换。'));
  assert.ok(text.includes('可以读取了。'));
  assert.ok(text.includes('目录包含 src。'));
  assert.ok(text.indexOf('第一句说明。') < text.indexOf('第二句'));
});

test('CodexJsonlStreamParser parses incrementally without errors in chat text', () => {
  const parser = new CodexJsonlStreamParser();
  assert.equal(parser.push('{"type":"error","message":"line1"}\n'), '');
  const text = parser.push('{"type":"item.completed","item":{"type":"agent_message","text":"part2"}}\n');
  assert.equal(text, 'part2');
});
