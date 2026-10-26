import { FilterEngine } from '../core/filter-engine';
import type { FilterResult } from '../core/filter-engine';

/** Owns only Ripple's ephemeral preview. Never owns another plugin's visibility slot. */
export class StateManager {
  readonly engine: FilterEngine;
  private readonly original: ReadonlySet<string>;
  private current: FilterResult;
  private disposed = false;

  constructor(graph: unknown, originalIds?: ReadonlySet<string>) {
    this.engine = new FilterEngine(graph);
    const all = this.engine.filter('', 0);
    this.original = new Set(
      [...all.visibleIds].filter((id) => !originalIds || originalIds.has(id)),
    );
    this.current = { ...all, visibleIds: new Set(this.original), total: this.original.size };
  }

  apply(query: string, threshold: number): FilterResult {
    if (this.disposed) throw new Error('Preview session is closed. Refresh the graph.');
    const result = this.engine.filter(query, threshold);
    this.current = {
      ...result,
      total: this.original.size,
      visibleIds: new Set([...result.visibleIds].filter((id) => this.original.has(id))),
    };
    return this.snapshot();
  }

  clear(): FilterResult {
    return this.apply('', 0);
  }

  snapshot(): FilterResult {
    return { ...this.current, visibleIds: new Set(this.current.visibleIds) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }
}
