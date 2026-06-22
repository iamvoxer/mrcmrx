import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath } from '@mrcx/core';
import { loadRegistry, registerProjectPath } from './registry.js';

function hasMrcx(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, '.mrcx'));
}

/** On UI startup, discover existing projects: registry, cwd, and immediate subdirs of cwd. */
export function bootstrapUiProjects(scanRoot = process.cwd()): void {
  const registry = loadRegistry();
  for (const p of registry.projectPaths) {
    const resolved = resolveProjectPath(p);
    if (hasMrcx(resolved)) {
      registerProjectPath(resolved);
    }
  }

  const root = resolveProjectPath(scanRoot);
  if (hasMrcx(root)) {
    registerProjectPath(root);
  }

  try {
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
      const sub = path.join(root, ent.name);
      if (hasMrcx(sub)) {
        registerProjectPath(sub);
      }
    }
  } catch {
    /* ignore unreadable cwd */
  }
}
