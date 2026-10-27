# NS-22 chart accessibility implementation plan

**Goal:** Publish one meaningful USD value per History day, preserving unknown versus priced zero.
**Spec:** `docs/tasks/NS-22.md` (copied from the shared backlog; shared worktree remains untouched).
**Architecture:** Keep visual marks and source amounts intact. Test the actual SwiftUI accessibility tree using a fixed synthetic snapshot, then prevent decorative marks from contributing numeric values. If mark hiding cannot reliably remove synthesized totals, replace chart accessibility with one semantic element per day. Keep the existing day picker and selection.
**Tech stack:** SwiftUI, Swift Charts, AppKit, XCTest; macOS 14 minimum.

## Constraints and decisions
- Base: origin/main 5de4cb8 (0.7.0); branch codex/ns22-chart-accessibility.
- NS-21 absent on fetched main; integrated acceptance remains pending. Do not implement NS-21.
- No log/pricing/install changes, commits, push, PR, merge or release.
- Execute locally in this session. User supplied an approved task and requested execution; no additional plan approval or delegation.
- Keep estimated/partial/unknown, visual markers, day/provider/range, refresh and EN/VI/zh-Hans.
- Tree tests are structural evidence; render tests are visual evidence; neither proves VoiceOver audio.

## Task 1: Reproduce and correct accessibility
- [x] Run baseline Swift suite.
- [x] Add UsageHistoryAccessibilityTests.swift with fixed partial 12.34, unknown, estimated positive/zero and partial-zero days. Capture actual hosted view AX tree before changes; assert one day value and no doubled total/unknown numeric zero.
- [x] Make the smallest chart accessibility change in UsageHistoryView.swift; adjust UsageHistoryChartPoint descriptions only if required for explicit USD/status.
- [x] Run targeted tests; preserve RED and GREEN evidence.

## Task 2: Validate and hand off
- [x] Exercise selection/reset, provider/range/refresh and three languages; inspect seven-day popover chart if accessibility is shared.
- [x] Run full native and project test commands, validation and diff checks.
- [x] Review diff against spec; write local evidence and explicit pending VoiceOver and NS-21 gates to docs/tasks/NS-22.md.

## Review focus
- Unknown must have a day/status but no numeric 0; priced zero remains $0.00.
- Partial-zero must retain the visible missing-price marker.
- A selection rule must not add duplicate AX numeric data.
- Refresh/language/provider/range changes must update rather than accumulate elements.
- No proof about integrated source correctness before NS-21 or audio before direct listening.

## Execution record
- Used systematic debugging, isolated worktree, test-first semantic labels and direct fixture AX comparison.
- No extra plan approval: task scope and execution were already explicitly approved by the user. No commits or delegation.
- Runtime before: partial 12.34 reported total 24.7; unknown Details 0. Runtime after: five distinct semantic day buttons with correct amounts/statuses and working selection; checked EN/VI/zh-CN.
- Ruling: in-process SwiftUI AX probe was incomplete; discard it and label permanent tests as model/semantic tests. Obtain AX evidence from the running fixture through CUA. This avoids treating an empty tree as proof; runtime tree checks must be repeated separately from swift test.
- Ruling: use the approved isolated fixture path while NS-21 is absent. Integrated acceptance stays pending; fixture data must not be mistaken for corrected reader output.
- Final review: self-review; no subagents/model change, no production money/data changes. Native Chart accessibility is replaced by selectable daily entries; direct VoiceOver listening remains pending.
- Validation and exact counts are in docs/tasks/NS-22.md. Required human/device/dependency gates remain open; only local implementation and fixture validation are complete.

## PR authorization
- User explicitly requested a PR after local implementation. Commit and push this task branch for review; preserve the VoiceOver and NS-21 acceptance gates, worktree, and shared backlog. No merge, app installation or release is authorized.
