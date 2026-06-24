import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  CHATGPT_CONNECTIVITY_URL,
  checkChatGptConnectivity,
  formatChatGptConnectivityError,
  isConnectivityResponse,
  probeChatGptConnectivity,
} from '../agents/chatgpt-connectivity.js';
import { resolveSettingsProxyUrl, saveGlobalSettings, setCliProxyOverride } from '../config/settings.js';
import { MrcxError } from '../services/context.js';

function withGlobalDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-conn-'));
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

test('formatChatGptConnectivityError includes chatgpt.com and proxy', () => {
  const text = formatChatGptConnectivityError('http://127.0.0.1:7892');
  assert.ok(text.includes('chatgpt.com'));
  assert.ok(text.includes('Proxy: http://127.0.0.1:7892'));
});

test('isConnectivityResponse accepts any HTTP status', () => {
  assert.equal(isConnectivityResponse(200), true);
  assert.equal(isConnectivityResponse(403), true);
  assert.equal(isConnectivityResponse(502), true);
  assert.equal(isConnectivityResponse(99), false);
});

test('resolveSettingsProxyUrl reads proxy.url from global settings.json', () => {
  withGlobalDir(() => {
    saveGlobalSettings({ proxy: { url: 'http://127.0.0.1:7892' } });
    assert.equal(resolveSettingsProxyUrl(), 'http://127.0.0.1:7892');
  });
});

test('resolveSettingsProxyUrl ignores process env when settings has no proxy', () => {
  withGlobalDir(() => {
    saveGlobalSettings({});
    const prev = process.env.HTTPS_PROXY;
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7892';
    try {
      assert.equal(resolveSettingsProxyUrl(), undefined);
    } finally {
      if (prev === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = prev;
    }
  });
});

test('probeChatGptConnectivity uses undici dispatcher when proxy is set', async () => {
  let sawDispatcher = false;
  const ok = await probeChatGptConnectivity('http://127.0.0.1:7892', {
    fetchImpl: async (_url, init) => {
      sawDispatcher = init?.dispatcher != null;
      return {
        status: 403,
        body: { cancel: async () => {} },
      } as never;
    },
  });
  assert.equal(sawDispatcher, true);
  assert.equal(ok, true);
});

test('probeChatGptConnectivity treats HTTP response as connected without proxy', async () => {
  const ok = await probeChatGptConnectivity(undefined, {
    fetchImpl: async () =>
      ({
        status: 200,
        body: { cancel: async () => {} },
      }) as never,
  });
  assert.equal(ok, true);
});

test('probeChatGptConnectivity returns false on network error', async () => {
  const ok = await probeChatGptConnectivity(undefined, {
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(ok, false);
});

test('checkChatGptConnectivity succeeds when probe passes', async () => {
  await checkChatGptConnectivity('/tmp/project', {
    probe: async () => true,
  });
});

test('checkChatGptConnectivity throws when probe fails', async () => {
  await assert.rejects(
    () =>
      checkChatGptConnectivity('/tmp/project', {
        probe: async () => false,
      }),
    (err: unknown) => {
      assert.ok(err instanceof MrcxError);
      assert.ok(err.message.includes(CHATGPT_CONNECTIVITY_URL));
      return true;
    },
  );
});

test('checkChatGptConnectivity error includes proxy when settings has proxy', async () => {
  withGlobalDir(() => {
    saveGlobalSettings({ proxy: { url: 'http://127.0.0.1:7892' } });
    return assert.rejects(
      () =>
        checkChatGptConnectivity('/tmp/project', {
          probe: async (proxyUrl) => {
            assert.equal(proxyUrl, 'http://127.0.0.1:7892');
            return false;
          },
        }),
      (err: unknown) => {
        assert.ok(err instanceof MrcxError);
        assert.ok(err.message.includes('chatgpt.com'));
        assert.ok(err.message.includes('Proxy: http://127.0.0.1:7892'));
        return true;
      },
    );
  });
});

test('checkChatGptConnectivity prefers CLI --proxy over global settings', async () => {
  withGlobalDir(() => {
    saveGlobalSettings({ proxy: { url: 'http://127.0.0.1:7892' } });
    setCliProxyOverride('http://127.0.0.1:9999');
    try {
      return assert.rejects(
        () =>
          checkChatGptConnectivity('/tmp/project', {
            probe: async (proxyUrl) => {
              assert.equal(proxyUrl, 'http://127.0.0.1:9999');
              return false;
            },
          }),
        (err: unknown) => {
          assert.ok(err instanceof MrcxError);
          assert.ok(err.message.includes('Proxy: http://127.0.0.1:9999'));
          return true;
        },
      );
    } finally {
      setCliProxyOverride(undefined);
    }
  });
});
