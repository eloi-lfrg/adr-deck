import { expect, test } from '@playwright/test';

test('reads every ADR on the timeline', async ({ page }) => {
  // From the grid, with the keyboard.
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Lancer la revue/u })).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { level: 1, name: 'Frise chronologique' })).toBeVisible();
  await expect(page).toHaveURL(/\/timeline$/u);

  // Every ADR is on the timeline, newest first.
  const titles = page.locator('article h3');
  await expect(titles).toHaveCount(15);
  await expect(titles.last()).toHaveText('Enable TypeScript strict mode in every package');

  // Reading an ADR unfolds its whole content.
  const openapi = page.getByRole('article', { name: 'API publique REST décrite en OpenAPI' });
  await openapi.getByRole('button', { name: 'Lire', exact: true }).click();
  await expect(openapi.getByText('Génération des SDK et de la documentation')).toBeVisible();
  await expect(openapi.getByRole('button', { name: /Ouvrir dans le diaporama/u })).toBeVisible();

  // Links between ADRs move along the timeline.
  await openapi.getByRole('button', { name: /Aller à ADR-0014/u }).click();
  await expect(page.getByRole('article', { name: 'API publique en GraphQL' })).toBeInViewport();

  // Status filters.
  await page.getByRole('button', { name: /Remplacées/u }).click();
  await expect(titles).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Accès aux données avec Drizzle' })).toHaveCount(0);
  await page.getByRole('button', { name: /Remplacées/u }).click();
  await expect(titles).toHaveCount(15);

  // Oldest first on demand.
  await page.getByRole('button', { name: 'Plus récentes d’abord' }).click();
  await expect(titles.first()).toHaveText('Enable TypeScript strict mode in every package');

  await page.keyboard.press('g');
  await expect(page.getByRole('button', { name: /Lancer la revue/u })).toBeVisible();
});

test('opens on an ADR from a link', async ({ page }) => {
  await page.goto('/timeline?at=ADR-0013');
  const flags = page.getByRole('article', { name: 'Build an in-house feature flag service' });
  await expect(flags).toBeInViewport();
  await expect(flags.getByText('Continuous deployment (ADR-0012) relies on feature flags.')).toBeVisible();
  await expect(flags.getByRole('button', { name: 'Replier', exact: true })).toBeVisible();
});
