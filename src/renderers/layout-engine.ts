import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

export interface LayoutNode extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  pinned: boolean;
}
export interface LayoutInput {
  nodes: LayoutNode[];
  edges: { source: string; target: string }[];
}
export function createSimulation(input: LayoutInput) {
  const nodes = input.nodes.map((node) => ({
    ...node,
    fx: node.pinned ? node.x : null,
    fy: node.pinned ? node.y : null,
  }));
  const links: SimulationLinkDatum<LayoutNode>[] = input.edges.map((edge) => ({ ...edge }));
  let seed = 42;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const simulation = forceSimulation<LayoutNode>(nodes)
    .stop()
    .randomSource(random)
    .force('charge', forceManyBody<LayoutNode>().strength(-65).distanceMax(600).theta(1.1))
    .force(
      'links',
      forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links)
        .id((node) => node.id)
        .distance(65)
        .strength(0.15),
    )
    .force('center', forceCenter(0, 0).strength(0.02))
    .alphaDecay(0.045);
  if (nodes.length <= 10_000) simulation.force('collision', forceCollide(7).iterations(1));
  return simulation;
}
