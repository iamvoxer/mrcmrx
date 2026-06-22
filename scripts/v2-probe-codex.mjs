#!/usr/bin/env node
/**
 * v2 M0: Codex session create + resume smoke probe.
 *
 * Usage:
 *   node scripts/v2-probe-codex.mjs [projectPath]
 *
 * Env:
 *   MRCX_CODEX_BIN — optional explicit codex.exe path
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCodexInvocation } from './resolve-codex-bin.mjs';

const projectPath = path.resolve(process.argv[2] ?? process.cwd());

function parseJsonl(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* ignore non-json */
    }
  }
  return events;
}

function runCodex(mode, stdin = '') {
  const { bin, prefix } = resolveCodexInvocation();
  const args = [
    ...prefix,
    '-a',
    process.env.MRCX_CODEX_APPROVAL ?? 'never',
    'exec',
    ...(mode === 'create'
      ? ['--sandbox', 'read-only', '-C', projectPath]
      : ['resume', mode.threadId]),
    '--json',
    '-',
  ];
  return spawnSync(bin, args, {
    input: stdin,
    encoding: 'utf8',
    timeout: 180_000,
    shell: false,
    cwd: projectPath,
  });
}

function extractThreadId(events) {
  return events.find((e) => e.type === 'thread.started')?.thread_id ?? null;
}

function extractAgentText(events) {
  const item = events.find((e) => e.type === 'item.completed' && e.item?.type === 'agent_message');
  return item?.item?.text ?? null;
}

console.log(`[v2-probe-codex] projectPath=${projectPath}`);

const create = runCodex('create', 'Reply with exactly: CODEX-M0-OK');
if (create.status !== 0) {
  console.error('[v2-probe-codex] FAIL create', create.stderr || create.stdout);
  process.exit(1);
}

const createEvents = parseJsonl(create.stdout);
const threadId = extractThreadId(createEvents);
const createText = extractAgentText(createEvents);

if (!threadId) {
  console.error('[v2-probe-codex] FAIL no thread.started in stdout');
  console.error(create.stdout.slice(0, 500));
  process.exit(1);
}

console.log(`[v2-probe-codex] PASS create thread_id=${threadId}`);
console.log(`[v2-probe-codex] create reply preview: ${(createText ?? '').slice(0, 120)}`);

const resume = runCodex(
  { threadId },
  'What exact phrase did I ask you to reply with in the first message? One line only.',
);
if (resume.status !== 0) {
  console.error('[v2-probe-codex] FAIL resume', resume.stderr || resume.stdout);
  process.exit(1);
}

const resumeEvents = parseJsonl(resume.stdout);
const resumeText = extractAgentText(resumeEvents);

console.log(`[v2-probe-codex] PASS resume thread_id=${threadId}`);
console.log(`[v2-probe-codex] resume reply preview: ${(resumeText ?? '').slice(0, 200)}`);

const out = {
  ok: true,
  threadId,
  createText,
  resumeText,
  projectPath,
};
const outFile = path.join(projectPath, '.mrcx', 'v2-m0-codex-probe.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`[v2-probe-codex] wrote ${outFile}`);
