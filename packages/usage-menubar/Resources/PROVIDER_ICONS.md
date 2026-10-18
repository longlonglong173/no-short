# Provider icons

These marks identify the local tool whose usage is displayed. They remain the property of OpenAI and Anthropic; their presence does not imply endorsement.

- `codex.svg`: exact monochrome `codex-light-16` glyph from the installed OpenAI app, `/Applications/ChatGPT.app/Contents/Resources/app.asar`, `webview/assets/app-shared-52443cbe9ac4.js`, extracted on 2026-10-18. Only its SVG path is included, with `currentColor` resolved to black.
- `claude.svg`: the first path (Claude symbol) from the official Claude Code documentation's [light logo](https://mintcdn.com/claude-code/c5r9_6tjPMzFdDDT/logo/light.svg), linked by [Claude Code overview](https://code.claude.com/docs/en/overview), retrieved on 2026-10-18. The wordmark is omitted; the view box is square and the fill is black.

The matching PDFs were compiled from the SVGs with svglib/reportlab. They retain vector outlines and transparency. AppKit uses them as 16-point template images, automatically adapting to the menu bar appearance. The combined view places both marks four points apart. The assets are bundled locally; displaying them performs no network request. The Python libraries are asset-compilation tools, not app or normal build dependencies.


Version 0.4.2 renders these same marks at 11 points inside 22-point dynamic context
rings. The ring is drawn by AppKit for the current percentage, with a separate
dashed unknown state; no percentage-specific images are bundled. The combined
mode uses a separate ring for each provider, never a combined percentage.
