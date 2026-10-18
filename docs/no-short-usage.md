# No Short Usage

No Short Usage provides the optional local Codex usage panel in the **no-short** product repository. It estimates API-equivalent USD costs from retained Codex logs using **ccusage 20.0.34**. These amounts are **not** ChatGPT subscription charges, invoices, remaining quota, or credits deducted.

## Requirements and installation

- macOS 14 or newer, Apple Silicon or Intel, with a compatible ChatGPT/Codex Desktop host supporting local MCP Apps.
- No DMG, separate application, Node/Bun installation, OpenAI API key, cookies, or account tokens are required for runtime users.
- Install the **complete no-short plugin package**, rather than a skills-only package. Extract its ZIP, add that folder as a local marketplace, then install **no-short** from that source. Start a new local chat afterwards.

For a new marketplace installation, the CLI equivalents are:

```sh
codex plugin marketplace add /path/to/extracted/no-short
codex plugin add no-short@no-short
```

If `no-short` is already registered from GitHub, point the marketplace at the extracted package using the supported marketplace management flow before reinstalling. Do not edit the plugin cache by hand. Other marketplaces and plugins should be left unchanged.

Open **No Short Usage** from the conversation's plugin panel entrypoint, or ask: “Dùng no-short mở bảng chi phí Codex.” Its tools are `get_usage_dashboard` and `get_session_usage`.

Reusable skills are distributed separately in [no-short-skills](https://github.com/longlonglong173/no-short-skills). Installing them via `npx skills add` does not install this MCP server or its runtime. Usage no longer bundles a Claude Code skills wrapper. See the [migration guide](migration-to-no-short-skills.md).

## Panel behavior

- **Phiên**: token counts, per-model costs, recent-session search and pinning.
- **Hôm nay / Tháng này**: totals grouped in the machine's local timezone.
- Seven-day chart, refresh button, price-cache status and timestamp.
- Refresh every 15 seconds while visible. Closing the panel stops polling; no separate daemon is installed.
- Automatic selection follows the latest known main session's usage, not the focused Desktop tab. Pinning prevents switching. Subagents stay separate rather than being added to parents speculatively.
- Unknown prices display “Chưa xác định”; incomplete totals display “Chưa đầy đủ”. Failed refreshes retain the last success and mark it stale.

The source is `CODEX_HOME`, or `~/.codex` by default. Comma-separated roots are supported. Active and archived logs are processed by ccusage; missing logs cannot be reconstructed. Cache read/write tokens and output are preserved as reported; reasoning is not added twice. Names come from `session_index.jsonl`, with an ID fallback. Date-prefixed ccusage IDs are preserved, with metadata resolved from the rollout basename. Compressed rollouts without readable metadata retain an unknown session kind.

## Runtime and privacy

The full plugin ZIP bundles both macOS architectures and panel HTML. The launcher verifies SHA-256 before execution. Source-only installs use the exact release URLs/checksums in `packages/usage/runtime-manifest.json`; they never run `npx`, an unpinned `latest`, or an unverified download. Failures are reported on stderr and do not execute the download.

**Development artifacts are not published releases.** Until a matching GitHub release is explicitly published, source-install download URLs will not work. Use the complete locally built package for testing. No release is uploaded automatically.

The first online scan may fetch public model pricing from LiteLLM. Later scans use cache for up to a day; offline failures do not turn unknown rates into free usage. No log contents are sent to the pricing provider. Isolated empty source directories prevent the unified report from loading other agents. A dedicated empty ccusage config prevents unrelated report filters from changing the panel.

Snapshots and locks live under `~/Library/Caches/no-short/usage`, scoped by roots, timezone, engine and schema versions. Snapshots contain session names/IDs and usage, not prompts or messages. Titles can still be private; delete the cache when appropriate. Source-install downloads live in the separate `no-short/runtime` cache. Codex logs are not modified.

The MCP plugin returns the selected session's title/ID, provider (when available), token counts, models, dates and estimated cost, plus session count and period totals, in structured tool results that may enter model context. The complete session list is widget-only MCP metadata. These results are available to the ChatGPT/Codex host and are processed under its terms, privacy policy and account settings; local log processing does not mean that all displayed results stay on your device. The standalone menu bar app does not send snapshots through MCP. See [Privacy Policy](../PRIVACY.md) for retention and removal details.

ccusage is MIT-licensed. Runtime bundles must include its full copyright and permission notice in `THIRD_PARTY_NOTICES.txt`; the build downloads the actual license file at the pinned source commit and rejects incomplete ccusage license text. Cost estimates are independent calculations, not official billing or provider approval. Using ccusage does not itself establish OpenAI directory eligibility.

## Development

Contributors need Bun **1.3.13**, macOS for native signing/builds, and Node 22+ for the existing validation workflow. From the repository root:

```sh
bun install --cwd packages/usage --frozen-lockfile
npm test
npm run typecheck:usage
npm run build:usage
npm run smoke:usage
npm run test:usage:browser
npm run package:usage
```

If Chrome is unavailable, install Playwright Chromium before browser tests. `bun run --cwd packages/usage dev` opens a localhost preview with real logs; it is labeled **Xem trước local** and does not prove rendering inside Desktop. Browser fixtures intercept only the dev endpoint; the production panel has no demo-data fallback.

After building, install from the clean package folder, not the development checkout
(which can contain dependencies and private diagnostic artifacts):

```sh
npm run package:usage
codex plugin marketplace remove no-short
codex plugin marketplace add /Users/long/Desktop/no-short/.artifacts/usage/package/no-short
codex plugin add no-short@no-short
```

The remove step is only needed when replacing an existing `no-short` marketplace.
Restart Desktop and open a new chat after changing the installed plugin. Version
0.4.1 fixes MCP discovery in Codex 0.147.0: portable stdio commands must be bare
executables or contained `./` paths; the launcher uses `sh`, not `/bin/sh`.
A clean-install regression test runs the installed Codex CLI against the actual
manifests, and CI installs Codex 0.147.0 to keep that check enabled.

Build output is ignored by Git. The build checks pinned npm SHA-512 integrity, compiles both helper architectures, refreshes and verifies signatures, then generates runtime checksums. ZIP/native archives appear in `.artifacts/usage/releases/`. Package only after a successful build. `--version` and `--snapshot` provide diagnostics; the latter may include private session titles.

## Signing and verification

Development executables are ad-hoc signed so macOS can run them locally. This is not Developer ID signing or notarization.

For authorized distribution, set `NO_SHORT_SIGN_IDENTITY` to an existing **Developer ID Application** identity before building. Then run `bun run --cwd packages/usage notarize` with `NO_SHORT_NOTARY_PROFILE` naming an existing notarytool keychain profile. Never put Apple credentials, certificate passwords or private keys in source or chat.

Notarization refuses development signatures, submits ZIPs containing signed command-line executables, and records Apple's response. Bare executables have no staplable app bundle; verify Gatekeeper on a clean network-connected Mac. Generate checksums/package after signing.

Before release, verify a clean no-Node/Bun installation, both CPU architectures, and an actual panel in a new Desktop chat. Intel cross-compilation, Rosetta, browser screenshots, protocol tests and Desktop rendering are separate evidence. A public local-MCP directory submission requires OpenAI eligibility/approval; repository installation is a different path.

No script pushes, creates a GitHub release, or submits to OpenAI's public directory.
