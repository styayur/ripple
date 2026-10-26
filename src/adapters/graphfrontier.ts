import { DetectionOnlyAdapter } from './detection-only';
import type { AdapterResult, Capability, PluginDiscovery } from './adapter-interface';
import { failure, status } from './adapter-interface';
import { isRecord, normalizeGraph } from '../core/types';
import type { GraphData } from '../core/types';

interface LocalApi {
  runTool(
    method: string,
    args: Record<string, unknown>,
    readOnly: boolean,
    signal: AbortSignal,
  ): unknown;
}
interface Ref {
  viewId: string;
  contextToken: string;
}

function ref(value: unknown): Ref {
  if (
    !isRecord(value) ||
    typeof value.viewId !== 'string' ||
    !value.viewId ||
    typeof value.contextToken !== 'string' ||
    !value.contextToken
  )
    throw new Error('Invalid graph reference.');
  return { viewId: value.viewId, contextToken: value.contextToken };
}
function sameRef(value: unknown, expected: Ref): void {
  const actual = ref(value);
  if (actual.viewId !== expected.viewId || actual.contextToken !== expected.contextToken) {
    throw new Error('Graph changed during snapshot. Refresh to retry.');
  }
}

export class GraphFrontierAdapter extends DetectionOnlyAdapter {
  private readonly cancellation = new AbortController();
  constructor(discovery: PluginDiscovery) {
    super(discovery, {
      id: 'graphfrontier',
      name: 'GraphFrontier',
      version: '0.8.6',
      viewType: 'graphfrontier-view',
      blocker:
        'The exact subset is shared and saved with layouts. Only read-only snapshots are available.',
    });
  }

  private api(): LocalApi {
    if (this.closed) throw new Error('Adapter closed.');
    const probe = this.discovery.probe(this.id, this.target.viewType);
    if (
      !probe.available ||
      !probe.installed ||
      !probe.enabled ||
      probe.version !== this.target.version
    ) {
      throw new Error('GraphFrontier is unavailable or its version is incompatible.');
    }
    if (
      !isRecord(probe.instance) ||
      !isRecord(probe.instance.api) ||
      typeof probe.instance.api.runTool !== 'function'
    ) {
      throw new Error('Documented GraphFrontier api.runTool is unavailable.');
    }
    return probe.instance.api as unknown as LocalApi;
  }

  private async call(
    api: LocalApi,
    method: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.api() !== api) throw new Error('GraphFrontier was reloaded. Refresh to retry.');
    const result: unknown = await api.runTool(method, args, true, this.cancellation.signal);
    if (this.closed || this.api() !== api)
      throw new Error('Adapter closed or target was reloaded.');
    return result;
  }

  private async views(api: LocalApi): Promise<{ ref: Ref; label: string }[]> {
    const value = await this.call(api, 'listViews', {});
    if (
      !isRecord(value) ||
      value.apiVersion !== 1 ||
      value.pluginVersion !== this.target.version ||
      !Array.isArray(value.views)
    ) {
      throw new Error('Incompatible GraphFrontier API response.');
    }
    return value.views.map((view) => ({
      ref: ref(view),
      label: isRecord(view) && typeof view.layout === 'string' ? view.layout : 'Graph view',
    }));
  }

  override async inspect(): Promise<Capability> {
    const base = await super.inspect();
    if (base.state !== 'unsupported') return base;
    try {
      const views = await this.views(this.api());
      if (!views.length)
        return status('no-view', 'Open a GraphFrontier graph, then refresh.', this.target.version);
      return {
        ...base,
        state: 'read-only',
        read: true,
        views: views.map((view) => ({ id: view.ref.viewId, label: view.label })),
      };
    } catch (error) {
      return status('error', failure(error).error ?? 'API failed.', this.target.version);
    }
  }

  override async readGraph(viewId?: string): Promise<AdapterResult<GraphData>> {
    try {
      const api = this.api();
      const views = await this.views(api);
      if (!views.length) throw new Error('No open GraphFrontier view.');
      if (!viewId && views.length !== 1) throw new Error('Select a specific GraphFrontier view.');
      const chosen = viewId ? views.find((view) => view.ref.viewId === viewId) : views[0];
      if (!chosen) throw new Error('Selected graph view no longer exists.');
      const reference = ref(await this.call(api, 'getState', { viewId: chosen.ref.viewId }));
      if (reference.viewId !== chosen.ref.viewId)
        throw new Error('GraphFrontier returned a different view.');
      const nodes: Record<string, unknown>[] = [];
      const edges: Record<string, unknown>[] = [];
      const ids = new Set<string>();
      for (const kind of ['nodes', 'edges'] as const) {
        let offset = 0;
        let done = false;
        for (let page = 0; page < 2000; page++) {
          const response = await this.call(api, 'getGraph', {
            ...reference,
            kind,
            offset,
            limit: 500,
            visibleOnly: true,
          });
          sameRef(response, reference);
          if (
            !isRecord(response) ||
            response.kind !== kind ||
            !Array.isArray(response.items) ||
            response.items.length > 500
          ) {
            throw new Error('Malformed graph page.');
          }
          for (const item of response.items) {
            if (!isRecord(item) || item.visible !== true)
              throw new Error('Malformed visible item.');
            if (kind === 'nodes') {
              if (
                typeof item.id !== 'string' ||
                !item.id ||
                ids.has(item.id) ||
                typeof item.label !== 'string' ||
                !['note', 'attachment', 'gravity', 'subgraph'].includes(String(item.type)) ||
                typeof item.x !== 'number' ||
                !Number.isFinite(item.x) ||
                typeof item.y !== 'number' ||
                !Number.isFinite(item.y) ||
                typeof item.pinned !== 'boolean'
              ) {
                throw new Error('Malformed graph node.');
              }
              ids.add(item.id);
              nodes.push({ id: item.id, title: item.label, x: item.x, y: item.y });
            } else {
              if (
                typeof item.source !== 'string' ||
                typeof item.target !== 'string' ||
                !ids.has(item.source) ||
                !ids.has(item.target)
              )
                throw new Error('Malformed graph edge.');
              edges.push({ source: item.source, target: item.target });
            }
          }
          if (nodes.length + edges.length > 500_000)
            throw new Error('Graph exceeds the snapshot safety limit.');
          if (response.nextOffset === null) {
            done = true;
            break;
          }
          if (
            !Number.isSafeInteger(response.nextOffset) ||
            (response.nextOffset as number) <= offset
          )
            throw new Error('Graph pagination did not advance.');
          offset = response.nextOffset as number;
        }
        if (!done) throw new Error('Too many graph pages.');
      }
      sameRef(await this.call(api, 'getState', { viewId: reference.viewId }), reference);
      // Visible-only pagination is not an atomic visibility snapshot. Ensure visible IDs
      // have not changed during the read by doing a second bounded node pass.
      const check = new Set<string>();
      let offset = 0;
      let complete = false;
      for (let page = 0; page < 2000; page++) {
        const value = await this.call(api, 'getGraph', {
          ...reference,
          kind: 'nodes',
          offset,
          limit: 500,
          visibleOnly: true,
        });
        sameRef(value, reference);
        if (
          !isRecord(value) ||
          value.kind !== 'nodes' ||
          !Array.isArray(value.items) ||
          value.items.length > 500
        )
          throw new Error('Invalid verification page.');
        for (const item of value.items) {
          if (!isRecord(item) || typeof item.id !== 'string' || item.visible !== true)
            throw new Error('Invalid verification node.');
          check.add(item.id);
        }
        if (value.nextOffset === null) {
          complete = true;
          break;
        }
        if (!Number.isSafeInteger(value.nextOffset) || (value.nextOffset as number) <= offset)
          throw new Error('Invalid verification pagination.');
        offset = value.nextOffset as number;
      }
      if (!complete || ids.size !== check.size || [...ids].some((id) => !check.has(id)))
        throw new Error('Visibility changed during snapshot. Refresh to retry.');
      sameRef(await this.call(api, 'getState', { viewId: reference.viewId }), reference);
      return { ok: true, value: normalizeGraph({ nodes, edges }).graph };
    } catch (error) {
      return failure(error);
    }
  }

  override dispose(): void {
    this.cancellation.abort();
    super.dispose();
  }
}
