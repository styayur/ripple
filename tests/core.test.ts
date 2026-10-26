import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/core/query-parser';
import { FilterEngine } from '../src/core/filter-engine';
import { thresholdIds } from '../src/core/threshold';
import { StateManager } from '../src/services/state-manager';
import { previewPositions } from '../src/ui/graph-preview';
import type { GraphNode } from '../src/core/types';

export const node = (id: string, title = id, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  title,
  aliases: [],
  tags: [],
  metadata: [],
  content: '',
  ...extra,
});
const fixture = () => ({
  nodes: [
    node('a.md', 'Ocean'),
    node('b.md', 'Oceanography'),
    node('bridge.md', 'Bridge'),
    node('c.md', 'Cooking', {
      aliases: ['Sea'],
      tags: ['#water'],
      metadata: ['topic Ocean'],
      content: 'The ocean is deep',
    }),
    node('d.md', 'Unrelated'),
  ],
  edges: [
    { source: 'a.md', target: 'bridge.md' },
    { source: 'bridge.md', target: 'b.md' },
  ],
});

test('parses fields, quoted phrases, exclusions and Unicode normalization', () => {
  assert.deepEqual(parseQuery('title:"Deep Sea" tag:ＷＡＴＥＲ -path:Archive').terms, [
    { field: 'title', value: 'deep sea', exclude: false },
    { field: 'tag', value: 'water', exclude: false },
    { field: 'path', value: 'archive', exclude: true },
  ]);
  assert.equal(parseQuery(' \n ').empty, true);
  for (const query of [
    '"missing',
    'tag:',
    'unknown:a',
    '-',
    'a'.repeat(513),
    Array(33).fill('a').join(' '),
  ])
    assert.throws(() => parseQuery(query));
});

test('exact title/alias, partial title and no match have distinct scores', () => {
  const engine = new FilterEngine(fixture());
  const scores = engine.filter('Ocean', 0).scores;
  assert.equal(scores.find((s) => s.id === 'a.md')!.total, 1);
  assert.ok(
    scores.find((s) => s.id === 'b.md')!.total > scores.find((s) => s.id === 'd.md')!.total,
  );
  assert.equal(scores.find((s) => s.id === 'd.md')!.total, 0);
  assert.deepEqual([...engine.filter('alias:Sea', 100).visibleIds], ['c.md']);
  assert.deepEqual([...engine.filter('title:Ocean', 100).visibleIds], ['a.md']);
});

test('thresholds 0, 50, 100 are inclusive and invalid thresholds are rejected', () => {
  const engine = new FilterEngine(fixture());
  assert.equal(engine.filter('Ocean', 0).visibleIds.size, 5);
  assert.deepEqual([...engine.filter('Ocean', 100).visibleIds], ['a.md']);
  const boundary = engine.filter('Ocean', 0).scores[1]!;
  assert.ok(thresholdIds([boundary], boundary.total * 100).has(boundary.id));
  assert.ok(!thresholdIds([boundary], boundary.total * 100 + 0.00001).has(boundary.id));
  for (const value of [-1, 101, NaN, Infinity]) assert.throws(() => engine.filter('', value));
});

test('every integer threshold is monotone in both directions, with fixed query and graph', () => {
  const engine = new FilterEngine(fixture());
  for (const query of ['Ocean', 'tag:water', 'Ocean -path:b', 'content:deep', '-Cooking']) {
    let previous = engine.filter(query, 0).visibleIds;
    for (let threshold = 1; threshold <= 100; threshold++) {
      const current = engine.filter(query, threshold).visibleIds;
      for (const id of current) assert.ok(previous.has(id));
      previous = current;
    }
    for (let threshold = 99; threshold >= 0; threshold--) {
      const current = engine.filter(query, threshold).visibleIds;
      for (const id of previous) assert.ok(current.has(id));
      previous = current;
    }
  }
});

test('empty query ignores default threshold; empty vault is a valid graph', () => {
  const engine = new FilterEngine(fixture());
  assert.equal(engine.filter(' ', 100).visibleIds.size, 5);
  assert.equal(new FilterEngine({ nodes: [], edges: [] }).filter('x', 50).total, 0);
});

test('corrupt entries and missing metadata are tolerated and diagnosed', () => {
  const engine = new FilterEngine({
    nodes: [
      null,
      { id: 'x', aliases: [false, 'valid'], content: 9, x: NaN },
      { id: 'x' },
      { id: 4 },
    ],
    edges: [null, { source: 'x', target: 'ghost' }],
  });
  assert.equal(engine.graph.nodes.length, 1);
  assert.equal(engine.graph.nodes[0]!.title, 'x');
  assert.deepEqual(engine.graph.nodes[0]!.aliases, ['valid']);
  assert.equal(engine.graph.nodes[0]!.content, '');
  assert.equal(engine.graph.nodes[0]!.x, undefined);
  assert.ok(engine.warnings.length >= 4);
  assert.equal(new FilterEngine(null).graph.nodes.length, 0);
});

test('duplicate, reverse, dangling and self links do not inflate degree', () => {
  const graph = {
    nodes: [node('a'), node('b')],
    edges: [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'a', target: 'missing' },
      { source: 'a', target: 'a' },
    ],
  };
  const engine = new FilterEngine(graph);
  assert.equal(engine.graph.edges.length, 1);
  assert.equal(engine.filter('a', 0).scores[0]!.degree, 1);
});

test('clear restores an existing original subset; repeat apply/clear is idempotent', () => {
  const manager = new StateManager(fixture(), new Set(['a.md', 'c.md']));
  manager.apply('Ocean', 100);
  assert.deepEqual([...manager.snapshot().visibleIds], ['a.md']);
  manager.apply('Ocean', 100);
  for (let i = 0; i < 4; i++) assert.deepEqual([...manager.clear().visibleIds], ['a.md', 'c.md']);
  const snapshot = manager.snapshot();
  (snapshot.visibleIds as Set<string>).clear();
  assert.equal(manager.snapshot().visibleIds.size, 2);
  manager.dispose();
  manager.dispose();
  assert.deepEqual([...manager.snapshot().visibleIds], ['a.md', 'c.md']);
  assert.throws(() => manager.apply('Ocean', 50), /closed/);
  assert.equal(new StateManager(fixture()).clear().visibleIds.size, 5);
});

test('excluded nodes stay excluded at 0%; negative-only query keeps all other candidates', () => {
  const engine = new FilterEngine(fixture());
  assert.ok(!engine.filter('Ocean -title:Oceanography', 0).visibleIds.has('b.md'));
  assert.equal(engine.filter('-title:Cooking', 100).visibleIds.size, 4);
});

test('bridge nodes never bypass the user threshold', () => {
  const engine = new FilterEngine(fixture());
  assert.ok(engine.filter('Ocean', 0).visibleIds.has('bridge.md'));
  assert.ok(!engine.filter('Ocean', 50).visibleIds.has('bridge.md'));
  assert.equal(engine.filter('Ocean', 0).scores.find((s) => s.id === 'bridge.md')!.proximity, 0.5);
});

test('scores are deterministic, finite and normalized; cached slider reads preserve scores', () => {
  const graph = fixture();
  const before = structuredClone(graph);
  const engine = new FilterEngine(graph);
  const first = engine.filter('Ocean water', 0).scores;
  assert.equal(first, engine.filter('Ocean water', 99).scores);
  assert.deepEqual(first, new FilterEngine(graph).filter('Ocean water', 50).scores);
  for (const score of first)
    for (const key of ['total', 'lexical', 'degree', 'proximity'] as const)
      assert.ok(Number.isFinite(score[key]) && score[key] >= 0 && score[key] <= 1);
  assert.deepEqual(graph, before);
});

test('failed queries preserve the last successful visibility; preview positions are fixed', () => {
  const manager = new StateManager(fixture());
  const previous = manager.apply('Ocean', 100);
  assert.throws(() => manager.apply('bad:value', 50));
  assert.deepEqual(manager.snapshot(), previous);
  const positions = previewPositions(manager.engine.graph);
  manager.apply('Ocean', 0);
  assert.deepEqual(previewPositions(manager.engine.graph), positions);
});

test('field restrictions prevent title/content cross-matching and scoring is explainable', () => {
  const engine = new FilterEngine({
    nodes: [node('x', 'Ocean', { content: 'sea', tags: ['#water'] })],
    edges: [],
  });
  assert.equal(engine.filter('content:Ocean', 0).scores[0]!.lexical, 0);
  assert.equal(engine.filter('tag:water', 0).scores[0]!.lexical, 0.9);
  assert.match(engine.filter('content:sea', 0).scores[0]!.reasons[0]!, /content 0.350/);
});
