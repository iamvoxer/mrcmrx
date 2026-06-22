import type { Command } from 'commander';
import {
  createStage,
  listStagesForRoom,
  loadContext,
  MrcxError,
  resolveProjectPath,
  updateStage,
  useStage,
} from '@mrcx/core';

function handleError(err: unknown): never {
  if (err instanceof MrcxError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

function resolveBaseAndRoom(pathOpt?: string): { base: string; roomId: string } {
  const base = resolveProjectPath(pathOpt ?? process.cwd());
  const ctx = loadContext(base);
  if (!ctx.currentRoomId) {
    throw new MrcxError('No current Room set. Run mrcx room use <id> first.');
  }
  return { base, roomId: ctx.currentRoomId };
}

export function registerStageCommand(program: Command): void {
  const stage = program.command('stage').description('Stage / workflow phase management');

  stage
    .command('create')
    .description('Create a Stage (binds Codex thread + Cursor chat)')
    .argument('<name>', 'Stage name')
    .argument('[content...]', 'Stage description (positional when npm swallows -c)')
    .option('-c, --content <text>', 'Stage description')
    .option('-p, --path <dir>', 'projectPath')
    .action(async (name: string, contentParts: string[], opts: { content?: string; path?: string }) => {
      try {
        const { base, roomId } = resolveBaseAndRoom(opts.path);
        const content = opts.content ?? contentParts.join(' ') ?? '';
        console.log('Creating Stage and initializing Codex / Cursor sessions…');
        const s = await createStage(base, roomId, name, content);
        console.log(`Stage created: ${s.id}`);
        console.log(`  Name: ${s.name}`);
        console.log(`  Codex: ${s.xSession?.sessionId ?? '-'}`);
        console.log(`  Cursor: ${s.cSession?.chatId ?? '-'}`);
      } catch (e) {
        handleError(e);
      }
    });

  stage
    .command('list')
    .description('List Stages in the current Room')
    .option('-p, --path <dir>', 'projectPath')
    .action((opts: { path?: string }) => {
      try {
        const { base, roomId } = resolveBaseAndRoom(opts.path);
        const stages = listStagesForRoom(base, roomId);
        if (stages.length === 0) {
          console.log('(no Stages)');
          return;
        }
        for (const s of stages) {
          console.log(`${s.order}\t${s.id}\t${s.name}`);
        }
      } catch (e) {
        handleError(e);
      }
    });

  stage
    .command('update')
    .description('Update Stage name and description (does not rebuild sessions)')
    .argument('[stageId]', 'Stage ID (defaults to current Stage)')
    .option('-n, --name <name>', 'New name')
    .option('-c, --content <text>', 'New description')
    .option('-p, --path <dir>', 'projectPath')
    .action((stageId: string | undefined, opts: { name?: string; content?: string; path?: string }) => {
      try {
        const { base, roomId } = resolveBaseAndRoom(opts.path);
        const ctx = loadContext(base);
        const id = stageId ?? ctx.currentStageId;
        if (!id) throw new MrcxError('No Stage specified and no current Stage set.');
        if (opts.name === undefined && opts.content === undefined) {
          throw new MrcxError('Provide at least --name or --content.');
        }
        const s = updateStage(base, roomId, id, { name: opts.name, content: opts.content });
        console.log(`Stage updated: ${s.id}`);
        console.log(`  Name: ${s.name}`);
      } catch (e) {
        handleError(e);
      }
    });

  stage
    .command('use')
    .description('Switch current Stage')
    .argument('<stageId>', 'Stage ID')
    .option('-p, --path <dir>', 'projectPath')
    .action((stageId: string, opts: { path?: string }) => {
      try {
        const { base, roomId } = resolveBaseAndRoom(opts.path);
        const s = useStage(base, roomId, stageId);
        console.log(`Current Stage: ${s.id} (${s.name})`);
      } catch (e) {
        handleError(e);
      }
    });
}
