import { defineConfig } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const port = 8123;
const venvPython = 'backend/.venv/bin/python';
const python = existsSync(venvPython) ? venvPython : 'python';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  use: { baseURL: `http://127.0.0.1:${port}`, locale: 'es-CO', timezoneId: 'America/Bogota' },
  webServer: {
    command: `npm run build && ${python} -m uvicorn app.main:app --app-dir backend --port ${port}`,
    url: `http://127.0.0.1:${port}/api/all`,
    reuseExistingServer: false,
    env: {
      DB_PATH: join(mkdtempSync(join(tmpdir(), 'fondi-e2e-')), 'fondi.db'),
      STATIC_DIR: resolve('dist'),
      ADMIN_PASSWORD: 'e2e',
    },
  },
});
