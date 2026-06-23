import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { CodexCallOptions } from '../agents/codex-client.js';
import { forwardCToX } from './chat-service.js';
import {
  appendMessage,
  createMessageRecord,
  createRoomRecord,
  createStageRecord,
  saveContext,
  saveRoom,
  saveStage,
} from '../store/index.js';

test('forwardCToX passes onProgress to codexSendMessage', async () => {
  const progress: string[] = [];
  let receivedOnProgress: ((text: string) => void) | undefined;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-fwd-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });

  const room = createRoomRecord('Room', projectPath);
  saveRoom(projectPath, room);
  const stage = createStageRecord(room.id, 'Stage', '', 1);
  stage.xSession = { provider: 'codex', sessionId: 'codex-sess-1' };
  saveStage(projectPath, stage);
  saveContext(projectPath, { currentRoomId: room.id, currentStageId: stage.id });
  appendMessage(projectPath, createMessageRecord(room.id, stage.id, 'c', 'C completed the task'));

  await forwardCToX({
    projectPath,
    onProgress: (text) => progress.push(text),
    connectivityCheck: async () => {},
    codexSend: async (_projectPath, _sessionId, _prompt, callOptions?: CodexCallOptions) => {
      receivedOnProgress = callOptions?.onProgress;
      callOptions?.onProgress?.('Reconnecting... 1/1');
      callOptions?.onProgress?.('▶ npm test\n\nReview passed');
      return {
        text: 'Review passed',
        displayText: 'Reconnecting... 1/1\n\n▶ npm test\n\nReview passed',
        exitCode: 0,
        stderr: '',
      };
    },
  });

  assert.ok(receivedOnProgress);
  assert.deepEqual(progress, ['Reconnecting... 1/1', '▶ npm test\n\nReview passed']);
});
