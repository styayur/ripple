import { createSimulation } from './layout-engine';
import type { LayoutInput } from './layout-engine';

type Message =
  | { type: 'start'; graph: LayoutInput }
  | { type: 'pin'; id: string; x: number; y: number; pinned: boolean }
  | { type: 'stop' };
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<Message>) => void;
  postMessage(value: unknown, transfer?: Transferable[]): void;
};
let simulation: ReturnType<typeof createSimulation> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
function stop() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  simulation?.stop();
}
function step() {
  if (!simulation) return;
  simulation.tick(2);
  const nodes = simulation.nodes();
  const positions = new Float32Array(nodes.length * 2);
  nodes.forEach((node, i) => {
    positions[i * 2] = node.x ?? 0;
    positions[i * 2 + 1] = node.y ?? 0;
  });
  const done = simulation.alpha() < 0.015;
  scope.postMessage({ positions, done }, [positions.buffer]);
  if (!done) timer = setTimeout(step, 25);
}
scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'stop') {
    stop();
    return;
  }
  if (message.type === 'start') {
    stop();
    simulation = createSimulation(message.graph);
    step();
    return;
  }
  const node = simulation?.nodes().find((item) => item.id === message.id);
  if (node && simulation) {
    node.x = message.x;
    node.y = message.y;
    node.fx = message.pinned ? message.x : null;
    node.fy = message.pinned ? message.y : null;
    simulation.alpha(0.25);
    if (timer) clearTimeout(timer);
    step();
  }
};
