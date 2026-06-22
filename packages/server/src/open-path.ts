import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/** Open a directory in the local file manager (called by the browser via local server). */
export async function openPathInExplorer(rawPath: string): Promise<void> {
  const resolved = path.resolve(rawPath.trim());
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  if (process.platform === 'win32') {
    // explorer.exe often returns non-zero when opening a folder, but it still opens; do not wait for exit.
    await spawnDetached('explorer.exe', [resolved]);
    return;
  }
  if (process.platform === 'darwin') {
    await spawnDetached('open', [resolved]);
    return;
  }
  await spawnDetached('xdg-open', [resolved]);
}
