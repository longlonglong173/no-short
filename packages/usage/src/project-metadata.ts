import { realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { SessionGrouping } from './grouping-types';
/** Resolve recorded metadata only; never inspect messages or derive cwd from a title. */
export async function projectMetadata(cwd?: string): Promise<SessionGrouping['project']> {
  if (!cwd || !isAbsolute(cwd) || cwd.length > 4096 || /[\u0000-\u001f]/.test(cwd)) return;
  try {
    const directory = await realpath(cwd);
    if (!(await stat(directory)).isDirectory()) return;
    let identity = directory, label = basename(directory), source: 'git-common-dir' | 'recorded-directory' = 'recorded-directory';
    try {
      const gitEnvironment: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1' };
      for (const variable of ['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete gitEnvironment[variable];
      const output = await new Promise<string>((accept, reject) => execFile('git', ['-C', directory, 'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'],
        { timeout: 1000, maxBuffer: 16_384, env: gitEnvironment }, (error, stdout) => error ? reject(error) : accept(stdout)));
      const [common, top] = output.trim().split('\n');
      if (common && top) { identity = await realpath(resolve(directory, common)); label = basename(top); source = 'git-common-dir'; }
    } catch { /* Existing recorded non-Git directory remains explicitly lower-confidence. */ }
    label = label.replace(/[\\/\u0000-\u001f\u007f]/g, ' ').slice(0, 160).trim();
    if (!label) return;
    return { id: createHash('sha256').update(source + '\0' + identity).digest('hex'), label, source, confidence: source === 'git-common-dir' ? 'verified' : 'recorded' };
  } catch { return; }
}
