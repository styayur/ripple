# Third-party notices and license review

Ripple source is MPL-2.0. Copyright 2026 styayur. No source code from any of the
four target plugins has been copied or linked into Ripple. All four audited
repositories use MIT; repository links, exact commits and copyright owners are
in [the compatibility audit](docs/ADAPTER_COMPATIBILITY.md).

The generated `main.js` contains Ripple code only. Obsidian is an external host
module; the build rejects any bundled `node_modules` input. There are no runtime
npm dependencies. This separation matters: developer tools below are not
distributed in the plugin Release assets. Preserve their own notices if
redistributing a development dependency tree.

## Direct development dependencies

Versions are exact in `package.json` and integrity-locked in `package-lock.json`.
License declarations and installed license texts were inspected, not inferred
from package names.

| Package                            | License    | Source                                                 |
| ---------------------------------- | ---------- | ------------------------------------------------------ |
| obsidian 1.14.4 (API declarations) | MIT        | https://github.com/obsidianmd/obsidian-api             |
| typescript 6.0.3                   | Apache-2.0 | https://github.com/microsoft/TypeScript                |
| esbuild 0.28.2                     | MIT        | https://github.com/evanw/esbuild                       |
| eslint 10.13.0                     | MIT        | https://github.com/eslint/eslint                       |
| typescript-eslint 8.72.0           | MIT        | https://github.com/typescript-eslint/typescript-eslint |
| prettier 3.9.10                    | MIT        | https://github.com/prettier/prettier                   |
| tsx 4.23.15                        | MIT        | https://github.com/privatenumber/tsx                   |
| @types/node 26.6.5                 | MIT        | https://github.com/DefinitelyTyped/DefinitelyTyped     |
| spdx-expression-parse 5.0.0        | MIT        | https://github.com/jslicense/spdx-expression-parse.js  |

Browser test tooling is installed separately: Playwright Python 1.63.0
(Apache-2.0, https://github.com/microsoft/playwright-python) and its Chromium
test browser (Chromium/BSD and component licenses). Neither is a plugin asset.
GitHub Actions use checkout, setup-node, upload-artifact and setup-python from
the official `actions` organization (MIT); they run in CI, not inside Obsidian.

## Transitive review and audit policy

`npm run audit:licenses` checks every locked package, SPDX expression, version,
integrity and source URL. For installed packages it compares the package
manifest and hashes its license/notice files. Other-platform optional esbuild
binaries are checked against lockfile metadata; the platform's actual binary
is inspected on its CI runner. The report is `reports/licenses.json` and is
uploaded by CI. It is an inventory with evidence, not a legal opinion.

Reviewed development licenses: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC,
BlueOak-1.0.0, CC-BY-3.0 and CC0-1.0. Permissive code remains under its own
terms; Ripple's MPL-2.0 does not relicense dependencies. No GPL/AGPL dependency
or unrecognized license is accepted by the gate.

Specific package evidence (version changes require review):

- esbuild's platform binary package omits a separate LICENSE; its same-version
  parent `esbuild/LICENSE.md` provides the applicable MIT text.
- `@humanfs/types` 0.15.0 declares Apache-2.0 and omits a license file. The same
  humanfs monorepo's installed `@humanfs/core/LICENSE` supplies the Apache text.
  npm reports types gitHead `85069f193cbacc371c3beb649ce746f8c5a493be`.
- esrecurse 4.3.0 contains its full BSD-2-Clause copyright and terms in README
  and source: copyright 2014 Yusuke Suzuki.
- imurmurhash 0.1.4 contains full MIT text in README, copyright 2013 Gary Court,
  Jens Taylor.
- natural-compare 1.4.0 declares MIT in package/source and links the MIT license
  in README: copyright 2012–2015 Lauri Rooden.
- spdx-exceptions 2.5.0 attributes its source data to the Linux Foundation and
  contributors, copyright 2010–2015, CC-BY-3.0, in its README. Kyle Mitchell
  describes the mechanical extraction. Source:
  https://github.com/kemitchell/spdx-exceptions.json . This attribution is
  retained here; the identifier data is used only by the development audit.
- spdx-license-ids 3.0.24 explicitly links CC0-1.0 in its README; source:
  https://github.com/jslicense/spdx-license-ids .

Changing versions, adding runtime code, or redistributing tool binaries requires
another review. `npm audit --audit-level=low` separately checks currently known
vulnerabilities. Upstream GraphFrontier's separately installed audit checkout
had vulnerabilities in its own development tree; none of those dependencies
are installed in Ripple or bundled into its assets.
