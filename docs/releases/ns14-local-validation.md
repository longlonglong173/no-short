# NS-14 local validation — 2026-10-21 (not a release)

Scope: task-5 implementation `8cc035e` on PR #34, based on `3969ce4`. No production keys, signing secrets, feed, website, tag, download or installed app were changed. Native/root version stays0.5.0 in source; **0.6.0/0.6.1 below are isolated fixture identities, not published releases**.

## Actual native installation, not mocked callbacks

- Pinned Sparkle2.10.0 standard updater and installer, real signed feed/ZIP, ephemeral Ed25519 seed supplied to the SDK via stdin (never login Keychain).
- Controlled copy A0.6.0 PID31576 → B0.6.1 PID31969 at the same owned install path. Both standard-UI confirmations were clicked; no shell replacement or auto-accept switch was used.
- Fixture bundle ID `dev.noshort.usage.updater-test.1151307db0c047a4ac044aeee8defca0`; artifact run `dab94cb4-4a8d-4d08-99a6-b2e1829f8e93-OJysgn` under ignored `.artifacts/ns14-e2e/`.
- Final fixture ZIP SHA256 `e7f0e44880cf3b1c178ca6257d8e215fd96029a94b5d63a4bafb781889ce55db`. This hash identifies a private test ZIP, not the public0.5.0 asset.
- Actual maintenance held for3.07s:53 observations found versionA unchanged while active; B's ready marker arrived after maintenance completed. Original sentinel preferences, provider JSONL and exported bytes survived.
- All8 final negative cases retained executable bytes/versionA/source/export: Close/cancel, changed inline release notes in signed feed, unsigned feed, corrupted archive, wrong archive-signing key, x86_64 metadata, equal version and HTTP503. The first architecture probe exposed SDK behavior that ignored unknown hardware requirements; the app now explicitly requires exactly `arm64`, and the producer verifies actual MachO architecture.

## Isolation findings and language boundaries

`HOME`/`CFFIXED_USER_HOME` alone do **not** isolate CFPreferences or Foundation SDK cache lookup on this macOS. Initial functional-only runs are not used as strict-isolation evidence. Test-only compile guards now route UserDefaults to a private plist. After explicit owner permission, the runner creates a new test-ID-only cache symlink into its scratch root; it refuses collisions and removes only its exact owned link afterward. Six earlier test-ID caches were moved into their original scratch roots; production preferences/cache were untouched. Keys, app copies, logs and exports remain only in ignored private scratch.

Standard Sparkle dialogs were observed in English, Vietnamese and Simplified Chinese. A separate final install used saved native languageVI with framework languageEN; the framework's language remains independent of `usageLanguage`. Native EN/VI/zh-CN copy is tested. Some SDK error sentences fall back to English despite a localized dialog title/buttons. This is not VoiceOver, TCC, clean-machine or Intel acceptance.

Actual local feed/ZIP requests used Accept, Accept-Encoding, Accept-Language, Connection, Host and `User-Agent: No Short Usage/0.6.0 Sparkle/2.10.0`; only `/feed.xml` and `/update.zip`, no query parameters or session/log/usage/profile data. Public HTTPS infrastructure can additionally observe IP and transport metadata.

## Repeat locally / CI boundary

```sh
npm run build:usage-menubar
# This explicitly authorizes ONLY the new test-ID cache bridge, never production cache/app.
npm run test:usage-menubar:update-e2e -- --scenario=maintenance --allow-system-test-cache
# Click Install Update, then Install and Relaunch in the controlled copy.
# Negative example: dismiss the standard SDK error, then create the printed
# ROOT/finish-negative marker only AFTER observing rejection/cancellation.
npm run test:usage-menubar:update-e2e -- --scenario=corrupt-feed --allow-system-test-cache
```

Other scenarios: `success`, `cancel`, `unsigned-feed`, `corrupt-archive`, `wrong-key`, `wrong-architecture`, `equal-version`, `network`. `--language=vi --framework-language=en` tests independent language choices. The runner requires explicit cache consent, times out rather than faking success and rejects unexpected B installation in negative cases. Every run writes public fixture identity, requests, ready/result markers and application logs under its printed owned root. The harness is compiled only with `NO_SHORT_UPDATER_E2E`; normal release builds have no test hooks or loopback exception.

Local regression:144 Usage tests,32 browser tests,15 website tests,190 Swift tests and19 packaging/config/crypto/harness tests passed; TypeScript typecheck passed. Exact extracted local development bundles are checked separately before PR handoff. Existing CI runs the scripted native/packaging/crypto guards and both native development builds, **not** interactive installation. CI artifacts remain unconfigured development builds and are never a working updater bootstrap.

## Separate production gates (not done here)

Owner review/commit of the public key and exact HTTPS feed config; private-key backup/secret handling; separately approved version bump/bootstrap build; final archive signing, immutable asset upload/verification before signed-feed deployment. Public0.5.0 still needs one manual bootstrap. Developer ID/notarization, clean-machine installation, Intel, OS permissions/login retention and VoiceOver remain NS-05 gates. Native updates do not update MCP.

## Exact local development ZIPs

Both ZIPs were extracted with `ditto`; the extracted apps passed framework/link/resource/provenance/architecture/deep-strict signature verification. Normal executables contain no NS14 test hooks; Info.plist has no test root, ATS override, feed or key. ARM distribution rejects missing reviewed production configuration. These are local unconfigured0.5.0 development files, not replacements for public0.5.0 assets.

| Target | Capability | SHA256 |
| --- | --- | --- |
| darwin-arm64 | unconfigured | `77eba5c10308e72c4583f9439b2d097202f8a31657f8ae570664fec54176ae68` |
| darwin-x64 | unsupported-architecture | `613bf8707c911794c96d8999e29331409c0af23d3d8ce693e78ed29d48c73812` |

## Final independent review

The one fresh-context whole-branch reviewer found two P2 issues: deprecated saved Sparkle feed URL precedence, and incomplete final-archive validation in the appcast producer. Both received failing regression tests before fixes. The driver now supplies its canonical production feed through the highest-priority delegate (loopback override only in guarded test builds); the producer requires reviewed distribution configuration and full extracted bundle/provenance/framework verification before emitting a feed. Synthetic crypto tests call SDK tools directly and cannot qualify a fake app for production publication. Duplicate stale NS-14 backlog status was removed.

Post-fix actual standard-UI repeat: run `d7ecee72-946e-484f-92c7-f8f54bc14566-Q43voG`, A PID37055 → B PID37330, 54 active-maintenance observations, final test ZIP SHA256 `3bed320028e0ffba221d81daf6b79d5bf05f615c987bd61214f475f929a77356`. A deprecated saved `SUFeedURL` pointed at an unused loopback port; only the pinned fixture feed/ZIP were requested. Preferences/cache confinement and cleanup passed again. Final normal ZIP hashes above are from the post-fix builds.
