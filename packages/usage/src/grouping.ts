import type { Aggregate, SessionUsage, UsageProvider, UsageSnapshot } from './types';
import { sumAggregates } from './adapter';
import * as history from './history';
import { canonicalSessionKey as canonicalKey, decodeGrouping, mergeGrouping, type SessionGrouping } from './grouping-types';
export interface GroupMember { id: string; title: string; provider: UsageProvider; kind: string; depth: number; aggregate: Aggregate }
export interface ProjectGroup { id: string; label: string; source: string; confidence: string; aggregate: Aggregate; sessions: GroupMember[] }
export interface WorkGroup { id: string; title: string; provider: UsageProvider; aggregate: Aggregate; sessions: GroupMember[]; issues: string[] }
export interface GroupedUsage { projects: ProjectGroup[]; works: WorkGroup[]; aggregate: Aggregate; sourceAggregate: Aggregate; reconciled: boolean; reconciliationIssue?: 'tokens'|'pricing' }
export interface ExactSessionRange { sessions: {sessionId:string;provider:UsageProvider;aggregate:Aggregate}[]; aggregate: Aggregate; reconciled: boolean; reconciliationIssue?: 'tokens'|'pricing' }
/** NS18 range helper supplies only canonical, event-attributed contributions; never use lifetime session costs. */
export function groupedUsage(snapshot: UsageSnapshot, provider: 'all'|UsageProvider, start: string, end: string): GroupedUsage | null {
  const exact = history.sessionUsageForRange(snapshot,provider,start,end);
  const source = history.historyView(snapshot,provider,start,end);
  if (!exact || !source) return null;
  if (exact.reconciliationIssue === 'tokens') return { projects:[],works:[],aggregate:exact.aggregate,sourceAggregate:source.aggregate,reconciled:false,reconciliationIssue:'tokens' };
  return groupSessions(snapshot.sessions,exact,source.aggregate);
}
/** Pure allocation/graph stage. Each canonical exact ledger row contributes to precisely one project and one work root. */
export function groupSessions(sessions: SessionUsage[], exact: ExactSessionRange, sourceAggregate: Aggregate): GroupedUsage {
  const metadata = new Map<string, SessionUsage>();
  const grouping = new Map<string, SessionGrouping | undefined>();
  const keyIndex = new Map<string, Set<string>>();
  const key = (provider: UsageProvider, id: string) => provider + '\0' + id;
  for (const session of sessions) {
    const id = key(session.provider ?? 'codex', session.id);
    metadata.set(id, session);
    grouping.set(id,mergeGrouping(grouping.get(id),decodeGrouping(session.grouping)));
    if (session.sessionKey) {
      const alias = key(session.provider ?? 'codex',canonicalKey(session.sessionKey)), ids = keyIndex.get(alias) ?? new Set();
      ids.add(id); keyIndex.set(alias,ids);
    }
  }
  const direct = new Map<string, Aggregate>();
  for (const row of exact.sessions) {
    const id=key(row.provider,row.sessionId);
    // NS18 guarantees canonical unique rows. A repeated row must not create a second contribution.
    if (!direct.has(id)) direct.set(id,row.aggregate);
    if (!metadata.has(id)) metadata.set(id,{ id:row.sessionId,provider:row.provider,title:'Phiên chưa xác định',kind:'unknown',lastActivity:null,...sumAggregates([]) });
  }
  const parents = new Map<string,string>(), issues = new Map<string,string[]>();
  for (const [id,session] of metadata) {
    const data=grouping.get(id), flags=[...(data?.issues ?? [])] as string[];
    if (data?.parent && !flags.includes('conflicting-parent')) {
      const candidates=keyIndex.get(key(session.provider ?? 'codex',canonicalKey(data.parent.sessionKey)));
      if (candidates?.size === 1) { const parent=[...candidates][0]; if(parent===id) flags.push('self-parent'); else parents.set(id,parent); }
      else flags.push(candidates?.size ? 'ambiguous-parent' : 'missing-parent');
    } else if (session.kind!=='main' && !flags.includes('conflicting-parent')) flags.push('missing-lineage');
    issues.set(id,flags);
  }
  const resolved=new Map<string,{root:string;depth:number}>();
  for (const id of metadata.keys()) {
    const chain:string[]=[], seen=new Set<string>(); let cursor=id, issue:string|undefined;
    while(true) {
      if(seen.has(cursor)) {issue='cycle';break;}
      seen.add(cursor);chain.push(cursor);
      if((issues.get(cursor)?.length ?? 0)>0) {issue=cursor===id?undefined:'unresolved-ancestor';break;}
      const parent=parents.get(cursor);if(!parent) break;cursor=parent;
    }
    if(issue || (issues.get(cursor)?.length ?? 0)>0) {
      if(issue) issues.set(id,[...(issues.get(id)??[]),issue]);
      resolved.set(id,{root:id,depth:0});
    } else resolved.set(id,{root:cursor,depth:chain.length-1});
  }
  const member=(id:string,depth=0):GroupMember=>{const s=metadata.get(id)!;return {id:s.id,title:s.title,provider:s.provider??'codex',kind:s.kind,depth,aggregate:direct.get(id)??sumAggregates([])};};
  const projectGroups=new Map<string,{info:ProjectGroup;values:Aggregate[]}>();
  const workGroups=new Map<string,Set<string>>();
  for(const [id,value] of direct) {
    const data=grouping.get(id),p=data?.issues?.includes('conflicting-project')?undefined:data?.project;
    const projectId=p?.id ?? 'unknown';
    const project=projectGroups.get(projectId)??{info:{id:projectId,label:p?.label??'Dự án chưa xác định',source:p?.source??'unknown',confidence:p?.confidence??'unknown',aggregate:sumAggregates([]),sessions:[]},values:[]};
    project.info.sessions.push(member(id));project.values.push(value);projectGroups.set(projectId,project);
    const root=resolved.get(id)!.root,items=workGroups.get(root)??new Set<string>();items.add(id);
    // Include metadata-only ancestors with zero direct range usage so every descendant is understandable.
    if(root!==id) {let cursor=parents.get(id);while(cursor) {if(items.has(cursor))break;items.add(cursor);if(cursor===root)break;cursor=parents.get(cursor);}}
    workGroups.set(root,items);
  }
  const projects=[...projectGroups.values()].map(p=>({...p.info,aggregate:sumAggregates(p.values)})).sort((a,b)=>a.label.localeCompare(b.label)||a.id.localeCompare(b.id));
  const works=[...workGroups].map(([root,ids]):WorkGroup=>({id:metadata.get(root)!.id,title:metadata.get(root)!.title,provider:metadata.get(root)!.provider??'codex',
    aggregate:sumAggregates([...ids].flatMap(id=>direct.has(id)?[direct.get(id)!]:[])),issues:issues.get(root)??[],
    sessions:[...ids].map(id=>member(id,resolved.get(id)?.depth??0)).sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id))})).sort((a,b)=>a.id.localeCompare(b.id));
  return {projects,works,aggregate:exact.aggregate,sourceAggregate,reconciled:exact.reconciled,...(exact.reconciliationIssue?{reconciliationIssue:exact.reconciliationIssue}:{})};
}
export interface GroupingExport {
  by:'project'|'work'; reconciled:boolean; reconciliationIssue?:'tokens'|'pricing'; allocated:Aggregate;
  groups:{label:string;provider?:UsageProvider;source?:string;confidence?:string;aggregate:Aggregate;sessions?:GroupMember[]}[];
}
export function groupingExport(value:GroupedUsage,by:'project'|'work',includeIdentifiers=false):GroupingExport {
  const groups=by==='project'?value.projects.map(group=>({label:group.label,source:group.source,confidence:group.confidence,aggregate:group.aggregate,...(includeIdentifiers?{sessions:group.sessions}:{})}))
    :value.works.map((group,index)=>({label:includeIdentifiers?group.title:`Work ${index+1}`,provider:group.provider,aggregate:group.aggregate,...(includeIdentifiers?{sessions:group.sessions}:{})}));
  return {by,reconciled:value.reconciled,...(value.reconciliationIssue?{reconciliationIssue:value.reconciliationIssue}:{}),allocated:value.aggregate,groups};
}
