import type { Room, Stage } from '../types.js';
import { codexCreateSession } from '../agents/codex-client.js';
import { cursorCreateChat } from '../agents/cursor-client.js';
import { assertAgentRunOk, formatAgentRunFailure } from '../agents/agent-run.js';
import {
  appendMessage,
  createMessageRecord,
  createRoomRecord,
  createStageRecord,
  deleteRoomData,
  ensureRoomLayout,
  listStages,
  loadContext,
  loadRoom,
  listRoomIds,
  saveContext,
  saveRoom,
  saveStage,
} from '../store/index.js';
import { appendAgentMessage } from '../store/agent-messages.js';
import { resolveProjectPath, ensureDir, mrcxRoot } from '../paths.js';
import { normalizeExtraReadableDirs } from '../room-dirs.js';
import { MrcxError, setCurrentRoom } from './context.js';

export interface UpdateRoomSettingsPatch {
  name?: string;
  extraReadableDirs?: string[];
}

export interface UpdateRoomSettingsResult {
  room: Room;
  warnings: string[];
}

export function createRoom(name: string, rawPath: string): Room {
  const projectPath = resolveProjectPath(rawPath);
  ensureDir(mrcxRoot(projectPath));

  const room = createRoomRecord(name, projectPath);
  ensureRoomLayout(projectPath, room.id);
  saveRoom(projectPath, room);
  saveContext(projectPath, { currentRoomId: room.id, currentStageId: null });
  return room;
}

export function listRooms(projectPath: string): Room[] {
  const resolved = resolveProjectPath(projectPath);
  return listRoomIds(resolved).map((id) => loadRoom(resolved, id));
}

export function useRoom(projectPath: string, roomId: string): Room {
  const resolved = resolveProjectPath(projectPath);
  const room = loadRoom(resolved, roomId);
  const ctx = loadContext(resolved);
  const stages = listStages(resolved, roomId);
  const stageId =
    ctx.currentStageId && stages.some((s) => s.id === ctx.currentStageId)
      ? ctx.currentStageId
      : stages[0]?.id ?? null;
  setCurrentRoom(resolved, roomId, stageId ?? undefined);
  return room;
}

export async function createStage(
  projectPath: string,
  roomId: string,
  name: string,
  content: string,
): Promise<Stage> {
  const resolved = resolveProjectPath(projectPath);
  const room = loadRoom(resolved, roomId);
  const existing = listStages(resolved, roomId);
  const stage = createStageRecord(roomId, name, content, existing.length + 1);

  const bootstrap = [
    `Stage: ${name}`,
    content ? `Description:\n${content}` : '',
    'Confirm in one sentence that you understand this stage goal (do not write code).',
  ]
    .filter(Boolean)
    .join('\n\n');

  const xRun = await codexCreateSession(room.projectPath, bootstrap, {
    extraReadableDirs: room.extraReadableDirs ?? [],
  });
  if (!xRun.sessionId) {
    throw new MrcxError(`Codex session creation failed: no thread_id returned. ${xRun.stderr}`);
  }
  try {
    assertAgentRunOk('Codex (X)', xRun);
  } catch (e) {
    throw new MrcxError(formatAgentRunFailure('Codex (X) init', xRun));
  }
  stage.xSession = { provider: 'codex', sessionId: xRun.sessionId };

  const { chatId, timedOut } = await cursorCreateChat(room.projectPath);
  stage.cSession = { provider: 'cursor', chatId };

  const now = new Date().toISOString();
  stage.updatedAt = now;
  saveStage(resolved, stage);

  appendMessage(
    resolved,
    createMessageRecord(roomId, stage.id, 'system', `Stage created; Codex thread=${xRun.sessionId}; Cursor chat=${chatId}${timedOut ? ' (create-chat killed)' : ''}`),
  );

  if (xRun.text) {
    appendAgentMessage(resolved, roomId, stage.id, 'x', xRun.text, xRun, {
      provider: 'codex',
      sessionId: xRun.sessionId,
    });
  }

  saveContext(resolved, { currentRoomId: roomId, currentStageId: stage.id });
  return stage;
}

export function getRoomSettings(projectPath: string, roomId: string): {
  name: string;
  projectPath: string;
  extraReadableDirs: string[];
} {
  const room = loadRoom(resolveProjectPath(projectPath), roomId);
  return {
    name: room.name,
    projectPath: room.projectPath,
    extraReadableDirs: room.extraReadableDirs ?? [],
  };
}

export function updateRoomSettings(
  projectPath: string,
  roomId: string,
  patch: UpdateRoomSettingsPatch,
): UpdateRoomSettingsResult {
  const resolved = resolveProjectPath(projectPath);
  const room = loadRoom(resolved, roomId);
  const warnings: string[] = [];

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new MrcxError('Room name cannot be empty');
    room.name = name;
  }

  if (patch.extraReadableDirs !== undefined) {
    const normalized = normalizeExtraReadableDirs(patch.extraReadableDirs);
    room.extraReadableDirs = normalized.dirs;
    warnings.push(...normalized.warnings);
  }

  room.updatedAt = new Date().toISOString();
  saveRoom(resolved, room);
  return { room, warnings };
}

export function listStagesForRoom(projectPath: string, roomId: string): Stage[] {
  return listStages(resolveProjectPath(projectPath), roomId);
}

export function useStage(projectPath: string, roomId: string, stageId: string): Stage {
  const resolved = resolveProjectPath(projectPath);
  const stage = listStages(resolved, roomId).find((s) => s.id === stageId);
  if (!stage) throw new MrcxError(`Stage not found: ${stageId}`);
  saveContext(resolved, { currentRoomId: roomId, currentStageId: stageId });
  return stage;
}

export function updateStage(
  projectPath: string,
  roomId: string,
  stageId: string,
  patch: { name?: string; content?: string },
): Stage {
  const resolved = resolveProjectPath(projectPath);
  const stage = listStages(resolved, roomId).find((s) => s.id === stageId);
  if (!stage) throw new MrcxError(`Stage not found: ${stageId}`);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new MrcxError('Stage name cannot be empty');
    stage.name = name;
  }
  if (patch.content !== undefined) {
    stage.content = patch.content.trim();
  }
  stage.updatedAt = new Date().toISOString();
  saveStage(resolved, stage);
  return stage;
}

export function deleteRoom(projectPath: string, roomId: string): void {
  const resolved = resolveProjectPath(projectPath);
  loadRoom(resolved, roomId);
  deleteRoomData(resolved, roomId);

  const ctx = loadContext(resolved);
  if (ctx.currentRoomId !== roomId) return;

  const remaining = listRoomIds(resolved);
  const nextRoomId = remaining[0] ?? null;
  const nextStageId = nextRoomId ? (listStages(resolved, nextRoomId)[0]?.id ?? null) : null;
  saveContext(resolved, { currentRoomId: nextRoomId, currentStageId: nextStageId });
}
