const MAX_TEXT = 512_000;

export interface AgentInvocation {
  provider: 'codex' | 'cursor';
  label: string;
  bin: string;
  args: string[];
  cwd: string;
  stdin?: string;
}

export interface AgentRunDetail {
  id: string;
  provider: 'codex' | 'cursor';
  label: string;
  command: string;
  bin: string;
  args: string[];
  cwd: string;
  stdin?: string;
  rgPath?: string | null;
  pathPrefix?: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  sessionId?: string;
  chatId?: string;
}

function quoteArg(arg: string): string {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

export function formatAgentCommand(bin: string, args: string[]): string {
  return [quoteArg(bin), ...args.map(quoteArg)].join(' ');
}

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_TEXT)}\n\n… (truncated, ${text.length} characters total)`,
    truncated: true,
  };
}

export function buildRunDetail(
  messageId: string,
  run: {
    invocation?: AgentInvocation;
    spawnEnv?: { rgPath?: string | null; pathPrefix?: string[] };
    stdoutRaw?: string;
    text: string;
    stderr: string;
    exitCode: number | null;
    timedOut?: boolean;
    sessionId?: string;
    chatId?: string;
    startedAt?: string;
    endedAt?: string;
    durationMs?: number;
  },
): AgentRunDetail | null {
  const inv = run.invocation;
  if (!inv) return null;

  const stdoutRaw = run.stdoutRaw ?? run.text;
  const stdout = truncateText(stdoutRaw);
  const stderr = truncateText(run.stderr);
  const startedAt = run.startedAt ?? new Date().toISOString();
  const endedAt = run.endedAt ?? startedAt;

  return {
    id: messageId,
    provider: inv.provider,
    label: inv.label,
    command: formatAgentCommand(inv.bin, inv.args),
    bin: inv.bin,
    args: inv.args,
    cwd: inv.cwd,
    stdin: inv.stdin,
    rgPath: run.spawnEnv?.rgPath ?? null,
    pathPrefix: run.spawnEnv?.pathPrefix,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    sessionId: run.sessionId,
    chatId: run.chatId,
    startedAt,
    endedAt,
    durationMs: run.durationMs ?? 0,
  };
}
