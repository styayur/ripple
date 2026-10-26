import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.env.GRAPHFRONTIER_SOURCE;
if (!root)
  throw new Error(
    'Set GRAPHFRONTIER_SOURCE to the separately cloned, audited GraphFrontier checkout.',
  );
const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(sha, '72223f9a020aefc73e0ac13e7d4945c15e2b28d5');
const read = (name) => readFile(path.join(root, name), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
assert.equal(manifest.id, 'graphfrontier');
assert.equal(manifest.version, '0.8.6');
const api = await read('src/api.js');
const actions = await read('src/api-actions.js');
const tools = await read('src/api-tools.js');
const docs = await read('docs/mcp.md');
for (const method of ['runTool', 'listViews', 'getState', 'getGraph'])
  assert.ok(api.includes(`${method}(`));
for (const method of ['searchNodes', 'highlightNodes', 'setVisibleNodes'])
  assert.ok(actions.includes(`${method}(`));
for (const name of ['get_graph', 'search_nodes', 'highlight_nodes', 'set_visible_nodes'])
  assert.ok(tools.includes(name) || docs.includes(name));
assert.ok(docs.includes('saved with the layout'));
assert.match(await read('LICENSE'), /MIT License/);
console.log(
  `Pinned GraphFrontier source contract inspected: ${sha}. This is not a live integration test.`,
);
