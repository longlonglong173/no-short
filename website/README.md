# no-short website

English/Vietnamese/Simplified Chinese static landing page for `no-short.io.vn`. The website is an independent deployment directory: only its public files are uploaded, not the plugin, local logs, runtime, or development artifacts.

## Local preview

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory website
```

Open `http://127.0.0.1:4173`. No installation or build step is required. `?lang=vi`, `?lang=en` or `?lang=zh-CN` selects a language; the switch saves the preference locally. The page introduces No Short Usage, offers direct ZIP downloads in the header and hero, shows a native app preview beside the introduction and context rings below, and links to the user guide, separate skills repository and website privacy page. Fonts are self-hosted, with their original OFL license files under `fonts/`.

## Content boundaries

- Reusable skills are maintained and installed from `longlonglong173/no-short-skills`. The product site links there; it does not present skills installation as Usage installation.
- Usage 0.4.2 includes an owner-approved experimental Apple Silicon app, explicitly labeled ad-hoc signed and not notarized. Its app download links to the published release asset; checksum and installation-note files remain on the release. Compatibility and experimental status appear next to the main download button. Intel app downloads remain unavailable. Source archives are a separate developer option. `/usage.html` explains setup, context, privacy, troubleshooting and removal in EN/VI/简体中文. Documentation points to `main`, not a temporary feature branch.
- `images/` contains native AppKit renders with synthetic data only, in both themes; these are not live account screenshots. Their provider marks retain their respective owners’ rights (see the repository `NOTICE.md`).
- Usage previews contain illustrative data, not actual account usage.
- API-equivalent estimates are distinguished from bills, credits and quota.
- No analytics or third-party integrations are installed. Stored preferences are the selected language and light/dark theme.

## Vercel

The Vercel project uses `website` as its root, with no framework or build command. `vercel.json` configures security headers. Local Vercel identity lives in ignored `.vercel/` state. Run CLI deployments from the repository root; the root `.vercelignore` includes only public website files.

```sh
npm exec --yes --package=vercel -- vercel deploy --project no-short-website --prod --scope longlonglong173s-projects
```

Attach the purchased domain to this project in Vercel, then use the exact DNS records Vercel returns in Tenten. Domain registration remains at Tenten. Do not replace nameservers or unrelated DNS records just to connect this site.

Vercel linked the GitHub repository during project creation. Its root is set to `website`; the default production branch is `main`. This does not publish local source changes to GitHub. Pull requests get preview deployments; merged `main` updates production through the configured integration. Website deployment is separate from native-app publication.

## Theme and verification

`theme.js` runs before CSS to apply the saved theme, or the system preference on first visit. The toggle persists an explicit choice, syncs tabs, and remains usable if storage is blocked. The privacy page shares the control and preference. `app.js` localizes its accessible action label. Versioned CSS/JS URLs invalidate earlier static assets (`style.css?v=10`, `app.js?v=19`, `theme.js?v=2`).

Run the theme behavior tests (system changes, persistence, storage denial, invalid preferences and cross-tab synchronization):

```sh
node --test website/tests/*.test.mjs
node --check website/app.js
node --check website/theme.js
npm run validate
```

`tests/` is excluded from deployment. Verify EN/VI/简体中文, both themes, installation tab/copy behavior and mobile layouts in the browser before deploying.

## App distribution status

The current download is `NoShortUsage-0.4.2-arm64.zip`
on the v0.4.2 release. It adds validated source lists per provider and retains
EN/VI/Simplified Chinese. The source commit and archive checksum are recorded in
`docs/releases/0.4.2.md`; earlier experimental assets remain available unchanged.

The download update was deployed to production on 2026-10-19 as
`dpl_3hsnjpHDqrrnSwFp8APe1J6ftLGg`, aliased to `no-short.io.vn`.
The live Vietnamese home page and guide showed the new ZIP link and multi-source
instructions in the browser. Local checks covered 13 website tests and 24 browser
combinations (three languages, two themes, mobile/desktop, home/guide).
Keep these source changes when merging future `main` deployments so they do not
restore an older download URL.

The owner requested publication of the current Apple Silicon update after local build, signature and runtime checks. Release assets use an explicit `experimental` suffix. The website must disclose ad-hoc signing, missing Apple notarization and possible first-launch blocking. Do not imply owner UI acceptance, clean-machine/Gatekeeper or Intel verification. The signed-release workflow/checklist remains a separate future milestone.

## User-facing Usage content

The home page explains three benefits, shows the app and two illustrative context
states, and offers one Apple Silicon download plus a user-guide link. Compatibility
is Mac with M1 or later and macOS 14+; Intel availability is a short note. A single
practical first-launch warning is shown near the download. API cost estimates
remain distinct from bills and subscription spending.

The EN/VI/简体中文 user guide prioritizes installation, reading context, changing the alert
threshold and connecting Claude. Troubleshooting, session following, update/removal,
and technical/signing details are collapsed by default. Keep privacy and estimate
limitations visible. Source ZIP, patch, release, checksum and installation-note
links are not part of the download section; no checksum step is required in the
basic installation instructions. Only link to actual published app assets.

## Context alerts build (2026-10-18)

The previous Apple Silicon download used a separate `context-alerts-experimental`
asset on the v0.4.2 release. Original assets remain unchanged. Both home and setup
pages describe the default 70% threshold, red menu bar logo/ring, configurable
threshold, panel warnings, macOS notification permission and crossing deduplication
in EN/VI/简体中文. The new screenshot files have unique names for cache invalidation.

The tagged v0.4.2 source archive is the base source. Apply the release asset
`SOURCE-context-alerts-experimental.patch` to reproduce this native build; the
patch was verified against the tag. The new checksum and installation notes match
this build. Local build/smoke checks do not claim owner acceptance, macOS banner
delivery or installation on other Macs. Intel remains build-only.


## Link preview metadata

All four public pages include page-specific title, description, canonical URL,
Open Graph and Twitter Card metadata directly in HTML. Static English values work
for crawlers without JavaScript; the existing language switch synchronizes browser
and social metadata for the selected EN/VI/简体中文 language. Query-string language choices
do not create server-rendered localized previews for crawlers that skip JavaScript.

`images/no-short-share-avatar.png` is the original, unmodified PNG downloaded from
the owner's supplied GitHub avatar URL (user 71415818). The response is 256×256,
so the metadata declares those actual dimensions and a square summary card. It is
served from this website, without an external image dependency. The old
`social.png` remains available for previously cached URLs. Actual preview layout
and refresh timing are controlled by the sharing platform.


## Sticky header

All public pages share a full-width sticky header with an inner content wrapper.
Its solid background follows the current theme. A ResizeObserver records the
actual header height for anchor scroll padding, including the two-row mobile
navigation and language/font changes. CSS provides desktop/mobile fallback
heights without JavaScript. The keyboard skip link stays above the header.

## No Short Skills introduction

`/skills.html` introduces the independent `no-short-skills` repository. It reuses the website's typography, EN/VI/简体中文 preferences and theme controls, with two skill cards, an illustrative edit, FAQ and keyboard-accessible Skills CLI/Codex/Claude installation tabs. `skills.js` owns installer interactions; shared `app.js` owns localization and page metadata. Skill instructions remain in the separate skills repository.

## Multilingual download update (2026-10-18)

The home and guide download buttons now point to the distinct published asset
`no-short-usage-menubar-0.4.2-darwin-arm64-multilingual-experimental.zip` on v0.4.2.
The older experimental and context-alerts ZIPs remain available for existing links.
This app adds English/Vietnamese/Simplified Chinese to its gear and right-click
language menus. The website's language selector and the app's selection are independent.
The guide explains how to replace an older copy and locate the language menu.

The release includes `INSTALL-multilingual-experimental.txt`,
`SHA256SUMS-multilingual-experimental.txt` and `SOURCE-multilingual-experimental.patch`.
The patch reconstructs the native package at merged commit `cc71edd` from v0.4.2;
the ZIP's executable matches the locally installed, UI-inspected multilingual app.
It remains ad-hoc signed and unnotarized. Intel execution, clean-machine installation
and macOS notification banner delivery remain unverified.

`tests/download.test.mjs` prevents either download button from reverting to the
Vietnamese-only ZIP and requires language instructions alongside the download.
CI runs all website tests. Before any future download update, publish the exact
asset, verify its hash and download response, then change both page links together.

## Localized native previews

The No Short Usage illustration switches among `popover-en-{light,dark}.png`,
`popover-vi-{light,dark}.png` and `popover-zh-CN-{light,dark}.png` with the website
language. The existing theme CSS selects the light/dark image. Both image sources
are updated on first load and on every language change; the English pair remains
the no-JavaScript fallback. Older image URLs remain available for cached pages.

All six images are native SwiftUI/AppKit renders with the same synthetic costs,
chart and context warning. Each uses a localized sample session name; no user's
session title or account logs were used. They are 800×1512 PNGs, preserving the
existing layout dimensions and illustrative-data caption.

To reproduce on a Retina Mac, from the repository root:

```sh
NO_SHORT_RENDER_DIR="$PWD/.artifacts/usage-menubar/website-previews" \
  swift test --package-path packages/usage-menubar --filter WebsitePreviewRenderingTests
```

Inspect the six outputs before copying them into `website/images/`. The Node
preview tests check language selection, persisted preferences, fallback behavior,
file presence and dimensions; verify all language/theme combinations in a browser.

## Experimental 0.4.3 download (2026-10-20)

Current links target the distinct `v0.4.3/NoShortUsage-0.4.3-arm64.zip` asset. The release records NS-03 setup/diagnostics and NS-04 About/manual updates. It remains ad-hoc signed and not notarized, with Apple Silicon as the only native app download. Companion checksums and validation scope are on the release. Earlier deployment/build notes above describe historical artifacts.


## Experimental 0.5.0 download (2026-10-21)

Current homepage/guide links target `v0.5.0/NoShortUsage-0.5.0-arm64.zip`. The native app includes NS-06–NS-12: provider parity, adaptive popover, metadata cache, history window, exports, optional budgets and bounded shared-cache maintenance. EN/VI/zh-CN labels and tagged privacy/technical-guide links follow this version. `app.js?v=22` invalidates the previous translation script.

The public native ZIP is still Apple Silicon only, ad-hoc signed and not notarized. Cross-built Intel helpers are not an Intel app installer or device proof. Keep historical assets immutable. Verify the exact released bytes against release `SHA256SUMS`/`release-validation.json` before rollout; published assets precede the production website update.

## Signed-update bootstrap0.6.0 (2026-10-26)

Production download links now targetv0.6.0/NoShortUsage-0.6.0-arm64.zip. Users of0.5.0 manually install this bootstrap once; future releases are checked/downloaded/installed with explicit confirmation in the app. The byte-identical owner-signed feed is served at/updates/experimental-arm64.xml with RSS content type and five-minute cache revalidation. Never edit signed XML without re-signing; publish and verify immutable assets before deploying a feed. Only the public key is included in source. Experimental/ad-hoc signing and separate NS-05 acceptance remain explicit. Translation script version23 updates all three languages.

## In-app update test0.6.1 (2026-10-26)

Current downloads/feed point to immutablev0.6.1 assets. A user on0.6.0 can choose Check for Updates in the app to install0.6.1; after relaunch the new version/status row and optional quiet daily discovery become available. No dummy0.6.2 is published. The existing owner key is reused and0.6.0 files remain unchanged. Translation scriptv24 updates the EN/VI/zh-CN version and test guidance. Signed XML is copied byte-for-byte after final signing and public-asset verification; feed media/cache policy stays the same.


## 0.7.2 recovery metadata preparation

The release branch now targets v0.7.2 across homepage/guide downloads, EN/VI/zh-CN release and recovery copy, tagged documentation, and app.js cache version26. The signed feed is copied byte-for-byte from the owner-signed canonical A3 candidate after all canonical CI gates and authenticated draft-download bytes/signatures/runtime behavior passed. Generated runtime manifest comes from the same verified assets, without rebuilding locally. Packaged README/guides/CHANGELOG/release notes remain frozen at A3. Updater-less 0.7.1 requires one manual reinstall; compatible 0.6.0–0.7.0 apps use the signed channel after feed activation; the MCP plugin updates separately. Experimental ARM/ad-hoc/non-notarized limits remain explicit.

This is prepared metadata, not public rollout: the owner retains release publication and PR merge. Keep the draft Latest=false, publish/verify actual public assets first, then activate the reviewed recommendations/feed in order. Record source A3 and later metadata commit externally; do not edit the sealed metadataReleaseCommit=null. Intel same-payload CI execution is separate from owner-authenticated ARM trust; notarization, device acceptance and the actual owner upgrade remain pending.
