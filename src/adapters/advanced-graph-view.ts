import { DetectionOnlyAdapter } from './detection-only';
import type { PluginDiscovery } from './adapter-interface';

export class AdvancedGraphViewAdapter extends DetectionOnlyAdapter {
  constructor(discovery: PluginDiscovery) {
    super(discovery, {
      id: 'graph-insight',
      name: 'Advanced Graph View',
      version: '0.10.1',
      viewType: 'graph-insight-view',
      blocker:
        'No documented external snapshot or temporary visibility API. Private renderer/model state is not accessed.',
    });
  }
}
