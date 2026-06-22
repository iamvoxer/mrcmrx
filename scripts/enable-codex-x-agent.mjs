#!/usr/bin/env node
/**
 * Patch .mrcx/config.json: X → Codex wrapper, C unchanged (keep mock/local).
 *
 * Usage:
 *   node scripts/enable-codex-x-agent.mjs [projectPath]
 *   node scripts/enable-codex-x-agent.mjs --dry-run-check [projectPath]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveCodexInvocation } from './resolve-codex-bin.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const agentScript = path.join('scripts', 'mrcx-codex-agent.mjs');

function parseCliArgs(argv) {
  const flags = new Set();
  const positionals = [];
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('-')) flags.add(arg);
    else positionals.push(arg);
  }
  return {
    dryRunCheck: flags.has('--dry-run-check'),
    projectPath: path.resolve(positionals[0] ?? process.cwd()),
  };
}

function buildCodexEnv() {
  const env = {};
  for (const key of [
    'MRCX_CODEX_BIN',
    'MRCX_CODEX_PREFIX_ARGS',
    'MRCX_CODEX_SANDBOX',
    'MRCX_CODEX_APPROVAL',
    'MRCX_CODEX_EPHEMERAL',
    'MRCX_CODEX_MODEL',
    'MRCX_CODEX_EXTRA_ARGS',
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }

  if (!env.MRCX_CODEX_BIN) {
    const inv = resolveCodexInvocation(process.env);
    env.MRCX_CODEX_BIN = inv.bin;
    if (inv.prefix.length > 0) {
      env.MRCX_CODEX_PREFIX_ARGS = inv.prefix.join(',');
    }
    env._mrcx_codex_source = inv.source;
  }

  return env;
}

function printVerificationCommands(projectPath) {
  console.log('');
  console.log('Suggested verification commands:');
  console.log(`  cd "${projectPath}"`);
  console.log('  npm run mrcx -- doctor');
  console.log('  npm run mrcx -- start "Codex X trial" --no-worktree');
  console.log('  npm run mrcx -- next');
}

async function runWrapperDryRun(projectPath, adapterEnv = {}) {
  const wrapperPath = path.join(projectPath, agentScript);
  const promptPath = path.join(projectPath, '.mrcx', '.enable-dry-prompt.md');
  await fs.mkdir(path.dirname(promptPath), { recursive: true });
  await fs.writeFile(promptPath, 'enable dry-run check\n', 'utf-8');

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        wrapperPath,
        '--mrcx-action',
        'X_ANALYZE',
        '--mrcx-prompt-file',
        promptPath,
        '--mrcx-task',
        'dry-run-check',
        '--mrcx-room',
        'enable-check',
        '--mrcx-mode',
        'read_only',
      ],
      {
        cwd: projectPath,
        env: { ...process.env, ...adapterEnv, MRCX_CODEX_DRY_RUN: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    child.on('close', (code) => {
      fs.unlink(promptPath).catch(() => {});
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

async function ensureWrapperExists(projectPath) {
  const agentPath = path.join(projectPath, agentScript);
  try {
    await fs.access(agentPath);
    return agentPath;
  } catch {
    console.error(
      `Not found: ${agentPath}.\n` +
        'Run from this repo root, or copy scripts/mrcx-codex-agent.mjs into the target project first.',
    );
    process.exit(1);
  }
}

async function main() {
  const { dryRunCheck, projectPath } = parseCliArgs(process.argv);
  const agentPath = await ensureWrapperExists(projectPath);

  if (dryRunCheck) {
    let env = {};
    try {
      const config = JSON.parse(
        await fs.readFile(path.join(projectPath, '.mrcx', 'config.json'), 'utf8'),
      );
      env = config.agents?.x?.adapter?.env ?? {};
    } catch {
      env = buildCodexEnv();
    }
    const result = await runWrapperDryRun(projectPath, env);
    if (result.code === 0) {
      console.log('dry-run-check: passed');
      printVerificationCommands(projectPath);
      return;
    }
    console.error('dry-run-check: failed');
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }

  const configPath = path.join(projectPath, '.mrcx', 'config.json');
  let config;
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch {
    console.error(`Not found: ${configPath}. Run mrcx init first.`);
    process.exit(1);
  }

  const env = buildCodexEnv();
  const source = env._mrcx_codex_source;
  delete env._mrcx_codex_source;

  config.agents.x.adapter = {
    type: 'command',
    command: process.execPath,
    args: [agentScript],
    cwdMode: 'workspace',
    inputMode: 'file',
    timeoutMs: 1_800_000,
    env,
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  console.log(`Mr. X adapter → ${agentPath}`);
  console.log(`Mr. C adapter unchanged: ${config.agents.c.adapter?.type ?? 'mock'}`);
  console.log(`Codex resolution: ${source ?? 'explicit'}`);
  console.log('Codex env:', JSON.stringify(env, null, 2));
  if (env.MRCX_CODEX_BIN?.includes('codex.exe')) {
    console.log(`Before trial run: & "${env.MRCX_CODEX_BIN}" --version`);
  }
  printVerificationCommands(projectPath);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
