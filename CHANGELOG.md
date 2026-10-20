# Changelog

## 0.5.0 — Unreleased (release preparation)

- NS-06: bring provider filters, per-provider period/model breakdowns and pinned-session behavior into parity between panel and native app.
- NS-07: adapt the native popover to the visible screen, with full-content scrolling and keyboard navigation.
- NS-08: persist a bounded, source-aware session metadata cache; preserve append/rename/delete invalidation. The upstream identical-event ccusage daily-total limitation remains documented, not fixed.
- NS-09: add a retained native History window and panel history filters/day-model details from the same cached snapshot.
- NS-10: export the active history view as JSON/CSV; omit session references by default, preserve uncertain prices and harden CSV spreadsheet cells. Native Save dialog and capability-checked host downloads.
- NS-11: optional local day/month API-equivalent budgets with persistent alert deduplication; OS notifications remain off by default.
- NS-12: confirmed, bounded shared-cache maintenance and disconnect/uninstall guidance; never remove original provider logs or third-party settings.
- Align package, CLI, MCP server, panel and build identities at 0.5.0. Runtime checksums are regenerated from actual local builds; [release preparation](docs/releases/0.5.0.md) is not a public release. Existing website downloads stay at 0.4.3.

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
