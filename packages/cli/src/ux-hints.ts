import path from 'node:path';

function pathsEqual(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** After room create: if cwd ≠ projectPath, emphasize cd or -p. */
export function formatRoomCreatePathHint(projectPath: string): string {
  const cwd = process.cwd();
  const resolved = path.resolve(projectPath);
  if (pathsEqual(cwd, resolved)) {
    return [
      '',
      'Tip: run subsequent commands from this directory.',
      `  From elsewhere, cd ${resolved}  or add -p ${resolved} to each command`,
    ].join('\n');
  }
  return [
    '',
    '⚠ Important: Room was created in a different directory; cwd does not match this Room',
    `  Current directory (cwd): ${cwd}`,
    `  Room working directory:  ${resolved}`,
    '',
    '  For stage / x / forward / status, choose one:',
    `    1) cd ${resolved}`,
    `    2) add -p ${resolved} to each command`,
    '',
  '  Examples:',
  `    cd ${resolved}`,
  `    node <repo>/packages/cli/dist/index.js stage create "Requirements" "Stage goal description" --path=${resolved}`,
  '',
  '  Or (from repo root, with --path= on each command):',
  `    npm run mrcx -- stage create "Requirements" "Stage goal description" --path=${resolved}`,
  '',
  '  Note: after cd into a subdirectory, npm run --prefix <repo> still leaves Node cwd at the repo root;',
  '  use --path= or invoke the CLI directly with node.',
    '',
    '  Configure proxy in the same directory:',
    `    npm run mrcx -- config proxy set http://127.0.0.1:7892 -p ${resolved}`,
  ].join('\n');
}

/** status: warning when cwd differs from Room.projectPath. */
export function formatCwdMismatchWarning(cwd: string, roomProjectPath: string, mrcxIndexPath: string): string {
  return [
    '',
    '⚠ Current working directory does not match Room project path',
    `  Current directory (cwd): ${cwd}`,
    `  Room.projectPath:        ${roomProjectPath}`,
    `  Context loaded from:     ${mrcxIndexPath}\\.mrcx\\context.json`,
    '',
    '  You may be operating on the wrong Room. Choose one:',
    `    cd ${roomProjectPath}`,
    `    or add -p ${roomProjectPath} to each command`,
  ].join('\n');
}
