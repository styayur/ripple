# Adapter compatibility audit

## 0.2 workspace status

The four 0.2 modes are Ripple-owned renderers, not adapters controlling installed
plugins. No target plugin is required. Frontier (Canvas/force worker), Dense
(Canvas grid/LOD), Cluster (Canvas community hulls) and Galaxy (actual Three.js
WebGL) share the same graph/filter state and have real Windows Obsidian 1.14.5
integration evidence scoped to a synthetic 32-note vault. See
[ARCHITECTURE.md](ARCHITECTURE.md), [UPSTREAM_ENGINE_AUDIT.md](UPSTREAM_ENGINE_AUDIT.md)
and [VALIDATION.md](VALIDATION.md). No source from the four plugins was copied.

The older adapter modules are retained as regression-tested source, not bundled
into the 0.2 entry point. Their external-write limitations below still apply.
The following section is the **historical 0.1 external-adapter audit**, not a
claim about 0.2 renderer support or live testing.

## Historical 0.1 audit

Audited 2026-10-26 against shallow source checkouts and current release metadata.
Source inspection and mocked contracts are **not live Obsidian integration tests**.
No third-party source is bundled. GraphPro is outside scope.

| Target              | Manifest ID           | Source/release version | License | Ripple capability                                                            |
| ------------------- | --------------------- | ---------------------- | ------- | ---------------------------------------------------------------------------- |
| GraphFrontier       | `graphfrontier`       | 0.8.6                  | MIT     | Version-pinned, read-only visible graph snapshot; external filtering blocked |
| Advanced Graph View | `graph-insight`       | 0.10.1                 | MIT     | Detection only; filtering unsupported                                        |
| Smart Cluster Graph | `smart-cluster-graph` | 1.2.0                  | MIT     | Detection only; filtering unsupported                                        |
| Galaxy View         | `galaxy-view`         | 0.6.1                  | MIT     | Detection only; filtering unsupported                                        |

## GraphFrontier

Source: [72223f9](https://github.com/pikiby/GraphFrontier/tree/72223f9a020aefc73e0ac13e7d4945c15e2b28d5).
Manifest minimum app: 1.12.7. MIT copyright Boris Kazakov (pikiby).

[`docs/mcp.md`](https://github.com/pikiby/GraphFrontier/blob/72223f9a020aefc73e0ac13e7d4945c15e2b28d5/docs/mcp.md)
documents the loaded plugin's `api` property and `runTool(methodName, args,
readOnly, signal)`. It calls this an internal API, shared with MCP. This is an
explicitly documented integration surface, but no cross-version stability
guarantee was found. Ripple accepts **only 0.8.6 and apiVersion 1** and checks
every response. No MCP server, token, or network connection is needed.

`src/api.js`: `listViews` returns `{apiVersion, pluginVersion, views}`;
`getState({viewId})` supplies a context token; `getGraph` returns `items` and
`nextOffset`, defaulting to visible nodes/edges. Limit is 1–500. Source offsets
can advance across an empty page. Ripple follows pagination with an unchanged
token, validates IDs, coordinates, endpoints and progress, then rechecks state.
The caller selects an explicit view when more than one exists. Hidden nodes
are never requested. Note IDs are vault-relative paths; attachment, gravity
and subgraph IDs must not be treated as Markdown files.

`src/api-actions.js` implements `searchNodes`, `highlightNodes` and
`setVisibleNodes`. `src/api-tools.js` maps their snake_case MCP names to camelCase
methods. Search requires typed queries, not Ripple query syntax. Search/highlight
are deliberately unused. `setVisibleNodes({viewId, contextToken, nodeIds})`
accepts an exact subset, `[]` hides all and `null` clears the API filter; other
visibility rules still intersect the subset. `getConfiguration` reports the
existing subset. Errors include `INVALID_ARGUMENT`, `STATE_CHANGED`,
`VIEW_NOT_FOUND`, `API_CLOSED`, `REQUEST_CANCELLED`, and `BUSY`.

**Write blocker:** the subset is one shared slot, not a per-consumer lease.
The docs and `src/view.js` layout serialization explicitly save `node_filter`
with layouts. Replacing/clearing it could overwrite another consumer's subset,
and a save/close during filtering can persist the temporary subset. Restoring
`null` is incorrect when a user already had a subset. There is no ownership or
atomic conditional restore contract. Ripple therefore does not call any
mutation, alter autosave, search, pins, camera, layouts or settings. Coordinates
and pin state in read responses are snapshots only; running physics can move
positions between pages. Ripple preview uses its own fixed coordinates.

Reproduce contract inspection:

```sh
git clone https://github.com/pikiby/GraphFrontier.git
cd GraphFrontier
git checkout 72223f9a020aefc73e0ac13e7d4945c15e2b28d5
npm ci
node --test tests/api.test.cjs tests/api-actions.test.cjs
```

These are upstream source tests with Obsidian fixtures, not live integration.
Ripple's `tests/adapters.test.ts` additionally checks its boundary and prevents
all mutation methods. `npm run audit:upstream` can verify the pinned source
contract against a user-provided checkout without copying its code into Ripple.

## Advanced Graph View

Source: [17e3eb1](https://github.com/n23eos/advanced_graph_view/tree/17e3eb1fd0e64d4d13d9a130c4bd77b2f287b48d).
Manifest minimum app: 1.13.0. MIT copyright n23eos.

Reviewed `README.md`, `src/main.ts`, `src/view/GraphView.ts`,
`src/data/GraphStore.ts`, and filtering code. No documented third-party graph
control API or stability commitment found. `GraphInsightView` owns private
model/renderer/layout, `hiddenNodes`, `hiddenClusters`, pins and filter state;
node indices refer to a particular model, not a stable vault ID contract.
Internal search commands do not expose exact subset control. Reading those
objects or rebuilding the renderer would risk user layout/search/pin state.
No safe apply/restore operation exists. Detection checks the audited version and
view type `graph-insight-view` only; newer/older versions are incompatible until
reaudited. No internal data is accessed. Live verification: **not performed**.

## Smart Cluster Graph

Source: [6574861](https://github.com/comedianhhh/obsidian-smart-cluster-graph/tree/6574861fca6e0b1f2780db450dca26ba6331ae67).
Manifest minimum app: 1.5.0. MIT copyright comedianhhh.

Reviewed `README.md`, `src/main.ts`, `src/views/smartGraphView.ts`,
`src/types.ts`, `src/engine/graphDataEngine.ts`. The view type is
`smart-cluster-graph-view`. Current nodes/edges, hidden nodes, pins, search and
the force-graph instance are private. `refreshView` and `updateZoomOnly` are UI
helpers, not a third-party filtering contract. A `SmartConnectionsBridge`
consumes a different plugin; it does not export control of this graph.
No public graph snapshot, exact subset or restoration API found. Replacing
force-graph data could restart layout or lose manual hides/pins. Detection only
for audited 1.2.0; other versions require audit. Live verification: **not performed**.

## Galaxy View

Source: [b49b60c](https://github.com/Longwind1984/galaxy-view/tree/b49b60cb04687783153f24ff7f9b0a0af59334af).
Manifest minimum app: 1.8.7. MIT copyright Rick.

Reviewed `README.md`, `src/main.ts`, `src/view/GalaxyView.ts`, controller and
`src/data/buildGraph.ts`. View type: `galaxy-view`. A controller is visible in
source, but not documented as a stable third-party API. Graph links use numeric
array indices rebuilt by the data builder. Internal `filterNodes` remaps indices;
calling it does not constitute safe view control. Search, camera/tour and layout
are controller-managed. No consumer-owned subset or restore API found. Ripple
does not call `controller` or settings methods. Detection only for audited
0.6.1; other versions require audit. Live verification: **not performed**.

## Minimal upstream extension proposal

For all targets: expose a versioned API with `listViews`,
`snapshot(viewId, revision)` returning immutable stable IDs, edges, current
visibility and coordinates; `createVisibilityLayer(owner, viewId)` returning a
lease; `setVisibleIds(lease, ids, expectedRevision)` intersecting user filters;
and idempotent `release(lease)`. Layers must be temporary, excluded from saved
layouts, leave pins/camera/physics/search untouched, expire on consumer unload,
and reject stale revisions atomically. Expose view/revision change and close
subscriptions with disposers. Clearing one layer must preserve all others.
No upstream modifications or PRs have been submitted.

## Detection boundary

Obsidian's published TypeScript API has no community-plugin registry accessor.
One small guarded, read-only compatibility shim probes `app.plugins.manifests`
and `getPlugin(id)` for discovery. This is an Obsidian internal boundary, not
a stable API claim. If its shape changes, status is `unavailable`; filtering
continues in standalone mode. The core never sees registry objects. Workspace
view discovery, vault reads, metadata and all UI use the official API.

## Verification levels

1. Source audit at the exact commits above: completed.
2. Contract/Mock tests: run by Ripple CI; see workflow logs and validation docs.
3. Live Obsidian + target plugin interaction: not performed; no adapter is
   labelled fully supported. External filter and restore capabilities remain
   `unsupported`. Clearing or disposing these adapters is a no-op because they
   never mutate external state.
