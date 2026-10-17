# no-short

A collection of reusable skills for Codex, Claude Code, and other AI agents. Built by Long.

`no-short` is a multi-skill repository and installable plugin. It includes writing cleanup, evidence-based personal work reports, and **No Short Usage**, a local Codex usage panel for macOS Desktop.

No Short Usage estimates API-equivalent costs using ccusage 20.0.34. These are not ChatGPT bills or credit deductions. Install the complete plugin to use the panel; no separate app, DMG, Node/Bun installation or API key is required. See [installation, development and verification](docs/no-short-usage.md). Source-only runtime downloads require a matching published release; local packages can be tested without publishing.

## Project status

- Portable Agent Plugin manifest for Codex and other compatible hosts
- Claude Code plugin and marketplace metadata
- Skills CLI-compatible `skills/` layout
- Dependency-free local validation and GitHub Actions validation
- `no-ai-slop` skill with edit and detection modes
- `personal-work-report` skill for evidence-based reports from Jira, GitHub, and Slack
- Local MCP server and conversation panel for Codex usage on macOS 14+ (Apple Silicon and Intel build targets)
- Pinned native runtime, checksum-verified launcher and browser/protocol tests

## macOS menu bar app

An optional native **No Short Usage.app** keeps local Codex usage visible on the menu bar when the conversation panel is closed. It bundles its runtime, shows API-equivalent USD estimates, and offers an opt-in login item. See [installation, build commands and verification limits](docs/no-short-usage-menubar.md). The companion is a separate local artifact; installing the plugin does not install the app.

## Available skills

| Skill | Purpose |
| --- | --- |
| [`no-ai-slop`](skills/no-ai-slop/SKILL.md) | Edit writing into clearer, more human prose while preserving personal voice, or flag specific AI-slop patterns without guessing authorship. |
| [`personal-work-report`](skills/personal-work-report/SKILL.md) | Build personal standup, weekly, sprint, monthly, or custom-period reports from verified Jira, GitHub, and Slack activity. |

## Repository layout

```text
.
├── plugin.json                         Portable Agent Plugin manifest
├── .agents/plugins/marketplace.json   Codex marketplace catalog
├── .claude-plugin/
│   ├── plugin.json                    Claude Code plugin manifest
│   └── marketplace.json               Claude Code marketplace catalog
├── assets/long-mini.png               Plugin logo and composer icon
├── skills/                            One folder per reusable skill
├── mcp.json                           macOS local usage server
├── packages/usage/                    Usage engine, MCP server, React panel and release scripts
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
npx skills add longlonglong173/no-short --skill personal-work-report --agent codex claude-code
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

For No Short Usage, use the complete local/release plugin package and open its conversation panel in a local Desktop chat. Installing only skills does not install its runtime. See [No Short Usage](docs/no-short-usage.md) for the no-DMG installation flow and release prerequisites.

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

1. Test each published skill from clean Skills CLI, Claude Code, and Codex installations.
2. Add release notes and choose a license before the first public release.
3. Add more focused skills based on real workflows and observed gaps.
4. Consider submission to the public OpenAI plugin directory after the collection has tested skills and complete listing metadata.

## Security

Review a skill and its bundled scripts before installing it. Skills can guide an agent to read files, run commands, or use connected tools with the same permissions granted to that agent.
