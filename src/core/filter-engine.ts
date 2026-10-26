import { normalizeGraph } from './types';
import type { GraphData, Score } from './types';
import { parseQuery } from './query-parser';
import { scoreGraph } from './scoring';
import { thresholdIds } from './threshold';

export interface FilterResult {
  readonly visibleIds: ReadonlySet<string>;
  readonly scores: readonly Score[];
  readonly total: number;
  readonly emptyQuery: boolean;
}

export class FilterEngine {
  readonly graph: GraphData;
  readonly warnings: readonly string[];
  private cachedQuery = '';
  private cachedScores: readonly Score[] = [];
  private hasCache = false;

  constructor(raw: unknown) {
    const { graph, warnings } = normalizeGraph(raw);
    this.graph = graph;
    this.warnings = warnings;
  }

  filter(query: string, threshold: number): FilterResult {
    const parsed = parseQuery(query);
    if (!this.hasCache || this.cachedQuery !== query) {
      this.cachedScores = scoreGraph(this.graph, parsed);
      this.cachedQuery = query;
      this.hasCache = true;
    }
    // Validate threshold even when an empty query intentionally ignores it.
    const ids = thresholdIds(this.cachedScores, threshold);
    return {
      visibleIds: parsed.empty ? new Set(this.graph.nodes.map((node) => node.id)) : ids,
      scores: this.cachedScores,
      total: this.graph.nodes.length,
      emptyQuery: parsed.empty,
    };
  }
}
