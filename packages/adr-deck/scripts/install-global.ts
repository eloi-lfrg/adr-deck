import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Installs adr-deck globally from a packed tarball, so that the installed copy does not depend on this repository.

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const staging = await mkdtemp(join(tmpdir(), 'adr-deck-install-'));

try {
  // `npm pack` runs `prepack`, which rebuilds dist/.
  const tarball = execFileSync('npm', ['pack', '--pack-destination', staging, '--silent'], { cwd: packageDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
    .trim()
    .split('\n')
    .pop()!;
  execFileSync('npm', ['install', '--global', '--no-audit', '--no-fund', join(staging, tarball)], { stdio: 'inherit' });
  const prefix = execFileSync('npm', ['prefix', '--global'], { encoding: 'utf8' }).trim();
  process.stdout.write(`✓ adr-deck installed in ${prefix} — run "adr-deck" from a directory of ADRs.\n`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
