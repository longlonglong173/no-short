# Usage and skills repository split

The owner approved keeping No Short Usage as the flagship in `no-short` and moving reusable skills into `no-short-skills`.

- Keep the usage engine, native app, MCP panel, website, license and release history in `no-short`.
- Move both complete skill folders unchanged; extract their Git history with `git subtree split` and restore the `skills/` layout in the destination.
- Give `no-short-skills` independent manifests, marketplace names, validation, contribution instructions and version 0.1.0. It has no runtime or MCP requirement.
- Preserve the existing Usage plugin ID, runtime paths, version 0.4.2 and published download URLs. Remove the empty Claude skills wrapper from Usage; Claude skills users install the new plugin.
- Make the bilingual product website and README Usage-first. Link to the separate skills repository and document migration. Do not rewrite historical release records or publish a new binary release.
- Validate both repositories, compare every skill file byte-for-byte, test plugin discovery without skills, package Usage and inspect the archive, and check the website in English/Vietnamese and both themes.
- Push the skills repository first; present the Usage migration as a separate reviewable PR. Website deployment and marketplace submission are separate actions.
