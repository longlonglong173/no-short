# NS-23 Money Presentation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User supplied and approved the task specification. Initial execution left edits uncommitted; user subsequently authorized commit/push/PR on 2026-10-27. Do not merge, install or release. Do not contact other chats or implement NS-21.

**Goal:** Preserve known money consistently in native and Codex panel.
**Architecture:** Keep `costText(Cost, Language): string` as the panel formatter, using the status contract already used by `UsagePresentation.money`. Share literal fixture expectations between TypeScript and Swift; make the decimal rounding rule explicit if parity testing exposes a difference. Keep aggregation/schema/export/analytics unchanged.
**Tech Stack:** TypeScript/React, Bun, Playwright, Swift/Foundation/SwiftUI.
**Spec:** [NS-23](../../tasks/NS-23.md); copied from the shared backlog, which remains untouched.

## Global Constraints
- estimated12.34=$12.34; partial12.34=≥$12.34; unknown=—; estimated0=$0.00; partial0=≥$0.00 with missing-price explanation.
- USD with two decimals, en-US grouping, same half-cent rounding across native/panel.
- Preserve Vietnamese, English, simplified Chinese, pricing origin, date/lifetime scope, stale and API estimate explanations.
- No data/schema/custom pricing/log changes. No exact incomplete-price deltas or forecasts.
- Base origin/main 5de4cb8 (v0.7.0). NS-21 is not implemented on this base or in its task record; integrated acceptance stays pending.

## Review Focus
- Zero partial must stay distinguishable from known zero and unknown.
- Large amounts at 360px must preserve ≥ and all digits without page overflow.
- Legacy schema-v1 without pricing metadata must retain its cost/status and stale warnings.
- Every list, history drilldown, group and both comparison periods must retain known costs exactly once.
- Missing price in either comparison period must keep delta/forecast unavailable.

### Task 1: Formatter parity
**Files:** ui/model.ts, UsageCore/Presentation.swift, tests/ui-model.test.ts, tests/fixtures/money-presentation.json, UsageCoreTests/MoneyPresentationTests.swift.
**Interfaces:** costText(Cost, Language): string; UsagePresentation.money(UsageCost) -> String, unchanged.
- [x] Add literal fixture rows for five required states plus small/large/grouping/half-cent boundaries; execute in both languages.
- [x] Run Bun and Swift tests before fixing; record failures.
- [x] Implement status-first cost formatting and align rounding minimally if needed.
- [x] Run focused tests then full Usage and Swift suites.

### Task 2: Consumer display and narrow layout
**Files:** ui/panel.tsx, ui/history.tsx, ui/localization.ts, ui/style.css (only demonstrated overflow), tests/browser/money.pw.ts and affected existing browser expectations.
**Interfaces:** All consumers retain the formatter above; no numeric data mutation.
- [x] Browser fixtures cover session/main/model/today/month, history/day/session detail, project/work, comparison current/previous. Assert incomplete delta guard and legacy/stale.
- [x] Capture before screenshots, observe failing known-cost/duplicate/layout assertions.
- [x] Remove duplicate known-cost suffixes/notes; retain localized missing-price explanation and add existing native ≥/— legend in panel.
- [x] Test three languages, light/dark, 360px and large values; capture after screenshots; inspect actual renders.
- [x] Render native compact fixtures in three languages for parity; inspect outputs.

### Task 3: Verification and handoff
- [x] Run full Usage, browser, Swift/script, typecheck, UI build, validate and diff checks. Report failures/skips exactly.
- [x] Review diff against all spec requirements. Record source/local/render/host/integration evidence separately in docs/tasks/NS-23.md.
- [x] Inspect whether the changed panel is available in live Codex without installation/config changes; recorded unavailable in this session. Host gate remains pending; browser fixture is not host verification.
- [x] Initially leave all edits uncommitted for user review; subsequently prepare commit/push/PR at the user’s request.

## Outcome
Local implementation verified. Integration after NS-21 and real Codex host acceptance remain pending. User scope overrides skill delegation defaults; review was performed by the author. Commit/push/PR were authorized after local implementation was reported. See docs/tasks/NS-23.md for evidence and limits.
