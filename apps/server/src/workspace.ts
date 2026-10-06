import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isMadrFileName } from '@adr/format';

export const MAX_BACKUPS = 10;

/** Where MADR files are looked for, in order, relative to the launch directory. */
export const DECISIONS_CANDIDATES = ['.', 'docs/decisions', 'docs/adr', 'doc/adr', 'docs/architecture/decisions', 'adr', 'decisions'];

export type WorkspaceEvent = { type: 'changed'; name: string; revision: string } | { type: 'files' };

export interface FileSnapshot {
  content: string;
  revision: string;
}

export type WriteResult = { ok: true; revision: string } | { ok: false; conflict: FileSnapshot };

export class FileNotFoundError extends Error {
  constructor(name: string) {
    super(`File not found: ${name}`);
    this.name = 'FileNotFoundError';
  }
}

export class InvalidNameError extends Error {
  constructor(name: string) {
    super(`Invalid file name: "${name}" (expected NNNN-title.md, without a path).`);
    this.name = 'InvalidNameError';
  }
}

export function revisionOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 20);
}

export function assertValidName(name: string): void {
  if (name !== basename(name) || !isMadrFileName(name) || /[\\/\0]/u.test(name)) throw new InvalidNameError(name);
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function madrNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isMadrFileName(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  } catch (error) {
    if (isNotFound(error) || (error instanceof Error && 'code' in error && error.code === 'ENOTDIR')) return [];
    throw error;
  }
}

/** First candidate directory holding MADR files; the launch directory itself when none does. */
export async function resolveDecisionsDir(root: string): Promise<string> {
  for (const candidate of DECISIONS_CANDIDATES) {
    const dir = resolve(root, candidate);
    if ((await madrNames(dir)).length > 0) return dir;
  }
  return resolve(root);
}

/** Backups live outside the decisions directory (often a git repository), one folder per directory. */
export function defaultBackupDir(dir: string): string {
  const slug = basename(dir).replace(/[^\w.-]+/gu, '-').slice(0, 40) || 'root';
  return join(homedir(), '.adr-deck', 'backups', `${slug}-${createHash('sha256').update(dir).digest('hex').slice(0, 10)}`);
}

export interface WorkspaceOptions {
  /** Defaults to `~/.adr-deck/backups/<directory>-<hash>`. */
  backupDir?: string;
}

/** File access for the decisions directory: atomic writes, revision checks, backups and change events. */
export class Workspace extends EventEmitter<{ event: [WorkspaceEvent]; error: [Error] }> {
  /** Last revision known for each file, so our own writes are not reported as external changes. */
  private readonly known = new Map<string, string>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private watcher: FSWatcher | null = null;
  private poller: NodeJS.Timeout | null = null;
  private listing = '';
  readonly backupDir: string;

  constructor(
    readonly dir: string,
    options: WorkspaceOptions = {},
  ) {
    super();
    this.backupDir = options.backupDir ?? defaultBackupDir(dir);
  }

  /** `seedDir`: MADR files copied when the directory holds none (development and Docker only). */
  async init(seedDir?: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    if (seedDir !== undefined && (await this.listNames()).length === 0) {
      for (const name of await madrNames(seedDir)) await copyFile(join(seedDir, name), join(this.dir, name));
    }
    const names = await this.listNames();
    for (const name of names) this.known.set(name, revisionOf(await readFile(join(this.dir, name), 'utf8')));
    this.listing = names.join('\n');
  }

  path(name: string): string {
    assertValidName(name);
    return join(this.dir, name);
  }

  listNames(): Promise<string[]> {
    return madrNames(this.dir);
  }

  async read(name: string): Promise<FileSnapshot> {
    try {
      const content = await readFile(this.path(name), 'utf8');
      return { content, revision: revisionOf(content) };
    } catch (error) {
      if (isNotFound(error)) throw new FileNotFoundError(name);
      throw error;
    }
  }

  async readAll(): Promise<({ name: string } & FileSnapshot)[]> {
    const names = await this.listNames();
    const files = await Promise.all(
      names.map(async (name) => {
        try {
          return { name, ...(await this.read(name)) };
        } catch (error) {
          // Deleted between the listing and the read: the next `files` event refreshes the client.
          if (error instanceof FileNotFoundError) return null;
          throw error;
        }
      }),
    );
    return files.filter((file): file is { name: string } & FileSnapshot => file !== null);
  }

  /** Serializes operations on the same file. */
  private async withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(name) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(name, settled);
    try {
      return await run;
    } finally {
      if (this.locks.get(name) === settled) this.locks.delete(name);
    }
  }

  private async atomicWrite(name: string, content: string): Promise<string> {
    const target = this.path(name);
    const temp = join(this.dir, `.${name}.${randomBytes(6).toString('hex')}.tmp`);
    const revision = revisionOf(content);
    this.known.set(name, revision);
    try {
      await writeFile(temp, content, 'utf8');
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    return revision;
  }

  private async backup(name: string, content: string): Promise<void> {
    await mkdir(this.backupDir, { recursive: true });
    const stem = name.slice(0, -'.md'.length);
    const stamp = new Date().toISOString().replace(/[-:.]/gu, '');
    await writeFile(join(this.backupDir, `${stem}.${stamp}.md`), content, 'utf8');
    const backups = (await readdir(this.backupDir))
      .filter((file) => file.startsWith(`${stem}.`) && /^\d{8}T\d{9}Z$/u.test(file.slice(stem.length + 1, -'.md'.length)))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) await rm(join(this.backupDir, old), { force: true });
  }

  /** Writes only if the file still has `expectedRevision`; otherwise returns the current content. */
  async write(name: string, content: string, expectedRevision: string): Promise<WriteResult> {
    return this.withLock(name, async () => {
      const current = await this.read(name);
      if (current.revision !== expectedRevision) return { ok: false, conflict: current };
      if (current.content === content) return { ok: true, revision: current.revision };
      await this.backup(name, current.content);
      return { ok: true, revision: await this.atomicWrite(name, content) };
    });
  }

  /** Watches the directory (fs events plus a slow poll, for synced folders such as Google Drive). */
  startWatching(pollMs = 3000): void {
    this.watcher = watch(this.dir, (_event, filename) => {
      if (filename && isMadrFileName(filename)) this.schedule(filename);
    });
    this.watcher.on('error', (error: Error) => {
      this.emit('error', error);
    });
    this.poller = setInterval(() => {
      this.poll().catch((error: unknown) => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      });
    }, pollMs);
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.poller) clearInterval(this.poller);
    this.poller = null;
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }

  private schedule(name: string): void {
    const existing = this.pending.get(name);
    if (existing) clearTimeout(existing);
    this.pending.set(
      name,
      setTimeout(() => {
        this.pending.delete(name);
        this.check(name).catch((error: unknown) => {
          this.emit('error', error instanceof Error ? error : new Error(String(error)));
        });
      }, 120),
    );
  }

  private async poll(): Promise<void> {
    const names = await this.listNames();
    const listing = names.join('\n');
    if (listing !== this.listing) {
      this.listing = listing;
      this.emit('event', { type: 'files' });
    }
    for (const name of names) await this.check(name);
  }

  private async check(name: string): Promise<void> {
    // A write in progress will be checked again by the event its rename triggers.
    if (this.locks.has(name)) return;
    let content: string;
    try {
      content = await readFile(join(this.dir, name), 'utf8');
    } catch (error) {
      if (!isNotFound(error)) throw error;
      if (this.known.delete(name)) this.emit('event', { type: 'files' });
      return;
    }
    const revision = revisionOf(content);
    const previous = this.known.get(name);
    if (previous === revision) return;
    this.known.set(name, revision);
    this.emit('event', previous === undefined ? { type: 'files' } : { type: 'changed', name, revision });
  }
}
