import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCursorAgentFromPath } from './cursor-bin.js';
import { loadSettings, setCursorAgentPath } from '../config/settings.js';
import { resolveCursorAgentInvocation } from './cursor-bin.js';

test('resolveCursorAgentFromPath accepts index.js', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-cursor-'));
  const versionDir = path.join(tmp, '2026.06.19-test');
  fs.mkdirSync(versionDir);
  fs.writeFileSync(path.join(versionDir, 'index.js'), '// agent');
  fs.writeFileSync(path.join(versionDir, process.platform === 'win32' ? 'node.exe' : 'node'), '');

  const inv = resolveCursorAgentFromPath(path.join(versionDir, 'index.js'));
  assert.equal(inv.source, 'configured');
  assert.ok(inv.node.endsWith(process.platform === 'win32' ? 'node.exe' : 'node'));
});

test('settings cursorAgent.path is used by resolveCursorAgentInvocation', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-cursor2-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });
  const versionDir = path.join(tmp, 'agent-ver');
  fs.mkdirSync(versionDir);
  fs.writeFileSync(path.join(versionDir, 'index.js'), '// agent');
  fs.writeFileSync(path.join(versionDir, process.platform === 'win32' ? 'node.exe' : 'node'), '');

  setCursorAgentPath(projectPath, path.join(versionDir, 'node.exe'));
  assert.equal(loadSettings(projectPath).cursorAgent?.path, path.join(versionDir, 'node.exe'));

  const inv = resolveCursorAgentInvocation(projectPath);
  assert.equal(inv.source, 'configured');
  assert.equal(inv.index, path.join(versionDir, 'index.js'));
});
