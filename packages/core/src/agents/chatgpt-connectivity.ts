import { fetch, ProxyAgent, type Dispatcher } from 'undici';
import { resolveEffectiveProxyUrl, resolveSettingsProxyUrl } from '../config/settings.js';
import { MrcxError } from '../services/context.js';

export const CHATGPT_CONNECTIVITY_URL = 'https://chatgpt.com/';
const PROBE_TIMEOUT_MS = 12_000;

export { resolveEffectiveProxyUrl, resolveSettingsProxyUrl } from '../config/settings.js';

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

export type UndiciFetch = typeof fetch;

/** True when any HTTP response is received (status code does not matter). */
export function isConnectivityResponse(status: number): boolean {
  return status >= 100 && status < 600;
}

export async function probeChatGptConnectivity(
  proxyUrl: string | undefined,
  options: {
    fetchImpl?: UndiciFetch;
    createProxyAgent?: (proxyUrl: string) => Dispatcher;
  } = {},
): Promise<boolean> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let dispatcher: Dispatcher | undefined;

  try {
    if (proxyUrl) {
      const create = options.createProxyAgent ?? ((url: string) => new ProxyAgent(url));
      dispatcher = create(proxyUrl);
    }
    const res = await doFetch(CHATGPT_CONNECTIVITY_URL, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      dispatcher,
    });
    await res.body?.cancel();
    return isConnectivityResponse(res.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    if (dispatcher && 'close' in dispatcher && typeof dispatcher.close === 'function') {
      await dispatcher.close().catch(() => {});
    }
  }
}

export interface ChatGptConnectivityOptions {
  /** @internal Override network probe (tests). */
  probe?: (proxyUrl: string | undefined) => Promise<boolean>;
}

export async function checkChatGptConnectivity(
  projectPath: string,
  options: ChatGptConnectivityOptions = {},
): Promise<void> {
  const proxyUrl = resolveEffectiveProxyUrl(projectPath);
  const probe = options.probe ?? ((url) => probeChatGptConnectivity(url));
  const ok = await probe(proxyUrl);
  if (!ok) {
    throw new MrcxError(formatChatGptConnectivityError(proxyUrl));
  }
}
