import type { AgentRunResult, Message, MessageMeta } from '../types.js';
import { appendMessage, createMessageRecord } from './index.js';
import { saveRunDetail } from './runs.js';

function metaWithRun(
  messageId: string,
  meta: MessageMeta | undefined,
  run: AgentRunResult,
): MessageMeta {
  return {
    ...meta,
    runId: messageId,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
  };
}

/** Append agent reply message and persist CLI run detail. */
export function appendAgentMessage(
  projectPath: string,
  roomId: string,
  stageId: string,
  speaker: 'x' | 'c' | 'system',
  content: string,
  run: AgentRunResult,
  meta: MessageMeta = {},
): Message {
  const msg = createMessageRecord(roomId, stageId, speaker, content, meta);
  if (run.displayText) {
    msg.displayContent = run.displayText;
  }
  msg.meta = metaWithRun(msg.id, msg.meta, run);
  saveRunDetail(projectPath, roomId, msg.id, run);
  appendMessage(projectPath, msg);
  return msg;
}
