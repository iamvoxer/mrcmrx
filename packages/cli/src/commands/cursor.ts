import type { Command } from 'commander';
import { cursorAgentStatus, findMrcxProjectPath } from '@mrcx/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

function repoRootFromHere(here: string): string {
  return path.resolve(here, '../../..');
}

export function registerCursorCommand(program: Command): void {
  const cursor = program.command('cursor').description('Cursor Agent CLI helpers');

  cursor
    .command('status')
    .description('Check Cursor Agent login status')
    .option('-p, --path <dir>', 'Project directory (reads cursorAgent.path setting)')
    .action((opts: { path?: string }) => {
      try {
        const projectPath = opts.path ? path.resolve(opts.path) : findMrcxProjectPath();
        const text = cursorAgentStatus(projectPath);
        console.log(text || '(empty)');
        if (/not logged in/i.test(text)) {
          console.log('\nRun: npm run mrcx -- cursor login');
          process.exit(2);
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        console.error('\nConfigure path first: npm run mrcx -- config cursor set <node.exe path> -p <project>');
        console.error('Or fix shim: npm run mrcx -- cursor fix-shim');
        process.exit(1);
      }
    });

  cursor
    .command('fix-shim')
    .description('Fix local agent.ps1 not recognizing new version directories')
    .action(() => {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const script = path.join(repoRootFromHere(here), 'scripts', 'fix-cursor-agent-shim.ps1');
      const r = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
        { stdio: 'inherit', shell: false },
      );
      process.exit(r.status ?? 1);
    });

  cursor
    .command('login')
    .description('Cursor Agent login')
    .action(() => {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const script = path.join(repoRootFromHere(here), 'scripts', 'v2-cursor-agent.ps1');
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, 'login'],
        { stdio: 'inherit', shell: false },
      );
      child.on('close', (code) => process.exit(code ?? 1));
    });
}
