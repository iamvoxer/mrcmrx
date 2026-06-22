import { splitCsv } from './resolve-codex-bin.mjs';

/**
 * Build argv for spawning Codex: prefix + top-level -a + exec subcommand args.
 * `-a` must come before `exec` (top-level codex flag, not exec subcommand).
 */
export function buildCodexSpawnArgs(prefix, env = process.env, cwd = process.cwd()) {
  const args = [
    ...prefix,
    '-a',
    env.MRCX_CODEX_APPROVAL ?? 'never',
    'exec',
    '--sandbox',
    env.MRCX_CODEX_SANDBOX ?? 'read-only',
    '-C',
    cwd,
    ...splitCsv(env.MRCX_CODEX_EXTRA_ARGS ?? ''),
  ];

  if (env.MRCX_CODEX_EPHEMERAL === '1') {
    args.push('--ephemeral');
  }
  if (env.MRCX_CODEX_MODEL) {
    args.push('-m', env.MRCX_CODEX_MODEL);
  }

  args.push('-');
  return args;
}
