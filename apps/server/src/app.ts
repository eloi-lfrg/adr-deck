import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { hasErrors, parseCollection, parseMadr } from '@adr/format';
import { exportDocx, isExportLanguage } from '@adr/convert';
import { FileNotFoundError, InvalidNameError, type Workspace, type WorkspaceEvent } from './workspace.ts';

export interface AppOptions {
  workspace: Workspace;
  /** Name shown in the UI and on the docx cover page (usually the launch directory name). */
  title: string;
  /** Keep-alive interval for the SSE stream. */
  heartbeatMs?: number;
  /** Refuses every write (`adr-deck serve`): the files can be read, never changed. */
  readOnly?: boolean;
}

function stripRevision(header: string | undefined): string | null {
  if (!header) return null;
  return header.replace(/^W\//u, '').replace(/^"|"$/gu, '').trim() || null;
}

function contentDisposition(fileName: string): string {
  const ascii = fileName.normalize('NFD').replace(/[^\x20-\x7E]/gu, '').replace(/"/gu, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function docxFileName(title: string): string {
  const stem = title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return `${stem || 'adr'}-decisions.docx`;
}

export function createApp({ workspace, title, heartbeatMs = 25_000, readOnly = false }: AppOptions): Hono {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof FileNotFoundError) return c.json({ error: error.message, code: 'notFound' }, 404);
    if (error instanceof InvalidNameError) return c.json({ error: error.message, code: 'invalidName' }, 400);
    if (error instanceof HTTPException) return c.json({ error: error.message, code: 'badRequest' }, error.status);
    process.stderr.write(`[server] ${error.stack ?? error.message}\n`);
    return c.json({ error: 'Internal server error.', code: 'internal' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, dir: workspace.dir, readOnly }));

  app.get('/api/adrs', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ title, dir: workspace.dir, readOnly, files: await workspace.readAll() });
  });

  // `:name` may hold a category folder: `/api/adrs/backend/0003-x.md`.
  app.get('/api/adrs/:name{.+}', async (c) => {
    const name = c.req.param('name');
    const snapshot = await workspace.read(name);
    c.header('ETag', `"${snapshot.revision}"`);
    c.header('Cache-Control', 'no-store');
    return c.json({ name, ...snapshot });
  });

  app.put('/api/adrs/:name{.+}', async (c) => {
    if (readOnly) return c.json({ error: 'Read-only server: the files cannot be changed.', code: 'readOnly' }, 403);
    const name = c.req.param('name');
    const expected = stripRevision(c.req.header('If-Match'));
    if (expected === null) return c.json({ error: 'If-Match header (revision) required.', code: 'revisionRequired' }, 428);
    const content = await c.req.text();
    const { issues } = parseMadr(content, name);
    if (hasErrors(issues)) return c.json({ error: 'Invalid content, file left unchanged.', code: 'invalidContent', issues }, 422);

    const result = await workspace.write(name, content, expected);
    if (!result.ok) {
      c.header('ETag', `"${result.conflict.revision}"`);
      return c.json({ error: 'The file was modified elsewhere.', code: 'conflict', ...result.conflict }, 409);
    }
    c.header('ETag', `"${result.revision}"`);
    return c.json({ name, revision: result.revision });
  });

  app.get('/api/export/docx', async (c) => {
    const { adrs } = parseCollection(await workspace.readAll());
    if (adrs.length === 0) return c.json({ error: 'No readable ADR in the directory.', code: 'noAdr' }, 422);
    const lang = c.req.query('lang') ?? 'en';
    const buffer = await exportDocx({ title, source: workspace.dir, adrs, now: new Date(), language: isExportLanguage(lang) ? lang : 'en' });
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': contentDisposition(docxFileName(title)),
        'Cache-Control': 'no-store',
      },
    });
  });

  app.get('/api/events', (c: Context) =>
    streamSSE(c, async (stream) => {
      const listener = (event: WorkspaceEvent): void => {
        stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(() => {
          // The client went away; the abort handler below removes the listener.
        });
      };
      workspace.on('event', listener);
      await stream.writeSSE({ event: 'ready', data: JSON.stringify({ type: 'ready' }) });
      const heartbeat = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {
          // Same as above: closing is handled by onAbort.
        });
      }, heartbeatMs);
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          clearInterval(heartbeat);
          workspace.off('event', listener);
          resolve();
        });
      });
    }),
  );

  return app;
}
