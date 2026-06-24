import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadGlobalSettings } from '../config/settings.js';

export interface RgInvocation {
  path: string;
  source: string;
}

function isWindowsAppsPath(candidate: string): boolean {
  return candidate.toLowerCase().replace(/\//g, '\\').includes('\\windowsapps\\');
}

function findRgOnPath(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const r = spawnSync(cmd, ['rg'], { encoding: 'utf8', env, windowsHide: true });
    if (r.status !== 0) return null;
    const lines = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (isWindowsAppsPath(line)) continue;
      if (fs.existsSync(line)) return path.resolve(line);
    }
    const fallback = lines[0];
    return fallback && fs.existsSync(fallback) ? path.resolve(fallback) : null;
  } catch {
    return null;
  }
}

export function findCodexBundledRgExe(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  if (!fs.existsSync(base)) return undefined;

  const candidates: string[] = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rg = path.join(base, entry.name, 'rg.exe');
    if (fs.existsSync(rg)) candidates.push(rg);
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });
  return candidates[0];
}

/** Auto-detect rg.exe: PATH (skip WindowsApps first) → Codex LocalAppData bin. */
export function detectRgPath(env: NodeJS.ProcessEnv = process.env): string | null {
  return findRgOnPath(env) ?? findCodexBundledRgExe() ?? null;
}

function assertRgExecutable(bin: string): void {
  if (!fs.existsSync(bin)) {
    throw new Error(`ripgrep path does not exist: ${bin}`);
  }
}

/** Resolve rg path: settings.tools.rgPath → auto-detect. */
export function resolveRgInvocation(
  projectPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): RgInvocation | null {
  const configured = loadGlobalSettings().tools?.rgPath?.trim();
  if (configured) {
    assertRgExecutable(configured);
    return { path: path.resolve(configured), source: 'configured' };
  }

  const detected = detectRgPath(env);
  return detected ? { path: detected, source: 'detected' } : null;
}
