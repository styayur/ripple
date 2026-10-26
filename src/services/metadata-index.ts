import { getAllTags, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { isRecord, normalizeGraph, strings } from '../core/types';
import type { GraphData, GraphNode } from '../core/types';

export interface IndexResult {
  graph: GraphData;
  warnings: readonly string[];
}
export class MetadataIndex {
  private generation = 0;
  constructor(private readonly app: App) {}
  invalidate(): void {
    this.generation++;
  }

  async build(includeContent: boolean, signal: AbortSignal): Promise<IndexResult> {
    const generation = this.generation;
    const files = this.app.vault
      .getMarkdownFiles()
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    if (files.length > 50_000) throw new Error('This alpha indexes at most 50,000 notes.');
    const nodes: GraphNode[] = [];
    const warnings: string[] = [];
    let budget = 8_000_000;
    let truncated = false;
    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) throw new Error('Index cancelled.');
      if (generation !== this.generation)
        throw new Error('Vault changed while indexing. Refresh to retry.');
      const file = files[i]!;
      if (!(file instanceof TFile)) continue;
      const cached = this.app.metadataCache.getFileCache(file);
      const frontmatter: unknown = cached?.frontmatter;
      const props = isRecord(frontmatter) ? frontmatter : {};
      const metadata = Object.entries(props)
        .filter(([key]) => key !== 'position')
        .slice(0, 100)
        .flatMap(([key, value]) => {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
            return [`${key} ${String(value)}`];
          return strings(value).map((text) => `${key} ${text}`);
        });
      let content = '';
      if (includeContent && budget > 0) {
        try {
          const text = await this.app.vault.cachedRead(file);
          content = text.slice(0, Math.min(32_768, budget));
          budget -= content.length;
          truncated ||= text.length > content.length;
        } catch {
          warnings.push(`Could not read ${file.path}; metadata only.`);
        }
      } else if (includeContent) truncated = true;
      nodes.push({
        id: file.path,
        title: file.basename,
        aliases: strings(props.aliases ?? props.alias),
        tags: cached ? (getAllTags(cached) ?? []) : [],
        metadata,
        content,
      });
      if (i % 50 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (signal.aborted || generation !== this.generation)
      throw new Error('Index invalidated. Refresh to retry.');
    const edges = Object.entries(this.app.metadataCache.resolvedLinks).flatMap(([source, links]) =>
      Object.keys(links).map((target) => ({ source, target })),
    );
    if (truncated)
      warnings.push('Body index limited to 32,768 characters per note and 8,000,000 total.');
    const normalized = normalizeGraph({ nodes, edges });
    return { graph: normalized.graph, warnings: [...warnings, ...normalized.warnings] };
  }
}
