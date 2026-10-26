import type { WorkspaceController } from '../workspace/workspace-controller';
import type { ViewMode } from '../core/graph-model';

export interface RendererEvents {
  pick(id: string, additive: boolean): void;
  open(id: string): void;
  error(message: string): void;
  notice(message: string): void;
}
export interface GraphRenderer {
  readonly mode: ViewMode;
  mount(container: HTMLElement): void;
  update(): void;
  zoom(factor: number): void;
  fit(): void;
  reset(): void;
  focus(id: string): void;
  pin(id: string): void;
  dispose(): void;
}
export interface RendererFactory {
  (controller: WorkspaceController, events: RendererEvents): GraphRenderer;
}
