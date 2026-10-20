# No Short Usage

No Short Usage provides the optional local usage panel in the **no-short** product repository. It estimates API-equivalent USD costs from retained Codex logs and explicitly configured Claude Code logs using **ccusage 20.0.34**. These amounts are **not** subscription charges, invoices, remaining quota, or credits deducted.

## Interface language

The Usage panel supports **EN**, **VI** and **中文** (Simplified Chinese).
Use the buttons above the heading to change language immediately. On first use,
the panel selects a supported browser language and otherwise uses English.
An explicit choice takes priority on later loads. It is kept in the host's
widget state where supported, with browser local storage as a fallback
(`no-short-usage-language-v1`). If both storage surfaces are unavailable, the
choice lasts for the current mounted panel.

Changing language preserves the current period, pinned session and amounts.
Application labels, empty/error states, accessible labels and missing-price
messages are translated. Session titles and model names remain as recorded;
amounts remain USD. Date/time display follows the selected language while using
the snapshot's time zone. The native macOS app has a separate preference in ⚙.


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


### Provider filters (NS-06 source; not yet in v0.4.3 downloads)

Codex remains the default. If the helper has explicit Claude roots configured
through `NO_SHORT_USAGE_CLAUDE_ROOTS` (comma-separated Claude home folders
containing `projects`), the panel offers **All / Codex / Claude Code**. The
native app's source preferences do not configure the plugin. An empty configured
Claude source still appears; it does not borrow Codex usage.

The filter applies to the session picker, today/month totals, model rows and
seven-day chart. **Session** covers the selected session's entire retained
history, not just today. Day/month include all sessions of the chosen provider
in the snapshot's time zone. The chart always covers seven days across those
sessions, even while viewing a single session. Scope labels distinguish these
values. Choosing **All** does not merge sessions or change a session's lifetime
cost; it combines provider totals only for day/month/chart.

Changing provider clears the pin and search. The pin and provider preference
are stored together in `no-short-usage-selection-v1`, with host widget-state
support and a browser-local fallback. Late host restoration is supported, but
cannot override a manual selection or an explicit tool request. Old pins saved
before provider controls were added remain readable. Language changes retain them. Filtering
uses the existing snapshot, without another log scan or network call. An exact
session requested by a tool result selects its provider; later refreshes of
that same result do not undo a manually chosen filter.

Old schema-v1 Codex snapshots without provider fields still work and do not
show Claude controls. A mixed snapshot without provider breakdowns can show
individual sessions and combined totals, but cannot show provider-only period
totals; these stay unavailable rather than being inferred from session history.
Unknown and partial prices remain labeled, with known-priced subtotals where
available. MCP summaries identify their configured providers; their period
totals remain combined even when the panel is filtered locally.

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

## Metadata cache (NS-08, unreleased source)

Metadata uses a private, bounded per-file disk cache in the current source/timezone cache scope. Directory discovery and file stat remain live; size, inode, device, mtime and ctime changes invalidate entries. Codex title indexes are reread. Cache content contains metadata only, not conversation messages. Unstable writes are not cached; a broken/unwritable metadata cache falls back to reading logs.

Run `bun packages/usage/scripts/benchmark-metadata.ts` for a synthetic-only benchmark (240 files, 501 lines each). On the recorded macOS arm64 run, original metadata code took 103.82 ms; new cold-cache 67.06 ms, warm-cache 7.58 ms (240 hits, no content reads). Outputs matched. Filesystem caching affects timing; this is not a whole-ccusage benchmark or a general speed guarantee.

The pinned ccusage 20.0.34 can deduplicate identical timestamp/token events from two distinct Codex sessions. A native CLI characterization test records daily total 110 for two 110-token sessions with identical event times, and 220 when event times differ. NS-08 does not alter logs or patch that upstream behavior; estimates can undercount this case.

## History (NS-09, unreleased source)

The **Lịch sử / History** tab filters retained daily provider/model aggregates by 7/30 days, this/previous month or an inclusive custom range in the snapshot timezone. The initial provider is copied when History first opens; later history filters are independent of the pinned session/dashboard. Switching tabs keeps in-memory history state; it is not persisted to host/browser storage. A new explicit tool session request returns to the session view.

Click a dated bar for that day's models or Entire range for range models. Token totals and cost summary cover the range, not the lifetime session. Empty periods with a successful source read show zero; missing/invalid history is unavailable and unknown prices are never zero. Charts are sparse (dates present in source rows), not a claim of complete account history. Controls are keyboard accessible with horizontally scrollable tables/charts on narrow panels. Filtering does not fetch logs or call tools again.

Snapshot schema remains v1 with optional `history: {version:1,providers,days:[{date,provider,aggregate}]}`. A new cache-scope revision avoids treating old snapshots as history-capable. History is in widget metadata, not expanded into model-visible structured summaries. Cache retains no conversation content. The native window and panel use the same daily aggregate contract; ccusage20.0.34's documented identical-event collision limitation remains.
