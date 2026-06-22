#!/usr/bin/env node
/**
 * Resolve Cursor Agent CLI (cursor-agent) node.exe + index.js on Windows.
 * The top-level agent.ps1 shim may fail when version folder names do not match
 * its YYYY.MM.DD-<hash> regex (e.g. 2026.06.16-20-30-07-a07d3ac).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveCursorAgentInvocation() {
  const base = path.join(os.homedir(), 'AppData', 'Local', 'cursor-agent');
  const versionsDir = path.join(base, 'versions');
  if (!fs.existsSync(versionsDir)) {
    throw new Error(`cursor-agent not found: ${versionsDir} (run: irm 'https://cursor.com/install?win32=true' | iex)`);
  }

  const dirs = fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const name of dirs) {
    const root = path.join(versionsDir, name);
    const node = path.join(root, 'node.exe');
    const index = path.join(root, 'index.js');
    if (fs.existsSync(node) && fs.existsSync(index)) {
      return { node, index, version: name, source: 'local-appdata' };
    }
  }

  throw new Error(`No cursor-agent version with node.exe/index.js under ${versionsDir}`);
}
