import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createRoomRecord,
  createStageRecord,
  createMessageRecord,
  saveRoom,
  loadRoom,
  saveStage,
  loadStage,
  appendMessage,
  loadMessages,
  saveContext,
  loadContext,
  deleteRoomData,
  listRoomIds,
} from './store/index.js';
import { deleteRoom, updateStage } from './services/room-service.js';

test('v2 store: room, stage, messages, context', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-v2-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });

  const room = createRoomRecord('Test Room', projectPath);
  saveRoom(projectPath, room);
  assert.equal(loadRoom(projectPath, room.id).name, 'Test Room');

  const stage = createStageRecord(room.id, 'Requirements', 'Stage goal description', 1);
  saveStage(projectPath, stage);
  assert.equal(loadStage(projectPath, room.id, stage.id).name, 'Requirements');

  const msg = createMessageRecord(room.id, stage.id, 'user', 'hello');
  appendMessage(projectPath, msg);
  assert.equal(loadMessages(projectPath, room.id, stage.id).length, 1);

  saveContext(projectPath, { currentRoomId: room.id, currentStageId: stage.id });
  const ctx = loadContext(projectPath);
  assert.equal(ctx.currentStageId, stage.id);
});

test('v2 store: delete room data', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-v2-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });

  const room = createRoomRecord('Room To Delete', projectPath);
  saveRoom(projectPath, room);
  deleteRoomData(projectPath, room.id);
  assert.equal(listRoomIds(projectPath).length, 0);
});

test('v2 room-service: update stage and delete room', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-v2-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });

  const room = createRoomRecord('Room A', projectPath);
  saveRoom(projectPath, room);
  saveContext(projectPath, { currentRoomId: room.id, currentStageId: null });

  const stage = createStageRecord(room.id, 'Stage 1', 'Notes A', 1);
  saveStage(projectPath, stage);

  const updated = updateStage(projectPath, room.id, stage.id, { name: 'Stage 1 Renamed', content: 'Notes B' });
  assert.equal(updated.name, 'Stage 1 Renamed');
  assert.equal(loadStage(projectPath, room.id, stage.id).content, 'Notes B');

  deleteRoom(projectPath, room.id);
  assert.equal(listRoomIds(projectPath).length, 0);
  assert.equal(loadContext(projectPath).currentRoomId, null);
});
