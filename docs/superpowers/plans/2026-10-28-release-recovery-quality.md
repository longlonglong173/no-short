# No Short Usage release recovery and quality implementation plan

> Approved by the owner in chat on 2026-10-28. Execute task by task with a fresh implementer and independent task reviewer, then a whole-branch review. Use superpowers:subagent-driven-development. This document preserves the approved design and execution decisions.

**Goal:** Correct the 0.7.1 data/distribution regressions, prepare a verifiable Experimental 0.7.2 draft, and implement the independently actionable macOS distribution readiness work.

**Architecture:** Preserve the pinned Bun 1.3.13, Rust 1.98.1, ccusage 20.0.34 source/patch and Sparkle 2.10.0 stack. Use strict raw-report validation, versioned cache policy, transactional build staging and verification of the actual final archives. Prepare publication changes separately from the owner's merge/publish decision.

**Spec:** This approved design; `docs/releases/in-app-updates.md`; existing NS-21 raw-report and cost invariants. If older source-task documents prohibit commits/push for their original scope, that historical restriction does not override this approved implementation.

## Global constraints

- Worktree: `/Users/long/.codex/worktrees/harden-release-0-7-2/no-short`; branch `codex/harden-release-0.7.2`; starting commit `6faed4e4992c66bf52568c3f249091318d1b2e78`.
- Do not modify the original checkout, its untracked files, installed app, real provider logs, preferences or caches. Automated runs use synthetic data and private owned temporary paths.
- Preserve snapshot/export schema v1, bundle ID, owner update key and pinned toolchains. No new product features or redesign.
- Owner clarification during execution: migrate CI to macOS 15 and pin Xcode 16.4, rerunning compatibility checks; keep Bun/Rust/ccusage/Sparkle pins unchanged. macOS 14 remains the product minimum, with separate minimum-OS device acceptance. The macOS 14 hosted runner retires on 2026-11-02 ([GitHub notice](https://github.com/actions/runner-images/issues/13518)).
- Public native app is ARM only; build/verify both runtime architectures and state which actually executed. Do not present Intel native app as accepted.
- Every behavior fix gets RED/GREEN evidence. Required artifact tests cannot silently skip. All P0/P1 issues must be fixed before any release.
- No production key in Git, logs, app, website or command arguments. Reuse the existing owner key via protected file/stdin; do not rotate/generate a replacement. Missing credentials block only dependent signing/publication, not independent work.
- Prepare three PRs: containment, source/tooling hardening, release 0.7.2. Owner retains public publish and PR merge authority. Draft creation, branch push and PR preparation are authorized. Release-0.7.1 warning/Latest metadata corrections are authorized; preserve historical tags/assets.
- Native updater updates the app only. Owners of updater-less 0.7.1 ZIPs require one manual reinstall; compatible old updater installations use the signed channel. Do not claim retrofit.
- Evidence must distinguish source tests, final artifact tests, isolated updater lifecycle, live deployment and actual owner/device acceptance.

## Review focus

- Stale/partial build output must never become a publishable candidate.
- Legacy raw reports and snapshots must not turn guessed model prices into complete estimates.
- Packaged readers/helpers, not just source-working-tree binaries, must pass regressions.
- Failed/cancelled updates must preserve the old app and fixture preferences/logs/exports; daily discovery must not download archives.
- Credentials, native UI and device prerequisites must be reported honestly, without converting missing evidence into a pass.

### Task 1: Contain the faulty 0.7.1 recommendation

**Files:** website download copy/translations/tests, README and installation guides; containment evidence under `.artifacts/release-recovery/`; prepare owner-reviewable PR changes.

**Interfaces:** Consumes immutable public 0.7.0 ZIP/feed/checksums. Produces a verified temporary download recommendation, coherent website tests and a containment evidence report. No runtime code changes.

- [ ] Download public 0.7.0 evidence and ARM ZIP into owned artifacts. Verify feed/archive Ed25519 against the committed owner public key, exact hashes, nested code signatures, architecture, Sparkle link/resources, key/feed configuration and runtime provenance using the release's own runtime manifest.
- [ ] Execute reader extracted from this ZIP against synthetic independent-session/copy-dedup/session-day/fallback fixtures. Require correct 220-token total, copied sessions counted once, valid ledger and no inferred price represented as identified. The pre-NS21 loss of known subtotal may remain explicitly documented as a temporary limitation, never disguised as complete pricing.
- [ ] If those gates pass, recommend 0.7.0 temporarily. If any fails, suspend recommended download and show recovery-in-progress; do not select another fallback without evidence. Preserve history links and all historical asset bytes.
- [ ] Align index, guide, README, native/plugin guidance and EN/VI/zh-CN translations; explain 0.7.1 recovery and no public Intel native support. Fix existing failing website expectations to test the chosen policy consistently.
- [ ] Run full website tests and relevant validation, record baseline unrelated failures, commit containment independently. Report exact warning text and verified safe Latest target for controller to apply release metadata changes and create PR.

### Task 2: Restore raw pricing provenance and invalidate unsafe snapshots

**Files:** `packages/usage/src/adapter.ts`, `service.ts`, version/policy helper only if needed; pricing provenance/cache/reconciliation tests.

**Interfaces:** Codex model breakdowns require explicit boolean `isFallback`; empty sources remain valid and Claude does not require the flag. `buildSnapshot` retains schema v1. `usageCacheScope` includes an adapter-policy revision separate from the actual reader patch revision.

- [ ] Restore legacy report tests to require `REPORT_PRICING_UNSUPPORTED` and the service's clear localized runtime-update error; add daily/session invalid-flag and populated-no-breakdown coverage. Observe expected RED before implementation.
- [ ] Restore strict provenance guard. Preserve known lower bounds/partial/unknown, custom provider/model overrides including zero, and Claude compatibility. Do not weaken errors to get stale binaries passing.
- [ ] Add an adapter-policy cache revision; prove previously fresh unsafe snapshot scopes are ignored, leaving old files untouched. Preserve current shared-cache maintenance locking and price-revision behavior.
- [ ] Run focused RED/GREEN tests, complete Usage suite, typecheck and representative real-reader reconciliation. Reuse synthetic fixtures for session/day/month/provider/model/project/chart/export, copied roots, root order/appends, replay/forks and timezone boundaries. Do not claim source-reader regressions repaired until the pinned rebuilt reader is tested.
- [ ] Commit and write the exact evidence/limits report for independent review.

### Task 3: Stage builds transactionally and enforce distribution identity

**Files:** runtime/native build and package scripts plus focused build transaction tests; CLI/server version consumers.

**Interfaces:** Existing development commands remain usable. Runtime builds promote outputs/manifest only after both targets and signatures succeed. Native distribution packaging requires canonical configuration and extracted final-archive verification. Canonical public ZIP is `NoShortUsage-VERSION-arm64.zip`.

- [ ] Add behavior tests for an ARM success followed by x64 failure, failed build with previous artifacts present, checksum mismatch and missing updater distribution configuration. Test real filesystem/command boundaries without duplicating implementation logic.
- [ ] Stage each build run in owned fresh directories. On failure return nonzero, do not modify the last complete runtime set/manifest, and do not emit a complete candidate. Keep recoverable previous outputs; no broad cleanup of user artifacts. Promote/rollback outputs consistently on interrupted or failed promotion.
- [ ] Derive manifest/hash/provenance from actual signed bytes and use package version variables for CLI/MCP identities. Retain exact pinned source/pricing/patch integrity checks and full license text.
- [ ] Use the real native build script with `--distribution`; require pinned Sparkle/resources/rpath, production public config, helpers and both architectures. Package ARM canonical public name while retaining development packaging compatibility as needed.
- [ ] Extract final ZIP and recheck signatures/architecture/update policy/runtime provenance. Make package failure fail closed, with no stale success output. Never publish x64 native ZIP.
- [ ] Run focused failure/success tests and full applicable suite, commit, and record evidence for review.

### Task 4: Verify final release artifacts and integrate mandatory CI gates

**Files:** create `scripts/prepare-experimental-release.ts` and `scripts/verify-release-artifacts.ts`, focused integration tests and CI jobs/package aliases.

**Interfaces:** Prepare command accepts an explicit version matching source and builds/tests/stages an Experimental candidate, never publishes. Verifier accepts candidate directory/version, verifies TAR/app ZIP/plugin ZIP/runtime manifest as one set, and returns/writes auditable validation. Prepared candidate is immutable after archive/feed signing.

- [ ] Implement tests that reject stale/mixed versions, changed archives/manifests, missing ZIP Sparkle/config, mismatched helper provenance, missing required real-reader tests and tampered extracted reader behavior.
- [ ] Prepare from clean committed build inputs in isolated staging. Reuse Task 3 commands and existing verifiers, avoiding another independent packaging implementation. Identify source build commit separately from later generated metadata/release commit; any build-input changes invalidate the candidate.
- [ ] Execute the extracted readers and their paired compiled snapshot helpers on synthetic regressions, using explicit artifact paths rather than silently falling back to source runtime. Test packaged plugin runtime both bundled and controlled download/install paths. Do not bypass checksum/URL trust policy for production.
- [ ] Validate actual archive bytes, contents, signatures, identities, source/runtime pins and licenses. Generate `SHA256SUMS` and `release-validation.json` with command/results, required skips, architecture/OS, toolchains, source/patch/pricing hashes, artifact hashes and manual acceptance limits.
- [ ] Add source/Linux tests and macOS final-artifact gates to CI using `macos-15` ARM and `macos-15-intel`, pinning `/Applications/Xcode_16.4.app/Contents/Developer`. Exercise extracted paired runtime readers/helpers on each native host architecture; do not equate x64 CLI runtime success with Intel GUI/device acceptance. Production signing secrets are never needed in PR CI; cryptographic negative tests use test keys. Require reader/helper tests after build, zero silently skipped required cases. Record and assert the actual host architecture.
- [ ] Run new integration/negative gates, full applicable suite, typecheck, browser, website and repository validation; commit and report for review.

### Task 5: Prove updater lifecycle and current product workflows

**Files:** existing isolated updater harness and tests; acceptance runner/report and focused product tests where an actual gap is found.

**Interfaces:** Harness may accept explicit A/B versions and uses private test bundle ID/key/feed/home/preferences/logs/exports. Fixture lifecycle evidence is not installation proof of the byte-identical final production ZIP. No production app or user data changes.

- [ ] Exercise actual Sparkle confirmation, replacement and relaunch, plus cancel, failed network, missing/corrupt feed signature, corrupt archive, wrong key/architecture, equal/older versions and maintenance drain. Retain old app bytes for every rejection and fixture data/settings for successful updates.
- [ ] Validate informational daily checks: at most once per 24h, no ZIP request/download/install, manual check independent, quiet errors and existing opt-out respected. Extend only the test paths needed to prove these behaviors.
- [ ] Run/inspect existing product workflows: popover/history, providers/source configuration, custom/zero/fallback pricing, projects, comparison, insights, budgets and JSON/CSV export. Cover EN/VI/zh-CN, light/dark, keyboard, constrained window/error states. Add regression only for demonstrated defects.
- [ ] Measure cold/warm refresh on a fixed synthetic large dataset and check repeated refresh/cancel/shutdown responsiveness. Record dataset size, hardware, methodology and timings, without invented device/performance claims.
- [ ] Record manual OS checks (hooks/context, notification permissions/banner, login, sleep/wake, multiple displays and VoiceOver) as passed/failed/not performed with evidence; unavailable device/OS acceptance belongs to milestone 2 and cannot be falsely marked pass.
- [ ] Commit relevant changes and evidence, then task review. UI automation limitations are concrete remaining gates, not proof of acceptance.

### Task 6: Prepare the verified 0.7.2 draft and release PR

**Files:** version manifests/source identities, complete release notes/install recovery guidance, generated reviewed runtime manifest and website/feed/translations.

**Interfaces:** Produces a new immutable draft `v0.7.2` with ARM app ZIP, plugin ZIP, ARM/x64 runtime TARs, manifests, SHA256SUMS, license and validation. Owner retains publish and merge. Appcast generated outside website using existing owner key.

- [ ] Set 0.7.2 coherently, freeze/commit build inputs, run the full prepared-candidate pipeline. Required gates must be green and independent whole-branch review must have no open P0/P1.
- [ ] Locate existing owner signing key through targeted known release evidence/file metadata outside Git; do not dump secrets or scan unrelated content. Validate its match by signature against the committed public key. If absent, finish all independent work and report precise missing prerequisite; never rotate.
- [ ] Sign immutable ARM archive and XML via pinned tool/stdin outside website. Prepare draft with all evidence, download assets from GitHub (authenticated draft download where necessary), recheck bytes/signatures/artifact behavior, then prepare release PR.
- [ ] Update website/README/guides/three translations/cache-busting together with exact byte-for-byte signed feed, only after candidate and uploaded assets verified. Separate app updater from plugin update and updater-less0.7.1 manual reinstall.
- [ ] Present concrete PRs/draft and remaining owner actions. Do not publish or merge. After owner publication/merge, verify live HTTPS assets/feed/cache signatures and record actual owner upgrade separately before claiming rollout complete.
- [ ] Recovery: if serious live issues emerge, stop recommending/offering new version via signed reviewed channel changes; preserve old assets, never force downgrade app/data, fix under a new increasing version.

### Task 7: Implement actionable notarized-release readiness and record external gates

**Files:** existing maintainer-triggered notarized release workflow/scripts/docs and targeted tests.

**Interfaces:** Existing Developer ID/notary credentials are owner-provided outside Git; configuration missing must stop dependent operations before credential import. Public Intel native support remains disabled until separate real-device/channel acceptance.

- [ ] Correct workflow prerequisites including pinned Rust toolchain/targets, build order and canonical updater distribution configuration. Keep Experimental and notarized flows distinct and prevent development output being labeled notarized.
- [ ] Verify Developer ID/team/hardened runtime/timestamp, notarize and staple with existing secure wrappers only when credentials exist; package then verify exact final extracted ZIP and Gatekeeper acceptance. Retain current owner Sparkle key across signing transition.
- [ ] Prepare reproducible acceptance steps for clean macOS14/current installs with quarantine, ad-hoc->DeveloperID update, hooks/context, notifications/login/sleep-wake/multiple displays/VoiceOver and physical Intel. Never weaken Gatekeeper or collect passwords.
- [ ] Execute independently available checks and record credentials/devices/manual interaction still needed. Do not claim milestone2 complete without actual acceptance. Commit and review actionable fixes.

## Completion and handoff

- Implement Task 7's independently actionable source/workflow readiness before Task 6 freezes final build inputs; actual Developer ID signing/notarization/device acceptance remains milestone 2 and depends on owner credentials/devices.
- One independent review per task and one whole-branch review. Re-review fixes with their evidence; preserve progress and all material unresolved findings.
- PRs/draft can be prepared under this authorization; public publish/merge and real installed-app replacement remain the owner's final actions.
- Report completed source/artifact work separately from pending signatures, draft publication, live deployment and device/owner acceptance.
