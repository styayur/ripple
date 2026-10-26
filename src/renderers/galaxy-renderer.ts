import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GraphRenderer, RendererEvents } from './renderer-interface';
import type { WorkspaceController } from '../workspace/workspace-controller';
import type { ViewState } from '../core/graph-model';
import { hashId } from '../core/graph-algorithms';

export class GalaxyGraphRenderer implements GraphRenderer {
  readonly mode = 'galaxy' as const;
  private renderer: WebGLRenderer | undefined;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.1, 1_000_000);
  private controls: OrbitControls | undefined;
  private points: Points<BufferGeometry, PointsMaterial> | undefined;
  private lines: LineSegments<BufferGeometry, LineBasicMaterial> | undefined;
  private selection: Points<BufferGeometry, PointsMaterial> | undefined;
  private ids: readonly string[] = [];
  private revision = -1;
  private visibleIdentity: ReadonlySet<string> | undefined;
  private resize: ResizeObserver | undefined;
  private frame = 0;
  private disposed = false;
  private readonly cleanup: (() => void)[] = [];
  private readonly state: ViewState;
  constructor(
    private readonly controller: WorkspaceController,
    private readonly events: RendererEvents,
  ) {
    this.state = controller.views.get('galaxy')!;
  }
  mount(container: HTMLElement): void {
    const contextStarted = performance.now();
    const canvas = container.createEl('canvas', {
      cls: 'ripple-canvas ripple-galaxy',
      attr: {
        tabindex: '0',
        'aria-label':
          'Galaxy 3D graph. Drag to orbit, right drag to pan, wheel to zoom. Use toolbar and node list for keyboard navigation.',
      },
    });
    try {
      this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      canvas.remove();
      throw new Error('Galaxy requires WebGL 2. Choose Frontier, Dense or Cluster on this device.');
    }
    this.renderer.setPixelRatio(
      Math.min(2, canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1),
    );
    canvas.dataset.contextMs = (performance.now() - contextStarted).toFixed(2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 300_000;
    this.controls.addEventListener('change', this.changed);
    const stored = this.state.camera;
    this.camera.position.set(stored.x, stored.y, stored.z);
    this.controls.target.set(stored.targetX, stored.targetY, stored.targetZ);
    this.controls.update();
    const down = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => {
      down.x = event.clientX;
      down.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 ||
        !this.points
      )
        return;
      const box = canvas.getBoundingClientRect();
      const pointer = new Vector2(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        (-(event.clientY - box.top) / box.height) * 2 + 1,
      );
      const ray = new Raycaster();
      ray.params.Points = {
        threshold: Math.max(
          3,
          (this.camera.position.distanceTo(this.controls!.target) / box.height) * 7,
        ),
      };
      ray.setFromCamera(pointer, this.camera);
      const hit = ray.intersectObject(this.points)[0];
      const id = hit?.index === undefined ? undefined : this.ids[hit.index];
      if (id) {
        this.events.pick(id, event.ctrlKey || event.metaKey);
        if (!event.ctrlKey && !event.metaKey && !event.altKey) this.events.open(id);
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      this.events.error('Galaxy WebGL context was lost. Switch to a 2D mode, then retry Galaxy.');
    };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('webglcontextlost', lost);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('webglcontextlost', lost);
    });
    this.resize = new ResizeObserver(() => {
      const box = container.getBoundingClientRect();
      this.camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
      this.camera.updateProjectionMatrix();
      this.renderer?.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
      this.drawSoon();
    });
    this.resize.observe(container);
    this.update();
  }
  private changed = (): void => {
    if (this.disposed || !this.controls) return;
    Object.assign(this.state.camera, {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      targetX: this.controls.target.x,
      targetY: this.controls.target.y,
      targetZ: this.controls.target.z,
      zoom: this.camera.zoom,
    });
    this.drawSoon();
  };
  update(): void {
    if (this.disposed || !this.renderer) return;
    const css = getComputedStyle(this.renderer.domElement);
    this.renderer.setClearColor(
      new Color(css.getPropertyValue('--background-primary').trim() || '#20252b'),
    );
    if (
      this.revision !== this.controller.snapshot.revision ||
      this.visibleIdentity !== this.controller.visible.ids
    ) {
      const geometryStarted = performance.now();
      this.clearObjects();
      this.revision = this.controller.snapshot.revision;
      this.visibleIdentity = this.controller.visible.ids;
      this.ids = [...this.controller.visible.ids];
      const coordinates: number[] = [];
      const colors: number[] = [];
      for (const id of this.ids) {
        const p = this.state.positions.get(id)!;
        coordinates.push(p.x, p.y, p.z);
        const color = new Color().setHSL(
          (hashId(this.controller.analysis.communities.get(id) ?? id) % 360) / 360,
          0.5,
          0.65,
        );
        colors.push(color.r, color.g, color.b);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      this.points = new Points(
        geometry,
        new PointsMaterial({ size: 7, sizeAttenuation: true, vertexColors: true }),
      );
      this.scene.add(this.points);
      const links: number[] = [];
      const edgeBudget = this.ids.length > 10_000 ? 5_000 : 100_000;
      for (const edge of this.controller.visible.edges.slice(0, edgeBudget)) {
        for (const id of [edge.source, edge.target]) {
          const p = this.state.positions.get(id)!;
          links.push(p.x, p.y, p.z);
        }
      }
      const lineGeometry = new BufferGeometry();
      lineGeometry.setAttribute('position', new Float32BufferAttribute(links, 3));
      this.lines = new LineSegments(
        lineGeometry,
        new LineBasicMaterial({ color: 0x7d95a8, transparent: true, opacity: 0.18 }),
      );
      this.scene.add(this.lines);
      this.renderer.domElement.dataset.geometryMs = (performance.now() - geometryStarted).toFixed(
        2,
      );
      if (this.ids.length && !this.state.initialized) {
        this.state.initialized = true;
        this.fit();
      }
    }
    if (this.selection) {
      this.scene.remove(this.selection);
      this.selection.geometry.dispose();
      this.selection.material.dispose();
    }
    const selected: number[] = [];
    for (const id of this.controller.selected) {
      const p = this.state.positions.get(id);
      if (p && this.controller.visible.ids.has(id)) selected.push(p.x, p.y, p.z);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(selected, 3));
    this.selection = new Points(
      geometry,
      new PointsMaterial({
        size: 16,
        color: new Color(css.getPropertyValue('--text-normal').trim() || '#ffffff'),
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.selection);
    this.renderer.domElement.dataset.mode = 'galaxy';
    this.renderer.domElement.dataset.visibleCount = String(this.ids.length);
    this.renderer.domElement.dataset.drawnNodes = String(this.ids.length);
    this.renderer.domElement.dataset.drawnEdges = String(
      (this.lines?.geometry.getAttribute('position').count ?? 0) / 2,
    );
    this.renderer.domElement.dataset.rendering = 'webgl-3d';
    this.drawSoon();
  }
  private drawSoon(): void {
    if (!this.frame && !this.disposed)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        if (this.renderer) {
          const started = performance.now();
          this.renderer.render(this.scene, this.camera);
          this.renderer.domElement.dataset.drawMs = (performance.now() - started).toFixed(2);
          this.renderer.domElement.dataset.firstDrawMs ??= this.renderer.domElement.dataset.drawMs;
          this.renderer.domElement.dataset.triangles = String(this.renderer.info.render.triangles);
        }
      });
  }
  zoom(factor: number): void {
    if (!this.controls) return;
    this.camera.position
      .sub(this.controls.target)
      .multiplyScalar(1 / factor)
      .add(this.controls.target);
    this.controls.update();
    this.changed();
  }
  fit(): void {
    if (!this.controls) return;
    const sphere = this.points?.geometry.boundingSphere;
    const center = sphere?.center ?? new Vector3();
    const radius = Math.max(60, sphere?.radius ?? 60);
    this.controls.target.copy(center);
    const aspect = Math.max(0.3, this.camera.aspect);
    const distance = ((radius / Math.sin((55 * Math.PI) / 360)) * 1.3) / Math.min(1, aspect);
    this.camera.position
      .copy(center)
      .add(new Vector3(0.35, 0.25, 1).normalize().multiplyScalar(distance));
    this.controls.update();
    this.changed();
  }
  reset(): void {
    this.fit();
  }
  focus(id: string): void {
    const p = this.state.positions.get(id);
    if (!p || !this.controls) return;
    const delta = new Vector3(p.x, p.y, p.z).sub(this.controls.target);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
    this.controls.update();
    this.changed();
  }
  pin(_id: string): void {
    this.events.notice('Galaxy uses a fixed 3D layout. Pinning is available in Frontier.');
  }
  private clearObjects(): void {
    for (const object of [this.points, this.lines, this.selection])
      if (object) {
        this.scene.remove(object);
        object.geometry.dispose();
        object.material.dispose();
      }
    this.points = undefined;
    this.lines = undefined;
    this.selection = undefined;
  }
  dispose(): void {
    if (this.disposed) return;
    this.changed();
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    for (const cleanup of this.cleanup) cleanup();
    this.controls?.removeEventListener('change', this.changed);
    this.controls?.dispose();
    this.clearObjects();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
    this.renderer = undefined;
  }
}
