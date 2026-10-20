import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeBundleLinks } from './sparkle-bundle';

for (const kind of ['valid','absolute','escape','dangling','cycle','outside','root'] as const) {
  test(`Sparkle link policy: ${kind}`, async () => {
    const app = await mkdtemp(join(tmpdir(),'ns14-links-'));
    const framework=join(app,'Contents/Frameworks/Sparkle.framework');
    try {
      await mkdir(join(framework,'Versions/B'),{recursive:true});
      await writeFile(join(framework,'Versions/B/Sparkle'),'fixture');
      if(kind==='valid') { await symlink('B',join(framework,'Versions/Current')); await symlink('Versions/Current/Sparkle',join(framework,'Sparkle')); }
      if(kind==='absolute') await symlink(join(framework,'Versions/B/Sparkle'),join(framework,'Sparkle'));
      if(kind==='escape') await symlink('../../../..',join(framework,'outside'));
      if(kind==='dangling') await symlink('absent',join(framework,'Sparkle'));
      if(kind==='cycle') { await symlink('two',join(framework,'one')); await symlink('one',join(framework,'two')); }
      if(kind==='outside') await symlink('../Frameworks/Sparkle.framework',join(app,'Contents/alias'));
      if(kind==='root') { await rm(framework,{recursive:true}); await symlink('/tmp',framework); }
      if(kind==='valid') await expect(assertSafeBundleLinks(app)).resolves.toBeUndefined();
      else await expect(assertSafeBundleLinks(app)).rejects.toThrow();
    } finally { await rm(app,{recursive:true,force:true}); }
  });
}
