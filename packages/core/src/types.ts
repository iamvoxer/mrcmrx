export interface XSession {
  provider: 'codex';
  sessionId: string;
}

export interface CSession {
  provider: 'cursor';
  chatId: string;
}

export interface Room {
  id: string;
  name: string;
  projectPath: string;
  /** Extra readable directories (for X reference; not the primary workspace) */
  extraReadableDirs?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: string;
  roomId: string;
  name: string;
  content: string;
  order: number;
  xSession: XSession | null;
  cSession: CSession | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageSpeaker = 'user' | 'x' | 'c' | 'system';

export interface MessageMeta {
  provider?: 'codex' | 'cursor';
  sessionId?: string;
  chatId?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  /** Links to .mrcx/rooms/.../runs/<id>.json execution detail */
  runId?: string;
}

export interface Message {
  id: string;
  roomId: string;
  stageId: string;
  speaker: MessageSpeaker;
  /** Body text (e.g. agent_message only); used when forwarding to C. */
  content: string;
  /** Full text for UI, including status/errors; defaults to content when absent. */
  displayContent?: string;
  createdAt: string;
  meta?: MessageMeta;
}

export interface MrcxContext {
  currentRoomId: string | null;
  currentStageId: string | null;
}

export interface AgentRunResult {
  /** Body text (agent_message only for Codex). */
  text: string;
  /** Full display text for UI (includes errors/status for Codex). */
  displayText?: string;
  exitCode: number | null;
  stderr: string;
  sessionId?: string;
  chatId?: string;
  timedOut?: boolean;
  invocation?: import('./agents/run-detail.js').AgentInvocation;
  stdoutRaw?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  spawnEnv?: { rgPath?: string | null; pathPrefix?: string[] };
}
