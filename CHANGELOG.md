# Changelog

## 0.4.2 — release candidate (not published)

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

Public app distribution remains blocked pending Developer ID credentials and the
release checks in [the release record](docs/releases/0.4.2.md). This is not an
OpenAI public-directory submission or a notarized artifact claim.
