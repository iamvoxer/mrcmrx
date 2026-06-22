import fs from 'node:fs';
import { listRoomIds, loadRoom, loadStage, listStages, resolveProjectPath } from '@mrcx/core';
import type { Room, Stage } from '@mrcx/core';
import { loadRegistry } from './registry.js';

export function allProjectPaths(extra: string[] = []): string[] {
  const registry = loadRegistry();
  const set = new Set<string>();
  const cwd = resolveProjectPath(process.cwd());
  if (fs.existsSync(`${cwd}\\.mrcx`) || fs.existsSync(`${cwd}/.mrcx`)) {
    set.add(cwd);
  }
  for (const p of [...registry.projectPaths, ...extra]) {
    set.add(resolveProjectPath(p));
  }
  return [...set];
}

export function findRoom(roomId: string): { projectPath: string; room: Room } | null {
  for (const projectPath of allProjectPaths()) {
    if (!listRoomIds(projectPath).includes(roomId)) continue;
    return { projectPath, room: loadRoom(projectPath, roomId) };
  }
  return null;
}

export function findStage(stageId: string): { projectPath: string; room: Room; stage: Stage } | null {
  for (const projectPath of allProjectPaths()) {
    for (const roomId of listRoomIds(projectPath)) {
      const stage = listStages(projectPath, roomId).find((s) => s.id === stageId);
      if (stage) {
        return { projectPath, room: loadRoom(projectPath, roomId), stage };
      }
    }
  }
  return null;
}

export function listAllRooms(): Array<{ projectPath: string; room: Room }> {
  const out: Array<{ projectPath: string; room: Room }> = [];
  for (const projectPath of allProjectPaths()) {
    for (const roomId of listRoomIds(projectPath)) {
      out.push({ projectPath, room: loadRoom(projectPath, roomId) });
    }
  }
  return out.sort((a, b) => b.room.updatedAt.localeCompare(a.room.updatedAt));
}
