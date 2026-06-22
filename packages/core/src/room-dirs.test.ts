import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { codexAddDirArgs } from './agents/codex-client.js';
import { normalizeExtraReadableDirs } from './room-dirs.js';
import { createRoomRecord, loadRoom, saveRoom } from './store/index.js';
import { ensureDir, mrcxRoot } from './paths.js';

test('normalizeExtraReadableDirs resolves, dedupes, filters empty', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-extra-'));
  const { dirs, warnings } = normalizeExtraReadableDirs(['  ', tmp, tmp, path.resolve(tmp)]);
  assert.equal(dirs.length, 1);
  assert.equal(path.resolve(dirs[0]), path.resolve(tmp));
  assert.equal(warnings.length, 0);
});

test('normalizeExtraReadableDirs warns on missing dir', () => {
  const missing = path.join(os.tmpdir(), `mrcx-missing-${Date.now()}`);
  const { dirs, warnings } = normalizeExtraReadableDirs([missing]);
  assert.equal(dirs.length, 1);
  assert.equal(dirs[0], path.resolve(missing));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /does not exist/);
});

test('codexAddDirArgs emits --add-dir pairs', () => {
  const args = codexAddDirArgs(['C:\\a', 'C:\\b']);
  assert.deepEqual(args, ['--add-dir', 'C:\\a', '--add-dir', 'C:\\b']);
});

test('createRoomRecord defaults extraReadableDirs to []', () => {
  const room = createRoomRecord('test', 'C:\\proj');
  assert.deepEqual(room.extraReadableDirs, []);
});

test('loadRoom tolerates missing extraReadableDirs', () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-room-'));
  ensureDir(mrcxRoot(projectPath));
  const room = createRoomRecord('legacy', projectPath);
  delete (room as { extraReadableDirs?: string[] }).extraReadableDirs;
  ensureDir(path.join(mrcxRoot(projectPath), 'rooms', room.id));
  saveRoom(projectPath, room);
  const loaded = loadRoom(projectPath, room.id);
  assert.deepEqual(loaded.extraReadableDirs, []);
});
