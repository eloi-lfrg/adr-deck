import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const EXAMPLES_DIR = resolve(REPO_ROOT, 'examples/decisions');
export const WEB_DIST = resolve(REPO_ROOT, 'apps/web/dist');

export interface ServerConfig {
  /** Directory the decisions are looked for in (see `resolveDecisionsDir`). */
  root: string;
  title: string;
  port: number;
  host: string;
  serveStatic: boolean;
}

/** Relative `ADR_WORKSPACE` values are resolved from the directory the command was launched in. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const launchDir = env['INIT_CWD'] ?? REPO_ROOT;
  const raw = env['ADR_WORKSPACE'];
  const root = raw === undefined || raw === '' ? resolve(REPO_ROOT, 'workspace') : isAbsolute(raw) ? raw : resolve(launchDir, raw);
  const port = Number(env['ADR_PORT'] ?? 8787);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid ADR_PORT: ${env['ADR_PORT'] ?? ''}`);
  return {
    root,
    title: env['ADR_TITLE'] || basename(root),
    port,
    host: env['ADR_HOST'] ?? '127.0.0.1',
    serveStatic: env['NODE_ENV'] === 'production',
  };
}
