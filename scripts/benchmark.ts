import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { FilterEngine } from '../src/core/filter-engine';
import type { GraphNode } from '../src/core/types';

const observations = [];
for (const size of [1_000, 10_000, 50_000]) {
  const nodes: GraphNode[] = Array.from({ length: size }, (_, i) => ({
    id: `${i}.md`,
    title: i % 20 === 0 ? 'ocean' : `note ${i}`,
    aliases: [],
    tags: i % 7 === 0 ? ['water'] : [],
    metadata: [],
    content: '',
  }));
  const edges = nodes.flatMap((_, i) =>
    [1, 7, 23]
      .filter((delta) => i + delta < size)
      .map((delta) => ({ source: `${i}.md`, target: `${i + delta}.md` })),
  );
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  const engine = new FilterEngine({ nodes, edges });
  const loaded = performance.now();
  engine.filter('ocean', 50);
  const scored = performance.now();
  let checksum = 0;
  for (let threshold = 0; threshold <= 100; threshold++)
    checksum += engine.filter('ocean', threshold).visibleIds.size;
  const end = performance.now();
  observations.push({
    nodes: size,
    edges: edges.length,
    normalizeMs: loaded - start,
    scoreMs: scored - loaded,
    cached101ThresholdsMs: end - scored,
    heapDeltaMiB: (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2,
    checksum,
  });
}
await mkdir('reports', { recursive: true });
const result = {
  runtime: process.version,
  platform: `${process.platform}/${process.arch}`,
  timestamp: new Date().toISOString(),
  note: 'Single synthetic run, no forced GC; heap delta is an observation, not peak memory or an Obsidian UI benchmark.',
  observations,
};
await writeFile('reports/benchmark.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
