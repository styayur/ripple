import { Notice, Plugin } from 'obsidian';
import { RIPPLE_VIEW, RippleView } from './ui/ripple-view';

export default class RipplePlugin extends Plugin {
  override onload(): void {
    this.registerView(RIPPLE_VIEW, (leaf) => new RippleView(leaf));
    this.addCommand({
      id: 'open-filter',
      name: 'Open graph filter',
      callback: () => {
        void this.openView().catch(() => new Notice('Could not open the graph filter.'));
      },
    });
    this.addRibbonIcon('waves', 'Open graph filter', () => {
      void this.openView().catch(() => new Notice('Could not open the graph filter.'));
    });
  }

  private async openView(): Promise<void> {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(RIPPLE_VIEW)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing) await leaf.setViewState({ type: RIPPLE_VIEW, active: true });
    await workspace.revealLeaf(leaf);
  }

  override onunload(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(RIPPLE_VIEW)) {
      if (leaf.view instanceof RippleView) leaf.view.shutdown();
    }
  }
}
