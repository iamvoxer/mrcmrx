#!/usr/bin/env node
/**
 * Codex CLI wrapper for mrcx Mr. X read-only actions.
 *
 * Supported: X_ANALYZE, X_REVIEW, X_FINAL_CHECK, X_FINAL_OPINION
 * C actions are rejected — keep C on local/mock adapter.
 *
 * Reads prompt from --mrcx-prompt-file, runs:
 *   codex -a never exec --sandbox read-only -C <cwd> -
 * with prompt on stdin. Forwards stdout/stderr; exit code non-zero → mrcx retry.
 *
 * Note: `-a / --ask-for-approval` is a **top-level** codex flag (before `exec`).
 *
 * Env (optional):
 *   MRCX_CODEX_BIN              explicit codex.exe (Windows: %LOCALAPPDATA%\\OpenAI\\Codex\\bin\\...\\codex.exe)
 *   MRCX_CODEX_PREFIX_ARGS      comma-separated args before `exec` (omit when bin is absolute path)
 *   MRCX_CODEX_SANDBOX          default `read-only`
 *   MRCX_CODEX_APPROVAL           default `never` (non-interactive)
 *   MRCX_CODEX_EPHEMERAL=1        pass --ephemeral
 *   MRCX_CODEX_MODEL=<model>      pass -m
 *   MRCX_CODEX_EXTRA_ARGS         comma-separated extra flags, e.g. `--skip-git-repo-check`
 *   MRCX_CODEX_DRY_RUN=1          print prompt header to stdout, skip Codex (tests)
 *
 * Verified against: LocalAppData codex.exe v0.136.0-alpha.2 + npx @openai/codex v0.140.0
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCodexInvocation } from './resolve-codex-bin.mjs';
import { buildCodexSpawnArgs } from './codex-spawn-args.mjs';
import { classifyCodexFailure, formatCodexFailureHint } from './codex-errors.mjs';

const X_ACTIONS = new Set([
  'X_ANALYZE',
  'X_REVIEW',
  'X_FINAL_CHECK',
  'X_FINAL_OPINION',
]);

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mrcx-prompt-file') opts.promptFile = argv[++i];
    else if (a === '--mrcx-action') opts.action = argv[++i];
    else if (a === '--mrcx-task') opts.task = argv[++i];
    else if (a === '--mrcx-mode') opts.mode = argv[++i];
    else if (a === '--mrcx-room') opts.room = argv[++i];
  }
  return opts;
}

function runCodex(promptText) {
  const { bin, prefix, source } = resolveCodexInvocation();
  const args = buildCodexSpawnArgs(prefix);

  if (process.env.MRCX_CODEX_VERBOSE === '1') {
    process.stderr.write(
      `[mrcx-codex-agent] spawn (${source}): ${bin} ${args.join(' ')}\n`,
    );
  }

  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      const kind = classifyCodexFailure({ exitCode: 1, spawnError: err.message });
      resolve({
        stdout,
        stderr: `${stderr}${formatCodexFailureHint(kind)}\n${err.message}\n`,
        exitCode: 1,
      });
    });

    child.stdin.write(promptText);
    child.stdin.end();

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

const opts = parseArgs(process.argv);
const action = opts.action ?? '';

if (!X_ACTIONS.has(action)) {
  process.stderr.write(
    `[mrcx-codex-agent] unsupported action=${action} — Codex wrapper is X-only; use local/mock adapter for C\n`,
  );
  process.exit(1);
}

const promptPath = opts.promptFile;
if (!promptPath) {
  process.stderr.write('[mrcx-codex-agent] missing --mrcx-prompt-file\n');
  process.exit(1);
}

const prompt = fs.readFileSync(path.resolve(promptPath), 'utf8');

if (process.env.MRCX_CODEX_DRY_RUN === '1') {
  process.stdout.write(
    `[mrcx-codex-agent dry-run] action=${action} room=${opts.room ?? '?'} task=${opts.task ?? '?'}\n\n${prompt.slice(0, 400)}`,
  );
  process.stderr.write(`[mrcx-codex-agent] dry-run ok action=${action}\n`);
  process.exit(0);
}

const result = await runCodex(prompt);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.exitCode !== 0) {
  const kind = classifyCodexFailure({
    exitCode: result.exitCode,
    stderr: result.stderr,
  });
  if (kind !== 'ok') {
    process.stderr.write(`${formatCodexFailureHint(kind)}\n`);
  }
}
process.exit(result.exitCode);
