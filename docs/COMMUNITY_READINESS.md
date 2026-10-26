# Community preparation — 0.2

This is preparation, not a submission or approval. Read the current
[official release instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin),
[manifest rules](https://docs.obsidian.md/Reference/Manifest),
[developer policies](https://docs.obsidian.md/Developer%20policies) and
[self-review checklist](https://docs.obsidian.md/oo/plugin) again before applying.

The plugin ID stays ripple-graph-filter; the display name is Ripple Graph
Workspace. The project brand is Ripple. A different Ripple/ripple entry already
exists. The audited public snapshot had no exact Ripple Graph Workspace or
ripple-graph-filter entry; this is not a reservation or approval.

0.2.0 uses numeric x.y.z and an identical tag without v. Install files are
main.js, manifest.json and meaningful styles.css; checksums supplement them.
README, LICENSE and manifest are committed at root. Generated main.js belongs
only in releases. Builds are locked/repeatable and downloaded bytes are checked.

Minimum app 1.14.5 now has scoped real Windows integration evidence. Desktop-only
is explicit; mobile is untested. No default hotkeys or redundant command-prefix
names are used. ItemView uses official Workspace lifecycle/state. Events,
workers, object URLs, render controls/buffers and index resources are cleaned.
CSS is scoped and note strings use text construction, not HTML injection.
Production code has no hardcoded configuration directory.

Ripple initiates no network, telemetry, advertising or remote code loading.
Three.js/d3-force are bundled with full original notices. Embedded worker code
requires no extra installer chunks. No other graph plugin/private registry is
used by the production workspace. Legacy adapters are unbundled source only.
No notes, frontmatter, links, Canvas or other plugins' state is written. Mode,
cameras and pins use the official Workspace serializer.

README/Release Notes distinguish pure, Mock/browser and real-host scope and
disclose LOD and slow large software-WebGL context initialization. No official
affiliation or review approval is claimed. This task submits no directory
application or upstream PR. Broader platform/GPU/real-vault testing remains
recommended before a directory application.
