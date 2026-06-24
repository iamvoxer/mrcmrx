import './styles.css';
import { renderChatMarkdown } from '@mrcx/core/markdown';
import { api } from './api.js';
import type { AgentRunDetail, Message, Room, Stage } from './types.js';

type DialogScope = 'room' | 'stage' | 'config' | 'edit-stage' | 'room-settings';

const X_WAITING_TEXT = 'Mr. X is thinking. Large projects may take a while — please wait...';
const X_REVIEW_C_WAITING_TEXT =
  "Mr. X is reviewing Mr. C's result. Large projects may take a while — please wait...";

interface AppState {
  rooms: Room[];
  stages: Stage[];
  messages: Message[];
  activeRoom: Room | null;
  activeStage: Stage | null;
  proxyUrl: string | null;
  cursorAgentPath: string | null;
  cursorAgentResolved: string | null;
  codexPath: string | null;
  codexResolved: string | null;
  rgPath: string | null;
  rgResolved: string | null;
  globalSettingsPath: string | null;
  artifacts: Array<{ path: string; name: string; size: number }>;
  loading: boolean;
  chatNotice: { text: string; error: boolean } | null;
  activeTab: 'stage' | 'sessions' | 'files';
  dialogFeedback: Record<DialogScope, { error: string | null; loadingHint: string | null }>;
}

const GEAR_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg>`;

const state: AppState = {
  rooms: [],
  stages: [],
  messages: [],
  activeRoom: null,
  activeStage: null,
  proxyUrl: null,
  cursorAgentPath: null,
  cursorAgentResolved: null,
  codexPath: null,
  codexResolved: null,
  rgPath: null,
  rgResolved: null,
  globalSettingsPath: null,
  artifacts: [],
  loading: false,
  chatNotice: null,
  activeTab: 'stage',
  dialogFeedback: {
    room: { error: null, loadingHint: null },
    stage: { error: null, loadingHint: null },
    config: { error: null, loadingHint: null },
    'edit-stage': { error: null, loadingHint: null },
    'room-settings': { error: null, loadingHint: null },
  },
};

const app = document.querySelector('#app')!;
let mounted = false;
let eventsBound = false;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roomInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const ch = trimmed[0];
  if (/[a-zA-Z]/.test(ch)) return ch.toLowerCase();
  return ch;
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isErrorSystemMessage(m: Message): boolean {
  if (m.speaker !== 'system') return false;
  return /timeout|failed|no valid|not logged in|error|fail|chatgpt\.com|cannot reach/i.test(m.content);
}

function messageClass(m: Message): string {
  if (m.speaker === 'system' && isErrorSystemMessage(m)) return 'system error';
  if (m.meta?.streaming && m.speaker === 'x') return 'x pending';
  return m.speaker;
}

function messageMetaLine(m: Message): string {
  const time = formatMessageTime(m.createdAt);
  const label = esc(speakerLabel(m.speaker));
  const timePart = time ? `<span class="message-time">${esc(time)}</span>` : '';
  const detailBtn = m.meta?.runId
    ? `<button type="button" class="message-detail-btn" data-message-id="${esc(m.id)}" title="View CLI run details">Details</button>`
    : '';
  return `${label}${timePart}${detailBtn}`;
}

function formatRunDetail(run: AgentRunDetail): string {
  const lines = [
    `Provider: ${run.provider} (${run.label})`,
    `Command: ${run.command}`,
    `Working Directory: ${run.cwd}`,
    `Duration: ${(run.durationMs / 1000).toFixed(1)}s`,
    `Exit Code: ${run.exitCode ?? 'null'}${run.timedOut ? ' (timed out)' : ''}`,
    `Started: ${run.startedAt}`,
    `Ended: ${run.endedAt}`,
  ];
  if (run.sessionId) lines.push(`sessionId: ${run.sessionId}`);
  if (run.chatId) lines.push(`chatId: ${run.chatId}`);
  if (run.rgPath) lines.push(`rgPath: ${run.rgPath}`);
  if (run.pathPrefix?.length) lines.push(`PATH prefix: ${run.pathPrefix.join('; ')}`);
  if (run.stdin) {
    lines.push('', '=== stdin ===', run.stdin);
  }
  lines.push('', '=== stdout ===', run.stdout || '(empty)');
  if (run.stdoutTruncated) lines.push('(stdout truncated)');
  lines.push('', '=== stderr ===', run.stderr || '(empty)');
  if (run.stderrTruncated) lines.push('(stderr truncated)');
  return lines.join('\n');
}

function openRunDetailModal(title: string, content: string): void {
  const dialog = document.querySelector('#run-detail-dialog') as HTMLDialogElement;
  const titleEl = document.querySelector('#run-detail-title')!;
  const body = document.querySelector('#run-detail-body')!;
  titleEl.textContent = title;
  body.textContent = content;
  dialog.showModal();
}

async function showMessageRunDetail(messageId: string): Promise<void> {
  if (!state.activeRoom) return;
  try {
    const { run } = await api.getMessageRun(messageId, state.activeRoom.projectPath, state.activeRoom.id);
    openRunDetailModal(`${run.provider === 'codex' ? 'Codex' : 'Cursor'} Run Details`, formatRunDetail(run));
  } catch (err) {
    setChatNotice(err instanceof Error ? err.message : String(err), true);
  }
}

const ARTIFACT_PREVIEW_LIMIT = 4000;
let previewArtifactRelPath: string | null = null;

function openArtifactModal(filePath: string, content: string): void {
  previewArtifactRelPath = filePath;
  const dialog = document.querySelector('#artifact-dialog') as HTMLDialogElement;
  const title = document.querySelector('#artifact-dialog-title')!;
  const body = document.querySelector('#artifact-dialog-body')!;
  const footer = document.querySelector('#artifact-truncated')!;
  const truncated = content.length > ARTIFACT_PREVIEW_LIMIT;
  title.textContent = filePath;
  body.textContent = truncated ? content.slice(0, ARTIFACT_PREVIEW_LIMIT) : content;
  footer.hidden = !truncated;
  dialog.showModal();
}

function speakerLabel(speaker: Message['speaker']): string {
  switch (speaker) {
    case 'user':
      return 'You';
    case 'x':
      return 'Mr. X';
    case 'c':
      return 'Mr. C';
    case 'system':
      return 'System';
    default:
      return speaker;
  }
}

function speakerAvatar(speaker: Message['speaker']): string {
  switch (speaker) {
    case 'user':
      return 'Me';
    case 'x':
      return 'X';
    case 'c':
      return 'C';
    case 'system':
      return 'Sys';
    default:
      return '·';
  }
}

function setChatNotice(text: string | null, error = false): void {
  state.chatNotice = text ? { text, error } : null;
  syncChat();
  if (text) scrollChat();
}

function clearDialogFeedback(scope: DialogScope): void {
  state.dialogFeedback[scope] = { error: null, loadingHint: null };
  syncDialogFeedback(scope);
}

async function refreshRooms(): Promise<void> {
  const { rooms } = await api.listRooms();
  state.rooms = rooms;
}

function setDialogError(scope: DialogScope, err: unknown): void {
  state.dialogFeedback[scope] = {
    error: err instanceof Error ? err.message : String(err),
    loadingHint: null,
  };
  syncDialogFeedback(scope);
}

function setDialogLoading(scope: DialogScope, loading: boolean, hint?: string): void {
  const current = state.dialogFeedback[scope];
  state.dialogFeedback[scope] = {
    error: loading ? null : current.error,
    loadingHint: loading ? (hint ?? 'Processing…') : null,
  };
  syncDialogFeedback(scope);
}

function syncDialogFeedback(scope: DialogScope): void {
  const el = document.querySelector(`#${scope}-dialog-feedback`);
  if (!el) return;
  const { error, loadingHint } = state.dialogFeedback[scope];
  const parts: string[] = [];
  if (error) parts.push(`<p class="dialog-error">${esc(error)}</p>`);
  if (loadingHint) parts.push(`<p class="dialog-note">${esc(loadingHint)}</p>`);
  el.innerHTML = parts.join('');
  (el as HTMLElement).hidden = parts.length === 0;

  const busy = !!loadingHint;
  const form = document.querySelector(`#${scope}-form`);
  if (!form) return;
  form.querySelectorAll('input, textarea').forEach((node) => {
    (node as HTMLInputElement).disabled = busy;
  });
  form.querySelectorAll('button[type="submit"]').forEach((node) => {
    (node as HTMLButtonElement).disabled = busy;
  });
  const pickBtn = form.querySelector('#room-path-pick');
  if (pickBtn) (pickBtn as HTMLButtonElement).disabled = busy;
  const detectBtn = form.querySelector('#cursor-agent-detect');
  if (detectBtn) (detectBtn as HTMLButtonElement).disabled = busy;
  const codexDetectBtn = form.querySelector('#codex-detect');
  if (codexDetectBtn) (codexDetectBtn as HTMLButtonElement).disabled = busy;
  const rgDetectBtn = form.querySelector('#rg-detect');
  if (rgDetectBtn) (rgDetectBtn as HTMLButtonElement).disabled = busy;

  if (scope === 'room-settings') {
    const deleteBtn = document.querySelector('#delete-room-btn');
    if (deleteBtn) {
      (deleteBtn as HTMLButtonElement).disabled = busy || !state.activeRoom;
    }
  }
}

async function loadToolConfig(projectPath?: string): Promise<void> {
  const cfg = await api.getConfig(projectPath);
  state.proxyUrl = cfg.proxy?.url ?? null;
  state.cursorAgentPath = cfg.cursorAgent ?? null;
  state.cursorAgentResolved = cfg.cursorAgentResolved?.node ?? null;
  state.codexPath = cfg.codex ?? null;
  state.codexResolved = cfg.codexResolved?.bin ?? null;
  state.rgPath = cfg.rgPath ?? null;
  state.rgResolved = cfg.rgResolved?.path ?? null;
  state.globalSettingsPath = cfg.settingsPath ?? null;
}

async function selectRoom(room: Room): Promise<void> {
  state.chatNotice = null;
  const { room: active, context } = await api.useRoom(room.id);
  state.activeRoom = active;
  const { stages } = await api.listStages(active.id);
  state.stages = stages;
  const { artifacts } = await api.listArtifacts(active.id);
  state.artifacts = artifacts;
  const stageId = context.currentStageId;
  const stage = stageId ? stages.find((s) => s.id === stageId) ?? stages[0] ?? null : stages[0] ?? null;
  if (stage) {
    await selectStage(stage, false);
  } else {
    state.activeStage = null;
    state.messages = [];
  }
}

async function selectStage(stage: Stage, callUse = true): Promise<void> {
  state.chatNotice = null;
  if (callUse) await api.useStage(stage.id);
  state.activeStage = stage;
  const { messages } = await api.listMessages(stage.id);
  state.messages = messages;
}

async function loadInitial(): Promise<void> {
  mount();
  state.loading = true;
  try {
    await refreshRooms();
    await loadToolConfig();
    if (state.rooms.length > 0) {
      await selectRoom(state.rooms[0]);
    }
  } finally {
    state.loading = false;
    syncAll();
    scrollChat();
  }
}

function scrollChat(): void {
  requestAnimationFrame(() => {
    const el = document.querySelector('#timeline');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function tempStreamMessage(
  speaker: Message['speaker'],
  content: string,
  roomId: string,
  stageId: string,
): Message {
  return {
    id: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    stageId,
    speaker,
    content,
    createdAt: new Date().toISOString(),
  };
}

function messageDisplayText(m: Message): string {
  return (m.displayContent ?? m.content).trim();
}

function messageBodyHtml(m: Message): string {
  const display = messageDisplayText(m);
  if (m.meta?.streaming && m.speaker === 'x' && !display) {
    const waiting = m.meta.streamMode === 'review-c' ? X_REVIEW_C_WAITING_TEXT : X_WAITING_TEXT;
    return `<p class="message-waiting">${esc(waiting)}</p>`;
  }
  if (!display) {
    return '<span class="note">…</span>';
  }
  if (m.speaker === 'x' || m.speaker === 'c') {
    return `<div class="message-body md-body">${renderChatMarkdown(display)}</div>`;
  }
  return `<p>${esc(display).replace(/\n/g, '<br/>')}</p>`;
}

function renderMessages(): string {
  const parts: string[] = [];
  if (state.messages.length === 0 && !state.chatNotice) {
    parts.push('<p class="note" style="margin:0">No messages yet. Type below to start discussing with Mr. X.</p>');
  } else {
    parts.push(
      ...state.messages.map(
        (m) => `
    <article class="message ${messageClass(m)}">
      <div class="avatar">${speakerAvatar(m.speaker)}</div>
      <div class="bubble">
        <div class="message-meta">${messageMetaLine(m)}</div>
        ${messageBodyHtml(m)}
      </div>
    </article>`,
      ),
    );
  }
  if (state.chatNotice) {
    const label = state.chatNotice.error ? 'Notice' : 'In progress';
    parts.push(`
    <article class="message activity${state.chatNotice.error ? ' error' : ''}">
      <div class="avatar">${state.chatNotice.error ? '!' : '…'}</div>
      <div class="bubble">
        <div class="message-meta">${label}</div>
        <p>${esc(state.chatNotice.text)}</p>
      </div>
    </article>`);
  }
  return parts.join('');
}

function renderRooms(): string {
  if (state.rooms.length === 0) {
    return '<span class="dock-empty" title="No rooms">·</span>';
  }
  return state.rooms
    .map(
      (r) => `
    <button type="button" class="room-icon ${state.activeRoom?.id === r.id ? 'active' : ''}" data-room-id="${esc(r.id)}" data-room-name="${esc(r.name)}" data-room-path="${esc(r.projectPath)}" title="${esc(r.name)}">
      <span class="room-icon-letter">${esc(roomInitial(r.name))}</span>
    </button>`,
    )
    .join('');
}

function renderStages(): string {
  const items = state.stages
    .map(
      (s) => `
    <button type="button" class="stage-card ${state.activeStage?.id === s.id ? 'active' : ''}" data-stage-id="${esc(s.id)}">
      <strong>${String(s.order).padStart(2, '0')}</strong>
      <span>${esc(s.name)}</span>
    </button>`,
    )
    .join('');
  return `${items}
    <button type="button" class="stage-card muted" id="new-stage-btn">
      <strong>+</strong>
      <span>New Stage</span>
    </button>`;
}

function renderStageDoc(): string {
  const s = state.activeStage;
  if (!s) return '<p class="note" style="margin:14px">Create a Stage first.</p>';
  const lines = s.content.trim() ? esc(s.content).replace(/\n/g, '<br/>') : '(No stage description)';
  return `
    <div class="stage-doc">
      <div class="stage-doc-header">
        <h3>${esc(s.name)}</h3>
        <button type="button" class="ghost-button" id="edit-stage-btn">Edit</button>
      </div>
      <p>${lines}</p>
    </div>`;
}

function renderSessions(): string {
  const s = state.activeStage;
  const room = state.activeRoom;
  if (!s) return '<p class="note" style="margin:14px">No sessions</p>';
  const extraDirs = room?.extraReadableDirs ?? [];
  const extraList =
    extraDirs.length === 0
      ? '<p class="note" style="margin:8px 0 0">(No extra directories)</p>'
      : `<ul class="extra-dirs-list">${extraDirs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;
  return `
    <div class="session-list">
      <div><span>Codex / X</span><strong>${esc(s.xSession?.sessionId ?? '-')}</strong></div>
      <div><span>Cursor / C</span><strong>${esc(s.cSession?.chatId ?? '-')}</strong></div>
      <div><span>Messages</span><strong>${state.messages.length}</strong></div>
      <div><span>Extra directories</span><strong>${extraDirs.length}</strong></div>
    </div>
    ${extraList}
    <p class="note">Switching Stage binds the corresponding Codex thread and Cursor chat. Extra directories are managed in Room Settings.</p>`;
}

function renderArtifacts(): string {
  if (state.artifacts.length === 0) {
    return '<p class="note" style="margin:14px">(No files yet)</p>';
  }
  return `
    <div class="artifact-list">
      ${state.artifacts
        .map((a) => `<button type="button" data-artifact="${esc(a.path)}">${esc(a.path)}</button>`)
        .join('')}
    </div>`;
}

function mount(): void {
  if (mounted) return;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="room-dock">
        <div class="dock-logo" title="mrcx"><img src="./assets/mrcx-logo.svg" alt="mrcx" /></div>
        <div class="dock-rooms" id="dock-rooms"></div>
        <div class="dock-actions">
          <button type="button" class="dock-btn" id="new-room-btn" title="New Room" aria-label="New Room">+</button>
          <button type="button" class="dock-btn" id="config-btn" title="Tool Settings" aria-label="Tool Settings">${GEAR_SVG}</button>
        </div>
      </aside>

      <aside class="stage-rail">
        <section class="rail-section">
          <div class="section-label">Stages</div>
          <div id="stage-rail-body"></div>
        </section>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div class="topbar-title-wrap">
            <h1 id="room-title">Not selected</h1>
            <button type="button" class="room-settings-btn" id="room-settings-btn" title="Room Settings" aria-label="Room Settings" disabled>${GEAR_SVG}</button>
          </div>
          <button type="button" class="path-link" id="open-project-path" disabled title="">-</button>
          <span class="extra-dirs-summary" id="extra-dirs-summary" hidden></span>
        </header>

        <div class="content-grid">
          <section class="chat-panel">
            <div class="chat-scroll" id="timeline"></div>
            <div class="composer">
              <textarea id="composer-input" rows="3" placeholder="Add a note…" disabled></textarea>
              <div class="send-row">
                <button class="send-button to-x" data-action="talk-x" disabled>Discuss with Mr. X</button>
                <button class="send-button to-c" data-action="x-to-c" disabled>Send Mr. X's conclusion to Mr. C</button>
                <button class="send-button to-x" data-action="c-to-x" disabled>Send Mr. C's result to Mr. X for review</button>
              </div>
            </div>
          </section>

          <aside class="right-panel">
            <div class="tabs" role="tablist">
              <button class="tab" data-tab="stage" type="button">Stage Definition</button>
              <button class="tab" data-tab="sessions" type="button">Sessions</button>
              <button class="tab" data-tab="files" type="button">Artifacts</button>
            </div>
            <section class="tab-content" data-tab-panel="stage"></section>
            <section class="tab-content" data-tab-panel="sessions"></section>
            <section class="tab-content" data-tab-panel="files"></section>
          </aside>
        </div>
      </main>
    </div>

    <div id="dock-tooltip-portal" class="dock-tooltip-portal" aria-hidden="true"></div>

    <dialog id="room-dialog">
      <form method="dialog" class="dialog-card" id="room-form">
        <h2>New Room</h2>
        <label>Name<input id="room-title-input" required value="New Room" /></label>
        <label>
          Workspace
          <div class="directory-picker">
            <input id="room-path-input" required placeholder="Select or enter project directory" />
            <button type="button" class="ghost-button" id="room-path-pick">Browse…</button>
          </div>
        </label>
        <label>Default stage name<input id="stage-title-input" value="New Stage" /></label>
        <label>Stage description<textarea id="stage-content-input" rows="3" placeholder="Goals and scope for this stage (optional)"></textarea></label>
        <div class="dialog-feedback" id="room-dialog-feedback" hidden></div>
        <div class="dialog-actions">
          <button type="button" class="ghost-button" id="room-cancel">Cancel</button>
          <button type="submit" class="primary-inline">Create &amp; Open</button>
        </div>
      </form>
    </dialog>

    <dialog id="stage-dialog">
      <form method="dialog" class="dialog-card" id="stage-form">
        <h2>New Stage</h2>
        <label>Name<input id="new-stage-name" required value="New Stage" /></label>
        <label>Description<textarea id="new-stage-content" rows="3"></textarea></label>
        <div class="dialog-feedback" id="stage-dialog-feedback" hidden></div>
        <div class="dialog-actions">
          <button type="button" class="ghost-button" id="stage-cancel">Cancel</button>
          <button type="submit" class="primary-inline">Create</button>
        </div>
      </form>
    </dialog>

    <dialog id="config-dialog">
      <div class="dialog-card">
        <h2>Tool Settings</h2>
        <form method="dialog" class="dialog-card-inner" id="config-form">
          <label>Proxy URL<input id="proxy-url" placeholder="http://127.0.0.1:7892" /></label>
          <label>
            Codex path
            <div class="directory-picker">
              <input id="codex-path" placeholder="Full path to codex.exe" />
              <button type="button" class="ghost-button" id="codex-detect">Auto-detect</button>
            </div>
          </label>
          <p class="dialog-help" id="codex-resolved">Codex in use: (not loaded)</p>
          <label>
            Cursor Agent path
            <div class="directory-picker">
              <input id="cursor-agent-path" placeholder="Full path to node.exe or index.js" />
              <button type="button" class="ghost-button" id="cursor-agent-detect">Auto-detect</button>
            </div>
          </label>
          <p class="dialog-help" id="cursor-agent-resolved">Cursor in use: (not loaded)</p>
          <label>
            ripgrep path
            <div class="directory-picker">
              <input id="rg-path" placeholder="Full path to rg.exe" />
              <button type="button" class="ghost-button" id="rg-detect">Auto-detect</button>
            </div>
          </label>
          <p class="dialog-help" id="rg-resolved">ripgrep in use: (not loaded)</p>
          <p class="dialog-help" id="config-save-hint">Saved to user settings. Leave path or proxy empty and save to clear and restore auto-detection.</p>
          <div class="dialog-actions">
            <button type="button" class="ghost-button" id="config-cancel">Cancel</button>
            <button type="submit" class="primary-inline">Save</button>
          </div>
        </form>
        <div class="dialog-feedback" id="config-dialog-feedback" hidden></div>
      </div>
    </dialog>

    <dialog id="room-settings-dialog">
      <form method="dialog" class="dialog-card" id="room-settings-form">
        <h2>Room Settings</h2>
        <label>Room name<input id="room-settings-name" required /></label>
        <label>Primary workspace<input id="room-settings-path" readonly /></label>
        <label>
          Extra Readable Directories
          <textarea id="room-settings-extra-dirs" rows="4" placeholder="One directory per line, e.g. C:/Work/2025/ssacs_overseas_webapi"></textarea>
        </label>
        <p class="dialog-help">For Mr. X to read reference code or materials. The primary workspace is unchanged; Mr. C does not modify these directories by default.</p>
        <div class="dialog-section room-settings-danger">
          <button type="button" class="danger-button" id="delete-room-btn" disabled>Delete Room</button>
          <p class="dialog-help">Removes only this Room's data in .mrcx (Stages, messages, etc.); workspace files are not deleted.</p>
        </div>
        <div class="dialog-feedback" id="room-settings-dialog-feedback" hidden></div>
        <div class="dialog-actions">
          <button type="button" class="ghost-button" id="room-settings-cancel">Cancel</button>
          <button type="submit" class="primary-inline">Save</button>
        </div>
      </form>
    </dialog>

    <dialog id="edit-stage-dialog">
      <form method="dialog" class="dialog-card" id="edit-stage-form">
        <h2>Edit Stage</h2>
        <label>Name<input id="edit-stage-name" required /></label>
        <label>Description<textarea id="edit-stage-content" rows="5"></textarea></label>
        <p class="dialog-help">Changing the name or description does not recreate Codex / Cursor sessions.</p>
        <div class="dialog-feedback" id="edit-stage-dialog-feedback" hidden></div>
        <div class="dialog-actions">
          <button type="button" class="ghost-button" id="edit-stage-cancel">Cancel</button>
          <button type="submit" class="primary-inline">Save</button>
        </div>
      </form>
    </dialog>

    <dialog id="artifact-dialog" class="artifact-dialog">
      <div class="artifact-dialog-card">
        <header class="artifact-dialog-header">
          <h2 id="artifact-dialog-title">File</h2>
          <div class="artifact-dialog-actions">
            <button type="button" class="ghost-button" id="artifact-open-editor">Open in Editor</button>
            <button type="button" class="ghost-button" id="artifact-close">Close</button>
          </div>
        </header>
        <pre class="artifact-dialog-body" id="artifact-dialog-body"></pre>
        <footer class="artifact-dialog-footer">
          <p class="dialog-help" id="artifact-truncated" hidden>Content truncated (showing first ${ARTIFACT_PREVIEW_LIMIT} characters)</p>
        </footer>
      </div>
    </dialog>

    <dialog id="run-detail-dialog" class="artifact-dialog">
      <div class="artifact-dialog-card">
        <header class="artifact-dialog-header">
          <h2 id="run-detail-title">Run Details</h2>
          <button type="button" class="ghost-button" id="run-detail-close">Close</button>
        </header>
        <pre class="artifact-dialog-body" id="run-detail-body"></pre>
      </div>
    </dialog>
  `;
  mounted = true;
  bindEventsOnce();
}

function syncDock(): void {
  const el = document.querySelector('#dock-rooms');
  if (el) el.innerHTML = renderRooms();
  bindDockTooltips();
}

function syncStageRail(): void {
  const el = document.querySelector('#stage-rail-body');
  if (!el) return;
  el.innerHTML = state.activeRoom
    ? renderStages()
    : '<p style="color:#adbbc7;font-size:11px">Select a Room first</p>';
}

function syncTopbar(): void {
  const room = state.activeRoom;
  const title = document.querySelector('#room-title');
  const settingsBtn = document.querySelector('#room-settings-btn') as HTMLButtonElement | null;
  const pathBtn = document.querySelector('#open-project-path') as HTMLButtonElement | null;
  const extraSummary = document.querySelector('#extra-dirs-summary') as HTMLElement | null;
  if (title) title.textContent = room?.name ?? 'Not selected';
  if (settingsBtn) settingsBtn.disabled = !room;
  if (pathBtn) {
    pathBtn.textContent = room?.projectPath ?? '-';
    pathBtn.title = room ? 'Open in file explorer' : '';
    pathBtn.disabled = !room;
  }
  if (extraSummary) {
    const count = room?.extraReadableDirs?.length ?? 0;
    if (room && count > 0) {
      extraSummary.textContent = `Extra directories: ${count}`;
      extraSummary.hidden = false;
      extraSummary.title = (room.extraReadableDirs ?? []).join('\n');
    } else {
      extraSummary.hidden = true;
      extraSummary.textContent = '';
      extraSummary.title = '';
    }
  }
}

function syncChat(): void {
  const el = document.querySelector('#timeline');
  if (el) el.innerHTML = renderMessages();
}

function syncComposer(): void {
  const ta = document.querySelector('#composer-input') as HTMLTextAreaElement | null;
  const hasStage = !!(state.activeRoom && state.activeStage);
  if (ta) ta.disabled = !hasStage;
  document.querySelectorAll('[data-action]').forEach((btn) => {
    (btn as HTMLButtonElement).disabled = !hasStage || state.loading;
  });
}

function syncRightPanel(): void {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === state.activeTab);
  });
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.classList.toggle('active', (panel as HTMLElement).dataset.tabPanel === state.activeTab);
  });
  const stagePanel = document.querySelector('[data-tab-panel="stage"]');
  const sessionsPanel = document.querySelector('[data-tab-panel="sessions"]');
  const filesPanel = document.querySelector('[data-tab-panel="files"]');
  if (stagePanel) stagePanel.innerHTML = renderStageDoc();
  if (sessionsPanel) sessionsPanel.innerHTML = renderSessions();
  if (filesPanel) filesPanel.innerHTML = renderArtifacts();
}

function syncAll(): void {
  mount();
  syncDock();
  syncStageRail();
  syncTopbar();
  syncChat();
  syncComposer();
  syncRightPanel();
}

function setLoading(loading: boolean): void {
  state.loading = loading;
  syncComposer();
}

async function reloadMessages(): Promise<void> {
  if (!state.activeStage) return;
  const { messages } = await api.listMessages(state.activeStage.id);
  state.messages = messages;
  syncChat();
}

/** After Codex stream ends, replace temp bubbles with persisted messages (incl. runId / Details). */
async function reloadStageAfterCodexStream(stageId: string, roomId: string): Promise<void> {
  try {
    const { messages } = await api.listMessages(stageId);
    state.messages = messages;
    syncChat();
  } catch {
    /* ignore */
  }
  try {
    const { artifacts } = await api.listArtifacts(roomId);
    state.artifacts = artifacts;
    syncRightPanel();
  } catch {
    /* ignore */
  }
}

async function openRoomDialog(): Promise<void> {
  clearDialogFeedback('room');
  const pathInput = document.querySelector('#room-path-input') as HTMLInputElement;
  if (pathInput && !pathInput.value.trim()) {
    try {
      const { path } = await api.suggestedProjectPath();
      pathInput.value = path;
    } catch {
      /* ignore */
    }
  }
  (document.querySelector('#room-dialog') as HTMLDialogElement).showModal();
}

async function pickRoomDirectory(): Promise<void> {
  const pathInput = document.querySelector('#room-path-input') as HTMLInputElement;
  const initialPath = pathInput?.value.trim() || undefined;
  try {
    setDialogLoading('room', true, 'Select a directory in the dialog…');
    const result = await api.pickDirectory(initialPath);
    if (!result.cancelled && result.path && pathInput) {
      pathInput.value = result.path;
    }
  } catch (err) {
    setDialogError('room', err);
  } finally {
    setDialogLoading('room', false);
  }
}

function openConfigDialog(): void {
  clearDialogFeedback('config');
  const hint = document.querySelector('#config-save-hint');
  if (hint) {
    hint.textContent = state.globalSettingsPath
      ? `Saved to ${state.globalSettingsPath}. Leave path or proxy empty and save to clear and restore auto-detection.`
      : 'Saved to user settings. Leave path or proxy empty and save to clear and restore auto-detection.';
  }
  const input = document.querySelector('#proxy-url') as HTMLInputElement;
  if (input) input.value = state.proxyUrl ?? '';
  const agentInput = document.querySelector('#cursor-agent-path') as HTMLInputElement;
  if (agentInput) agentInput.value = state.cursorAgentPath ?? '';
  const codexInput = document.querySelector('#codex-path') as HTMLInputElement;
  if (codexInput) codexInput.value = state.codexPath ?? '';
  const rgInput = document.querySelector('#rg-path') as HTMLInputElement;
  if (rgInput) rgInput.value = state.rgPath ?? '';
  syncCursorAgentResolvedHint();
  syncCodexResolvedHint();
  syncRgResolvedHint();
  (document.querySelector('#config-dialog') as HTMLDialogElement).showModal();
}

function openRoomSettingsDialog(): void {
  if (!state.activeRoom) return;
  clearDialogFeedback('room-settings');
  const room = state.activeRoom;
  (document.querySelector('#room-settings-name') as HTMLInputElement).value = room.name;
  (document.querySelector('#room-settings-path') as HTMLInputElement).value = room.projectPath;
  (document.querySelector('#room-settings-extra-dirs') as HTMLTextAreaElement).value = (
    room.extraReadableDirs ?? []
  ).join('\n');
  const deleteBtn = document.querySelector('#delete-room-btn') as HTMLButtonElement | null;
  if (deleteBtn) deleteBtn.disabled = false;
  (document.querySelector('#room-settings-dialog') as HTMLDialogElement).showModal();
}

function syncCursorAgentResolvedHint(resolvedNode?: string | null): void {
  const el = document.querySelector('#cursor-agent-resolved');
  if (!el) return;
  const node = resolvedNode ?? state.cursorAgentResolved;
  el.textContent = node ? `Cursor in use: ${node}` : 'Cursor in use: auto-detect (refresh after save)';
}

function syncCodexResolvedHint(resolvedBin?: string | null): void {
  const el = document.querySelector('#codex-resolved');
  if (!el) return;
  const bin = resolvedBin ?? state.codexResolved;
  el.textContent = bin ? `Codex in use: ${bin}` : 'Codex in use: auto-detect (refresh after save)';
}

function syncRgResolvedHint(resolvedPath?: string | null): void {
  const el = document.querySelector('#rg-resolved');
  if (!el) return;
  const p = resolvedPath ?? state.rgResolved;
  el.textContent = p ? `ripgrep in use: ${p}` : 'ripgrep in use: not configured (rg not injected into subprocess PATH)';
}

async function detectCursorAgentPathInDialog(): Promise<void> {
  try {
    setDialogLoading('config', true, 'Detecting…');
    const { path } = await api.detectCursorAgent();
    const input = document.querySelector('#cursor-agent-path') as HTMLInputElement;
    if (path && input) input.value = path;
    if (!path) setDialogError('config', 'cursor-agent not found; enter path manually');
  } catch (err) {
    setDialogError('config', err);
  } finally {
    setDialogLoading('config', false);
  }
}

async function detectCodexPathInDialog(): Promise<void> {
  try {
    setDialogLoading('config', true, 'Detecting…');
    const { path } = await api.detectCodex();
    const input = document.querySelector('#codex-path') as HTMLInputElement;
    if (path && input) input.value = path;
    if (!path) setDialogError('config', 'codex.exe not found; enter path manually');
  } catch (err) {
    setDialogError('config', err);
  } finally {
    setDialogLoading('config', false);
  }
}

async function detectRgPathInDialog(): Promise<void> {
  try {
    setDialogLoading('config', true, 'Detecting…');
    const { path } = await api.detectRg();
    const input = document.querySelector('#rg-path') as HTMLInputElement;
    if (path && input) input.value = path;
    if (!path) setDialogError('config', 'rg.exe not found; enter path manually');
  } catch (err) {
    setDialogError('config', err);
  } finally {
    setDialogLoading('config', false);
  }
}

function openEditStageDialog(): void {
  if (!state.activeStage) return;
  clearDialogFeedback('edit-stage');
  (document.querySelector('#edit-stage-name') as HTMLInputElement).value = state.activeStage.name;
  (document.querySelector('#edit-stage-content') as HTMLTextAreaElement).value = state.activeStage.content;
  (document.querySelector('#edit-stage-dialog') as HTMLDialogElement).showModal();
}

function bindDockTooltips(): void {
  const portal = document.querySelector('#dock-tooltip-portal') as HTMLElement;
  if (!portal) return;

  document.querySelectorAll('.room-icon[data-room-id]').forEach((btn) => {
    const el = btn as HTMLElement;
    el.addEventListener('mouseenter', () => {
      const name = el.dataset.roomName ?? '';
      const path = el.dataset.roomPath ?? '';
      portal.innerHTML = `<strong>${esc(name)}</strong><span>${esc(path)}</span>`;
      const rect = el.getBoundingClientRect();
      portal.style.left = `${rect.right + 10}px`;
      portal.style.top = `${rect.top + rect.height / 2}px`;
      portal.style.transform = 'translateY(-50%)';
      portal.classList.add('visible');
      portal.setAttribute('aria-hidden', 'false');
    });
    el.addEventListener('mouseleave', () => {
      portal.classList.remove('visible');
      portal.setAttribute('aria-hidden', 'true');
    });
  });
}

function bindEventsOnce(): void {
  if (eventsBound) return;
  eventsBound = true;

  app.addEventListener('click', async (e) => {
    const target = e.target as Element;

    if (target.closest('#new-room-btn')) {
      void openRoomDialog();
      return;
    }
    if (target.closest('#room-path-pick')) {
      void pickRoomDirectory();
      return;
    }
    if (target.closest('#open-project-path')) {
      if (!state.activeRoom || state.loading) return;
      try {
        await api.openPath(state.activeRoom.projectPath);
      } catch (err) {
        setChatNotice(err instanceof Error ? err.message : String(err), true);
      }
      return;
    }
    if (target.closest('#cursor-agent-detect')) {
      void detectCursorAgentPathInDialog();
      return;
    }
    if (target.closest('#codex-detect')) {
      void detectCodexPathInDialog();
      return;
    }
    if (target.closest('#rg-detect')) {
      void detectRgPathInDialog();
      return;
    }
    if (target.closest('#config-btn')) {
      openConfigDialog();
      return;
    }
    if (target.closest('#room-settings-btn')) {
      openRoomSettingsDialog();
      return;
    }
    if (target.closest('#edit-stage-btn')) {
      openEditStageDialog();
      return;
    }
    if (target.closest('#delete-room-btn')) {
      void deleteActiveRoom();
      return;
    }
    if (target.closest('#new-stage-btn')) {
      clearDialogFeedback('stage');
      (document.querySelector('#stage-dialog') as HTMLDialogElement).showModal();
      return;
    }
    if (target.closest('#artifact-close')) {
      (document.querySelector('#artifact-dialog') as HTMLDialogElement).close();
      return;
    }
    if (target.closest('#artifact-open-editor')) {
      if (!state.activeRoom || !previewArtifactRelPath) return;
      try {
        await api.openArtifact(state.activeRoom.projectPath, previewArtifactRelPath);
      } catch (err) {
        setChatNotice(err instanceof Error ? err.message : String(err), true);
      }
      return;
    }
    if (target.closest('#run-detail-close')) {
      (document.querySelector('#run-detail-dialog') as HTMLDialogElement).close();
      return;
    }
    const detailBtn = target.closest('.message-detail-btn') as HTMLElement | null;
    if (detailBtn?.dataset.messageId) {
      void showMessageRunDetail(detailBtn.dataset.messageId);
      return;
    }

    const tabBtn = target.closest('[data-tab]') as HTMLElement | null;
    if (tabBtn) {
      state.activeTab = tabBtn.dataset.tab as AppState['activeTab'];
      syncRightPanel();
      return;
    }

    const roomBtn = target.closest('[data-room-id]') as HTMLElement | null;
    if (roomBtn) {
      const room = state.rooms.find((r) => r.id === roomBtn.dataset.roomId);
      if (!room || state.loading) return;
      setLoading(true);
      try {
        await selectRoom(room);
        syncAll();
        scrollChat();
      } finally {
        setLoading(false);
      }
      return;
    }

    const stageBtn = target.closest('[data-stage-id]') as HTMLElement | null;
    if (stageBtn) {
      const stage = state.stages.find((s) => s.id === stageBtn.dataset.stageId);
      if (!stage || stage.id === state.activeStage?.id || state.loading) return;
      document.querySelectorAll('[data-stage-id]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.stageId === stage.id);
      });
      try {
        await selectStage(stage);
        syncChat();
        syncRightPanel();
        syncComposer();
        scrollChat();
      } catch {
        syncStageRail();
      }
      return;
    }

    const artifactBtn = target.closest('[data-artifact]') as HTMLElement | null;
    if (artifactBtn && state.activeRoom) {
      const relPath = artifactBtn.dataset.artifact!;
      try {
        const { content } = await api.readArtifact(state.activeRoom.projectPath, relPath);
        openArtifactModal(relPath, content);
      } catch (err) {
        setChatNotice(err instanceof Error ? err.message : String(err), true);
      }
      return;
    }

    const actionBtn = target.closest('[data-action]') as HTMLElement | null;
    if (actionBtn && state.activeRoom && state.activeStage && !state.loading) {
      const action = actionBtn.dataset.action!;
      const composer = document.querySelector('#composer-input') as HTMLTextAreaElement;
      const text = composer.value.trim();
      const activityHint =
        action === 'x-to-c'
          ? 'Sending Mr. X\'s conclusion to Mr. C; this may take several minutes…'
          : '';
      setLoading(true);
      if (action !== 'talk-x' && action !== 'c-to-x') {
        setChatNotice(activityHint);
      }
      try {
        const projectPath = state.activeRoom.projectPath;
        if (action === 'talk-x') {
          if (!text) {
            setChatNotice('Please enter a message', true);
            return;
          }
          const roomId = state.activeRoom.id;
          const stageId = state.activeStage.id;
          const userMsg = tempStreamMessage('user', text, roomId, stageId);
          const xMsg = tempStreamMessage('x', '', roomId, stageId);
          xMsg.meta = { streaming: true, provider: 'codex' };
          state.messages.push(userMsg, xMsg);
          composer.value = '';
          syncChat();
          scrollChat();
          try {
            await api.chatXStream(text, projectPath, {
              onDelta: (t) => {
                if (t.trim()) {
                  if (xMsg.meta) delete xMsg.meta.streaming;
                  xMsg.displayContent = t;
                }
                syncChat();
                scrollChat();
              },
              onDone: async () => {},
              onError: async (err) => {
                setChatNotice(err, true);
                composer.value = text;
              },
            });
          } catch (err) {
            setChatNotice(err instanceof Error ? err.message : String(err), true);
            composer.value = text;
          } finally {
            await reloadStageAfterCodexStream(stageId, state.activeRoom.id);
          }
          return;
        } else if (action === 'x-to-c') {
          await api.forwardXToC({ note: text || undefined, projectPath });
          composer.value = '';
        } else if (action === 'c-to-x') {
          const roomId = state.activeRoom.id;
          const stageId = state.activeStage.id;
          const xMsg = tempStreamMessage('x', '', roomId, stageId);
          xMsg.meta = { streaming: true, provider: 'codex', streamMode: 'review-c' };
          state.messages.push(xMsg);
          composer.value = '';
          syncChat();
          scrollChat();
          try {
            await api.forwardCToXStream({ note: text || undefined, projectPath, includeDiff: true }, {
              onDelta: (t) => {
                if (t.trim()) {
                  if (xMsg.meta) delete xMsg.meta.streaming;
                  xMsg.displayContent = t;
                }
                syncChat();
                scrollChat();
              },
              onDone: async () => {},
              onError: async (err) => {
                setChatNotice(err, true);
                composer.value = text;
              },
            });
          } catch (err) {
            setChatNotice(err instanceof Error ? err.message : String(err), true);
            composer.value = text;
          } finally {
            await reloadStageAfterCodexStream(stageId, state.activeRoom.id);
          }
          return;
        }
        const { messages } = await api.listMessages(state.activeStage.id);
        state.messages = messages;
        const { artifacts } = await api.listArtifacts(state.activeRoom.id);
        state.artifacts = artifacts;
        setChatNotice(null);
        syncChat();
        syncRightPanel();
      } catch {
        try {
          await reloadMessages();
        } catch {
          /* ignore secondary load failure */
        }
        setChatNotice(null);
        syncChat();
      } finally {
        setLoading(false);
        scrollChat();
      }
    }
  });

  document.querySelector('#room-cancel')?.addEventListener('click', () => {
    (document.querySelector('#room-dialog') as HTMLDialogElement).close();
  });
  document.querySelector('#stage-cancel')?.addEventListener('click', () => {
    (document.querySelector('#stage-dialog') as HTMLDialogElement).close();
  });
  document.querySelector('#config-cancel')?.addEventListener('click', () => {
    (document.querySelector('#config-dialog') as HTMLDialogElement).close();
  });

  document.querySelector('#room-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.querySelector('#room-title-input') as HTMLInputElement).value.trim();
    const projectPath = (document.querySelector('#room-path-input') as HTMLInputElement).value.trim();
    const stageName = (document.querySelector('#stage-title-input') as HTMLInputElement).value.trim();
    const stageContent = (document.querySelector('#stage-content-input') as HTMLTextAreaElement).value.trim();
    if (!name || !projectPath) return;
    setDialogLoading('room', true, 'Creating room and initializing X/C sessions; this may take 1–3 minutes…');
    try {
      state.dialogFeedback.room.error = null;
      syncDialogFeedback('room');
      const { room } = await api.createRoom({ name, projectPath, stageName, stageContent });
      await refreshRooms();
      const full = state.rooms.find((r) => r.id === room.id) ?? room;
      await selectRoom(full);
      clearDialogFeedback('room');
      syncAll();
      (document.querySelector('#room-dialog') as HTMLDialogElement).close();
      scrollChat();
    } catch (err) {
      setDialogError('room', err);
    } finally {
      setDialogLoading('room', false);
    }
  });

  document.querySelector('#stage-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeRoom) return;
    const name = (document.querySelector('#new-stage-name') as HTMLInputElement).value.trim();
    const content = (document.querySelector('#new-stage-content') as HTMLTextAreaElement).value.trim();
    if (!name) return;
    setDialogLoading('stage', true, 'Creating stage and initializing X/C sessions; this may take 1–3 minutes…');
    try {
      state.dialogFeedback.stage.error = null;
      syncDialogFeedback('stage');
      const { stage } = await api.createStage(state.activeRoom.id, { name, content });
      const { stages } = await api.listStages(state.activeRoom.id);
      state.stages = stages;
      await selectStage(stage);
      clearDialogFeedback('stage');
      syncAll();
      (document.querySelector('#stage-dialog') as HTMLDialogElement).close();
      scrollChat();
    } catch (err) {
      setDialogError('stage', err);
    } finally {
      setDialogLoading('stage', false);
    }
  });

  document.querySelector('#config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = (document.querySelector('#proxy-url') as HTMLInputElement).value.trim();
    const codexPathVal = (document.querySelector('#codex-path') as HTMLInputElement).value.trim();
    const agentPath = (document.querySelector('#cursor-agent-path') as HTMLInputElement).value.trim();
    const rgPathVal = (document.querySelector('#rg-path') as HTMLInputElement).value.trim();
    const resolveCwd = state.activeRoom?.projectPath;
    setDialogLoading('config', true, 'Saving…');
    try {
      state.dialogFeedback.config.error = null;
      syncDialogFeedback('config');
      if (url) {
        await api.setProxy(url);
        state.proxyUrl = url;
      } else {
        await api.clearProxy();
        state.proxyUrl = null;
      }
      if (codexPathVal) {
        const { codexResolved } = await api.setCodex(codexPathVal, resolveCwd);
        state.codexPath = codexPathVal;
        state.codexResolved = codexResolved?.bin ?? null;
      } else {
        await api.clearCodex();
        state.codexPath = null;
        const cfgCodex = await api.getConfig(resolveCwd);
        state.codexResolved = cfgCodex.codexResolved?.bin ?? null;
      }
      if (agentPath) {
        const { cursorAgentResolved } = await api.setCursorAgent(agentPath, resolveCwd);
        state.cursorAgentPath = agentPath;
        state.cursorAgentResolved = cursorAgentResolved?.node ?? null;
      } else {
        await api.clearCursorAgent();
        state.cursorAgentPath = null;
        const cfg = await api.getConfig(resolveCwd);
        state.cursorAgentResolved = cfg.cursorAgentResolved?.node ?? null;
      }
      if (rgPathVal) {
        const { rgResolved } = await api.setRg(rgPathVal, resolveCwd);
        state.rgPath = rgPathVal;
        state.rgResolved = rgResolved?.path ?? null;
      } else {
        await api.clearRg();
        state.rgPath = null;
        state.rgResolved = null;
      }
      await loadToolConfig(resolveCwd);
      syncCursorAgentResolvedHint();
      syncCodexResolvedHint();
      syncRgResolvedHint();
      clearDialogFeedback('config');
      (document.querySelector('#config-dialog') as HTMLDialogElement).close();
    } catch (err) {
      setDialogError('config', err);
    } finally {
      setDialogLoading('config', false);
    }
  });

  document.querySelector('#room-settings-cancel')?.addEventListener('click', () => {
    (document.querySelector('#room-settings-dialog') as HTMLDialogElement).close();
  });

  document.querySelector('#room-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeRoom) return;
    const name = (document.querySelector('#room-settings-name') as HTMLInputElement).value.trim();
    const extraDirsText = (document.querySelector('#room-settings-extra-dirs') as HTMLTextAreaElement).value;
    const extraDirs = extraDirsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!name) return;
    setDialogLoading('room-settings', true, 'Saving…');
    try {
      state.dialogFeedback['room-settings'].error = null;
      syncDialogFeedback('room-settings');
      const result = await api.updateRoomSettings(state.activeRoom.id, { name, extraReadableDirs: extraDirs });
      const updatedRoom: Room = {
        ...state.activeRoom,
        name: result.name,
        extraReadableDirs: result.extraReadableDirs,
      };
      state.activeRoom = updatedRoom;
      state.rooms = state.rooms.map((r) => (r.id === updatedRoom.id ? updatedRoom : r));
      if (result.warnings?.length) {
        setChatNotice(`Room settings saved. ${result.warnings.join('; ')}`, false);
      }
      syncTopbar();
      syncDock();
      syncRightPanel();
      clearDialogFeedback('room-settings');
      (document.querySelector('#room-settings-dialog') as HTMLDialogElement).close();
    } catch (err) {
      setDialogError('room-settings', err);
    } finally {
      setDialogLoading('room-settings', false);
    }
  });

  document.querySelector('#edit-stage-cancel')?.addEventListener('click', () => {
    (document.querySelector('#edit-stage-dialog') as HTMLDialogElement).close();
  });

  document.querySelector('#edit-stage-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeRoom || !state.activeStage) return;
    const name = (document.querySelector('#edit-stage-name') as HTMLInputElement).value.trim();
    const content = (document.querySelector('#edit-stage-content') as HTMLTextAreaElement).value.trim();
    if (!name) return;
    setDialogLoading('edit-stage', true, 'Saving…');
    try {
      state.dialogFeedback['edit-stage'].error = null;
      syncDialogFeedback('edit-stage');
      const { stage } = await api.updateStage(state.activeStage.id, { name, content });
      state.activeStage = stage;
      state.stages = state.stages.map((s) => (s.id === stage.id ? stage : s));
      clearDialogFeedback('edit-stage');
      syncStageRail();
      syncRightPanel();
      (document.querySelector('#edit-stage-dialog') as HTMLDialogElement).close();
    } catch (err) {
      setDialogError('edit-stage', err);
    } finally {
      setDialogLoading('edit-stage', false);
    }
  });
}

async function deleteActiveRoom(): Promise<void> {
  if (!state.activeRoom) return;
  const { name } = state.activeRoom;
  if (!confirm(`Delete room "${name}"?\nThis removes all Stages and messages for this Room in .mrcx; this cannot be undone.`)) {
    return;
  }
  setDialogLoading('room-settings', true, 'Deleting…');
  try {
    state.dialogFeedback['room-settings'].error = null;
    syncDialogFeedback('room-settings');
    await api.deleteRoom(state.activeRoom.id);
    await refreshRooms();
    state.activeRoom = null;
    state.activeStage = null;
    state.stages = [];
    state.messages = [];
    state.artifacts = [];
    if (state.rooms.length > 0) {
      await selectRoom(state.rooms[0]);
    }
    clearDialogFeedback('room-settings');
    (document.querySelector('#room-settings-dialog') as HTMLDialogElement).close();
    syncAll();
  } catch (err) {
    setDialogError('room-settings', err);
  } finally {
    setDialogLoading('room-settings', false);
  }
}

loadInitial();
