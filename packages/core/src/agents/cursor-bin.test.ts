import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCursorAgentFromPath } from './cursor-bin.js';
import { loadGlobalSettings, setCursorAgentPath } from '../config/settings.js';
import { resolveCursorAgentInvocation } from './cursor-bin.js';

function withGlobalDir<T>(fn: () => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-cursor-global-'));
  const prev = process.env.MRCX_GLOBAL_DIR;
  process.env.MRCX_GLOBAL_DIR = dir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MRCX_GLOBAL_DIR;
    else process.env.MRCX_GLOBAL_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

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
  withGlobalDir(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-cursor2-'));
    const versionDir = path.join(tmp, 'agent-ver');
    fs.mkdirSync(versionDir);
    fs.writeFileSync(path.join(versionDir, 'index.js'), '// agent');
    fs.writeFileSync(path.join(versionDir, process.platform === 'win32' ? 'node.exe' : 'node'), '');

    setCursorAgentPath(path.join(versionDir, 'node.exe'));
    assert.equal(loadGlobalSettings().cursorAgent?.path, path.join(versionDir, 'node.exe'));

    const inv = resolveCursorAgentInvocation();
    assert.equal(inv.source, 'configured');
    assert.equal(inv.index, path.join(versionDir, 'index.js'));
  });
});
