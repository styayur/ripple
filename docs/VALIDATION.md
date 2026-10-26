# Validation record

Local verification date: 2026-10-26, Windows x64, Node 26.7.0 / npm 11.19.0.
CI uses Node 22 on Windows and Linux. Authoritative per-commit CI results and
downloadable evidence are in [GitHub Actions](https://github.com/styayur/ripple/actions).

| Command / check             | Observed local result                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| npm run format:check        | Pass                                                                                                                         |
| npm run lint                | Pass, no warnings                                                                                                            |
| npm run typecheck           | Pass, strict TypeScript                                                                                                      |
| npm test                    | 53 passed, 0 failed, no skipped tests                                                                                        |
| npm run build               | Pass, actual CJS main.js plus matching dist assets                                                                           |
| npm run check:artifacts     | Pass, installable files match root outputs; only obsidian external                                                           |
| npm run audit:licenses      | Pass, 140 locked packages; 114 installed packages' license/declaration evidence checked; 26 other-platform optional packages |
| npm audit --audit-level=low | 0 known vulnerabilities at audit time                                                                                        |
| npm run test:browser        | 10 checks passed, zero page errors; headless Chromium with a mocked SDK                                                      |
| npm run audit:upstream      | Pass at pinned GraphFrontier source commit                                                                                   |
| GraphFrontier source tests  | 27 passed in separately cloned upstream fixture suite                                                                        |
| git diff --check            | Pass                                                                                                                         |
| Real Obsidian integration   | Not performed; no full adapter compatibility claim                                                                           |

The 53 tests cover malformed and empty queries/graphs, exact/partial/absent
matches, 0–100 inclusive boundaries, monotonicity in both directions, negative
queries, corrupt metadata entries, duplicate/dangling links, deterministic
scores, original-subset restoration, repeat clear, disposal/re-enable,
non-retained bridges, all four adapters' missing/disabled/version/view states,
API errors, malformed responses, advancing empty pages, view selection,
reload/unload races, visibility changes, and no-op external restoration.

The browser fixture imports the production RippleView and MetadataIndex code
but substitutes the Obsidian host. It checks counts and fixed positions,
parse-error rollback, empty results, clear/restore, read-only snapshot calls,
invalidation/reload, 400px dark/light layout, listener disposal/re-enable and
empty vault behavior. [Recorded checks](evidence/browser-results.json).
Screenshots are uploaded by the browser CI job. These checks cannot establish
real Obsidian runtime compatibility or third-party plugin interoperability.

Upstream reproduction (separate directory): install GraphFrontier's lockfile
and run `node --test tests/api.test.cjs tests/api-actions.test.cjs` at commit
`72223f9a020aefc73e0ac13e7d4945c15e2b28d5`. Its own development dependency audit
reported 3 moderate and 5 high vulnerabilities, which are not Ripple's
dependencies. No upstream source or node_modules is part of Ripple's Release.

## Synthetic performance observations

One local run, deterministic graph with edges from i to i+1, i+7 and i+23 when
in range, title `ocean` every twentieth node, no body text. Query `ocean`, then
101 thresholds using cached scores. Milliseconds rounded for readability.

|  Nodes |   Edges | Normalize | First score | 101 cached thresholds | Observed heap delta MiB |
| -----: | ------: | --------: | ----------: | --------------------: | ----------------------: |
|  1,000 |   2,969 |      7.49 |        8.07 |                  2.35 |                    0.67 |
| 10,000 |  29,969 |     49.51 |       57.27 |                 18.59 |                   21.96 |
| 50,000 | 149,969 |    251.45 |      209.00 |                117.83 |                   82.14 |

[Raw benchmark](evidence/benchmark-windows-node26.json) includes runtime,
timestamp and checksums. No forced GC, repetition statistics, peak-memory
measurement, body-index benchmark or Obsidian UI measurement was performed.
These are observations, not performance guarantees. Run `npm run bench` to
reproduce the data generation; current machine timings will differ. CI uploads
fresh runner observations separately.

## Release verification procedure

Merge only after all PR CI jobs pass. Build the clean merged commit, run the
artifact check twice and compare checksum files. Compare local bytes with the
Linux CI artifact before publishing. Ensure no existing tag/release will be
overwritten. Only dist/main.js, manifest.json, styles.css and SHA256SUMS.txt are
Release assets. License inventories, synthetic fixtures, browser harnesses and
personal machine data are not included in install assets. Use the final Release
and PR links in the delivery report for the actual merge/publish outcome.
