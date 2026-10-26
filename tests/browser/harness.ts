import { installDomHelpers, TFile } from './obsidian-mock';
import { RippleView } from '../../src/ui/ripple-view';
import type { WorkspaceLeaf } from 'obsidian';

installDomHelpers();
const files = [
  new TFile('Ocean.md', 'Ocean'),
  new TFile('Oceanography.md', 'Oceanography'),
  new TFile('Cooking.md', 'Cooking'),
];
const calls: { method: string; readOnly: boolean }[] = [];
const handlers = new Map<string, Set<() => void>>();
const on = (name: string, callback: () => void) => {
  const listeners = handlers.get(name) ?? new Set();
  handlers.set(name, listeners);
  listeners.add(callback);
  return () => listeners.delete(callback);
};
const reference = { viewId: 'fixture-graph', contextToken: 'fixture-token' };
const api = {
  async runTool(method: string, args: Record<string, unknown>, readOnly: boolean) {
    calls.push({ method, readOnly });
    if (method === 'listViews')
      return {
        apiVersion: 1,
        pluginVersion: '0.8.6',
        views: [{ ...reference, layout: 'Fixture graph' }],
      };
    if (method === 'getState') return reference;
    if (method === 'getGraph')
      return {
        ...reference,
        kind: args.kind,
        items:
          args.kind === 'nodes'
            ? files.map((file, i) => ({
                id: file.path,
                label: file.basename,
                x: i * 10,
                y: i * 20,
                pinned: i === 0,
                visible: true,
                type: 'note',
              }))
            : [{ source: 'Ocean.md', target: 'Oceanography.md', visible: true }],
        nextOffset: null,
      };
    throw new Error('Unexpected mutation');
  },
};
const manifests = {
  graphfrontier: { version: '0.8.6' },
  'graph-insight': { version: '0.10.1' },
  'smart-cluster-graph': { version: '1.2.0' },
  'galaxy-view': { version: '0.6.1' },
};
const app = {
  vault: {
    getMarkdownFiles: () => files,
    cachedRead: async () => 'The deep blue ocean.',
    getFileByPath: (id: string) => files.find((file) => file.path === id),
    on,
  },
  metadataCache: {
    getFileCache: () => ({ tags: [{ tag: '#water' }], frontmatter: { aliases: ['Sea'] } }),
    resolvedLinks: { 'Ocean.md': { 'Oceanography.md': 1 } },
    on,
  },
  workspace: { getLeavesOfType: () => [{}], openLinkText: async () => {} },
  plugins: { manifests, getPlugin: (id: string) => (id === 'graphfrontier' ? { api } : {}) },
};
let view: RippleView;
async function mount() {
  view = new RippleView({
    app,
    contentEl: document.getElementById('app')!,
  } as unknown as WorkspaceLeaf);
  await view.onOpen();
}
const fixture = {
  app,
  calls,
  handlers,
  close: async () => {
    await view.onClose();
    (view as unknown as { unload(): void }).unload();
  },
  mount,
  invalidate: () => {
    for (const callback of handlers.get('changed') ?? []) callback();
  },
};
Object.assign(window, { rippleFixture: fixture });
void mount();
