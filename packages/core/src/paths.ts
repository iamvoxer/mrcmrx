import fs from 'node:fs';
import path from 'node:path';

export function resolveProjectPath(raw: string): string {
  return path.resolve(raw);
}

export function mrcxRoot(projectPath: string): string {
  return path.join(resolveProjectPath(projectPath), '.mrcx');
}

export function contextPath(projectPath: string): string {
  return path.join(mrcxRoot(projectPath), 'context.json');
}

export function roomDir(projectPath: string, roomId: string): string {
  return path.join(mrcxRoot(projectPath), 'rooms', roomId);
}

export function roomFile(projectPath: string, roomId: string): string {
  return path.join(roomDir(projectPath, roomId), 'room.json');
}

export function stagesDir(projectPath: string, roomId: string): string {
  return path.join(roomDir(projectPath, roomId), 'stages');
}

export function stageFile(projectPath: string, roomId: string, stageId: string): string {
  return path.join(stagesDir(projectPath, roomId), `${stageId}.json`);
}

export function messagesFile(projectPath: string, roomId: string, stageId: string): string {
  return path.join(roomDir(projectPath, roomId), 'messages', `${stageId}.jsonl`);
}

export function runsDir(projectPath: string, roomId: string, messageId: string): string {
  return path.join(roomDir(projectPath, roomId), 'runs', messageId);
}

export function runDetailFile(projectPath: string, roomId: string, messageId: string): string {
  return path.join(roomDir(projectPath, roomId), 'runs', `${messageId}.json`);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
