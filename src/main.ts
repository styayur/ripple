import { apiVersion, Notice, Plugin } from 'obsidian';
import { RIPPLE_WORKSPACE, RippleWorkspaceView } from './ui/workspace-view';
import { WorkspaceController } from './workspace/workspace-controller';
import { VaultIndex } from './services/vault-index';

export default class RipplePlugin extends Plugin {
  readonly hostVersion = apiVersion;
  readonly controller = new WorkspaceController();
  private index!: VaultIndex;
  override onload(): void {
    this.index = new VaultIndex(this.app);
    this.index.start(this);
    this.register(this.index.subscribe((snapshot) => this.controller.update(snapshot)));
    this.registerView(
      RIPPLE_WORKSPACE,
      (leaf) => new RippleWorkspaceView(leaf, this.controller, this.index),
    );
    this.addCommand({
      id: 'open-filter',
      name: 'Open graph workspace',
      callback: () => {
        void this.openView().catch(() => new Notice('Could not open the graph filter.'));
      },
    });
    this.addRibbonIcon('waves', 'Open graph workspace', () => {
      void this.openView().catch(() => new Notice('Could not open the graph filter.'));
    });
    this.app.workspace.onLayoutReady(() => {
      void this.index.refresh(true);
    });
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && this.controller.analysis.adjacency.has(file.path))
          this.controller.select(file.path);
      }),
    );
  }

  private async openView(): Promise<void> {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(RIPPLE_WORKSPACE)[0];
    const leaf = existing ?? workspace.getLeaf('tab');
    if (!leaf) return;
    if (!existing) await leaf.setViewState({ type: RIPPLE_WORKSPACE, active: true });
    await workspace.revealLeaf(leaf);
  }

  override onunload(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(RIPPLE_WORKSPACE)) {
      if (leaf.view instanceof RippleWorkspaceView) leaf.view.shutdown();
    }
    this.index.dispose();
    this.controller.dispose();
  }
}
