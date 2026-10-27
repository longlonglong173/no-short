import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, outputDir: '../../.artifacts/ns23/browser-results', use: { ...base.use, baseURL: 'http://127.0.0.1:5198' }, webServer: { command: 'bun run dev --port 5198 --strictPort', url: 'http://127.0.0.1:5198', reuseExistingServer: false, timeout: 20_000 } });
