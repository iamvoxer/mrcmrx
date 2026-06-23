import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath } from '@mrcx/core';

const SKIP_DIRS = new Set(['.mrcx', '.git', 'node_modules', 'dist']);

/** Reject paths under dirs skipped by listArtifacts (same boundary for read/open). */
export function assertAllowedArtifactPath(relPath: string): void {
  const normalized = path.normalize(relPath).replace(/\\/g, '/');
  for (const seg of normalized.split('/')) {
    if (seg && SKIP_DIRS.has(seg)) {
      throw new Error(`Artifact path not allowed: ${relPath}`);
    }
  }
}

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
  return fs.readFileSync(resolveArtifactFile(projectPath, relPath), 'utf8');
}

export function resolveArtifactFile(projectPath: string, relPath: string): string {
  const root = resolveProjectPath(projectPath);
  const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  assertAllowedArtifactPath(normalized);
  const full = path.resolve(root, normalized);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error('Path escapes project root');
  }
  if (!fs.existsSync(full)) {
    throw new Error('File does not exist');
  }
  if (!fs.statSync(full).isFile()) {
    throw new Error('Not a file');
  }
  return full;
}
