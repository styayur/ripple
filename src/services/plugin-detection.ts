import type { App } from 'obsidian';
import { isRecord } from '../core/types';
import type { PluginDiscovery, PluginProbe } from '../adapters/adapter-interface';

/** Read-only, guarded Obsidian internal registry shim. See the compatibility audit. */
export class ObsidianPluginDiscovery implements PluginDiscovery {
  constructor(private readonly app: App) {}
  probe(id: string, viewType: string): PluginProbe {
    const app = this.app as unknown;
    const fallback: PluginProbe = {
      available: false,
      installed: false,
      enabled: false,
      version: undefined,
      instance: undefined,
      viewCount: 0,
    };
    if (
      !isRecord(app) ||
      !isRecord(app.plugins) ||
      !isRecord(app.plugins.manifests) ||
      typeof app.plugins.getPlugin !== 'function'
    )
      return fallback;
    const registry = app.plugins;
    const manifests = registry.manifests as Record<string, unknown>;
    const manifest = manifests[id];
    const getPlugin = app.plugins.getPlugin;
    const instance: unknown = getPlugin.call(registry, id);
    return {
      available: true,
      installed: isRecord(manifest),
      enabled: instance !== null && instance !== undefined,
      version:
        isRecord(manifest) && typeof manifest.version === 'string' ? manifest.version : undefined,
      instance,
      viewCount: this.app.workspace.getLeavesOfType(viewType).length,
    };
  }
}
