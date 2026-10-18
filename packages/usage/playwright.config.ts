import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.pw.ts', workers: 1,
  outputDir: '../../.artifacts/usage/browser-results', reporter: 'list',
  use: { locale: 'vi-VN', baseURL: 'http://127.0.0.1:5173', viewport: { width: 480, height: 1050 },
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'bun run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 20_000 },
});
