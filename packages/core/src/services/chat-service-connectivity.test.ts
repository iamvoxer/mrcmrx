import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { formatChatGptConnectivityError } from '../agents/chatgpt-connectivity.js';
import { MrcxError } from '../services/context.js';
import { chatWithX, forwardCToX } from './chat-service.js';
import {
  appendMessage,
  createMessageRecord,
  createRoomRecord,
  createStageRecord,
  loadMessages,
  saveContext,
  saveRoom,
  saveStage,
} from '../store/index.js';

function setupStage(projectPath: string): { roomId: string; stageId: string } {
  const room = createRoomRecord('Room', projectPath);
  saveRoom(projectPath, room);
  const stage = createStageRecord(room.id, 'Stage', '', 1);
  stage.xSession = { provider: 'codex', sessionId: 'codex-sess-1' };
  saveStage(projectPath, stage);
  saveContext(projectPath, { currentRoomId: room.id, currentStageId: stage.id });
  return { roomId: room.id, stageId: stage.id };
}

test('chatWithX skips Codex when connectivity check fails', async () => {
  let codexCalled = false;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-chat-conn-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });
  const { roomId, stageId } = setupStage(projectPath);

  await assert.rejects(
    () =>
      chatWithX('hello', {
        projectPath,
        connectivityCheck: async () => {
          throw new MrcxError(formatChatGptConnectivityError('http://127.0.0.1:7892'));
        },
        codexSend: async () => {
          codexCalled = true;
          return { text: 'ok', displayText: 'ok', exitCode: 0, stderr: '' };
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof MrcxError);
      assert.ok(err.message.includes('chatgpt.com'));
      assert.ok(err.message.includes('Proxy: http://127.0.0.1:7892'));
      return true;
    },
  );

  assert.equal(codexCalled, false);
  const messages = loadMessages(projectPath, roomId, stageId);
  assert.equal(messages.some((m) => m.speaker === 'user'), false);
  assert.equal(messages.some((m) => m.speaker === 'x'), false);
  assert.ok(messages.some((m) => m.speaker === 'system' && m.content.includes('chatgpt.com')));
});

test('chatWithX calls Codex when connectivity check passes', async () => {
  let codexCalled = false;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-chat-conn-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });
  setupStage(projectPath);

  await chatWithX('hello', {
    projectPath,
    connectivityCheck: async () => {},
    codexSend: async () => {
      codexCalled = true;
      return { text: 'ok', displayText: 'ok', exitCode: 0, stderr: '' };
    },
  });

  assert.equal(codexCalled, true);
});

test('forwardCToX skips Codex when connectivity check fails', async () => {
  let codexCalled = false;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-fwd-conn-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });
  const { roomId, stageId } = setupStage(projectPath);
  appendMessage(projectPath, createMessageRecord(roomId, stageId, 'c', 'C result'));

  await assert.rejects(
    () =>
      forwardCToX({
        projectPath,
        connectivityCheck: async () => {
          throw new MrcxError(formatChatGptConnectivityError());
        },
        codexSend: async () => {
          codexCalled = true;
          return { text: 'ok', displayText: 'ok', exitCode: 0, stderr: '' };
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof MrcxError);
      assert.ok(err.message.includes('chatgpt.com'));
      return true;
    },
  );

  assert.equal(codexCalled, false);
  const messages = loadMessages(projectPath, roomId, stageId);
  assert.equal(messages.some((m) => m.speaker === 'x'), false);
  assert.equal(messages.some((m) => m.content.includes('[Forwarded to X]')), false);
  assert.ok(messages.some((m) => m.speaker === 'system' && m.content.includes('chatgpt.com')));
});
