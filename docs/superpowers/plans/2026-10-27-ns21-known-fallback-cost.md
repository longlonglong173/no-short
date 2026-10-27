# NS-21 Known fallback cost implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The implementation phase prohibited commits, push and PR. Follow-up on 2026-10-27 authorizes commit, push and PR for NS-21; release, installed-app changes and other task dispatch remain outside scope.

**Goal:** Preserve identified-model costs when fallback usage shares the same model.

**Architecture:** Keep canonical Codex events partitioned by `(model, isFallback)` after dedup/replay/tier resolution in unified report aggregation. Preserve those partitions through reader merges, then normalize duplicate model names into one snapshot model with additive costs. Public snapshot/export schema remains v1.

**Tech Stack:** Rust pinned ccusage patch; Bun/TypeScript adapter/tests; Swift consumer tests.

**Spec:** `docs/tasks/NS-21.md` (copy of approved uncommitted source; shared backlog worktree is untouched).

## Global constraints

- Fixture two sessions: amountUSD=null, knownCostUSD=1.6875, status=partial, totalTokens=2200000; raw cost=3.375 is not all known.
- No real logs, prices, installed app or cache modified. Only synthetic temporary sources.
- Preserve timezone, event dedup, replay/compaction, per-request pricing buckets and provider-scoped custom prices (including zero).
- No UI formatter/accessibility fixes; NS-22/23 are separate.

## Raw interface and compatibility

`modelBreakdowns` may contain two rows with the same `modelName`, separated by existing `isFallback` boolean. Each row has its own tokens/cost; row totals are unchanged. No new field is required. Claude rows remain unchanged (`isFallback` absent). Adapter merges by name only after applying each partition's price provenance. Snapshot `models` remains unique by name; `schemaVersion=1`, Cost, history, groups and export shapes remain unchanged for Swift/panel/old consumers. Existing legacy raw reports with explicit booleans remain conservatively readable; reports lacking Codex provenance still reject as before. Legacy already-collapsed fallback rows cannot recover lost information and remain unknown. Reader revision changes invalidate old caches by scope without deleting them.

## Review focus

- Valid zero custom prices and identified usage alongside unknown parts must not become fully priced by accident.
- Long-context/tier/time buckets must be priced per request inside each provenance part.
- Copy order and appended stale copies must not change known cost or duplicate usage.
- Month boundaries and provider filtering must preserve session-day reconciliation.
- Budget may alert on a known lower bound; comparison/forecast must retain incomplete-price guards.

### Task 1: Real-reader regression and partition preservation

**Files:** `packages/usage/tests/pricing-provenance.test.ts`; pinned patch; `packages/usage/src/adapter.ts`; `ccusage-source-lock.json`.
**Interfaces:** real `runReport` -> partitioned modelBreakdowns -> `buildSnapshot` -> schema-v1 unique models.

- [x] Replace old unknown/0 expectation with fixture 1e6 input, 0.5e6 cache, 0.1e6 output; assert partial/1.6875 and raw separate provenance.
- [x] Run existing runtime and record assertion RED before changing production code.
- [x] Add `CodexGroup.pricing_parts`, populated only from canonical retained events in unified aggregate_events after tier resolution. Emit partitioned rows; merge reader breakdowns by name+optional provenance.
- [x] Normalize adapter model rows by name after pricing; preserve additive status including zero.
- [x] Regenerate exact-context patch from pinned original; update revision and SHA-256; rebuild actual reader and rerun tests GREEN.

### Task 2: Reconciliation and consumer coverage

**Files:** pricing provenance tests; native consumer regression fixture/tests; existing cache and pricing tests as needed.
**Interfaces:** schema-v1 snapshot -> session/day/history/group/export, native budget/comparison/insights and panel projections.

- [x] Add real-reader matrix for one/many sessions, opposite valid provenance order, fallback-only, unknown other model, custom/zero/reset pricing, provider name collision.
- [x] Assert session-day/day/month/provider/model/group/export known-cost reconciliation with tolerance 1e-8; month boundary/timezone, copied roots and append in either root order.
- [x] Assert previous ns18 reader scope is ignored without deleting cache/source; existing legacy/no-provenance guards remain valid.
- [x] Persist a synthetic real-reader snapshot to consumer fixture. Decode same snapshot in native; budget $1 exceeded without exact remainder; stale, comparison and insufficient forecast guards retained.
- [x] Run complete Usage suite with reader required; typecheck/build UI; Swift tests; browser tests; packaging script checks and validation/diff checks as appropriate. Record build/helper/source evidence separately from installed app/Intel/release (not performed).

### Task 3: Review and handoff

- [x] Review full diff against spec, inspect regression and compatibility risks, fix material findings with RED→GREEN.
- [x] Update local task copy with evidence and remaining gates. Initial handoff kept all changes uncommitted; the follow-up authorizes commit/push/PR after verification. Report paths and test counts.
