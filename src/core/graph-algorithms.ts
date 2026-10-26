import type { GraphData, GraphEdge } from './types';
import type { Position, ViewMode } from './graph-model';

export interface GraphAnalysis {
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>;
  readonly communities: ReadonlyMap<string, string>;
  readonly groups: ReadonlyMap<string, readonly string[]>;
  readonly bridges: readonly GraphEdge[];
  readonly importance: ReadonlyMap<string, number>;
}
export function analyzeGraph(graph: GraphData): GraphAnalysis {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const ids = [...adjacency.keys()].sort();
  const communities = new Map(
    ids.map((id) => [id, id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : id]),
  );
  // Bounded deterministic label propagation; not Louvain/modularity optimization.
  for (let pass = 0; pass < 8; pass++) {
    let changes = 0;
    for (const id of ids) {
      const counts = new Map<string, number>();
      for (const neighbor of adjacency.get(id)!) {
        const label = communities.get(neighbor)!;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      let best = communities.get(id)!;
      let highest = counts.get(best) ?? 0;
      for (const [label, count] of counts)
        if (count > highest || (count === highest && label < best)) {
          best = label;
          highest = count;
        }
      if (best !== communities.get(id)) {
        communities.set(id, best);
        changes++;
      }
    }
    if (!changes) break;
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const key = communities.get(id)!;
    const group = groups.get(key) ?? [];
    group.push(id);
    groups.set(key, group);
  }
  let ranks = new Map(ids.map((id) => [id, 1 / Math.max(1, ids.length)]));
  for (let pass = 0; pass < 12; pass++) {
    let dangling = 0;
    for (const id of ids) if (!adjacency.get(id)!.size) dangling += ranks.get(id)!;
    const next = new Map(ids.map((id) => [id, (0.15 + 0.85 * dangling) / Math.max(1, ids.length)]));
    for (const id of ids) {
      const neighbors = adjacency.get(id)!;
      const share = (0.85 * ranks.get(id)!) / Math.max(1, neighbors.size);
      for (const neighbor of neighbors) next.set(neighbor, next.get(neighbor)! + share);
    }
    ranks = next;
  }
  return {
    adjacency,
    communities,
    groups,
    bridges: graph.edges.filter(
      (edge) => communities.get(edge.source) !== communities.get(edge.target),
    ),
    importance: ranks,
  };
}
export function hashId(id: string): number {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return value >>> 0;
}
export function seedPositions(
  graph: GraphData,
  mode: ViewMode,
  analysis: GraphAnalysis,
): Map<string, Position> {
  const groups = [...analysis.groups.keys()].sort();
  const groupIndices = new Map(groups.map((key, i) => [key, i]));
  const localIndices = new Map<string, number>();
  const radius = Math.max(130, Math.sqrt(graph.nodes.length) * 24);
  return new Map(
    graph.nodes.map((node, i) => {
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      let x = Math.cos(angle) * Math.sqrt(i + 1) * 24;
      let y = Math.sin(angle) * Math.sqrt(i + 1) * 24;
      let z = 0;
      if (mode === 'dense') {
        const width = Math.ceil(Math.sqrt(graph.nodes.length));
        x = ((i % width) - width / 2) * 22;
        y = (Math.floor(i / width) - width / 2) * 22;
      }
      if (mode === 'cluster') {
        const group = analysis.communities.get(node.id)!;
        const index = groupIndices.get(group)!;
        const local = localIndices.get(group) ?? 0;
        localIndices.set(group, local + 1);
        const groupAngle = index * Math.PI * (3 - Math.sqrt(5));
        const distance = groups.length > 1 ? Math.sqrt(index + 1) * 240 : 0;
        x = Math.cos(groupAngle) * distance + Math.cos(local * 2.4) * Math.sqrt(local + 1) * 22;
        y = Math.sin(groupAngle) * distance + Math.sin(local * 2.4) * Math.sqrt(local + 1) * 22;
      }
      if (mode === 'galaxy') {
        const u = 1 - (2 * (i + 0.5)) / Math.max(1, graph.nodes.length);
        const radial = radius * (0.4 + 0.6 * (hashId(node.id) / 0xffffffff));
        const r = Math.sqrt(Math.max(0, 1 - u * u));
        x = Math.cos(angle) * r * radial;
        y = u * radial;
        z = Math.sin(angle) * r * radial;
      }
      return [node.id, { x, y, z, pinned: false }];
    }),
  );
}
export function convexHull(
  points: readonly { x: number; y: number }[],
): readonly { x: number; y: number }[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: typeof sorted) => {
    const hull: typeof sorted = [];
    for (const point of items) {
      while (hull.length >= 2 && cross(hull.at(-2)!, hull.at(-1)!, point) <= 0) hull.pop();
      hull.push(point);
    }
    hull.pop();
    return hull;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
