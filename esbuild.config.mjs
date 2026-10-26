import * as esbuild from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { workerInputs, workerPlugin } from './scripts/worker-plugin.mjs';
import { performance } from 'node:perf_hooks';

const bundledLicenses = await Promise.all(
  ['three', 'd3-force', 'd3-dispatch', 'd3-quadtree', 'd3-timer'].map(
    async (name) => `${name}\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`,
  ),
);

const options = {
  entryPoints: ['src/main.ts'],
  outfile: 'main.js',
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: false,
  treeShaking: true,
  minify: !process.argv.includes('--watch'),
  logLevel: 'info',
  banner: {
    js: `/* Ripple | MPL-2.0 | https://github.com/styayur/ripple\nBundled third-party licenses:\n${bundledLicenses.join('\n\n')}\n*/`,
  },
  plugins: [workerPlugin],
  metafile: true,
};
await mkdir('dist', { recursive: true });
if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  const started = performance.now();
  const result = await esbuild.build(options);
  const runtimePackages = Object.keys(result.metafile.inputs).filter((p) =>
    p.includes('node_modules'),
  );
  if (runtimePackages.some((name) => !name.startsWith('node_modules/three/')))
    throw new Error('Unreviewed bundled runtime code');
  const allowedWorkerPackages = ['d3-force', 'd3-dispatch', 'd3-quadtree', 'd3-timer'];
  for (const name of workerInputs) {
    if (
      name.includes('node_modules/') &&
      !allowedWorkerPackages.some((pkg) => name.startsWith(`node_modules/${pkg}/`))
    )
      throw new Error(`Unreviewed worker dependency: ${name}`);
  }
  await mkdir('reports', { recursive: true });
  await writeFile('reports/build-meta.json', JSON.stringify(result.metafile, null, 2));
  await writeFile(
    'reports/bundled-sources.json',
    JSON.stringify(
      {
        main: Object.keys(result.metafile.inputs),
        worker: [...workerInputs],
        buildMs: performance.now() - started,
      },
      null,
      2,
    ),
  );
  for (const name of ['main.js', 'manifest.json', 'styles.css'])
    await copyFile(name, `dist/${name}`);
}
