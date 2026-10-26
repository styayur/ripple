import type { GraphData } from '../core/types';

export type AdapterState =
  | 'unavailable'
  | 'missing'
  | 'disabled'
  | 'incompatible'
  | 'no-view'
  | 'unsupported'
  | 'read-only'
  | 'error'
  | 'closed';
export interface Capability {
  readonly state: AdapterState;
  readonly message: string;
  readonly installedVersion?: string;
  readonly read: boolean;
  readonly apply: false;
  readonly restore: false;
  readonly views: readonly { id: string; label: string }[];
}
export interface AdapterResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: string;
}
export interface PluginProbe {
  readonly available: boolean;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly version: string | undefined;
  readonly instance: unknown;
  readonly viewCount: number;
}
export interface PluginDiscovery {
  probe(id: string, viewType: string): PluginProbe;
}
export interface GraphAdapter {
  readonly id: string;
  readonly name: string;
  inspect(): Promise<Capability>;
  readGraph(viewId?: string): Promise<AdapterResult<GraphData>>;
  applyVisible(ids: ReadonlySet<string>): Promise<AdapterResult<void>>;
  clear(): Promise<AdapterResult<void>>;
  dispose(): void;
}

export function failure<T>(error: unknown): AdapterResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function status(state: AdapterState, message: string, version?: string): Capability {
  return {
    state,
    message,
    read: false,
    apply: false,
    restore: false,
    views: [],
    ...(version === undefined ? {} : { installedVersion: version }),
  };
}
