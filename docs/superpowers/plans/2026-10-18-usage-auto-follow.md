# Usage Auto Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Track Codex and Claude Code usage and automatically follow locally submitted conversations while respecting pins.
**Architecture:** Extend the existing report boundary with provider identities and breakdowns. Native hooks publish private activity records consumed by the companion; transcript writes trigger coalesced refreshes.
**Tech Stack:** Bun/TypeScript, pinned ccusage 20.0.34, Swift 6, AppKit/SwiftUI/Charts, macOS 14.
**Spec:** docs/superpowers/specs/2026-10-18-usage-auto-follow-design.md

## Global Constraints
- No prompt/response content in activity files; native hooks exit silently and cannot block chats on errors.
- MCP defaults to Codex-only; native companion opts into Claude. Keep schema-v1 compatibility and unknown/partial prices.
- Preserve other hooks/settings and all pre-existing workspace changes. Never bypass Codex hook trust.
- Existing local feature branch; implementation is explicitly authorized in this chat. Keep work in place because required Usage foundations are still untracked; do not move or reset them.

## Review Focus
- Same session UUID across providers must remain distinct.
- New prompt without token records must not show the preceding session's price.
- Concurrent chats and late Stop events must not steal selection or end a newer turn.
- Malformed settings or events must preserve user configuration and remain nonblocking.
- Refresh bursts, sleep/wake and stale events must preserve bounded process lifetimes.

### Task 1: Provider-aware reports
**Files:** packages/usage/src/{types,adapter,runner,service,metadata}.ts; packages/usage/tests/providers.test.ts
**Interfaces:** existing buildSnapshot gains providers; snapshots gain optional providerBreakdowns and per-session provider/sessionKey. ServiceOptions gains claudeRoots.
- [x] Write failing mixed-provider, identity, private metadata, source isolation and pinned-native-CLI tests; run them RED.
- [x] Enable explicit Claude roots and normalize mixed reports; preserve default Codex-only behavior and cache scoping.
- [x] Run npm test and npm run typecheck:usage; commit exact changed feature paths only.

### Task 2: Activity events and hook installation
**Files:** new UsageCore/{SessionActivity,HookInstaller}.swift; native Main.swift; tests SessionActivityTests.swift and HookInstallerTests.swift.
**Interfaces:** SessionActivity contains provider/session/event/turn/time; ActivityStore publishes and reads bounded private records. HookInstaller merges/removes owned command handlers. Main --usage-hook provider reads bounded stdin before starting AppKit.
- [x] Write failing privacy, child filtering, ordering, malformed input and merge/idempotency/removal tests; run RED.
- [x] Implement native event command, file store and conservative settings installer with backups and no trust bypass.
- [x] Run Swift tests and commit.

### Task 3: Automatic following and panel
**Files:** UsageCore Snapshot.swift, LogSource.swift, SnapshotClient.swift; native UsagePanelModel.swift, UsagePopoverView.swift, AppDelegate.swift and new ActivityMonitor.swift; model/render tests.
**Interfaces:** panel consumes latest activity, persists filter/pin; monitor delivers changes and coalesced log-write callbacks; LogSource includes independent Claude roots.
- [x] Write failing provider matching, waiting-cost, pin, late-stop, restore and source tests; run RED.
- [x] Wire provider picker, all totals, automatic status, watcher, connection controls and lifecycle cleanup.
- [x] Run native and Usage suites, render synthetic light/dark/waiting/all panels, inspect images; commit.

### Task 4: Integration and delivery
**Files:** docs/no-short-usage-menubar.md; scoped diagnostics/artifacts.
- [x] Build Usage and both native architectures; smoke-test controlled empty roots and hook event delivery without model calls.
- [x] Obtain one fresh reviewer for this feature range, resolve material findings with RED/GREEN tests.
- [x] Rebuild package, reopen companion, document actual hook configuration/trust and live verification boundaries. No publish/push.
