import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export interface ReportOptions { binary: string; roots: string[]; claudeRoots?: string[]; cacheDir: string; timeZone: string; offline: boolean; timeoutMs?: number; environment?: NodeJS.ProcessEnv }

export function createReportEnvironment(base: NodeJS.ProcessEnv, roots: string[], emptyDir: string, claudeRoots?: string[]): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(base).filter(([key]) => !/TOKEN|KEY|SECRET|AUTH|COOKIE|HEADER|PASSWORD/i.test(key)));
  for (const key of ['CLAUDE_CONFIG_DIR', 'OPENCODE_DATA_DIR', 'AMP_DATA_DIR', 'DROID_SESSIONS_DIR', 'CODEBUFF_DATA_DIR', 'HERMES_HOME', 'PI_AGENT_DIR',
    'GOOSE_PATH_ROOT', 'OPENCLAW_DIR', 'KILO_DATA_DIR', 'KIMI_DATA_DIR', 'QWEN_DATA_DIR', 'COPILOT_HOME', 'GEMINI_DATA_DIR', 'ANTIGRAVITY_DATA_DIR', 'GROK_HOME', 'ZCODE_HOME']) env[key] = emptyDir;
  return { ...env, CLAUDE_CONFIG_DIR: claudeRoots?.length ? claudeRoots.join(',') : emptyDir, CODEX_HOME: roots.join(','), COPILOT_OTEL_FILE_EXPORTER_PATH: join(emptyDir, 'no-export.jsonl'), NO_COLOR: '1', FORCE_COLOR: '0', LOG_LEVEL: '0' };
}

async function boundedText(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error('REPORT_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function runReport(options: ReportOptions): Promise<unknown> {
  // Invalid timezone must fail before invoking a process.
  new Intl.DateTimeFormat('en', { timeZone: options.timeZone });
  const empty = join(options.cacheDir, 'empty-sources');
  await mkdir(empty, { recursive: true, mode: 0o700 });
  // ccusage validates the Claude override before discovering any source.
  // A valid, deliberately empty projects root disables it without touching real logs.
  await mkdir(join(empty, 'projects'), { recursive: true, mode: 0o700 });
  const config = join(options.cacheDir, 'ccusage-config.json');
  await writeFile(config, '{}', { mode: 0o600 });
  const args = ['session', '--json', '--sections', 'daily,session', '--by-agent', '--timezone', options.timeZone, '--config', config, '--no-color'];
  if (options.offline) args.push('--offline');
  let child;
  try {
    child = Bun.spawn([options.binary, ...args], { cwd: empty, env: createReportEnvironment(options.environment ?? process.env, options.roots, empty, options.claudeRoots), stdout: 'pipe', stderr: 'pipe' });
  } catch { throw new Error('RUNTIME_UNAVAILABLE'); }
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeoutMs ?? 30_000);
  try {
    const [stdout, , code] = await Promise.all([boundedText(child.stdout, 64 * 1024 * 1024), boundedText(child.stderr, 1024 * 1024), child.exited]);
    if (timedOut) throw new Error('REPORT_TIMEOUT');
    if (code !== 0) throw new Error('REPORT_FAILED');
    try { return JSON.parse(stdout); } catch { throw new Error('REPORT_INVALID'); }
  } finally { clearTimeout(timeout); if (child.exitCode === null) child.kill('SIGKILL'); }
}
