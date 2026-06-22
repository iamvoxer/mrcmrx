import type { Command } from 'commander';
import { forwardCToX, forwardXToC, MrcxError } from '@mrcx/core';
import { parseForwardArgs, parseForwardCToXArgs, resolveProjectPathArg } from '../parse-args.js';

function handleError(err: unknown): never {
  if (err instanceof MrcxError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

export function registerForwardCommand(program: Command): void {
  const forward = program.command('forward').description('X ↔ C message forwarding');

  forward
    .command('x-to-c')
    .description("Forward X's conclusion to C for execution")
    .option('--last <n>', 'Forward the last N X messages', '1')
    .option('--note <text>', 'User execution instructions')
    .option('-p, --path <dir>', 'projectPath')
    .argument('[args...]', 'When npm swallows flags: <last> <note...> or <note...> only')
    .action(async (args: string[], opts: { last: string; note?: string; path?: string }) => {
      try {
        const { last, note } = parseForwardArgs(args, opts);
        console.log('→ C (execute X conclusion)…');
        const reply = await forwardXToC({
          last,
          note,
          projectPath: resolveProjectPathArg(opts.path, undefined),
        });
        console.log('\n--- C ---\n');
        console.log(reply.content);
      } catch (e) {
        handleError(e);
      }
    });

  forward
    .command('c-to-x')
    .description("Forward C's result + user feedback to X")
    .option('--last <n>', 'Forward the last N C messages', '1')
    .option('--note <text>', 'User review or additional notes')
    .option('--diff', 'Attach git diff --stat summary')
    .option('-p, --path <dir>', 'projectPath')
    .argument('[args...]', 'When npm swallows flags: <last> <note...> [diff]')
    .action(async (args: string[], opts: { last: string; note?: string; diff?: boolean; path?: string }) => {
      try {
        const { last, note, includeDiff } = parseForwardCToXArgs(args, opts);
        console.log('→ X (review C)…');
        const reply = await forwardCToX({
          last,
          note,
          includeDiff,
          projectPath: resolveProjectPathArg(opts.path, undefined),
        });
        console.log('\n--- X ---\n');
        console.log(reply.content);
      } catch (e) {
        handleError(e);
      }
    });
}
