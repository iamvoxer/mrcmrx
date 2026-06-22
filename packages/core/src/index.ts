export type {
  Room,
  Stage,
  Message,
  MessageSpeaker,
  XSession,
  CSession,
  MrcxContext,
  AgentRunResult,
} from './types.js';

export { MrcxError, getActiveContext, gitDiffStat } from './services/context.js';
export {
  createRoom,
  listRooms,
  useRoom,
  createStage,
  listStagesForRoom,
  useStage,
  updateStage,
  deleteRoom,
  getRoomSettings,
  updateRoomSettings,
} from './services/room-service.js';
export type { UpdateRoomSettingsPatch, UpdateRoomSettingsResult } from './services/room-service.js';
export { normalizeExtraReadableDirs, parseExtraReadableDirsText, formatExtraReadableDirsText } from './room-dirs.js';
export {
  chatWithX,
  forwardXToC,
  forwardCToX,
  getStatus,
} from './services/chat-service.js';
export { cursorAgentStatus } from './agents/cursor-client.js';

export { resolveProjectPath, readJson, writeJson, ensureDir } from './paths.js';
export { loadMessages, loadContext, listRoomIds, loadRoom, listStages, loadStage } from './store/index.js';
export { loadRunDetail } from './store/runs.js';
export type { AgentRunDetail } from './agents/run-detail.js';

export type { MrcxSettings, MrcxProxySettings, MrcxToolSettings, SpawnEnvMeta } from './config/settings.js';
export {
  buildSpawnEnv,
  buildSpawnEnvWithMeta,
  clearProxy,
  clearCursorAgentPath,
  clearCodexPath,
  clearRgPath,
  findMrcxProjectPath,
  loadSettings,
  proxyEnvFromSettings,
  saveSettings,
  setCliProxyOverride,
  setCursorAgentPath,
  setCodexPath,
  setRgPath,
  setProxyUrl,
} from './config/settings.js';
export {
  detectCursorAgentPath,
  resolveCursorAgentFromPath,
  resolveCursorAgentInvocation,
} from './agents/cursor-bin.js';
export { detectCodexPath, resolveCodexInvocation } from './agents/codex-bin.js';
export { detectRgPath, resolveRgInvocation } from './tools/rg-bin.js';
export { escapeHtml, renderChatMarkdown } from './markdown.js';
