import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.env.UPSTREAM_AUDIT_ROOT;
if (!root)
  throw new Error(
    'Set UPSTREAM_AUDIT_ROOT to the separately cloned audit directory. No source is copied by this script.',
  );
const targets = [
  [
    'GraphFrontier',
    'pikiby/GraphFrontier',
    '72223f9a020aefc73e0ac13e7d4945c15e2b28d5',
    ['src/physics.js', 'src/render.js', 'src/view.js', 'src/api.js'],
  ],
  [
    'advanced_graph_view',
    'n23eos/advanced_graph_view',
    '17e3eb1fd0e64d4d13d9a130c4bd77b2f287b48d',
    ['src/workers/layoutEngine.ts', 'src/data/GraphStore.ts', 'src/render/GraphRenderer.ts'],
  ],
  [
    'smart_cluster',
    'comedianhhh/obsidian-smart-cluster-graph',
    '6574861fca6e0b1f2780db450dca26ba6331ae67',
    ['src/engine/communityDetector.ts', 'src/views/hullRenderer.ts', 'src/views/smartGraphView.ts'],
  ],
  [
    'galaxy_view',
    'Longwind1984/galaxy-view',
    'b49b60cb04687783153f24ff7f9b0a0af59334af',
    [
      'src/view/GraphController.ts',
      'src/data/GraphStore.ts',
      'src/render/AggregateRenderer.ts',
      'src/layout/WorkerForceLayout.ts',
    ],
  ],
];
const output = [];
for (const [directory, repository, sha, files] of targets) {
  const source = join(root, directory);
  assert.equal(
    execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sha,
  );
  execFileSync('git', ['-C', source, 'diff', '--exit-code'], { stdio: 'pipe' });
  const license = await readFile(join(source, 'LICENSE'), 'utf8');
  assert.match(license, /MIT License/);
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(source, 'package-lock.json'), 'utf8'));
  const licenses = {};
  for (const [path, item] of Object.entries(lock.packages ?? {})) {
    if (!path) continue;
    const name = item.license ?? 'NOT DECLARED IN LOCK';
    licenses[name] = (licenses[name] ?? 0) + 1;
  }
  const evidence = [];
  for (const path of [
    'LICENSE',
    'manifest.json',
    'package.json',
    'package-lock.json',
    'esbuild.config.mjs',
    ...files,
  ]) {
    const content = await readFile(join(source, path));
    evidence.push({ path, sha256: createHash('sha256').update(content).digest('hex') });
  }
  output.push({
    repository,
    sha,
    id: manifest.id,
    version: manifest.version,
    license: 'MIT',
    copyright: license.split('\n').find((line) => line.startsWith('Copyright')),
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    declaredLockLicenses: licenses,
    evidence,
    copiedIntoRipple: [],
  });
}
await mkdir('reports', { recursive: true });
await writeFile('reports/upstream-engines.json', JSON.stringify(output, null, 2) + '\n');
console.log(
  'Four pinned source/manifest/license/dependency/build audits recorded. No upstream plugin code was copied.',
);
