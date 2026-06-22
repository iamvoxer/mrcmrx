import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSpawnEnv,
  buildSpawnEnvWithMeta,
  loadSettings,
  proxyEnvFromSettings,
  setCliProxyOverride,
  setProxyUrl,
  setRgPath,
} from './settings.js';

test('proxyEnvFromSettings sets http and https', () => {
  const env = proxyEnvFromSettings({ proxy: { url: 'http://127.0.0.1:7892' } });
  assert.equal(env.HTTP_PROXY, 'http://127.0.0.1:7892');
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:7892');
});

test('buildSpawnEnv applies settings and cli override', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-proxy-'));
  setProxyUrl(tmp, 'http://127.0.0.1:7892');

  const fromSettings = buildSpawnEnv(tmp);
  assert.equal(fromSettings.HTTP_PROXY, 'http://127.0.0.1:7892');

  setCliProxyOverride('http://127.0.0.1:9999');
  const overridden = buildSpawnEnv(tmp);
  assert.equal(overridden.HTTP_PROXY, 'http://127.0.0.1:9999');
  setCliProxyOverride(undefined);
});

test('setProxyUrl persists to settings.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-proxy2-'));
  setProxyUrl(tmp, 'http://proxy.local:8080');
  const loaded = loadSettings(tmp);
  assert.equal(loaded.proxy?.url, 'http://proxy.local:8080');
});

test('buildSpawnEnvWithMeta prepends configured rg directory to PATH', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-rg-env-'));
  fs.mkdirSync(path.join(tmp, '.mrcx'), { recursive: true });
  const rgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-rg-bin-'));
  const rgExe = path.join(rgDir, process.platform === 'win32' ? 'rg.exe' : 'rg');
  fs.writeFileSync(rgExe, '');
  setRgPath(tmp, rgExe);

  const { env, meta } = buildSpawnEnvWithMeta(tmp);
  assert.equal(meta.rgPath, path.resolve(rgExe));
  assert.ok(meta.pathPrefix[0]?.toLowerCase() === rgDir.toLowerCase());
  const pathParts = (env.PATH ?? '').split(path.delimiter);
  assert.equal(pathParts[0]?.toLowerCase(), rgDir.toLowerCase());

  fs.rmSync(rgDir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});
