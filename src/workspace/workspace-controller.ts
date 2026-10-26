import { FilterEngine } from '../core/filter-engine';
import type {
  GraphSnapshot,
  FilterState,
  ViewMode,
  ViewState,
  VisibleGraph,
} from '../core/graph-model';
import { camera2D, VIEW_MODES } from '../core/graph-model';
import { analyzeGraph, seedPositions } from '../core/graph-algorithms';
import type { GraphAnalysis } from '../core/graph-algorithms';

/** One snapshot/scoring cache and one selection/filter for every renderer. */
export class WorkspaceController {
  snapshot: GraphSnapshot = { nodes: [], edges: [], revision: 0, updatedAt: 0 };
  analysis: GraphAnalysis = analyzeGraph(this.snapshot);
  private engine = new FilterEngine(this.snapshot);
  filter: FilterState = { query: '', threshold: 50, strategy: 'strict' };
  visible: VisibleGraph = { revision: 0, ids: new Set(), edges: [], scores: [], emptyQuery: true };
  mode: ViewMode = 'frontier';
  readonly selected = new Set<string>();
  readonly views = new Map<ViewMode, ViewState>(
    VIEW_MODES.map((mode) => [
      mode,
      {
        mode,
        positions: new Map(),
        camera: camera2D(),
        initialized: false,
        physics: mode === 'frontier',
      },
    ]),
  );
  private readonly listeners = new Set<() => void>();
  private closed = false;
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  private emit(): void {
    if (this.closed) throw new Error('Workspace is closed');
    for (const callback of this.listeners) callback();
  }
  update(snapshot: GraphSnapshot): void {
    if (this.closed) return;
    if (this.snapshot === snapshot) return;
    this.snapshot = snapshot;
    this.engine = new FilterEngine(snapshot);
    this.analysis = analyzeGraph(snapshot);
    const ids = new Set(snapshot.nodes.map((node) => node.id));
    for (const id of this.selected) if (!ids.has(id)) this.selected.delete(id);
    for (const [mode, state] of this.views) {
      const seeds = seedPositions(snapshot, mode, this.analysis);
      for (const id of state.positions.keys()) if (!ids.has(id)) state.positions.delete(id);
      for (const [id, position] of seeds)
        if (!state.positions.has(id)) state.positions.set(id, position);
    }
    this.compute();
    this.emit();
  }
  private compute(): void {
    const result = this.engine.filter(this.filter.query, this.filter.threshold);
    this.visible = {
      revision: this.snapshot.revision,
      ids: result.visibleIds,
      edges: this.snapshot.edges.filter(
        (edge) => result.visibleIds.has(edge.source) && result.visibleIds.has(edge.target),
      ),
      scores: result.scores,
      emptyQuery: result.emptyQuery,
    };
  }
  setFilter(query: string, threshold: number): void {
    // Parse/score before committing state, so invalid input cannot partially apply.
    this.engine.filter(query, threshold);
    this.filter = { query, threshold, strategy: 'strict' };
    this.compute();
    this.emit();
  }
  clear(): void {
    this.setFilter('', this.filter.threshold);
  }
  setMode(mode: ViewMode): void {
    if (!VIEW_MODES.includes(mode)) throw new Error('Unknown view mode');
    this.mode = mode;
    this.emit();
  }
  select(id: string | null, additive = false): void {
    if (!additive) this.selected.clear();
    if (id && this.analysis.adjacency.has(id)) {
      if (additive && this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.emit();
  }
  selectCommunity(id: string): void {
    this.selected.clear();
    for (const member of this.analysis.groups.get(this.analysis.communities.get(id) ?? '') ?? [])
      if (this.visible.ids.has(member)) this.selected.add(member);
    this.emit();
  }
  neighbors(id: string): readonly string[] {
    return [...(this.analysis.adjacency.get(id) ?? [])];
  }
  dispose(): void {
    this.closed = true;
    this.listeners.clear();
    this.selected.clear();
    for (const state of this.views.values()) state.positions.clear();
  }
}
