# Moving skills to no-short-skills

`no-short` now focuses on No Short Usage. `no-ai-slop` and `personal-work-report`, including all supporting files, moved unchanged to [no-short-skills](https://github.com/longlonglong173/no-short-skills). The new repository preserves extracted skill history and versions its package independently from 0.1.0.

## Skills CLI

Use the new source for installation and updates:

```sh
npx skills add longlonglong173/no-short-skills --all
```

If old and new copies appear together, use your installer to remove the copies installed from `longlonglong173/no-short`. Do not delete unrelated skills.

## Codex

```sh
codex plugin marketplace add longlonglong173/no-short-skills
codex plugin add no-short-skills@no-short-skills
```

Start a new chat. Keep `no-short@no-short` if you use the Usage panel: its plugin and marketplace IDs are unchanged. Older cached `no-short` packages may still include the bundled skills until updated/reinstalled. Updating source does not modify an installed cache automatically.

## Claude Code

```text
/plugin marketplace add longlonglong173/no-short-skills
/plugin install no-short-skills@no-short-skills
```

After installing the replacement, uninstall the old skills-only wrapper with `/plugin uninstall no-short@no-short` and start a new session. Usage no longer ships that Claude wrapper. The standalone No Short Usage.app, including Claude usage and context support, is unaffected.

## Releases and existing listings

Historical `no-short` release archives remain unchanged and may contain skills. No release assets are replaced by this split. Existing public-directory submissions/listings are separate from GitHub source; this change does not cancel, replace, approve or publish any directory submission.
