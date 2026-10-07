import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Packs the built package, installs the tarball in a throwaway project and exercises the installed binary.

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const examplesDir = fileURLToPath(new URL('../../../examples/decisions/', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'adr-deck-smoke-'));

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Failed: ${message}`);
  process.stdout.write(`✓ ${message}\n`);
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (typeof address === 'object' && address !== null ? resolvePort(address.port) : reject(new Error('No port available'))));
    });
  });
}

async function waitFor(url: string, timeoutMs: number): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await fetch(url);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    }
  }
}

try {
  const tarball = run('npm', ['pack', '--pack-destination', root, '--silent'], packageDir).trim().split('\n').pop()!;
  const project = join(root, 'project');
  const repo = join(root, 'repo');
  const decisions = join(repo, 'docs/decisions');
  await mkdir(project, { recursive: true });
  await mkdir(decisions, { recursive: true });
  await cp(examplesDir, decisions, { recursive: true });
  await writeFile(join(project, 'package.json'), '{"name":"smoke","private":true}\n');
  run('npm', ['install', '--no-audit', '--no-fund', '--silent', join(root, tarball)], project);
  const bin = join(project, 'node_modules/.bin/adr-deck');

  check(/^\d+\.\d+\.\d+/u.test(run(bin, ['--version'], repo)), 'adr-deck --version');

  const port = await freePort();
  const server = spawn(bin, ['review', '--no-open', '--port', String(port)], { cwd: repo, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const health = await waitFor(`http://127.0.0.1:${port}/api/health`, 15_000);
    check(health.ok, 'GET /api/health');
    const page = await fetch(`http://127.0.0.1:${port}/`);
    check(page.ok && (await page.text()).includes('<div id="app"'), 'GET / serves the built front end');
    const timeline = await fetch(`http://127.0.0.1:${port}/timeline`);
    check(timeline.ok && (await timeline.text()).includes('<div id="app"'), 'GET /timeline serves the front end (adr-deck timeline)');
    const body = (await (await fetch(`http://127.0.0.1:${port}/api/adrs`)).json()) as { dir: string; files: unknown[] };
    check(body.dir.endsWith('/repo/docs/decisions') && body.files.length === 15, 'review reads docs/decisions from the current directory');
  } finally {
    server.kill('SIGTERM');
  }

  check(run(bin, ['validate'], repo).includes('15 readable ADRs'), 'adr-deck validate');
  run(bin, ['export', 'decisions.docx'], repo);
  const docx = await readFile(join(repo, 'decisions.docx'));
  check((await readdir(repo)).includes('decisions.docx') && docx.subarray(0, 2).toString() === 'PK', 'adr-deck export → .docx');

  // The export reads back: unchanged ADRs are left as they are, and a fresh directory gets every ADR.
  check(run(bin, ['import', 'decisions.docx'], repo).includes('0 created, 0 updated, 15 unchanged, 0 skipped'), 'adr-deck import of an unchanged export');
  check(run(bin, ['import', 'decisions.docx', 'imported'], repo).includes('15 created'), 'adr-deck import → MADR files');
  check(run(bin, ['validate', 'imported'], repo).includes('15 readable ADRs'), 'imported MADR files are valid');
} finally {
  await rm(root, { recursive: true, force: true });
}
