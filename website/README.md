# no-short website

Bilingual English/Vietnamese static landing page for `no-short.io.vn`. The website is an independent deployment directory: only its public files are uploaded, not the plugin, local logs, runtime, or development artifacts.

## Local preview

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory website
```

Open `http://127.0.0.1:4173`. No installation or build step is required. `?lang=vi` or `?lang=en` selects a language; the switch saves the preference locally. The page includes a compact installation card in the hero, two skill cards, a before/after example, a concise Usage introduction with native previews, native FAQ disclosures, and a separate website privacy page. Fonts are self-hosted, with their original OFL license files under `fonts/`.

## Content boundaries

- Skill descriptions and commands come from the repository’s published `main` README and skill files.
- Usage 0.4.2 includes an owner-approved experimental Apple Silicon app, explicitly labeled ad-hoc signed and not notarized. Its app download links to the published release asset; checksum and installation-note files remain on the release without extra links in the download section. Intel app downloads remain unavailable. Source archives are a separate developer option. `/usage.html` explains setup, context, privacy, troubleshooting and removal in EN/VI. Documentation points to `main`, not a temporary feature branch.
- `images/` contains native AppKit renders with synthetic data only, in both themes; these are not live account screenshots. Their provider marks retain their respective owners’ rights (see the repository `NOTICE.md`).
- The writing edit, prompts and usage visual are illustrative examples, not user data or actual account usage.
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

`theme.js` runs before CSS to apply the saved theme, or the system preference on first visit. The toggle persists an explicit choice, syncs tabs, and remains usable if storage is blocked. The privacy page shares the control and preference. `app.js` localizes its accessible action label. Versioned CSS/JS URLs invalidate earlier static assets (`style.css?v=7`, `app.js?v=10`, `theme.js?v=2`).

Run the theme behavior tests (system changes, persistence, storage denial, invalid preferences and cross-tab synchronization):

```sh
node --test website/tests/*.test.mjs
node --check website/app.js
node --check website/theme.js
npm run validate
```

`tests/` is excluded from deployment. Verify EN/VI, both themes, installation tab/copy behavior and mobile layouts in the browser before deploying.

## App distribution status

The owner approved public distribution of the exact Apple Silicon ZIP they tested locally. Release assets use an explicit `experimental` suffix. The website must disclose ad-hoc signing, missing Apple notarization and possible first-launch blocking. Do not imply clean-machine/Gatekeeper or Intel verification. The signed-release workflow/checklist remains a separate future milestone.

## User-facing Usage content

The home page explains three benefits, shows the app and two illustrative context
states, and offers one Apple Silicon download plus a user-guide link. Compatibility
is Mac with M1 or later and macOS 14+; Intel availability is a short note. A single
practical first-launch warning is shown near the download. API cost estimates
remain distinct from bills and subscription spending.

The EN/VI user guide prioritizes installation, reading context, changing the alert
threshold and connecting Claude. Troubleshooting, session following, update/removal,
and technical/signing details are collapsed by default. Keep privacy and estimate
limitations visible. Source ZIP, patch, release, checksum and installation-note
links are not part of the download section; no checksum step is required in the
basic installation instructions. Only link to actual published app assets.

## Context alerts build (2026-10-18)

The latest Apple Silicon download uses a separate `context-alerts-experimental`
asset on the v0.4.2 release. Original assets remain unchanged. Both home and setup
pages describe the default 70% threshold, red menu bar logo/ring, configurable
threshold, panel warnings, macOS notification permission and crossing deduplication
in EN/VI. The new screenshot files have unique names for cache invalidation.

The tagged v0.4.2 source archive is the base source. Apply the release asset
`SOURCE-context-alerts-experimental.patch` to reproduce this native build; the
patch was verified against the tag. The new checksum and installation notes match
this build. Local build/smoke checks do not claim owner acceptance, macOS banner
delivery or installation on other Macs. Intel remains build-only.
