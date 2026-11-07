# Security Policy

## Supported versions

Security fixes target the current `main` branch and the latest published Ripple release.

## Report privately

Use GitHub private vulnerability reporting:

https://github.com/styayur/ripple/security/advisories/new

Do not attach real vault notes, frontmatter, tags, Canvas files, paths, screenshots containing private content, or other users' plugin settings.

## Security-sensitive areas

Relevant reports include unexpected network activity, remote code loading, bundle compromise, unsafe Obsidian API use, body-index overreach, graph/renderer crashes that corrupt workspace state, and accidental writes to user notes or other plugins' settings.

## Data boundary

Ripple is designed to operate locally with no accounts, telemetry, advertising, remote models or CDN assets. Body indexing is opt-in and bounded. Obsidian's own update and network behavior is outside this project's boundary.

No security-response SLA or dedicated security email is promised.
