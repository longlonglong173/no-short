import { lstat, readdir, readlink, realpath, mkdir, readFile, copyFile } from 'node:fs/promises';
import { join, resolve, isAbsolute, relative } from 'node:path';

export const pinnedSparkleVersion = '2.10.0';
const packageRoot=resolve(import.meta.dirname,'..');
export const sparkleFramework=join(packageRoot,'.build/artifacts/sparkle/Sparkle/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework');
const inside=(base:string,path:string)=>path.startsWith(base+'/');
async function exec(args:string[]):Promise<string> {
  const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});
  const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
  if(code) throw Error(`Sparkle ${args[0]} failed: ${err.trim()}`);
  return out.trim();
}
export async function assertSafeBundleLinks(app:string):Promise<void> {
  if((await lstat(app)).isSymbolicLink()) throw Error('Unexpected app symlink');
  const root=await realpath(app), framework=join(root,'Contents/Frameworks/Sparkle.framework');
  async function walk(path:string) {
    const info=await lstat(path);
    if(info.isSymbolicLink()) {
      if(!inside(framework,path)) throw Error('Unexpected bundle symlink');
      const target=await readlink(path);
      if(isAbsolute(target)) throw Error('Absolute framework symlink');
      const canonical=await realpath(path);
      if(!inside(framework,canonical)) throw Error('Escaping framework symlink');
      return;
    }
    if(info.isDirectory()) for(const name of await readdir(path)) await walk(join(path,name));
    else if(!info.isFile()) throw Error('Unexpected bundle file type');
  }
  await walk(root);
}
export async function sparkleCode(app:string):Promise<string[]> {
  const root=join(app,'Contents/Frameworks/Sparkle.framework'), code:string[]=[];
  async function walk(path:string) {
    const info=await lstat(path); if(info.isSymbolicLink()) return;
    if(info.isDirectory()) {
      for(const name of await readdir(path)) await walk(join(path,name));
      if(/\.(xpc|app|framework)$/.test(path)) code.push(path);
    } else if(info.isFile()) {
      const bytes=await readFile(path); const magic=bytes.subarray(0,4).toString('hex');
      if(['cffaedfe','cefaedfe','cafebabe','bebafeca','cffaedfe'].includes(magic)) code.push(path);
    }
  }
  await walk(root); return [...new Set(code)];
}
export async function embedSparkle(app:string, framework=sparkleFramework, identity?:string):Promise<void> {
  if(resolve(framework)!==sparkleFramework || (await lstat(framework)).isSymbolicLink()) throw Error('Only the pinned SwiftPM framework is permitted');
  const lock=JSON.parse(await readFile(join(packageRoot,'Package.resolved'),'utf8'));
  if(!lock.pins?.some((p:any)=>p.identity==='sparkle' && p.state.version===pinnedSparkleVersion && p.state.revision==='eef1a539a373c1f1a320624b1130fc5de7b2e100')) throw Error('Sparkle lock mismatch');
  await mkdir(join(app,'Contents/Frameworks'),{recursive:true});
  await exec(['/usr/bin/ditto',framework,join(app,'Contents/Frameworks/Sparkle.framework')]);
  await copyFile(join(packageRoot,'.build/checkouts/Sparkle/LICENSE'),join(app,'Contents/Resources/SPARKLE_LICENSE.txt'));
  await assertSafeBundleLinks(app);
  for(const path of await sparkleCode(app)) {
    const args=['/usr/bin/codesign','--force','--sign',identity??'-'];
    if(identity) args.push('--options','runtime','--timestamp');
    await exec([...args,path]);
  }
}
export async function verifySparkleBundle(app:string,platform:string):Promise<void> {
  await assertSafeBundleLinks(app);
  const framework=join(app,'Contents/Frameworks/Sparkle.framework');
  const plist=JSON.parse(await exec(['/usr/bin/plutil','-convert','json','-o','-',join(framework,'Resources/Info.plist')]));
  if(plist.CFBundleShortVersionString!==pinnedSparkleVersion || plist.CFBundleIdentifier!=='org.sparkle-project.Sparkle') throw Error('Unexpected Sparkle framework identity');
  for(const path of await sparkleCode(app)) {
    await exec(['/usr/bin/codesign','--verify','--strict',path]);
    if(!(await lstat(path)).isDirectory()) {
      const arch=platform==='darwin-arm64'?'arm64':'x86_64';
      if(!(await exec(['/usr/bin/lipo','-archs',path])).split(' ').includes(arch)) throw Error('Sparkle architecture mismatch');
    }
  }
  const binary=join(app,'Contents/MacOS/NoShortUsageMenuBar');
  const dependencies=await exec(['/usr/bin/otool','-L',binary]);
  if(!dependencies.includes('@rpath/Sparkle.framework/Versions/B/Sparkle')) throw Error('Missing Sparkle runtime link');
  const commands=await exec(['/usr/bin/otool','-l',binary]);
  if(!commands.includes('@executable_path/../Frameworks')) throw Error('Missing framework rpath');
  for(const name of ['en.lproj','vi.lproj','zh_CN.lproj']) {
    // English source strings may use Base.lproj.
    if(name==='en.lproj') continue;
    await lstat(join(framework,'Resources',name));
  }
}
