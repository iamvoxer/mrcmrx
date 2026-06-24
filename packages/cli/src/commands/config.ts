import type { Command } from 'commander';
import {
  clearProxy,
  clearCursorAgentPath,
  clearCodexPath,
  clearRgPath,
  detectCodexPath,
  detectCursorAgentPath,
  detectRgPath,
  globalSettingsPath,
  loadGlobalSettings,
  MrcxError,
  resolveCodexInvocation,
  resolveCursorAgentInvocation,
  resolveRgInvocation,
  setCursorAgentPath,
  setCodexPath,
  setRgPath,
  setProxyUrl,
} from '@mrcx/core';

function handleError(err: unknown): never {
  if (err instanceof MrcxError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('User-level tool settings (stored in ~/.mrcx/settings.json)');

  const proxy = config.command('proxy').description('HTTP/HTTPS proxy (inherited by Codex and other child processes)');

  proxy
    .command('set')
    .description('Set proxy URL, e.g. http://127.0.0.1:7892')
    .argument('[url]', 'Proxy URL (positional fallback when npm swallows args)')
    .action((urlPos: string | undefined) => {
      try {
        const url = urlPos?.trim();
        if (!url) {
          throw new MrcxError('Usage: mrcx config proxy set <url>\n  Example: mrcx config proxy set http://127.0.0.1:7892');
        }
        setProxyUrl(url);
        console.log(`Proxy set: ${url}`);
        console.log(`  File: ${globalSettingsPath()}`);
        console.log('');
        console.log('Saved to user settings. Codex / Cursor child processes use this proxy only (shell HTTP_PROXY is ignored).');
        console.log('One-off override for this run: mrcx --proxy=<url> ...');
      } catch (e) {
        handleError(e);
      }
    });

  proxy
    .command('show')
    .description('Show current proxy settings')
    .action(() => {
      try {
        const settings = loadGlobalSettings();
        const p = settings.proxy;
        console.log(`File: ${globalSettingsPath()}`);
        if (!p?.url && !p?.http && !p?.https) {
          console.log('(no proxy configured)');
          console.log('');
          console.log('Set: mrcx config proxy set http://127.0.0.1:7892');
          return;
        }
        if (p.url) console.log(`  url:   ${p.url}`);
        if (p.http) console.log(`  http:  ${p.http}`);
        if (p.https) console.log(`  https: ${p.https}`);
      } catch (e) {
        handleError(e);
      }
    });

  proxy
    .command('clear')
    .description('Clear proxy settings')
    .action(() => {
      try {
        clearProxy();
        console.log(`Proxy cleared: ${globalSettingsPath()}`);
      } catch (e) {
        handleError(e);
      }
    });

  const cursor = config.command('cursor').description('Cursor Agent executable path (Mr C child process)');

  cursor
    .command('set')
    .description('Set Cursor Agent path (node.exe, index.js, or version directory)')
    .argument('<agentPath>', 'Full path')
    .action((agentPath: string) => {
      try {
        setCursorAgentPath(agentPath);
        const inv = resolveCursorAgentInvocation();
        console.log(`Cursor Agent set: ${agentPath}`);
        console.log(`  Invocation: ${inv.node} ${inv.index}`);
        console.log(`  Source: ${inv.source}`);
        console.log(`  File: ${globalSettingsPath()}`);
      } catch (e) {
        handleError(e);
      }
    });

  cursor
    .command('show')
    .description('Show Cursor Agent settings and resolved path')
    .action(() => {
      try {
        const settings = loadGlobalSettings();
        console.log(`File: ${globalSettingsPath()}`);
        if (settings.cursorAgent?.path) {
          console.log(`  Configured path: ${settings.cursorAgent.path}`);
        } else {
          console.log('  (not configured; using auto-detection)');
        }
        const detected = detectCursorAgentPath();
        if (detected) console.log(`  Auto-detected: ${detected}`);
        const inv = resolveCursorAgentInvocation();
        console.log(`  In use: ${inv.node}`);
        console.log(`  index.js: ${inv.index}`);
        console.log(`  Source: ${inv.source}`);
      } catch (e) {
        handleError(e);
      }
    });

  cursor
    .command('clear')
    .description('Clear Cursor Agent path (restore auto-detection)')
    .action(() => {
      try {
        clearCursorAgentPath();
        console.log(`Cursor Agent config cleared: ${globalSettingsPath()}`);
      } catch (e) {
        handleError(e);
      }
    });

  cursor
    .command('detect')
    .description('Show auto-detected Cursor Agent node.exe path')
    .action(() => {
      const detected = detectCursorAgentPath();
      if (!detected) {
        console.log('(cursor-agent not detected)');
        process.exit(1);
      }
      console.log(detected);
    });

  const codex = config.command('codex').description('Codex CLI executable path (Mr X child process)');

  codex
    .command('set')
    .description('Set full path to codex.exe')
    .argument('<codexPath>', 'Full path to codex.exe')
    .action((codexPath: string) => {
      try {
        setCodexPath(codexPath);
        const inv = resolveCodexInvocation();
        console.log(`Codex set: ${codexPath}`);
        console.log(`  Invocation: ${inv.bin}`);
        console.log(`  Source: ${inv.source}`);
        console.log(`  File: ${globalSettingsPath()}`);
      } catch (e) {
        handleError(e);
      }
    });

  codex
    .command('show')
    .description('Show Codex settings and resolved path')
    .action(() => {
      try {
        const settings = loadGlobalSettings();
        console.log(`File: ${globalSettingsPath()}`);
        if (settings.codex?.path) {
          console.log(`  Configured path: ${settings.codex.path}`);
        } else {
          console.log('  (not configured; using auto-detection)');
        }
        const detected = detectCodexPath();
        if (detected) console.log(`  Auto-detected: ${detected}`);
        const inv = resolveCodexInvocation();
        console.log(`  In use: ${inv.bin}`);
        console.log(`  Source: ${inv.source}`);
      } catch (e) {
        handleError(e);
      }
    });

  codex
    .command('clear')
    .description('Clear Codex path (restore auto-detection)')
    .action(() => {
      try {
        clearCodexPath();
        console.log(`Codex config cleared: ${globalSettingsPath()}`);
      } catch (e) {
        handleError(e);
      }
    });

  codex
    .command('detect')
    .description('Show auto-detected codex.exe path')
    .action(() => {
      const detected = detectCodexPath();
      if (!detected) {
        console.log('(codex.exe not detected)');
        process.exit(1);
      }
      console.log(detected);
    });

  const rg = config.command('rg').description('ripgrep executable path (injected into Codex / Cursor child PATH)');

  rg
    .command('set')
    .description('Set full path to rg.exe')
    .argument('<rgPath>', 'Full path to rg.exe')
    .action((rgPath: string) => {
      try {
        setRgPath(rgPath);
        const inv = resolveRgInvocation();
        console.log(`ripgrep set: ${rgPath}`);
        if (inv) {
          console.log(`  Invocation: ${inv.path}`);
          console.log(`  Source: ${inv.source}`);
        }
        console.log(`  File: ${globalSettingsPath()}`);
      } catch (e) {
        handleError(e);
      }
    });

  rg
    .command('show')
    .description('Show ripgrep settings and resolved path')
    .action(() => {
      try {
        const settings = loadGlobalSettings();
        console.log(`File: ${globalSettingsPath()}`);
        if (settings.tools?.rgPath) {
          console.log(`  Configured path: ${settings.tools.rgPath}`);
        } else {
          console.log('  (not configured; rg not injected into child PATH)');
        }
        const detected = detectRgPath();
        if (detected) console.log(`  Auto-detected: ${detected}`);
        const inv = resolveRgInvocation();
        if (inv) {
          console.log(`  In use: ${inv.path}`);
          console.log(`  Source: ${inv.source}`);
        } else {
          console.log('  (rg not resolved)');
        }
      } catch (e) {
        handleError(e);
      }
    });

  rg
    .command('clear')
    .description('Clear ripgrep path settings')
    .action(() => {
      try {
        clearRgPath();
        console.log(`ripgrep config cleared: ${globalSettingsPath()}`);
      } catch (e) {
        handleError(e);
      }
    });

  rg
    .command('detect')
    .description('Show auto-detected rg.exe path')
    .action(() => {
      const detected = detectRgPath();
      if (!detected) {
        console.log('(rg.exe not detected)');
        process.exit(1);
      }
      console.log(detected);
    });
}
