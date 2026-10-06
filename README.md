# no-short

A collection of reusable skills for Codex, Claude Code, and other AI agents. Built by Long.

`no-short` is a multi-skill repository and installable plugin. Its first skill, `no-ai-slop`, edits drafts without flattening the writer's voice and can audit drafts for named AI-writing patterns.

## Project status

- Portable Agent Plugin manifest for Codex and other compatible hosts
- Claude Code plugin and marketplace metadata
- Skills CLI-compatible `skills/` layout
- Dependency-free local validation and GitHub Actions validation
- `no-ai-slop` skill with edit and detection modes

## Available skills

| Skill | Purpose |
| --- | --- |
| [`no-ai-slop`](skills/no-ai-slop/SKILL.md) | Edit writing into clearer, more human prose while preserving personal voice, or flag specific AI-slop patterns without guessing authorship. |

## Repository layout

```text
.
├── plugin.json                         Portable Agent Plugin manifest
├── .agents/plugins/marketplace.json   Codex marketplace catalog
├── .claude-plugin/
│   ├── plugin.json                    Claude Code plugin manifest
│   └── marketplace.json               Claude Code marketplace catalog
├── skills/                            One folder per reusable skill
└── scripts/validate.mjs               Repository validation
```

Each skill will live at `skills/<skill-name>/SKILL.md`. Supporting files may be added under that skill's `scripts/`, `references/`, or `assets/` directory only when the workflow needs them.

## Install

### Skills CLI

List the skills available in the repository:

```bash
npx skills add longlonglong173/no-short --list
```

Install all published skills for every supported agent:

```bash
npx skills add longlonglong173/no-short --all
```

Install one skill for selected agents:

```bash
npx skills add longlonglong173/no-short --skill no-ai-slop --agent codex claude-code
```

### Claude Code plugin

```text
/plugin marketplace add longlonglong173/no-short
/plugin install no-short@no-short
```

Start a new Claude Code session after installation.

### Codex plugin

Add the GitHub-hosted marketplace:

```bash
codex plugin marketplace add longlonglong173/no-short
```

Then open the plugin browser in Codex, select the **No Short** marketplace, and install **no-short**. Start a new chat after installation.

## Add a skill

1. Choose a focused, action-oriented kebab-case name.
2. Create `skills/<skill-name>/SKILL.md` with `name` and `description` YAML frontmatter.
3. Write provider-neutral instructions unless behavior genuinely applies to only one agent.
4. Add scripts, references, and assets only when they materially improve the workflow.
5. Run `npm run validate`.
6. Test the skill from a clean installation before release.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository rules and release checklist.

## Validate

```bash
npm run validate
claude plugin validate .
```

The local validator checks manifest consistency, marketplace wiring, and every discovered `SKILL.md`. Claude Code's validator provides an additional product-specific check.

## Distribution roadmap

1. Test `no-ai-slop` from clean Skills CLI, Claude Code, and Codex installations.
2. Add release notes and choose a license before the first public release.
3. Add more focused skills based on real workflows and observed gaps.
4. Consider submission to the public OpenAI plugin directory after the collection has tested skills and complete listing metadata.

## Security

Review a skill and its bundled scripts before installing it. Skills can guide an agent to read files, run commands, or use connected tools with the same permissions granted to that agent.
