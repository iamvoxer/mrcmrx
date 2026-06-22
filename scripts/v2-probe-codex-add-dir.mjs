#!/usr/bin/env node
/**
 * Probe Codex --add-dir readability with optional sandbox_permissions.
 *
 * Usage:
 *   node scripts/v2-probe-codex-add-dir.mjs [mainProjectPath] [extraDir]
 *
 * Env:
 *   MRCX_CODEX_BIN — optional explicit codex.exe
 *
 * Writes: <mainProject>/.mrcx/v2-codex-add-dir-probe.json
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDist = path.resolve(here, '../packages/core/dist/agents/codex-client.js');

async function loadBuilders() {
  const url = pathToFileURL(coreDist).href;
  return import(url);
}

function parseJsonl(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* ignore */
    }
  }
  return events;
}

function extractAgentText(events) {
  const item = events.find((e) => e.type === 'item.completed' && e.item?.type === 'agent_message');
  return item?.item?.text?.trim() ?? '';
}

function extractThreadId(events) {
  return events.find((e) => e.type === 'thread.started')?.thread_id ?? null;
}

function quoteArg(arg) {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function formatCommand(bin, args) {
  return [quoteArg(bin), ...args.map(quoteArg)].join(' ');
}

function runCase({ bin, prefix, args, cwd, stdin, label }) {
  const fullArgs = [...prefix, ...args];
  const startedAt = new Date().toISOString();
  const result = spawnSync(bin, fullArgs, {
    input: stdin,
    encoding: 'utf8',
    cwd,
    timeout: 180_000,
    shell: false,
  });
  const endedAt = new Date().toISOString();
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const events = parseJsonl(stdout);
  const agentText = extractAgentText(events);
  const threadId = extractThreadId(events);
  const blocked = /blocked by policy/i.test(`${stderr}\n${stdout}\n${agentText}`);
  const sawJavaHint = /\.java|Application\.java|src[/\\]main[/\\]java/i.test(agentText);
  return {
    label,
    command: formatCommand(bin, fullArgs),
    cwd,
    exitCode: result.status,
    signal: result.signal,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout,
    stderr,
    agentText,
    threadId,
    blockedByPolicy: blocked,
    likelyReadExtraDir: sawJavaHint && !blocked,
    startedAt,
    endedAt,
  };
}

function buildCreateArgs(builders, mainPath, extraDir, { withPermissions }) {
  if (withPermissions) {
    return builders.buildCodexCreateArgs(mainPath, false, [extraDir]);
  }
  const base = builders.buildCodexCreateArgs(mainPath, false, [extraDir]);
  return base.filter((a, i, arr) => !(a === '-c' || (i > 0 && arr[i - 1] === '-c')));
}

function buildResumeArgs(builders, sessionId, extraDir, { withPermissions }) {
  if (withPermissions) {
    return builders.buildCodexResumeArgs(sessionId, [extraDir]);
  }
  const base = builders.buildCodexResumeArgs(sessionId, [extraDir]);
  return base.filter((a, i, arr) => !(a === '-c' || (i > 0 && arr[i - 1] === '-c')));
}

async function main() {
  const mainPath = path.resolve(process.argv[2] ?? process.cwd());
  const extraDir = path.resolve(process.argv[3] ?? 'C:\\Work\\2025\\ssacs_overseas_webapi');
  const builders = await loadBuilders();
  const { resolveCodexInvocation } = await import(pathToFileURL(path.resolve(here, '../packages/core/dist/agents/codex-bin.js')).href);
  const { bin, prefix } = resolveCodexInvocation();

  const prompt = [
    `List only Java entry-related filenames under src/main/java in the added directory ${extraDir} (one per line).`,
    'Do not explain or modify files. If you cannot read that directory, state why clearly.',
  ].join('\n');

  const resumePrompt = [
    `List only .java filenames under src/main/java in directory ${extraDir} (one per line, no explanation).`,
  ].join('\n');

  const cases = [];

  console.log(`[v2-probe-codex-add-dir] main=${mainPath}`);
  console.log(`[v2-probe-codex-add-dir] extra=${extraDir}`);

  cases.push(
    runCase({
      bin,
      prefix,
      args: buildCreateArgs(builders, mainPath, extraDir, { withPermissions: false }),
      cwd: mainPath,
      stdin: prompt,
      label: 'create:add-dir-only',
    }),
  );

  cases.push(
    runCase({
      bin,
      prefix,
      args: buildCreateArgs(builders, mainPath, extraDir, { withPermissions: true }),
      cwd: mainPath,
      stdin: prompt,
      label: 'create:add-dir+sandbox_permissions',
    }),
  );

  const threadId = cases.find((c) => c.threadId)?.threadId;
  if (threadId) {
    cases.push(
      runCase({
        bin,
        prefix,
        args: buildResumeArgs(builders, threadId, extraDir, { withPermissions: false }),
        cwd: mainPath,
        stdin: resumePrompt,
        label: 'resume:add-dir-only',
      }),
    );
    cases.push(
      runCase({
        bin,
        prefix,
        args: buildResumeArgs(builders, threadId, extraDir, { withPermissions: true }),
        cwd: mainPath,
        stdin: resumePrompt,
        label: 'resume:add-dir+sandbox_permissions',
      }),
    );
  }

  const report = {
    ok: cases.some((c) => c.likelyReadExtraDir),
    mainPath,
    extraDir,
    cases: cases.map(({ stdout, stderr, ...rest }) => rest),
    raw: cases,
  };

  const outFile = path.join(mainPath, '.mrcx', 'v2-codex-add-dir-probe.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

  for (const c of cases) {
    console.log(`\n--- ${c.label} ---`);
    console.log(`command: ${c.command}`);
    console.log(`exit: ${c.exitCode} blocked: ${c.blockedByPolicy} readOk: ${c.likelyReadExtraDir}`);
    console.log(`agent: ${(c.agentText || '').slice(0, 400)}`);
  }

  console.log(`\n[v2-probe-codex-add-dir] wrote ${outFile}`);
  console.log(`[v2-probe-codex-add-dir] PASS=${report.ok}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[v2-probe-codex-add-dir] FAIL', err);
  process.exit(1);
});
