import { TFile, getAllTags } from 'obsidian';
import type { App, Component } from 'obsidian';
import { GraphIndex } from '../core/graph-index';
import { isRecord, strings } from '../core/types';
import type { GraphSnapshot } from '../core/graph-model';

export interface IndexStatus {
  busy: boolean;
  message: string;
  durationMs: number;
  bodyReads: number;
}
/** One host metadata reader for the plugin, with dirty paths and bounded text cache. */
export class VaultIndex {
  private readonly store = new GraphIndex();
  private readonly dirty = new Set<string>();
  private readonly bodies = new Map<string, { signature: string; text: string }>();
  private full = true;
  private rerun = false;
  private running: Promise<void> | undefined;
  private closed = false;
  private includeContent = false;
  private readonly listeners = new Set<(snapshot: GraphSnapshot, status: IndexStatus) => void>();
  status: IndexStatus = { busy: false, message: 'Index not loaded', durationMs: 0, bodyReads: 0 };
  constructor(private readonly app: App) {}
  get bodyEnabled(): boolean {
    return this.includeContent;
  }
  start(owner: Component): void {
    owner.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        this.dirty.add(file.path);
        void this.refresh();
      }),
    );
    owner.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        void this.refresh();
      }),
    );
    owner.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile) this.dirty.add(file.path);
        void this.refresh();
      }),
    );
    owner.registerEvent(
      this.app.vault.on('delete', (file) => {
        this.store.remove(file.path);
        this.bodies.delete(file.path);
        void this.refresh();
      }),
    );
    owner.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.store.remove(oldPath);
        this.bodies.delete(oldPath);
        if (file instanceof TFile) this.dirty.add(file.path);
        void this.refresh();
      }),
    );
    owner.register(() => this.dispose());
  }
  subscribe(callback: (snapshot: GraphSnapshot, status: IndexStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this.store.snapshot(), this.status);
    return () => this.listeners.delete(callback);
  }
  private emit(): void {
    if (!this.closed)
      for (const callback of this.listeners) callback(this.store.snapshot(), this.status);
  }
  async setBodyIndex(value: boolean): Promise<void> {
    this.includeContent = value;
    this.bodies.clear();
    this.full = true;
    await this.refresh();
  }
  refresh(full = false): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.full ||= full;
    this.rerun = true;
    if (!this.running)
      this.running = this.run().finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async run(): Promise<void> {
    while (this.rerun && !this.closed) {
      this.rerun = false;
      const started = performance.now();
      let reads = 0;
      this.status = { ...this.status, busy: true, message: 'Updating graph index…' };
      this.emit();
      try {
        const files = this.app.vault
          .getMarkdownFiles()
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        if (files.length > 50_000)
          throw new Error('This version supports at most 50,000 Markdown nodes.');
        this.store.reconcile(new Set(files.map((file) => file.path)));
        let budget = 8_000_000;
        let truncated = false;
        let failures = 0;
        const full = this.full;
        this.full = false;
        const dirty = new Set(this.dirty);
        this.dirty.clear();
        for (let i = 0; i < files.length; i++) {
          if (this.closed) return;
          const file = files[i]!;
          let content = '';
          if (this.includeContent) {
            const signature = `${file.stat.mtime}:${file.stat.size}`;
            const cached = this.bodies.get(file.path);
            if (budget > 0) {
              if (cached?.signature === signature) content = cached.text;
              else {
                try {
                  const text = await this.app.vault.cachedRead(file);
                  content = text.slice(0, 32_768);
                  reads++;
                  truncated ||= text.length > content.length;
                } catch {
                  failures++;
                }
              }
              if (content.length > budget) {
                content = content.slice(0, budget);
                truncated = true;
              }
              this.bodies.set(file.path, { signature, text: content });
              budget -= content.length;
            } else {
              this.bodies.delete(file.path);
              truncated = true;
            }
          }
          if (full || dirty.has(file.path) || this.includeContent) {
            const cache = this.app.metadataCache.getFileCache(file);
            const props = isRecord(cache?.frontmatter) ? cache.frontmatter : {};
            let tags: string[] = [];
            try {
              tags = cache ? (getAllTags(cache) ?? []) : [];
            } catch {
              failures++;
            }
            const metadata = Object.entries(props)
              .filter(([key]) => key !== 'position')
              .slice(0, 100)
              .flatMap(([key, value]) =>
                typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                  ? [`${key} ${String(value)}`]
                  : strings(value).map((text) => `${key} ${text}`),
              );
            this.store.upsert({
              id: file.path,
              path: file.path,
              title: file.basename,
              aliases: strings(props.aliases ?? props.alias),
              tags,
              metadata,
              content,
            });
          }
          if (i % 250 === 249) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        for (const file of files) this.store.setLinks(file.path, resolvedLinks[file.path] ?? {});
        for (const key of this.bodies.keys())
          if (!this.app.vault.getFileByPath(key)) this.bodies.delete(key);
        this.status = {
          busy: false,
          message: `${files.length} notes indexed${truncated ? ' · Body text truncated at configured limits' : ''}${failures ? ` · ${failures} metadata/read warnings` : ''}`,
          durationMs: performance.now() - started,
          bodyReads: reads,
        };
        this.emit();
      } catch (error) {
        this.status = {
          busy: false,
          message: error instanceof Error ? error.message : 'Index update failed',
          durationMs: performance.now() - started,
          bodyReads: reads,
        };
        this.emit();
      }
    }
  }
  dispose(): void {
    this.closed = true;
    this.listeners.clear();
    this.bodies.clear();
    this.dirty.clear();
  }
}
