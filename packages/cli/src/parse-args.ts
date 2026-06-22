import { MrcxError } from '@mrcx/core';

/** npm on Windows often swallows short flags (e.g. -p); use positional or --path= as fallback. */
export function resolveProjectPathArg(
  optsPath: string | undefined,
  positionalPath: string | undefined,
  fallbackCwd = process.cwd(),
): string {
  return optsPath ?? positionalPath ?? fallbackCwd;
}

export function parsePathAndRestName(args: string[], optsPath?: string): { path: string; name: string } {
  if (optsPath) {
    if (args.length === 0) {
      throw new MrcxError('Room name required. Usage: mrcx room create --path=<dir> "Name"');
    }
    return { path: optsPath, name: args.join(' ') };
  }
  if (args.length >= 2) {
    return { path: args[0], name: args.slice(1).join(' ') };
  }
  if (args.length === 1) {
    return { path: process.cwd(), name: args[0] };
  }
  throw new MrcxError(
    'Usage: mrcx room create <path> "Name"\n' +
      '  or: mrcx room create "Name" --path=<dir>\n' +
      '  On Windows, if npm swallows -p, use positional path or --path=C:\\\\your\\\\project',
  );
}

export function parseOptionalContentFlag(
  optsContent: string | undefined,
  positionalContent: string | undefined,
): string {
  return optsContent ?? positionalContent ?? '';
}

/** When npm swallows --last / --note: positional is `<last> <note...>` or `<note...>` only */
export function parseForwardArgs(
  args: string[],
  opts: { last?: string; note?: string },
  defaultLast = 1,
): { last: number; note?: string } {
  let last = opts.last != null ? Number(opts.last) : defaultLast;
  let note = opts.note?.trim() || undefined;

  if (args.length === 0) {
    return { last: last || defaultLast, note };
  }

  const maybeN = Number(args[0]);
  const firstIsInt = args[0].trim() !== '' && Number.isInteger(maybeN) && String(maybeN) === args[0].trim();

  if (firstIsInt) {
    last = maybeN;
    if (!note && args.length > 1) {
      note = args.slice(1).join(' ').trim() || undefined;
    }
  } else if (!note) {
    note = args.join(' ').trim() || undefined;
  }

  return { last: last > 0 ? last : defaultLast, note };
}

/** c-to-x: trailing positional token +diff / diff is treated as --diff */
export function parseForwardCToXArgs(
  args: string[],
  opts: { last?: string; note?: string; diff?: boolean },
): { last: number; note?: string; includeDiff: boolean } {
  const tokens = [...args];
  let includeDiff = opts.diff ?? false;

  if (tokens.length > 0) {
    const lastTok = tokens[tokens.length - 1]?.toLowerCase();
    if (lastTok === '+diff' || lastTok === 'diff' || lastTok === '--diff') {
      includeDiff = true;
      tokens.pop();
    }
  }

  const parsed = parseForwardArgs(tokens, opts);
  return { ...parsed, includeDiff };
}
