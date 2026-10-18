# no-short website

Bilingual English/Vietnamese static landing page for `no-short.io.vn`. The website is an independent deployment directory: only its public files are uploaded, not the plugin, local logs, runtime, or development artifacts.

## Local preview

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory website
```

Open `http://127.0.0.1:4173`. No installation or build step is required. `?lang=vi` or `?lang=en` selects a language; the switch saves the preference locally. The page includes a compact installation card in the hero, two skill cards, a before/after example, a development-only Usage introduction, native FAQ disclosures, and a separate website privacy page. Fonts are self-hosted, with their original OFL license files under `fonts/`.

## Content boundaries

- Skill descriptions and commands come from the repository’s published `main` README and skill files.
- Usage is presented as in development: no public release/download is claimed. Its documentation links to the current `codex/no-short-usage` branch.
- The writing edit, prompts and usage visual are illustrative examples, not user data or actual account usage.
- API-equivalent estimates are distinguished from bills, credits and quota.
- No analytics or third-party integrations are installed. Stored preferences are the selected language and light/dark theme.

## Vercel

The Vercel project uses `website` as its root, with no framework or build command. `vercel.json` configures security headers. Local Vercel identity lives in ignored `.vercel/` state. Run CLI deployments from the repository root; the root `.vercelignore` includes only public website files.

```sh
npm exec --yes --package=vercel -- vercel deploy --project no-short-website --prod --scope longlonglong173s-projects
```

Attach the purchased domain to this project in Vercel, then use the exact DNS records Vercel returns in Tenten. Domain registration remains at Tenten. Do not replace nameservers or unrelated DNS records just to connect this site.

Vercel linked the GitHub repository during project creation. Its root is set to `website`; the default production branch is `main`. This does not publish local source changes to GitHub. Until the website is merged into `main`, production updates are made explicitly using the CLI. Keep the Usage feature branch and its release status separate from website deployment.

## Theme and verification

`theme.js` runs before CSS to apply the saved theme, or the system preference on first visit. The toggle persists an explicit choice, syncs tabs, and remains usable if storage is blocked. The privacy page shares the control and preference. `app.js` localizes its accessible action label. Versioned CSS/JS URLs invalidate earlier static assets (`style.css?v=3`, scripts at `?v=2`).

Run the theme behavior tests (system changes, persistence, storage denial, invalid preferences and cross-tab synchronization):

```sh
node --test website/tests/theme.test.mjs
node --check website/app.js
node --check website/theme.js
npm run validate
```

`tests/` is excluded from deployment. Verify EN/VI, both themes, installation tab/copy behavior and mobile layouts in the browser before deploying.
