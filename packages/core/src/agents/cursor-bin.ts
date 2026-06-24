import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadGlobalSettings } from '../config/settings.js';

export interface CursorAgentInvocation {
  node: string;
  index: string;
  version: string;
  source: string;
}

function nodeBinaryName(): string {
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function pairFromDir(dir: string, source: string): CursorAgentInvocation | null {
  const node = path.join(dir, nodeBinaryName());
  const index = path.join(dir, 'index.js');
  if (fs.existsSync(index) && fs.existsSync(node)) {
    return { node, index, version: path.basename(dir), source };
  }
  return null;
}

/** Resolve invocation from configured node.exe / index.js / version directory. */
export function resolveCursorAgentFromPath(rawPath: string): CursorAgentInvocation {
  const resolved = path.resolve(rawPath.trim());
  if (!fs.existsSync(resolved)) {
    throw new Error(`Cursor Agent path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const paired = pairFromDir(resolved, 'configured');
    if (paired) return paired;
    throw new Error(`node and index.js not found in directory: ${resolved}`);
  }

  const base = path.dirname(resolved);
  const baseName = path.basename(resolved).toLowerCase();
  if (baseName === 'index.js') {
    const node = path.join(base, nodeBinaryName());
    if (!fs.existsSync(node)) {
      throw new Error(`${nodeBinaryName()} not found in same directory: ${base}`);
    }
    return { node, index: resolved, version: path.basename(base), source: 'configured' };
  }
  if (baseName === 'node.exe' || baseName === 'node') {
    const index = path.join(base, 'index.js');
    if (!fs.existsSync(index)) {
      throw new Error(`index.js not found in same directory: ${base}`);
    }
    return { node: resolved, index, version: path.basename(base), source: 'configured' };
  }

  throw new Error('Provide the full path to a cursor-agent version directory, node.exe, or index.js');
}

function findVersionDir(versionsDir: string): CursorAgentInvocation | null {
  if (!fs.existsSync(versionsDir)) return null;
  const dirs = fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const name of dirs) {
    const paired = pairFromDir(path.join(versionsDir, name), 'local-appdata');
    if (paired) return paired;
  }
  return null;
}

function autoDiscoverCursorAgent(): CursorAgentInvocation {
  const winBase = path.join(os.homedir(), 'AppData', 'Local', 'cursor-agent', 'versions');
  const found = findVersionDir(winBase);
  if (found) return found;

  const unixBase = path.join(os.homedir(), '.local', 'share', 'cursor-agent', 'versions');
  const unixFound = findVersionDir(unixBase);
  if (unixFound) return unixFound;

  throw new Error(
    'cursor-agent not found. Install it or set cursorAgent.path in user settings (~/.mrcx/settings.json)',
  );
}

/** Auto-detected node.exe path when unconfigured; null on failure. */
export function detectCursorAgentPath(): string | null {
  try {
    return autoDiscoverCursorAgent().node;
  } catch {
    return null;
  }
}

/**
 * Resolve Cursor Agent invocation.
 * Priority: MRCX_CURSOR_AGENT_PATH → settings.cursorAgent.path → auto-detect.
 */
export function resolveCursorAgentInvocation(projectPath?: string): CursorAgentInvocation {
  const envPath = process.env.MRCX_CURSOR_AGENT_PATH?.trim();
  if (envPath) {
    return resolveCursorAgentFromPath(envPath);
  }

  const configured = loadGlobalSettings().cursorAgent?.path?.trim();
  if (configured) {
    return resolveCursorAgentFromPath(configured);
  }

  return autoDiscoverCursorAgent();
}
