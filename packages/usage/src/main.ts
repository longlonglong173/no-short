import { dirname, join } from 'node:path';
import { writeSync } from 'node:fs';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import embeddedHtml from '../dist/panel/index.html' with { type: 'text' };
import { createUsageService } from './service.ts';
import { createServer } from './server.ts';

const binary = process.env.NO_SHORT_USAGE_CCUSAGE ?? join(dirname(process.execPath), 'ccusage');
const html: unknown = embeddedHtml;
if (typeof html !== 'string') throw new Error('Invalid embedded usage panel');
const store = createUsageService({ binary });
if (process.argv.includes('--version')) console.log('no-short-usage 0.4.1 (ccusage 20.0.34)');
else if (process.argv.includes('--snapshot')) {
  // Drain the actual stdout FD before exiting. console.log can truncate a large
  // report, and Bun 1.3.13's async stdout writer can stall on a macOS POSIX pipe.
  const bytes = Buffer.from(JSON.stringify(await store.get()) + '\n');
  for (let offset = 0; offset < bytes.length;) {
    try {
      const written = writeSync(1, bytes, offset, Math.min(16_384, bytes.length - offset));
      offset += written;
      if (written === 0) await Bun.sleep(2);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EAGAIN' && code !== 'EWOULDBLOCK' && code !== 'EINTR') throw error;
      await Bun.sleep(2);
    }
  }
}
else serveStdio(() => createServer(store, html), { onerror: () => console.error('No Short Usage: lỗi giao thức MCP. Hãy mở lại plugin.') });
