# Contributing to no-short

Thanks for helping improve `no-short`.

## Skill requirements

- Put each skill in `skills/<skill-name>/`.
- Use lowercase letters, digits, and hyphens for the folder and frontmatter `name`.
- Keep the name under 64 characters and make the folder name match the skill name.
- Write a specific `description` that says what the skill does and when it should be used.
- Keep shared workflow guidance in `SKILL.md`; move conditional detail to focused files under `references/`.
- Use `scripts/` only for repeatable logic that benefits from deterministic execution.
- Use `assets/` only for files intended to be copied or adapted into outputs.
- Keep instructions provider-neutral unless a product-specific behavior is essential.
- Do not include secrets, personal paths, generated caches, or unfinished scaffold text.

## Before opening a pull request

Run:

```bash
npm run validate
claude plugin validate .
```

Also test the changed skill with at least one realistic request. Record what was tested and distinguish local validation from successful behavior inside an actual agent session.

## Versioning

The three plugin manifests must keep the same `name`, `version`, and `description`:

- `plugin.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

Use semantic versioning for releases. A release that only adds or improves skills can usually be backward-compatible; breaking changes to skill behavior or installation paths require a major version decision.

## Public release checklist

- At least one complete, tested skill exists.
- Installation works from a clean clone or GitHub marketplace source.
- The README lists the real skill names and examples.
- A license has been selected and added.
- Plugin descriptions and publisher metadata are complete.
- No credential, private URL, or machine-specific path is present.

