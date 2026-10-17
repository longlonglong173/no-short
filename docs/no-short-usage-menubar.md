# No Short Usage menu bar app

The optional **No Short Usage.app** shows local Codex usage on the macOS menu bar, even when the Codex conversation panel is closed. It shares the existing ccusage 20.0.34 snapshot/cache engine with the plugin. It can run without installing the plugin and requires macOS 14 or newer.

Amounts are **estimated API-equivalent USD costs**, not ChatGPT charges, credits, account balance or remaining quota. Closing Codex does not create new usage: the app can only report logs that Codex has written and retained.

## Install and open

Use the ZIP for your Mac: `darwin-arm64` for Apple Silicon or `darwin-x64` for Intel. Extract it, move **No Short Usage.app** into Applications, and open it in Finder. The app has a menu bar item and no Dock window. Click the `NS` amount to open the menu.

Local builds appear in `.artifacts/usage-menubar/releases/`. These artifacts are not automatically published releases. Development builds are ad-hoc signed and **not notarized**; Gatekeeper acceptance on a downloaded/quarantined app needs separate verification. Do not disable Gatekeeper globally to run a development artifact.

The complete runtime is bundled. Runtime users do not need Node, Bun, Swift, an API key, cookies, or account tokens. Installing the Codex plugin alone does not install this companion app.

## Menu and refresh

- The menu bar amount is today's estimate in the snapshot's local timezone. `$2.35` means estimated, `≥$2.35` means some prices are missing, and `—` means pricing/data is unavailable. `…` means the first read is running.
- Click to see today's input/output/cache read/cache write/total tokens, this month's total, the latest main session, source, update timestamp and any error. Tooltips preserve full values and long session names.
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
| Snapshot/model/process/controller/login/menu tests | 24 Swift tests passed locally |
| Bundle corruption/version/provenance/symlink tests | 2 Bun tests passed locally |
| Existing Usage behavior | 26 Bun tests, TypeScript check and 7 Playwright tests passed locally |
| arm64 and x86_64 build | Both app bundles built; nested and whole-bundle signatures verified |
| Bundled arm64 worker | Isolated empty-root snapshot passed with no Node/Bun on PATH |
| GUI launch / duplicate launch | arm64 process stayed running; a second launch exited without a second process |
| Background reading with Codex panel closed | Live cache advanced and a child report process was observed during an 18-second check |
| Visible status item, live menu, light/dark, keyboard | Not visually verified: native UI connector timed out attaching to the accessory app |
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
