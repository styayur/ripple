import type { GraphData } from '../core/types';

/** Deterministic preview coordinates depend on the original candidates, never the threshold. */
export function previewPositions(graph: GraphData): ReadonlyMap<string, { x: number; y: number }> {
  return new Map(
    graph.nodes.slice(0, 250).map((node, index) => {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radius = Math.sqrt((index + 0.5) / Math.max(1, Math.min(250, graph.nodes.length)));
      return [
        node.id,
        { x: 320 + Math.cos(angle) * radius * 285, y: 240 + Math.sin(angle) * radius * 205 },
      ];
    }),
  );
}

export function renderPreview(
  container: HTMLElement,
  graph: GraphData,
  visible: ReadonlySet<string>,
): void {
  container.empty();
  const doc = container.ownerDocument;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 640 480');
  svg.setAttribute('class', 'ripple-plot');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${visible.size} visible nodes. Fixed preview coordinates; use the results below to open notes.`,
  );
  const positions = previewPositions(graph);
  let drawnEdges = 0;
  for (const edge of graph.edges) {
    if (drawnEdges >= 600) break;
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target || !visible.has(edge.source) || !visible.has(edge.target)) continue;
    const line = doc.createElementNS(ns, 'line');
    for (const [name, value] of Object.entries({
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
    }))
      line.setAttribute(name, String(value));
    svg.appendChild(line);
    drawnEdges++;
  }
  for (const node of graph.nodes.slice(0, 250)) {
    if (!visible.has(node.id)) continue;
    const position = positions.get(node.id)!;
    const circle = doc.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(position.x));
    circle.setAttribute('cy', String(position.y));
    circle.setAttribute('r', '4');
    const title = doc.createElementNS(ns, 'title');
    title.textContent = node.title;
    circle.appendChild(title);
    svg.appendChild(circle);
  }
  container.appendChild(svg);
}
