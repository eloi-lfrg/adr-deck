import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const API_PORT = '8788';
const WEB_PORT = '5188';
/** Fresh working directory per run (shared with workers through the env): the server seeds it with the example. */
const workspace = process.env['ADR_E2E_WORKSPACE'] ?? mkdtempSync(join(tmpdir(), 'adr-e2e-'));
process.env['ADR_E2E_WORKSPACE'] = workspace;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    // The UI follows the browser language; the main scenarios assert French texts.
    locale: 'fr-FR',
    // Set PW_CHANNEL=chrome to use the installed Chrome instead of Playwright's Chromium.
    ...(process.env['PW_CHANNEL'] ? { channel: process.env['PW_CHANNEL'] } : {}),
  },
  webServer: [
    {
      command: 'npm run dev --prefix ../server',
      env: { ADR_WORKSPACE: workspace, ADR_PORT: API_PORT },
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      env: { ADR_PORT: API_PORT },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
