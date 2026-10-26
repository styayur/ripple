import { ItemView, Notice } from 'obsidian';
import type { WorkspaceLeaf, ViewStateResult } from 'obsidian';
import type { GraphRenderer } from '../renderers/renderer-interface';
import { createRenderer } from '../workspace/view-registry';
import type { WorkspaceController } from '../workspace/workspace-controller';
import { VIEW_MODES } from '../core/graph-model';
import type { ViewMode } from '../core/graph-model';
import type { VaultIndex } from '../services/vault-index';
import { isRecord } from '../core/types';

// Preserve the 0.1 view identifier so restored leaves upgrade in place.
export const RIPPLE_WORKSPACE = 'ripple-graph-filter-view';
export const MODE_NAMES: Record<ViewMode, string> = {
  frontier: 'Frontier',
  dense: 'Dense',
  cluster: 'Cluster',
  galaxy: 'Galaxy',
};
export class RippleWorkspaceView extends ItemView {
  private renderer: GraphRenderer | undefined;
  private renderedMode: ViewMode | undefined;
  private query!: HTMLInputElement;
  private threshold!: HTMLInputElement;
  private modeSelect!: HTMLSelectElement;
  private count!: HTMLElement;
  private indexStatus!: HTMLElement;
  private error!: HTMLElement;
  private hint!: HTMLElement;
  private stage!: HTMLElement;
  private inspector!: HTMLElement;
  private nodeList!: HTMLSelectElement;
  private bodyToggle!: HTMLInputElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly unsubscribers: (() => void)[] = [];
  private opened = false;
  private closed = false;
  private failureMode: ViewMode | undefined;
  private readonly controller: WorkspaceController;
  private readonly index: VaultIndex;
  constructor(leaf: WorkspaceLeaf, controller: WorkspaceController, index: VaultIndex) {
    super(leaf);
    this.controller = controller;
    this.index = index;
    this.register(() => this.shutdown());
  }
  override getViewType(): string {
    return RIPPLE_WORKSPACE;
  }
  override getDisplayText(): string {
    return 'Ripple';
  }
  override getIcon(): string {
    return 'waves';
  }
  override async onOpen(): Promise<void> {
    this.opened = true;
    this.contentEl.empty();
    this.contentEl.addClass('ripple-workspace');
    const toolbar = this.contentEl.createDiv({
      cls: 'ripple-toolbar',
      attr: { role: 'toolbar', 'aria-label': 'Graph navigation' },
    });
    toolbar.createSpan({ text: 'Ripple', cls: 'ripple-wordmark' });
    this.modeSelect = toolbar.createEl('select', { attr: { 'aria-label': 'Graph mode' } });
    for (const mode of VIEW_MODES)
      this.modeSelect.createEl('option', { value: mode, text: `${MODE_NAMES[mode]} View` });
    this.modeSelect.addEventListener('change', () => {
      const mode = this.modeSelect.value as ViewMode;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = undefined;
        try {
          this.controller.setFilter(this.query.value, Number(this.threshold.value));
        } catch (error) {
          this.error.setText(String(error));
        }
      }
      this.failureMode = undefined;
      this.controller.setMode(mode);
    });
    this.button(toolbar, 'Zoom in', () => this.renderer?.zoom(1.25));
    this.button(toolbar, 'Zoom out', () => this.renderer?.zoom(0.8));
    this.button(toolbar, 'Fit graph', () => this.renderer?.fit());
    this.button(toolbar, 'Reset view', () => this.renderer?.reset());
    this.button(toolbar, 'Refresh index', () => {
      void this.index.refresh(true);
    });
    const filters = this.contentEl.createDiv({ cls: 'ripple-filterbar' });
    const queryLabel = filters.createEl('label', { cls: 'ripple-query-label' });
    queryLabel.createSpan({ text: 'Query' });
    this.query = queryLabel.createEl('input', {
      type: 'text',
      placeholder: 'Words, title:, tag:, path:, -exclude',
      attr: { 'aria-label': 'Graph query', maxlength: '512' },
    });
    const rangeLabel = filters.createEl('label', { cls: 'ripple-range-label' });
    rangeLabel.createSpan({ text: 'Relevance threshold' });
    this.threshold = rangeLabel.createEl('input', {
      type: 'range',
      attr: { min: '0', max: '100', step: '1', 'aria-label': 'Relevance threshold percent' },
    });
    const percent = rangeLabel.createEl('output');
    const schedule = () => {
      const query = this.query.value;
      const threshold = Number(this.threshold.value);
      percent.setText(`${threshold}%`);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        try {
          this.controller.setFilter(query, threshold);
          this.error.empty();
        } catch (error) {
          this.error.setText(error instanceof Error ? error.message : 'Invalid query');
        }
      }, 100);
    };
    this.query.addEventListener('input', schedule);
    this.threshold.addEventListener('input', schedule);
    this.button(filters, 'Clear filters', () => {
      if (this.timer) clearTimeout(this.timer);
      this.query.value = '';
      this.error.empty();
      this.controller.clear();
    });
    const advanced = this.contentEl.createEl('details', { cls: 'ripple-advanced' });
    advanced.createEl('summary', { text: 'Index options' });
    const bodyLabel = advanced.createEl('label');
    this.bodyToggle = bodyLabel.createEl('input', {
      type: 'checkbox',
      attr: { 'aria-label': 'Include note text' },
    });
    bodyLabel.appendText('Include note text locally (32,768 characters/note, 8 million total).');
    this.bodyToggle.addEventListener('change', () => {
      void this.index.setBodyIndex(this.bodyToggle.checked);
    });
    const status = this.contentEl.createDiv({ cls: 'ripple-statusbar' });
    this.count = status.createSpan({ attr: { role: 'status', 'aria-live': 'polite' } });
    this.indexStatus = status.createSpan({ cls: 'ripple-index-status' });
    this.error = this.contentEl.createDiv({ cls: 'ripple-error', attr: { role: 'alert' } });
    const body = this.contentEl.createDiv({ cls: 'ripple-workspace-body' });
    this.stage = body.createDiv({ cls: 'ripple-stage' });
    const details = body.createEl('details', { cls: 'ripple-inspector' });
    details.createEl('summary', { text: 'Node details' });
    const nodeLabel = details.createEl('label');
    nodeLabel.createSpan({ text: 'Locate a visible node' });
    this.nodeList = nodeLabel.createEl('select', { attr: { 'aria-label': 'Locate visible node' } });
    this.nodeList.addEventListener('change', () => {
      if (this.nodeList.value) {
        this.controller.select(this.nodeList.value);
        this.renderer?.focus(this.nodeList.value);
      }
    });
    this.inspector = details.createDiv();
    this.hint = this.contentEl.createEl('p', { cls: 'ripple-navigation-hint' });
    this.unsubscribers.push(
      this.controller.subscribe(() => {
        this.update();
        percent.setText(`${this.controller.filter.threshold}%`);
      }),
    );
    this.unsubscribers.push(
      this.index.subscribe((_snapshot, state) => {
        if (!this.closed) {
          this.bodyToggle.checked = this.index.bodyEnabled;
          this.indexStatus.setText(`${state.message} · ${state.durationMs.toFixed(0)} ms`);
          this.indexStatus.setAttribute('aria-busy', String(state.busy));
        }
      }),
    );
    this.registerEvent(this.app.workspace.on('css-change', () => this.renderer?.update()));
    this.update();
    percent.setText(`${this.controller.filter.threshold}%`);
    await this.index.refresh();
  }
  private button(container: HTMLElement, text: string, callback: () => void): HTMLButtonElement {
    const button = container.createEl('button', { text, attr: { 'aria-label': text } });
    button.addEventListener('click', callback);
    return button;
  }
  private update(): void {
    if (this.closed || !this.opened) return;
    const controller = this.controller;
    if (!this.timer) {
      this.query.value = controller.filter.query;
      this.threshold.value = String(controller.filter.threshold);
    }
    this.threshold.disabled = !this.query.value.trim();
    this.modeSelect.value = controller.mode;
    this.count.setText(
      `${controller.visible.ids.size} / ${controller.snapshot.nodes.length} nodes · ${controller.visible.edges.length} visible links · revision ${controller.snapshot.revision}`,
    );
    if (this.renderedMode !== controller.mode && this.failureMode !== controller.mode) {
      this.renderer?.dispose();
      this.renderer = undefined;
      this.stage.empty();
      try {
        const renderer = createRenderer(controller.mode, controller, {
          pick: (id, additive) => controller.select(id, additive),
          open: (id) => this.openNote(id),
          error: (message) => this.error.setText(message),
          notice: (message) => this.hint.setText(message),
        });
        this.renderer = renderer;
        renderer.mount(this.stage);
        this.renderedMode = controller.mode;
        this.error.empty();
        this.failureMode = undefined;
      } catch (error) {
        this.renderer?.dispose();
        this.renderer = undefined;
        this.renderedMode = undefined;
        this.failureMode = controller.mode;
        this.error.setText(
          error instanceof Error ? error.message : 'Graph renderer failed to initialize.',
        );
        this.stage.createEl('p', {
          text: 'This mode could not start. Choose a different mode from the toolbar.',
          cls: 'ripple-render-error',
        });
      }
    }
    this.renderer?.update();
    this.hint.setText(
      controller.mode === 'galaxy'
        ? 'True 3D: drag to orbit · right drag to pan · wheel to zoom. Up to 100,000 links; 5,000 above 10,000 visible nodes.'
        : controller.mode === 'dense'
          ? 'Dense: batched points and grid layout. Edges hidden below 0.3×, up to 30,000 edges and 120 labels. All nodes remain candidates.'
          : controller.mode === 'cluster'
            ? 'Communities: deterministic label propagation. Up to 200 hulls; dashed lines cross communities. Drag to pan, wheel to zoom.'
            : 'Frontier: force layout runs in a worker. Drag a node to pin it; drag background to pan. Ctrl-click selects without opening.',
    );
    const selected = [...controller.selected][0];
    const oldNode = this.nodeList.value;
    this.nodeList.empty();
    this.nodeList.createEl('option', { text: 'Choose a node (first 200 visible)', value: '' });
    for (const node of controller.snapshot.nodes
      .filter((node) => controller.visible.ids.has(node.id))
      .slice(0, 200))
      this.nodeList.createEl('option', { value: node.id, text: node.title });
    this.nodeList.value = selected && controller.visible.ids.has(selected) ? selected : oldNode;
    this.inspector.empty();
    if (!selected) {
      this.inspector.createEl('p', { text: 'Select a node in the graph or the list.' });
      return;
    }
    const node = controller.snapshot.nodes.find((node) => node.id === selected);
    if (!node) return;
    const score = controller.visible.scores.find((score) => score.id === selected);
    this.inspector.createEl('p', { text: node.title, cls: 'ripple-node-title' });
    this.inspector.createEl('p', { text: node.path ?? node.id, cls: 'ripple-node-path' });
    if (!controller.visible.ids.has(selected))
      this.inspector.createEl('p', { text: 'Selected node is currently filtered out.' });
    this.inspector.createEl('p', {
      text: `${controller.selected.size} selected · ${controller.neighbors(selected).length} neighbors · PageRank ${(controller.analysis.importance.get(selected) ?? 0).toFixed(5)}`,
    });
    if (score) {
      this.inspector.createEl('p', {
        text: `Score ${(score.total * 100).toFixed(1)}% · lexical ${score.lexical.toFixed(3)} · proximity ${score.proximity.toFixed(3)} · degree ${score.degree.toFixed(3)}`,
      });
      for (const reason of score.reasons) this.inspector.createEl('p', { text: reason });
    }
    this.button(this.inspector, 'Open selected note', () => this.openNote(selected));
    const pin = this.button(this.inspector, 'Toggle pin', () => {
      this.renderer?.pin(selected);
      this.update();
    });
    pin.disabled = controller.mode !== 'frontier';
    this.button(this.inspector, 'Select community', () => controller.selectCommunity(selected));
    this.inspector.createEl('p', { text: 'Linked notes (first 100)' });
    for (const id of controller.neighbors(selected).slice(0, 100)) {
      const button = this.button(this.inspector, id, () => {
        controller.select(id);
        this.renderer?.focus(id);
      });
      button.disabled = !controller.visible.ids.has(id);
    }
  }
  private openNote(id: string): void {
    const file = this.app.vault.getFileByPath(id);
    if (!file) {
      this.error.setText('This note no longer exists. Refresh the index.');
      return;
    }
    void this.app.workspace
      .getLeaf('split')
      .openFile(file, { active: true })
      .catch(() => new Notice('Could not open this note.'));
  }
  override getState(): Record<string, unknown> {
    return {
      schema: 2,
      mode: this.controller.mode,
      cameras: Object.fromEntries(
        [...this.controller.views].map(([mode, state]) => [mode, { ...state.camera }]),
      ),
      frontierPins: [...this.controller.views.get('frontier')!.positions]
        .filter(([, position]) => position.pinned)
        .map(([id, position]) => ({ id, ...position })),
    };
  }
  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (isRecord(state) && VIEW_MODES.includes(state.mode as ViewMode)) {
      this.controller.mode = state.mode as ViewMode;
      for (const mode of VIEW_MODES) {
        const camera = isRecord(state.cameras)
          ? state.cameras[mode]
          : mode === this.controller.mode
            ? state.camera
            : undefined;
        if (
          isRecord(camera) &&
          ['x', 'y', 'z', 'zoom', 'targetX', 'targetY', 'targetZ'].every(
            (key) => typeof camera[key] === 'number' && Number.isFinite(camera[key]),
          ) &&
          (camera.zoom as number) > 0
        ) {
          Object.assign(this.controller.views.get(mode)!.camera, camera);
          this.controller.views.get(mode)!.initialized = true;
        }
      }
      if (Array.isArray(state.frontierPins))
        for (const pin of state.frontierPins) {
          if (
            isRecord(pin) &&
            typeof pin.id === 'string' &&
            ['x', 'y', 'z'].every(
              (key) => typeof pin[key] === 'number' && Number.isFinite(pin[key]),
            )
          ) {
            this.controller.views.get('frontier')!.positions.set(pin.id, {
              x: pin.x as number,
              y: pin.y as number,
              z: pin.z as number,
              pinned: true,
            });
          }
        }
    }
    await super.setState(state, result);
    this.renderer?.dispose();
    this.renderer = undefined;
    this.renderedMode = undefined;
    this.failureMode = undefined;
    this.update();
  }
  shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.renderer?.dispose();
    this.renderer = undefined;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
  }
  override async onClose(): Promise<void> {
    this.shutdown();
  }
}
