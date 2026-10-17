# No Short Usage implementation ledger

Approved spec: the plugin-only plan in the Codex conversation, 2026-10-17.

## Contract

- Extend the existing no-short plugin to 0.4.0; preserve both existing skills byte for byte.
- macOS 14+, arm64/x86_64, no separately installed app, Node, Bun or API key for users.
- Pin ccusage 20.0.34; local stdio MCP with a React conversation panel.
- Report API-equivalent estimates, not subscription charges/credits. Unknown prices are not free.
- Default to latest usage, allow session pinning, refresh visible panels every 15 seconds.
- One shared cross-process snapshot cache; no daemon, no message contents in results/cache.
- Bundle native runtime in release artifacts; source installs download only pinned, verified artifacts.
- No push, public release, or public-directory submission.

## Tasks

- [x] 1. Verify actual ccusage JSON; implement/test the adapter and metadata reader.
- [x] 2. Implement/test the report runner, cross-process cache, and MCP resource/tools.
- [x] 3. Implement/test the panel and inspect rendered light/dark/error states.
- [x] 4. Build both architectures; implement/test packaging, bootstrap and manifests.
- [ ] 5. Validate unchanged skills, stdio runtime, real data, installation and limitations; final review.

## Decisions and evidence

- Baseline: repository 313e51a, main clean; npm run validate and claude plugin validate --strict . pass.
- Ruling: work in the user's named checkout on codex/no-short-usage, rather than a second worktree — keeps the delivered project at the requested path; main is not edited. Cost if wrong: changes need transferring to another checkout.
- Pre-flight: adapter produces UsageSnapshot v1; cache and tools consume it; widget consumes that same snapshot. CLI input schemas must be verified against pinned binary before implementation.
- Release prerequisites remain external: Apple Developer identity, public release download URLs and a physical Intel Mac. Implement/verify local artifacts without claiming those external steps passed.

## Local verification (2026-10-17)

- Unified ccusage report is required for per-model costs; `codex session` alone lacks those values. A private empty config and empty roots for other agents isolate the Codex report. Input/cache/output and costs are copied from CLI totals, not reconstructed from reasoning counts.
- CLI session keys can contain a date prefix. Keep that exact ID for lookup, resolve metadata by rollout basename, and preserve subagent classification. IDs never become filesystem paths.
- 24 Bun tests and 7 browser tests pass, including pinned/missing sessions, unknown pricing, timeout/stale data, concurrent cache readers, local timezone boundaries, direct refresh, hidden polling, dark/mobile layout, SDK metadata and interrupted bootstrap recovery. The native controlled-root test executes the pinned CLI; browser tests use explicit fixtures.
- Frozen dependency install and TypeScript validation pass. Repository validator and Claude strict validator pass. Both existing skill files have an empty diff against 313e51a.
- Final independent review found unsupported `panel` display metadata, ownerless install locks, and an obsolete dev binary path. All were corrected with regression coverage; standard thread entrypoints remain, with supported inline/fullscreen resource modes.
- Fresh ad-hoc signatures are necessary after Bun compilation: the inherited linker signature failed and macOS killed the initial executable. Both architectures now build and pass codesign verification; only arm64 execution is verified here.
- Native stdio smoke uses a PATH containing only macOS system tools; the helper includes its runtime and UI. This proves no separately installed Node/Bun is used by the launched helper, not a clean physical-device acceptance test.
- Complete ZIP extracted and installed successfully with `codex plugin marketplace add` / `codex plugin add` in an isolated CODEX_HOME profile. Its installed helper read 182 real sessions, including 18 classified subagents, with only macOS system tools in PATH. This does not alter the user's active plugin installation.
- The current real log includes compaction and is processed successfully; a controlled native fixture verifies input/cache/output and reasoning handling. Exhaustive fast-tier/model-switch pricing behavior remains delegated to the pinned engine and needs additional acceptance evidence.
- No push, public upload, release creation or installed-plugin cache edits were performed.

## Acceptance still pending

- Actual new Desktop chat panel: native Codex UI control was denied by the environment. Local browser preview and MCP protocol checks do not replace this check.
- Physical Intel Mac, macOS 14 clean machine without Node/Bun, and downloaded/quarantined Gatekeeper behavior remain unverified.
- No Developer ID Application certificate is available here. Artifacts are development signed; notarization was not submitted. This blocks distribution acceptance.
- The exact future v0.4.0 download URLs remain unpublished by design. Source-only bootstrap cannot download until an explicitly authorized release is published; the complete local ZIP bundles both runtimes.
- Consequently milestone 5 and the plan's full recipient acceptance criteria are not marked complete.


## 0.4.1 local discovery fix (2026-10-18 Asia/Saigon)

- User reproduced installed plugin with skills but no Usage tools/panel. Installed 0.4.0 launcher ran correctly, while Codex `plugin/read` returned no MCP server names.
- Cause: portable MCP normalization rejects the absolute `/bin/sh` command. Neither an extra Codex compatibility manifest nor an inline manifest MCP pointer changed that rejection; those diagnostic edits were removed.
- Minimal fix: `mcp.json` now uses bare `sh`; validator accepts that supported command. Version advanced to 0.4.1 across manifests, server/UI, native artifacts and CI.
- Regression: a disposable profile installs the actual plugin manifests with Codex 0.147.0, then asserts `mcp list` contains the enabled server with expanded launcher paths. It failed before the command correction and passed after. CI pins the CLI so this check does not silently skip there.
- Fresh package installed into a temporary profile outside the source tree. Codex app-server discovered both tools and read `ui://no-short/usage.html` successfully. No model turn was requested; this is host transport/resource evidence, not visual acceptance of the panel.
- 25 Bun tests, 7 browser tests, TypeScript, repository validation and Claude strict validation pass. Both skill files still have an empty diff against baseline313e51a.
- Updated only the active no-short marketplace to the clean local package and installed 0.4.1 via supported CLI commands. No installed cache was manually edited. Active CLI inventory confirms enabled no-short-usage and the installed helper reports 0.4.1.
- Development checkouts may contain ignored caches; use the package allowlist output as the local marketplace. Temporary test profiles must live outside the source folder to avoid recursive copying.
- User must restart Desktop/open a fresh chat to verify visible rendering. Developer ID/notarization, physical Intel and public release prerequisites remain unchanged.
