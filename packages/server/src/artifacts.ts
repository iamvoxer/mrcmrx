import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath } from '@mrcx/core';

const SKIP_DIRS = new Set(['.mrcx', '.git', 'node_modules', 'dist']);

export interface ArtifactEntry {
  path: string;
  name: string;
  size: number;
}

export function listArtifacts(projectPath: string, maxDepth = 2): ArtifactEntry[] {
  const root = resolveProjectPath(projectPath);
  const out: ArtifactEntry[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full);
          out.push({ path: rel, name: entry.name, size: stat.size });
        } catch {
          /* ignore */
        }
      }
    }
  }

  walk(root, 0);
  return out.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 100);
}

export function readArtifact(projectPath: string, relPath: string): string {
  const root = resolveProjectPath(projectPath);
  const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.resolve(root, normalized);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error('Path escapes project root');
  }
  return fs.readFileSync(full, 'utf8');
}
