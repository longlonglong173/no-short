import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';
import { createUsageService } from './src/service.ts';

export default defineConfig({
  root: resolve(import.meta.dirname, 'ui'),
  plugins: [react(), viteSingleFile(), {
    name: 'local-usage-preview',
    configureServer(server) {
      const store = createUsageService({ binary: process.env.NO_SHORT_USAGE_CCUSAGE ?? resolve(import.meta.dirname, `runtime/darwin-${process.arch}/ccusage`),
        cacheDir: resolve(import.meta.dirname, '../../.artifacts/usage/preview-cache') });
      server.middlewares.use('/__usage/snapshot', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        try { res.end(JSON.stringify({ snapshot: await store.get(), selectedSession: null, requestedSessionId: null })); }
        catch { res.statusCode = 500; res.end(JSON.stringify({ error: 'Không đọc được thống kê local.' })); }
      });
    },
  }],
  build: { outDir: resolve(import.meta.dirname, 'dist/panel'), emptyOutDir: true, target: 'es2022', assetsInlineLimit: Infinity },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, allowedHosts: ['localhost', '127.0.0.1'], fs: { allow: [resolve(import.meta.dirname, '../..')] } },
});
