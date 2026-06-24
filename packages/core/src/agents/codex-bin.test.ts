import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { detectCodexPath, resolveCodexInvocation } from './codex-bin.js';
import { loadGlobalSettings, setCodexPath } from '../config/settings.js';

function withGlobalDir<T>(fn: () => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-codex-global-'));
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

test('resolveCodexInvocation uses settings.codex.path', () => {
  withGlobalDir(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-codex-'));
    const fakeExe = path.join(tmp, 'codex.exe');
    fs.writeFileSync(fakeExe, '');

    setCodexPath(fakeExe);
    assert.equal(loadGlobalSettings().codex?.path, fakeExe);
    const inv = resolveCodexInvocation();
    assert.equal(inv.bin, fakeExe);
    assert.equal(inv.source, 'configured');
  });
});

test('detectCodexPath returns null or string', () => {
  const detected = detectCodexPath();
  assert.ok(detected === null || detected.endsWith('codex.exe'));
});
