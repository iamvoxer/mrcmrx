import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { buildSpawnEnvWithMeta } from '../config/settings.js';
import { MrcxError } from '../services/context.js';

export const CHATGPT_CONNECTIVITY_URL = 'https://chatgpt.com/';
const PROBE_TIMEOUT_MS = 5000;

export type HeadRequestFn = (url: string, timeoutMs: number) => Promise<boolean>;
export type HeadViaProxyFn = (url: string, proxyUrl: string, timeoutMs: number) => Promise<boolean>;

export function proxyUrlFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const httpsProxy = env.HTTPS_PROXY ?? env.https_proxy;
  if (httpsProxy?.trim()) return httpsProxy.trim();
  const httpProxy = env.HTTP_PROXY ?? env.http_proxy;
  if (httpProxy?.trim()) return httpProxy.trim();
  return undefined;
}

/** Normalize Windows Internet Settings ProxyServer value to an http:// URL. */
export function normalizeWindowsProxyServer(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const httpsMatch = text.match(/(?:^|;)\s*https=([^;\s]+)/i);
  if (httpsMatch?.[1]) {
    const host = httpsMatch[1].trim();
    return host.includes('://') ? host : `http://${host}`;
  }
  const first = text.split(';')[0]?.replace(/^(?:https?|socks)=/i, '').trim();
  if (!first || /^socks/i.test(text)) return undefined;
  return first.includes('://') ? first : `http://${first}`;
}

/** Read Windows user Internet Settings proxy (same source browsers often use). */
export function readWindowsSystemProxy(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  try {
    const enableOut = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'],
      { encoding: 'utf8', windowsHide: true },
    );
    if (!/0x1\b/.test(enableOut)) return undefined;
    const serverOut = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'],
      { encoding: 'utf8', windowsHide: true },
    );
    const match = serverOut.match(/ProxyServer\s+REG_SZ\s+(\S.+)$/m);
    if (!match?.[1]) return undefined;
    return normalizeWindowsProxyServer(match[1].trim());
  } catch {
    return undefined;
  }
}

/** Proxy used for the probe: settings/CLI env first, then Windows system proxy. */
export function resolveProbeProxyUrl(env: NodeJS.ProcessEnv): string | undefined {
  return proxyUrlFromEnv(env) ?? readWindowsSystemProxy();
}

export function formatChatGptConnectivityError(proxyUrl?: string): string {
  const lines = [
    `Cannot reach ${CHATGPT_CONNECTIVITY_URL}`,
    'Please check your proxy or network settings.',
  ];
  if (proxyUrl) {
    lines.push('', `Proxy: ${proxyUrl}`);
  }
  return lines.join('\n');
}

export function httpsHeadDirect(url: string, timeoutMs: number): Promise<boolean> {
  const target = new URL(url);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      req.destroy();
      resolve(false);
    }, timeoutMs);
    const req = https.request(
      {
        hostname: target.hostname,
        port: Number(target.port) || 443,
        method: 'HEAD',
        path: target.pathname + target.search,
        timeout: timeoutMs,
      },
      (res) => {
        clearTimeout(timer);
        res.resume();
        resolve(true);
      },
    );
    req.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    req.on('timeout', () => {
      clearTimeout(timer);
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export function httpsHeadViaHttpProxy(url: string, proxyUrl: string, timeoutMs: number): Promise<boolean> {
  const target = new URL(url);
  const proxy = new URL(proxyUrl);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      connectReq.destroy();
      resolve(false);
    }, timeoutMs);

    const connectReq = http.request({
      hostname: proxy.hostname,
      port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      timeout: timeoutMs,
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
        return;
      }
      const req = https.request(
        {
          hostname: target.hostname,
          port: Number(target.port) || 443,
          method: 'HEAD',
          path: target.pathname + target.search,
          socket,
          servername: target.hostname,
          timeout: timeoutMs,
        } as https.RequestOptions,
        (headRes) => {
          clearTimeout(timer);
          headRes.resume();
          resolve(true);
        },
      );
      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      req.on('timeout', () => {
        clearTimeout(timer);
        req.destroy();
        resolve(false);
      });
      req.end();
    });

    connectReq.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    connectReq.on('timeout', () => {
      clearTimeout(timer);
      connectReq.destroy();
      resolve(false);
    });
    connectReq.end();
  });
}

export async function probeChatGptConnectivity(
  env: NodeJS.ProcessEnv,
  options: {
    resolveProxy?: (env: NodeJS.ProcessEnv) => string | undefined;
    headDirect?: HeadRequestFn;
    headViaProxy?: HeadViaProxyFn;
  } = {},
): Promise<boolean> {
  const resolveProxy = options.resolveProxy ?? resolveProbeProxyUrl;
  const headDirect = options.headDirect ?? httpsHeadDirect;
  const headViaProxy = options.headViaProxy ?? httpsHeadViaHttpProxy;
  const proxyUrl = resolveProxy(env);
  if (proxyUrl) {
    return headViaProxy(CHATGPT_CONNECTIVITY_URL, proxyUrl, PROBE_TIMEOUT_MS);
  }
  return headDirect(CHATGPT_CONNECTIVITY_URL, PROBE_TIMEOUT_MS);
}

export interface ChatGptConnectivityOptions {
  /** @internal Override network probe (tests). */
  probe?: (env: NodeJS.ProcessEnv) => Promise<boolean>;
}

export async function checkChatGptConnectivity(
  projectPath: string,
  options: ChatGptConnectivityOptions = {},
): Promise<void> {
  const { env } = buildSpawnEnvWithMeta(projectPath);
  const proxyUrl = resolveProbeProxyUrl(env);
  const probe = options.probe ?? probeChatGptConnectivity;
  const ok = await probe(env);
  if (!ok) {
    throw new MrcxError(formatChatGptConnectivityError(proxyUrl));
  }
}
