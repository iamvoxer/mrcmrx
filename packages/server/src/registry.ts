import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, resolveProjectPath, writeJson } from '@mrcx/core';

export interface UiRegistry {
  projectPaths: string[];
}

function defaultRegistryPath(): string {
  return path.join(os.homedir(), '.mrcx', 'ui-registry.json');
}

export function loadRegistry(registryPath = defaultRegistryPath()): UiRegistry {
  if (!fs.existsSync(registryPath)) {
    return { projectPaths: [] };
  }
  const data = readJson<UiRegistry>(registryPath);
  return { projectPaths: data.projectPaths ?? [] };
}

export function saveRegistry(registry: UiRegistry, registryPath = defaultRegistryPath()): void {
  writeJson(registryPath, registry);
}

export function registerProjectPath(projectPath: string, registryPath?: string): void {
  const resolved = resolveProjectPath(projectPath);
  const registry = loadRegistry(registryPath);
  if (!registry.projectPaths.some((p) => resolveProjectPath(p).toLowerCase() === resolved.toLowerCase())) {
    registry.projectPaths.push(resolved);
    saveRegistry(registry, registryPath);
  }
}
