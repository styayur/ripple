# Changelog

## 0.2.0 — 2026-10-26

- Replace the limited sidebar preview with a native full workspace tab and
  shared graph/filter/selection controller.
- Add Frontier worker force layout with dragging/pins, Dense grid/LOD,
  Cluster communities/hulls/bridge markers and genuine WebGL Galaxy navigation.
- Preserve each mode's camera/layout through switches; serialize cameras and
  pinned coordinates through Workspace state.
- Add immutable revisions, directed resolved links, incremental dirty-path
  indexing and bounded opt-in body cache.
- Add real Windows Obsidian 1.14.5 integration evidence, renderer/browser tests,
  synthetic large-graph measurements, source/license inventory and updated docs.

Limitations and complete evidence are in docs/releases/0.2.0.md and
docs/VALIDATION.md. No community directory approval is claimed.

## 0.1.0-alpha.1 — 2026-10-26

- Add independent graph filtering with Unicode queries, fields and exclusions,
  bounded opt-in body indexing, lexical/proximity/degree explanations and
  inclusive 0–100% thresholds.
- Add a standalone sidebar graph, fixed preview coordinates, live counts,
  score details, empty/error states and clear/restore. State is memory-only.
- Audit four target repositories. Add a version-pinned read-only GraphFrontier
  snapshot adapter and detection-only adapters for the other three targets.
- Add strict type/lint/format gates, unit/Mock tests, browser fixture checks,
  synthetic benchmarks, license/provenance and known-vulnerability audits,
  repeatable production build and Linux/Windows CI.

Prerelease limitations: no external write/restore capability, no real Obsidian
integration verification, no mobile support, no community submission or approval.
The alpha suffix requires manual installation under current directory rules.
