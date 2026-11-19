# Dependency security review

Reviewed on 2026-11-19 for the dependency refresh in PR #11.

The raw npm audit originally reported nine high-severity dependency records,
all rooted in GHSA-fc5q-39xc-vjpf. GitHub withdrew that advisory on November 18;
the November 19 raw audit returns zero findings. No audit threshold, package
identity, advisory exclusion or dependency version was changed to obtain that
result. Withdrawal does not demonstrate a matcher algorithm fix.

Sources: [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
and [upstream maintainer explanation](https://github.com/micromatch/picomatch/pull/235#issuecomment-6315749381).

## Reachability and remaining limitation

The installed path is a development dependency: typescript-eslint through
typescript-estree and tinyglobby/fdir to picomatch 4.0.7. ESLint uses committed
repository patterns, including `src/**/*.ts`. Ripple does not pass note text,
vault queries or plugin configuration into this Node.js matching dependency.
The production build inventory contains Three.js in the main bundle and the
four d3 libraries in its worker; the only external require is Obsidian.

Adversarial nested repeated patterns can still consume excessive CPU when
evaluated by the unmodified matcher. Do not accept untrusted glob expressions
in development automation. A future feature introducing externally supplied
globs requires a separate bounded matcher design and adversarial regression
tests. This review does not certify arbitrary glob patterns as safe.

The dependency refresh was exercised in an isolated real Obsidian profile and
synthetic vault, with 13 host checks, 64 unit tests and 12 browser fixture checks.
The acceptance record and lockfile hash are in `docs/evidence/obsidian-v0.2.json`.
Historical acceptance is retained separately. No existing user vault was opened.
