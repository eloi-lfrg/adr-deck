import { EXAMPLES_DIR, loadConfig, WEB_DIST } from './config.ts';
import { startServer } from './server.ts';
import { resolveDecisionsDir } from './workspace.ts';

const config = loadConfig();
const dir = await resolveDecisionsDir(config.root);
const server = await startServer({
  dir,
  title: config.title,
  port: config.port,
  host: config.host,
  seedDir: EXAMPLES_DIR,
  ...(config.serveStatic ? { webDist: WEB_DIST } : {}),
});
process.stdout.write(`adr-deck — API on ${server.url} — decisions: ${dir}\n`);

const shutdown = (): void => {
  server.close().then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(`Error while stopping the server: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
