# NS12 cache maintenance and safe uninstall plan

Goal: confirmed clearing of generated shared No Short Usage cache and clear disconnect/uninstall guidance. NEVER remove original logs, preferences, backups or third-party configuration; no actual user cache deletion during development/tests.

## Cross-process contract
- Root is the service cache base (default ~/Library/Caches/no-short/usage). Shared root guard `.maintenance.lock/owner.json` uses `{pid,token,timestamp}` (timestamp milliseconds).
- SnapshotStore accepts `maintenanceRoot` option; service supplies its cache base. Check guard before returning cache and again AFTER owning scope `scan.lock`, before calling load. While guard active, return retained snapshot as stale / first-read unavailable, no load or write.
- Recover root guard only if >90sec old and owner provably dead (missing/corrupt owner allowed only after grace); EPERM means alive. Never remove another active maintenance guard. Guard owner nonce protects cleanup.
- Native obtains root guard first, then refuses ANY existing per-scope scan.lock (no force-unlock). New readers honor root guard and abort after scope lock acquisition. Native suspends/awaits its own current reader before clearing, releases maintenance state then refreshes only if not sleeping/stopped.

## Deletion safety
- Native supports default cache root only; custom NO_SHORT_USAGE_CACHE_DIR reports unsupported, not arbitrary path deletion.
- Reject symlink cache roots/ancestors/scopes/entries; preserve unknown contents. Include current/default Codex/Claude roots as protected paths; reject overlap.
- Delete ONLY known generated files within24-lowercase-hex scope directories: snapshot.json, pricing-check.json, ccusage-config.json, metadata/metadata-codex.json, metadata/metadata-claude.json, valid UUID atomic temp variants. Do not recursively remove unknown data or files named *.jsonl/.zst. Global third-party pricing cache remains.
- Use unlink for known regular files (never recursive directory deletion), then rmdir only empty generated directories. Unknown files/directories remain and are reported. Recheck paths/signatures when clearing; permission or concurrent change errors abort safely, no log/source settings changed.
- Cancellation/confirmation cancel writes nothing; cancellation during work checks between files, may leave partially cleared DERIVED cache, releases owned guard. No automatic resetting preferences or deleting backups.

## Native UI
- One retained Data management window via popover/right-click gear. Explain snapshots+metadata/marker scratch files shared with MCP; specify unaffected logs, hooks/context config, login and preferences.
- Clear button opens explicit confirmation; cancel exits. While busy disable duplicate clear. Show removed/retained count and localized actionable errors (busy source reader, permissions, custom cache, symlink). No automatic settings changes.
- Uninstall guidance: disconnect hooks and Claude context using existing actions, turn off Open at login, quit/remove app. Retain original Codex/Claude logs and third-party edits, backups, UserDefaults; show known cache/prefs paths. App removal does not remove plugin. No destructive shell commands or one-click recursive uninstall.

## Tests
- TS: active root guard retains stale/no-load; first-read unavailable; root guard appearing after scan lock prevents load; dead-owner recovery, alive owner age, normal parallel lock behavior.
- Native: temp-cache clear removes generated files only, retains logs/config/backups/unknown files; symlink/root overlap/customroot protection; active scan refuses deletion, two clear attempts serialize; reader drain/refresh and sleep/shutdown state; cancel, permissions and recovery.
- EN/VI/zh UI/model/render tests. Full Usage/browser/native/packaging/typecheck/validate. Fresh independent safety review; taskPR stacked afterNS11. No actual cache clear, disconnect/login changes or uninstall in development.

## Implementation split / exact shared names
TS engine worker owns `src/cache-maintenance.ts`, `src/cache.ts`, `src/service.ts`, new maintenance tests only; rootguard name `.maintenance.lock`, owner.json `{pid,token,timestamp}`. Preserve existing scope scan.lock protocol. Native worker owns Sources/Tests including pure CacheMaintenance and RefreshController drainage/integration. Parent adds localized TS notice strings, UI/docs, reviews and tests. No root cache clearing invocation except isolated tmp fixtures.
- UI must say cache clearing does NOT reset usage/bills: estimates rebuild from retained source logs on the next refresh. Unknown data is preserved, not recursively deleted; existing older plugin versions should be closed before maintenance because only new runtimes honor the root guard.

## Safety review ruling: serialized physical recovery

Native stale-guard recovery and guard acquisition/release use a kernel `flock` on the permanent, empty `.maintenance-recovery.lock` regular file (O_NOFOLLOW/O_CLOEXEC). The inode is never removed during clearing; the kernel drops ownership on process exit. Native rechecks owner/directory identity before reclaiming. TS readers never unlink a maintenance guard: after grace and stable proof of dead/absent owner they may ignore an abandoned primary guard for reads; only native code physically reclaims it under the kernel mutex. Existing per-scope locks and repeated root checks fence new work. This avoids cross-language FFI or a recursively stale recovery-lock directory. Shutdown now awaits maintenance completion as well as reader drainage. Both missing-kernel-lock and premature-shutdown cases were observed RED before fixes.
