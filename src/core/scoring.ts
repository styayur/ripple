import type { GraphData, GraphNode, Score } from './types';
import type { ParsedQuery, QueryTerm } from './query-parser';
import { normalizeText } from './query-parser';

function quality(text: string, query: string): number {
  const value = normalizeText(text);
  if (value === query) return 1;
  if (value.split(/[^\p{L}\p{N}_#/-]+/u).includes(query)) return 0.9;
  return value.includes(query) ? 0.6 : 0;
}

function match(node: GraphNode, term: QueryTerm): { value: number; field: string } {
  const choices: [string, readonly string[], number][] = [
    ['title', [node.title], 1],
    ['alias', node.aliases, 0.95],
    ['tag', node.tags.map((tag) => tag.replace(/^#/, '')), 0.9],
    ['path', [node.id], 0.55],
    ['metadata', node.metadata, 0.45],
    ['content', [node.content], 0.35],
  ];
  let best = { value: 0, field: 'none' };
  for (const [field, texts, weight] of choices) {
    if (term.field !== 'text' && term.field !== field) continue;
    for (const text of texts) {
      const value = quality(text, term.value) * weight;
      if (value > best.value) best = { value, field };
    }
  }
  return best;
}

export function scoreGraph(graph: GraphData, query: ParsedQuery): readonly Score[] {
  const positives = query.terms.filter((term) => !term.exclude);
  const negatives = query.terms.filter((term) => term.exclude);
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const base = graph.nodes.map((node) => {
    const matches = positives.map((term) => match(node, term));
    const lexical = matches.length
      ? matches.reduce((sum, item) => sum + item.value, 0) / matches.length
      : 1;
    const excluded = negatives.some((term) => match(node, term).value > 0);
    const exact =
      positives.length > 0 &&
      positives.every(
        (term) =>
          (term.field === 'text' || term.field === 'title' || term.field === 'alias') &&
          ((term.field !== 'alias' && normalizeText(node.title) === term.value) ||
            (term.field !== 'title' &&
              node.aliases.some((alias) => normalizeText(alias) === term.value))),
      );
    return {
      node,
      lexical,
      excluded,
      exact,
      reasons: matches.map(
        (item, i) => `${positives[i]!.value}: ${item.field} ${item.value.toFixed(3)}`,
      ),
    };
  });
  // Multi-source BFS, fixed by the query, independent of the slider.
  const distance = new Map<string, number>();
  const queue: string[] = [];
  for (const item of base) {
    if (!item.excluded && item.lexical >= 0.6 && positives.length) {
      distance.set(item.node.id, 0);
      queue.push(item.node.id);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const depth = distance.get(id)!;
    if (depth >= 3) continue;
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!distance.has(neighbor)) {
        distance.set(neighbor, depth + 1);
        queue.push(neighbor);
      }
    }
  }
  let maxDegree = 1;
  for (const neighbors of adjacency.values()) maxDegree = Math.max(maxDegree, neighbors.size);
  return base.map(({ node, lexical, exact, excluded, reasons }) => {
    const depth = distance.get(node.id);
    const proximity = depth === undefined ? 0 : 1 / (depth + 1);
    const degree = Math.log1p(adjacency.get(node.id)?.size ?? 0) / Math.log1p(maxDegree);
    const total = excluded
      ? 0
      : positives.length === 0 || exact
        ? 1
        : Math.min(0.999999, 0.85 * lexical + 0.1 * proximity + 0.05 * degree);
    return { id: node.id, total, lexical, proximity, degree, exact, excluded, reasons };
  });
}
