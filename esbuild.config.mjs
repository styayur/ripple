import * as esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

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
  banner: { js: '/* Ripple Graph Filter | MPL-2.0 | https://github.com/styayur/ripple */' },
  metafile: true,
};
await mkdir('dist', { recursive: true });
if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  const result = await esbuild.build(options);
  const runtimePackages = Object.keys(result.metafile.inputs).filter((p) =>
    p.includes('node_modules'),
  );
  if (runtimePackages.length) throw new Error('Unexpected bundled third-party runtime code');
  for (const name of ['main.js', 'manifest.json', 'styles.css'])
    await copyFile(name, `dist/${name}`);
}
