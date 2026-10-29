import { expect, test } from 'bun:test';
const workflow=await Bun.file(new URL('../../../.github/workflows/validate.yml',import.meta.url)).text();
const jobs=(Bun.YAML.parse(workflow) as any).jobs;
function render(template:string,values:Record<string,string>) {
 return template.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g,(_,key)=>{if(!(key in values))throw Error(`Unbound workflow value: ${key}`);return values[key]!;});
}
test('producer reruns retain distinct evidence and an Intel-only rerun consumes the original producer identity',()=>{
 const producer=jobs['usage-macos'],consumer=jobs['usage-menubar-macos'];
 const upload=producer.steps.find((s:any)=>s.uses==='actions/upload-artifact@v4'&&s.with.path==='.artifacts/candidate/');
 const renderUpload=producer.steps.find((s:any)=>s.uses==='actions/upload-artifact@v4'&&s.with.path==='.artifacts/native-render-evidence/');
 const download=consumer.steps.find((s:any)=>s.uses==='actions/download-artifact@v4');
 const receipt=consumer.steps.find((s:any)=>s.name==='Save a separate Intel verification receipt and recheck original ARM set unchanged');
 const consumerUpload=consumer.steps.find((s:any)=>s.uses==='actions/upload-artifact@v4');
 const context={'steps.identity.outputs.version':'0.7.1','steps.identity.outputs.source_commit':'a'.repeat(40),'github.run_id':'400','github.run_attempt':'1'};
 const original=render(producer.outputs.artifact_name,context),rerun=render(producer.outputs.artifact_name,{...context,'github.run_attempt':'2'});
 expect(original).toBe(`no-short-experimental-0.7.1-${'a'.repeat(40)}-400-1`);expect(rerun).not.toBe(original);
 expect(render(upload.with.name,context)).toBe(original);expect(render(upload.with.name,{...context,'github.run_attempt':'2'})).toBe(rerun);
 expect(render(renderUpload.with.name,context)).not.toBe(render(renderUpload.with.name,{...context,'github.run_attempt':'2'}));
 const consumerContext={'needs.usage-macos.outputs.artifact_name':original,'needs.usage-macos.outputs.version':'0.7.1','needs.usage-macos.outputs.source_commit':'a'.repeat(40),'github.run_id':'400','github.run_attempt':'2'};
 expect(render(download.with.name,consumerContext)).toBe(original);
 expect(render(receipt.env.NO_SHORT_CANONICAL_ARTIFACT,consumerContext)).toBe(original);
 expect(render(consumerUpload.with.name,consumerContext)).toBe(`no-short-intel-verification-0.7.1-${'a'.repeat(40)}-400-2`);
});

test('workflow missing or malformed credential prerequisites stop before any credential material is written',async()=>{
 const {mkdtemp,readdir,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const prepare=(Bun.YAML.parse(await Bun.file(new URL('../../../.github/workflows/prepare-macos-release.yml',import.meta.url)).text()) as any).jobs.prepare;
 const script=prepare.steps.find((s:any)=>s.name==='Import Developer ID and notary credentials into a temporary keychain').run;
 const required=['CERTIFICATE_BASE64','CERTIFICATE_PASSWORD','NOTARY_KEY','NOTARY_KEY_ID','NOTARY_ISSUER_ID','SIGN_IDENTITY','APPLE_TEAM_ID'];
 const directory=await mkdtemp(join(tmpdir(),'ns-credential-preflight-'));
 try {
  for(const missing of [...required,'invalid-team']) {
   const settings=Object.fromEntries(required.map(name=>[name,'test-only-placeholder']));settings.APPLE_TEAM_ID='ABCDEFGHIJ';
   if(missing==='invalid-team')settings.APPLE_TEAM_ID='invalid';else settings[missing]='';
   // No credential bytes and no external commands in PATH: even a regressed
   // guard cannot access security/notarytool on the test host.
   const child=Bun.spawn(['/bin/bash','-c',script],{env:{...settings,PATH:directory,HOME:directory,RUNNER_TEMP:directory},stdout:'pipe',stderr:'pipe'});
   const out=await new Response(child.stdout).text();expect(await child.exited).not.toBe(0);
   expect(out).toContain(missing==='invalid-team'?'Invalid APPLE_TEAM_ID':`Missing macos-release setting: ${missing}`);
   expect(await readdir(directory)).toEqual([]);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
