import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import parse from 'spdx-expression-parse';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const allowed = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'BlueOak-1.0.0',
  'CC-BY-3.0',
  'CC0-1.0',
]);
function checkExpression(expression) {
  const ast = parse(expression);
  const visit = (node) =>
    node.license
      ? allowed.has(node.license)
      : node.conjunction === 'or'
        ? visit(node.left) || visit(node.right)
        : visit(node.left) && visit(node.right);
  if (!visit(ast)) throw new Error(`Unreviewed license: ${expression}`);
}
const entries = [];
for (const [path, item] of Object.entries(lock.packages)) {
  if (!path) continue;
  if (!item.integrity || !item.license || !item.version)
    throw new Error(`Missing locked provenance: ${path}`);
  checkExpression(item.license);
  let installed = true;
  let texts = [];
  try {
    const pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
    if (pkg.version !== item.version) throw new Error(`Installed version differs: ${path}`);
    if (pkg.license !== item.license) throw new Error(`Installed license differs: ${path}`);
    const files = await readdir(path);
    texts = await Promise.all(
      files
        .filter((name) => /^(license|licence|copying|copyright|notice)(\.|-|$)/i.test(name))
        .map(async (name) => {
          const text = await readFile(`${path}/${name}`, 'utf8');
          if (!text.trim()) throw new Error(`Empty license: ${path}/${name}`);
          return { file: name, sha256: createHash('sha256').update(text).digest('hex') };
        }),
    );
    if (!texts.length && /^node_modules\/@esbuild\//.test(path)) {
      // Official esbuild binary packages omit LICENSE. Their exact-version
      // parent package and upstream source distribute the applicable MIT text.
      const parent = JSON.parse(await readFile('node_modules/esbuild/package.json', 'utf8'));
      if (parent.version !== item.version || parent.license !== 'MIT' || item.license !== 'MIT')
        throw new Error('Unreviewed esbuild binary provenance');
      const text = await readFile('node_modules/esbuild/LICENSE.md', 'utf8');
      texts.push({
        file: 'node_modules/esbuild/LICENSE.md (same-version parent)',
        sha256: createHash('sha256').update(text).digest('hex'),
      });
    }
    const declarations = {
      'node_modules/@humanfs/types': [
        '0.15.0',
        'node_modules/@humanfs/core/LICENSE',
        /Apache License/,
      ],
      'node_modules/esrecurse': [
        '4.3.0',
        `${path}/README.md`,
        /Redistribution and use in source and binary forms/,
      ],
      'node_modules/imurmurhash': ['0.1.4', `${path}/README.md`, /Permission is hereby granted/],
      'node_modules/natural-compare': ['1.4.0', `${path}/README.md`, /The MIT License/],
      'node_modules/spdx-exceptions': [
        '2.5.0',
        `${path}/README.md`,
        /Creative Commons Attribution License 3.0/,
      ],
      'node_modules/spdx-license-ids': [
        '3.0.24',
        `${path}/README.md`,
        /Creative Commons Zero v1.0 Universal/,
      ],
    };
    const declaration = declarations[path];
    if (!texts.length && declaration && declaration[0] === item.version) {
      const text = await readFile(declaration[1], 'utf8');
      if (!declaration[2].test(text)) throw new Error(`License declaration changed: ${path}`);
      texts.push({ file: declaration[1], sha256: createHash('sha256').update(text).digest('hex') });
    }
    if (!texts.length) throw new Error(`No installed license text: ${path}`);
  } catch (error) {
    if (error.code === 'ENOENT' && item.optional && (item.os || item.cpu)) installed = false;
    else throw error;
  }
  entries.push({
    path,
    version: item.version,
    license: item.license,
    resolved: item.resolved,
    integrity: item.integrity,
    installed,
    texts,
  });
}
await mkdir('reports', { recursive: true });
await writeFile('reports/licenses.json', `${JSON.stringify(entries, null, 2)}\n`);
console.log(
  `Reviewed ${entries.length} locked packages: ${entries.filter((entry) => entry.installed).length} installed license texts checked, ${entries.filter((entry) => !entry.installed).length} other-platform optional binaries checked against locked npm license/provenance.`,
);
console.log(
  'No third-party code is bundled into main.js. See THIRD_PARTY_NOTICES.md for attribution and scope.',
);
