import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, readJson, resolveProjectPath, writeJson } from '../paths.js';

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

/** User-level .mrcx directory (override with MRCX_GLOBAL_DIR in tests). */
export function globalMrcxDir(): string {
  const fromEnv = process.env.MRCX_GLOBAL_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), '.mrcx');
}

export function globalSettingsPath(): string {
  return path.join(globalMrcxDir(), 'settings.json');
}

export function loadGlobalSettings(): MrcxSettings {
  const file = globalSettingsPath();
  if (!fs.existsSync(file)) return {};
  return readJson<MrcxSettings>(file);
}

export function saveGlobalSettings(settings: MrcxSettings): void {
  ensureDir(globalMrcxDir());
  writeJson(globalSettingsPath(), settings);
}

/** Project-level settings path (room data lives under project .mrcx; tool paths are global). */
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

export function setProxyUrl(url: string): MrcxSettings {
  const settings = loadGlobalSettings();
  settings.proxy = { url: url.trim() };
  saveGlobalSettings(settings);
  return settings;
}

export function clearProxy(): MrcxSettings {
  const settings = loadGlobalSettings();
  delete settings.proxy;
  saveGlobalSettings(settings);
  return settings;
}

export function setCursorAgentPath(agentPath: string): MrcxSettings {
  const settings = loadGlobalSettings();
  settings.cursorAgent = { path: agentPath.trim() };
  saveGlobalSettings(settings);
  return settings;
}

export function clearCursorAgentPath(): MrcxSettings {
  const settings = loadGlobalSettings();
  delete settings.cursorAgent;
  saveGlobalSettings(settings);
  return settings;
}

export function setCodexPath(codexPath: string): MrcxSettings {
  const settings = loadGlobalSettings();
  settings.codex = { path: codexPath.trim() };
  saveGlobalSettings(settings);
  return settings;
}

export function clearCodexPath(): MrcxSettings {
  const settings = loadGlobalSettings();
  delete settings.codex;
  saveGlobalSettings(settings);
  return settings;
}

export function setRgPath(rgPath: string): MrcxSettings {
  const settings = loadGlobalSettings();
  settings.tools = { ...settings.tools, rgPath: rgPath.trim() };
  saveGlobalSettings(settings);
  return settings;
}

export function clearRgPath(): MrcxSettings {
  const settings = loadGlobalSettings();
  if (settings.tools) {
    delete settings.tools.rgPath;
    if (Object.keys(settings.tools).length === 0) delete settings.tools;
  }
  saveGlobalSettings(settings);
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

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
] as const;

export function stripProxyEnvVars(env: NodeJS.ProcessEnv): void {
  for (const key of PROXY_ENV_KEYS) {
    delete env[key];
  }
}

/** Proxy URL from user ~/.mrcx/settings.json only (no process env / system proxy). */
export function resolveSettingsProxyUrl(_projectPath?: string): string | undefined {
  const settings = loadGlobalSettings();
  const p = settings.proxy;
  if (!p) return undefined;
  if (p.url?.trim()) return p.url.trim();
  if (p.https?.trim()) return p.https.trim();
  if (p.http?.trim()) return p.http.trim();
  return undefined;
}

/** Effective proxy for connectivity checks and subprocesses: CLI --proxy, then user settings. */
export function resolveEffectiveProxyUrl(projectPath?: string): string | undefined {
  return getCliProxyOverride() ?? resolveSettingsProxyUrl(projectPath);
}

let cliProxyOverride: string | undefined;

export function setCliProxyOverride(url: string | undefined): void {
  cliProxyOverride = url?.trim() || undefined;
}

export function getCliProxyOverride(): string | undefined {
  return cliProxyOverride;
}

/** Env for Codex / Cursor subprocesses. Proxy comes from global settings (and optional CLI --proxy), not shell env. */
export function buildSpawnEnvWithMeta(startDir: string): { env: NodeJS.ProcessEnv; meta: SpawnEnvMeta } {
  const settings = loadGlobalSettings();
  const fromSettings = proxyEnvFromSettings(settings);
  const env: NodeJS.ProcessEnv = { ...process.env };
  stripProxyEnvVars(env);
  Object.assign(env, fromSettings);

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

export function buildSpawnEnv(_startDir: string): NodeJS.ProcessEnv {
  return buildSpawnEnvWithMeta(_startDir).env;
}
