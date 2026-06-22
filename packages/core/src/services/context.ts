import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { MrcxContext, Room, Stage } from '../types.js';
import {
  loadContext,
  loadRoom,
  loadStage,
  saveContext,
} from '../store/index.js';
import { contextPath, resolveProjectPath } from '../paths.js';

export class MrcxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MrcxError';
  }
}

export interface ActiveContext {
  projectPath: string;
  room: Room;
  stage: Stage;
}

export function getActiveContext(projectPath?: string): ActiveContext {
  const resolved =
    projectPath != null
      ? resolveProjectPath(projectPath)
      : findProjectPathFromCwd();

  const ctx = loadContext(resolved);
  if (!ctx.currentRoomId) {
    throw new MrcxError('No current room set. Run mrcx room create or mrcx room use <id> first.');
  }
  if (!ctx.currentStageId) {
    throw new MrcxError('Room is set but no stage is selected. Run mrcx stage create first.');
  }

  const room = loadRoom(resolved, ctx.currentRoomId);
  const stage = loadStage(resolved, room.id, ctx.currentStageId);
  return { projectPath: resolved, room, stage };
}

function findProjectPathFromCwd(): string {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const file = contextPath(dir);
    if (fs.existsSync(file)) {
      const ctx = loadContext(dir);
      if (ctx.currentRoomId) {
        const room = loadRoom(dir, ctx.currentRoomId);
        return room.projectPath;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new MrcxError('No .mrcx context found. Use -p <projectPath> or run room create first.');
}

export function setCurrentRoom(projectPath: string, roomId: string, stageId?: string): void {
  const ctx: MrcxContext = {
    currentRoomId: roomId,
    currentStageId: stageId ?? null,
  };
  saveContext(projectPath, ctx);
}

export function setCurrentStage(projectPath: string, roomId: string, stageId: string): void {
  const ctx = loadContext(projectPath);
  saveContext(projectPath, { currentRoomId: roomId, currentStageId: stageId });
}

export function gitDiffStat(projectPath: string): string {
  const r = spawnSync('git', ['diff', '--stat'], {
    cwd: projectPath,
    encoding: 'utf8',
    shell: false,
  });
  if (r.status !== 0 && !r.stdout?.trim()) {
    return '(git diff unavailable or no repo changes)';
  }
  return r.stdout.trim() || '(no file changes)';
}
