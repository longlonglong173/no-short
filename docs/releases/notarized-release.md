# Developer ID notarized release preparation

This is the current procedure; the 0.4.2 release document is historical. Experimental preparation and Developer ID notarization are separate flows. Neither preparation command publishes a release or replaces an installed app. Milestone 2 remains pending until the owner completes signing and device acceptance.

Use an Apple Silicon macOS 15 build host with Xcode 16.4, Bun 1.3.13, Node 22 and Rust 1.98.1 with `aarch64-apple-darwin,x86_64-apple-darwin` installed. Keep the reviewed production `packages/usage-menubar/update-channel.json` and its existing owner Sparkle public key; the Developer ID transition does not rotate the updater key. Public native packaging remains ARM only. Intel builds/static checks are required; public Intel native distribution needs separate physical-device/channel acceptance.

The maintainer-triggered **Prepare notarized macOS release** workflow runs only on `main`, with read-only repository permissions. It binds the checked-out source commit/version, validates the pinned toolchains under a private data HOME, builds the runtime before reader tests, checks production updater configuration, then imports existing owner credentials into its temporary keychain. Missing required settings stop before credential import. It builds both native targets with `--distribution`, smoke-checks them, then notarizes only the canonical ARM app. Artifacts include version, full source commit, run ID and run attempt; reruns create new evidence without deleting prior artifacts.

The owner must privately configure protected environment `macos-release`. Variables are `MACOS_SIGN_IDENTITY` (existing Developer ID Application identity or certificate SHA-1) and `APPLE_TEAM_ID` (expected 10-character team ID). Secrets are `MACOS_CERTIFICATE_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_NOTARY_KEY`, `APPLE_NOTARY_KEY_ID`, and `APPLE_NOTARY_ISSUER_ID`. Never paste private keys, certificate passwords or Apple credentials into a chat, issue, source file or log. The workflow removes its temporary keychain/material even on failure. On 2026-10-29 this environment was absent and no local Developer ID identity was available; no signing or Apple submission was performed.

For a local owner-controlled signing machine, first configure an existing notarytool keychain profile outside the repository. With the toolchains above, a clean reviewed checkout and the existing public update configuration:

```sh
bun install --cwd packages/usage --frozen-lockfile
bun scripts/release/run-isolated.ts bun run test:release-toolchains
bun scripts/release/run-isolated.ts npm run build:usage
NO_SHORT_REQUIRE_PATCHED_CCUSAGE=1 bun scripts/release/run-isolated.ts npm test
npm run typecheck:usage
# Set NO_SHORT_SIGN_IDENTITY, NO_SHORT_APPLE_TEAM_ID and
# NO_SHORT_NOTARY_PROFILE privately in the owner's shell.
bun scripts/release/run-isolated.ts npm run build:usage-menubar -- --distribution
bun scripts/release/run-isolated.ts npm run smoke:usage-menubar
bun scripts/release/run-isolated.ts npm run release:usage-menubar
```

The release command rejects ad-hoc/Development identities, wrong teams, missing hardened runtime or timestamps before Apple submission. It copies the ARM bundle into an owned staging directory, submits that copy with `notarytool`, requires `Accepted`, staples and validates the ticket, creates `NoShortUsage-VERSION-arm64.zip`, extracts those exact bytes, and repeats signature/updater/ticket checks plus Gatekeeper assessment. It promotes `.artifacts/usage-menubar/distribution/` only after the ZIP, license, installation instructions, validation and checksums are complete. A failed submission, staple or final assessment preserves both original builds and the previous complete distribution. Never label development/Experimental artifacts notarized or weaken Gatekeeper.

Review Apple's notary log for warnings, even after acceptance. The existing secure wrapper retains the accepted submission ID in `release-validation.json`; inspect the corresponding log through the owner's authenticated `notarytool log` workflow. Apple's [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and [custom notarization procedure](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow) define signing, hardened runtime, timestamp and ticket requirements. Apple acceptance is separate from real recipient acceptance.

Sign the final stapled ZIP and feed using the existing owner Sparkle key through the existing appcast wrapper only after exact ZIP checks. Do not change any signed bytes afterward. Publishing the archive/feed, creating a tag/release, deploying the website and replacing the installed app remain separate owner actions.

## Downloaded Experimental candidate verification boundary

`verify:release-artifacts` authenticates the owner-signed feed and ARM ZIP before executing any packaged code, then statically binds manifest ARM runtime hashes to the authenticated app's `sourceBinaries`. TAR/plugin binary checks occur before those executables run. Unsigned mode is explicitly trusted-producer local/CI validation; checksums alone do not authenticate arbitrary downloaded code.

The ARM app embeds only ARM `sourceBinaries`, with no full-manifest digest. Signed/downloaded runtime verification therefore requires ARM execution and refuses x64 before any packaged code runs. x64 consistency checks during ARM verification do not independently owner-authenticate x64 executables. Unsigned Intel CI must still validate the exact canonical ARM-produced payload, materialize its runtime and build the embedded UI prerequisite before current-source CLI tests, with an external receipt naming its source/version/run/attempt and canonical checksum-set digest. Task 6 must compare every downloaded byte with the trusted sealed local set before the ARM signed verifier and bind the corresponding Intel receipt externally. This restriction does not establish a public Intel native channel.

## Owner/device acceptance record

Record exact ZIP SHA-256, source commit, workflow artifact/run/attempt, notary submission ID, OS/build, device architecture, prior app version, result and observed evidence for every row. Keep real data untouched; use a dedicated account and consented disposable data. No scripted setting change substitutes for a visible recipient test.

| Gate | Reproducible acceptance |
| --- | --- |
| Clean macOS 14 and current macOS | Download the exact candidate through a normal browser on each clean Apple Silicon machine. Verify checksums, retain download quarantine, extract/move to Applications through Finder, inspect Gatekeeper's normal identified-developer launch, then launch offline to check the stapled ticket. Do not remove quarantine or disable Gatekeeper. |
| Ad-hoc to Developer ID update | In a disposable account install the previously accepted Experimental app; take checksums/backups of consented fixture settings. Offer the final ZIP through an owner-signed test update with the unchanged Sparkle key. Confirm the manual check, displayed version, confirmation, relaunch and retained settings. Check cancel/failure leaves the prior app usable. |
| Hooks and context | On disposable Codex/Claude sessions verify opt-in connection, context estimate, tracking and disconnect. Check existing custom status lines are preserved/refused appropriately. Record provider versions and explicit permission interactions. |
| Notifications and login | Exercise actual OS permission prompts and a visible threshold banner, deny/re-enable paths, open-at-login on/off and login/logout. Confirm the saved opt-in choices and safe removal after disabling login/hooks. |
| Sleep, wake and displays | Sleep/wake with an active fixture session; move between external/internal displays and different scaling. Confirm menu placement, refresh, selection and usable popover without duplicate workers. |
| Keyboard and VoiceOver | Navigate every interactive control by keyboard on both appearances; inspect spoken labels, focus order, selectable numeric values and dismissed/reopened popover. |
| Physical Intel | On a real supported Intel Mac, execute the separately recorded canonical runtime verification and native GUI/device acceptance. Keep native public downloads/channel disabled until a separately approved compatible Intel channel exists. An ARM/Rosetta run is not physical Intel evidence. |

Missing credentials, signing integration, real quarantine/Gatekeeper recipient behavior, update transition and these device rows are open external gates. Local tests and Actions static/runtime checks cannot mark them accepted.
