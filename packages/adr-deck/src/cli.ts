import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDecision,
  categoryOf,
  hasErrors,
  issueMessage,
  lintMadr,
  nextAdrNumber,
  parisDate,
  parseCollection,
  parseMadr,
  sameAdrContent,
  serializeMadr,
  type FileIssues,
} from '@adr/format';
import { DocxImportError, exportDocx, importDocx, type ExportLanguage } from '@adr/convert';
import { docxFileName, resolveDecisionsDir, startServer, Workspace } from '@adr/server';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { askNewAdr, majorityLanguage, type Prompter } from './add.ts';
import { ArgsError, DEFAULT_HOST, DEFAULT_PORT, parseCommand, SERVE_HOST, type ReviewOptions } from './args.ts';

const PROGRAM = 'adr-deck';
/** Ports tried after the default one when it is taken. */
const PORT_ATTEMPTS = 20;
const SHUTDOWN_TIMEOUT_MS = 2000;

/** Assets copied next to the bundle by `scripts/build.ts`. */
const asset = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const WEB_DIST = asset('./web');
const PACKAGE_JSON = asset('../package.json');

const USAGE = `adr-deck — review MADR architecture decision records, one decision per slide.

Usage:
  ${PROGRAM} [review] [dir]          Open the review of the ADRs in the directory (default: current directory)
  ${PROGRAM} timeline [dir]          Read every ADR of the directory on a timeline
  ${PROGRAM} serve [dir]             Share the timeline read-only on the local network (host ${SERVE_HOST})
  ${PROGRAM} add [dir]               Create a new ADR interactively
  ${PROGRAM} export [output.docx]    Build a .docx from the ADRs of the current directory
  ${PROGRAM} import <file.docx> [dir] Turn a .docx exported by adr-deck back into MADR files
  ${PROGRAM} validate [path…]        Check MADR files or directories (default: current directory)

ADRs are the NNNN-title.md files of the directory (and of its category folders, two levels deep)
or, failing that, of docs/decisions, docs/adr, doc/adr, docs/architecture/decisions, adr or decisions.

Options:
  -p, --port <port>     Port to listen on (default: ${DEFAULT_PORT} or the next free one; or ADR_PORT)
      --host <host>     Address to listen on (default: ${DEFAULT_HOST}, ${SERVE_HOST} for serve; or ADR_HOST)
      --no-open         Do not open the browser (serve never opens it unless --open)
      --read-only       review, timeline: refuse every change to the files (always on for serve)
  -d, --dir <dir>       Starting directory (default: current directory)
  -f, --force           import: overwrite ADRs whose content differs from the .docx
  -o, --output <file>   .docx file written by export
  -l, --lang <lang>     Language of the .docx labels: en, fr or es (default: en)
      --strict          validate: also check the MADR template rules and markdownlint; warnings fail too
      --minimal         add: only the questions of the MADR minimal template
  -c, --category <dir>  add: category folder of the new ADR (e.g. backend)
  -h, --help            Show this help
  -v, --version         Show the version`;

function write(stream: NodeJS.WriteStream, text: string): void {
  stream.write(text.endsWith('\n') ? text : `${text}\n`);
}

async function readVersion(): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'));
  if (typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string') return manifest.version;
  throw new Error(`Version not found in ${PACKAGE_JSON}`);
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', (error) => {
    write(process.stderr, `Could not open the browser (${error.message}): open ${url}`);
  });
  child.unref();
}

async function kindOf(path: string): Promise<'dir' | 'file'> {
  try {
    return (await stat(path)).isDirectory() ? 'dir' : 'file';
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new ArgsError(`Not found: ${path}`);
    throw error;
  }
}

async function assertDirectory(dir: string): Promise<void> {
  if ((await kindOf(dir)) !== 'dir') throw new ArgsError(`Not a directory: ${dir}`);
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}

function printIssues(entries: FileIssues[], dir: string): void {
  for (const { file, issues } of entries) {
    for (const issue of issues) {
      write(process.stderr, `${relative(process.cwd(), join(dir, file)) || file}:${issue.line}  ${issue.severity}  ${issueMessage(issue, 'en')}`);
    }
  }
}

/** A server listening on every interface is reached through localhost and the local network addresses. */
function reachableUrls(url: string, host: string): string[] {
  if (host !== '0.0.0.0' && host !== '::') return [url];
  const port = new URL(url).port;
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
  return [`http://localhost:${port}`, ...addresses];
}

async function review(options: ReviewOptions): Promise<void> {
  await assertDirectory(options.root);
  const dir = await resolveDecisionsDir(options.root);
  const attempts = options.portExplicit ? 1 : PORT_ATTEMPTS;
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  for (let attempt = 0; server === null; attempt++) {
    const port = options.port + attempt;
    try {
      server = await startServer({ dir, title: basename(options.root), port, host: options.host, webDist: WEB_DIST, readOnly: options.readOnly });
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
      if (attempt + 1 >= attempts) {
        throw new ArgsError(options.portExplicit ? `Port ${port} is already in use: run again with --port <other port>.` : `No free port between ${options.port} and ${port}.`);
      }
    }
  }
  const running = server;
  const { adrs, issues } = parseCollection(await running.workspace.readAll());
  const path = options.view === 'timeline' ? '/timeline' : '';
  const urls = reachableUrls(running.url, options.host).map((url) => `${url}${path}`);
  const pageUrl = urls[0]!;
  write(
    process.stdout,
    `adr-deck — ${urls.join('  ')}${options.readOnly ? '  (read-only)' : ''}\nDecisions: ${dir} (${adrs.length} ADR${adrs.length === 1 ? '' : 's'})\nPress Ctrl+C to stop.`,
  );
  if (adrs.length === 0) write(process.stderr, 'No MADR file (NNNN-title.md) found: see adr-deck --help.');
  printIssues(issues, dir);
  if (options.open) openBrowser(pageUrl);

  let stopping = false;
  const shutdown = (): void => {
    // A second Ctrl+C (or a close that hangs) exits right away.
    if (stopping) process.exit(130);
    stopping = true;
    write(process.stdout, 'Stopping…');
    setTimeout(() => {
      write(process.stderr, 'Server did not stop within 2 s: exiting.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    running.close().then(
      () => process.exit(0),
      (error: unknown) => {
        write(process.stderr, `Error while stopping the server: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      },
    );
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function exportCommand(root: string, output: string | null, language: ExportLanguage): Promise<number> {
  await assertDirectory(root);
  const dir = await resolveDecisionsDir(root);
  const { adrs, issues } = parseCollection(await new Workspace(dir).readAll());
  printIssues(issues, dir);
  if (adrs.length === 0) {
    write(process.stderr, `No readable ADR in ${dir}.`);
    return 1;
  }
  const title = basename(root);
  const target = output ?? join(process.cwd(), docxFileName(title));
  await writeFile(target, await exportDocx({ title, source: dir, adrs, now: new Date(), language }));
  write(process.stdout, `${adrs.length} ADR${adrs.length === 1 ? '' : 's'} exported → ${target}`);
  return 0;
}

/** Adds the `--strict` checks to the issues of each file. */
function withStrictIssues(entries: FileIssues[], files: { name: string; content: string }[]): FileIssues[] {
  const byFile = new Map(entries.map((entry) => [entry.file, [...entry.issues]]));
  for (const file of files) {
    const extra = lintMadr(file.content, file.name);
    if (extra.length > 0) byFile.set(file.name, [...(byFile.get(file.name) ?? []), ...extra].sort((a, b) => a.line - b.line));
  }
  return [...byFile].map(([file, issues]) => ({ file, issues })).sort((a, b) => a.file.localeCompare(b.file, 'fr', { numeric: true }));
}

async function validate(paths: string[], strict: boolean): Promise<number> {
  let failed = false;
  for (const path of paths) {
    if ((await kindOf(path)) === 'dir') {
      const dir = await resolveDecisionsDir(path);
      const files = await new Workspace(dir).readAll();
      const collection = parseCollection(files);
      const issues = strict ? withStrictIssues(collection.issues, files) : collection.issues;
      printIssues(issues, dir);
      const errors = issues.filter((entry) => hasErrors(entry.issues)).length;
      const warned = issues.filter((entry) => !hasErrors(entry.issues)).length;
      failed ||= errors > 0 || collection.adrs.length === 0 || (strict && warned > 0);
      const counts = [errors > 0 ? `${errors} file${errors === 1 ? '' : 's'} with errors` : '', strict && warned > 0 ? `${warned} file${warned === 1 ? '' : 's'} with warnings` : ''].filter(Boolean);
      write(process.stdout, `${dir}: ${collection.adrs.length} readable ADR${collection.adrs.length === 1 ? '' : 's'}${counts.map((count) => `, ${count}`).join('')}`);
    } else {
      const content = await readFile(path, 'utf8');
      const name = basename(path);
      const { issues: parsed } = parseMadr(content, name);
      const issues = strict ? [...parsed, ...lintMadr(content, name)].sort((a, b) => a.line - b.line) : parsed;
      printIssues(issues.length > 0 ? [{ file: name, issues }] : [], join(path, '..'));
      const invalid = hasErrors(issues) || (strict && issues.length > 0);
      failed ||= invalid;
      write(process.stdout, `${name}: ${invalid ? 'invalid' : 'valid'}`);
    }
  }
  return failed ? 1 : 0;
}

/**
 * Writes the MADR files of a .docx into the decisions directory. New ADRs are created; an existing ADR whose
 * content is unchanged is left untouched (whatever its formatting); a changed one is overwritten only with --force.
 */
async function importCommand(input: string, target: string | null, force: boolean): Promise<number> {
  if ((await kindOf(input)) !== 'file') throw new ArgsError(`Not a file: ${input}`);
  const dir = await writableDecisionsDir(target);
  await mkdir(dir, { recursive: true });
  const existing = new Map((await new Workspace(dir).readAll()).map((file) => [file.name, parseMadr(file.content, file.name).adr]));

  let result: Awaited<ReturnType<typeof importDocx>>;
  try {
    // An existing file keeps the language of its headings; new files use the MADR template (English).
    result = await importDocx(await readFile(input), { language: (_id, name) => existing.get(name)?.language ?? 'en' });
  } catch (error) {
    if (!(error instanceof DocxImportError)) throw error;
    for (const issue of error.issues) write(process.stderr, `${basename(input)}: ${issue.location}: ${issue.message}`);
    return 1;
  }
  for (const issue of result.issues) write(process.stderr, `${basename(input)}: ${issue.location}: warning  ${issue.message}`);

  const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const file of result.files) {
    const parsed = parseMadr(file.content, file.name);
    if (parsed.adr === null) {
      printIssues([{ file: file.name, issues: parsed.issues }], dir);
      counts.skipped++;
      continue;
    }
    const before = existing.get(file.name);
    if (before === undefined) {
      counts.created++;
    } else if (before !== null && sameAdrContent(before, parsed.adr)) {
      counts.unchanged++;
      continue;
    } else if (!force) {
      write(process.stderr, `${file.name}: content differs from the existing file: skipped (use --force to overwrite).`);
      counts.skipped++;
      continue;
    } else {
      counts.updated++;
    }
    await mkdir(dirname(join(dir, file.name)), { recursive: true });
    await writeFile(join(dir, file.name), file.content, 'utf8');
    write(process.stdout, `${before === undefined ? 'created' : 'updated'}  ${relative(process.cwd(), join(dir, file.name)) || file.name}`);
  }
  write(process.stdout, `${dir}: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.skipped} skipped`);
  return counts.skipped > 0 ? 1 : 0;
}

/** Decisions directory to write into: the one found from the current directory, or docs/decisions when there is none. */
async function writableDecisionsDir(target: string | null): Promise<string> {
  if (target !== null) return target;
  const found = await resolveDecisionsDir(process.cwd());
  return (await new Workspace(found).listNames()).length > 0 ? found : join(process.cwd(), 'docs', 'decisions');
}

const terminalPrompter: Prompter = {
  text: ({ message, required, validate }) => input({ message, required: required ?? false, ...(validate ? { validate } : {}) }),
  select: ({ message, choices, default: initial }) => select({ message, choices, default: initial }),
  checkbox: ({ message, choices, required }) => checkbox({ message, choices, required }),
  confirm: ({ message, default: initial }) => confirm({ message, default: initial }),
  notice: (message) => write(process.stdout, message),
};

/** Creates a MADR file from answers in the terminal; a superseded ADR gets `superseded by` (targeted edit). */
async function addCommand(target: string | null, minimal: boolean, category: string | null): Promise<number> {
  if (!process.stdin.isTTY) throw new ArgsError(`${PROGRAM} add needs an interactive terminal.`);
  const dir = await writableDecisionsDir(target);
  const workspace = new Workspace(dir);
  const files = await workspace.readAll();
  const { adrs } = parseCollection(files);
  const now = new Date();

  const categories = [...new Set(files.map((file) => categoryOf(file.name)).filter((folder): folder is string => folder !== null))].sort();

  let created: NonNullable<Awaited<ReturnType<typeof askNewAdr>>>;
  try {
    const answer = await askNewAdr(
      terminalPrompter,
      { adrs, language: majorityLanguage(adrs), today: parisDate(now), template: minimal ? 'minimal' : 'full', categories, ...(category === null ? {} : { category }) },
      nextAdrNumber(files.map((file) => file.name)),
    );
    if (answer === null) {
      write(process.stdout, 'Nothing written.');
      return 0;
    }
    created = answer;
    const path = relative(process.cwd(), join(dir, created.fileName)) || created.fileName;
    const supersedes = created.supersedes === null ? '' : ` (${created.supersedes.id} becomes "superseded by ${created.id}")`;
    if (!(await confirm({ message: `Create ${path}${supersedes}?`, default: true }))) {
      write(process.stdout, 'Nothing written.');
      return 0;
    }
  } catch (error) {
    // Ctrl+C during a question.
    if (error instanceof Error && error.name === 'ExitPromptError') {
      write(process.stdout, 'Cancelled: nothing written.');
      return 130;
    }
    throw error;
  }

  const content = serializeMadr(created.draft);
  const parsed = parseMadr(content, created.fileName);
  if (parsed.adr === null || hasErrors(parsed.issues)) {
    printIssues([{ file: created.fileName, issues: parsed.issues }], dir);
    return 1;
  }
  await mkdir(dirname(join(dir, created.fileName)), { recursive: true });
  // `wx`: never overwrite a file created in the meantime.
  await writeFile(join(dir, created.fileName), content, { encoding: 'utf8', flag: 'wx' });
  write(process.stdout, `created  ${relative(process.cwd(), join(dir, created.fileName)) || created.fileName}`);
  printIssues(parsed.issues.length > 0 ? [{ file: created.fileName, issues: parsed.issues }] : [], dir);

  if (created.supersedes !== null) {
    const old = files.find((file) => file.name === created.supersedes!.file);
    if (old === undefined) throw new Error(`File of ${created.supersedes.id} not found: ${created.supersedes.file}`);
    const updated = applyDecision(old.content, old.name, { status: 'remplacée', retained: [], comment: null, nextReview: null, replacedBy: created.id }, now);
    await writeFile(join(dir, old.name), updated, 'utf8');
    write(process.stdout, `updated  ${relative(process.cwd(), join(dir, old.name)) || old.name}  (superseded by ${created.id})`);
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const command = parseCommand(argv, process.env, process.cwd());
  switch (command.kind) {
    case 'help':
      write(process.stdout, USAGE);
      return 0;
    case 'version':
      write(process.stdout, await readVersion());
      return 0;
    case 'export':
      return exportCommand(command.root, command.output, command.language);
    case 'validate':
      return validate(command.paths, command.strict);
    case 'import':
      return importCommand(command.input, command.dir, command.force);
    case 'add':
      return addCommand(command.dir, command.minimal, command.category);
    case 'review':
      await review(command.options);
      return 0;
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof ArgsError) write(process.stderr, `${error.message}\n\nSee ${PROGRAM} --help`);
  else write(process.stderr, `Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
