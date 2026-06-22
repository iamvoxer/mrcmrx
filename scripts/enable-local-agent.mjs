#!/usr/bin/env node
/**
 * Patch .mrcx/config.json to use scripts/mrcx-local-agent.mjs for X and C.
 *
 * Usage (from project root):
 *   node scripts/enable-local-agent.mjs
 *   node scripts/enable-local-agent.mjs /path/to/project
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const agentScript = path.join('scripts', 'mrcx-local-agent.mjs');

async function main() {
  const projectPath = path.resolve(process.argv[2] ?? process.cwd());
  const configPath = path.join(projectPath, '.mrcx', 'config.json');

  let config;
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch {
    console.error(`Not found: ${configPath}. Run mrcx init first.`);
    process.exit(1);
  }

  const adapter = {
    type: 'command',
    command: process.execPath,
    args: [agentScript],
    cwdMode: 'project',
    inputMode: 'file',
  };

  config.agents.x.adapter = { ...adapter };
  config.agents.c.adapter = { ...adapter };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`Local agent enabled: ${path.join(projectPath, agentScript)}`);
  console.log('Next: npm run mrcx -- start "task description" && npm run mrcx -- next');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
