# Changelog

## 0.7.2 — Experimental recovery (preparation)

- Restore distinct-session totals across log roots and preserve the identified cost subtotal when other model prices are unknown. Unknown/fallback costs remain incomplete API-equivalent estimates; no missing price becomes zero.
- Fix concurrent cache-scope initialization so competing readers can share a newly created scope without an initialization error; keep maintenance guards and original provider logs protected.
- Restore the complete Apple Silicon updater package, including pinned Sparkle 2.10.0 resources, nested signatures and the existing owner-signed channel. Updater-less 0.7.1 installations require one manual reinstall after verified 0.7.2 assets are published. Plugin updates remain separate.
- Freeze source inputs before the canonical macOS 15 / Xcode 16.4 build; verify extracted runtime/helper/plugin payloads on ARM and the same bytes on hosted Intel before owner signing. Signed trust covers the ARM app/runtime only. Authenticated Intel native distribution remains M2; no public Intel app is offered.
- Keep schema v1, bundle identity, ccusage 20.0.34 and the existing owner public key. The app remains Experimental, ad-hoc signed and not Apple-notarized. Public availability, clean-machine/macOS 14 acceptance and the owner's actual upgrade are separate gates. See [recovery and installation details](docs/releases/0.7.2.md).

## 0.7.0 — Experimental (2026-10-27)

- NS-20: preserve logical session identity when merging log roots. Distinct sessions with matching timestamps/tokens remain separate; copied events in the same logical session are deduplicated. Build the checksum-locked patched ccusage reader from pinned source for both architectures.
- NS-16: show pricing provenance and unknown-price coverage; configure/reset local provider/model rates in the native app. Reprice snapshots, history and exports consistently, distinguishing explicit zero from unknown prices.
- NS-17: compare the selected History range with the preceding equal-length range, including provider/model token and estimated-cost changes and cache-read ratio. Handle zero baselines, incomplete prices and stale data explicitly.
- NS-18: drill from a day to exact contributing session/day usage and session details, without lifetime-cost attribution or changing pin/follow state.
- NS-13: group History by projects or explicit parent/child work, using trustworthy metadata and exact temporal contributions. Keep unresolved groups and privacy-safe exports; do not infer Claude lineage.
- NS-19: add default-off anomaly analysis and a labelled end-of-month cost scenario from observed priced days, with insufficient-basis states and separate notification opt-in/deduplication.
- Keep schema v1, ccusage 20.0.34, English/Vietnamese/Simplified Chinese and the existing owner-signed Apple Silicon update channel. The native download remains ad-hoc signed and not Apple-notarized; Intel runtime/device and NS-05 acceptance remain separate.

## 0.6.1 — Experimental (2026-10-26)

- NS-15: show the running app version, latest verified update status, last check time and update action in the main popover. Share state with About/menu and preserve a known update after cancellation.
- Add quiet information-only checks at most once per24hours across restarts, with an on/off setting and manual retry. Background discovery never downloads, opens installer dialogs, installs or sends OS notifications.
- Reuse the existing pinned owner key and signed channel;0.6.0 users can install this release through Check for Updates. Old releases remain immutable.

## 0.6.0 — Experimental (2026-10-26)

- NS-14: add manual, confirmation-only signed native updates using pinned Sparkle 2.10.0, shared About/menu state and the existing safe shutdown gate. Require signed feeds and archives; disable background checks/downloads, profiling and release-notes JavaScript.
- Embed/verify nested framework code for both architectures; gate distribution on reviewed public configuration and ARM payload identity. Prepare signed feeds locally without publishing.
- Verify actual replacement/relaunch and failure cases on isolated test copies. Configure the owner-signed ARM update channel for the 0.6.0 bootstrap. Users of0.5.0 install this release manually once; subsequent updates use confirmation in the app. See [local evidence and remaining gates](docs/releases/ns14-local-validation.md).

## 0.5.0 — Experimental (2026-10-21)

- NS-06: bring provider filters, per-provider period/model breakdowns and pinned-session behavior into parity between panel and native app.
- NS-07: adapt the native popover to the visible screen, with full-content scrolling and keyboard navigation.
- NS-08: persist a bounded, source-aware session metadata cache; preserve append/rename/delete invalidation. The upstream identical-event ccusage daily-total limitation remains documented, not fixed.
- NS-09: add a retained native History window and panel history filters/day-model details from the same cached snapshot.
- NS-10: export the active history view as JSON/CSV; omit session references by default, preserve uncertain prices and harden CSV spreadsheet cells. Native Save dialog and capability-checked host downloads.
- NS-11: optional local day/month API-equivalent budgets with persistent alert deduplication; OS notifications remain off by default.
- NS-12: confirmed, bounded shared-cache maintenance and disconnect/uninstall guidance; never remove original provider logs or third-party settings.
- Align package, CLI, MCP server, panel and build identities at 0.5.0. Runtime checksums are regenerated from actual builds; the [Experimental release record](docs/releases/0.5.0.md) separates local checks from outstanding device acceptance. The Apple Silicon download remains ad-hoc signed and not notarized.

- Make No Short Usage the primary product; move both unchanged skills and their related Git history to [no-short-skills](https://github.com/longlonglong173/no-short-skills).
- Give skills independent manifests, installation and validation; remove skills and the Claude skills wrapper from future Usage packages. Keep Usage plugin IDs and historical release assets unchanged.
- Update the bilingual product website, README and [migration instructions](docs/migration-to-no-short-skills.md).

- Fix bundled ccusage attribution by fetching the full MIT license from the
  pinned source file instead of the repository-root symlink. Reject incomplete
  ccusage license downloads during the build.
- Clarify which session metadata and usage the MCP plugin makes available to
  the host/model, distinguish the standalone app, and document cache retention
  and deletion limits in the privacy policy and bilingual website.

## 0.4.3 — experimental setup and manual updates (2026-10-20)

- Add first-run setup guidance and separate diagnostics for provider logs, hooks and Claude context, with recorded receipt times and recovery steps (NS-03).
- Add runtime About/version/build, release notes and explicit manual checks against GitHub releases, independent of usage refreshes (NS-04).
- Publish an ad-hoc-signed Apple Silicon download. Developer ID/notarization, clean-machine and other NS-05 device checks remain outstanding.
- Keep runtime schema v1, ccusage 20.0.34 and the documented NS-08 identical-event daily-total limitation.

## 0.4.2 — source release and experimental Apple Silicon app

### Native No Short Usage

- Draw estimated context rings dynamically around the Codex and Claude marks,
  with distinct measured-zero and unknown states. Combined mode keeps each
  provider's percentage separate.
- Read the selected Codex session's bounded log tail using reported recent token
  usage and context window. Clear the reading after compaction until new usage.
- Add an opt-in Claude status-line collector for numeric context telemetry.
  Preserve custom status lines, unrelated settings and private backups; bound
  retained context to 512 sessions without deleting unrelated files.
- Show context in the popover and accessibility/hover descriptions. Discard
  results from prior selections; suppress context when usage is stale.
- Add Developer ID/notarization preparation with verification of extracted ZIPs,
  bundled dependencies, expected signing team, tickets and SHA-256 checksums.

### Packaging, website and documentation

- Select MIT for original code; bundle license and third-party attribution.
- Document release prerequisites, installation, updates, disconnection and removal.
- Update the bilingual site with native previews, context-ring examples, a Usage
  setup page and the actual pending-release status.
- Keep both existing skills unchanged. No runtime dependency is added for users.

The owner approved public distribution of the exact locally tested Apple Silicon
ZIP, with checksum and installation notes. It is ad-hoc signed, not notarized;
Intel app downloads remain unavailable. The [signed-release checks](docs/releases/0.4.2.md)
remain pending. This is not an OpenAI directory submission or an Apple approval claim.
