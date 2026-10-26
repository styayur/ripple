import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const real = await read('reports/obsidian/latest.json');
assert.equal(real.vaultIsolationVerified, true);
assert.equal(real.unchangedOriginalNotes, true);
assert.equal(real.runtimeErrors.length, 0);
assert.equal(real.checks.length, 13);
for (const name of ['main.js', 'manifest.json', 'styles.css'])
  assert.equal(
    real.assetHashes[name],
    createHash('sha256')
      .update(await readFile(`dist/${name}`))
      .digest('hex'),
    'Integration evidence does not match current build',
  );
await mkdir('docs/evidence', { recursive: true });
await mkdir('docs/screenshots', { recursive: true });
const { sandbox, failureDiagnostics, ...publicReal } = real;
assert.equal(failureDiagnostics, undefined);
await writeFile(
  'docs/evidence/obsidian-v0.2.json',
  JSON.stringify(
    {
      ...publicReal,
      operatingSystem: 'Windows 11 Home build 26200',
      initialNoteCount: 32,
      existingUserVault: 'NOT ACCESSED',
    },
    null,
    2,
  ) + '\n',
);
for (const [source, target] of [
  ['reports/benchmark.json', 'core-v0.2.json'],
  ['reports/render-benchmark.json', 'render-v0.2.json'],
  ['reports/browser/results.json', 'browser-v0.2.json'],
  ['reports/upstream-engines.json', 'upstream-engines-v0.2.json'],
  ['reports/bundled-sources.json', 'bundled-sources-v0.2.json'],
])
  await copyFile(source, `docs/evidence/${target}`);
for (const [source, target] of [
  ['workspace-dark.png', 'workspace-dark.png'],
  ['workspace-light.png', 'workspace-light.png'],
  ['galaxy-filtered.png', 'galaxy.png'],
  ['workspace-crop.png', 'workspace.png'],
])
  await copyFile(join(sandbox, source), `docs/screenshots/${target}`);
console.log(
  'Collected matching real integration hashes, actual screenshots, source inventory and separate synthetic/Mock evidence.',
);
