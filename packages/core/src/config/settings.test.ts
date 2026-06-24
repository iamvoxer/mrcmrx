import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSpawnEnv,
  buildSpawnEnvWithMeta,
  globalSettingsPath,
  loadGlobalSettings,
  proxyEnvFromSettings,
  setCliProxyOverride,
  setProxyUrl,
  setRgPath,
} from './settings.js';

function withGlobalDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-global-'));
  const prev = process.env.MRCX_GLOBAL_DIR;
  process.env.MRCX_GLOBAL_DIR = dir;
  try {
    return fn(dir);
  } finally {
    if (prev === undefined) delete process.env.MRCX_GLOBAL_DIR;
    else process.env.MRCX_GLOBAL_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('proxyEnvFromSettings sets http and https', () => {
  const env = proxyEnvFromSettings({ proxy: { url: 'http://127.0.0.1:7892' } });
  assert.equal(env.HTTP_PROXY, 'http://127.0.0.1:7892');
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:7892');
});

test('buildSpawnEnv applies settings and cli override', () => {
  withGlobalDir(() => {
    setProxyUrl('http://127.0.0.1:7892');

    const fromSettings = buildSpawnEnv('/tmp');
    assert.equal(fromSettings.HTTP_PROXY, 'http://127.0.0.1:7892');

    setCliProxyOverride('http://127.0.0.1:9999');
    const overridden = buildSpawnEnv('/tmp');
    assert.equal(overridden.HTTP_PROXY, 'http://127.0.0.1:9999');
    setCliProxyOverride(undefined);
  });
});

test('buildSpawnEnv ignores shell HTTP_PROXY when settings has no proxy', () => {
  withGlobalDir(() => {
    const prevHttps = process.env.HTTPS_PROXY;
    const prevNoProxy = process.env.NO_PROXY;
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7892';
    process.env.NO_PROXY = '*';
    try {
      const env = buildSpawnEnv('/tmp');
      assert.equal(env.HTTP_PROXY, undefined);
      assert.equal(env.HTTPS_PROXY, undefined);
      assert.equal(env.NO_PROXY, undefined);
      assert.equal(env.no_proxy, undefined);
    } finally {
      if (prevHttps === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = prevHttps;
      if (prevNoProxy === undefined) delete process.env.NO_PROXY;
      else process.env.NO_PROXY = prevNoProxy;
    }
  });
});

test('setProxyUrl persists to global settings.json', () => {
  withGlobalDir((dir) => {
    setProxyUrl('http://proxy.local:8080');
    const loaded = loadGlobalSettings();
    assert.equal(loaded.proxy?.url, 'http://proxy.local:8080');
    assert.equal(globalSettingsPath(), path.join(dir, 'settings.json'));
    assert.ok(fs.existsSync(globalSettingsPath()));
  });
});

test('buildSpawnEnvWithMeta prepends configured rg directory to PATH', () => {
  withGlobalDir(() => {
    const rgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-rg-bin-'));
    const rgExe = path.join(rgDir, process.platform === 'win32' ? 'rg.exe' : 'rg');
    fs.writeFileSync(rgExe, '');
    setRgPath(rgExe);

    const { env, meta } = buildSpawnEnvWithMeta('/tmp');
    assert.equal(meta.rgPath, path.resolve(rgExe));
    assert.ok(meta.pathPrefix[0]?.toLowerCase() === rgDir.toLowerCase());
    const pathParts = (env.PATH ?? '').split(path.delimiter);
    assert.equal(pathParts[0]?.toLowerCase(), rgDir.toLowerCase());

    fs.rmSync(rgDir, { recursive: true, force: true });
  });
});
