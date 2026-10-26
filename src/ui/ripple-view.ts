import { ItemView, Notice } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { GraphFrontierAdapter } from '../adapters/graphfrontier';
import { AdvancedGraphViewAdapter } from '../adapters/advanced-graph-view';
import { SmartClusterGraphAdapter } from '../adapters/smart-cluster-graph';
import { GalaxyViewAdapter } from '../adapters/galaxy-view';
import { ObsidianPluginDiscovery } from '../services/plugin-detection';
import { MetadataIndex } from '../services/metadata-index';
import { StateManager } from '../services/state-manager';
import { createControls } from './filter-controls';
import type { FilterControls } from './filter-controls';
import type { GraphAdapter } from '../adapters/adapter-interface';
import type { GraphData } from '../core/types';
import { renderPreview } from './graph-preview';

export const RIPPLE_VIEW = 'ripple-graph-filter-view';

export class RippleView extends ItemView {
  private controls!: FilterControls;
  private statusEl!: HTMLElement;
  private countEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private plotEl!: HTMLElement;
  private readonly index: MetadataIndex;
  private readonly adapters: readonly GraphAdapter[];
  private readonly frontier: GraphFrontierAdapter;
  private session: StateManager | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;
  private controller: AbortController | undefined;
  private closed = false;
  private loading = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    const discovery = new ObsidianPluginDiscovery(this.app);
    this.frontier = new GraphFrontierAdapter(discovery);
    this.adapters = [
      this.frontier,
      new AdvancedGraphViewAdapter(discovery),
      new SmartClusterGraphAdapter(discovery),
      new GalaxyViewAdapter(discovery),
    ];
    this.index = new MetadataIndex(this.app);
    this.register(() => this.shutdown());
  }

  override getViewType(): string {
    return RIPPLE_VIEW;
  }
  override getDisplayText(): string {
    return 'Ripple Graph Filter';
  }
  override getIcon(): string {
    return 'waves';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('ripple-view');
    this.contentEl.createEl('h2', { text: 'Ripple' });
    this.contentEl.createEl('p', {
      text: 'Follow a thread. Keep the context.',
      cls: 'ripple-intro',
    });
    this.contentEl.createEl('p', {
      text: 'Alpha: filtering changes only this preview. External graph control is unavailable.',
      cls: 'ripple-scope',
    });
    this.controls = createControls(this.contentEl.createDiv({ cls: 'ripple-controls' }));
    this.statusEl = this.contentEl.createDiv({ cls: 'ripple-adapters' });
    this.countEl = this.contentEl.createEl('p', {
      cls: 'ripple-count',
      attr: { role: 'status', 'aria-live': 'polite' },
    });
    this.errorEl = this.contentEl.createEl('p', { cls: 'ripple-error', attr: { role: 'alert' } });
    this.plotEl = this.contentEl.createDiv({ cls: 'ripple-diagram' });
    this.contentEl.createEl('p', {
      text: 'Diagram: first 250 candidates, up to 600 links. Results: first 100 matches. Counts include all candidates.',
      cls: 'ripple-limit',
    });
    this.resultsEl = this.contentEl.createDiv({ cls: 'ripple-results' });
    this.controls.query.addEventListener('input', () => this.schedule());
    this.controls.slider.addEventListener('input', () => this.schedule());
    this.controls.source.addEventListener('change', () => {
      this.controls.view.value = '';
      void this.refresh();
    });
    this.controls.view.addEventListener('change', () => {
      void this.refresh();
    });
    this.controls.content.addEventListener('change', () => {
      void this.refresh();
    });
    this.controls.refresh.addEventListener('click', () => {
      void this.refresh();
    });
    this.controls.clear.addEventListener('click', () => this.clear());
    const invalidate = () => {
      this.index.invalidate();
      this.request++;
      this.controller?.abort();
      this.loading = false;
      this.controls.refresh.disabled = false;
      this.errorEl.setText('Vault changed. Refresh graph to update the snapshot.');
    };
    this.registerEvent(this.app.metadataCache.on('changed', invalidate));
    this.registerEvent(this.app.metadataCache.on('resolved', invalidate));
    this.registerEvent(this.app.vault.on('delete', invalidate));
    this.registerEvent(this.app.vault.on('rename', invalidate));
    this.registerEvent(this.app.vault.on('create', invalidate));
    await this.refresh();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.controls.percent.setText(`${this.controls.slider.value}% · Higher keeps fewer nodes`);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.render();
    }, 100);
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.controls.query.value = '';
    this.session?.clear();
    this.render();
  }

  private async refresh(): Promise<void> {
    const request = ++this.request;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading = true;
    this.controls.refresh.disabled = true;
    this.errorEl.empty();
    this.countEl.setText('Reading graph…');
    this.session?.dispose();
    this.session = undefined;
    this.resultsEl.empty();
    this.plotEl.empty();
    try {
      const capabilities = await Promise.all(this.adapters.map((adapter) => adapter.inspect()));
      if (this.closed || request !== this.request) return;
      this.statusEl.empty();
      for (let i = 0; i < this.adapters.length; i++) {
        const capability = capabilities[i]!;
        const row = this.statusEl.createEl('details');
        row.createEl('summary', {
          text: `${this.adapters[i]!.name}: ${capability.state}${capability.installedVersion ? ` (${capability.installedVersion})` : ''}`,
        });
        row.createEl('p', { text: capability.message });
      }
      const selected = this.controls.view.value;
      this.controls.view.empty();
      for (const view of capabilities[0]!.views)
        this.controls.view.createEl('option', {
          value: view.id,
          text: `${view.label} (${view.id})`,
        });
      if (capabilities[0]!.views.some((view) => view.id === selected))
        this.controls.view.value = selected;
      this.controls.view.disabled =
        this.controls.source.value !== 'graphfrontier' || capabilities[0]!.views.length === 0;
      let graph: GraphData;
      const warnings: string[] = [];
      if (this.controls.source.value === 'graphfrontier') {
        if (!capabilities[0]!.read) throw new Error(capabilities[0]!.message);
        if (capabilities[0]!.views.length > 1 && !selected) {
          this.controls.view.selectedIndex = -1;
          throw new Error('Select a GraphFrontier view to read its visible snapshot.');
        }
        const snapshot = await this.frontier.readGraph(this.controls.view.value);
        if (!snapshot.ok || !snapshot.value)
          throw new Error(snapshot.error ?? 'Graph snapshot failed.');
        graph = snapshot.value;
      } else {
        const indexed = await this.index.build(this.controls.content.checked, controller.signal);
        graph = indexed.graph;
        warnings.push(...indexed.warnings);
      }
      if (this.closed || request !== this.request) return;
      this.session = new StateManager(graph);
      this.loading = false;
      this.render();
      if (warnings.length)
        this.errorEl.setText(
          `${warnings.length} index notice(s): ${warnings.slice(0, 3).join(' ')}`,
        );
    } catch (error) {
      if (this.closed || request !== this.request) return;
      this.countEl.setText('Graph unavailable');
      this.errorEl.setText(error instanceof Error ? error.message : 'Could not read the graph.');
    } finally {
      if (request === this.request && !this.closed) {
        this.loading = false;
        this.controls.refresh.disabled = false;
        this.controls.content.disabled = this.controls.source.value !== 'standalone';
      }
    }
  }

  private render(): void {
    if (this.closed || this.loading) return;
    this.controls.percent.setText(`${this.controls.slider.value}% · Higher keeps fewer nodes`);
    this.controls.slider.disabled = this.controls.query.value.trim().length === 0;
    if (!this.session) return;
    try {
      const result = this.session.apply(
        this.controls.query.value,
        Number(this.controls.slider.value),
      );
      this.errorEl.empty();
      this.countEl.setText(
        `${result.visibleIds.size} / ${result.total} visible nodes${result.emptyQuery ? ' · Original graph' : ''}`,
      );
      const graph = this.session.engine.graph;
      renderPreview(this.plotEl, graph, result.visibleIds);
      this.resultsEl.empty();
      if (!result.total)
        this.resultsEl.createEl('p', {
          text: 'No candidate notes. Add Markdown notes or choose another source.',
        });
      else if (!result.visibleIds.size)
        this.resultsEl.createEl('p', {
          text: 'No matches at this threshold. Lower it or change the query.',
        });
      const scores = new Map(result.scores.map((score) => [score.id, score]));
      const visible = graph.nodes
        .filter((node) => result.visibleIds.has(node.id))
        .sort((a, b) => (scores.get(b.id)?.total ?? 0) - (scores.get(a.id)?.total ?? 0));
      for (const node of visible.slice(0, 100)) {
        const score = scores.get(node.id)!;
        const row = this.resultsEl.createEl('details', { cls: 'ripple-result' });
        row.createEl('summary', { text: `${node.title} · ${Math.round(score.total * 100)}%` });
        row.createEl('p', { text: node.id, cls: 'ripple-path' });
        row.createEl('p', {
          text: result.emptyQuery
            ? 'Empty query restores the original visibility.'
            : `Lexical ${score.lexical.toFixed(3)}, proximity ${score.proximity.toFixed(3)}, degree ${score.degree.toFixed(3)}${score.exact ? '. Exact title or alias match.' : '.'}`,
        });
        for (const reason of score.reasons)
          row.createEl('p', { text: reason, cls: 'ripple-reason' });
        if (this.app.vault.getFileByPath(node.id)) {
          const open = row.createEl('button', { text: 'Open note' });
          open.addEventListener('click', () => {
            void this.app.workspace.openLinkText(node.id, '', true).catch(() => {
              new Notice('Could not open the note.');
            });
          });
        }
      }
    } catch (error) {
      // Last successful graph remains displayed; parse errors do not apply a partial query.
      this.errorEl.setText(error instanceof Error ? error.message : 'Filtering failed.');
    }
  }

  shutdown(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.request++;
    this.controller?.abort();
    this.session?.dispose();
    for (const adapter of this.adapters) adapter.dispose();
    this.closed = true;
  }

  override async onClose(): Promise<void> {
    this.shutdown();
  }
}
