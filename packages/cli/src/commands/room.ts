import type { Command } from 'commander';
import { createRoom, deleteRoom, listRooms, useRoom, MrcxError } from '@mrcx/core';
import { parsePathAndRestName, resolveProjectPathArg } from '../parse-args.js';
import { formatRoomCreatePathHint } from '../ux-hints.js';

function handleError(err: unknown): never {
  if (err instanceof MrcxError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

export function registerRoomCommand(program: Command): void {
  const room = program.command('room').description('Room / collaboration space management');

  room
    .command('create')
    .description('Create a Room bound to projectPath')
    .option('-p, --path <dir>', 'Project working directory (on Windows prefer --path= or positional path)')
    .argument('[args...]', 'path and name: <path> "Name"; or "Name" only (uses --path / cwd)')
    .action((args: string[], opts: { path?: string }) => {
      try {
        const { path: projectPath, name } = parsePathAndRestName(args, opts.path);
        const r = createRoom(name, projectPath);
        console.log(`Room created: ${r.id}`);
        console.log(`  Name: ${r.name}`);
        console.log(`  Path: ${r.projectPath}`);
        console.log(`  Data: ${r.projectPath}\\.mrcx\\rooms\\${r.id}`);
        console.log(formatRoomCreatePathHint(r.projectPath));
      } catch (e) {
        handleError(e);
      }
    });

  room
    .command('list')
    .description('List Rooms')
    .option('-p, --path <dir>', 'projectPath containing .mrcx')
    .argument('[path]', 'projectPath (positional when npm swallows -p)')
    .action((pathPos: string | undefined, opts: { path?: string }) => {
      try {
        const base = resolveProjectPathArg(opts.path, pathPos);
        const rooms = listRooms(base);
        if (rooms.length === 0) {
          console.log('(no Rooms)');
          return;
        }
        for (const r of rooms) {
          console.log(`${r.id}\t${r.name}\t${r.projectPath}`);
        }
      } catch (e) {
        handleError(e);
      }
    });

  room
    .command('delete')
    .description('Delete a Room (including Stages, messages, etc.)')
    .argument('<roomId>', 'Room ID')
    .option('-p, --path <dir>', 'projectPath (directory containing .mrcx)')
    .action((roomId: string, opts: { path?: string }) => {
      try {
        const base = resolveProjectPathArg(opts.path, undefined);
        deleteRoom(base, roomId);
        console.log(`Room deleted: ${roomId}`);
      } catch (e) {
        handleError(e);
      }
    });

  room
    .command('use')
    .description('Switch current Room')
    .argument('<roomId>', 'Room ID')
    .option('-p, --path <dir>', 'projectPath (directory containing .mrcx)')
    .action((roomId: string, opts: { path?: string }) => {
      try {
        const base = resolveProjectPathArg(opts.path, undefined);
        const r = useRoom(base, roomId);
        console.log(`Current Room: ${r.id} (${r.name})`);
      } catch (e) {
        handleError(e);
      }
    });
}
