import fs from 'node:fs';
import path from 'node:path';
import type { MrcxContext, Room, Stage, Message } from '../types.js';
import { normalizeExtraReadableDirs } from '../room-dirs.js';
import {
  contextPath,
  ensureDir,
  messagesFile,
  mrcxRoot,
  readJson,
  roomDir,
  roomFile,
  stageFile,
  stagesDir,
  writeJson,
} from '../paths.js';
import { createId } from '../id.js';

export function listRoomIds(projectPath: string): string[] {
  const root = path.join(mrcxRoot(projectPath), 'rooms');
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(roomFile(projectPath, d.name)))
    .map((d) => d.name);
}

export function loadRoom(projectPath: string, roomId: string): Room {
  const room = readJson<Room>(roomFile(projectPath, roomId));
  return {
    ...room,
    extraReadableDirs: room.extraReadableDirs ?? [],
  };
}

export function saveRoom(projectPath: string, room: Room): void {
  writeJson(roomFile(projectPath, room.id), room);
}

export function loadContext(projectPath: string): MrcxContext {
  const file = contextPath(projectPath);
  if (!fs.existsSync(file)) {
    return { currentRoomId: null, currentStageId: null };
  }
  return readJson<MrcxContext>(file);
}

export function saveContext(projectPath: string, ctx: MrcxContext): void {
  writeJson(contextPath(projectPath), ctx);
}

export function listStages(projectPath: string, roomId: string): Stage[] {
  const dir = stagesDir(projectPath, roomId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<Stage>(path.join(dir, f)))
    .sort((a, b) => a.order - b.order);
}

export function loadStage(projectPath: string, roomId: string, stageId: string): Stage {
  return readJson<Stage>(stageFile(projectPath, roomId, stageId));
}

export function saveStage(projectPath: string, stage: Stage): void {
  writeJson(stageFile(projectPath, stage.roomId, stage.id), stage);
}

export function deleteRoomData(projectPath: string, roomId: string): void {
  const dir = roomDir(projectPath, roomId);
  if (!fs.existsSync(dir)) {
    throw new Error(`Room directory does not exist: ${roomId}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

export function appendMessage(projectPath: string, message: Message): void {
  const file = messagesFile(projectPath, message.roomId, message.stageId);
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(message)}\n`, 'utf8');
}

export function loadMessages(projectPath: string, roomId: string, stageId: string): Message[] {
  const file = messagesFile(projectPath, roomId, stageId);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Message);
}

export function ensureRoomLayout(projectPath: string, roomId: string): void {
  ensureDir(roomDir(projectPath, roomId));
  ensureDir(stagesDir(projectPath, roomId));
  ensureDir(path.join(roomDir(projectPath, roomId), 'messages'));
  ensureDir(path.join(roomDir(projectPath, roomId), 'runs'));
}

export function createRoomRecord(name: string, projectPath: string): Room {
  const now = new Date().toISOString();
  return {
    id: createId('room'),
    name,
    projectPath,
    extraReadableDirs: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createStageRecord(roomId: string, name: string, content: string, order: number): Stage {
  const now = new Date().toISOString();
  return {
    id: createId('stage'),
    roomId,
    name,
    content,
    order,
    xSession: null,
    cSession: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMessageRecord(
  roomId: string,
  stageId: string,
  speaker: Message['speaker'],
  content: string,
  meta?: Message['meta'],
): Message {
  return {
    id: createId('msg'),
    roomId,
    stageId,
    speaker,
    content,
    createdAt: new Date().toISOString(),
    meta,
  };
}
