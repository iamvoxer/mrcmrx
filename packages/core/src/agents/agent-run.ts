import type { AgentRunResult } from '../types.js';
import { MrcxError } from '../services/context.js';

export function formatAgentRunFailure(label: string, run: AgentRunResult): string {
  if (run.timedOut) {
    const detail = run.stderr.trim() || run.text.trim().slice(0, 300);
    const hint = label.startsWith('Cursor')
      ? ' (extend Cursor wait time via MRCX_CURSOR_TIMEOUT_MS)'
      : label.startsWith('Codex')
        ? ' (extend Codex wait time via MRCX_CODEX_TIMEOUT_MS)'
        : '';
    return detail
      ? `${label} timed out${hint}: ${detail}`
      : `${label} timed out${hint}`;
  }
  if (run.exitCode !== 0 && run.exitCode != null) {
    const detail = run.stderr.trim() || run.text.slice(0, 200);
    return `${label} failed (exit ${run.exitCode})${detail ? `: ${detail}` : ''}`;
  }
  if (!run.text.trim()) {
    return `${label} returned no reply body`;
  }
  return `${label} failed`;
}

export function assertAgentRunOk(label: string, run: AgentRunResult): void {
  if (run.timedOut || run.exitCode !== 0 || !run.text.trim()) {
    throw new MrcxError(formatAgentRunFailure(label, run));
  }
}
