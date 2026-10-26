export interface GraphNode {
  readonly id: string;
  readonly path?: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly metadata: readonly string[];
  readonly content: string;
  readonly x?: number;
  readonly y?: number;
}

export interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly kind?: 'link';
  readonly weight?: number;
  readonly directed?: boolean;
}

export interface GraphData {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface Score {
  readonly id: string;
  readonly total: number;
  readonly lexical: number;
  readonly proximity: number;
  readonly degree: number;
  readonly exact: boolean;
  readonly excluded: boolean;
  readonly reasons: readonly string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** Defensive ingestion for vault metadata. Adapter wire responses are checked more strictly. */
export function normalizeGraph(raw: unknown): { graph: GraphData; warnings: string[] } {
  const warnings: string[] = [];
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  if (!isRecord(raw)) return { graph: { nodes: [], edges: [] }, warnings: ['Invalid graph'] };
  for (const value of Array.isArray(raw.nodes) ? raw.nodes : []) {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id || nodes.has(value.id)) {
      warnings.push('Skipped invalid or duplicate node');
      continue;
    }
    nodes.set(value.id, {
      id: value.id,
      path: typeof value.path === 'string' ? value.path : value.id,
      title: typeof value.title === 'string' ? value.title : value.id,
      aliases: strings(value.aliases),
      tags: strings(value.tags),
      metadata: strings(value.metadata),
      content: typeof value.content === 'string' ? value.content : '',
      ...(typeof value.x === 'number' && Number.isFinite(value.x) ? { x: value.x } : {}),
      ...(typeof value.y === 'number' && Number.isFinite(value.y) ? { y: value.y } : {}),
    });
  }
  for (const value of Array.isArray(raw.edges) ? raw.edges : []) {
    if (
      !isRecord(value) ||
      typeof value.source !== 'string' ||
      typeof value.target !== 'string' ||
      value.source === value.target ||
      !nodes.has(value.source) ||
      !nodes.has(value.target)
    ) {
      warnings.push('Skipped invalid edge');
      continue;
    }
    const pair =
      value.directed === true ? [value.source, value.target] : [value.source, value.target].sort();
    const key = JSON.stringify([value.directed === true, ...pair]);
    edges.set(key, {
      source: pair[0]!,
      target: pair[1]!,
      ...(value.directed === true ? { directed: true, kind: 'link' } : {}),
      ...(typeof value.weight === 'number' && Number.isFinite(value.weight) && value.weight > 0
        ? { weight: value.weight }
        : {}),
    });
  }
  return { graph: { nodes: [...nodes.values()], edges: [...edges.values()] }, warnings };
}
