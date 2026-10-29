# No Short Usage

Track estimated **Codex and Claude Code** costs and context from your macOS menu bar. Built by Long.

`no-short` is the home of No Short Usage: the native app, shared usage engine and optional Codex MCP panel. Writing and work-report skills now live in [no-short-skills](https://github.com/longlonglong173/no-short-skills).

Costs are **API-equivalent estimates**, not ChatGPT or Claude subscription charges, invoices, remaining quota or deducted credits. Context rings show estimated occupancy, not subscription limits.

## Download the macOS app

The recovery target is **Experimental 0.7.2**. Install it only after the owner publishes the verified assets; preparation and private draft uploads do not establish public availability. 0.7.1 is not recommended because of its data and updater packaging regressions. See the [0.7.2 recovery and installation notes](docs/releases/0.7.2.md) for fixes, publication gates and limits.

[Apple Silicon — Experimental v0.7.2 (after verified publication)](https://github.com/longlonglong173/no-short/releases/download/v0.7.2/NoShortUsage-0.7.2-arm64.zip)

Requires a Mac with M1 or later and macOS 14+. Intel app downloads are not available yet. The app bundles its runtime; no Node/Bun installation or API key is required.

1. Download the ZIP and `SHA256SUMS` from the 0.7.2 release, verify its SHA-256, and extract it.
2. Quit any older running copy and move **No Short Usage.app** to **Applications**.
3. Open the app and click its menu bar icon.

This experimental app is ad-hoc signed and **not notarized**; macOS may block its first launch. Build, signature and runtime results belong to the exact release artifacts and CI run. Installation on other downloaded/quarantined Macs, macOS 14 acceptance and live source-editor interactions remain separate checks. See the [user guide](https://no-short.io.vn/usage.html), [technical installation guide](docs/no-short-usage-menubar.md) and [release record](docs/releases/0.7.2.md).

Keep an installed 0.7.1 copy while recovery is prepared; do not automatically downgrade. After verified 0.7.2 assets are public, updater-less 0.7.1 ZIPs require one manual reinstall: quit the running app, extract `NoShortUsage-0.7.2-arm64.zip`, move the app to Applications, then confirm **v0.7.2** in the menu bar. Preserve provider logs and preferences. The app updater cannot retrofit itself. Compatible 0.6.0–0.7.0 apps can use Check for Updates only after the signed 0.7.2 feed is live. The MCP plugin updates separately through its host using the complete `no-short-0.7.2.zip` package; start a new chat afterwards.

Users of 0.5.0 or earlier also install 0.7.2 manually once after verified publication. The temporary 0.7.0 fallback used during recovery had an incomplete mixed known/fallback subtotal; historical assets remain available, but recovery never forces an app/data downgrade.

## Features

- Estimated costs by session, day and month, calculated with pinned ccusage 20.0.34.
- Separate Codex and Claude Code context rings and configurable context alerts.
- Session selection and pinning; optional automatic chat tracking and opening at login.
- Local log processing with no developer-hosted collection backend. Public model pricing may be fetched online.

Claude context and automatic session following are separate opt-in connections in the gear menu. Existing custom status lines are preserved. See [PRIVACY.md](PRIVACY.md) for local cache retention, host-visible MCP results and disconnection/removal.

## Optional Codex panel

The `no-short` plugin exposes `get_usage_dashboard` and `get_session_usage` in compatible local Codex Desktop chats. It is installed separately from the app; neither installation installs the other.

For a complete extracted plugin package:

```sh
codex plugin marketplace add /path/to/extracted/no-short
codex plugin add no-short@no-short
```

Start a new chat after installation. If the marketplace is already registered, use the supported marketplace management flow to change its source; do not edit installed caches. Source-only GitHub installs require the exact published runtime archives in the manifest. See [installation, development and verification](docs/no-short-usage.md).

The MCP panel reports selected session metadata and usage to its host, where results may enter model context. The standalone menu bar app does not send snapshots through MCP. The Claude Code skills wrapper moved to the separate skills repository; the Codex Usage plugin retains its existing `no-short` identity.

## Looking for the skills?

Both **no-ai-slop** and **personal-work-report** moved unchanged to [no-short-skills](https://github.com/longlonglong173/no-short-skills), with their references, templates and related Git history.

```sh
npx skills add longlonglong173/no-short-skills --all
```

For Codex/Claude plugin installation and migration from earlier bundled versions, see the [migration guide](docs/migration-to-no-short-skills.md). Existing app downloads and old release archives are unchanged.

## Repository layout

```text
packages/usage/            Usage engine, local MCP server, React panel and packaging
packages/usage-menubar/    Native Swift/AppKit menu bar app and tests
website/                  Bilingual product website and setup guide
scripts/                  Usage launcher and repository validation
.agents/plugins/          Codex marketplace catalog
plugin.json               Portable Usage plugin manifest
mcp.json                  Local Usage MCP server
```

## Development

```sh
bun install --cwd packages/usage --frozen-lockfile
npm run validate
npm test
npm run typecheck:usage
npm run test:usage-menubar
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [MCP build/package instructions](docs/no-short-usage.md) and [native app build instructions](docs/no-short-usage-menubar.md). Website checks: `node --test website/tests/*.test.mjs`.

## Releases and license

Original code is [MIT licensed](LICENSE); dependencies, fonts and provider marks retain their own rights. See [NOTICE.md](NOTICE.md), [CHANGELOG.md](CHANGELOG.md) and the [0.7.2 recovery and release gates](docs/releases/0.7.2.md).

Usage binaries are distributed through GitHub releases. Apple signing/notarization and OpenAI Plugin Directory review have separate status.

Since 0.6.1, the main popover shows the running version and last update-check status. Quiet daily checks only show in-app notices; downloads and installation require confirmation. Compatible 0.6.0–0.7.0 installations can install 0.7.2 through About → Check for Updates once its signed feed is deployed. Updater-less 0.7.1 installations use the manual recovery above.

## Recovery in 0.7.2

Restore distinct-session totals and the known subtotal for incomplete model prices, fix concurrent cache initialization, and restore the complete owner-signed ARM updater package. The public native scope remains Experimental Apple Silicon; authenticated Intel native distribution remains M2. See the [0.7.2 notes](docs/releases/0.7.2.md) for exact evidence boundaries.

## New in 0.7.0

Reliable multi-root log totals, local custom model pricing/provenance, equal-length period comparison, exact session/day drilldown, project and explicit parent/child grouping, and default-off usage anomalies/month scenarios. History/export keep consistent pricing and privacy rules. See the [release notes](docs/releases/0.7.0.md) for behavior and remaining device acceptance.
