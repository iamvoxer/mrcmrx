#!/usr/bin/env node
/**
 * Test fixture for CommandAgentAdapter.
 * Usage: node fake-agent.mjs --mrcx-action ... --mrcx-prompt-file ... [--exit 1] [--sleep 5000] [--echo-cwd]
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const opts = { exitCode: 0, sleepMs: 0, echoCwd: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exit') opts.exitCode = Number(argv[++i] ?? 1);
    else if (a === '--sleep') opts.sleepMs = Number(argv[++i] ?? 1000);
    else if (a === '--echo-cwd') opts.echoCwd = true;
    else if (a === '--mrcx-prompt-file') opts.promptFile = argv[++i];
    else if (a === '--mrcx-action') opts.action = argv[++i];
    else if (a === '--mrcx-room') opts.room = argv[++i];
    else if (a === '--mrcx-mode') opts.mode = argv[++i];
    else if (a === '--mrcx-task') opts.task = argv[++i];
  }
  return opts;
}

const opts = parseArgs(process.argv);

if (opts.sleepMs > 0) {
  const start = Date.now();
  while (Date.now() - start < opts.sleepMs) {
    // busy wait for timeout tests
  }
}

if (opts.echoCwd) {
  process.stdout.write(process.cwd());
  process.stderr.write('stderr-log\n');
  process.exit(opts.exitCode);
}

const prompt = opts.promptFile ? fs.readFileSync(path.resolve(opts.promptFile), 'utf8') : '';
process.stdout.write(`[fake-agent] action=${opts.action ?? '?'} task=${opts.task ?? '?'}\n`);
process.stdout.write(prompt.slice(0, 200));
process.stderr.write(`fake stderr for ${opts.action ?? '?'}\n`);
process.exit(opts.exitCode);
