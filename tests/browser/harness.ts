import { installDomHelpers, TFile } from './obsidian-mock';
import { RippleWorkspaceView } from '../../src/ui/workspace-view';
import { WorkspaceController } from '../../src/workspace/workspace-controller';
import { VaultIndex } from '../../src/services/vault-index';
import type { App, Component, WorkspaceLeaf } from 'obsidian';

installDomHelpers();
let files: TFile[] = [];
for (const group of ['Graph', 'Systems', 'Testing', 'Notes']) {
  for (let i = 0; i < 8; i++)
    files.push(
      new TFile(
        `${group}/${i === 0 ? group : `${group} ${i}`}.md`,
        i === 0 ? group : `${group} ${i}`,
      ),
    );
}
const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
const on = (name: string, callback: (...args: unknown[]) => void) => {
  const values = handlers.get(name) ?? new Set();
  handlers.set(name, values);
  values.add(callback);
  return () => values.delete(callback);
};
let reads = 0;
let lastOpened: string | undefined;
const app = {
  vault: {
    getMarkdownFiles: () => [...files],
    cachedRead: async () => {
      reads++;
      return 'The deep blue ocean.';
    },
    getFileByPath: (id: string) => files.find((file) => file.path === id),
    on,
  },
  metadataCache: {
    getFileCache: (file: TFile) => ({
      tags: [{ tag: `#${file.path.split('/')[0]!.toLowerCase()}` }],
      frontmatter: { aliases: ['Reference'] },
    }),
    get resolvedLinks() {
      return Object.fromEntries(
        files.map((file, i) => [
          file.path,
          {
            [files[Math.floor(i / 8) * 8 + ((i + 1) % 8)]!.path]: 1,
            [files[Math.floor(i / 8) * 8 + ((i + 2) % 8)]!.path]: 1,
          },
        ]),
      );
    },
    on,
  },
  workspace: {
    on,
    getLeaf: () => ({
      openFile: async (file: TFile) => {
        lastOpened = file.path;
      },
    }),
  },
};
const controller = new WorkspaceController();
const index = new VaultIndex(app as unknown as App);
const subscriptions: (() => void)[] = [];
index.start({
  registerEvent: (cleanup: () => void) => subscriptions.push(cleanup),
  register: (cleanup: () => void) => subscriptions.push(cleanup),
} as unknown as Component);
subscriptions.push(index.subscribe((snapshot) => controller.update(snapshot)));
let view: RippleWorkspaceView;
async function mount() {
  view = new RippleWorkspaceView(
    { app, contentEl: document.getElementById('app')! } as unknown as WorkspaceLeaf,
    controller,
    index,
  );
  await view.onOpen();
}
const fixture = {
  app,
  controller,
  index,
  handlers,
  get reads() {
    return reads;
  },
  get lastOpened() {
    return lastOpened;
  },
  close: async () => {
    await view.onClose();
    (view as unknown as { unload(): void }).unload();
  },
  mount,
  shutdown: async () => {
    await fixture.close();
    for (const cleanup of subscriptions) cleanup();
    controller.dispose();
  },
  empty: async () => {
    files = [];
    await index.refresh(true);
  },
  loadSynthetic: async (count: number) => {
    files = Array.from(
      { length: count },
      (_, i) => new TFile(`Synthetic/${i}.md`, i % 20 === 0 ? 'Graph' : `Note ${i}`),
    );
    await index.refresh(true);
  },
  modify: async () => {
    const file = files[0]!;
    file.stat.mtime++;
    for (const callback of handlers.get('changed') ?? []) callback(file);
    await index.refresh();
  },
};
Object.assign(window, { rippleFixture: fixture });
void mount();
