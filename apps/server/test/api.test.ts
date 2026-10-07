import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyDecision } from '@adr/format';
import { createApp } from '../src/app.ts';
import { EXAMPLES_DIR } from '../src/config.ts';
import { MAX_BACKUPS, resolveDecisionsDir, Workspace, type WorkspaceEvent } from '../src/workspace.ts';

const NAME = '0002-cache-http.md';

let dir: string;
let backups: string;
let workspace: Workspace;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'adr-server-'));
  backups = await mkdtemp(join(tmpdir(), 'adr-backups-'));
  workspace = new Workspace(dir, { backupDir: backups });
  await workspace.init(EXAMPLES_DIR);
  app = createApp({ workspace, title: 'Projet' });
});

afterEach(async () => {
  workspace.stopWatching();
  await rm(dir, { recursive: true, force: true });
  await rm(backups, { recursive: true, force: true });
});

interface FileResponse {
  content: string;
  revision: string;
}

async function getFile(): Promise<FileResponse> {
  const response = await app.request(`/api/adrs/${NAME}`);
  expect(response.status).toBe(200);
  return (await response.json()) as FileResponse;
}

function decided(content: string, comment: string): string {
  return applyDecision(content, NAME, { status: 'refusée', retained: [], comment, nextReview: null, replacedBy: null }, new Date());
}

describe('decisions directory', () => {
  it('prefers the launch directory, then docs/decisions and docs/adr', async () => {
    const root = await mkdtemp(join(tmpdir(), 'adr-root-'));
    try {
      expect(await resolveDecisionsDir(root)).toBe(root);
      await mkdir(join(root, 'docs/adr'), { recursive: true });
      await writeFile(join(root, 'docs/adr/0001-a.md'), '# A\n');
      expect(await resolveDecisionsDir(root)).toBe(join(root, 'docs/adr'));
      await mkdir(join(root, 'docs/decisions'), { recursive: true });
      await writeFile(join(root, 'docs/decisions/0001-a.md'), '# A\n');
      expect(await resolveDecisionsDir(root)).toBe(join(root, 'docs/decisions'));
      await writeFile(join(root, '0001-a.md'), '# A\n');
      expect(await resolveDecisionsDir(root)).toBe(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('ADR API', () => {
  it('lists every MADR file with its content and revision', async () => {
    await writeFile(join(dir, 'README.md'), '# Pas une ADR\n');
    const response = await app.request('/api/adrs');
    const body = (await response.json()) as { title: string; dir: string; files: { name: string; revision: string }[] };
    expect(body.title).toBe('Projet');
    expect(body.dir).toBe(dir);
    expect(body.files.map((file) => file.name)).toEqual([
      '0001-file-de-messages.md',
      '0002-cache-http.md',
      '0003-authentification.md',
      '0004-monorepo.md',
      '0005-observabilite.md',
      '0006-identifiants.md',
      '0007-orm.md',
      '0008-drizzle.md',
      '0009-ie11.md',
      '0010-revue-avec-adr-deck.md',
      '0011-typescript-strict.md',
      '0012-deploiement-continu.md',
      '0013-feature-flags-maison.md',
      '0014-api-graphql.md',
      '0015-api-rest-openapi.md',
    ]);
  });

  it('writes with a matching revision and keeps a backup outside the directory', async () => {
    const { content, revision } = await getFile();
    const next = decided(content, 'ok');
    const response = await app.request(`/api/adrs/${NAME}`, { method: 'PUT', headers: { 'If-Match': `"${revision}"` }, body: next });
    expect(response.status).toBe(200);
    expect(await readFile(join(dir, NAME), 'utf8')).toBe(next);
    expect(await readdir(backups)).toHaveLength(1);
    expect((await readdir(dir)).filter((file) => !file.endsWith('.md'))).toEqual([]);
  });

  it('answers 409 with the current content when the revision is stale', async () => {
    const { content, revision } = await getFile();
    await writeFile(join(dir, NAME), decided(content, 'external'), 'utf8');
    const response = await app.request(`/api/adrs/${NAME}`, { method: 'PUT', headers: { 'If-Match': revision }, body: decided(content, 'mine') });
    expect(response.status).toBe(409);
    const body = (await response.json()) as FileResponse;
    expect(body.content).toContain('because external.');
  });

  it('refuses invalid content and missing revisions', async () => {
    const { revision } = await getFile();
    const invalid = await app.request(`/api/adrs/${NAME}`, { method: 'PUT', headers: { 'If-Match': revision }, body: 'pas de titre' });
    expect(invalid.status).toBe(422);
    const missing = await app.request(`/api/adrs/${NAME}`, { method: 'PUT', body: 'x' });
    expect(missing.status).toBe(428);
  });

  it('keeps only the last backups', async () => {
    let { content, revision } = await getFile();
    for (let index = 0; index < MAX_BACKUPS + 3; index++) {
      content = decided(content, `n${index}`);
      const response = await app.request(`/api/adrs/${NAME}`, { method: 'PUT', headers: { 'If-Match': revision }, body: content });
      revision = ((await response.json()) as FileResponse).revision;
    }
    expect(await readdir(backups)).toHaveLength(MAX_BACKUPS);
  });

  it('rejects path traversal and non-MADR names', async () => {
    expect((await app.request(`/api/adrs/${encodeURIComponent('../0001-secret.md')}`)).status).toBe(400);
    expect((await app.request('/api/adrs/README.md')).status).toBe(400);
    expect((await app.request('/api/adrs/0099-absent.md')).status).toBe(404);
  });
});

describe('docx export', () => {
  it('builds a docx from the directory without writing into it', async () => {
    const before = await readdir(dir);
    const response = await app.request('/api/export/docx');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('wordprocessingml');
    expect(response.headers.get('Content-Disposition')).toContain('projet-decisions.docx');
    expect(await readdir(dir)).toEqual(before);
  });

  it('answers errors with an English message and a code', async () => {
    const response = await app.request('/api/adrs/0099-absent.md');
    expect(await response.json()).toEqual({ error: 'File not found: 0099-absent.md', code: 'notFound' });
  });
});

describe('watcher', () => {
  it('reports external changes but not its own writes', async () => {
    const events: WorkspaceEvent[] = [];
    workspace.on('event', (event) => events.push(event));
    workspace.startWatching(200);

    const { content, revision } = await getFile();
    await app.request(`/api/adrs/${NAME}`, { method: 'PUT', headers: { 'If-Match': revision }, body: decided(content, 'own') });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(events.filter((event) => event.type === 'changed')).toEqual([]);

    await writeFile(join(dir, NAME), decided(content, 'external'), 'utf8');
    await expect.poll(() => events.filter((event) => event.type === 'changed').length, { timeout: 2000 }).toBe(1);
  });

  it('reports new files', async () => {
    const events: WorkspaceEvent[] = [];
    workspace.on('event', (event) => events.push(event));
    workspace.startWatching(200);
    await writeFile(join(dir, '0010-nouvelle.md'), '# Nouvelle\n');
    await expect.poll(() => events.some((event) => event.type === 'files'), { timeout: 2000 }).toBe(true);
  });
});
