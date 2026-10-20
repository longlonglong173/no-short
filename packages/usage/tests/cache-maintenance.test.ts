import { afterEach, beforeAll, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile, open } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SnapshotStore } from '../src/cache';
import { buildSnapshot } from '../src/adapter';
import { createUsageService, usageCacheScope } from '../src/service';
import fixture from './fixtures/unified.json';

const notice = 'Cache đang được bảo trì. Chờ một lúc rồi thử lại.';
const directories: string[] = [];
const snapshot = () => buildSnapshot(fixture, { now: new Date(), timeZone: 'UTC', metadata: new Map() });
const past = () => new Date(Date.now() - 120_000);
let deadPID: number;
beforeAll(async () => {
  const child = Bun.spawn([process.execPath, '-e', 'process.exit(0)'], { stdout: 'ignore', stderr: 'ignore' });
  await child.exited; deadPID = child.pid;
  expect(() => process.kill(deadPID, 0)).toThrow();
});
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'ns12-maintenance-')); directories.push(base);
  const root = join(base, 'cache'), scope = join(root, '0123456789abcdef01234567');
  return { base, root, scope, guard: join(root, '.maintenance.lock') };
}
async function guardAt(root: string, owner: unknown, old = false) {
  const guard = join(root, '.maintenance.lock'); await mkdir(guard, { recursive: true });
  if (owner !== undefined) await writeFile(join(guard, 'owner.json'), typeof owner === 'string' ? owner : JSON.stringify(owner));
  if (old) await utimes(guard, past(), past());
  return guard;
}
const liveOwner = () => ({ pid: process.pid, token: 'native-owner-token', timestamp: Date.now() });
const deadOwner = () => ({ pid: deadPID, token: 'abandoned-owner-token', timestamp: Date.now() - 120_000 });

test('active maintenance marks a fresh cached snapshot stale without loading or touching cache/guard files', async () => {
  const { root, scope, guard } = await setup(); await mkdir(scope, { recursive: true });
  const original = snapshot(), contents = JSON.stringify(original), path = join(scope, 'snapshot.json');
  await writeFile(path, contents); await guardAt(root, liveOwner());
  const modified = (await stat(path)).mtimeMs; const owner = await readFile(join(guard, 'owner.json'), 'utf8');
  let calls = 0; const result = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  expect(result.status).toBe('stale'); expect(result.notice).toBe(notice); expect(result.history).toEqual(original.history);
  expect(calls).toBe(0); expect(await readFile(path, 'utf8')).toBe(contents); expect((await stat(path)).mtimeMs).toBe(modified);
  expect(await readdir(scope)).toEqual(['snapshot.json']); expect(await readFile(join(guard, 'owner.json'), 'utf8')).toBe(owner);
});

test('active maintenance on first read returns unavailable and creates no scope directory', async () => {
  const { root, scope } = await setup(); await guardAt(root, liveOwner()); let calls = 0;
  const result = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  expect(result.status).toBe('error'); expect(result.notice).toBe(notice); expect(result.today.cost.amountUSD).toBeNull();
  expect(result.history).toBeUndefined(); expect(calls).toBe(0); expect(existsSync(scope)).toBe(false);
});

test('service passes its cache base as maintenance root without creating report scratch files', async () => {
  const { root, base } = await setup(); await guardAt(root, liveOwner());
  const value = await createUsageService({ binary: join(base, 'must-not-start'), roots: [join(base, 'codex')], cacheDir: root, timeZone: 'UTC' }).get();
  expect(value.notice).toBe(notice); expect(value.status).toBe('error'); expect(await readdir(root)).toEqual(['.maintenance.lock']);
});

test('Node never deletes an old stable root guard with a provably dead owner; reads still recover', async () => {
  const { root, scope, guard } = await setup(); await guardAt(root, deadOwner(), true); let calls = 0;
  const before = await stat(guard), ownerBefore = await stat(join(guard, 'owner.json')), contents = await readFile(join(guard, 'owner.json'), 'utf8');
  const result = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  expect(result.status).toBe('ready'); expect(result.notice).toBeUndefined(); expect(calls).toBe(1); expect(existsSync(guard)).toBe(true);
  const after = await stat(guard), ownerAfter = await stat(join(guard, 'owner.json'));
  expect([after.dev, after.ino, after.mtimeMs, after.ctimeMs]).toEqual([before.dev, before.ino, before.mtimeMs, before.ctimeMs]);
  expect([ownerAfter.dev, ownerAfter.ino, ownerAfter.mtimeMs, ownerAfter.ctimeMs]).toEqual([ownerBefore.dev, ownerBefore.ino, ownerBefore.mtimeMs, ownerBefore.ctimeMs]);
  expect(await readFile(join(guard, 'owner.json'), 'utf8')).toBe(contents); expect(await readdir(guard)).toEqual(['owner.json']);
  expect(JSON.parse(await readFile(join(scope, 'snapshot.json'), 'utf8')).today.cost.amountUSD).toBe(result.today.cost.amountUSD);
});

test.each(['fresh-directory', 'fresh-owner', 'live-owner', 'permission-denied-owner'] as const)('does not recover guard with %s', async condition => {
  const { root, scope, guard } = await setup();
  const owner = condition === 'live-owner' ? { ...liveOwner(), timestamp: Date.now() - 120_000 }
    : condition === 'permission-denied-owner' ? { pid: 1, token: 'system-owner', timestamp: Date.now() - 120_000 }
    : condition === 'fresh-owner' ? { ...deadOwner(), timestamp: Date.now() } : deadOwner();
  await guardAt(root, owner, condition !== 'fresh-directory'); let calls = 0;
  const value = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  expect(value.notice).toBe(notice); expect(calls).toBe(0); expect(existsSync(scope)).toBe(false);
  expect(JSON.parse(await readFile(join(guard, 'owner.json'), 'utf8'))).toEqual(owner);
});

test.each([
  ['missing', undefined], ['corrupt', '{"partial":'], ['invalid-pid', { pid: 0, token: 'bad', timestamp: 0 }],
] as const)('missing/corrupt owner %s permits reads only after grace and stays physically unchanged', async (_, owner) => {
  const { root, scope, guard } = await setup(); await guardAt(root, owner); let calls = 0;
  const store = new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root });
  expect((await store.get()).notice).toBe(notice); expect(calls).toBe(0); expect(existsSync(guard)).toBe(true);
  await utimes(guard, past(), past());
  const before = await stat(guard), contents = owner === undefined ? undefined : await readFile(join(guard, 'owner.json'), 'utf8');
  expect((await store.get()).status).toBe('ready'); expect(calls).toBe(1); expect(existsSync(guard)).toBe(true);
  const after = await stat(guard);
  expect([after.dev, after.ino, after.mtimeMs, after.ctimeMs]).toEqual([before.dev, before.ino, before.mtimeMs, before.ctimeMs]);
  if (contents === undefined) expect(await readdir(guard)).toEqual([]);
  else expect(await readFile(join(guard, 'owner.json'), 'utf8')).toBe(contents);
});

test.each([false, true])('permanent native recovery lock is not an active fence, stale primary present: %s', async primaryPresent => {
  const { root, scope, guard } = await setup(); await mkdir(root, { recursive: true });
  const recovery = join(root, '.maintenance-recovery.lock'); await writeFile(recovery, '', { mode: 0o600 });
  if (primaryPresent) await guardAt(root, deadOwner(), true);
  const before = await stat(recovery); let calls = 0;
  const load = async () => { calls++; await Bun.sleep(50); return snapshot(); };
  const a = new SnapshotStore(scope, load, { maintenanceRoot: root }), b = new SnapshotStore(scope, load, { maintenanceRoot: root });
  const values = await Promise.all([a.get(), b.get(), a.get()]);
  expect(values.every(value => value.status === 'ready' && value.notice === undefined)).toBe(true); expect(calls).toBe(1);
  expect((await a.get()).status).toBe('ready'); expect(calls).toBe(1);
  const after = await stat(recovery); expect(after.isFile()).toBe(true); expect(after.size).toBe(0);
  expect([after.dev, after.ino, after.mtimeMs, after.ctimeMs]).toEqual([before.dev, before.ino, before.mtimeMs, before.ctimeMs]);
  expect(existsSync(guard)).toBe(primaryPresent);
  if (primaryPresent) expect(JSON.parse(await readFile(join(guard, 'owner.json'), 'utf8')).token).toBe('abandoned-owner-token');
});

test('stale recovery preserves unknown guard contents and refuses to scan', async () => {
  const { root, scope, guard } = await setup(); await guardAt(root, deadOwner());
  await writeFile(join(guard, 'unknown.jsonl'), 'KEEP'); await utimes(guard, past(), past()); let calls = 0;
  const value = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  expect(value.notice).toBe(notice); expect(calls).toBe(0); expect(await readFile(join(guard, 'unknown.jsonl'), 'utf8')).toBe('KEEP');
  expect(JSON.parse(await readFile(join(guard, 'owner.json'), 'utf8')).token).toBe('abandoned-owner-token');
});

test('EPERM during liveness checking preserves the old guard and never loads', async () => {
  const { root, scope, guard } = await setup(); const owner = deadOwner(); await guardAt(root, owner, true);
  const kill = process.kill.bind(process);
  const probe = spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid === deadPID) throw Object.assign(new Error('not permitted'), { code: 'EPERM' });
    return kill(pid, signal);
  });
  let calls = 0;
  try {
    const value = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
    expect(value.notice).toBe(notice); expect(calls).toBe(0);
    expect(JSON.parse(await readFile(join(guard, 'owner.json'), 'utf8'))).toEqual(owner);
  } finally { probe.mockRestore(); }
});

test('a changed owner nonce during stale recovery is retained, never unlinked', async () => {
  const { root, scope, guard } = await setup(); await guardAt(root, deadOwner(), true);
  const replacement = { ...liveOwner(), token: 'replacement-native-token' }, kill = process.kill.bind(process);
  const probe = spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid === deadPID) writeFileSync(join(guard, 'owner.json'), JSON.stringify(replacement));
    return kill(pid, signal);
  });
  let calls = 0;
  try {
    const value = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
    expect(value.notice).toBe(notice); expect(calls).toBe(0);
    expect(JSON.parse(await readFile(join(guard, 'owner.json'), 'utf8'))).toEqual(replacement);
  } finally { probe.mockRestore(); }
});

test.each(['guard', 'owner', 'root'] as const)('never follows a %s symlink when inspecting/recovering maintenance', async target => {
  const { root, scope, guard, base } = await setup(); const outside = join(base, 'outside'); await mkdir(outside);
  const text = JSON.stringify(deadOwner());
  if (target === 'guard') {
    await mkdir(root); await writeFile(join(outside, 'owner.json'), text); await symlink(outside, guard); await utimes(outside, past(), past());
  } else if (target === 'owner') {
    await mkdir(guard, { recursive: true }); await writeFile(join(outside, 'owner.json'), text); await symlink(join(outside, 'owner.json'), join(guard, 'owner.json')); await utimes(guard, past(), past());
  } else {
    await guardAt(outside, deadOwner(), true); await symlink(outside, root);
  }
  let calls = 0; const value = await new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  expect(value.notice).toBe(notice); expect(calls).toBe(0);
  const retained = target === 'root' ? join(outside, '.maintenance.lock/owner.json') : join(outside, 'owner.json');
  expect(await readFile(retained, 'utf8')).toBe(text);
});

test('guard appearing after owning scope scan.lock prevents load and snapshot writes', async () => {
  const { root, scope, guard } = await setup(); await mkdir(scope, { recursive: true });
  const fifo = join(scope, 'snapshot.json');
  const made = Bun.spawn(['/usr/bin/mkfifo', fifo], { stdout: 'ignore', stderr: 'pipe' }); expect(await made.exited).toBe(0);
  const original = snapshot(); original.generatedAt = '2020-01-01T00:00:00Z'; let calls = 0;
  const reading = new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  const first = await open(fifo, 'w'); await first.writeFile(JSON.stringify(original)); await first.close();
  const deadline = Date.now() + 3000;
  while (!existsSync(join(scope, 'scan.lock')) && Date.now() < deadline) await Bun.sleep(1);
  expect(existsSync(join(scope, 'scan.lock'))).toBe(true);
  const second = await open(fifo, 'w'); // The store now owns scan.lock and is rereading its cache.
  await guardAt(root, liveOwner());
  await second.writeFile(JSON.stringify(original)); await second.close();
  const value = await reading;
  expect(value.status).toBe('stale'); expect(value.notice).toBe(notice); expect(calls).toBe(0);
  expect((await stat(fifo)).isFIFO()).toBe(true); expect(existsSync(join(scope, 'scan.lock'))).toBe(false);
  expect(JSON.parse(await readFile(join(guard, 'owner.json'), 'utf8')).token).toBe('native-owner-token');
}, 10_000);

test.each([false, true])('guard while waiting blocks load and retains a newer snapshot when present: %s', async cachedAppears => {
  const { root, scope, guard } = await setup(); const lock = join(scope, 'scan.lock'); await mkdir(lock, { recursive: true });
  const fifo = join(lock, 'owner.json');
  const made = Bun.spawn(['/usr/bin/mkfifo', fifo], { stdout: 'ignore', stderr: 'pipe' }); expect(await made.exited).toBe(0);
  await utimes(lock, past(), past()); let calls = 0;
  const reading = new SnapshotStore(scope, async () => { calls++; return snapshot(); }, { maintenanceRoot: root }).get();
  const writer = await open(fifo, 'w'); // Resolves only once the real scan-lock reader has opened the FIFO.
  await guardAt(root, liveOwner());
  if (cachedAppears) await writeFile(join(scope, 'snapshot.json'), JSON.stringify(snapshot()));
  await writer.writeFile(JSON.stringify({ pid: process.pid, timestamp: Date.now() })); await writer.close();
  await rm(lock, { recursive: true });
  const value = await reading;
  expect(value.notice).toBe(notice); expect(calls).toBe(0); expect(existsSync(join(scope, 'snapshot.json'))).toBe(cachedAppears);
  expect(value.status).toBe(cachedAppears ? 'stale' : 'error');
  if (cachedAppears) expect(value.sessions).toHaveLength(2);
  expect(existsSync(guard)).toBe(true);
}, 10_000);

test('parallel ordinary readers still share one scan and atomic cache when maintenance is absent', async () => {
  const { root, scope } = await setup(); let calls = 0;
  const load = async () => { calls++; await Bun.sleep(70); return snapshot(); };
  const a = new SnapshotStore(scope, load, { maintenanceRoot: root }); const b = new SnapshotStore(scope, load, { maintenanceRoot: root });
  const values = await Promise.all([a.get(), b.get(), a.get()]);
  expect(calls).toBe(1); expect(values.every(value => value.status === 'ready')).toBe(true);
  expect(values.map(value => value.generatedAt)).toEqual([values[0].generatedAt, values[0].generatedAt, values[0].generatedAt]);
  expect(existsSync(join(scope, 'scan.lock'))).toBe(false);
});

test('maintenance arriving during an already running load prevents snapshot commit', async () => {
  const { root, scope, guard } = await setup(); let calls = 0;
  const result = await new SnapshotStore(scope, async () => {
    calls++; await guardAt(root, liveOwner()); return snapshot();
  }, { maintenanceRoot: root }).get();
  expect(calls).toBe(1); expect(result.status).toBe('error'); expect(result.notice).toBe(notice);
  expect(existsSync(join(scope, 'snapshot.json'))).toBe(false); expect(await readdir(scope)).toEqual([]);
  expect(JSON.parse(await readFile(join(guard, 'owner.json'), 'utf8')).token).toBe('native-owner-token');
});

test('current-source snapshot CLI respects a live Swift-created root guard before returning fresh cache', async () => {
  const { base, root, guard } = await setup(), roots = [join(base, 'codex')];
  const scope = join(root, usageCacheScope(roots, 'UTC')); await mkdir(scope, { recursive: true });
  const original = snapshot(), contents = JSON.stringify(original), path = join(scope, 'snapshot.json');
  await writeFile(path, contents); const modified = (await stat(path)).mtimeMs;
  const swift = `
import Foundation
import Darwin
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let lock = root.appendingPathComponent(".maintenance.lock")
try FileManager.default.createDirectory(at: lock, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
let data = try JSONSerialization.data(withJSONObject: ["pid": getpid(), "token": UUID().uuidString, "timestamp": Date().timeIntervalSince1970 * 1000])
try data.write(to: lock.appendingPathComponent("owner.json"), options: .atomic)
try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: lock.appendingPathComponent("owner.json").path)
FileHandle.standardOutput.write(Data("ready\\n".utf8))
Thread.sleep(forTimeInterval: 20)
`;
  const native = Bun.spawn(['/usr/bin/swift', '-e', swift, root], { stdout: 'pipe', stderr: 'pipe' });
  let nativePID: number | undefined;
  try {
    const ready = native.stdout.getReader();
    try { expect(new TextDecoder().decode((await ready.read()).value)).toBe('ready\n'); }
    finally { ready.releaseLock(); }
    const ownerText = await readFile(join(guard, 'owner.json'), 'utf8'), owner = JSON.parse(ownerText); nativePID = owner.pid;
    expect(Number.isSafeInteger(owner.pid)).toBe(true); expect(typeof owner.token).toBe('string'); expect(owner.token.length).toBeGreaterThan(0);
    expect(owner.timestamp).toBeGreaterThan(Date.now() - 10_000); expect(process.kill(owner.pid, 0)).toBe(true);
    const child = Bun.spawn([process.execPath, new URL('../src/main.ts', import.meta.url).pathname, '--snapshot'], {
      stdout: 'pipe', stderr: 'pipe', env: { ...process.env, CODEX_HOME: roots[0], NO_SHORT_USAGE_CLAUDE_ROOTS: '',
        NO_SHORT_USAGE_CCUSAGE: join(base, 'must-not-start'), NO_SHORT_USAGE_CACHE_DIR: root, NO_SHORT_USAGE_OFFLINE: '1', TZ: 'UTC' },
    });
    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(await child.exited).toBe(0); expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.status).toBe('stale'); expect(result.notice).toBe(notice); expect(result.history).toEqual(original.history);
    expect(await readFile(path, 'utf8')).toBe(contents); expect((await stat(path)).mtimeMs).toBe(modified);
    expect(await readFile(join(guard, 'owner.json'), 'utf8')).toBe(ownerText); expect(await readdir(scope)).toEqual(['snapshot.json']);
  } finally {
    native.kill('SIGKILL');
    if (nativePID !== undefined && nativePID !== native.pid) try { process.kill(nativePID, 'SIGKILL'); } catch { /* Interpreter already exited. */ }
    await native.exited;
  }
}, 15_000);
