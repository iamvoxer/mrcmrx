#!/usr/bin/env node
/**
 * v2 M0: Cursor chat create + resume smoke probe.
 *
 * Usage:
 *   node scripts/v2-probe-cursor.mjs [projectPath]
 *
 * Prerequisite:
 *   agent login   OR   CURSOR_API_KEY env var
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCursorAgentInvocation } from './v2-resolve-cursor-agent.mjs';

const projectPath = path.resolve(process.argv[2] ?? process.cwd());
const { node, index, version } = resolveCursorAgentInvocation();

function agentArgs(subargs) {
  return [index, ...subargs];
}

function runAgent(subargs, { input, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, agentArgs(subargs), {
      cwd: projectPath,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    if (input) child.stdin.write(input);
    child.stdin.end();

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
    child.on('error', reject);
  });
}

/** create-chat prints chatId then may hang — kill after first line. */
async function createChatId() {
  const r = await runAgent(['--workspace', projectPath, 'create-chat'], { timeoutMs: 15_000 });
  const chatId = r.stdout.trim().split(/\r?\n/).find((l) => /^[0-9a-f-]{36}$/i.test(l.trim()));
  return { chatId: chatId?.trim() ?? null, ...r };
}

async function main() {
  console.log(`[v2-probe-cursor] agent version=${version}`);
  console.log(`[v2-probe-cursor] projectPath=${projectPath}`);

  const status = spawnSync(node, agentArgs(['status']), { encoding: 'utf8' });
  const statusText = (status.stdout || status.stderr || '').trim();
  console.log(`[v2-probe-cursor] auth status: ${statusText || '(empty)'}`);

  if (!process.env.CURSOR_API_KEY && /not logged in/i.test(statusText)) {
    console.error('[v2-probe-cursor] BLOCKED: run `agent login` or set CURSOR_API_KEY, then re-run.');
    process.exit(2);
  }

  const created = await createChatId();
  if (!created.chatId) {
    console.error('[v2-probe-cursor] FAIL create-chat — no UUID on stdout');
    console.error('stdout:', created.stdout);
    console.error('stderr:', created.stderr);
    process.exit(1);
  }
  console.log(`[v2-probe-cursor] PASS create-chat chatId=${created.chatId}${created.timedOut ? ' (process timed out/killed — expected)' : ''}`);

  const msg1 = await runAgent(
    ['--workspace', projectPath, '--resume', created.chatId, '-p', '--trust', '--force', 'Reply with exactly: CURSOR-M0-ONE'],
    { timeoutMs: 180_000 },
  );
  if (msg1.code !== 0 && !msg1.stdout.trim()) {
    console.error('[v2-probe-cursor] FAIL msg1', msg1.stderr || msg1.stdout);
    process.exit(1);
  }
  const reply1 = msg1.stdout.trim();
  console.log(`[v2-probe-cursor] PASS msg1 preview: ${reply1.slice(0, 160)}`);

  const msg2 = await runAgent(
    [
      '--workspace',
      projectPath,
      '--resume',
      created.chatId,
      '-p',
      '--trust',
      '--force',
      'What exact phrase did I ask you to reply with in my first message? One line only.',
    ],
    { timeoutMs: 180_000 },
  );
  if (msg2.code !== 0 && !msg2.stdout.trim()) {
    console.error('[v2-probe-cursor] FAIL msg2', msg2.stderr || msg2.stdout);
    process.exit(1);
  }
  const reply2 = msg2.stdout.trim();
  console.log(`[v2-probe-cursor] PASS msg2 preview: ${reply2.slice(0, 200)}`);

  const out = {
    ok: true,
    chatId: created.chatId,
    agentVersion: version,
    projectPath,
    reply1,
    reply2,
  };
  const outFile = path.join(projectPath, '.mrcx', 'v2-m0-cursor-probe.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`[v2-probe-cursor] wrote ${outFile}`);
}

main().catch((err) => {
  console.error('[v2-probe-cursor] ERROR', err);
  process.exit(1);
});
