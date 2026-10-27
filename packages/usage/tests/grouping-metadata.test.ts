import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readMetadata } from '../src/metadata';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
test('safe explicit project and lineage survive cache; deleted cwd becomes unknown without path leakage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ns13-')); dirs.push(root);
  const cwd = join(root, 'my-project'); await mkdir(cwd); await mkdir(join(root, 'sessions'));
  const id = '11111111-1111-4111-8111-111111111111';
  await writeFile(join(root, 'sessions', id + '.jsonl'), JSON.stringify({ type: 'session_meta', payload: { id, cwd,
    source: { subagent: { thread_spawn: { parent_thread_id: 'parent' } } } } }) + '\n' + JSON.stringify({ message: 'PRIVATE_MESSAGE' }));
  const options = { cacheDir: join(root, 'cache') };
  const value = (await readMetadata([root], options)).get(id)!;
  expect(value.grouping?.project?.label).toBe('my-project');
  expect(value.grouping?.project?.source).toBe('recorded-directory');
  expect(value.grouping?.parent?.sessionKey).toBe('parent');
  expect(JSON.stringify(value)).not.toContain(root);
  expect(JSON.stringify(value)).not.toContain('PRIVATE_MESSAGE');
  expect((await readMetadata([root], options)).get(id)?.grouping).toEqual(value.grouping);
  await rm(cwd, { recursive: true });
  expect((await readMetadata([root], options)).get(id)?.grouping?.project).toBeUndefined();
});
test('duplicate copies with conflicting parent/project metadata stay unresolved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ns13-')); dirs.push(root);
  const id = '11111111-1111-4111-8111-111111111111';
  for (const [dir, parent] of [['sessions', 'a'], ['archived_sessions', 'b']]) {
    await mkdir(join(root, dir));
    await writeFile(join(root, dir, id + '.jsonl'), JSON.stringify({ type: 'session_meta', payload: { id, source: { subagent: { thread_spawn: { parent_thread_id: parent } } } } }));
  }
  const value = (await readMetadata([root])).get(id)!;
  expect(value.grouping?.parent).toBeUndefined();
  expect(value.grouping?.issues).toContain('conflicting-parent');
});
test('Git common-dir groups subdirectories and worktrees, cwd rename/deletion never stays cached', async () => {
  const { execFileSync }=await import('node:child_process'); const {projectMetadata}=await import('../src/project-metadata');
  const root=await mkdtemp(join(tmpdir(),'ns13-'));dirs.push(root);
  const repo=join(root,'repo'),worktree=join(root,'linked');await mkdir(repo);
  const git=(...args:string[])=>execFileSync('git',args,{cwd:repo,stdio:'pipe',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1'}});
  git('init');git('-c','user.email=fixture@example.invalid','-c','user.name=Fixture','-c','commit.gpgsign=false','commit','--allow-empty','-m','fixture');git('worktree','add','--detach',worktree);
  await mkdir(join(repo,'sub'));
  const a=await projectMetadata(repo),b=await projectMetadata(join(repo,'sub')),c=await projectMetadata(worktree);
  expect(a?.source).toBe('git-common-dir');expect(a?.confidence).toBe('verified');expect(a?.id).toBe(b?.id);expect(a?.id).toBe(c?.id);
  expect(JSON.stringify(a)).not.toContain(root);
  const {rename}=await import('node:fs/promises');await rename(repo,join(root,'renamed'));
  expect(await projectMetadata(repo)).toBeUndefined();
  expect((await projectMetadata(join(root,'renamed')))?.label).toBe('renamed');
});
test('optional grouping trust boundary strips extra raw paths and rejects false confidence', async () => {
  const {decodeGrouping,mergeGrouping}=await import('../src/grouping-types');
  const p={id:'a'.repeat(64),label:'App',source:'recorded-directory',confidence:'recorded',path:'/private/project'};
  expect(JSON.stringify(decodeGrouping({project:p}))).not.toContain('/private/');
  expect(JSON.stringify(mergeGrouping(undefined,{project:p} as any))).not.toContain('/private/');
  expect(decodeGrouping({project:{...p,confidence:'verified'}})).toBeUndefined();
  expect(decodeGrouping({project:{...p,label:'/private/project'}})).toBeUndefined();
});
test('conflicting explicit projects across source copies enter unknown bucket without path exposure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ns13-'));dirs.push(root);const id='11111111-1111-4111-8111-111111111111';
 for(const [directory,label] of [['sessions','first'],['archived_sessions','second']]) {
  const cwd=join(root,label);await mkdir(cwd);await mkdir(join(root,directory));
  await writeFile(join(root,directory,id+'.jsonl'),JSON.stringify({type:'session_meta',payload:{id,cwd,source:'cli'}}));
 }
 const value=(await readMetadata([root])).get(id)!;
 expect(value.grouping?.project).toBeUndefined();expect(value.grouping?.issues).toContain('conflicting-project');expect(JSON.stringify(value)).not.toContain(root);
});
test('parent merge treats UUID letter case as equivalent and preserves case-sensitive opaque identities',async()=>{
 const {mergeGrouping}=await import('../src/grouping-types');const id='abcdefab-cdef-4abc-8abc-abcdefabcdef';
 const lineage=(sessionKey:string)=>({parent:{sessionKey,source:'codex-session-meta' as const}});
 expect(mergeGrouping(lineage(id),lineage(id.toUpperCase()))?.issues).toBeUndefined();
 expect(mergeGrouping(lineage('OpaqueParent'),lineage('opaqueparent'))?.issues).toContain('conflicting-parent');
});
