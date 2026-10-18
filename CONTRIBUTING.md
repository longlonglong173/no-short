# Contributing to No Short Usage

This repository contains the usage engine, Codex MCP panel, native macOS app and product website. Reusable skill work belongs in [no-short-skills](https://github.com/longlonglong173/no-short-skills).

## Before opening a pull request

```sh
bun install --cwd packages/usage --frozen-lockfile
npm run validate
npm test
npm run typecheck:usage
```

For native app changes run `npm run test:usage-menubar`, then the build and smoke checks documented in [the native guide](docs/no-short-usage-menubar.md). Website changes require `node --check website/app.js`, `node --test website/tests/*.test.mjs` and a browser check of EN/VI, light/dark and mobile layouts.

For packaging changes run `npm run package:usage` after building the required runtimes. Test Codex discovery from a clean temporary profile. Distinguish protocol/browser checks from rendering inside the actual host, and local builds from installation on another Mac.

## Compatibility and versioning

Keep `plugin.json`, `package.json`, `packages/usage/package.json` and `packages/usage/runtime-manifest.json` versions synchronized. Keep exact runtime URLs/checksums and the existing `no-short` plugin/marketplace identity unless a migration is explicitly planned. Website/content changes alone do not replace already published binary assets.

The Usage plugin provides a local MCP server and does not require a `skills/` directory or a Claude skills wrapper. Do not bundle unrelated skills back into its package.

## Release boundaries

Use the root MIT license and preserve [third-party notices](NOTICE.md). Follow the [release record](docs/releases/0.4.2.md) before native distribution. Passing tests or cross-compilation is not proof of Apple signing, notarization, clean-Mac acceptance or public-directory eligibility. Release preparation scripts do not publish artifacts. Do not modify old release assets or submit a marketplace update as part of a routine source PR.
