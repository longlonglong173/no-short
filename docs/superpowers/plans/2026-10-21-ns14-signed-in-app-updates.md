# NS-14 Signed In-App Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Checkboxes record execution, not promises. **Status: plan for review; implementation has not started.**

**Goal:** Let users explicitly check, download/install a verified native update and relaunch without manually replacing the app at every upgrade.
**Architecture:** One native coordinator adapts Sparkle's standard driver into existing About/menu actions. Pure policy stays in UsageCore; framework embedding, signed appcast tooling and isolated installation tests extend the existing macOS build pipeline. The MCP plugin and usage engine remain independent.
**Tech Stack:** Swift 6, macOS 14+, Sparkle **2.10.0** pinned exactly, SwiftPM, Bun/TypeScript scripts, CryptoKit, existing GitHub CI.
**Spec:** `docs/superpowers/specs/2026-10-21-ns14-signed-in-app-updates-design.md` — user approved on 2026-10-21. Plan review and execution-method selection are still required.

## Global Constraints

- Remain on `codex/ns14-signed-in-app-updates`, draft PR **#34**, baseline `3969ce4`; do not switch/change the Desktop checkout. Preserve the pre-existing untracked `packages/usage/node_modules` symlink.
- Pin Sparkle 2.10.0 (upstream tag commit `eef1a539a373c1f1a320624b1130fc5de7b2e100`) and commit `Package.resolved`; no floating dependency.
- Keep bundle ID `dev.noshort.usage.menubar`, macOS **14.0**, existing app name and installed-data locations.
- No scheduled checks, silent downloads/install, profiling or release-notes JavaScript. Configure explicit defaults: `SUEnableAutomaticChecks=false`, `SUAutomaticallyUpdate=false`, `SUAllowsAutomaticUpdates=false`, `SUEnableSystemProfiling=false`, `SUEnableJavaScript=false`; enforce manual-only behavior even with old updater preferences.
- Require `SUVerifyUpdateBeforeExtraction=true`, `SURequireSignedFeed=true`, `SUSignedFeedFailureExpirationInterval=0`; no unsigned/expired verification fallback or shell installer.
- Production feed: **`https://no-short.io.vn/updates/experimental-arm64.xml`**. Public key is canonical base64 of 32 bytes. Signing keys stay owner-managed; do not generate a production key, access/modify the login Keychain, upload secrets, publish a feed or contact real update endpoints during tests.
- Production native feed is **arm64 only**. Still build/verify x64; never feed an arm64 ZIP to an x64 app. Dev/test feeds/keys require an explicit test harness and cannot pass distribution validation.
- App-owned strings retain EN/VI/zh-CN. Sparkle standard dialogs follow supported framework/macOS localization; do not claim the app language preference controls them without proof.
- Do not change app version or commit regenerated `0.5.0` runtime hashes in this source PR. Existing public tags/assets/website remain immutable/unchanged. Native updater must not update the MCP plugin or delete logs/cache/preferences/exports.
- This PR is not authority to merge/release, register login, grant notification permissions, replace the user's installed app or enable a production signing/feed configuration. Proposed 0.6.0 bootstrap release is a separate gate after tests and review.

## Review Focus

1. **Old preferences reactivate background behavior:** Task 1/3 test hostile pre-existing Sparkle defaults and startup/About network silence, not just fresh plist values.
2. **Framework symlink escape or nested-signing breakage:** Task 2 covers absolute, dangling, cyclic and out-of-framework targets, valid framework links and exact ZIP preservation.
3. **Feed says “valid” while bytes/key/channel differ:** Task 4/5 verify real cryptographic rejection and actual Sparkle behavior, not only metadata presence or our fake driver.
4. **Install races worker or cache deletion:** Task 3/5 hold reader/maintenance gates while installing and assert no replacement/relaunch until shutdown completes.
5. **Tests touch production identity/data or public feed:** Task 5 preflights test roots, bundle ID, key/feed identity and process ownership; refuses the real install path/default home or production key/URL before launching anything.

---

## Task 1 — Pure configuration/policy and observable update state

**Files:** Create `Sources/UsageCore/UpdatePolicy.swift`, `Sources/UsageCore/NativeUpdateState.swift`, `Tests/UsageCoreTests/UpdatePolicyTests.swift` under `packages/usage-menubar/`.

**Interfaces:**
- `UpdateConfiguration.init(feedURL: String, publicKey: String) throws`; immutable `feedURL: URL`, `publicKey: Data`; accepts only the production endpoint and canonical 32-byte public key, rejects missing/zero/malformed key, credentials/query/fragment/port or non-HTTPS URL.
- `UpdatePolicy.permitsUserCheck(architecture: String, configured: Bool, terminating: Bool, maintenanceActive: Bool, sessionActive: Bool) -> Bool`.
- `NativeUpdateFailure`: `notConfigured`, `unsupportedArchitecture`, `network`, `verification`, `unexpected`; localized descriptions via existing localization mechanism.
- `NativeUpdateState`: `idle`, `checking`, `available(version: String)`, `downloading`, `installing`, `current`, `failed(NativeUpdateFailure)`; computed `isBusy`. No invented progress percentage or “installed” state before relaunch proof.

- [ ] Write `testOnlyCanonicalProductionConfigurationIsAccepted`, `testUserCheckRequiresArm64ConfigurationAndNoConflictingOperation`, `testAllBusyPhasesDisableDuplicateCheck` with exact feed/key length and policy assertions. Generate test public bytes in memory; no test private key in Git.
- [ ] Run `swift test --package-path packages/usage-menubar --filter UpdatePolicyTests`; record RED caused by missing policy/types, not unrelated build/toolchain failure.
- [ ] Implement only these pure types/functions; no Sparkle import, network, defaults or file writes in UsageCore.
- [ ] Rerun targeted tests GREEN and existing `ManualUpdateTests`/`RefreshControllerMaintenanceTests`; commit `feat(updates): define manual-only update policy`.

## Task 2 — Embed the pinned framework without weakening bundle verification

**Files:** Modify `packages/usage-menubar/Package.swift`, add its `Package.resolved`; create `scripts/sparkle-bundle.ts`, `scripts/sparkle-bundle.test.ts`; modify `scripts/build.ts`, `scripts/bundle.ts`, `scripts/layout.test.ts`, `scripts/package.ts`, `scripts/distribution.ts`, `scripts/distribution.test.ts`, `scripts/test.ts`, `.github/workflows/validate.yml` as needed for the same deliverable.

**Interfaces (scripts below are under `packages/usage-menubar/`):**
- `assertSafeBundleLinks(app: string): Promise<void>`: no-follow walk; resolve each symlink with loop detection; allow relative, non-dangling links only under `Contents/Frameworks/Sparkle.framework` with final target still inside that framework. Reject aliases/symlinks elsewhere, including runtime helpers. Never replace the existing helper hash/provenance checks.
- `embedSparkle(app: string, framework: string, identity?: string): Promise<void>`: pinned SwiftPM artifact → exact framework copy preserving links/resources, rpath and inside-out signing. Verify supplied artifact belongs to the locked dependency; do not search arbitrary `/tmp`/global framework folders.
- `verifySparkleBundle(app: string, platform: string): Promise<void>`: architecture includes the requested arch, required framework/helpers/resources present, nested signatures valid, relative load path resolves. Sparkle may be universal; existing native/helper executable checks remain exact-architecture.

- [ ] Extend layout fixtures/tests: valid `Versions/Current` + top-level relative framework links pass; absolute, `../` escape, dangling, cycle, externally linked framework root and any runtime symlink fail. Existing missing icon/checksum/provenance tests remain enabled.
- [ ] Run `bun test packages/usage-menubar/scripts/layout.test.ts packages/usage-menubar/scripts/sparkle-bundle.test.ts` and capture RED before changing the walker.
- [ ] Add the exact SwiftPM dependency/product and lock. Embed using its resolved XCFramework's macOS slice, preserve links with a no-dereference copy. Link with `@executable_path/../Frameworks`. Enumerate and sign executable/helper/XPC/framework code inside-out, then app; no `codesign --deep --sign`. Include Sparkle license in notices.
- [ ] Wire verification into build, smoke/package and Developer ID release checks. Verify nested code/team/hardened-runtime/timestamp for distribution; do not disable library validation/Gatekeeper or relax the existing distribution-signature tests.
- [ ] Extract both local app ZIPs into fresh owned scratch directories; run strict/deep verification, resources, architecture and load-path checks there. Extend `scripts/test.ts` to include new script tests; targeted tests + native build/smoke GREEN before commit `build(updates): embed and verify locked Sparkle framework`.

## Task 3 — One retained coordinator, standard UI and safe termination

**Files:** Create `Sources/NoShortUsageMenuBar/UpdateCoordinator.swift`, `Sources/NoShortUsageMenuBar/SparkleUpdateDriver.swift`; modify `AboutWindow.swift`, `AppDelegate.swift`, `MenuBuilder.swift`, `UsagePanelModel.swift`, `UsageCore/Localization.swift`, `Resources/Info.plist`; add `Tests/UsageCoreTests/UpdateCoordinatorTests.swift`, extend `AboutTests.swift`, `RefreshControllerMaintenanceTests.swift`. All under `packages/usage-menubar/`.

**Interfaces:**
- `@MainActor protocol NativeUpdateDriving: AnyObject`: `var canCheck: Bool { get }`, `var onState: (@MainActor (NativeUpdateState) -> Void)? { get set }`, `func checkForUpdates() throws`. Test fake has counters and controlled callbacks; it does not simulate successful installation.
- `@MainActor final class UpdateCoordinator: ObservableObject`: read-only published `state: NativeUpdateState`, `canCheck: Bool`; `init(configuration: UpdateConfiguration?, architecture: String, mayCheck: @escaping @MainActor () -> Bool, makeDriver: @escaping @MainActor () -> any NativeUpdateDriving)`; `func check()`. Driver created lazily by the first valid user action, retained once. Catch start/configuration errors explicitly.
- `SparkleUpdateDriver` implements that protocol and pinned `SPUUpdaterDelegate`, retains `SPUStandardUpdaterController` and delegates on the main actor. Map real `didFindValidUpdate`, `willDownloadUpdate`, `willInstallUpdate`, `didAbortWithError`, `didFinishUpdateCycle...` callbacks to states. Distinguish no-update/cancel/error using pinned SDK error/choice constants, not string matching. Inspect the 2.10.0 imported Swift signatures when compiling.
- Existing `ManualUpdateController` remains only the explicit unconfigured/unsupported-development fallback; never run it in parallel with a configured Sparkle check. Adapt About/menu to coordinator state, and keep a real release-notes link without a second background GitHub request.

- [ ] Add tests for construction/About open = zero driver starts/network requests; duplicate menu/About clicks = one session; current/available/error/cancel recovery; unsupported x64/missing key = explicit unavailable install path; no usage/loading/notice changes.
- [ ] Add a gate test holding maintenance active: check refused until released. Preserve tests showing `RefreshController.shutdown()` waits for the reader and maintenance. Add adapter tests that terminate requests use `NSApp.terminate`/existing `applicationShouldTerminate(.terminateLater)`, never bypassing drain with `exit()` or a parallel custom installer.
- [ ] Capture targeted RED using `swift test --package-path packages/usage-menubar --filter 'UpdateCoordinatorTests|AboutTests|RefreshControllerMaintenanceTests'`.
- [ ] Implement coordinator/adapter and connect every existing check entrypoint to the same instance. Only the standard Sparkle dialog exposes the install confirmation; our coordinator never invokes a silent install helper. Decline non-user-initiated check types/session callbacks; ensure old auto-check/download/profile preferences cannot reactivate them. Configure the spec's exact plist flags without an automatic-check permission prompt.
- [ ] About/menu/localized status distinguishes unconfigured, checking, available, downloading, installing, no update and failure. Keep fallback wording accurate per capability; language switching cannot start/restart a check. Add EN/VI/zh-CN tests and synthetic renders; standard Sparkle localization is tested separately from app preference.
- [ ] Targeted tests + full native tests GREEN, then commit `feat(updates): integrate confirmed updates into About and menu`.

## Task 4 — Distribution configuration and signed appcast toolchain

**Files:** Create `scripts/update-channel.ts`, `scripts/update-channel.test.ts`, `scripts/appcast.ts`, `scripts/appcast.test.ts` under `packages/usage-menubar/`; create `docs/releases/in-app-updates.md`; modify native `scripts/build.ts`, `scripts/package.ts`, `scripts/release.ts`, `scripts/test.ts`, and `package.json` scripts. Do not create/publish `website/updates/experimental-arm64.xml` yet.

**Interfaces:**
- `loadUpdateChannel(path: string | undefined, mode: 'development' | 'distribution'): Promise<{feedURL: string; publicKey: string} | null>`: public configuration only, same endpoint/key policy as Task 1. No private key fields. Missing config allowed only for development with explicit unavailable capability; distribution fails. Test configuration cannot enter distribution bundles.
- `assertUpdateDistribution(app: string): Promise<void>`: plist public key/feed + all manual-only/signature flags, platform and embedded framework agree with approved public configuration; both Developer ID and a future Experimental publisher must call this guard before publishing updater-enabled artifacts.
- `createSignedAppcast(options: {archive: string; version: string; publicKey: string; tools: string; output: string; signingKeyFile: string}): Promise<void>`: consumes final immutable ARM ZIP and an owner-provided file or stdin (`-`) per official CLI; outputs XML plus verification metadata **outside website**. No network publication, no secret logging, no production key generation or default-Keychain fallback. `tools` must be the locked Sparkle toolchain.

- [ ] Tests reject absent/zero/malformed key, wrong endpoint, wrong automatic/security flags and development/test configuration in distribution. Verify configuration is included before app signing and cannot be changed after archive signing without invalidating gates.
- [ ] Add appcast tests using an ephemeral CryptoKit Ed25519 key under private-permission test scratch (never login Keychain). Inspect pinned tools' `--help` and key-file format, pass secret bytes via stdin/file rather than arguments. Use official `generate_appcast`/`sign_update` for feed framing/signatures, not a home-grown XML signature format.
- [ ] Verify the archive signature with real Ed25519 crypto; corrupt ZIP/wrong key/wrong length fails. Validate exact `v<version>/NoShortUsage-<version>-arm64.zip`, bundle version/build, minimum OS `14.0.0` and arm64 requirement before signing. Reject x64/mismatched/downgrade/equal-version release inputs. Signed-feed/release-notes tampering rejection is exercised by Sparkle itself in Task 5.
- [ ] Run `bun test packages/usage-menubar/scripts/update-channel.test.ts packages/usage-menubar/scripts/appcast.test.ts`; capture RED, implement, rerun GREEN. New scripts must be included by native test entrypoint and CI, not left as optional tests.
- [ ] Update maintainer guide with owner key backup/setup, no private key/CLI-log leakage, asset-first/feed-last rollout, source/hash records and key-loss manual-bootstrap recovery. Do not run production setup. Commit `feat(updates): prepare verified signed update feeds without publishing`.

## Task 5 — Isolated real Sparkle A→B installation/relaunch proof

**Files:** Create `packages/usage-menubar/scripts/update-e2e.ts`, `update-e2e.test.ts`, `Tests/UpdaterHarness/` (test-only SwiftPM executable/user driver), `Tests/UsageCoreTests/UpdateSignatureTests.swift`. Modify `Package.swift` for the test harness target only and add script `test:usage-menubar:update-e2e`.

**Interfaces:**
- `assertIsolatedUpdateHarness(input: {root: string; bundleID: string; feedURL: string; key: string; appPath: string}): Promise<void>` rejects `/Applications`, normal app bundle ID, real HOME/default log/preferences/cache roots, production feed/key and non-owned scratch. No fallback to a user's current app/process.
- `runUpdateE2E({root: string, interactive: boolean}): Promise<void>` builds A=`0.6.0`/B=`0.6.1` test copies of the actual native product (not a toy updater) under `.artifacts/ns14-e2e/<uuid>`, distinct `dev.noshort.usage.updater-test.<uuid>` identity, private home/defaults/logs/cache and ephemeral key. Serves only controlled fixtures. Any loopback transport exception is confined to those test bundles; production config remains exact HTTPS/signed-feed policy.

- [ ] First test harness refusal against real install paths, symlinked/escaped scratch, normal app identity, production endpoint/key and unrelated PID. Record RED before the guard exists, then GREEN before launching any process.
- [ ] Build two real native test copies with the fixture versions/key above. A test-only `NO_SHORT_UPDATER_E2E` compile condition may inject fixture configuration only when the bundle has the isolated test ID/root; normal builds must not contain that bypass. Use a test-only standard-interface automation path or test user driver to explicitly accept installation; never add a production auto-accept/skip-verification switch. Production-like standard UI confirmation must also be exercised on a controlled copy before claiming its interaction is verified.
- [ ] Assert real Sparkle installation replaced A with B, relaunched B and produced B's ready/version marker; compare preserved sentinel prefs/source/log/export bytes. Record source ZIP hash, feed/key identity, exit/relaunch and exact installed bundle metadata. A fake delegate `.installing` event is not proof.
- [ ] Exercise cancel, corrupted archive, wrong archive key, unsigned/tampered feed and release notes, wrong architecture, wrong version and inaccessible endpoint. Installed A remains unchanged and no unexpected relaunch occurs. Test failure must not trigger a manual shell replacement to make it pass.
- [ ] Hold a controlled worker/maintenance operation before an accepted update; assert replacement marker absent until the existing shutdown gate completes. Collect actual update request headers/feed parameters and verify no session/title/log/usage data or profile parameters are sent.
- [ ] Test app language vs macOS language in EN/VI/zh-CN; record standard-framework fallback independently. Do not claim TCC, clean-machine, Intel or VoiceOver acceptance from the harness.
- [ ] Run the explicit E2E command locally, and scripted refusal/crypto tests in CI. If CI lacks interactive GUI capability, label that test unverified there; retain real local evidence and do not silently skip installation failures. Commit `test(updates): verify isolated signed replacement and relaunch`.

## Task 6 — Regression, independent review and PR handoff (no release)

**Files:** Modify `PRIVACY.md`, `docs/no-short-usage-menubar.md`, `docs/BACKLOG.md`, `CHANGELOG.md` Unreleased section and existing CI only as required for the tested updater. Continue on PR #34.

- [ ] Explain one-time manual bootstrap from 0.5.0, confirmation-only updates, actual request metadata and separate MCP updates. Keep public 0.5.0 website/download/asset links, snapshot schema v1 and ccusage 20.0.34 unchanged. Do not label an unconfigured dev build as a functioning updater release.
- [ ] Run `npm test`, `npm run typecheck:usage`, `npm run test:usage:browser`, `node --test website/tests/*.test.mjs`, `npm run test:usage-menubar`, `npm run validate`, both native build/smoke/package checks and Task 5 E2E; record actual counts/exit statuses and exact artifact hashes. Local runtime rebuilds may rewrite the generated manifest: preserve/restore only that owned generated change and **do not commit changed hashes under existing v0.5.0 URLs**. Do not stage `node_modules`/test private keys/artifacts.
- [ ] Request one fresh-context whole-branch review focused on consent, signature fail-closed behavior, framework signing/link policy, production/test isolation and terminate sequencing. Fix P1/P2 with failing regression tests first. No plan-review subagent is needed; self-review this plan before execution handoff.
- [ ] Update NS-14 with source/test/E2E evidence, clearly separate source complete, local install proof, production signing/key/feed readiness and NS-05 acceptance. Commit reviewed changes, push and verify exact remote HEAD + PR CI; mark #34 ready only when source/verification is genuinely ready. Do not auto-merge, generate production keys or publish.

## Self-review and approval handoff

- Spec sections 1–3 → Tasks 1/3/6; section 4 → Tasks 1/4/5; section 5 → Tasks 2/3/5; file scope → Tasks 1–6; acceptance 1–8 → matching task tests above.
- All interfaces are defined at their producing task; Sparkle callbacks are adapters to the pinned SDK, not invented public API. Temporary fixture versions/keys are test-only; no planned mutation of the public 0.5.0 release.
- Execution recommendation: **Native / inline** (`superpowers:executing-plans`), since policy, embedding, SDK lifetime and signing fixtures are tightly coupled. TDD plus one independent final security review retains a second pair of eyes without passing fragile partial interfaces between implementers. Subagent-driven remains available if the user prefers per-task independent reviews.
- **Next gate:** user reviews this plan and chooses Native or Subagent-driven. The approved spec is not approval of this newly written plan. A non-interactive test driver alone does not satisfy the separate standard-UI interaction gate. No implementation/dependency installation begins before that reply.
