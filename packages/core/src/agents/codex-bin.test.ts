import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { detectCodexPath, resolveCodexInvocation } from './codex-bin.js';
import { setCodexPath } from '../config/settings.js';

test('resolveCodexInvocation uses settings.codex.path', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-codex-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });
  const fakeExe = path.join(tmp, 'codex.exe');
  fs.writeFileSync(fakeExe, '');

  setCodexPath(projectPath, fakeExe);
  const inv = resolveCodexInvocation(projectPath);
  assert.equal(inv.bin, fakeExe);
  assert.equal(inv.source, 'configured');
});

test('detectCodexPath returns null or string', () => {
  const detected = detectCodexPath();
  assert.ok(detected === null || detected.endsWith('codex.exe'));
});
