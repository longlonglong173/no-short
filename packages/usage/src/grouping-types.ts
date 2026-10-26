import { z } from 'zod';
const safeLabel = z.string().min(1).max(160).refine(s => !/[\\/\u0000-\u001f\u007f]/.test(s));
export const groupingSchema = z.object({
  project: z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), label: safeLabel,
    source: z.enum(['git-common-dir', 'recorded-directory']), confidence: z.enum(['verified', 'recorded']) }).refine(p => (p.source === 'git-common-dir') === (p.confidence === 'verified')).optional(),
  parent: z.object({ sessionKey: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/), source: z.literal('codex-session-meta') }).optional(),
  issues: z.array(z.enum(['conflicting-project', 'conflicting-parent'])).max(2).optional(),
});
export type SessionGrouping = z.infer<typeof groupingSchema>;
export function decodeGrouping(value: unknown): SessionGrouping | undefined {
  const result = groupingSchema.safeParse(value); return result.success ? result.data : undefined;
}
export function mergeGrouping(a?: SessionGrouping, b?: SessionGrouping): SessionGrouping | undefined {
  a = decodeGrouping(a); b = decodeGrouping(b);
  if (!a) return b; if (!b) return a;
  const issues = new Set([...(a.issues ?? []), ...(b.issues ?? [])]);
  if (a.project && b.project && a.project.id !== b.project.id) issues.add('conflicting-project');
  if (a.parent && b.parent && a.parent.sessionKey !== b.parent.sessionKey) issues.add('conflicting-parent');
  const project = issues.has('conflicting-project') ? undefined : a.project ?? b.project;
  const parent = issues.has('conflicting-parent') ? undefined : a.parent ?? b.parent;
  return { ...(project ? { project } : {}), ...(parent ? { parent } : {}), ...(issues.size ? { issues: [...issues].sort() } : {}) };
}
