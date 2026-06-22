import fs from 'node:fs';
import path from 'node:path';
import { readJson, resolveProjectPath, writeJson } from '../paths.js';

export interface MrcxProxySettings {
  /** Sets both HTTP_PROXY and HTTPS_PROXY */
  url?: string;
  http?: string;
  https?: string;
}

export interface MrcxToolSettings {
  /** ripgrep: full path to rg.exe */
  rgPath?: string;
}

export interface MrcxSettings {
  proxy?: MrcxProxySettings;
  /** Cursor Agent: full path to node.exe, index.js, or version directory */
  cursorAgent?: { path?: string };
  /** Codex CLI: full path to codex.exe */
  codex?: { path?: string };
  /** Subprocess tool paths (rg, etc.) */
  tools?: MrcxToolSettings;
}

export function settingsPath(projectPath: string): string {
  return path.join(resolveProjectPath(projectPath), '.mrcx', 'settings.json');
}

export function loadSettings(projectPath: string): MrcxSettings {
  const file = settingsPath(projectPath);
  if (!fs.existsSync(file)) return {};
  return readJson<MrcxSettings>(file);
}

export function saveSettings(projectPath: string, settings: MrcxSettings): void {
  writeJson(settingsPath(projectPath), settings);
}

/** Walk up from cwd to find a directory containing .mrcx; returns cwd if none found. */
export function findMrcxProjectPath(startDir = process.cwd()): string {
  let dir = resolveProjectPath(startDir);
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, '.mrcx'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolveProjectPath(startDir);
}

export function setProxyUrl(projectPath: string, url: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  settings.proxy = { url: url.trim() };
  saveSettings(projectPath, settings);
  return settings;
}

export function clearProxy(projectPath: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  delete settings.proxy;
  saveSettings(projectPath, settings);
  return settings;
}

export function setCursorAgentPath(projectPath: string, agentPath: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  settings.cursorAgent = { path: agentPath.trim() };
  saveSettings(projectPath, settings);
  return settings;
}

export function clearCursorAgentPath(projectPath: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  delete settings.cursorAgent;
  saveSettings(projectPath, settings);
  return settings;
}

export function setCodexPath(projectPath: string, codexPath: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  settings.codex = { path: codexPath.trim() };
  saveSettings(projectPath, settings);
  return settings;
}

export function clearCodexPath(projectPath: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  delete settings.codex;
  saveSettings(projectPath, settings);
  return settings;
}

export function setRgPath(projectPath: string, rgPath: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  settings.tools = { ...settings.tools, rgPath: rgPath.trim() };
  saveSettings(projectPath, settings);
  return settings;
}

export function clearRgPath(projectPath: string): MrcxSettings {
  const settings = loadSettings(projectPath);
  if (settings.tools) {
    delete settings.tools.rgPath;
    if (Object.keys(settings.tools).length === 0) delete settings.tools;
  }
  saveSettings(projectPath, settings);
  return settings;
}

export interface SpawnEnvMeta {
  rgPath: string | null;
  pathPrefix: string[];
}

/** Common git directories on Windows for Codex subprocess tools. */
function extraToolPathDirs(): string[] {
  if (process.platform !== 'win32') return [];
  const candidates = [
    'C:\\Program Files\\Git\\cmd',
    'C:\\Program Files\\Git\\usr\\bin',
  ];
  return candidates.filter((d) => fs.existsSync(d));
}

function prependPathDirs(env: NodeJS.ProcessEnv, dirs: string[]): void {
  if (dirs.length === 0) return;
  const sep = path.delimiter;
  const current = env.PATH ?? '';
  const existing = new Set(current.split(sep).map((p) => p.toLowerCase()));
  const toAdd = dirs.filter((d) => !existing.has(d.toLowerCase()));
  if (toAdd.length === 0) return;
  env.PATH = [...toAdd, ...current.split(sep).filter(Boolean)].join(sep);
}

export function proxyEnvFromSettings(settings: MrcxSettings): Record<string, string> {
  const p = settings.proxy;
  if (!p) return {};
  const env: Record<string, string> = {};
  if (p.url) {
    env.HTTP_PROXY = p.url;
    env.HTTPS_PROXY = p.url;
    env.http_proxy = p.url;
    env.https_proxy = p.url;
  }
  if (p.http) {
    env.HTTP_PROXY = p.http;
    env.http_proxy = p.http;
  }
  if (p.https) {
    env.HTTPS_PROXY = p.https;
    env.https_proxy = p.https;
  }
  return env;
}

let cliProxyOverride: string | undefined;

export function setCliProxyOverride(url: string | undefined): void {
  cliProxyOverride = url?.trim() || undefined;
}

export function getCliProxyOverride(): string | undefined {
  return cliProxyOverride;
}

/** Env for Codex / Cursor subprocesses (merges shell, settings, --proxy). */
export function buildSpawnEnvWithMeta(startDir: string): { env: NodeJS.ProcessEnv; meta: SpawnEnvMeta } {
  const mrcxRoot = findMrcxProjectPath(startDir);
  const settings = loadSettings(mrcxRoot);
  const fromSettings = proxyEnvFromSettings(settings);
  const env: NodeJS.ProcessEnv = { ...process.env, ...fromSettings };

  const override = getCliProxyOverride();
  if (override) {
    env.HTTP_PROXY = override;
    env.HTTPS_PROXY = override;
    env.http_proxy = override;
    env.https_proxy = override;
  }

  const pathPrefix = extraToolPathDirs();
  let rgPath: string | null = null;
  const configuredRg = settings.tools?.rgPath?.trim();
  if (configuredRg && fs.existsSync(configuredRg)) {
    rgPath = path.resolve(configuredRg);
    pathPrefix.unshift(path.dirname(rgPath));
  }
  prependPathDirs(env, pathPrefix);

  return { env, meta: { rgPath, pathPrefix } };
}

export function buildSpawnEnv(startDir: string): NodeJS.ProcessEnv {
  return buildSpawnEnvWithMeta(startDir).env;
}
