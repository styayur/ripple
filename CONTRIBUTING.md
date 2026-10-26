# Contributing

Open an issue with reproducible synthetic notes, versions, query and expected
visibility. Do not upload vault secrets or credentials. Use a focused branch
and PR; do not commit built `main.js`, dependency trees or private test data.

Run `npm ci`, `npm run check`, `npm run bench` and the browser checks documented
in README. Preserve deterministic, threshold-monotone behavior. A scoring
change needs updated explanation and meaningful edge-case tests. All source
contributions are under MPL-2.0; retain third-party notices when applicable.

Adapters need immutable snapshots and a documented, versioned, consumer-owned
temporary visibility layer. Read the compatibility audit first. Do not patch
renderers, edit installed plugins, hide external DOM nodes or change user
settings to make tests pass. Report source/Mock/live results separately. An API
version guard is necessary but is not evidence of live compatibility.

Release maintainers must read current official Obsidian publication rules,
verify default-branch CI, choose an unused tag matching the manifest, inspect
the three build assets, and publish a new prerelease until live integrations
and safe write adapters are verified. Never replace historical assets/tags.
