# Ripple 0.2 validation

Pure tests, browser fixtures and real-host tests are recorded separately.
[GitHub Actions](https://github.com/styayur/ripple/actions) is authoritative for
per-commit CI outcomes and downloadable artifacts.

## Baseline protection

Before implementation, HEAD and origin/main were
c4ff05431df0e8bd2889cabf6b10188d606a5714, the worktree was clean, and tag
0.1.0-alpha.1 resolved to that commit. The four historical assets were present
with original digests. The original 53 tests, 10 browser checks, formatting,
lint, typecheck, build, license and vulnerability gates passed again. Work uses
feat/unified-graph-workspace-v0.2. No historical tags/assets are replaced.

## Current gates

**64 unit/contract tests** pass without skips. They cover existing query,
Unicode, score, monotonicity and error behavior plus immutable cached snapshots,
incremental edits/deletes, directed weights, endpoint consistency, revision/cache
invalidation, shared visibility across all modes, independent cameras/positions,
selection, strict bridge behavior, communities/PageRank/hulls/3D seeds, pinned
force nodes and lifecycle disposal. Legacy adapter tests are separate from
the 0.2 production mode implementation.

**12 browser checks** run actual view/index/controller/renderer code with a
mocked Obsidian SDK and real Canvas, Blob Workers and WebGL. They verify shared
65% eligibility, selection, real depth/orbit, independent cameras, keyboard
zoom, Mock host file opening, query rollback, empty graphs, body cache and
modified-body invalidation, dark/narrow layout, cleanup and explicit WebGL
failure recovery. [Evidence](evidence/browser-v0.2.json).

npm ci, Prettier, ESLint without warnings, strict TypeScript, production esbuild,
asset verification and dependency audits pass locally. The license gate checks
153 locked packages: 127 installed here, 26 other-platform optional binaries.
The known-vulnerability audit reports 0 vulnerabilities at audit time. The only
external host module is obsidian; Three.js and d3-force are bundled with full
MIT/ISC notices. Both main and worker source inputs are inventoried.

CI runs Node 22 quality jobs on Windows/Linux, Linux repeatability and actual
browser/render benchmarks. Hosted CI does not run real Obsidian. A workflow
definition alone is not a passing CI result; use the actual commit/run links.

## Real Obsidian integration

**PASSED within this scope:** Windows 11 Home build 26200, Obsidian API/app
1.14.5, desktop installer 1.13.7, Electron 43.3.0. The installed app/update binary
was launched with a newly created profile and synthetic 32-note vault under
reports/obsidian/. The actual opened vault path was verified before runtime
actions. No deployment, test data or writes touched the user's existing vault.

The 13 checks cover isolated startup, production three-file plugin loading,
opening/indexing, four real renderers with identical 65% IDs, shared query/
threshold/selection, genuine WebGL orbit, independent cameras, actual node
click/file opening, Frontier pins/fit/reset, query errors, real host appearance
changes, file create/modify/delete indexing, leaf-state restoration and plugin
disable/re-enable. Camera comparisons allow 1e-6 floating-point tolerance.

The final harness requires zero captured runtime errors and unchanged byte
hashes for all 32 initial notes. One additional test-owned note is created,
modified and deleted for indexing checks. The author-trust dialog is accepted
only in this newly authored isolated vault. Debug/host APIs in the harness are
not production plugin APIs. [Recorded checks and built-asset hashes](evidence/obsidian-v0.2.json).

Failed development runs are not counted as compatibility passes. The harness
initially enabled a plugin twice concurrently; the redundant enable was removed.
Windows CRLF fixtures were normalized by the host editor on open, so fixtures
now start with LF while retaining strict byte checks. Deleting the additional
fixture through the host API avoids racing its pending reads. No failing test
was skipped or relabeled a pass.

**NOT TESTED:** other host versions, macOS/Linux Obsidian, mobile, other GPUs,
large real vaults, real GPU/device-reset recovery, multi-window/popout workflows
and full OS reboot. Injected browser WebGL failure is not hardware certification.
Leaf restoration and plugin restart were exercised; those are distinct from
a complete operating-system/application cold-restart matrix.

## Performance and cost

The alpha main.js is 24,116 bytes; the 0.2 bundle is about 604 KiB because it
includes real Three.js and worker physics. Exact final bytes are in Release
metadata. Direct runtime dependencies increased 0→2, direct development
dependencies 9→11, locked packages 140→153, installed packages 114→127. Ripple
does not claim to be lighter than four installed plugins. The baseline build
reported 92 ms in the fresh audit; individual 0.2 esbuild observations were
roughly 128–166 ms. These are not timing distributions.

Baseline plugin startup/index/render times are **NOT MEASURED**. Real 32-note
0.2 plugin-ready wall observations were about 0.26–0.41 s, including host
trust/load and automation, not isolated onload timing.

Core synthetic graph: Node 26.7.0, Windows x64, links i→i+1/i+7/i+23, query
`ocean` keyword fixture, then 101 cached thresholds. One run, no
forced GC. [Raw core data](evidence/core-v0.2.json).

|  Nodes |   Edges | Normalize ms | First score ms | 101 thresholds ms | Analysis ms | 3D seed ms | Force setup + 2 ticks ms |
| -----: | ------: | -----------: | -------------: | ----------------: | ----------: | ---------: | -----------------------: |
|  1,000 |   2,969 |          5.8 |            8.9 |               2.1 |        21.0 |        1.5 |                     49.3 |
| 10,000 |  29,969 |         68.9 |           49.1 |              20.0 |       162.1 |        7.4 |                    214.7 |
| 50,000 | 149,969 |        307.8 |          241.3 |             163.0 |     1,039.7 |       19.9 |                    865.1 |

Observed heap deltas: 9.4/45.8/174.9 MiB. They include new analysis/layout work,
exclude peak memory, and are not directly comparable to the old core-only sample.

Renderer fixture: Chromium 153 headless SwiftShader, 1440×1000, mocked SDK with
real graphics. All modes completed at 1k/10k/50k candidates and 2k/20k/100k
directed links. Index plus controller wall times: approximately 43/751/2,742 ms.

| Mode     | 1k init ms | 10k init ms | 50k init ms | 50k sampled CPU draw ms | Observed JS heap MiB at 50k |
| -------- | ---------: | ----------: | ----------: | ----------------------: | --------------------------: |
| Frontier |         64 |          43 |          78 |                    16.4 |                         146 |
| Dense    |         30 |          66 |          90 |                    19.2 |                         149 |
| Cluster  |         40 |         313 |         310 |                    16.8 |                         142 |
| Galaxy   |        196 |       4,155 |      29,008 |                     0.2 |                          82 |

Galaxy's 50k software-WebGL context creation took 28,825 ms, geometry creation
37 ms and first render submission 33 ms. This slow result remains in the
record. CPU submission is not GPU completion; heap excludes workers/GPU. Raw
zoom intervals include outliers around 1.6 s in Frontier and 147 ms in Dense.
Do not infer guaranteed FPS. Later zooms cull many 2D points; they are not a
measurement with all nodes on screen. [Raw render data](evidence/render-v0.2.json).

These are synthetic, single-run observations, not real-Vault performance. The
benchmark timeout is 90 seconds so slow contexts are recorded, not discarded;
initialization/interaction errors still fail. Current-run reports are uploaded
separately by CI, rather than replacing these local observations.

## Reproduction and release

Run npm ci, npm run check, npm run test:browser, npm run bench and npm run
bench:render. Windows installed-host testing: npm run test:obsidian. For separate
source checkouts set UPSTREAM_AUDIT_ROOT and run npm run audit:engines. The
audit records hashes and copies no plugin code.

Release only after PR and final main CI pass. Build the merged source twice,
compare hashes with CI artifacts, create an unused matching tag, upload only
main.js/manifest.json/styles.css/SHA256SUMS.txt, then download and compare all
four files. The final report supplies actual PR, commit, CI and Release links.
