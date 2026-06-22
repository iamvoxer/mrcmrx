import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import type { AgentRunResult } from '../types.js';
import { buildSpawnEnvWithMeta } from '../config/settings.js';
import { resolveCursorAgentInvocation } from './cursor-bin.js';
import type { AgentInvocation } from './run-detail.js';
import { C_DEFAULT_GUIDANCE } from './prompts.js';
import { MrcxError } from '../services/context.js';

function parseTimeoutMs(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function killAgentChild(child: ChildProcess): void {
  if (!child.pid) {
    child.kill('SIGKILL');
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  child.kill('SIGKILL');
}

function agentArgs(index: string, subargs: string[]): string[] {
  return [index, ...subargs];
}

function runAgentAsync(
  subargs: string[],
  projectPath: string,
  stdin: string | undefined,
  timeoutMs: number,
  label: string,
): Promise<AgentRunResult> {
  const { node, index } = resolveCursorAgentInvocation(projectPath);
  const fullArgs = agentArgs(index, subargs);
  const invocation: AgentInvocation = {
    provider: 'cursor',
    label,
    bin: node,
    args: fullArgs,
    cwd: projectPath,
    stdin,
  };
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const { env, meta } = buildSpawnEnvWithMeta(projectPath);

  return new Promise((resolve, reject) => {
    const child = spawn(node, fullArgs, {
      cwd: projectPath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });

    const timer = setTimeout(() => {
      killAgentChild(child);
    }, timeoutMs);

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();

    child.on('close', (code) => {
      clearTimeout(timer);
      const endedAt = new Date().toISOString();
      resolve({
        text: stdout.trim(),
        exitCode: code,
        stderr,
        timedOut: code === null,
        invocation,
        spawnEnv: meta,
        stdoutRaw: stdout,
        startedAt,
        endedAt,
        durationMs: Date.now() - startMs,
      });
    });
    child.on('error', reject);
  });
}

export function cursorAgentStatus(projectPath?: string): string {
  const { node, index } = resolveCursorAgentInvocation(projectPath);
  const r = spawnSync(node, agentArgs(index, ['status']), { encoding: 'utf8' });
  return (r.stdout || r.stderr || '').trim();
}

/** create-chat may hang after printing UUID — caller should use short timeout. */
export async function cursorCreateChat(
  projectPath: string,
  timeoutMs = 15_000,
): Promise<{ chatId: string; timedOut: boolean }> {
  const r = await runAgentAsync(
    ['--workspace', projectPath, 'create-chat'],
    projectPath,
    undefined,
    timeoutMs,
    'cursor create-chat',
  );

  if (!r.text.trim() && r.exitCode !== 0 && !r.timedOut) {
    throw new Error(`create-chat failed: ${r.stderr || '(no output)'}`);
  }

  const chatId =
    r.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^[0-9a-f-]{36}$/i.test(l)) ?? null;

  if (!chatId) {
    throw new Error(`create-chat did not return chatId. stderr: ${r.stderr || r.text}`);
  }
  return { chatId, timedOut: r.timedOut ?? false };
}

export async function cursorSendMessage(
  projectPath: string,
  chatId: string,
  prompt: string,
  timeoutMs = parseTimeoutMs('MRCX_CURSOR_TIMEOUT_MS', 600_000),
): Promise<AgentRunResult> {
  const status = cursorAgentStatus(projectPath);
  if (!process.env.CURSOR_API_KEY && /not logged in/i.test(status)) {
    throw new MrcxError('Cursor is not logged in. Run agent login locally, or set CURSOR_API_KEY and restart mrcx ui.');
  }

  const body = `${C_DEFAULT_GUIDANCE}\n\n${prompt}`;
  const run = await runAgentAsync(
    ['--workspace', projectPath, '--resume', chatId, '-p', '--trust', '--force', body],
    projectPath,
    undefined,
    timeoutMs,
    'cursor send-message',
  );
  return run;
}
