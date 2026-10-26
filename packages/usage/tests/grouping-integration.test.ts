import { expect,test } from 'bun:test';
import { groupedUsage } from '../src/grouping';
import { createUsageExport,serializeUsageExport } from '../src/export';
import fixture from './fixtures/grouping-snapshot.json';
import type {UsageSnapshot} from '../src/types';
const source=()=>structuredClone(fixture) as UsageSnapshot;
test('NS18 range helper drives project/work totals and existing provider/range exports',()=>{
 const s=source(),view=groupedUsage(s,'codex','2026-10-27','2026-10-27')!;
 expect(view).not.toBeNull();expect(view.aggregate.tokens.total).toBe(12);expect(view.reconciled).toBe(true);
 const output=createUsageExport(s,'codex','2026-10-27','2026-10-27',{groupBy:'project'})!;
 expect(output.grouping?.groups.reduce((a,b)=>a+b.aggregate.tokens.total,0)).toBe(12);
 expect(output.grouping?.groups.find(g=>g.label==='Dự án chưa xác định')?.aggregate.tokens.total).toBe(3);
 for(const format of ['csv','json'] as const) {const text=serializeUsageExport(output,format);expect(text).not.toContain('Private');expect(text).not.toContain('rollout-');expect(text).not.toContain('/private/');}
 const work=createUsageExport(s,'codex','2026-10-27','2026-10-27',{groupBy:'work'})!;
 expect(work.grouping?.groups).toHaveLength(2);expect(JSON.stringify(work)).not.toContain('Private');
 const detail=createUsageExport(s,'codex','2026-10-27','2026-10-27',{groupBy:'work',includeSessionIdentifiers:true})!;
 expect(serializeUsageExport(detail,'json')).toContain('rollout-child');expect(serializeUsageExport(detail,'csv')).toContain('selected-range-direct');
 expect(serializeUsageExport(detail,'csv')).not.toContain('999');
 const claude=groupedUsage(s,'claude','2026-10-26','2026-10-26')!;expect(claude.aggregate.tokens.total).toBe(2);expect(claude.works).toHaveLength(1);
});
test('incompatible/malformed ledger never falls back to lifetime, mismatch remains explicit',()=>{
 const s=source();delete s.history!.sessionDays;
 expect(groupedUsage(s,'all','2026-10-27','2026-10-27')).toBeNull();
 expect(createUsageExport(s,'all','2026-10-27','2026-10-27',{groupBy:'project'})).toBeNull();
 const mismatch=source();mismatch.history!.days[0].aggregate.tokens.input+=1;mismatch.history!.days[0].aggregate.tokens.total+=1;
 const uncertain=groupedUsage(mismatch,'all','2026-10-26','2026-10-26')!;expect(uncertain.reconciled).toBe(false);expect(uncertain.projects).toHaveLength(0);
 expect(createUsageExport(mismatch,'all','2026-10-26','2026-10-26',{groupBy:'project'})).toBeNull();
});
test('group CSV uses the existing formula guard for BOM/whitespace project labels and opted-in titles',()=>{
 for(const prefix of ['=','+','-','@','  =','\uFEFF=']) {
  const s=source();for(const session of s.sessions) {session.title=prefix+'PRIVATE';if(session.grouping?.project)session.grouping.project.label=prefix+'PROJECT';}
  const doc=createUsageExport(s,'codex','2026-10-27','2026-10-27',{groupBy:'project',includeSessionIdentifiers:true})!;
  const csv=serializeUsageExport(doc,'csv');expect(csv).toContain('"\''+prefix+'PROJECT"');expect(csv).toContain('"\''+prefix+'PRIVATE"');
 }
});
