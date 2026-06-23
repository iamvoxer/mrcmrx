import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  CHATGPT_CONNECTIVITY_URL,
  checkChatGptConnectivity,
  formatChatGptConnectivityError,
  normalizeWindowsProxyServer,
  probeChatGptConnectivity,
  proxyUrlFromEnv,
  resolveProbeProxyUrl,
} from '../agents/chatgpt-connectivity.js';
import { saveSettings } from '../config/settings.js';
import { MrcxError } from '../services/context.js';

test('formatChatGptConnectivityError includes chatgpt.com and proxy', () => {
  const text = formatChatGptConnectivityError('http://127.0.0.1:7892');
  assert.ok(text.includes('chatgpt.com'));
  assert.ok(text.includes('Proxy: http://127.0.0.1:7892'));
});

test('proxyUrlFromEnv prefers HTTPS_PROXY', () => {
  assert.equal(
    proxyUrlFromEnv({ HTTPS_PROXY: 'http://127.0.0.1:7892', HTTP_PROXY: 'http://other' }),
    'http://127.0.0.1:7892',
  );
});

test('normalizeWindowsProxyServer parses host:port and https= forms', () => {
  assert.equal(normalizeWindowsProxyServer('127.0.0.1:7890'), 'http://127.0.0.1:7890');
  assert.equal(
    normalizeWindowsProxyServer('http=127.0.0.1:7890;https=127.0.0.1:7892'),
    'http://127.0.0.1:7892',
  );
});

test('resolveProbeProxyUrl prefers env proxy', () => {
  assert.equal(
    resolveProbeProxyUrl({ HTTPS_PROXY: 'http://127.0.0.1:7892' }),
    'http://127.0.0.1:7892',
  );
});

test('probeChatGptConnectivity uses proxy path when proxy is configured', async () => {
  let viaProxy = false;
  const ok = await probeChatGptConnectivity(
    { HTTPS_PROXY: 'http://127.0.0.1:7892' },
    {
      headDirect: async () => {
        throw new Error('should not call direct');
      },
      headViaProxy: async (_url, proxyUrl) => {
        viaProxy = true;
        assert.equal(proxyUrl, 'http://127.0.0.1:7892');
        return true;
      },
    },
  );
  assert.equal(viaProxy, true);
  assert.equal(ok, true);
});

test('probeChatGptConnectivity treats any HTTP response as connected', async () => {
  const ok = await probeChatGptConnectivity(
    {},
    {
      resolveProxy: () => undefined,
      headDirect: async () => true,
    },
  );
  assert.equal(ok, true);
});

test('probeChatGptConnectivity returns false when request fails', async () => {
  const ok = await probeChatGptConnectivity(
    {},
    {
      resolveProxy: () => undefined,
      headDirect: async () => false,
    },
  );
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcx-conn-'));
  const projectPath = path.join(tmp, 'proj');
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(path.join(projectPath, '.mrcx'), { recursive: true });
  saveSettings(projectPath, { proxy: { url: 'http://127.0.0.1:7892' } });

  await assert.rejects(
    () =>
      checkChatGptConnectivity(projectPath, {
        probe: async (env) => {
          assert.equal(resolveProbeProxyUrl(env), 'http://127.0.0.1:7892');
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
