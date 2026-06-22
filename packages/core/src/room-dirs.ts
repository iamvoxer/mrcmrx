import fs from 'node:fs';
import { resolveProjectPath } from './paths.js';

export interface NormalizeExtraDirsResult {
  dirs: string[];
  warnings: string[];
}

/** Normalize extra readable dirs: absolute paths, dedupe, filter empty lines. */
export function normalizeExtraReadableDirs(input: string[]): NormalizeExtraDirsResult {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const dirs: string[] = [];

  for (const raw of input) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const abs = resolveProjectPath(trimmed);
    const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fs.existsSync(abs)) {
      warnings.push(`Extra directory does not exist (will still be saved): ${abs}`);
    }
    dirs.push(abs);
  }

  return { dirs, warnings };
}

export function parseExtraReadableDirsText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatExtraReadableDirsText(dirs: string[] | undefined): string {
  return (dirs ?? []).join('\n');
}
