import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function resolveInitial(initialPath?: string): string {
  if (initialPath?.trim()) {
    const resolved = path.resolve(initialPath.trim());
    if (fs.existsSync(resolved)) return resolved;
  }
  return process.cwd();
}

async function pickWindows(initial: string): Promise<string | null> {
  const escaped = initial.replace(/'/g, "''");
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Select project working directory'",
    '$dialog.ShowNewFolderButton = $true',
    `$dialog.SelectedPath = '${escaped}'`,
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  Write-Output $dialog.SelectedPath',
    '}',
  ].join('\n');

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    { windowsHide: false, timeout: 300_000 },
  );
  const selected = stdout.trim();
  return selected || null;
}

async function pickMac(initial: string): Promise<string | null> {
  const escaped = initial.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `POSIX path of (choose folder with prompt "Select project working directory" default location "${escaped}")`;
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 300_000 });
  const selected = stdout.trim();
  return selected || null;
}

async function pickLinux(initial: string): Promise<string | null> {
  const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', `--filename=${initial}/`], {
    timeout: 300_000,
  });
  const selected = stdout.trim();
  return selected || null;
}

/** Open native directory picker; returns null when cancelled. */
export async function pickDirectory(initialPath?: string): Promise<string | null> {
  const initial = resolveInitial(initialPath);

  try {
    if (process.platform === 'win32') return await pickWindows(initial);
    if (process.platform === 'darwin') return await pickMac(initial);
    return await pickLinux(initial);
  } catch {
    return null;
  }
}
