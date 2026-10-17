# Privacy Policy for no-short

Effective date: October 18, 2026

`no-short` includes reusable instruction-based skills and an optional local Codex usage panel. It does not operate a developer-hosted data collection backend, use tracking cookies, or send user data to the developer.

When enabled, the local MCP helper reads retained Codex logs and the session-name index. ccusage computes token usage and estimated API-equivalent cost. A local cache stores session names/IDs, tokens, models, dates and estimates, not prompts or messages. Session titles can still be private. Neither the helper nor the panel modifies Codex logs.

Online pricing scans may download public model prices from LiteLLM. Source-only installation may download pinned executables from this repository's GitHub release. These services receive normal network request metadata; no log, prompt or session title is included. The launcher verifies SHA-256 before running downloaded executables. Full packages bundle the runtime.

Opening or requesting usage makes results available to ChatGPT/Codex. Selected-session summaries and period totals may enter model context; the full list is widget-only MCP metadata. The host processes data under its terms. No account token, cookie, OpenAI API key or billing credential is extracted.

Caches are stored in local `Library/Caches/no-short` (or a configured location) and can be removed after stopping the plugin. Removing the plugin does not remove Codex logs. Hidden/closed panels stop polling; no separate daemon is installed.

The optional No Short Usage menu bar companion reads retained local Codex and Claude Code logs through the bundled usage engine. It checks the default Claude directories (`~/.config/claude` and `~/.claude`), an inherited `CLAUDE_CONFIG_DIR`, or the selected Claude source; a missing installation contributes no usage. It refreshes every 15 seconds while running and coalesces log/activity changes into additional refreshes, including when Codex panels are closed. Scanning stops on quit or sleep. It uses the same local cache mechanism, scoped to its sources, and may fetch public model pricing from LiteLLM; no log contents, prompts or session titles are sent to the pricing provider. It adds no telemetry or developer-hosted backend. Local session names and usage can be visible in the menu and its tooltips.

Source-folder paths, provider selection, pinned session ID, last handled submission timestamp and hook-configuration preference are saved locally in the `dev.noshort.usage.menubar` UserDefaults domain. Opening at login is opt-in through macOS and does not install a separate daemon.

Connecting automatic chat tracking is opt-in. It adds owned command hooks to Codex `hooks.json` and Claude Code `settings.json` under the hosts' configured home directories, preserving other settings and saving an existing file as `.no-short-backup` before its first change. These backups may contain private host settings. Hook input is reduced to provider, session ID, optional turn ID, event type and timestamp; prompts, responses, working directories and transcript paths are not stored. Records are saved under `~/Library/Application Support/no-short/usage/activity` (or `NO_SHORT_USAGE_ACTIVITY_DIR`) with private directory/file permissions. Approximately 512 records are retained; only events from the last 24 hours are used.

Before deleting the companion, use its settings to remove tracking hooks and disable opening at login. Hook removal leaves other handlers and backups intact. Deleting the app does not delete logs, cache, activity records, host backups or UserDefaults preferences; these local files/preferences can be removed separately after stopping the app and plugin.

The skills may guide a user or agent to work with files, connected services, or websites that the user has chosen to use. Those services process data under their own terms and privacy policies. Review a skill and any connected-service permissions before use.

If you contact the project through a GitHub issue, the information you choose to include is processed by GitHub and may be visible according to that repository's settings. Do not include secrets or sensitive personal information in an issue.

For privacy questions or requests, open an issue at https://github.com/longlonglong173/no-short/issues.
