# NS-04 manual updates implementation plan

**Goal:** Runtime About information and an explicit, version-only manual release check.
**Spec:** `docs/BACKLOG.md` NS-04 and the user's isolated-worktree NS-04 request.
**Architecture:** Pure SemVer and an ephemeral unauthenticated GitHub client in UsageCore; an independent main-actor update controller; a retained nonmodal About window reached from both existing menus. No update code reads or mutates usage loading/notices.
**Constraints:** Swift 6, macOS 14, EN/VI/zh-CN; no automatic requests/downloads/replacement; no manifest; no push/PR/upload. Baseline latest-release version cannot detect newer assets under the same version/tag.

## Task 1: Release boundary and state
- [x] Write tests for numeric/prerelease/build SemVer precedence and invalid versions, live URLSession boundary via URLProtocol stubs (HTTP/malformed/offline), request privacy, explicit invocation, duplicate suppression and retry.
- [x] Run failing tests, implement `SemanticVersion`, `GitHubReleaseClient`, `ManualUpdateController`, then verify.

## Task 2: Native integration
- [x] Test runtime bundle metadata, translated About/status, independent usage warnings/loading and right-click actions.
- [x] Add independent About model/view/window; wire AppDelegate actions after popover dismissal and both menus. About alone does not request the network.
- [x] Render native About fixtures in three languages and inspect output.

## Task 3: Verify and handoff
- [x] Run complete `swift test --package-path /Users/long/.codex/worktrees/ns04-release-ready/no-short/packages/usage-menubar`, poll the original job to final exit; run packaging tests/validation/diff checks.
- [x] Review diff, record actual evidence and limits in NS-04 only, commit explicit owned paths, return commit/files/integration notes.

## Review focus
Invalid installed or remote versions never claim current; older remote releases never suggest downgrade. Network errors are confined to update state. No request on init/About/language change, retry only on user action. In-flight state survives usage refreshes. Release links only target this repository over HTTPS. Closing the popover must not destroy the update owner/window; AppKit tests must initialize NSApplication on the main actor.

## Results and handoff

Full Swift suite: 92 tests, zero failures, exit 0. Packaging: 4 pass, zero failures, exit 0. Validation and diff check: exit 0. Production URLSession live probe: latest v0.4.2, correct GitHub tag page, current for installed 0.4.2. About fixture renders cover eight states in EN/VI/zh-CN. Tests initialized NSApplication on the main actor and the original full-suite job was polled to its final exit.

Parent owns v0.4.3 version bumps/build/release after cherry-pick with NS-03. No manifest contract is needed. Same-version asset replacement is explicitly outside detection. Changes near UsagePanelModel.showsSessions were avoided; only three callbacks were added by the existing callback declarations. Shared integration points: AppDelegate callback setup/render, MenuBuilder menu additions, popover settings menu, localization catalog; preserve both NS-03 and NS-04 additions when cherry-picking. Installed-app click/focus/VoiceOver, integrated release artifact, Intel and signing/notarization remain unverified.
