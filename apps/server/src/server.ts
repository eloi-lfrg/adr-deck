import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { Workspace } from './workspace.ts';

export interface StartServerOptions {
  /** Decisions directory (see `resolveDecisionsDir`). */
  dir: string;
  /** Name shown in the UI and on the docx export. */
  title: string;
  port: number;
  host: string;
  /** MADR files copied into `dir` when it holds none. */
  seedDir?: string;
  backupDir?: string;
  /** Directory of the built front; when set, the server also serves the web app. */
  webDist?: string;
  /** Refuses every write (see `createApp`). */
  readOnly?: boolean;
}

export interface RunningServer {
  url: string;
  workspace: Workspace;
  close: () => Promise<void>;
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const workspace = new Workspace(options.dir, options.backupDir === undefined ? {} : { backupDir: options.backupDir });
  await workspace.init(options.seedDir);
  workspace.on('error', (error: Error) => {
    process.stderr.write(`[watch] ${error.message}\n`);
  });

  const app = createApp({ workspace, title: options.title, readOnly: options.readOnly ?? false });
  if (options.webDist !== undefined) {
    const webDist = options.webDist;
    const indexHtml = await readFile(join(webDist, 'index.html'), 'utf8');
    app.use('/*', serveStatic({ root: webDist }));
    app.get('*', (c) => c.html(indexHtml));
  }

  let server: ReturnType<typeof serve> | undefined;
  const port = await new Promise<number>((resolvePort, reject) => {
    server = serve({ fetch: app.fetch, port: options.port, hostname: options.host }, (info) => {
      server?.off('error', reject);
      resolvePort(info.port);
    });
    server.once('error', reject);
  });
  const httpServer = server!;

  workspace.startWatching();
  return {
    url: `http://${options.host.includes(':') ? `[${options.host}]` : options.host}:${port}`,
    workspace,
    close: async () => {
      workspace.stopWatching();
      await new Promise<void>((resolveClose, rejectClose) => {
        httpServer.close((error) => (error ? rejectClose(error) : resolveClose()));
        // Open SSE streams (/api/events) never end on their own: without this, close() waits forever.
        if ('closeAllConnections' in httpServer) httpServer.closeAllConnections();
      });
    },
  };
}
