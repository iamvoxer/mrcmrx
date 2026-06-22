import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findCodexBundledRgExe } from './rg-bin.js';

test('findCodexBundledRgExe returns newest build rg.exe when present', () => {
  if (process.platform !== 'win32') return;
  const local = process.env.LOCALAPPDATA ?? '';
  const base = path.join(local, 'OpenAI', 'Codex', 'bin');
  if (!fs.existsSync(base)) return;

  const found = findCodexBundledRgExe();
  if (!found) return;
  assert.match(found, /rg\.exe$/i);
  assert.ok(fs.existsSync(found));
});

test('findCodexBundledRgExe returns undefined when codex bin missing', () => {
  const prev = process.env.LOCALAPPDATA;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-rg-'));
  process.env.LOCALAPPDATA = tmp;
  try {
    assert.equal(findCodexBundledRgExe(), undefined);
  } finally {
    process.env.LOCALAPPDATA = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
