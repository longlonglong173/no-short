# NS-15 Update Status Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline and TDD, with one fresh whole-branch review.

**Goal:** Visible running version, quiet daily discovery and signed0.6.1 release for testing from0.6.0.
**Architecture:** Existing shared coordinator owns cadence/cache; Sparkle informational probes never present/download/install; a compact shared presentation feeds the popover/About/menu.
**Tech Stack:** Swift6, SwiftUI/AppKit, pinned Sparkle2.10.0, Bun release scripts.
**Spec:** docs/superpowers/specs/2026-10-26-ns15-update-status-design.md

## Global Constraints
Canonical existing owner key/feed; no key rotation. macOS14+, ARM updates, EN/VI/zh-CN; at most one automatic attempt per86400s; manual retries allowed; no background downloads/install/popup or OS notifications. Installed user app untouched. Immutable release assets before feed deployment.

## Review Focus
Stale/invalid defaults cannot grant install trust; cancelled sessions must not hide known availability or block retry; duplicate/manual/probe races and shutdown must remain gated; background errors must not claim current; small-screen/footer wrapping and language must preserve reachability.

## Task 1 — Cadence and signed informational checks
- [ ] Add failing coordinator tests for24h cadence/relaunch, off/manual, busy/maintenance, cached available after probe completion/cancel and failure/future timestamps.
- [ ] Extend NativeUpdateDriving with `checkForUpdateInformation() throws`. Coordinator takes optional defaults, installedVersion and injected clock; exposes lastCheckedAt, releaseVersion and automaticChecksEnabled. Persist channel-scoped version/timestamps only.
- [ ] Implement Sparkle probe dispatch using `.updateInformation`, keep SDK scheduler/download/profiling disabled and make duplicate finish callbacks idempotent. Run coordinator tests then native suite. Commit.

## Task 2 — Main popover, status and real quiet-probe proof
- [ ] Add AppUpdatePresentation and AppUpdateStatusView; test unknown/current/newer/error/busy/localized rendering and panel propagation; capture EN/VI/zh light/dark renders.
- [ ] Bind About/coordinator status to panel and menu; add on/off toggle in About/settings, app-owned timer/startup/wake/open due checks; cancel tasks/timer on termination and avoid maintenance/asleep.
- [ ] Extend isolated harness with a no-interaction informational-probe case: newer signed feed → available notice, exactly one feed request, no archive/UI/install, repeated due checks suppressed. Run actual controlled executable plus strict guard tests; normal builds contain no hooks. Commit.

## Task 3 — Release0.6.1 and assets-first rollout
- [ ] Bump identities, rebuild manifests for new0.6.1 URLs, update privacy/daily-check guidance and release record. Run Usage/browser/native/website/typecheck/validation and configured native builds/smoke/package.
- [ ] One independent review, fix concrete issues with regressions. PR source/release, verify CI, integrate authorized release, sign final ZIP with existing owner key, publish immutable assets and verify public downloads/extracted app.
- [ ] Separate feed/website PR updates signed feed to0.6.1 after assets are public. Verify CI/review and production signed bytes, URLs/translations. Retain0.6.0 bytes/key and record device acceptance separately.
