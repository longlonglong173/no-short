# Repository split implementation plan

**Goal:** Make No Short Usage the main product while preserving both skills in an independently installable repository.
**Spec:** ../specs/2026-10-18-repository-split-design.md
**Execution:** Direct implementation in this chat, following the approved repository boundary.

- [x] Extract skill-only Git history and restore `skills/` layout; compare complete file contents.
- [x] Add standalone skills manifests, marketplaces, README, privacy, contribution and CI; validate and check discovery.
- [x] Remove skills and the Claude skills wrapper from Usage; update validator, packaging, metadata and migration instructions.
- [x] Update the existing bilingual website around app downloads and Usage; preserve theme, privacy and experimental status.
- [x] Run usage, packaging, website and repository checks; inspect final diffs.
- [ ] Publish skills to its existing empty repository, push the Usage branch and open a migration PR; verify remote commit IDs.
