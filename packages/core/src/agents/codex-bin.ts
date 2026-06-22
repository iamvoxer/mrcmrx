import fs from 'node:fs';
import path from 'node:path';
import { loadSettings } from '../config/settings.js';
import { resolveProjectPath } from '../paths.js';

export interface CodexInvocation {
  bin: string;
  prefix: string[];
  source: string;
}

function splitCsv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function findWindowsLocalCodexExe(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  if (!fs.existsSync(base)) return undefined;

  const candidates: string[] = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const exe = path.join(base, entry.name, 'codex.exe');
    if (fs.existsSync(exe)) candidates.push(exe);
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

/** Auto-detected codex.exe, or null if not found. */
export function detectCodexPath(): string | null {
  return findWindowsLocalCodexExe() ?? null;
}

function assertCodexExecutable(bin: string): void {
  if (!fs.existsSync(bin)) {
    throw new Error(`Codex path does not exist: ${bin}`);
  }
}

/**
 * Resolve Codex invocation.
 * Priority: MRCX_CODEX_BIN → settings.codex.path → Windows LocalAppData → npx fallback.
 */
export function resolveCodexInvocation(
  projectPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): CodexInvocation {
  const explicitBin = env.MRCX_CODEX_BIN?.trim();
  const explicitPrefix = splitCsv(env.MRCX_CODEX_PREFIX_ARGS);

  if (explicitBin) {
    assertCodexExecutable(explicitBin);
    return { bin: explicitBin, prefix: explicitPrefix, source: 'env' };
  }

  if (projectPath) {
    const configured = loadSettings(resolveProjectPath(projectPath)).codex?.path?.trim();
    if (configured) {
      assertCodexExecutable(configured);
      return { bin: configured, prefix: explicitPrefix, source: 'configured' };
    }
  }

  const local = findWindowsLocalCodexExe();
  if (local) {
    return { bin: local, prefix: explicitPrefix, source: 'windows-local' };
  }

  if (explicitPrefix.length > 0) {
    return { bin: 'codex', prefix: explicitPrefix, source: 'path-codex' };
  }

  return { bin: 'npx', prefix: ['--yes', '@openai/codex'], source: 'npx-fallback' };
}
