import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const dist = `${packageDir}dist/`;

interface Manifest {
  dependencies?: Record<string, string>;
}

const manifest = JSON.parse(await readFile(`${packageDir}package.json`, 'utf8')) as Manifest;
const external = Object.keys(manifest.dependencies ?? {});

process.stdout.write('→ Front (vite build)\n');
execFileSync('npm', ['run', 'build', '-w', '@adr/web'], { cwd: repoRoot, stdio: 'inherit' });

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

process.stdout.write('→ CLI (esbuild)\n');
// Internal @adr/* workspaces are bundled from TypeScript source; third-party packages stay runtime dependencies.
const result = await build({
  entryPoints: [`${packageDir}src/cli.ts`],
  outfile: `${dist}cli.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external,
  banner: { js: '#!/usr/bin/env node' },
  metafile: true,
  logLevel: 'warning',
});

// Every bare import left in the bundle must be a Node built-in or a declared dependency.
const undeclared = new Set<string>();
for (const output of Object.values(result.metafile.outputs)) {
  for (const { path, external: isExternal } of output.imports) {
    if (!isExternal || path.startsWith('node:')) continue;
    const name = path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0]!;
    if (!external.includes(name)) undeclared.add(name);
  }
}
if (undeclared.size > 0) throw new Error(`Dependencies missing from package.json: ${[...undeclared].join(', ')}`);

process.stdout.write('→ Assets\n');
await cp(`${repoRoot}apps/web/dist`, `${dist}web`, { recursive: true });

process.stdout.write(`✓ ${dist}\n`);
