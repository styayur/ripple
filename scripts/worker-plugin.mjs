import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';

// Builds a self-contained text module into main.js. No extra install-time chunk.
export const workerInputs = new Set();
export const workerPlugin = {
  name: 'ripple-inline-worker',
  setup(builder) {
    builder.onResolve({ filter: /\?worker$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -7)),
      namespace: 'ripple-worker',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'ripple-worker' }, async (args) => {
      const result = await build({
        entryPoints: [args.path],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        target: 'es2022',
        minify: true,
        legalComments: 'inline',
        metafile: true,
      });
      for (const name of Object.keys(result.metafile.inputs)) workerInputs.add(name);
      return {
        contents: result.outputFiles[0].text,
        loader: 'text',
        resolveDir: dirname(args.path),
        watchFiles: Object.keys(result.metafile.inputs).map((name) => resolve(name)),
      };
    });
  },
};
