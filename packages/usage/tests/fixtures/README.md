# Usage fixture boundary

`unified.json` reproduces the field structure observed from the pinned native
ccusage 20.0.34 unified JSON report. It contains invented names, UUIDs, counts,
prices and timestamps; no user messages, credentials or local paths are retained.
It covers two sessions, two models, and day/month aggregation. Unknown-price
variants are constructed in the adapter and browser tests.

The native integration test creates a disposable Codex-format rollout, invokes
that exact ccusage binary, and checks cached input and reasoning handling. It
uses `packages/usage/runtime/darwin-<arch>/ccusage` after the normal build, or an
explicit `NO_SHORT_USAGE_CCUSAGE` override. It is skipped on hosts without that
binary; macOS CI builds it before the test run.

Browser tests intercept only the development endpoint with these fixtures.
The packaged panel has no fixture/demo-data fallback. Real-log smoke outputs
and screenshots belong under ignored `.artifacts/`, never this fixture folder.
