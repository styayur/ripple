import type { GraphData, GraphEdge, Score } from './types';

export type ViewMode = 'frontier' | 'dense' | 'cluster' | 'galaxy';
export const VIEW_MODES: readonly ViewMode[] = ['frontier', 'dense', 'cluster', 'galaxy'];
export interface GraphSnapshot extends GraphData {
  readonly revision: number;
  readonly updatedAt: number;
}
export interface FilterState {
  readonly query: string;
  readonly threshold: number;
  readonly strategy: 'strict';
}
export type NodeScore = Score;
export interface VisibleGraph {
  readonly revision: number;
  readonly ids: ReadonlySet<string>;
  readonly edges: readonly GraphEdge[];
  readonly scores: readonly NodeScore[];
  readonly emptyQuery: boolean;
}
export interface Position {
  x: number;
  y: number;
  z: number;
  pinned: boolean;
}
export interface CameraState {
  x: number;
  y: number;
  z: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}
export interface ViewState {
  readonly mode: ViewMode;
  readonly positions: Map<string, Position>;
  camera: CameraState;
  initialized: boolean;
  physics: boolean;
}
export function camera2D(): CameraState {
  return { x: 0, y: 0, z: 1000, zoom: 1, targetX: 0, targetY: 0, targetZ: 0 };
}
