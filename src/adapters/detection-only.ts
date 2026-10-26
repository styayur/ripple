import type { AdapterResult, Capability, GraphAdapter, PluginDiscovery } from './adapter-interface';
import { status } from './adapter-interface';
import type { GraphData } from '../core/types';

export interface TargetDescriptor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly viewType: string;
  readonly blocker: string;
}

export class DetectionOnlyAdapter implements GraphAdapter {
  protected closed = false;
  readonly id: string;
  readonly name: string;
  constructor(
    protected readonly discovery: PluginDiscovery,
    protected readonly target: TargetDescriptor,
  ) {
    this.id = target.id;
    this.name = target.name;
  }

  async inspect(): Promise<Capability> {
    if (this.closed) return status('closed', 'Adapter closed.');
    try {
      const probe = this.discovery.probe(this.id, this.target.viewType);
      if (!probe.available)
        return status(
          'unavailable',
          'Plugin discovery is unavailable. Standalone mode remains usable.',
        );
      if (!probe.installed) return status('missing', `${this.name} is not installed.`);
      if (!probe.enabled) return status('disabled', `${this.name} is disabled.`, probe.version);
      if (probe.version !== this.target.version)
        return status(
          'incompatible',
          `Audited only ${this.target.version}; this version needs a new audit.`,
          probe.version,
        );
      if (probe.viewCount === 0)
        return status(
          'no-view',
          'No open graph view. External filtering remains unsupported.',
          probe.version,
        );
      return status('unsupported', this.target.blocker, probe.version);
    } catch (error) {
      return status('error', error instanceof Error ? error.message : 'Discovery failed.');
    }
  }

  async readGraph(): Promise<AdapterResult<GraphData>> {
    return { ok: false, error: this.closed ? 'Adapter closed.' : this.target.blocker };
  }
  async applyVisible(_ids: ReadonlySet<string>): Promise<AdapterResult<void>> {
    return { ok: false, error: 'External filtering is unsupported. Use the standalone preview.' };
  }
  async clear(): Promise<AdapterResult<void>> {
    // No mutation was ever made, so no external state is owned or restored.
    return { ok: true };
  }
  dispose(): void {
    this.closed = true;
  }
}
