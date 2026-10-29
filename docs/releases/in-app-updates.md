# Signed native updates — maintainer release procedure (since0.6.0)

The0.6.0 Apple Silicon release is the updater bootstrap. Installing0.5.0 cannot retrofit an updater; users install0.6.0 manually once. The native updater never updates the separate MCP plugin. Since0.6.1 the app performs optional quiet daily informational checks; it never automatically downloads or silently installs, and profiling is disabled.

## Public configuration / keys

The owner public channel is committed in `packages/usage-menubar/update-channel.json`, containing only `feedURL` and `publicKey`. Feed URL is exactly `https://no-short.io.vn/updates/experimental-arm64.xml`; public key is base64 of the owner's Ed25519 32-byte public key. Builds never generate or rotate production keys. The bootstrap key was created separately during the owner-authorized0.6.0 release; its private file stays outside Git. Private key backup/storage remains the owner's responsibility; never commit it or put it in app/website/CLI arguments/logs. Follow [Sparkle setup](https://sparkle-project.org/documentation/) to manage owner keys in Keychain or a dedicated secret store. Ad-hoc key loss can require a new manual bootstrap.

Development builds without `NO_SHORT_UPDATE_CONFIGURATION` remain explicitly unconfigured and offer manual downloads. Distribution builds require the reviewed canonical production config; temp/test configs cannot pass. Do not publish unconfigured development artifacts as an updater-capable bootstrap. x64 builds retain no ARM feed and are not public native app downloads.

```sh
# Public configuration only; no secrets here.
NO_SHORT_UPDATE_CONFIGURATION="$PWD/packages/usage-menubar/update-channel.json" npm run build:usage-menubar -- --distribution
npm run package:usage-menubar -- --distribution
# Owner private key is read from a private file or stdin '-', NEVER default login Keychain.
npm run prepare:usage-menubar:appcast -- /path/NoShortUsage-VERSION-arm64.zip VERSION PUBLIC_KEY /private/staging/feed /private/signing-key-file PREVIOUS_VERSION
```

The wrapper always passes `--ed-key-file -` to pinned Sparkle tools and redacts tool output on errors. Sparkle file format for owner-provided keys must match its documented export. Test keys are ephemeral base64-encoded 32-byte Ed25519 seeds (the pinned SDK's new format), generated outside Git and outside login Keychain. Keep backup and rotation procedures separate from build scripts.

## Release order (separately authorized)

1. Review/sign/build the exact bootstrap app; verify nested framework/helpers, architecture, source/provenance and installer capabilities.
2. Package final ZIP with `ditto`, extract it and verify again. Do not change these bytes after signing the archive/appcast.
3. Use the pinned Sparkle `sign_update` tool through the wrapper: archive EdDSA signature is independently checked with the public key; XML signature/framing uses the SDK. Release notes here are inline plain text and therefore covered by the signed feed.
4. Upload immutable ZIP/source/hash/validation assets under a new release tag and verify the public download; only then deploy the signed appcast. The tool refuses writing directly into website. PR CI never publishes.
5. Test actual A→B consent, installed version/relaunch and preserved data on isolated app copies before enabling the public feed or claiming updater acceptance.

Signed update archives/feeds do not replace Developer ID/notarization. Never disable Gatekeeper or distribution library validation. Existing NS-05 clean-machine, Intel, OS permissions/login and VoiceOver acceptance remain separate. Installing into protected locations may require macOS authorization; never collect passwords or implement an alternative privileged shell installer.

## Isolated SDK acceptance

Build the current runtime and native distribution resources first, then run the fixture harness with explicit lifecycle versions:

```sh
bun run build:usage
bun run build:usage-menubar --distribution
bun run test:usage-menubar:update-e2e --scenario=success --version-a=0.7.0 --version-b=0.7.2 --allow-system-test-cache
```

Use only the printed absolute fixture app path or its unique `dev.noshort.usage.updater-test.<uuid>` bundle ID for UI control. The cache flag authorizes a fresh test-ID-only SDK cache bridge; an existing path is never replaced. App/SDK preferences, sources, pricing, activity, context, exports and worker data use private fixture directories. Native OpenPanel services may additionally save window/bookmark metadata in the fresh test-ID preference domain outside that HOME; inspect and clean only that exact generated domain after GUI acceptance, preserving evidence first. Never remove a preexisting or installed-app preference domain. Worker sources must be canonical owned fixture paths; external paths and symlink escapes are rejected.

The success case seeds settings only on A and waits for B to read A's selected alternate source (one 110-token Codex session), preserve source settings, locale, budgets, custom prices including zero and generated JSON/CSV exports, and match the complete payload bundle fingerprint. `maintenance` and `worker-drain` separately exercise deferred replacement. Negative scenarios require real request boundaries and recorded SDK outcomes before their finish marker is accepted; unchanged bytes alone are insufficient. `probe-network --hold-probe` retains a quiet informational failure for UI inspection before `finish-probe` permits the actual relaunch/cadence check.

These versions belong to test bundle identities. The compiled helper retains its actual source version. A fixture's successful replacement is not acceptance of a byte-identical final production ZIP or the owner's installed app.

Additional private acceptance runners:

```sh
bun packages/usage-menubar/scripts/update-e2e-preservation.integration.ts
bun packages/usage-menubar/scripts/acceptance-performance.ts --supported-large
bun packages/usage-menubar/scripts/acceptance-performance.ts --large
```

The supported large shape tests input scan volume below the native 16MiB report limit. The larger-output shape must preserve that limit and report a clear controlled refusal; it must not truncate sessions or ledger entries.
