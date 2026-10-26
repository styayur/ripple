import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphFrontierAdapter } from '../src/adapters/graphfrontier';
import { AdvancedGraphViewAdapter } from '../src/adapters/advanced-graph-view';
import { SmartClusterGraphAdapter } from '../src/adapters/smart-cluster-graph';
import { GalaxyViewAdapter } from '../src/adapters/galaxy-view';
import { ObsidianPluginDiscovery } from '../src/services/plugin-detection';
import type { App } from 'obsidian';
import type { PluginProbe } from '../src/adapters/adapter-interface';

const targets = [
  { create: (probe: () => PluginProbe) => new GraphFrontierAdapter({ probe }), version: '0.8.6' },
  {
    create: (probe: () => PluginProbe) => new AdvancedGraphViewAdapter({ probe }),
    version: '0.10.1',
  },
  {
    create: (probe: () => PluginProbe) => new SmartClusterGraphAdapter({ probe }),
    version: '1.2.0',
  },
  { create: (probe: () => PluginProbe) => new GalaxyViewAdapter({ probe }), version: '0.6.1' },
];
const probe = (version: string, patch: Partial<PluginProbe> = {}): PluginProbe => ({
  available: true,
  installed: true,
  enabled: true,
  version,
  instance: {},
  viewCount: 1,
  ...patch,
});

for (const target of targets) {
  for (const [state, patch] of [
    ['unavailable', { available: false }],
    ['missing', { installed: false }],
    ['disabled', { enabled: false }],
    ['incompatible', { version: '99.0.0' }],
    ['incompatible', { version: undefined }],
    ['no-view', { viewCount: 0 }],
  ] as const)
    test(`${target.version} adapter detects ${state} without unsafe access`, async () => {
      const adapter = target.create(() => probe(target.version, patch));
      assert.equal((await adapter.inspect()).state, state);
      assert.equal((await adapter.applyVisible(new Set(['a']))).ok, false);
      assert.equal((await adapter.clear()).ok, true);
      adapter.dispose();
    });

  test(`${target.version} adapter survives discovery errors, unload and re-enable`, async () => {
    const broken = target.create(() => {
      throw new Error('registry failure');
    });
    assert.equal((await broken.inspect()).state, 'error');
    broken.dispose();
    assert.equal((await broken.inspect()).state, 'closed');
    assert.equal((await broken.readGraph()).ok, false);
    const reenabled = target.create(() => probe(target.version));
    assert.notEqual((await reenabled.inspect()).state, 'closed');
    assert.equal((await reenabled.clear()).ok, true);
    reenabled.dispose();
  });
}

for (const target of targets.slice(1))
  test(`${target.version} exposes explicit unsupported capabilities`, async () => {
    const adapter = target.create(() => probe(target.version));
    const capability = await adapter.inspect();
    assert.equal(capability.state, 'unsupported');
    assert.deepEqual(
      [capability.read, capability.apply, capability.restore],
      [false, false, false],
    );
    assert.equal((await adapter.readGraph()).ok, false);
    adapter.dispose();
  });

function frontierFixture(options: { empty?: boolean; multiple?: boolean } = {}) {
  const calls: { method: string; args: Record<string, unknown>; readOnly: boolean }[] = [];
  const reference = { viewId: 'view-a', contextToken: 'token-1' };
  let handler: ((method: string, args: Record<string, unknown>) => unknown) | undefined;
  let currentProbe: PluginProbe;
  const api = {
    runTool: async (
      method: string,
      args: Record<string, unknown>,
      readOnly: boolean,
      signal: AbortSignal,
    ) => {
      calls.push({ method, args, readOnly });
      assert.equal(signal.aborted, false);
      if (handler) return handler(method, args);
      if (method === 'listViews')
        return {
          apiVersion: 1,
          pluginVersion: '0.8.6',
          views: [
            reference,
            ...(options.multiple ? [{ viewId: 'view-b', contextToken: 'token-2' }] : []),
          ],
        };
      if (method === 'getState') return reference;
      if (method === 'getGraph')
        return {
          ...reference,
          kind: args.kind,
          items: options.empty
            ? []
            : args.kind === 'nodes'
              ? [{ id: 'a.md', label: 'A', type: 'note', x: 1, y: 2, pinned: true, visible: true }]
              : [],
          nextOffset: null,
        };
      throw new Error(`Mutation forbidden: ${method}`);
    },
  };
  currentProbe = probe('0.8.6', { instance: { api } });
  const adapter = new GraphFrontierAdapter({ probe: () => currentProbe });
  return {
    adapter,
    calls,
    reference,
    setHandler(value: typeof handler) {
      handler = value;
    },
    changeProbe(value: PluginProbe) {
      currentProbe = value;
    },
  };
}

test('GraphFrontier validates read-only contract; never calls mutation or restoration APIs', async () => {
  const fixture = frontierFixture();
  assert.equal((await fixture.adapter.inspect()).state, 'read-only');
  const result = await fixture.adapter.readGraph();
  assert.equal(result.ok, true);
  assert.equal(result.value!.nodes[0]!.x, 1);
  assert.equal((await fixture.adapter.applyVisible(new Set())).ok, false);
  await fixture.adapter.clear();
  fixture.adapter.dispose();
  assert.ok(
    fixture.calls.every(
      (call) => call.readOnly && ['listViews', 'getState', 'getGraph'].includes(call.method),
    ),
  );
});

test('GraphFrontier accepts empty graph and requires explicit selection for multiple views', async () => {
  const empty = frontierFixture({ empty: true });
  assert.deepEqual((await empty.adapter.readGraph()).value, { nodes: [], edges: [] });
  const multiple = frontierFixture({ multiple: true });
  assert.match((await multiple.adapter.readGraph()).error!, /Select/);
  assert.equal((await multiple.adapter.readGraph('view-a')).ok, true);
  assert.equal((await multiple.adapter.readGraph('missing')).ok, false);
});

test('GraphFrontier rejects missing API and malformed API version', async () => {
  const fixture = frontierFixture();
  fixture.changeProbe(probe('0.8.6'));
  assert.equal((await fixture.adapter.inspect()).state, 'error');
  assert.equal((await fixture.adapter.readGraph()).ok, false);
  const wrongApi = frontierFixture();
  wrongApi.setHandler(() => ({ apiVersion: 2, views: [] }));
  assert.equal((await wrongApi.adapter.inspect()).state, 'error');
});

test('GraphFrontier reports API exceptions, bad wire data and non-progressing pagination', async () => {
  for (const kind of ['throws', 'node', 'token', 'offset', 'edge', 'page'] as const) {
    const fixture = frontierFixture();
    fixture.setHandler((method, args) => {
      if (method === 'listViews')
        return { apiVersion: 1, pluginVersion: '0.8.6', views: [fixture.reference] };
      if (method === 'getState') return fixture.reference;
      if (kind === 'throws') throw new Error('API_CLOSED');
      if (kind === 'page')
        return { ...fixture.reference, kind: args.kind, items: 'bad', nextOffset: null };
      return {
        ...fixture.reference,
        ...(kind === 'token' ? { contextToken: 'changed' } : {}),
        kind: args.kind,
        items:
          kind === 'node'
            ? [null]
            : kind === 'edge' && args.kind === 'edges'
              ? [{ source: 'ghost', target: 'ghost', visible: true }]
              : [],
        nextOffset: kind === 'offset' ? 0 : null,
      };
    });
    assert.equal((await fixture.adapter.readGraph()).ok, false, kind);
  }
});

test('GraphFrontier follows empty pages with advancing source offsets', async () => {
  const fixture = frontierFixture();
  fixture.setHandler((method, args) => {
    if (method === 'listViews')
      return { apiVersion: 1, pluginVersion: '0.8.6', views: [fixture.reference] };
    if (method === 'getState') return fixture.reference;
    return {
      ...fixture.reference,
      kind: args.kind,
      items: [],
      nextOffset: args.offset === 0 ? 10_000 : null,
    };
  });
  assert.equal((await fixture.adapter.readGraph()).ok, true);
  assert.ok(fixture.calls.some((call) => call.args.offset === 10_000));
});

test('GraphFrontier detects target reload/unload during pending read', async () => {
  const fixture = frontierFixture();
  fixture.setHandler(() => {
    fixture.changeProbe(probe('0.8.6', { enabled: false }));
    return {};
  });
  assert.equal((await fixture.adapter.readGraph()).ok, false);
  const disposed = frontierFixture();
  disposed.setHandler(() => {
    disposed.adapter.dispose();
    return {};
  });
  assert.equal((await disposed.adapter.readGraph()).ok, false);
});

test('GraphFrontier rejects a visibility change without a token change', async () => {
  const fixture = frontierFixture();
  let nodePages = 0;
  fixture.setHandler((method, args) => {
    if (method === 'listViews')
      return { apiVersion: 1, pluginVersion: '0.8.6', views: [fixture.reference] };
    if (method === 'getState') return fixture.reference;
    if (args.kind === 'nodes') nodePages++;
    return {
      ...fixture.reference,
      kind: args.kind,
      items:
        args.kind === 'nodes' && nodePages === 1
          ? [{ id: 'a', label: 'A', x: 0, y: 0, pinned: false, type: 'note', visible: true }]
          : [],
      nextOffset: null,
    };
  });
  assert.match((await fixture.adapter.readGraph()).error!, /Visibility changed/);
});

test('restoration safety is a no-op even when the upstream API would fail', async () => {
  const fixture = frontierFixture();
  fixture.setHandler(() => {
    throw new Error('restoration unavailable');
  });
  assert.equal((await fixture.adapter.clear()).ok, true);
  fixture.adapter.dispose();
  assert.equal(fixture.calls.length, 0);
});

test('guarded Obsidian registry discovery distinguishes installed/disabled and unavailable', () => {
  const unavailable = new ObsidianPluginDiscovery({} as App);
  assert.equal(unavailable.probe('x', 'view').available, false);
  const registry = {
    manifests: { x: { version: '1.0.0' } },
    getPlugin() {
      return null;
    },
  };
  const app = {
    plugins: registry,
    workspace: {
      getLeavesOfType() {
        return [];
      },
    },
  } as unknown as App;
  const result = new ObsidianPluginDiscovery(app).probe('x', 'view');
  assert.equal(result.installed, true);
  assert.equal(result.enabled, false);
  assert.equal(result.version, '1.0.0');
});
