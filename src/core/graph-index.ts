import type { GraphEdge, GraphNode } from './types';
import { normalizeGraph } from './types';
import type { GraphSnapshot } from './graph-model';

/** Pure incremental store; only the Vault service reads host metadata. */
export class GraphIndex {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly outgoing = new Map<string, readonly GraphEdge[]>();
  private version = 0;
  private cached: GraphSnapshot | undefined;

  upsert(node: GraphNode): boolean {
    const clean = normalizeGraph({ nodes: [node], edges: [] }).graph.nodes[0];
    if (!clean) throw new Error('Invalid index node');
    const previous = this.nodes.get(node.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(clean)) return false;
    this.nodes.set(
      node.id,
      Object.freeze({
        ...clean,
        aliases: Object.freeze([...clean.aliases]),
        tags: Object.freeze([...clean.tags]),
        metadata: Object.freeze([...clean.metadata]),
      }),
    );
    this.version++;
    return true;
  }
  remove(id: string): void {
    if (!this.nodes.delete(id)) return;
    this.outgoing.delete(id);
    for (const [source, edges] of this.outgoing) {
      if (edges.some((edge) => edge.target === id))
        this.outgoing.set(
          source,
          edges.filter((edge) => edge.target !== id),
        );
    }
    this.version++;
  }
  setLinks(source: string, targets: Readonly<Record<string, number>>): void {
    const edges = Object.entries(targets)
      .filter(([target, weight]) => target !== source && Number.isFinite(weight) && weight > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([target, weight]): GraphEdge => ({
        source,
        target,
        weight,
        kind: 'link',
        directed: true,
      }));
    if (JSON.stringify(edges) === JSON.stringify(this.outgoing.get(source) ?? [])) return;
    this.outgoing.set(source, edges);
    this.version++;
  }
  reconcile(ids: ReadonlySet<string>): void {
    for (const id of this.nodes.keys()) if (!ids.has(id)) this.remove(id);
  }
  snapshot(): GraphSnapshot {
    if (this.cached?.revision === this.version) return this.cached;
    const nodes = [...this.nodes.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const edges = [...this.outgoing.values()]
      .flat()
      .filter((edge) => this.nodes.has(edge.source) && this.nodes.has(edge.target))
      .map((edge) => Object.freeze({ ...edge }));
    this.cached = Object.freeze({
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      revision: this.version,
      updatedAt: Date.now(),
    });
    return this.cached;
  }
}
