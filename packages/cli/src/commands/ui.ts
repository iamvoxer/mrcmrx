import type { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startUiServer } from '@mrcx/server';
import fs from 'node:fs';

export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('Start local Web UI (HTTP server + browser)')
    .option('--host <host>', 'Listen address', '127.0.0.1')
    .option('--port <port>', 'Port (auto-selected by default)')
    .option('--no-open', 'Do not open browser automatically')
    .action(async (opts: { host: string; port?: string; open: boolean }) => {
      const here = path.dirname(fileURLToPath(import.meta.url));
      // dist/commands/ui.js → four levels up is repo root
      const repoRoot = path.resolve(here, '../../../..');
      const webDist = path.join(repoRoot, 'packages', 'web', 'dist');

      if (!fs.existsSync(webDist)) {
        console.error(`Web not built: ${webDist}\nRun first: npm run build`);
        process.exit(1);
      }

      const port = opts.port ? Number(opts.port) : undefined;
      const { url } = await startUiServer({
        host: opts.host,
        port: Number.isFinite(port) ? port : undefined,
        openBrowser: opts.open,
        webDistPath: webDist,
      });

      console.log(`Press Ctrl+C to stop. ${url}`);

      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => resolve());
        process.on('SIGTERM', () => resolve());
      });
    });
}
