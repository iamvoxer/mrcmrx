import type { Message, Room, Stage, AgentRunDetail } from './types.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  listRooms: () => request<{ rooms: Room[] }>('/api/rooms'),
  createRoom: (body: { name: string; projectPath: string; stageName?: string; stageContent?: string }) =>
    request<{ room: Room; stage: Stage | null }>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  useRoom: (id: string) =>
    request<{ room: Room; context: { currentRoomId: string | null; currentStageId: string | null } }>(
      `/api/rooms/${id}/use`,
      { method: 'POST' },
    ),
  listStages: (roomId: string) => request<{ stages: Stage[] }>(`/api/rooms/${roomId}/stages`),
  createStage: (roomId: string, body: { name: string; content?: string }) =>
    request<{ stage: Stage }>(`/api/rooms/${roomId}/stages`, { method: 'POST', body: JSON.stringify(body) }),
  useStage: (stageId: string) => request<{ stage: Stage }>(`/api/stages/${stageId}/use`, { method: 'POST' }),
  deleteRoom: (roomId: string) => request<{ ok: boolean }>(`/api/rooms/${roomId}`, { method: 'DELETE' }),
  getRoomSettings: (roomId: string) =>
    request<{ name: string; projectPath: string; extraReadableDirs: string[] }>(
      `/api/rooms/${roomId}/settings`,
    ),
  updateRoomSettings: (roomId: string, patch: { name?: string; extraReadableDirs?: string[] }) =>
    request<{ name: string; projectPath: string; extraReadableDirs: string[]; warnings: string[] }>(
      `/api/rooms/${roomId}/settings`,
      { method: 'PUT', body: JSON.stringify(patch) },
    ),
  updateStage: (stageId: string, body: { name?: string; content?: string }) =>
    request<{ stage: Stage }>(`/api/stages/${stageId}`, { method: 'PUT', body: JSON.stringify(body) }),
  listMessages: (stageId: string) => request<{ messages: Message[] }>(`/api/stages/${stageId}/messages`),
  getMessageRun: (messageId: string, projectPath: string, roomId: string) =>
    request<{ run: AgentRunDetail }>(
      `/api/messages/${encodeURIComponent(messageId)}/run?projectPath=${encodeURIComponent(projectPath)}&roomId=${encodeURIComponent(roomId)}`,
    ),
  chatX: (message: string, projectPath: string) =>
    request<{ message: Message }>('/api/x/chat', { method: 'POST', body: JSON.stringify({ message, projectPath }) }),
  chatXStream: async (
    message: string,
    projectPath: string,
    handlers: {
      onDelta: (text: string) => void;
      onDone: (message: Message) => void;
      onError: (error: string) => void;
    },
  ): Promise<void> => {
    const res = await fetch('/api/x/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, projectPath, stream: true }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    if (!res.body) throw new Error('Response has no body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) {
          const evt = JSON.parse(line) as {
            type: string;
            text?: string;
            message?: Message;
            error?: string;
          };
          if (evt.type === 'delta' && evt.text != null) handlers.onDelta(evt.text);
          else if (evt.type === 'done' && evt.message) handlers.onDone(evt.message);
          else if (evt.type === 'error') handlers.onError(evt.error ?? 'Unknown error');
        }
        nl = buf.indexOf('\n');
      }
    }
  },
  forwardXToC: (body: { note?: string; projectPath: string; last?: number }) =>
    request<{ message: Message }>('/api/forward/x-to-c', { method: 'POST', body: JSON.stringify(body) }),
  forwardCToX: (body: { note?: string; projectPath: string; last?: number; includeDiff?: boolean }) =>
    request<{ message: Message }>('/api/forward/c-to-x', { method: 'POST', body: JSON.stringify(body) }),
  getConfig: (projectPath: string) =>
    request<{
      proxy: { url?: string } | null;
      cursorAgent: string | null;
      cursorAgentDetected: string | null;
      cursorAgentResolved: { node: string; index: string; source: string } | null;
      codex: string | null;
      codexDetected: string | null;
      codexResolved: { bin: string; source: string } | null;
      rgPath: string | null;
      rgDetected: string | null;
      rgResolved: { path: string; source: string } | null;
      projectPath: string;
    }>(`/api/config?projectPath=${encodeURIComponent(projectPath)}`),
  detectCursorAgent: () => request<{ path: string | null }>('/api/config/cursor-agent/detect'),
  detectCodex: () => request<{ path: string | null }>('/api/config/codex/detect'),
  detectRg: () => request<{ path: string | null }>('/api/config/rg/detect'),
  setCursorAgent: (projectPath: string, path: string) =>
    request<{ cursorAgent: string | null; cursorAgentResolved: { node: string; index: string; source: string } }>(
      '/api/config/cursor-agent',
      { method: 'PUT', body: JSON.stringify({ projectPath, path }) },
    ),
  clearCursorAgent: (projectPath: string) =>
    request<{ ok: boolean }>('/api/config/cursor-agent', {
      method: 'DELETE',
      body: JSON.stringify({ projectPath }),
    }),
  setCodex: (projectPath: string, path: string) =>
    request<{ codex: string | null; codexResolved: { bin: string; source: string } }>(
      '/api/config/codex',
      { method: 'PUT', body: JSON.stringify({ projectPath, path }) },
    ),
  clearCodex: (projectPath: string) =>
    request<{ ok: boolean }>('/api/config/codex', {
      method: 'DELETE',
      body: JSON.stringify({ projectPath }),
    }),
  setRg: (projectPath: string, path: string) =>
    request<{ rgPath: string | null; rgResolved: { path: string; source: string } | null }>(
      '/api/config/rg',
      { method: 'PUT', body: JSON.stringify({ projectPath, path }) },
    ),
  clearRg: (projectPath: string) =>
    request<{ ok: boolean }>('/api/config/rg', {
      method: 'DELETE',
      body: JSON.stringify({ projectPath }),
    }),
  setProxy: (projectPath: string, url: string) =>
    request<{ proxy: { url?: string } | null }>('/api/config/proxy', {
      method: 'PUT',
      body: JSON.stringify({ projectPath, url }),
    }),
  clearProxy: (projectPath: string) =>
    request<{ ok: boolean }>('/api/config/proxy', { method: 'DELETE', body: JSON.stringify({ projectPath }) }),
  listArtifacts: (roomId: string) => request<{ artifacts: Array<{ path: string; name: string; size: number }> }>(`/api/rooms/${roomId}/artifacts`),
  readArtifact: (projectPath: string, relPath: string) =>
    request<{ path: string; content: string }>(
      `/api/artifacts/content?projectPath=${encodeURIComponent(projectPath)}&path=${encodeURIComponent(relPath)}`,
    ),
  suggestedProjectPath: () => request<{ path: string }>('/api/fs/suggested-path'),
  pickDirectory: (initialPath?: string) =>
    request<{ path?: string; cancelled: boolean }>('/api/fs/pick-directory', {
      method: 'POST',
      body: JSON.stringify({ initialPath }),
    }),
  openPath: (path: string) =>
    request<{ ok: boolean }>('/api/fs/open-path', { method: 'POST', body: JSON.stringify({ path }) }),
};
