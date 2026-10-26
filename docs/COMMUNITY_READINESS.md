# Community review preparation

Checked 2026-10-26. This is a preparation record, **not approval or submission**.

## Current official requirements

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Manifest](https://docs.obsidian.md/Reference/Manifest)
- [Plugin self-critique checklist](https://docs.obsidian.md/oo/plugin)
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/Developer%20policies)

Source snapshot: `obsidianmd/obsidian-developer-docs` commit
`1c26772ac13d6e9870c865936d389fdfe694e742`. Read the live documents again before a
future directory submission, because the procedure can change.

The official release procedure specifies a tag identical to the manifest
version, with no additional `v`, and binary attachments `main.js`,
`manifest.json`, optional `styles.css`. All three are meaningful here. Checksums
are supplementary. Root source includes README, LICENSE and manifest; generated
main.js is excluded from Git. The directory currently processes default-branch
manifest metadata and requires an Obsidian account plus linked GitHub ownership.

## Name and version checks

At `obsidianmd/obsidian-releases` commit
`cfcf757197496bef3e6a98930ab2ac122e83c64c`, `community-plugins.json` has no exact
name `Ripple Graph Filter` or ID `ripple-graph-filter`. It does contain the
distinct name/ID `Ripple`/`ripple` (`nejmlabs/obsidian-ripple`). This confirms the
longer name is needed; the snapshot check does not reserve a name or guarantee
the current directory's decision.

**Blocking version mismatch with directory policy:** the user's release policy
requires an alpha until integrations are verified. The current official docs
accept only numeric `x.y.z` versions. This project deliberately uses matching
`0.1.0-alpha.1` in package, manifest, versions mapping and GitHub tag, marks the
GitHub Release prerelease, and documents manual installation. This is not
represented as a directory-installable release. After safe write APIs and live
validation exist, a separate numeric version and fresh review will be needed.

## Engineering review

| Check                                           | Result / remaining condition                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Name/ID syntax and uniqueness snapshot          | Pass; current directory must check again at submission                                                   |
| Required manifest fields                        | Present; alpha version is the explicit directory blocker                                                 |
| minAppVersion                                   | 1.14.5, current stable in audited desktop-releases.json; conservative until live tests                   |
| Desktop/mobile                                  | Desktop-only declared; mobile has not been tested                                                        |
| Network, telemetry, advertising, remote loading | None in production source                                                                                |
| Note/frontmatter/link modifications             | No writes; official metadata and Vault reads only                                                        |
| Host API use                                    | Official UI/workspace/vault APIs; isolated guarded internal discovery shim is disclosed                  |
| External graph API use                          | Only documented GraphFrontier reads, exactly version-pinned; no renderer access                          |
| Plugin cleanup                                  | Timers aborted, sessions cleared, adapter AbortControllers aborted; event refs registered with Component |
| Hardcoded config folder                         | None in production code; manual-install example explains configured configDir                            |
| DOM construction                                | createEl/textContent/standard SVG attributes; no HTML string injection                                   |
| CSS                                             | Every production selector scoped to .ripple-view; host theme variables used                              |
| Hotkeys / commands                              | No default hotkeys; command IDs/names omit redundant plugin prefix                                       |
| Dependency pinning                              | npm lockfile and exact direct versions; no bundled third-party runtime code                              |
| Release integrity                               | check:artifacts validates versions, CJS, externals, exact file bytes and SHA-256                         |
| True integration verification                   | Pending; browser fixtures and upstream tests are not substitutes                                         |

No community directory application or upstream PR has been submitted. Remaining
work is documented openly rather than hidden behind a stable compatibility
claim.
