# Changelog

## Unreleased

- Make No Short Usage the primary product; move both unchanged skills and their related Git history to [no-short-skills](https://github.com/longlonglong173/no-short-skills).
- Give skills independent manifests, installation and validation; remove skills and the Claude skills wrapper from future Usage packages. Keep Usage plugin IDs, runtime version and historical release assets unchanged.
- Update the bilingual product website, README and [migration instructions](docs/migration-to-no-short-skills.md).

- Fix bundled ccusage attribution by fetching the full MIT license from the
  pinned source file instead of the repository-root symlink. Reject incomplete
  ccusage license downloads during the build.
- Clarify which session metadata and usage the MCP plugin makes available to
  the host/model, distinguish the standalone app, and document cache retention
  and deletion limits in the privacy policy and bilingual website.

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
