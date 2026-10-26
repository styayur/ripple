# Unified workspace engine audit (2026-10-26)

The four reference repositories were fetched again before implementation. Their
remote default heads still match these pinned commits. LICENSE, package/lock
files, build scripts and the implementation files below were inspected. No
source from these four plugins is copied into the 0.2 engine. They are references,
not required installed plugins. Ripple remains MPL-2.0.

| Repository                               | Commit                                   | License / copyright              | Renderer and layout                            | Model and state                                                                                           |
| ---------------------------------------- | ---------------------------------------- | -------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| pikiby/GraphFrontier                     | 72223f9a020aefc73e0ac13e7d4945c15e2b28d5 | MIT, 2026 Boris Kazakov (pikiby) | Custom Canvas 2D; own spatial-bucket physics   | Path IDs, edges by ID, Set selection, camera/target, pins/search/subsets saved in plugin layouts          |
| n23eos/advanced_graph_view               | 17e3eb1fd0e64d4d13d9a130c4bd77b2f287b48d | MIT, 2026 n23eos                 | Pixi.js WebGL, d3-force-3d Worker              | Numeric model indices with path map; renderer masks, typed edge buffers, worker metrics, PageRank/Louvain |
| comedianhhh/obsidian-smart-cluster-graph | 6574861fca6e0b1f2780db450dca26ba6331ae67 | MIT, 2026 comedianhhh            | force-graph Canvas, d3-force, d3-polygon hulls | Path nodes/edges, private hidden/pinned/selected state, folder-seeded multi-level Louvain                 |
| Longwind1984/galaxy-view                 | b49b60cb04687783153f24ff7f9b0a0af59334af | MIT, 2026 Rick                   | Three.js / 3d-force-graph, worker d3-force-3d  | Path nodes, numeric links, typed xyz buffers, CSR adjacency, camera/tour directors, saved presets         |

## GraphFrontier first: extraction assessment

Inspected src/physics.js, render.js, view.js, main.js, constants.js, api.js,
api-actions.js, api-layouts.js, and scripts/plugin-build-options.cjs.
The physics file's first operations already depend on view.plugin settings,
layout dirty flags, search state, node dragging, autosave and saveCurrentLayout.
The renderer similarly consumes the large view object, query-rule caches,
gravity/subgraph metadata and plugin styling. Path IDs, pin modes, spatial
indexing and sleeping physics are useful design references, but not independent
modules accepting Ripple's immutable snapshot. Extracting that object graph
would also inherit persistence, custom pins/subgraph semantics and lifecycle
assumptions that Ripple must remove and then maintain separately.

Its runtime manifest includes @cfworker/json-schema 4.1.1, MCP SDK 1.32.1 and
zod 4.6.7; the build also includes desktop MCP paths. These services are unrelated
to offline graph rendering. They are not imported into Ripple. Main build tools
include esbuild 0.24.x, eslint 9.x and prettier 3.x. Their lock metadata is
recorded by the reproducible audit script, not assumed to be Ripple dependencies.
The selected approach is a new small controller plus a d3-force worker and
Canvas renderer. This keeps pin, drag, camera and persistence under Ripple's
ownership without carrying the upstream host/service object graph.

## Other engines: selective integration decisions

Advanced: inspected src/data/GraphStore.ts, render/GraphRenderer.ts, EdgeMesh.ts,
workers/layoutEngine.ts, layout.worker.ts, metricsEngine.ts, layoutSeed.ts,
view/GraphView.ts and esbuild.config.mjs. Its pure model and worker boundaries
are reusable candidates, but numeric-ID remapping, Pixi custom meshes and its
search/focus/metrics encodings would require a second model and renderer stack.
Ripple adopts typed buffers/worker separation and culling/label LOD as design
principles, implements its own small Dense Canvas path, and uses the same shared
d3-force library rather than copying spring/metrics code. Direct upstream runtime
packages: d3-force, d3-force-3d (ISC), graphology (MIT),
graphology-communities-louvain and graphology-metrics (MIT), Pixi.js (MIT).

Smart Cluster: inspected engine/communityDetector.ts, graphDataEngine.ts,
views/hullRenderer.ts, smartGraphView.ts and types.ts. Louvain is bounded to
multiple passes/levels and mixes folder semantics and cluster merging. Hull
drawing adds d3-polygon, tinycolor and forces owned by the view. Ripple uses an
independently implemented deterministic bounded label-propagation algorithm,
monotone-chain convex hulls, and marks inter-community links. This is a simpler
heuristic, not a claim of equivalent Louvain quality or crossing minimization.
Other runtime packages: d3-force (ISC), d3-polygon/d3-shape (ISC), force-graph
(MIT), tinycolor2 (MIT). No Smart Connections bridge or license manager is used.

Galaxy: inspected view/GraphController.ts, data/GraphStore.ts, buildGraph.ts,
render/AggregateRenderer.ts, interactions/CameraDirector.ts,
layout/WorkerForceLayout.ts, forceWorker.ts and esbuild.config.mjs. The renderer
is the most plausible extraction candidate, but it carries quality tiers,
tour/reveal/preset/shader settings and its own numeric model and store lifecycle.
Ripple directly uses Three.js and OrbitControls (MIT) to implement actual 3D
buffered points/lines, perspective picking and orbit/pan/zoom. A Fibonacci sphere
with deterministic radial depth supplies an independent xyz layout; no 3D-force
simulation is claimed. Upstream direct runtime: 3d-force-graph 1.80.0 (MIT),
d3-force-3d 3.0.6 (ISC), three 0.184.0 (MIT), three-spritetext 1.10.0 (MIT).
Worker source is embedded in the one installable main.js, not a separately
downloaded runtime chunk.

## Cost and provenance boundaries

No four-plugin lifecycle, settings, metadata index, telemetry, server, layout
file reader or renderer is imported. Actual third-party bundled source is only
the locked npm Three.js/OrbitControls and d3-force dependency tree. Its own
licenses, copyrights and exact files are inventoried separately. Development
type packages/build tools are not plugin runtime code. The audit scripts inspect
lockfile license declarations at these commits and record exceptions/missing
metadata instead of claiming a complete upstream transitive legal audit. The
four upstream dependency trees are not redistributed.

Maintained cost: one model/index/filter and one mode controller; shared Canvas
interaction code for three distinct policies; Three.js only for Galaxy; worker
only while Frontier physics runs. Mode changes dispose active renderers while
retaining each mode's camera, xyz positions and pins in Ripple-owned state.
The bundle is expected to grow because real 3D is included; measured size and
timings, not a claim of being lighter than four installed plugins, decide the
performance report. No upstream modifications or PRs are authorized or made.
