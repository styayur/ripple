import { DetectionOnlyAdapter } from './detection-only';
import type { PluginDiscovery } from './adapter-interface';

export class SmartClusterGraphAdapter extends DetectionOnlyAdapter {
  constructor(discovery: PluginDiscovery) {
    super(discovery, {
      id: 'smart-cluster-graph',
      name: 'Smart Cluster Graph',
      version: '1.2.0',
      viewType: 'smart-cluster-graph-view',
      blocker:
        'Graph data, hidden nodes and pins are private. No safe external filtering/restoration contract.',
    });
  }
}
