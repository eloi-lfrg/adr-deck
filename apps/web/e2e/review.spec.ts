import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const workspaceFile = (name: string): string => join(process.env['ADR_E2E_WORKSPACE'] ?? '', name);
const read = (name: string): Promise<string> => readFile(workspaceFile(name), 'utf8');

test.describe.configure({ mode: 'serial' });

test('runs a full review with the keyboard only', async ({ page }) => {
  const deferred = await read('0005-observabilite.md');
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Lancer la revue/u })).toBeVisible();

  await page.keyboard.press('r');
  await expect(page.getByText('1 / 5')).toBeVisible();

  // Validating without a selected proposition is impossible.
  await page.keyboard.press('v');
  await expect(page.getByText('Sélectionnez au moins une option').first()).toBeVisible();
  await expect(page.getByText('1 / 5')).toBeVisible();

  // ADR-0002: select P1 and P3, comment, validate.
  await page.keyboard.press('1');
  await page.keyboard.press('3');
  await page.keyboard.press('c');
  await page.keyboard.type('Les deux se complètent');
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await expect(page.getByRole('img', { name: /Tampon : Validée/u })).toBeVisible();

  // The decision reaches the MADR file in less than a second.
  await expect
    .poll(async () => read('0002-cache-http.md'), { timeout: 1000, intervals: [100] })
    .toContain('Chosen options: "Cache applicatif Redis" and "Statu quo et optimisation SQL", because Les deux se complètent.');
  expect(await read('0002-cache-http.md')).toContain('status: accepted');

  // ADR-0003 already names its option: it is preselected and its justification kept.
  await expect(page.getByText('2 / 5')).toBeVisible();
  await page.keyboard.press('v');
  await expect.poll(async () => read('0003-authentification.md')).toContain('Chosen option: "mTLS via le service mesh", because le mesh est déjà déployé sur tous les clusters.');

  await expect(page.getByText('3 / 5')).toBeVisible();
  await page.keyboard.press('x');
  await expect(page.getByText('4 / 5')).toBeVisible();

  // Undo the last decision (Ctrl+Z): we go back to it and the file is restored exactly.
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Décision annulée sur ADR-0005')).toBeVisible();
  await expect(page.getByText('3 / 5')).toBeVisible();
  await expect.poll(async () => read('0005-observabilite.md')).toBe(deferred);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('2');
  await page.keyboard.press('v');

  // ADR-0010, the last proposed one: rejected without an option.
  await expect(page.getByText('5 / 5')).toBeVisible();
  await page.keyboard.press('x');

  await expect(page.getByRole('heading', { name: 'Récapitulatif' })).toBeVisible();
  await expect(page.getByText('Décisions prises')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'ADR-0002' })).toContainText('Les deux se complètent');
});

test('reloads external modifications without losing pending decisions', async ({ page }) => {
  await page.goto('/revue?mode=all&at=ADR-0004');
  await expect(page.getByRole('heading', { name: 'Passage en monorepo' })).toBeVisible();

  const original = await read('0004-monorepo.md');
  await writeFile(workspaceFile('0004-monorepo.md'), original.replace('# Passage en monorepo', '# Passage en monorepo unique'), 'utf8');
  await expect(page.getByRole('heading', { name: 'Passage en monorepo unique' })).toBeVisible({ timeout: 5000 });

  await page.keyboard.press('m');
  await page.keyboard.press('p');
  await expect.poll(async () => read('0004-monorepo.md')).toMatch(/status: deferred[\s\S]*# Passage en monorepo unique/u);
});

test('follows a superseded ADR to its replacement', async ({ page }) => {
  // From the grid card.
  await page.goto('/');
  await page.getByRole('article').filter({ hasText: 'ORM pour le service de commandes' }).getByRole('button', { name: /Aller à ADR-0008/u }).click();
  await expect(page.getByRole('heading', { name: 'Accès aux données avec Drizzle' })).toBeVisible();

  // The replacement links back to the ADR it supersedes.
  await page.getByRole('button', { name: /Aller à ADR-0007/u }).first().click();
  await expect(page.getByRole('heading', { name: 'ORM pour le service de commandes' })).toBeVisible();
  await expect(page.getByText(/remplacée par/u).first()).toBeVisible();

  // With the keyboard.
  await page.keyboard.press('l');
  await expect(page.getByRole('heading', { name: 'Accès aux données avec Drizzle' })).toBeVisible();
});

test.describe('language', () => {
  test.use({ locale: 'es-ES' });

  test('follows the browser language and can be switched', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Iniciar la revisión/u })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await page.getByRole('button', { name: /Idioma/u }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(page.getByRole('button', { name: /Start the review/u })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // The choice is remembered.
    await page.reload();
    await expect(page.getByRole('button', { name: /Start the review/u })).toBeVisible();

    await page.getByRole('button', { name: /Language/u }).click();
    await page.getByRole('menuitemradio', { name: /Automatic/u }).click();
    await expect(page.getByRole('button', { name: /Iniciar la revisión/u })).toBeVisible();
  });
});

test('notes the participants and sends an ADR back for rework', async ({ page }) => {
  // ADR-0004 is deferred since the previous scenario: still open for a decision.
  await page.goto('/revue?mode=all&at=ADR-0004');
  await expect(page.getByRole('heading', { name: /Passage en monorepo/u })).toBeVisible();

  await page.getByRole('button', { name: 'Participants' }).click();
  const name = page.getByPlaceholder('Nom, puis Entrée');
  await name.fill('Alice');
  await name.press('Enter');
  await name.fill('Bob');
  await name.press('Enter');
  await page.getByRole('listitem').filter({ hasText: 'Bob' }).getByRole('button', { name: 'Consulté' }).click();
  await page.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.getByRole('button', { name: '2 participants' })).toBeVisible();

  await page.keyboard.press('w');
  await page.keyboard.type('Chiffrer la migration du CI');
  await page.keyboard.press('Enter');

  await expect.poll(async () => read('0004-monorepo.md')).toContain('### Actions\n\n* [ ] Chiffrer la migration du CI\n');
  const content = await read('0004-monorepo.md');
  expect(content).toContain('status: proposed');
  expect(content).toMatch(/decision-makers: .*Alice/u);
  expect(content).toContain('consulted: Bob');
});

test('shows the consequences and deprecates or supersedes an accepted ADR', async ({ page }) => {
  await page.goto('/revue?mode=all&at=ADR-0001');
  await expect(page.getByText('Conséquences', { exact: true })).toBeVisible();

  await page.goto('/revue?mode=all&at=ADR-0011');
  await page.getByRole('button', { name: 'Rendre cette ADR obsolète' }).click();
  await page.getByLabel('Raison (facultative)').fill('le compilateur l’impose désormais');
  await page.getByRole('button', { name: 'Rendre obsolète', exact: true }).click();
  await expect.poll(async () => read('0011-typescript-strict.md')).toContain('status: deprecated');
  expect(await read('0011-typescript-strict.md')).toMatch(/Deprecated on \d{4}-\d{2}-\d{2}, because le compilateur l’impose désormais\./u);

  await page.goto('/revue?mode=all&at=ADR-0012');
  await page.getByRole('button', { name: 'Remplacer cette ADR par une autre' }).click();
  await page.getByPlaceholder('Choisir la nouvelle ADR…').fill('0015');
  await page.getByRole('option', { name: /ADR-0015/u }).click();
  await page.getByRole('button', { name: 'Remplacer', exact: true }).click();
  await expect.poll(async () => read('0012-deploiement-continu.md')).toContain('status: superseded by ADR-0015');
  await expect.poll(async () => read('0015-api-rest-openapi.md')).toContain('Supersedes ADR-0012');

  // One undo restores both files.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => read('0012-deploiement-continu.md')).toContain('status: accepted');
  await expect.poll(async () => read('0015-api-rest-openapi.md')).not.toContain('Supersedes ADR-0012');
});

test('hides every decision control on a read-only server', async ({ page }) => {
  await page.route('**/api/adrs', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...((await response.json()) as object), readOnly: true } });
  });
  await page.goto('/');
  await expect(page.getByText('Lecture seule')).toBeVisible();
  await expect(page.getByRole('button', { name: /participant/iu })).toHaveCount(0);

  await page.goto('/revue?mode=all&at=ADR-0002');
  await expect(page.getByRole('heading', { level: 2, name: /cache/iu })).toBeVisible();
  await expect(page.getByRole('group', { name: /Décision pour/u })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Modifier la décision/u })).toHaveCount(0);
});
