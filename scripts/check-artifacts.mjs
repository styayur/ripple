import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/);
assert.ok(!manifest.id.includes('obsidian') && !manifest.id.endsWith('plugin'));
assert.equal(manifest.isDesktopOnly, true);
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-(?:rc|alpha)\.\d+)?$/);
if (process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG, manifest.version);
const expected = ['main.js', 'manifest.json', 'styles.css'];
const files = await readdir('dist');
assert.deepEqual(files.filter((name) => name !== 'SHA256SUMS.txt').sort(), [...expected].sort());
const checksums = [];
const realEvidence =
  manifest.version === '0.2.0'
    ? JSON.parse(await readFile('docs/evidence/obsidian-v0.2.json', 'utf8'))
    : undefined;
for (const name of expected) {
  const root = await readFile(name);
  const asset = await readFile(`dist/${name}`);
  assert.deepEqual(root, asset, `${name} differs from release asset`);
  assert.ok(asset.length > 20);
  if (realEvidence)
    assert.equal(
      realEvidence.assetHashes[name],
      createHash('sha256').update(asset).digest('hex'),
      `${name} differs from the real Obsidian-tested build`,
    );
  checksums.push(`${createHash('sha256').update(asset).digest('hex')}  ${name}`);
}
const code = await readFile('dist/main.js', 'utf8');
new vm.Script(code, { filename: 'main.js' });
const externals = [...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1]);
assert.ok(externals.length > 0 && externals.every((name) => name === 'obsidian'));
assert.ok(
  !/sourceMappingURL|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{25,}/.test(
    code,
  ),
);
await writeFile('dist/SHA256SUMS.txt', `${checksums.join('\n')}\n`);
console.log(
  `Verified ${manifest.version}: production CJS, only Obsidian external, matching assets.\n${checksums.join('\n')}`,
);
console.log('Verified self-contained bundle; no extra worker or renderer chunks required.');
