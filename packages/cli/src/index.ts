#!/usr/bin/env node

import { Command } from 'commander';
import { setCliProxyOverride } from '@mrcx/core';
import { registerRoomCommand } from './commands/room.js';
import { registerStageCommand } from './commands/stage.js';
import { registerXCommand } from './commands/x.js';
import { registerForwardCommand } from './commands/forward.js';
import { registerStatusCommand } from './commands/status.js';
import { registerConfigCommand } from './commands/config.js';
import { registerUiCommand } from './commands/ui.js';
import { registerCursorCommand } from './commands/cursor.js';

const program = new Command();

program
  .name('mrcx')
  .description('Mr C & Mr X v2 — Codex ↔ Cursor chat relay')
  .version('0.2.0')
  .option('--proxy <url>', 'One-off HTTP/HTTPS proxy override (e.g. http://127.0.0.1:7892)');

program.hook('preAction', (_thisCommand, actionCommand) => {
  const root = actionCommand.parent ?? actionCommand;
  let cmd: Command | null = root;
  while (cmd?.parent) {
    cmd = cmd.parent;
  }
  const proxy = cmd?.opts()?.proxy as string | undefined;
  if (proxy) {
    setCliProxyOverride(proxy);
  }
});

registerRoomCommand(program);
registerConfigCommand(program);
registerCursorCommand(program);
registerUiCommand(program);
registerStageCommand(program);
registerXCommand(program);
registerForwardCommand(program);
registerStatusCommand(program);

program.parse();
