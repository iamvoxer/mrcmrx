import { spawn } from 'node:child_process';
import type { AgentRunResult } from '../types.js';
import { buildSpawnEnvWithMeta } from '../config/settings.js';
import { resolveCodexInvocation } from './codex-bin.js';
import type { AgentInvocation } from './run-detail.js';
import { BRIEF_REPLY, X_DEFAULT_GUIDANCE, X_WRITE_GUIDANCE } from './prompts.js';

export interface CodexCallOptions {
  allowWrite?: boolean;
  timeoutMs?: number;
  extraReadableDirs?: string[];
  /** Called when Codex JSONL yields new content (for UI streaming). */
  onProgress?: (displayText: string) => void;
}

/** Default Codex subprocess timeout: 1 hour (override with MRCX_CODEX_TIMEOUT_MS). */
export const DEFAULT_CODEX_TIMEOUT_MS = 3_600_000;

interface CodexJsonEvent {
  type?: string;
  thread_id?: string;
  message?: string;
  item?: { type?: string; text?: string };
}

function parseJsonl(text: string): CodexJsonEvent[] {
  const events: CodexJsonEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as CodexJsonEvent);
    } catch {
      /* ignore */
    }
  }
  return events;
}

function extractThreadId(events: CodexJsonEvent[]): string | undefined {
  return events.find((e) => e.type === 'thread.started')?.thread_id;
}

/** Extract chat body from Codex JSONL (agent_message only, excludes type:error). */
export function extractCodexChatText(events: CodexJsonEvent[]): string {
  const parts: string[] = [];
  for (const e of events) {
    if (e.type === 'item.completed' && e.item?.type === 'agent_message') {
      const text = e.item.text?.trim();
      if (text) parts.push(text);
    }
  }
  return parts.join('\n\n');
}

/** @deprecated Use extractCodexChatText; alias kept for external references. */
export const extractCodexDisplayText = extractCodexChatText;

/** Incrementally parse Codex stdout JSONL; update display text on each complete line. */
export class CodexJsonlStreamParser {
  private buffer = '';
  private events: CodexJsonEvent[] = [];

  push(chunk: string): string {
    this.buffer += chunk;
    let nl = this.buffer.indexOf('\n');
    while (nl >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) {
        try {
          this.events.push(JSON.parse(line) as CodexJsonEvent);
        } catch {
          /* ignore malformed line */
        }
      }
      nl = this.buffer.indexOf('\n');
    }
    return extractCodexChatText(this.events);
  }
}

function splitCsv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Codex applies to any workspace; skip git repo check by default. */
export function codexExtraArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  const extras = ['--skip-git-repo-check'];
  for (const arg of splitCsv(env.MRCX_CODEX_EXTRA_ARGS)) {
    if (!extras.includes(arg)) extras.push(arg);
  }
  return extras;
}

function codexSandboxArgs(allowWrite: boolean): string[] {
  if (allowWrite) {
    return ['--sandbox', process.env.MRCX_CODEX_SANDBOX_WRITE ?? 'workspace-write'];
  }
  const sandbox = process.env.MRCX_CODEX_SANDBOX?.trim();
  if (sandbox && sandbox !== 'none') {
    return ['--sandbox', sandbox];
  }
  return [];
}

/** --add-dir is a top-level Codex arg and must appear before exec. */
export function codexAddDirArgs(extraReadableDirs: string[] = []): string[] {
  const args: string[] = [];
  for (const dir of extraReadableDirs) {
    args.push('--add-dir', dir);
  }
  return args;
}

/**
 * Optional: when MRCX_CODEX_SANDBOX_PERMISSIONS is set, inject -c sandbox_permissions=...
 * Example: MRCX_CODEX_SANDBOX_PERMISSIONS=["disk-full-read-access"]
 * Probe note: usually unnecessary when --add-dir order is correct; resume + permissions may time out.
 */
export function codexExtraDirConfigArgs(
  extraReadableDirs: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (extraReadableDirs.length === 0) return [];
  const permissions = env.MRCX_CODEX_SANDBOX_PERMISSIONS?.trim();
  if (!permissions) return [];
  return ['-c', `sandbox_permissions=${permissions}`];
}

export function buildCodexCreateArgs(
  projectPath: string,
  allowWrite: boolean,
  extraReadableDirs: string[] = [],
): string[] {
  return [
    '-a',
    process.env.MRCX_CODEX_APPROVAL ?? 'never',
    ...codexExtraDirConfigArgs(extraReadableDirs),
    ...codexAddDirArgs(extraReadableDirs),
    'exec',
    ...codexSandboxArgs(allowWrite),
    '-C',
    projectPath,
    ...codexExtraArgs(),
    '--json',
    '-',
  ];
}

export function buildCodexResumeArgs(
  sessionId: string,
  extraReadableDirs: string[] = [],
): string[] {
  return [
    '-a',
    process.env.MRCX_CODEX_APPROVAL ?? 'never',
    ...codexExtraDirConfigArgs(extraReadableDirs),
    ...codexAddDirArgs(extraReadableDirs),
    'exec',
    'resume',
    ...codexExtraArgs(),
    '--json',
    sessionId,
    '-',
  ];
}

function extraDirsPromptHint(extraReadableDirs: string[]): string {
  if (extraReadableDirs.length === 0) return '';
  return [
    'Extra readable directories (read-only reference; do not modify by default):',
    ...extraReadableDirs.map((d) => `- ${d}`),
  ].join('\n');
}

function wrapCodexPrompt(prompt: string, allowWrite: boolean, extraReadableDirs: string[] = []): string {
  const guidance = allowWrite ? X_WRITE_GUIDANCE : X_DEFAULT_GUIDANCE;
  const extraHint = extraDirsPromptHint(extraReadableDirs);
  const parts = [BRIEF_REPLY, guidance];
  if (extraHint) parts.push(extraHint);
  parts.push(prompt);
  return parts.join('\n\n');
}

function runCodexSpawn(
  args: string[],
  stdin: string,
  cwd: string,
  timeoutMs: number,
  projectPath: string,
  label: string,
  onProgress?: (displayText: string) => void,
): Promise<AgentRunResult> {
  const { bin, prefix } = resolveCodexInvocation(projectPath);
  const fullArgs = [...prefix, ...args];
  const invocation: AgentInvocation = {
    provider: 'codex',
    label,
    bin,
    args: fullArgs,
    cwd,
    stdin,
  };
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const { env, meta } = buildSpawnEnvWithMeta(projectPath);
  const streamParser = onProgress ? new CodexJsonlStreamParser() : null;
  let lastProgress = '';

  return new Promise((resolve) => {
    const child = spawn(bin, fullArgs, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      const chunk = c.toString();
      stdout += chunk;
      if (streamParser && onProgress) {
        const text = streamParser.push(chunk);
        if (text && text !== lastProgress) {
          lastProgress = text;
          onProgress(text);
        }
      }
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdin.write(stdin);
    child.stdin.end();

    child.on('close', (code) => {
      clearTimeout(timer);
      const events = parseJsonl(stdout);
      const text = extractCodexChatText(events) || stdout.trim();
      const endedAt = new Date().toISOString();
      resolve({
        text,
        exitCode: code,
        stderr,
        sessionId: extractThreadId(events),
        timedOut: code === null,
        invocation,
        spawnEnv: meta,
        stdoutRaw: stdout,
        startedAt,
        endedAt,
        durationMs: Date.now() - startMs,
      });
    });
  });
}

/** Create a new Codex thread and return thread_id + reply. */
export async function codexCreateSession(
  projectPath: string,
  prompt: string,
  options: CodexCallOptions = {},
): Promise<AgentRunResult> {
  const allowWrite = options.allowWrite ?? false;
  const extraDirs = options.extraReadableDirs ?? [];
  const args = buildCodexCreateArgs(projectPath, allowWrite, extraDirs);
  return runCodexSpawn(
    args,
    wrapCodexPrompt(prompt, allowWrite, extraDirs),
    projectPath,
    options.timeoutMs ?? (Number(process.env.MRCX_CODEX_TIMEOUT_MS) || DEFAULT_CODEX_TIMEOUT_MS),
    projectPath,
    'codex exec create',
    options.onProgress,
  );
}

/** Resume Codex thread (resume subcommand lacks -C / --sandbox; workspace comes from spawn cwd). */
export async function codexSendMessage(
  projectPath: string,
  sessionId: string,
  prompt: string,
  options: CodexCallOptions = {},
): Promise<AgentRunResult> {
  const allowWrite = options.allowWrite ?? false;
  const extraDirs = options.extraReadableDirs ?? [];
  const args = buildCodexResumeArgs(sessionId, extraDirs);
  return runCodexSpawn(
    args,
    wrapCodexPrompt(prompt, allowWrite, extraDirs),
    projectPath,
    options.timeoutMs ?? (Number(process.env.MRCX_CODEX_TIMEOUT_MS) || DEFAULT_CODEX_TIMEOUT_MS),
    projectPath,
    'codex exec resume',
    options.onProgress,
  );
}
