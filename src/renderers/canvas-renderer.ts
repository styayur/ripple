import type { GraphRenderer, RendererEvents } from './renderer-interface';
import type { WorkspaceController } from '../workspace/workspace-controller';
import type { Position, ViewMode, ViewState } from '../core/graph-model';
import { camera2D } from '../core/graph-model';
import { convexHull, hashId } from '../core/graph-algorithms';
import workerSource from './layout.worker.ts?worker';

type CanvasMode = Exclude<ViewMode, 'galaxy'>;
export class CanvasGraphRenderer implements GraphRenderer {
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private resize: ResizeObserver | undefined;
  private worker: Worker | undefined;
  private workerUrl = '';
  private workerRevision = -1;
  private workerIds: readonly string[] = [];
  private width = 1;
  private height = 1;
  private frame = 0;
  private disposed = false;
  private pointer:
    { id: number; x: number; y: number; moved: boolean; node: string | undefined } | undefined;
  private readonly cleanup: (() => void)[] = [];
  private readonly state: ViewState;
  private hullRevision = -1;
  private hullVisibility: ReadonlySet<string> | undefined;
  private hulls: { key: string; points: readonly { x: number; y: number }[] }[] = [];
  private accent = '#608ba8';
  private text = '#bbc7d4';
  private background = '#20252b';
  private edge = '#647385';
  constructor(
    readonly mode: CanvasMode,
    private readonly controller: WorkspaceController,
    private readonly events: RendererEvents,
  ) {
    this.state = controller.views.get(mode)!;
  }
  mount(container: HTMLElement): void {
    this.canvas = container.createEl('canvas', {
      cls: 'ripple-canvas',
      attr: {
        tabindex: '0',
        role: 'img',
        'aria-label': `${this.mode} graph. Drag to pan, wheel to zoom. Frontier nodes can be dragged and pinned. Use toolbar or node list for keyboard navigation.`,
      },
    });
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
    this.listen(
      'wheel',
      (event: WheelEvent) => {
        event.preventDefault();
        this.zoomAt(Math.exp(-event.deltaY * 0.001), event.offsetX, event.offsetY);
      },
      { passive: false },
    );
    this.listen('pointerdown', (event: PointerEvent) => {
      if (event.button !== 0) return;
      this.canvas.focus();
      this.canvas.setPointerCapture(event.pointerId);
      this.pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        node: this.hit(event.offsetX, event.offsetY),
      };
    });
    this.listen('pointermove', (event: PointerEvent) => {
      if (!this.pointer) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.pointer.moved = true;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      if (this.mode === 'frontier' && this.pointer.node) {
        const position = this.state.positions.get(this.pointer.node)!;
        position.x += dx / this.state.camera.zoom;
        position.y += dy / this.state.camera.zoom;
        position.pinned = true;
        this.worker?.postMessage({ type: 'pin', id: this.pointer.node, ...position });
      } else {
        this.state.camera.x -= dx / this.state.camera.zoom;
        this.state.camera.y -= dy / this.state.camera.zoom;
      }
      this.drawSoon();
    });
    this.listen('pointerup', (event: PointerEvent) => {
      const pointer = this.pointer;
      this.pointer = undefined;
      if (this.canvas.hasPointerCapture(event.pointerId))
        this.canvas.releasePointerCapture(event.pointerId);
      if (pointer && !pointer.moved && pointer.node) {
        this.events.pick(pointer.node, event.ctrlKey || event.metaKey);
        if (!event.ctrlKey && !event.metaKey && !event.altKey) this.events.open(pointer.node);
      }
      this.drawSoon();
    });
    this.listen('pointercancel', () => {
      this.pointer = undefined;
    });
    this.listen('keydown', (event: KeyboardEvent) => {
      if (['+', '=', '-'].includes(event.key)) {
        this.zoom(event.key === '-' ? 0.8 : 1.25);
        event.preventDefault();
      }
      if (event.key === '0') {
        this.fit();
        event.preventDefault();
      }
      const offsets: Record<string, [number, number]> = {
        ArrowLeft: [-50, 0],
        ArrowRight: [50, 0],
        ArrowUp: [0, -50],
        ArrowDown: [0, 50],
      };
      const move = offsets[event.key];
      if (move) {
        this.state.camera.x += move[0] / this.state.camera.zoom;
        this.state.camera.y += move[1] / this.state.camera.zoom;
        this.drawSoon();
        event.preventDefault();
      }
    });
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(container);
    this.measure();
    this.update();
  }
  private listen<K extends keyof HTMLElementEventMap>(
    name: K,
    callback: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    this.canvas.addEventListener(name, callback, options);
    this.cleanup.push(() => this.canvas.removeEventListener(name, callback, options));
  }
  private measure(): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    this.width = Math.max(1, box.width);
    this.height = Math.max(1, box.height);
    const dpr = Math.min(2, this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSoon();
  }
  update(): void {
    if (this.disposed) return;
    const colors = getComputedStyle(this.canvas);
    this.accent = colors.getPropertyValue('--interactive-accent').trim() || '#608ba8';
    this.text = colors.getPropertyValue('--text-normal').trim() || '#bbc7d4';
    this.background = colors.getPropertyValue('--background-primary').trim() || '#20252b';
    this.edge = colors.getPropertyValue('--text-faint').trim() || '#647385';
    this.canvas.dataset.mode = this.mode;
    this.canvas.dataset.visibleCount = String(this.controller.visible.ids.size);
    if (
      this.mode === 'cluster' &&
      (this.hullRevision !== this.controller.snapshot.revision ||
        this.hullVisibility !== this.controller.visible.ids)
    ) {
      this.hullRevision = this.controller.snapshot.revision;
      this.hullVisibility = this.controller.visible.ids;
      this.hulls = [...this.controller.analysis.groups].slice(0, 200).map(([key, ids]) => ({
        key,
        points: convexHull(
          ids.flatMap((id) => {
            const position = this.state.positions.get(id);
            return position && this.controller.visible.ids.has(id) ? [position] : [];
          }),
        ),
      }));
    }
    if (this.controller.snapshot.nodes.length && !this.state.initialized) {
      this.state.initialized = true;
      this.fit();
    }
    if (this.mode === 'frontier' && this.workerRevision !== this.controller.snapshot.revision)
      this.startPhysics();
    this.drawSoon();
  }
  private startPhysics(): void {
    this.stopWorker();
    this.workerRevision = this.controller.snapshot.revision;
    if (!this.controller.snapshot.nodes.length || !this.state.physics) return;
    try {
      this.workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      this.worker = new Worker(this.workerUrl);
      this.workerIds = this.controller.snapshot.nodes.map((node) => node.id);
      this.worker.onmessage = (event: MessageEvent<{ positions: Float32Array; done: boolean }>) => {
        if (this.disposed) return;
        const positions = event.data.positions;
        for (let i = 0; i < this.workerIds.length; i++) {
          const point = this.state.positions.get(this.workerIds[i]!);
          if (point && !point.pinned) {
            point.x = positions[i * 2]!;
            point.y = positions[i * 2 + 1]!;
          }
        }
        this.drawSoon();
      };
      this.worker.onerror = () => {
        this.stopWorker();
        this.events.notice(
          'Force worker failed. Existing positions and navigation remain available; reopen Frontier to retry.',
        );
      };
      this.worker.postMessage({
        type: 'start',
        graph: {
          nodes: this.controller.snapshot.nodes.map((node) => ({
            id: node.id,
            ...this.state.positions.get(node.id)!,
          })),
          edges: this.controller.snapshot.edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
          })),
        },
      });
    } catch {
      this.stopWorker();
      this.events.notice(
        'Force worker unavailable. Existing layout is retained; node dragging and camera controls still work.',
      );
    }
  }
  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
    this.workerUrl = '';
  }
  private project(position: Position): { x: number; y: number } {
    return {
      x: (position.x - this.state.camera.x) * this.state.camera.zoom + this.width / 2,
      y: (position.y - this.state.camera.y) * this.state.camera.zoom + this.height / 2,
    };
  }
  private hit(x: number, y: number): string | undefined {
    let found: string | undefined;
    let distance = 144;
    for (const id of this.controller.visible.ids) {
      const point = this.state.positions.get(id);
      if (!point) continue;
      const screen = this.project(point);
      const d = (screen.x - x) ** 2 + (screen.y - y) ** 2;
      if (d < distance) {
        found = id;
        distance = d;
      }
    }
    return found;
  }
  private drawSoon(): void {
    if (!this.frame && !this.disposed)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
  }
  private draw(): void {
    if (this.disposed) return;
    const started = performance.now();
    const ctx = this.context;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    const visible = this.controller.visible;
    const camera = this.state.camera;
    const projected = new Map<string, { x: number; y: number }>();
    for (const id of visible.ids) {
      const point = this.state.positions.get(id);
      if (point) projected.set(id, this.project(point));
    }
    if (this.mode === 'cluster') this.drawHulls();
    const edgeLimit = this.mode === 'dense' && camera.zoom < 0.3 ? 0 : 30_000;
    let edgeCount = 0;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = this.edge;
    ctx.beginPath();
    for (const edge of visible.edges) {
      if (edgeCount >= edgeLimit) break;
      const a = projected.get(edge.source),
        b = projected.get(edge.target);
      if (!a || !b) continue;
      if (
        (a.x < 0 && b.x < 0) ||
        (a.x > this.width && b.x > this.width) ||
        (a.y < 0 && b.y < 0) ||
        (a.y > this.height && b.y > this.height)
      )
        continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      edgeCount++;
    }
    ctx.stroke();
    if (this.mode === 'cluster') {
      ctx.strokeStyle = this.accent;
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let drawn = 0;
      for (const edge of this.controller.analysis.bridges) {
        if (drawn >= 10_000) break;
        const a = projected.get(edge.source),
          b = projected.get(edge.target);
        if (a && b) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          drawn++;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    let drawn = 0;
    if (this.mode === 'dense') {
      ctx.fillStyle = this.accent;
      ctx.beginPath();
      for (const point of projected.values()) {
        if (!this.inViewport(point)) continue;
        ctx.rect(point.x - 1.5, point.y - 1.5, 3, 3);
        drawn++;
      }
      ctx.fill();
    } else {
      for (const [id, point] of projected) {
        if (!this.inViewport(point)) continue;
        ctx.fillStyle =
          this.mode === 'cluster'
            ? this.groupColor(this.controller.analysis.communities.get(id) ?? id)
            : this.accent;
        const radius = Math.max(
          3,
          Math.min(7, 3 + Math.log1p(this.controller.analysis.adjacency.get(id)?.size ?? 0)),
        );
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
        if (this.state.positions.get(id)?.pinned) {
          ctx.strokeStyle = this.text;
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        drawn++;
      }
    }
    ctx.strokeStyle = this.text;
    ctx.lineWidth = 2;
    for (const id of this.controller.selected) {
      const point = projected.get(id);
      if (point) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (camera.zoom > (this.mode === 'dense' ? 1.5 : 0.65) || visible.ids.size < 80) {
      let labels = 0;
      ctx.font = '12px sans-serif';
      ctx.fillStyle = this.text;
      const occupied: { x: number; y: number; width: number; height: number }[] = [];
      for (const priority of [true, false])
        for (const node of this.controller.snapshot.nodes) {
          if (this.controller.selected.has(node.id) !== priority) continue;
          if (labels >= 120) break;
          const point = projected.get(node.id);
          if (!point || !this.inViewport(point)) continue;
          const title = node.title.slice(0, 48);
          const width = ctx.measureText(title).width + 6;
          const candidates = [
            { x: point.x + 10, y: point.y - 20 },
            { x: point.x - width - 10, y: point.y - 20 },
            { x: point.x + 10, y: point.y + 8 },
            { x: point.x - width - 10, y: point.y + 8 },
          ];
          const place = candidates.find(
            (p) =>
              p.x >= 0 &&
              p.y >= 0 &&
              p.x + width <= this.width &&
              p.y + 15 <= this.height &&
              !occupied.some(
                (box) =>
                  p.x < box.x + box.width &&
                  p.x + width > box.x &&
                  p.y < box.y + box.height &&
                  p.y + 15 > box.y,
              ),
          );
          if (!place) continue;
          ctx.fillText(title, place.x + 3, place.y + 12);
          occupied.push({ ...place, width, height: 15 });
          labels++;
        }
    }
    this.canvas.dataset.drawMs = (performance.now() - started).toFixed(2);
    this.canvas.dataset.drawnNodes = String(drawn);
    this.canvas.dataset.drawnEdges = String(edgeCount);
  }
  private inViewport(point: { x: number; y: number }): boolean {
    return (
      point.x >= -15 && point.x <= this.width + 15 && point.y >= -15 && point.y <= this.height + 15
    );
  }
  private groupColor(id: string): string {
    return `hsl(${hashId(id) % 360} 48% 58%)`;
  }
  private drawHulls(): void {
    const ctx = this.context;
    for (const { key, points } of this.hulls) {
      const hull = points.map((point) => this.project({ ...point, z: 0, pinned: false }));
      if (hull.length < 2) continue;
      ctx.strokeStyle = this.groupColor(key);
      ctx.fillStyle = this.groupColor(key);
      ctx.lineWidth = 20;
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.moveTo(hull[0]!.x, hull[0]!.y);
      for (const point of hull.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  zoom(factor: number): void {
    this.zoomAt(factor, this.width / 2, this.height / 2);
  }
  private zoomAt(factor: number, x: number, y: number): void {
    const camera = this.state.camera;
    const previous = camera.zoom;
    camera.zoom = Math.max(0.01, Math.min(20, previous * factor));
    camera.x += (x - this.width / 2) * (1 / previous - 1 / camera.zoom);
    camera.y += (y - this.height / 2) * (1 / previous - 1 / camera.zoom);
    this.drawSoon();
  }
  fit(): void {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id of this.controller.visible.ids) {
      const p = this.state.positions.get(id);
      if (p) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (!Number.isFinite(minX)) {
      this.state.camera = camera2D();
      this.drawSoon();
      return;
    }
    this.state.camera.x = (minX + maxX) / 2;
    this.state.camera.y = (minY + maxY) / 2;
    this.state.camera.zoom = Math.max(
      0.01,
      Math.min(
        2.5,
        (this.width - 80) / Math.max(100, maxX - minX),
        (this.height - 80) / Math.max(100, maxY - minY),
      ),
    );
    this.drawSoon();
  }
  reset(): void {
    this.state.camera = camera2D();
    this.fit();
  }
  focus(id: string): void {
    const p = this.state.positions.get(id);
    if (p) {
      this.state.camera.x = p.x;
      this.state.camera.y = p.y;
      this.state.camera.zoom = Math.max(1, this.state.camera.zoom);
      this.drawSoon();
    }
  }
  pin(id: string): void {
    const p = this.state.positions.get(id);
    if (!p || this.mode !== 'frontier') return;
    p.pinned = !p.pinned;
    this.worker?.postMessage({ type: 'pin', id, ...p });
    this.drawSoon();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWorker();
    this.resize?.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanup) cleanup();
    this.canvas?.remove();
  }
}
