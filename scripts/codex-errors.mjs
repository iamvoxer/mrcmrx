/**
 * Classify Codex wrapper / spawn failures for clearer stderr hints.
 */
export function classifyCodexFailure({
  exitCode,
  stderr = '',
  spawnError = '',
  timedOut = false,
}) {
  const text = `${stderr}\n${spawnError}`.toLowerCase();

  if (timedOut || text.includes('进程超时') || /\btimeout\b/.test(text)) {
    return 'timeout';
  }
  if (
    spawnError.includes('ENOENT') ||
    text.includes('enoent') ||
    text.includes('codex-win32') ||
    text.includes('missing optional dependency')
  ) {
    return 'codex_binary_missing';
  }
  if (
    text.includes('stream disconnected') ||
    text.includes('websocket') ||
    text.includes('connection reset') ||
    text.includes('econnreset')
  ) {
    return 'stream_disconnected';
  }
  if (exitCode !== 0) {
    return 'exit_nonzero';
  }
  return 'ok';
}

const HINTS = {
  timeout:
    '[mrcx-codex-agent] failure type: timeout — Codex did not finish within adapter timeoutMs. Increase agents.x.adapter.timeoutMs (suggested 1800000), or try a shorter prompt first.',
  codex_binary_missing:
    '[mrcx-codex-agent] failure type: codex_binary_missing — Codex executable not found. On Windows use %LOCALAPPDATA%\\OpenAI\\Codex\\bin\\<id>\\codex.exe; run mrcx doctor to verify.',
  stream_disconnected:
    '[mrcx-codex-agent] failure type: stream_disconnected — Codex network/stream interrupted. Check proxy, VPN, firewall; retry mrcx next.',
  exit_nonzero:
    '[mrcx-codex-agent] failure type: exit_nonzero — Codex exited non-zero. See artifacts/runs/*/stderr.txt and Codex logs.',
  unknown:
    '[mrcx-codex-agent] failure type: unknown — See artifacts/runs/*/stderr.txt and meta.json.',
};

export function formatCodexFailureHint(kind) {
  return HINTS[kind] ?? HINTS.unknown;
}
