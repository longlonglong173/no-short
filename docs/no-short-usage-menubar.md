# No Short Usage menu bar app

The optional **No Short Usage.app** shows local Codex usage on the macOS menu bar, even when the Codex conversation panel is closed. It shares the existing ccusage 20.0.34 snapshot/cache engine with the plugin. It can run without installing the plugin and requires macOS 14 or newer.

Amounts are **estimated API-equivalent USD costs**, not ChatGPT charges, credits, account balance or remaining quota. Closing Codex does not create new usage: the app can only report logs that Codex has written and retained.

## Install and open

Use the ZIP for your Mac: `darwin-arm64` for Apple Silicon or `darwin-x64` for Intel. Extract it, move **No Short Usage.app** into Applications, and open it in Finder. The app has a menu bar item and no Dock window. Click the `NS` amount to open the menu.

Local builds appear in `.artifacts/usage-menubar/releases/`. These artifacts are not automatically published releases. Development builds are ad-hoc signed and **not notarized**; Gatekeeper acceptance on a downloaded/quarantined app needs separate verification. Do not disable Gatekeeper globally to run a development artifact.

The complete runtime is bundled. Runtime users do not need Node, Bun, Swift, an API key, cookies, or account tokens. Installing the Codex plugin alone does not install this companion app.

## Menu and refresh

- The menu bar amount follows the session selected in the detail popover; automatic mode follows the latest main session. Today/month and the seven-day chart show totals across all sessions in the snapshot's local timezone. `$2.35` means estimated, `≥$2.35` means some prices are missing, and `—` means pricing/data is unavailable. `…` means the first read is running.
- Click to open the detailed popover: choose/search a session, see its estimated cost and Input / Cache / Output tokens, inspect a seven-day daily-cost chart and today/month totals, and access refresh/settings. Cache combines read/write in the compact row; its tooltip preserves both exact values. Right-click retains the quick native menu. An explicit session selection stays fixed until you select another session or return to automatic mode; it resets on app restart or source change.
- The latest session follows the same selection rule as the panel: prefer a known main session, fall back to an unknown non-subagent session, and never select a subagent by default. It does not identify the focused Codex tab or merge child sessions into parents.
- Refresh runs every 15 seconds while the app is awake, including when the menu and Codex panel are closed. **Làm mới** also requests a scan; all requests respect the shared 15-second cache TTL and inter-process scan lock.
- Old results remain visible with a warning if reading fails, a snapshot becomes old, or the local calendar day changes. Unknown prices never become zero. A scan times out after 90 seconds. Every completed read, including successful reads, cleans up its report process group before returning; cancellation waits for cleanup before a replacement read or normal app exit.
- Sleep suspends the schedule and cancels reading. Wake requests a fresh snapshot. **Thoát No Short Usage** stops the companion's scans; it does not change the plugin or the login-item preference.

## Log source

By default the source is `~/.codex`. An inherited nonempty `CODEX_HOME` is honored, including the engine's comma-separated roots. Finder/login launches normally do not inherit shell startup configuration.

Use **Chọn thư mục log…** to choose one Codex home folder (the folder containing `sessions`, not an individual rollout). The choice is saved locally and applies only to this app. **Dùng nguồn log mặc định** clears it and returns to inherited/default configuration. The plugin's settings are not changed. The current source is visible in the menu; if it differs from the plugin's source, the totals can differ too.

The folder picker rejects names containing commas because the engine uses commas to separate sources. Multiple-folder selection is not included. The picker can show hidden folders. The app does not edit logs or import account credentials.

## Open at login and uninstall

**Mở cùng macOS** is off until you enable it in the menu. This uses Apple's main-app login-item service, not a separate daemon or LaunchAgent. The checkbox reflects the system's actual state. A mixed checkbox means macOS requires approval; use **Mở cài đặt Login Items…** to inspect the system setting. A failure produces an error instead of a false enabled checkbox. Put the app in Applications before registering it, and avoid moving it afterward.

To uninstall, turn off **Mở cùng macOS**, quit the app, and remove it from Applications. If the app is no longer available, remove/disable its entry in System Settings → General → Login Items. Removing the companion does not remove the plugin or Codex logs. Optional source preferences use the `dev.noshort.usage.menubar` UserDefaults domain; usage snapshots remain in the shared `~/Library/Caches/no-short/usage` cache.

## Development

Use the existing Usage prerequisites: Bun 1.3.13, Node 22+, macOS and an installed Swift 6-capable Xcode toolchain. No external Swift packages are needed.

```sh
bun install --cwd packages/usage --frozen-lockfile
npm run build:usage
npm run test:usage-menubar
npm run build:usage-menubar
npm run smoke:usage-menubar
npm run package:usage-menubar
```

Build requires the checksum-verified runtime files and notices produced by `build:usage`. It cross-builds the Swift executable for both architectures, pairs each with its matching helper/ccusage, signs nested binaries before the app, and records source and packaged runtime hashes. Smoke checks bundle metadata, architecture, checksums and signatures for both targets. On the host architecture it executes the bundled worker against an isolated empty log root with only system tools on PATH.

Setting `NO_SHORT_SIGN_IDENTITY` requests Developer ID signing. It must refer to an existing authorized identity. These scripts do not notarize, install, register login items, upload, or publish the app. Rebuilding while an old app is running should be preceded by quitting that app.

## Verification recorded on 2026-10-18

| Check | Evidence |
| --- | --- |
| Snapshot/model/process/controller/login/menu tests | 30 Swift tests passed locally |
| Bundle corruption/version/provenance/symlink tests | 2 Bun tests passed locally |
| Existing Usage behavior | 26 Bun tests, TypeScript check and 7 Playwright tests passed locally |
| arm64 and x86_64 build | Both app bundles built; nested and whole-bundle signatures verified |
| Bundled arm64 worker | Isolated empty-root snapshot passed with no Node/Bun on PATH |
| GUI launch / duplicate launch | arm64 process stayed running; a second launch exited without a second process |
| Background reading with Codex panel closed | Live cache advanced and a child report process was observed during an 18-second check |
| Detail popover light/dark, session list and warning/partial-data layouts | Native hosting-view renders inspected at 400-point width using synthetic fixtures; no clipped controls |
| Live popover clicks, outside-click/Escape, keyboard and VoiceOver | Not directly verified: native UI connector timed out attaching to the accessory app |
| Login registration / actual login, real sleep/wake | Not exercised on this user's system; unit-tested control/state transitions only |
| Physical Intel Mac, clean macOS 14 machine, Gatekeeper/notarization | Not verified |
| GitHub CI / published release | Workflow added; no remote run, push or release performed |

The tests use synthetic usage fixtures. Local logs/session names are not committed or included in screenshots in this document. See [Usage privacy and runtime details](no-short-usage.md).

## Implementation decisions

- Work remained on the existing feature checkout to preserve the uncommitted Usage foundation. Only new feature files and isolated root-file hunks were committed. That foundation must be included before publishing a complete source release.
- The Unicode source-path process test compares the returned environment value as a Swift string, avoiding shell byte comparisons between canonically equivalent Unicode forms; this makes no product behavior change.
- Folder names containing commas are rejected by the single-folder picker because the engine interprets commas as root separators. Other valid paths, including spaces and Unicode, are preserved.
- Runtime provenance records both original and packaged hashes because signing changes executable bytes. Verification checks the source manifest, packaged hashes and the app's signature seal.
- A separate macOS CI job avoids folding pre-existing uncommitted workflow edits into the feature commit. In the current full workflow, this duplicates the existing runtime build.
- Integration stays local; no merge, push, public release, automatic installation or automatic login registration was performed.
- Visual menu acceptance, live login registration/sleep and the other environments listed above remain explicitly unverified. These limits do not replace the recorded unit/process/build checks.

## Cost display regression fixed on 2026-10-18

A live snapshot exceeded 111 KB, while the native helper could exit after sending only 64 KB to a macOS POSIX stdout pipe. The client received incomplete JSON and displayed `NS —`. The snapshot CLI now writes the complete byte buffer through the stdout file descriptor, handling partial writes and retryable backpressure before returning.

A native regression sends a synthetic snapshot larger than 600 KB through a real POSIX pipe with delayed reading; it failed before the fix and passes with complete byte-for-byte output. It uses the developer machine's `/usr/bin/python3` to create that pipe; Python is not a runtime dependency of the app. The rebuilt app's actual SnapshotClient and cost formatter were also checked against the live snapshot and returned ready data with a numeric USD estimate. Both architecture bundles and ZIPs were rebuilt, and the arm64 app was relaunched. Visible UI confirmation remains separate from these data-path checks.

## Detail popover update on 2026-10-18

The left-click menu now presents a SwiftUI/AppKit popover matching the approved reference layout. The status item and large cost follow the selected session; the daily chart and today/month totals remain global and are labeled accordingly. Choosing the session field or **Xem các phiên** opens the searchable session list. **Theo phiên chính gần nhất** returns to automatic selection. Unknown daily prices remain chart gaps, and partial prices use known lower bounds with a note. The gear menu retains source, login-item and quit controls; refresh is available beside it.

The popover uses system light/dark backgrounds, teal cost accents and native transient dismissal behavior. Its normal logical size is 400×632; it grows vertically when a warning or unpriced-day note needs room. Rendering checks cover the normal light/dark layouts, sessions list and a two-line failure notice with partial/unknown chart prices. The popover expands for warnings and unpriced-day notes so their text and footer controls remain visible. An independent read-only review found no confirmed defects; actual click/focus/VoiceOver and system login behavior remain separate manual acceptance checks.

To reproduce the fixture-only PNGs locally:

```sh
NO_SHORT_RENDER_DIR="$PWD/.artifacts/usage-menubar/popover-checks" swift test --package-path packages/usage-menubar --filter PopoverRenderingTests
```

After linking SwiftUI/Charts, cold launching the test worker can exceed 300 ms. The timeout process test now allows 2 seconds for launch/read and a 5-second outer assertion; the app's production read timeout remains 90 seconds. The existing large-POSIX-pipe snapshot regression remains in the Usage suite.

## Footer alignment refinement on 2026-10-18

The sessions, refresh and settings controls now share a 34-point height and an explicit high-contrast enabled style. Disabled refresh remains visually distinct while loading. The settings glyph is centered independently of the native borderless menu's reserved indicator space; its overlay does not intercept clicks. Normal panel height is slightly reduced to tighten the gap above source information. The panel resizes while open if a warning or unpriced-day note appears, preserving complete warning text and the footer. Existing native render checks cover light/dark, sessions and the combined warning/partial-price case.
# Codex + Claude Code and automatic following (2026-10-18)

The native companion now explicitly enables Codex and Claude Code. The MCP panel remains Codex-only unless its service is explicitly configured with `NO_SHORT_USAGE_CLAUDE_ROOTS`; existing consumers retain schema-v1 compatibility.

- Choose **Tất cả / Codex / Claude Code**. All shows today's combined API estimate and a per-tool split; tool views show session tokens plus their own daily/monthly aggregates and chart. The filter and explicit session pin survive reopening.
- **Tự theo dõi chat vừa gửi tin nhắn** follows the newest submitted session. Selecting a session pins it. New sessions with no token records show `—` and wait for usage, never another session's cost. `SessionStart` and other sessions' Stop events do not steal selection. Known turn IDs prevent old-turn completion from ending a newer turn.
- Hooks store only provider, session ID, optional turn ID, event type and timestamp in `~/Library/Application Support/no-short/usage/activity`, with directory mode 0700 and record mode 0600. Prompt, response, cwd and transcript path are discarded. Keep at most approximately 512 records, and consume only records from the last 24 hours. Explicit subagent IDs/paths/events are ignored.
- A native activity-directory watcher and one-second reconciliation deliver events; recursive FSEvents on log roots coalesce cost refreshes over two seconds. The existing 15-second report timer remains a fallback. Native report cache freshness is one second; process single-flight, cancellation, sleep/wake and last-good data behavior remain in place.
- Cost estimates still depend on log writes and available prices. Activity is informational; it is not proof of a billable request or exact monetary streaming. Claude can issue `UserPromptSubmit` for automatic main-session activity without an origin field, so perfect human-only detection is not guaranteed. Claude Stop events without turn IDs cannot provide the stronger same-turn correlation that Codex turn IDs allow.

## Hook connection

Settings → **Kết nối tự theo dõi chat…** merges owned command hooks into Codex `hooks.json` and Claude Code `settings.json`, preserving other settings. A `.no-short-backup` copy is made before the first change to an existing file. **Gỡ hooks theo dõi chat** removes only Usage handlers. It does not change Codex trust state. Configurations use the host's `CODEX_HOME` / `CLAUDE_CONFIG_DIR`, defaulting to `~/.codex` / `~/.claude`; selecting archived log roots separately does not redirect host settings.

After connecting, review/trust the new Codex definitions through `/hooks`; restart/reopen Claude Code so its hooks are loaded. Installation alone does not establish that hooks have run. Do not use hook-trust bypass flags. The bundled app also supports `--install-usage-hooks` and `--remove-usage-hooks` for the same configuration operations. Hooks are local executable commands with a two-second host timeout, silent successful exit on invalid event/write failure, and no model calls.

Claude log detection combines valid `~/.config/claude/projects` and `~/.claude/projects` roots, or a configured custom root. A missing Claude installation remains an empty provider and does not prevent Codex reports. Settings allow independent Codex and Claude log directories. Unknown or partial pricing remains visible as unknown or a known lower bound.

### Verified delivery

- 43 Swift tests, 31 Usage tests and 2 bundle-layout tests passed; TypeScript typecheck and repository validation passed.
- Synthetic native rendering checked light/dark, all-provider totals, sessions, waiting and warning states. A real nested log-write test exercised FSEvents and activity delivery.
- Both arm64 and x86_64 bundles passed architecture/provenance/signature validation and were packaged locally. The arm64 worker passed with controlled empty roots and without Node/Bun on PATH. The bundled hook executable passed silent stdin delivery, metadata privacy, child filtering and isolated configuration install/idempotency/removal checks.
- The bundled helper read real local Codex/Claude roots and returned `ready`, both provider breakdowns and no notice. This proves current report loading; it does not prove host hooks have fired.
- Owned hooks were configured for both local hosts and verified once per event with mode 0600. Codex trust was not changed. Claude Code must reload settings in a new/reopened session. No live prompt was sent merely to test hooks.
- A fresh code review found startup replay overriding the saved filter and a dangling settings-symlink replacement. Both were reproduced RED, fixed, then passed the full 43-test Swift suite. No deferred minor findings.
- App was reopened locally; its process was verified. CUA could not inspect the accessory app's UI (timeout), so actual menu clicks, host trust/automatic prompt delivery, sleep/wake interaction and VoiceOver remain unverified. Packages are ad-hoc signed local development builds, not notarized or published.

Implementation stayed in the existing feature checkout because required Usage foundations were untracked. Selective staging preserved unrelated changes; this provides no worktree isolation. Claude automatic main-session prompt events and Stop events without turn IDs retain the limitations described above.

