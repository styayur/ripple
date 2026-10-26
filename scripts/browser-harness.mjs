import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('reports/browser', { recursive: true });
await build({
  entryPoints: ['tests/browser/harness.ts'],
  outfile: 'reports/browser/harness.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  alias: { obsidian: resolve('tests/browser/obsidian-mock.ts') },
});
const css = await readFile('styles.css', 'utf8');
const theme = `:root { color-scheme: light; --text-normal:#202937; --text-muted:#526071; --text-faint:#94a3b8; --text-error:#af2828; --interactive-accent:#317b9a; --background-primary:#fff; --background-secondary:#f0f5f7; --background-modifier-border:#cbd5df; --size-2-1:2px; --size-4-1:4px; --size-4-2:8px; --size-4-3:12px; --size-4-4:16px; --font-ui-small:13px; --font-ui-smaller:12px; --radius-m:6px; } body { margin:0; font:14px/1.5 system-ui; color:var(--text-normal); background:var(--background-primary); } body.dark { color-scheme: dark; --text-normal:#dce8ee; --text-muted:#a8b8c4; --text-faint:#627788; --text-error:#ff9898; --interactive-accent:#6ab4cc; --background-primary:#202a32; --background-secondary:#17222b; --background-modifier-border:#435463; } .setting-item{display:flex;align-items:center;border-bottom:1px solid var(--background-modifier-border);padding:12px 0}.setting-item-info{flex:1}.setting-item-description{font-size:12px;color:var(--text-muted)} input,select,button {font:inherit;box-sizing:border-box;} button{padding:6px 10px;} #app{max-width:500px;margin:auto}`;
await writeFile(
  'reports/browser/index.html',
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ripple SDK mock browser fixture</title><style>${theme}\n${css}</style><main id="app"></main><script src="harness.js"></script></html>`,
);
console.log('Built reports/browser/index.html (mock SDK fixture, not Obsidian).');
