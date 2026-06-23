export interface Room {
  id: string;
  name: string;
  projectPath: string;
  extraReadableDirs?: string[];
  createdAt: string;
  updatedAt: string;
  mrcxRoot?: string;
}

export interface Stage {
  id: string;
  roomId: string;
  name: string;
  content: string;
  order: number;
  xSession: { provider: 'codex'; sessionId: string } | null;
  cSession: { provider: 'cursor'; chatId: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageMeta {
  provider?: 'codex' | 'cursor';
  sessionId?: string;
  chatId?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  runId?: string;
  /** Client-side streaming placeholder while Mr. X is thinking */
  streaming?: boolean;
  /** Which waiting copy to show before first stream delta */
  streamMode?: 'talk' | 'review-c';
}

export interface Message {
  id: string;
  roomId: string;
  stageId: string;
  speaker: 'user' | 'x' | 'c' | 'system';
  /** Body text for forwarding; for X from Codex this is agent_message only. */
  content: string;
  /** Full stream for UI (errors, command activity, body). */
  displayContent?: string;
  createdAt: string;
  meta?: MessageMeta;
}

export interface AgentRunDetail {
  id: string;
  provider: 'codex' | 'cursor';
  label: string;
  command: string;
  bin: string;
  args: string[];
  cwd: string;
  stdin?: string;
  rgPath?: string | null;
  pathPrefix?: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  sessionId?: string;
  chatId?: string;
}
