import { CanvasGraphRenderer } from '../renderers/canvas-renderer';
import { GalaxyGraphRenderer } from '../renderers/galaxy-renderer';
import type { GraphRenderer, RendererEvents } from '../renderers/renderer-interface';
import type { WorkspaceController } from './workspace-controller';
import type { ViewMode } from '../core/graph-model';

export function createRenderer(
  mode: ViewMode,
  controller: WorkspaceController,
  events: RendererEvents,
): GraphRenderer {
  return mode === 'galaxy'
    ? new GalaxyGraphRenderer(controller, events)
    : new CanvasGraphRenderer(mode, controller, events);
}
