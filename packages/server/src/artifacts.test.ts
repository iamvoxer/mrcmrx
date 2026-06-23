import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertAllowedArtifactPath, resolveArtifactFile } from './artifacts.js';

test('assertAllowedArtifactPath rejects skipped directory segments', () => {
  for (const rel of [
    '.git/config',
    '.mrcx/settings.json',
    'node_modules/pkg/index.js',
    'dist/bundle.js',
    'src/../.git/config',
  ]) {
    assert.throws(() => assertAllowedArtifactPath(rel), /not allowed/);
  }
});

test('assertAllowedArtifactPath allows normal project files', () => {
  for (const rel of ['README.md', 'src/main.ts', '.gitignore', 'docs/note.md']) {
    assert.doesNotThrow(() => assertAllowedArtifactPath(rel));
  }
});

test('resolveArtifactFile rejects disallowed paths before reading disk', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-artifact-'));
  try {
    const secretDir = path.join(tmp, '.mrcx');
    fs.mkdirSync(secretDir, { recursive: true });
    fs.writeFileSync(path.join(secretDir, 'settings.json'), '{}');
    assert.throws(() => resolveArtifactFile(tmp, '.mrcx/settings.json'), /not allowed/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
