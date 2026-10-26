# Third-party notices

Ripple's original source is MPL-2.0, copyright 2026 styayur. Third-party code
retains the licenses and copyrights below. MPL-2.0 does not relicense those
libraries. No source from the four reference Obsidian plugins was copied.

## Bundled runtime source

| Distribution | Fixed version | Source / files                                                                                                                                  | License and copyright                     | Changes in Ripple                                           |
| ------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| three        | 0.186.1       | https://github.com/mrdoob/three.js ; build/three.module.js, build/three.core.js, examples/jsm/controls/OrbitControls.js and its Controls import | MIT; Copyright 2010–2026 three.js authors | Imported API; bundled/minified without source modifications |
| d3-force     | 3.0.0         | https://github.com/d3/d3-force ; src modules listed in build evidence                                                                           | ISC; Copyright 2010–2021 Mike Bostock     | Used by the embedded layout worker; no source modifications |
| d3-dispatch  | 3.0.1         | https://github.com/d3/d3-dispatch ; src modules                                                                                                 | ISC; Copyright 2010–2021 Mike Bostock     | Transitive d3-force library, bundled in worker              |
| d3-quadtree  | 3.0.1         | https://github.com/d3/d3-quadtree ; src modules                                                                                                 | ISC; Copyright 2010–2021 Mike Bostock     | Transitive d3-force library, bundled in worker              |
| d3-timer     | 3.0.1         | https://github.com/d3/d3-timer ; src modules                                                                                                    | ISC; Copyright 2010–2021 Mike Bostock     | Transitive d3-force library, bundled in worker              |

Exact npm versions, registry source URLs and tarball integrity values are
locked in package-lock.json. Full original LICENSE texts for **all five**
distributions are included at the beginning of production main.js, including
copyright notices, permission conditions and warranty disclaimers. This also
covers the embedded worker. They are not replaced by a link or a Ripple-only
copyright claim. `reports/bundled-sources.json` inventories actual main and
worker inputs; CI uploads it with the package license report.

The MIT text from three includes:

> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

The ISC distributions require retention of their copyright and permission
notices. The build embeds the entire applicable texts, not only these excerpts.

## Four reference plugins: no code redistribution

Their actual licenses were re-read at the pinned commits below. The architecture
assessment identifies candidate modules and explains why extracting them would
carry a second model/lifecycle/persistence stack. These are design references,
not installed runtime dependencies and not copied source.

| Repository                                                  | Fixed commit                             | Original license / copyright     |
| ----------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| https://github.com/pikiby/GraphFrontier                     | 72223f9a020aefc73e0ac13e7d4945c15e2b28d5 | MIT; 2026 Boris Kazakov (pikiby) |
| https://github.com/n23eos/advanced_graph_view               | 17e3eb1fd0e64d4d13d9a130c4bd77b2f287b48d | MIT; 2026 n23eos                 |
| https://github.com/comedianhhh/obsidian-smart-cluster-graph | 6574861fca6e0b1f2780db450dca26ba6331ae67 | MIT; 2026 comedianhhh            |
| https://github.com/Longwind1984/galaxy-view                 | b49b60cb04687783153f24ff7f9b0a0af59334af | MIT; 2026 Rick                   |

Ripple target-file reuse mapping for these four repositories: **empty**. No
original copyright has been reassigned. Independent implementations are
identified in [UPSTREAM_ENGINE_AUDIT.md](docs/UPSTREAM_ENGINE_AUDIT.md).
The reproducible engine audit records LICENSE/build/source-file hashes and
upstream dependency declarations; it does not falsely certify all upstream
transitive packages or import their dependencies into Ripple.

## Direct development dependencies

| Package               | Version | License / source                                            |
| --------------------- | ------- | ----------------------------------------------------------- |
| obsidian              | 1.14.4  | MIT; https://github.com/obsidianmd/obsidian-api             |
| typescript            | 6.0.3   | Apache-2.0; https://github.com/microsoft/TypeScript         |
| esbuild               | 0.28.2  | MIT; https://github.com/evanw/esbuild                       |
| eslint                | 10.13.0 | MIT; https://github.com/eslint/eslint                       |
| typescript-eslint     | 8.72.0  | MIT; https://github.com/typescript-eslint/typescript-eslint |
| prettier              | 3.9.10  | MIT; https://github.com/prettier/prettier                   |
| tsx                   | 4.23.15 | MIT; https://github.com/privatenumber/tsx                   |
| @types/node           | 26.6.5  | MIT; https://github.com/DefinitelyTyped/DefinitelyTyped     |
| @types/three          | 0.186.0 | MIT; https://github.com/DefinitelyTyped/DefinitelyTyped     |
| @types/d3-force       | 3.0.10  | MIT; https://github.com/DefinitelyTyped/DefinitelyTyped     |
| spdx-expression-parse | 5.0.0   | MIT; https://github.com/jslicense/spdx-expression-parse.js  |

Playwright Python 1.63.0 is separately pinned for tests (Apache-2.0,
https://github.com/microsoft/playwright-python). Test Chromium retains its own
BSD/component licenses. Official GitHub checkout/setup-node/setup-python/
upload-artifact actions are MIT. These tools and the user's installed Obsidian
binary are not distributed in plugin assets. Obsidian is an external host.

## Auditing evidence and package exceptions

The locked dependency tree is checked by SPDX expression, version, integrity,
source URL and installed package LICENSE/notice/declaration hashes. Reports
distinguish installed packages from optional binaries for other platforms.
CI checks the installed binary on each Windows/Linux runner. License reports
are inventories, not legal opinions or a claim about unredistributed upstream
trees. Changes require review; unrecognized licenses fail the gate.

Some development packages publish their evidence outside a file named LICENSE:

- esbuild platform binaries use the same-version parent esbuild/LICENSE.md (MIT).
- @humanfs/types 0.15.0 declares Apache-2.0; the same monorepo's installed
  @humanfs/core/LICENSE supplies the Apache text. Its npm gitHead is
  85069f193cbacc371c3beb649ce746f8c5a493be.
- esrecurse 4.3.0 includes full BSD-2-Clause terms in README/source, copyright
  2014 Yusuke Suzuki.
- imurmurhash 0.1.4 includes full MIT text in README, copyright 2013 Gary Court,
  Jens Taylor.
- natural-compare 1.4.0 declares/links MIT in README/source, copyright 2012–2015
  Lauri Rooden.
- spdx-exceptions 2.5.0 attributes source data to the Linux Foundation and
  contributors, copyright 2010–2015, CC-BY-3.0. Kyle Mitchell describes the
  mechanical extraction: https://github.com/kemitchell/spdx-exceptions.json .
- spdx-license-ids 3.0.24 explicitly links CC0-1.0 in README:
  https://github.com/jslicense/spdx-license-ids .

Reviewed tree licenses are MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
BlueOak-1.0.0, CC-BY-3.0 and CC0-1.0. No GPL/AGPL code is accepted by the gate.
Known vulnerabilities are checked separately using npm audit at release time.
