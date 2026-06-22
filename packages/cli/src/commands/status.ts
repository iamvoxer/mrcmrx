import type { Command } from 'commander';
import { getStatus, loadSettings, MrcxError } from '@mrcx/core';
import { resolveProjectPathArg } from '../parse-args.js';
import { formatCwdMismatchWarning } from '../ux-hints.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Current Room / Stage status')
    .option('-p, --path <dir>', 'projectPath (directory containing .mrcx)')
    .argument('[path]', 'projectPath (positional when npm swallows -p)')
    .action((pathPos: string | undefined, opts: { path?: string }) => {
      try {
        const base = resolveProjectPathArg(opts.path, pathPos);
        const s = getStatus(base);
        const proxy = loadSettings(s.room.projectPath).proxy;
        console.log(`Cwd:   ${s.cwd}`);
        console.log(`Room:  ${s.room.id} — ${s.room.name}`);
        console.log(`Path:  ${s.room.projectPath}`);
        console.log(`.mrcx: ${s.mrcxIndexPath}\\.mrcx\\rooms\\${s.room.id}`);
        console.log(`Stage: ${s.stage.id} — ${s.stage.name}`);
        console.log(`Codex thread: ${s.stage.xSession ?? '-'}`);
        console.log(`Cursor chat:  ${s.stage.cSession ?? '-'}`);
        console.log(`Messages: ${s.messageCount}`);
        if (proxy?.url || proxy?.http || proxy?.https) {
          console.log(`Proxy:  ${proxy.url ?? proxy.http ?? proxy.https}`);
        }
        if (!s.cwdMatchesProject) {
          console.log(formatCwdMismatchWarning(s.cwd, s.room.projectPath, s.mrcxIndexPath));
        }
      } catch (e) {
        if (e instanceof MrcxError) {
          console.error(e.message);
          process.exit(1);
        }
        throw e;
      }
    });
}
