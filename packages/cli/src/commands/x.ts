import type { Command } from 'commander';
import { chatWithX, MrcxError } from '@mrcx/core';

function handleError(err: unknown): never {
  if (err instanceof MrcxError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

export function registerXCommand(program: Command): void {
  program
    .command('x')
    .description('Chat with X (Codex)')
    .argument('<message...>', 'Message content')
    .option('-p, --path <dir>', 'projectPath')
    .option('--allow-x-write', 'Explicitly allow X to modify workspace files')
    .action(async (messageParts: string[], opts: { path?: string; allowXWrite?: boolean }) => {
      try {
        const message = messageParts.join(' ');
        console.log('→ X …');
        const reply = await chatWithX(message, {
          projectPath: opts.path,
          allowWrite: opts.allowXWrite,
        });
        console.log('\n--- X ---\n');
        console.log(reply.content);
      } catch (e) {
        handleError(e);
      }
    });
}
