# Scoring and visibility contract

All scores are deterministic values in [0, 1]. The slider divides its percent by
100 and retains a node iff `score >= threshold`, unless it matches an exclusion.
Scores do not depend on the slider, displayed node count, or previously visible
set. Visibility is intersected with the original candidate visibility. The
threshold comparison is inclusive. At 0%, zero-score nodes remain eligible.

## Query grammar

At most 512 characters and 32 whitespace-separated terms. Double quotes group
phrases (also after `field:`). A leading `-` excludes. Supported fields:
`text` (default), `title`, `alias`, `tag`, `path`, `content`. No regular
expressions, backslash escape syntax, OR, parentheses or query evaluation.
Unknown fields, unclosed quotes, and empty values are errors; the previous
successful result remains visible. Text is NFKC-normalized, lowercased and
whitespace-collapsed. This is Unicode-aware substring/token matching, without
language stemming, synonym expansion or embedding models.

## Lexical score L

For each positive term, evaluate eligible fields and take the highest weighted
match. Whole-field equality = 1, whole-token equality = 0.9, substring = 0.6,
no match = 0. Token boundaries use Unicode letters/numbers, `_`, `#`, `/`, `-`.
Phrases match as whole fields or substrings. Tag values have a leading `#`
removed; query tags should be written `tag:water`.

| Field                                | Weight |
| ------------------------------------ | -----: |
| Title                                |   1.00 |
| Alias                                |   0.95 |
| Tag                                  |   0.90 |
| Vault-relative path                  |   0.55 |
| Primitive frontmatter key/value text |   0.45 |
| Body text (opt-in and bounded)       |   0.35 |

`L` is the arithmetic mean of the best match per positive term. Fields restrict
where a term can match. Missing metadata contributes zero. This is ranked
matching, not mandatory AND matching. Exclusion matches use the same matching
rule, and any positive match on an excluded term removes the node at every
threshold. Negatively excluded nodes can remain topology intermediates, but
never become visible or act as strong-match seeds.

## Structural terms

Treat resolved edges as undirected. Remove duplicate/reverse links, dangling
endpoints and self links before scoring. Strong lexical seeds have `L >= 0.6`
and do not match exclusions. A multi-source BFS computes distance to the
nearest seed, up to three hops. `P = 1 / (distance + 1)` when reachable within
three hops, otherwise zero. A seed has P = 1. Compute this once per query.

`D = log(1 + degree) / log(1 + maxDegree)`, with maxDegree at least 1. Isolated
nodes have D = 0. These topology terms provide modest context, not meaning.

## Final score

If a node matches an exclusion, it is always ineligible. If every positive term
is a complete title or alias equality (respecting its field restriction), score

1. Otherwise `S = min(0.999999, 0.85L + 0.10P + 0.05D)`. Only the exact-match
   override reaches 100%. Empty queries restore original visibility at every
   threshold. Negative-only queries assign 1 to every non-excluded candidate.

Example: an isolated exact title match has score 1. An isolated whole-body
match has L = 0.35, P = 0, D = 0, so S = 0.2975. A node with no lexical match
can get a small structural score. Raising the threshold cannot re-add it.

There is no optional bridge retention in this version. A bridge below the
threshold is hidden even if it connects two retained nodes. This is covered by
tests; no bridge exception bypasses the strictness control.

The view shows each term's winning field/weight plus L/P/D. Slider input is
debounced for 100 ms; the engine caches the last query's scores. A graph refresh
creates a new engine so cached topology cannot leak between snapshots.
