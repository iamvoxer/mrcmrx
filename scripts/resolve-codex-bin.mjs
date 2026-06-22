import fs from 'node:fs';
import path from 'node:path';

/**
 * Windows Codex desktop install layout:
 *   %LOCALAPPDATA%\OpenAI\Codex\bin\<build-id>\codex.exe
 *
 * Do NOT use WindowsApps path (OpenAI.Codex_...) — often "Access denied".
 */
export function findWindowsLocalCodexExe() {
  if (process.platform !== 'win32') return undefined;

  const base = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  if (!fs.existsSync(base)) return undefined;

  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const candidates = [];
  for (const entry of entries) {
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

export function splitCsv(raw) {
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Resolve how mrcx-codex-agent.mjs should spawn Codex.
 * Priority: MRCX_CODEX_BIN → Windows LocalAppData codex.exe → npx @openai/codex
 */
export function resolveCodexInvocation(env = process.env) {
  const explicitBin = env.MRCX_CODEX_BIN?.trim();
  const explicitPrefix = splitCsv(env.MRCX_CODEX_PREFIX_ARGS);

  if (explicitBin) {
    return {
      bin: explicitBin,
      prefix: explicitPrefix,
      source: 'explicit',
    };
  }

  const local = findWindowsLocalCodexExe();
  if (local) {
    return { bin: local, prefix: explicitPrefix, source: 'windows-local' };
  }

  if (explicitPrefix.length > 0) {
    return { bin: 'codex', prefix: explicitPrefix, source: 'path-codex' };
  }

  return {
    bin: 'npx',
    prefix: ['--yes', '@openai/codex'],
    source: 'npx-fallback',
  };
}
