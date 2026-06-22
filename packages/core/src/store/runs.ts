import fs from 'node:fs';
import path from 'node:path';
import type { AgentRunDetail } from '../agents/run-detail.js';
import { buildRunDetail } from '../agents/run-detail.js';
import type { AgentRunResult } from '../types.js';
import { ensureDir, readJson, runDetailFile } from '../paths.js';

export function saveRunDetail(
  projectPath: string,
  roomId: string,
  messageId: string,
  run: AgentRunResult,
): AgentRunDetail | null {
  const detail = buildRunDetail(messageId, run);
  if (!detail) return null;
  const file = runDetailFile(projectPath, roomId, messageId);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(detail, null, 2)}\n`, 'utf8');
  return detail;
}

export function loadRunDetail(
  projectPath: string,
  roomId: string,
  messageId: string,
): AgentRunDetail | null {
  const file = runDetailFile(projectPath, roomId, messageId);
  if (!fs.existsSync(file)) return null;
  return readJson<AgentRunDetail>(file);
}
