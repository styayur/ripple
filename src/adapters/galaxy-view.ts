import { DetectionOnlyAdapter } from './detection-only';
import type { PluginDiscovery } from './adapter-interface';

export class GalaxyViewAdapter extends DetectionOnlyAdapter {
  constructor(discovery: PluginDiscovery) {
    super(discovery, {
      id: 'galaxy-view',
      name: 'Galaxy View',
      version: '0.6.1',
      viewType: 'galaxy-view',
      blocker:
        'The controller and index-based graph model are not a documented extension API. External filtering is unsupported.',
    });
  }
}
