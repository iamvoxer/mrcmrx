import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import {
  chatWithX,
  clearProxy,
  createRoom,
  createStage,
  deleteRoom,
  getRoomSettings,
  detectCodexPath,
  detectCursorAgentPath,
  detectRgPath,
  forwardCToX,
  forwardXToC,
  getStatus,
  loadContext,
  loadMessages,
  loadGlobalSettings,
  globalSettingsPath,
  listStagesForRoom,
  loadRunDetail,
  MrcxError,
  resolveCodexInvocation,
  resolveCursorAgentInvocation,
  resolveRgInvocation,
  resolveProjectPath,
  setCursorAgentPath,
  clearCursorAgentPath,
  setCodexPath,
  clearCodexPath,
  setRgPath,
  clearRgPath,
  setProxyUrl,
  updateStage,
  updateRoomSettings,
  useRoom,
  useStage,
} from '@mrcx/core';
import { listArtifacts, readArtifact, resolveArtifactFile } from './artifacts.js';
import { bootstrapUiProjects } from './discovery.js';
import { openFileWithDefaultApp, openPathInExplorer } from './open-path.js';
import { pickDirectory } from './pick-directory.js';
import { registerProjectPath } from './registry.js';
import { findRoom, findStage, listAllRooms } from './resolver.js';

export interface StartUiServerOptions {
  host?: string;
  port?: number;
  openBrowser?: boolean;
  webDistPath?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

function errorStatus(err: unknown): number {
  return err instanceof MrcxError ? 400 : 500;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function matchRoute(method: string, pathname: string, pattern: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const sp = pathParts[i];
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(sp);
    } else if (pp !== sp) {
      return null;
    }
  }
  return params;
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
  const method = req.method ?? 'GET';

  try {
    if (method === 'GET' && pathname === '/api/rooms') {
      const rooms = listAllRooms().map(({ projectPath, room }) => ({
        ...room,
        mrcxRoot: projectPath,
        isActive: false,
      }));
      sendJson(res, 200, { rooms });
      return true;
    }

    if (method === 'POST' && pathname === '/api/rooms') {
      const body = await readJsonBody<{ name?: string; projectPath?: string; stageName?: string; stageContent?: string }>(req);
      if (!body.name?.trim() || !body.projectPath?.trim()) {
        sendJson(res, 400, { error: 'name and projectPath are required' });
        return true;
      }
      const room = createRoom(body.name.trim(), body.projectPath.trim());
      registerProjectPath(room.projectPath);
      useRoom(room.projectPath, room.id);
      let stage = null;
      if (body.stageName?.trim()) {
        stage = await createStage(
          room.projectPath,
          room.id,
          body.stageName.trim(),
          body.stageContent?.trim() ?? '',
        );
      }
      sendJson(res, 201, { room, stage });
      return true;
    }

    const roomUse = matchRoute(method, pathname, '/api/rooms/:id/use');
    if (roomUse && method === 'POST') {
      const found = findRoom(roomUse.id);
      if (!found) {
        sendJson(res, 404, { error: 'Room not found' });
        return true;
      }
      const room = useRoom(found.projectPath, found.room.id);
      const ctx = loadContext(found.projectPath);
      sendJson(res, 200, { room, context: ctx });
      return true;
    }

    const stagesList = matchRoute(method, pathname, '/api/rooms/:roomId/stages');
    if (stagesList && method === 'GET') {
      const found = findRoom(stagesList.roomId);
      if (!found) {
        sendJson(res, 404, { error: 'Room not found' });
        return true;
      }
      sendJson(res, 200, { stages: listStagesForRoom(found.projectPath, found.room.id) });
      return true;
    }

    const stageCreate = matchRoute(method, pathname, '/api/rooms/:roomId/stages');
    if (stageCreate && method === 'POST') {
      const found = findRoom(stageCreate.roomId);
      if (!found) {
        sendJson(res, 404, { error: 'Room not found' });
        return true;
      }
      const body = await readJsonBody<{ name?: string; content?: string }>(req);
      if (!body.name?.trim()) {
        sendJson(res, 400, { error: 'name is required' });
        return true;
      }
      const stage = await createStage(found.projectPath, found.room.id, body.name.trim(), body.content?.trim() ?? '');
      sendJson(res, 201, { stage });
      return true;
    }

    const stageUse = matchRoute(method, pathname, '/api/stages/:stageId/use');
    if (stageUse && method === 'POST') {
      const found = findStage(stageUse.stageId);
      if (!found) {
        sendJson(res, 404, { error: 'Stage not found' });
        return true;
      }
      const stage = useStage(found.projectPath, found.room.id, found.stage.id);
      sendJson(res, 200, { stage });
      return true;
    }

    const stageUpdate = matchRoute(method, pathname, '/api/stages/:stageId');
    if (stageUpdate && method === 'PUT') {
      const found = findStage(stageUpdate.stageId);
      if (!found) {
        sendJson(res, 404, { error: 'Stage not found' });
        return true;
      }
      const body = await readJsonBody<{ name?: string; content?: string }>(req);
      if (body.name === undefined && body.content === undefined) {
        sendJson(res, 400, { error: 'Provide at least name or content' });
        return true;
      }
      const stage = updateStage(found.projectPath, found.room.id, found.stage.id, body);
      sendJson(res, 200, { stage });
      return true;
    }

    const roomDelete = matchRoute(method, pathname, '/api/rooms/:id');
    if (roomDelete && method === 'DELETE') {
      const found = findRoom(roomDelete.id);
      if (!found) {
        sendJson(res, 404, { error: 'Room not found' });
        return true;
      }
      deleteRoom(found.projectPath, found.room.id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    const roomSettingsGet = matchRoute(method, pathname, '/api/rooms/:roomId/settings');
    if (roomSettingsGet && method === 'GET') {
      const found = findRoom(roomSettingsGet.roomId);
      if (!found) {
        sendJson(res, 404, { error: 'Room not found' });
        return true;
      }
      sendJson(res, 200, getRoomSettings(found.projectPath, found.room.id));
      return true;
    }

    const roomSettingsPut = matchRoute(method, pathname, '/api/rooms/:roomId/settings');
    if (roomSettingsPut && method === 'PUT') {
      const found = findRoom(roomSettingsPut.roomId);
      if (!found) {
        sendJson(res, 404, { error: 'Room not found' });
        return true;
      }
      const body = await readJsonBody<{ name?: string; extraReadableDirs?: string[] }>(req);
      if (body.name === undefined && body.extraReadableDirs === undefined) {
        sendJson(res, 400, { error: 'Provide at least name or extraReadableDirs' });
        return true;
      }
      const { room, warnings } = updateRoomSettings(found.projectPath, found.room.id, {
        name: body.name,
        extraReadableDirs: body.extraReadableDirs,
      });
      sendJson(res, 200, {
        name: room.name,
        projectPath: room.projectPath,
        extraReadableDirs: room.extraReadableDirs ?? [],
        warnings,
      });
      return true;
    }

    const messagesGet = matchRoute(method, pathname, '/api/stages/:stageId/messages');
    if (messagesGet && method === 'GET') {
      const found = findStage(messagesGet.stageId);
      if (!found) {
        sendJson(res, 404, { error: 'Stage not found' });
        return true;
      }
      sendJson(res, 200, {
        messages: loadMessages(found.projectPath, found.room.id, found.stage.id),
      });
      return true;
    }

    const runGet = matchRoute(method, pathname, '/api/messages/:messageId/run');
    if (runGet && method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const projectPath = url.searchParams.get('projectPath');
      const roomId = url.searchParams.get('roomId');
      if (!projectPath?.trim() || !roomId?.trim()) {
        sendJson(res, 400, { error: 'projectPath and roomId are required' });
        return true;
      }
      const detail = loadRunDetail(projectPath.trim(), roomId.trim(), runGet.messageId);
      if (!detail) {
        sendJson(res, 404, { error: 'Run detail not found (may be an old message without CLI log)' });
        return true;
      }
      sendJson(res, 200, { run: detail });
      return true;
    }

    if (method === 'POST' && pathname === '/api/x/chat') {
      const body = await readJsonBody<{ message?: string; projectPath?: string; stream?: boolean }>(req);
      if (!body.message?.trim()) {
        sendJson(res, 400, { error: 'message is required' });
        return true;
      }
      if (body.stream) {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const writeLine = (obj: unknown): void => {
          res.write(`${JSON.stringify(obj)}\n`);
        };
        try {
          const msg = await chatWithX(body.message.trim(), {
            projectPath: body.projectPath,
            onProgress: (text) => writeLine({ type: 'delta', text }),
          });
          writeLine({ type: 'done', message: msg });
        } catch (err) {
          writeLine({ type: 'error', error: errorMessage(err) });
        }
        res.end();
        return true;
      }
      const msg = await chatWithX(body.message.trim(), { projectPath: body.projectPath });
      sendJson(res, 200, { message: msg });
      return true;
    }

    if (method === 'POST' && pathname === '/api/forward/x-to-c') {
      const body = await readJsonBody<{ last?: number; note?: string; projectPath?: string }>(req);
      const msg = await forwardXToC({
        last: body.last ?? 1,
        note: body.note,
        projectPath: body.projectPath,
      });
      sendJson(res, 200, { message: msg });
      return true;
    }

    if (method === 'POST' && pathname === '/api/forward/c-to-x') {
      const body = await readJsonBody<{
        last?: number;
        note?: string;
        includeDiff?: boolean;
        projectPath?: string;
        stream?: boolean;
      }>(req);
      if (body.stream) {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const writeLine = (obj: unknown): void => {
          res.write(`${JSON.stringify(obj)}\n`);
        };
        try {
          const msg = await forwardCToX({
            last: body.last ?? 1,
            note: body.note,
            includeDiff: body.includeDiff ?? false,
            projectPath: body.projectPath,
            onProgress: (text) => writeLine({ type: 'delta', text }),
          });
          writeLine({ type: 'done', message: msg });
        } catch (err) {
          writeLine({ type: 'error', error: errorMessage(err) });
        }
        res.end();
        return true;
      }
      const msg = await forwardCToX({
        last: body.last ?? 1,
        note: body.note,
        includeDiff: body.includeDiff ?? false,
        projectPath: body.projectPath,
      });
      sendJson(res, 200, { message: msg });
      return true;
    }

    if (method === 'GET' && pathname === '/api/config') {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const projectPathParam = url.searchParams.get('projectPath');
      const cwd = projectPathParam ? resolveProjectPath(projectPathParam) : process.cwd();
      const settings = loadGlobalSettings();
      let cursorResolved: { node: string; index: string; source: string } | null = null;
      let codexResolved: { bin: string; source: string } | null = null;
      let rgResolved: { path: string; source: string } | null = null;
      try {
        const inv = resolveCursorAgentInvocation(cwd);
        cursorResolved = { node: inv.node, index: inv.index, source: inv.source };
      } catch {
        cursorResolved = null;
      }
      try {
        const inv = resolveCodexInvocation(cwd);
        codexResolved = { bin: inv.bin, source: inv.source };
      } catch {
        codexResolved = null;
      }
      try {
        rgResolved = resolveRgInvocation(cwd);
      } catch {
        rgResolved = null;
      }
      sendJson(res, 200, {
        proxy: settings.proxy ?? null,
        cursorAgent: settings.cursorAgent?.path ?? null,
        cursorAgentDetected: detectCursorAgentPath(),
        cursorAgentResolved: cursorResolved,
        codex: settings.codex?.path ?? null,
        codexDetected: detectCodexPath(),
        codexResolved,
        rgPath: settings.tools?.rgPath ?? null,
        rgDetected: detectRgPath(),
        rgResolved,
        settingsPath: globalSettingsPath(),
      });
      return true;
    }

    if (method === 'GET' && pathname === '/api/config/cursor-agent/detect') {
      sendJson(res, 200, { path: detectCursorAgentPath() });
      return true;
    }

    if (method === 'PUT' && pathname === '/api/config/cursor-agent') {
      const body = await readJsonBody<{ path?: string; projectPath?: string }>(req);
      if (!body.path?.trim()) {
        sendJson(res, 400, { error: 'path is required' });
        return true;
      }
      setCursorAgentPath(body.path.trim());
      const cwd = body.projectPath?.trim() ? resolveProjectPath(body.projectPath) : process.cwd();
      const inv = resolveCursorAgentInvocation(cwd);
      sendJson(res, 200, {
        cursorAgent: loadGlobalSettings().cursorAgent?.path ?? null,
        cursorAgentResolved: { node: inv.node, index: inv.index, source: inv.source },
      });
      return true;
    }

    if (method === 'DELETE' && pathname === '/api/config/cursor-agent') {
      clearCursorAgentPath();
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/config/codex/detect') {
      sendJson(res, 200, { path: detectCodexPath() });
      return true;
    }

    if (method === 'PUT' && pathname === '/api/config/codex') {
      const body = await readJsonBody<{ path?: string; projectPath?: string }>(req);
      if (!body.path?.trim()) {
        sendJson(res, 400, { error: 'path is required' });
        return true;
      }
      setCodexPath(body.path.trim());
      const cwd = body.projectPath?.trim() ? resolveProjectPath(body.projectPath) : process.cwd();
      const inv = resolveCodexInvocation(cwd);
      sendJson(res, 200, {
        codex: loadGlobalSettings().codex?.path ?? null,
        codexResolved: { bin: inv.bin, source: inv.source },
      });
      return true;
    }

    if (method === 'DELETE' && pathname === '/api/config/codex') {
      clearCodexPath();
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/config/rg/detect') {
      sendJson(res, 200, { path: detectRgPath() });
      return true;
    }

    if (method === 'PUT' && pathname === '/api/config/rg') {
      const body = await readJsonBody<{ path?: string; projectPath?: string }>(req);
      if (!body.path?.trim()) {
        sendJson(res, 400, { error: 'path is required' });
        return true;
      }
      setRgPath(body.path.trim());
      const cwd = body.projectPath?.trim() ? resolveProjectPath(body.projectPath) : process.cwd();
      const inv = resolveRgInvocation(cwd);
      sendJson(res, 200, {
        rgPath: loadGlobalSettings().tools?.rgPath ?? null,
        rgResolved: inv,
      });
      return true;
    }

    if (method === 'DELETE' && pathname === '/api/config/rg') {
      clearRgPath();
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (method === 'PUT' && pathname === '/api/config/proxy') {
      const body = await readJsonBody<{ url?: string }>(req);
      if (!body.url?.trim()) {
        sendJson(res, 400, { error: 'url is required' });
        return true;
      }
      setProxyUrl(body.url.trim());
      sendJson(res, 200, { proxy: loadGlobalSettings().proxy ?? null });
      return true;
    }

    if (method === 'DELETE' && pathname === '/api/config/proxy') {
      clearProxy();
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/status') {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const projectPath = url.searchParams.get('projectPath') ?? undefined;
      sendJson(res, 200, getStatus(projectPath ?? undefined));
      return true;
    }

    const artifactsList = matchRoute(method, pathname, '/api/rooms/:roomId/artifacts');
    if (artifactsList && method === 'GET') {
      const found = findRoom(artifactsList.roomId);
      if (!found) {
        sendJson(res, 404, { error: 'Room not found' });
        return true;
      }
      sendJson(res, 200, { artifacts: listArtifacts(found.room.projectPath) });
      return true;
    }

    if (method === 'GET' && pathname === '/api/fs/suggested-path') {
      sendJson(res, 200, { path: resolveProjectPath(process.cwd()) });
      return true;
    }

    if (method === 'POST' && pathname === '/api/fs/pick-directory') {
      const body = await readJsonBody<{ initialPath?: string }>(req);
      const selected = await pickDirectory(body.initialPath);
      if (!selected) {
        sendJson(res, 200, { cancelled: true });
        return true;
      }
      sendJson(res, 200, { path: resolveProjectPath(selected), cancelled: false });
      return true;
    }

    if (method === 'POST' && pathname === '/api/fs/open-path') {
      const body = await readJsonBody<{ path?: string }>(req);
      if (!body.path?.trim()) {
        sendJson(res, 400, { error: 'path is required' });
        return true;
      }
      await openPathInExplorer(body.path.trim());
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/artifacts/content') {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const projectPath = url.searchParams.get('projectPath');
      const relPath = url.searchParams.get('path');
      if (!projectPath || !relPath) {
        sendJson(res, 400, { error: 'projectPath and path are required' });
        return true;
      }
      sendJson(res, 200, { path: relPath, content: readArtifact(projectPath, relPath) });
      return true;
    }

    if (method === 'POST' && pathname === '/api/artifacts/open') {
      const body = await readJsonBody<{ projectPath?: string; path?: string }>(req);
      if (!body.projectPath?.trim() || !body.path?.trim()) {
        sendJson(res, 400, { error: 'projectPath and path are required' });
        return true;
      }
      const fullPath = resolveArtifactFile(body.projectPath.trim(), body.path.trim());
      await openFileWithDefaultApp(fullPath);
      sendJson(res, 200, { ok: true, path: fullPath });
      return true;
    }

    return false;
  } catch (err) {
    sendJson(res, errorStatus(err), { error: errorMessage(err) });
    return true;
  }
}

function isSpaFallbackPath(pathname: string): boolean {
  const ext = path.extname(pathname);
  return !ext || ext === '.html';
}

function serveStatic(res: http.ServerResponse, webDistPath: string, pathname: string): void {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(webDistPath, `.${rel}`);
  if (!filePath.startsWith(path.resolve(webDistPath))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(webDistPath, 'index.html');
    if (isSpaFallbackPath(pathname) && fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

export async function findAvailablePort(host: string, startPort = 3789): Promise<number> {
  for (let port = startPort; port < startPort + 50; port++) {
    const ok = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, host);
    });
    if (ok) return port;
  }
  throw new Error('No available port found');
}

export function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  import('node:child_process').then(({ spawn }) => {
    spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false }).unref();
  }).catch(() => {
    /* ignore */
  });
}

export async function startUiServer(options: StartUiServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  bootstrapUiProjects(process.cwd());

  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? (await findAvailablePort(host));
  const webDistPath = options.webDistPath ?? path.resolve('packages/web/dist');

  if (!fs.existsSync(webDistPath)) {
    throw new MrcxError(`Web static assets not found: ${webDistPath}. Run npm run build first.`);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (handled) return;
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    serveStatic(res, webDistPath, pathname);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const url = `http://${host}:${port}`;
  console.log(`mrcx UI: ${url}`);

  if (options.openBrowser !== false) {
    openBrowser(url);
  }

  return {
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  startUiServer({ openBrowser: true }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { registerProjectPath, loadRegistry, saveRegistry } from './registry.js';
export { bootstrapUiProjects } from './discovery.js';
export type { UiRegistry } from './registry.js';
