import path from 'node:path';
import * as codexClient from '../agents/codex-client.js';
import type { CodexCallOptions } from '../agents/codex-client.js';
import { checkChatGptConnectivity } from '../agents/chatgpt-connectivity.js';
import { cursorSendMessage } from '../agents/cursor-client.js';
import { assertAgentRunOk, formatAgentRunFailure } from '../agents/agent-run.js';
import {
  appendMessage,
  createMessageRecord,
  loadMessages,
} from '../store/index.js';
import { appendAgentMessage } from '../store/agent-messages.js';
import type { AgentRunResult, Message } from '../types.js';
import { getActiveContext, gitDiffStat, MrcxError } from './context.js';

function lastMessages(messages: Message[], speaker: Message['speaker'], count: number): Message[] {
  return messages.filter((m) => m.speaker === speaker).slice(-count);
}

/** Body-only block sent to C when forwarding X messages (never uses displayContent). */
export function xForwardBlock(xMsgs: Message[]): string {
  return xMsgs.map((m) => m.content).join('\n\n---\n\n');
}

function recordAgentFailure(
  root: string,
  roomId: string,
  stageId: string,
  label: string,
  run: AgentRunResult,
  meta: { provider?: 'codex' | 'cursor' } = {},
): never {
  const text = formatAgentRunFailure(label, run);
  appendAgentMessage(root, roomId, stageId, 'system', text, run, {
    provider: meta.provider ?? (label.includes('Codex') ? 'codex' : 'cursor'),
  });
  throw new MrcxError(text);
}

function recordConnectivityFailure(
  root: string,
  roomId: string,
  stageId: string,
  err: unknown,
): never {
  if (err instanceof MrcxError) {
    appendMessage(root, createMessageRecord(roomId, stageId, 'system', err.message));
    throw err;
  }
  const text = err instanceof Error ? err.message : String(err);
  appendMessage(root, createMessageRecord(roomId, stageId, 'system', text));
  throw new MrcxError(text);
}

async function ensureChatGptConnectivity(
  projectPath: string,
  root: string,
  roomId: string,
  stageId: string,
  check: (path: string) => Promise<void> = checkChatGptConnectivity,
): Promise<void> {
  try {
    await check(projectPath);
  } catch (err) {
    recordConnectivityFailure(root, roomId, stageId, err);
  }
}

export async function chatWithX(
  userMessage: string,
  options: {
    projectPath?: string;
    allowWrite?: boolean;
    onProgress?: (text: string) => void;
    /** @internal Test hook to stub connectivity check. */
    connectivityCheck?: (projectPath: string) => Promise<void>;
    /** @internal Test hook to stub Codex without spawning a process. */
    codexSend?: (
      projectPath: string,
      sessionId: string,
      prompt: string,
      callOptions: CodexCallOptions,
    ) => ReturnType<typeof codexClient.codexSendMessage>;
  } = {},
): Promise<Message> {
  const { projectPath: root, room, stage } = getActiveContext(options.projectPath);
  if (!stage.xSession?.sessionId) {
    throw new MrcxError('Current stage has no Codex session');
  }

  await ensureChatGptConnectivity(
    room.projectPath,
    root,
    room.id,
    stage.id,
    options.connectivityCheck,
  );

  const extraDirs = room.extraReadableDirs ?? [];

  appendMessage(root, createMessageRecord(room.id, stage.id, 'user', userMessage));

  const sendCodex = options.codexSend ?? codexClient.codexSendMessage;
  const run = await sendCodex(room.projectPath, stage.xSession.sessionId, userMessage, {
    allowWrite: options.allowWrite,
    extraReadableDirs: extraDirs,
    onProgress: options.onProgress,
  });

  try {
    assertAgentRunOk('Codex (X)', run);
  } catch {
    recordAgentFailure(root, room.id, stage.id, 'Codex (X)', run, { provider: 'codex' });
  }

  return appendAgentMessage(root, room.id, stage.id, 'x', run.text, run, {
    provider: 'codex',
    sessionId: stage.xSession.sessionId,
  });
}

export async function forwardXToC(options: {
  last?: number;
  note?: string;
  projectPath?: string;
}): Promise<Message> {
  const { projectPath: root, room, stage } = getActiveContext(options.projectPath);
  if (!stage.cSession?.chatId) {
    throw new MrcxError('Current stage has no Cursor chat');
  }

  const all = loadMessages(root, room.id, stage.id);
  const xMsgs = lastMessages(all, 'x', options.last ?? 1);
  if (xMsgs.length === 0) {
    throw new MrcxError('No X messages to forward');
  }

  const xBlock = xForwardBlock(xMsgs);
  const prompt = [
    '[Conclusion from X — execute this and modify workspace files]',
    xBlock,
    options.note ? `\n[User note]\n${options.note}` : '',
    `\n[Workspace]\n${room.projectPath}`,
  ]
    .filter(Boolean)
    .join('\n');

  appendMessage(
    root,
    createMessageRecord(room.id, stage.id, 'user', `[Forwarded to C]\n${prompt}`),
  );

  let run: AgentRunResult;
  try {
    run = await cursorSendMessage(room.projectPath, stage.cSession.chatId, prompt);
  } catch (e) {
    if (e instanceof MrcxError) {
      appendMessage(root, createMessageRecord(room.id, stage.id, 'system', e.message));
    }
    throw e;
  }

  try {
    assertAgentRunOk('Cursor (C)', run);
  } catch {
    recordAgentFailure(root, room.id, stage.id, 'Cursor (C)', run, { provider: 'cursor' });
  }

  return appendAgentMessage(root, room.id, stage.id, 'c', run.text, run, {
    provider: 'cursor',
    chatId: stage.cSession.chatId,
  });
}

export async function forwardCToX(options: {
  last?: number;
  note?: string;
  includeDiff?: boolean;
  allowWrite?: boolean;
  projectPath?: string;
  onProgress?: (text: string) => void;
  /** @internal Test hook to stub Codex without spawning a process. */
  codexSend?: (
    projectPath: string,
    sessionId: string,
    prompt: string,
    callOptions: CodexCallOptions,
  ) => ReturnType<typeof codexClient.codexSendMessage>;
  /** @internal Test hook to stub connectivity check. */
  connectivityCheck?: (projectPath: string) => Promise<void>;
}): Promise<Message> {
  const { projectPath: root, room, stage } = getActiveContext(options.projectPath);
  if (!stage.xSession?.sessionId) {
    throw new MrcxError('Current stage has no Codex session');
  }

  const all = loadMessages(root, room.id, stage.id);
  const cMsgs = lastMessages(all, 'c', options.last ?? 1);
  if (cMsgs.length === 0) {
    throw new MrcxError('No C messages to forward');
  }

  await ensureChatGptConnectivity(
    room.projectPath,
    root,
    room.id,
    stage.id,
    options.connectivityCheck,
  );

  const cBlock = cMsgs.map((m) => m.content).join('\n\n---\n\n');
  const diff = options.includeDiff ? gitDiffStat(room.projectPath) : null;

  const prompt = [
    '[Report from C — please review]',
    cBlock,
    options.note ? `\n[User feedback]\n${options.note}` : '',
    diff ? `\n[File change summary]\n${diff}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  appendMessage(
    root,
    createMessageRecord(room.id, stage.id, 'user', `[Forwarded to X]\n${prompt}`),
  );

  const sendCodex = options.codexSend ?? codexClient.codexSendMessage;
  const run = await sendCodex(room.projectPath, stage.xSession.sessionId, prompt, {
    allowWrite: options.allowWrite,
    extraReadableDirs: room.extraReadableDirs ?? [],
    onProgress: options.onProgress,
  });

  try {
    assertAgentRunOk('Codex (X)', run);
  } catch {
    recordAgentFailure(root, room.id, stage.id, 'Codex (X)', run, { provider: 'codex' });
  }

  return appendAgentMessage(root, room.id, stage.id, 'x', run.text, run, {
    provider: 'codex',
    sessionId: stage.xSession.sessionId,
  });
}

export function getStatus(projectPath?: string): {
  mrcxIndexPath: string;
  cwd: string;
  cwdMatchesProject: boolean;
  room: { id: string; name: string; projectPath: string };
  stage: { id: string; name: string; xSession: string | null; cSession: string | null };
  messageCount: number;
} {
  const { projectPath: root, room, stage } = getActiveContext(projectPath);
  const messages = loadMessages(root, room.id, stage.id);
  const cwd = process.cwd();
  const cwdMatchesProject =
    path.resolve(cwd).toLowerCase() === path.resolve(room.projectPath).toLowerCase();
  return {
    mrcxIndexPath: root,
    cwd,
    cwdMatchesProject,
    room: { id: room.id, name: room.name, projectPath: room.projectPath },
    stage: {
      id: stage.id,
      name: stage.name,
      xSession: stage.xSession?.sessionId ?? null,
      cSession: stage.cSession?.chatId ?? null,
    },
    messageCount: messages.length,
  };
}
