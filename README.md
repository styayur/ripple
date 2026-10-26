# Ripple Graph Filter

Ripple filters a local graph with explainable keyword relevance and a 0–100%
threshold. Raise the threshold to keep fewer nodes; lower it to recover context.
Clear the query to restore the original graph. No note content or links are changed.

**0.1.0-alpha.1 is a manual-install GitHub prerelease.** The standalone Ripple
graph works independently of other graph plugins. External graph filtering is
not available in this release. GraphFrontier has a read-only snapshot adapter;
the other three targets have detection and explicit unsupported states.
No adapter has been verified inside a real Obsidian session.

## Install and use

Requires desktop Obsidian **1.14.5 or newer**. This conservative minimum follows
the stable version at audit time; mobile and older versions are untested.

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [alpha release](https://github.com/styayur/ripple/releases/tag/0.1.0-alpha.1).
2. Put all three in `<vault>/<configDir>/plugins/ripple-graph-filter/`.
   The default config directory is `.obsidian`; use your actual configured one.
3. Reload Obsidian and enable **Ripple Graph Filter** in Community plugins.
4. Run **Ripple Graph Filter: Open graph filter** from the command palette,
   or click the waves ribbon icon.
5. Use **Ripple standalone graph**, enter a query, and adjust the threshold.
   Expand a result to inspect its score and open the note. **Clear and restore**
   restores all original candidates. **Refresh graph** takes a new snapshot.

The standalone graph uses Markdown notes and resolved links from official
Obsidian metadata APIs. Title, aliases, tags, paths and primitive frontmatter
values are indexed by default. **Include note text** opts into local body reads:
at most 32,768 characters per note and 8 million total, in path order. Larger
bodies are truncated with a notice. This alpha limits indexing to 50,000 notes.
Unresolved links and attachments are not standalone candidates.

The diagram draws the first 250 candidates and at most 600 links. The result
list shows the first 100 visible matches. Counts and scoring include the whole
candidate graph. Coordinates are deterministic and stay fixed while filtering.
This preview has no force-layout simulation or automatic bridge retention.

## Queries and threshold

Examples: `ocean`, `"deep sea"`, `title:Ocean`, `alias:Sea`, `tag:water`,
`path:Research`, `content:depth`, or `ocean -path:Archive`.
Body queries need **Include note text** in standalone mode.

Terms contribute to a ranked average; this is not Obsidian's Boolean search
syntax. `-` excludes a matching term even at 0%. An empty query ignores the
threshold and restores original visibility; a negative-only query keeps all
non-excluded candidates with score 1. Exact title/alias matches can reach 100%.
0% retains all non-excluded candidates, including zero-score nodes.

Scores combine deterministic lexical matching (85%), proximity to strong
lexical matches (10%) and normalized degree (5%), with an explicit exact-match
override. They are fixed for a query and graph, so increasing the threshold
cannot grow the visible set. No bridge rule bypasses the threshold.
See [the complete scoring rules](docs/SCORING.md).
**Keyword ranking is not semantic understanding or AI.**

## Adapter compatibility

| Target              | Audited ID / version          | This release                                                                  | Real Obsidian verification |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| GraphFrontier       | `graphfrontier` / 0.8.6       | Read visible snapshot into Ripple preview; external apply/restore unsupported | Not performed              |
| Advanced Graph View | `graph-insight` / 0.10.1      | Detection only; no documented safe external API                               | Not performed              |
| Smart Cluster Graph | `smart-cluster-graph` / 1.2.0 | Detection only; graph and visibility are private                              | Not performed              |
| Galaxy View         | `galaxy-view` / 0.6.1         | Detection only; no documented stable controller API                           | Not performed              |

GraphFrontier snapshots require an open graph and its documented local
`api.runTool`; no MCP server needs enabling. Choose a specific view if several
are open. Its existing user filters define the snapshot candidates. Snapshot
titles and links are used without reading note bodies or additional metadata.
Its live graph remains unchanged when Ripple's slider moves. Read results are
not transactional; refresh after external search, layout or graph changes.

GraphFrontier's `setVisibleNodes` uses a shared subset saved with layouts, so
Ripple refuses to borrow it without an ownership/restore contract. Other targets'
private renderers are never accessed. Audited versions are pinned exactly;
unrecognized versions are incompatible until reviewed. The optional Obsidian
plugin discovery shim is guarded but uses an internal registry because no
official discovery API exists; failure disables adapter discovery only.
See [source evidence, licenses and proposed upstream APIs](docs/ADAPTER_COMPATIBILITY.md).
GraphPro is outside scope.

## Privacy and safety

Ripple has no network calls, accounts, telemetry, advertising, model services,
remote code loading, or runtime npm dependencies. Queries, indexes, filters and
preview state live in memory and are discarded on close/disable. Notes are read
through the official Vault API; no Markdown, frontmatter, tags, paths, links,
other plugin files or settings are written. Metadata changes mark a snapshot
stale and ask you to refresh. Disabling Ripple clears only its own temporary
preview. A failed query preserves the last successful visibility.

## Development and verification

```sh
npm ci
npm run check
npm run bench
```

`check` runs formatting, ESLint, strict TypeScript, unit/Mock tests, production
esbuild, asset/provenance checks, a locked dependency license audit, and
`npm audit --audit-level=low`. `build` actually produces root `main.js` and the
installable `dist/` assets. Generated `main.js` is excluded from Git.
CI runs on Node 22, Linux and Windows and checks build repeatability.

Browser checks run the actual view against an explicitly mocked SDK:

```sh
python -m pip install -r tests/browser/requirements.txt
python -m playwright install chromium
npm run test:browser
```

This is not a live Obsidian integration test. The optional pinned upstream
contract check is `GRAPHFRONTIER_SOURCE=/path/to/checkout npm run audit:upstream`
(use your shell's environment syntax). See [validation evidence](docs/VALIDATION.md)
and [community preparation](docs/COMMUNITY_READINESS.md).

## Known limits and contribution

External write adapters and real Obsidian integration validation are blockers
for a stable release. The alpha suffix follows this project's prerelease policy;
Obsidian's current directory requires numeric `x.y.z`, so this alpha is not
directory submission-ready. The name/ID were checked against the public
directory snapshot, which is not a reservation or approval. No official
submission has been made, and no affiliation with Obsidian is claimed.

Report reproducible issues at [GitHub Issues](https://github.com/styayur/ripple/issues),
including app version, target plugin version, exact query and expected behavior.
Use synthetic notes instead of private vault data. Contributions should include
focused tests; adapter changes need pinned source evidence and a reversible,
non-destructive public API. See [CONTRIBUTING.md](CONTRIBUTING.md).

Licensed under [MPL-2.0](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
