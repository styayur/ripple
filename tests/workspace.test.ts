import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphIndex } from '../src/core/graph-index';
import { WorkspaceController } from '../src/workspace/workspace-controller';
import { VIEW_MODES } from '../src/core/graph-model';
import { analyzeGraph, convexHull, seedPositions } from '../src/core/graph-algorithms';
import { createSimulation } from '../src/renderers/layout-engine';
import type { GraphNode } from '../src/core/types';

const node = (id: string, title = id): GraphNode => ({
  id,
  title,
  aliases: [],
  tags: [],
  metadata: [],
  content: '',
});
function fixture() {
  const index = new GraphIndex();
  for (const name of ['a', 'b', 'c', 'd'])
    index.upsert(node(`${name}.md`, name === 'a' ? 'Graph' : `Related ${name}`));
  index.setLinks('a.md', { 'b.md': 2 });
  index.setLinks('b.md', { 'c.md': 1 });
  index.setLinks('c.md', { 'd.md': 1 });
  return index;
}
test('incremental snapshots are immutable, cached and revisioned only on changes', () => {
  const index = fixture();
  const first = index.snapshot();
  assert.equal(first, index.snapshot());
  assert.equal(index.upsert(node('a.md', 'Graph')), false);
  assert.equal(first, index.snapshot());
  index.setLinks('a.md', { 'b.md': 2 });
  assert.equal(first, index.snapshot());
  index.upsert(node('a.md', 'Changed'));
  const second = index.snapshot();
  assert.ok(second.revision > first.revision);
  assert.equal(first.nodes[0]!.title, 'Graph');
  assert.throws(() => (first.nodes as GraphNode[]).pop());
});
test('incremental delete and rename preserve endpoint consistency and directed weights', () => {
  const index = fixture();
  assert.equal(index.snapshot().edges[0]!.weight, 2);
  assert.equal(index.snapshot().edges[0]!.directed, true);
  index.setLinks('a.md', { ghost: 1, 'b.md': 0, 'a.md': 2 });
  assert.equal(
    index.snapshot().edges.some((edge) => edge.source === 'a.md'),
    false,
  );
  index.remove('c.md');
  assert.ok(
    index.snapshot().edges.every((edge) => edge.source !== 'c.md' && edge.target !== 'c.md'),
  );
  index.upsert(node('renamed.md'));
  index.reconcile(new Set(['a.md', 'renamed.md']));
  assert.equal(index.snapshot().nodes.length, 2);
});
test('all four modes use the same visible graph, selected nodes and score cache', () => {
  const controller = new WorkspaceController();
  controller.update(fixture().snapshot());
  controller.setFilter('Graph', 65);
  controller.select('a.md');
  const ids = controller.visible.ids;
  const scores = controller.visible.scores;
  for (const mode of VIEW_MODES) {
    controller.setMode(mode);
    assert.equal(controller.filter.query, 'Graph');
    assert.equal(controller.filter.threshold, 65);
    assert.equal(controller.visible.ids, ids);
    assert.equal(controller.visible.scores, scores);
    assert.ok(controller.selected.has('a.md'));
  }
  controller.setFilter('Graph', 0);
  for (const id of ids) assert.ok(controller.visible.ids.has(id));
  for (const mode of VIEW_MODES) {
    controller.setMode(mode);
    assert.equal(controller.visible.ids.size, 4);
  }
  controller.dispose();
});
test('view cameras and layout pins remain independent through switches and filtering', () => {
  const controller = new WorkspaceController();
  controller.update(fixture().snapshot());
  const frontier = controller.views.get('frontier')!,
    dense = controller.views.get('dense')!;
  frontier.camera.x = 200;
  frontier.positions.get('a.md')!.pinned = true;
  dense.camera.zoom = 2;
  const before = structuredClone(frontier.positions);
  controller.setMode('dense');
  controller.setFilter('Graph', 100);
  controller.setMode('frontier');
  assert.equal(frontier.camera.x, 200);
  assert.equal(dense.camera.x, 0);
  assert.equal(dense.camera.zoom, 2);
  assert.deepEqual(frontier.positions, before);
});
test('snapshot replacement invalidates scoring and preserves surviving selection/positions', () => {
  const index = fixture();
  const controller = new WorkspaceController();
  controller.update(index.snapshot());
  controller.setFilter('Graph', 100);
  controller.select('a.md');
  const scores = controller.visible.scores;
  const position = controller.views.get('galaxy')!.positions.get('a.md');
  index.upsert(node('a.md', 'New title'));
  controller.update(index.snapshot());
  assert.notEqual(controller.visible.scores, scores);
  assert.equal(controller.visible.ids.size, 0);
  assert.equal(controller.views.get('galaxy')!.positions.get('a.md'), position);
  assert.ok(controller.selected.has('a.md'));
  index.remove('a.md');
  controller.update(index.snapshot());
  assert.equal(controller.selected.size, 0);
});
test('invalid query is atomic and clear restores full candidates without changing mode', () => {
  const controller = new WorkspaceController();
  controller.update(fixture().snapshot());
  controller.setMode('galaxy');
  controller.setFilter('Graph', 100);
  const visible = controller.visible;
  assert.throws(() => controller.setFilter('title:', 65));
  assert.equal(controller.visible, visible);
  assert.equal(controller.filter.threshold, 100);
  controller.clear();
  assert.equal(controller.visible.ids.size, 4);
  assert.equal(controller.mode, 'galaxy');
});
test('strict bridge behavior does not bypass the relevance threshold', () => {
  const controller = new WorkspaceController();
  controller.update(fixture().snapshot());
  controller.setFilter('Graph', 65);
  assert.deepEqual([...controller.visible.ids], ['a.md']);
  assert.ok(!controller.visible.ids.has('b.md'));
  assert.equal(controller.filter.strategy, 'strict');
});
test('community analysis is deterministic and marks inter-community bridges', () => {
  const index = new GraphIndex();
  for (const id of ['X/a', 'X/b', 'X/c', 'Y/a', 'Y/b', 'Y/c']) index.upsert(node(id));
  index.setLinks('X/a', { 'X/b': 1, 'X/c': 1, 'Y/a': 1 });
  index.setLinks('X/b', { 'X/c': 1 });
  index.setLinks('Y/a', { 'Y/b': 1, 'Y/c': 1 });
  index.setLinks('Y/b', { 'Y/c': 1 });
  const graph = index.snapshot();
  const result = analyzeGraph(graph);
  assert.deepEqual(result, analyzeGraph(graph));
  assert.equal(result.groups.size, 2);
  assert.equal(result.bridges.length, 1);
  const rank = [...result.importance.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(rank - 1) < 0.00001);
});
test('layouts differ, Galaxy has actual depth, seeds and hulls are deterministic', () => {
  const graph = fixture().snapshot(),
    analysis = analyzeGraph(graph);
  const positions = VIEW_MODES.map((mode) => seedPositions(graph, mode, analysis));
  assert.notDeepEqual(positions[0], positions[1]);
  assert.notDeepEqual(positions[1], positions[2]);
  assert.ok([...positions[3]!.values()].some((point) => Math.abs(point.z) > 1));
  assert.deepEqual(positions[3], seedPositions(graph, 'galaxy', analysis));
  assert.equal(
    convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 },
    ]).length,
    4,
  );
});
test('force layout is deterministic and a pinned node never drifts', () => {
  const input = {
    nodes: [
      { id: 'a', x: 0, y: 0, pinned: true },
      { id: 'b', x: 1, y: 1, pinned: false },
    ],
    edges: [{ source: 'a', target: 'b' }],
  };
  const a = createSimulation(input),
    b = createSimulation(input);
  a.tick(20);
  b.tick(20);
  assert.deepEqual(a.nodes(), b.nodes());
  assert.equal(a.nodes()[0]!.x, 0);
  assert.equal(a.nodes()[0]!.y, 0);
  assert.notEqual(a.nodes()[1]!.x, 1);
  a.stop();
  b.stop();
});
test('empty snapshot and repeated disposal release all workspace subscribers', () => {
  const controller = new WorkspaceController();
  let calls = 0;
  const unsubscribe = controller.subscribe(() => calls++);
  controller.setFilter('', 100);
  assert.equal(controller.visible.ids.size, 0);
  assert.equal(calls, 1);
  unsubscribe();
  controller.setMode('dense');
  assert.equal(calls, 1);
  controller.dispose();
  controller.dispose();
});
