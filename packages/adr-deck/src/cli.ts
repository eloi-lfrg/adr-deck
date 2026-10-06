import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasErrors, issueMessage, parseCollection, parseMadr, sameAdrContent, type FileIssues } from '@adr/format';
import { DocxImportError, exportDocx, importDocx, type ExportLanguage } from '@adr/convert';
import { docxFileName, resolveDecisionsDir, startServer, Workspace } from '@adr/server';
import { ArgsError, DEFAULT_HOST, DEFAULT_PORT, parseCommand, type ReviewOptions } from './args.ts';

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
  ${PROGRAM} --review [dir]          Open the review of the ADRs in the directory (default: current directory)
  ${PROGRAM} export [output.docx]    Build a .docx from the ADRs of the current directory
  ${PROGRAM} import <file.docx> [dir] Turn a .docx exported by adr-deck back into MADR files
  ${PROGRAM} validate [path…]        Check MADR files or directories (default: current directory)

ADRs are the NNNN-title.md files of the directory or, failing that, of docs/decisions, docs/adr,
doc/adr, docs/architecture/decisions, adr or decisions.

Options:
  -r, --review          Start the local server and open the app
  -p, --port <port>     Port to listen on (default: ${DEFAULT_PORT} or the next free one; or ADR_PORT)
      --host <host>     Address to listen on (default: ${DEFAULT_HOST}, or ADR_HOST)
      --no-open         Do not open the browser
  -d, --dir <dir>       Starting directory for export, import and validate (default: current directory)
  -f, --force           import: overwrite ADRs whose content differs from the .docx
  -o, --output <file>   .docx file written by export
  -l, --lang <lang>     Language of the .docx labels: en, fr or es (default: en)
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

async function review(options: ReviewOptions): Promise<void> {
  await assertDirectory(options.root);
  const dir = await resolveDecisionsDir(options.root);
  const attempts = options.portExplicit ? 1 : PORT_ATTEMPTS;
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  for (let attempt = 0; server === null; attempt++) {
    const port = options.port + attempt;
    try {
      server = await startServer({ dir, title: basename(options.root), port, host: options.host, webDist: WEB_DIST });
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
      if (attempt + 1 >= attempts) {
        throw new ArgsError(options.portExplicit ? `Port ${port} is already in use: run again with --port <other port>.` : `No free port between ${options.port} and ${port}.`);
      }
    }
  }
  const running = server;
  const { adrs, issues } = parseCollection(await running.workspace.readAll());
  write(process.stdout, `adr-deck — ${running.url}\nDecisions: ${dir} (${adrs.length} ADR${adrs.length === 1 ? '' : 's'})\nPress Ctrl+C to stop.`);
  if (adrs.length === 0) write(process.stderr, 'No MADR file (NNNN-title.md) found: see adr-deck --help.');
  printIssues(issues, dir);
  if (options.open) openBrowser(running.url);

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

async function validate(paths: string[]): Promise<number> {
  let failed = false;
  for (const path of paths) {
    if ((await kindOf(path)) === 'dir') {
      const dir = await resolveDecisionsDir(path);
      const { adrs, issues } = parseCollection(await new Workspace(dir).readAll());
      printIssues(issues, dir);
      const errors = issues.filter((entry) => hasErrors(entry.issues)).length;
      failed ||= errors > 0 || adrs.length === 0;
      write(process.stdout, `${dir}: ${adrs.length} readable ADR${adrs.length === 1 ? '' : 's'}${errors > 0 ? `, ${errors} file${errors === 1 ? '' : 's'} with errors` : ''}`);
    } else {
      const { issues } = parseMadr(await readFile(path, 'utf8'), basename(path));
      printIssues(issues.length > 0 ? [{ file: basename(path), issues }] : [], join(path, '..'));
      failed ||= hasErrors(issues);
      write(process.stdout, `${basename(path)}: ${hasErrors(issues) ? 'invalid' : 'valid'}`);
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
  let dir = target;
  if (dir === null) {
    const found = await resolveDecisionsDir(process.cwd());
    dir = (await new Workspace(found).listNames()).length > 0 ? found : join(process.cwd(), 'docs', 'decisions');
  }
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
    await writeFile(join(dir, file.name), file.content, 'utf8');
    write(process.stdout, `${before === undefined ? 'created' : 'updated'}  ${relative(process.cwd(), join(dir, file.name)) || file.name}`);
  }
  write(process.stdout, `${dir}: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.skipped} skipped`);
  return counts.skipped > 0 ? 1 : 0;
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
      return validate(command.paths);
    case 'import':
      return importCommand(command.input, command.dir, command.force);
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
