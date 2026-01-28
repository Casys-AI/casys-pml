/**
 * HexRendererPixi - PixiJS renderer for hex grid (WebGL with Canvas fallback)
 */

import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
import type { HexCell, CameraState } from '../types';

const BASE_HEX_SIZE = 40;
const HEX_SPACING = 1.02;

export class HexRendererPixi {
  private app: Application;
  private hexContainer: Container;
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private hexGraphics: Map<string, Graphics> = new Map();
  private labelTexts: Map<string, Text> = new Map();
  private initialized = false;

  constructor() {
    this.app = new Application();
    this.hexContainer = new Container();
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      background: '#0f0f18',
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: canvas.parentElement || undefined,
    });

    this.app.stage.addChild(this.hexContainer);
    this.hexContainer.eventMode = 'static';
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setCamera(camera: CameraState) {
    this.camera = camera;
    this.updateTransform();
  }

  getVisibleLevel(): number {
    return Math.max(0, Math.floor(Math.log2(this.camera.zoom)));
  }

  private updateTransform() {
    const { width, height } = this.app.screen;
    this.hexContainer.x = width / 2 + this.camera.x * this.camera.zoom;
    this.hexContainer.y = height / 2 + this.camera.y * this.camera.zoom;
    this.hexContainer.scale.set(this.camera.zoom);
  }

  private hexToWorld(q: number, r: number): { x: number; y: number } {
    const horizSpacing = BASE_HEX_SIZE * 1.5 * HEX_SPACING;
    const vertSpacing = BASE_HEX_SIZE * Math.sqrt(3) * HEX_SPACING;
    return {
      x: horizSpacing * q,
      y: vertSpacing * (r + q * 0.5),
    };
  }

  private createHexGraphics(cell: HexCell): Graphics {
    const g = new Graphics();
    const size = BASE_HEX_SIZE * 0.9;
    const color = cell.color || [0.4, 0.5, 0.6, 1.0];

    // Convert color to hex
    const fillColor = (Math.floor(color[0] * 255) << 16) |
                      (Math.floor(color[1] * 255) << 8) |
                      Math.floor(color[2] * 255);

    const strokeColor = (Math.floor(color[0] * 200) << 16) |
                        (Math.floor(color[1] * 200) << 8) |
                        Math.floor(color[2] * 200);

    // Draw hexagon path
    const points: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      points.push(size * Math.cos(angle), size * Math.sin(angle));
    }

    g.poly(points, true);
    g.fill({ color: fillColor, alpha: color[3] });
    g.stroke({ color: strokeColor, width: 2 });

    return g;
  }

  render(cells: HexCell[]) {
    if (!this.initialized) return;

    // Track which cells are still present
    const currentIds = new Set(cells.map(c => c.id));

    // Remove old graphics
    for (const [id, g] of this.hexGraphics) {
      if (!currentIds.has(id)) {
        this.hexContainer.removeChild(g);
        g.destroy();
        this.hexGraphics.delete(id);
      }
    }
    for (const [id, t] of this.labelTexts) {
      if (!currentIds.has(id)) {
        this.hexContainer.removeChild(t);
        t.destroy();
        this.labelTexts.delete(id);
      }
    }

    // Add/update cells
    for (const cell of cells) {
      const world = this.hexToWorld(cell.q, cell.r);

      // Get or create hex graphic
      let hex = this.hexGraphics.get(cell.id);
      if (!hex) {
        hex = this.createHexGraphics(cell);
        hex.eventMode = 'static';
        hex.cursor = 'pointer';
        (hex as any).cellId = cell.id;
        this.hexContainer.addChild(hex);
        this.hexGraphics.set(cell.id, hex);
      }
      hex.x = world.x;
      hex.y = world.y;

      // Get or create label
      let label = this.labelTexts.get(cell.id);
      if (!label) {
        const style = new TextStyle({
          fontSize: 10,
          fill: '#ffffff',
          fontFamily: 'sans-serif',
        });
        const text = cell.label.length > 12 ? cell.label.slice(0, 11) + '…' : cell.label;
        label = new Text({ text, style });
        label.anchor.set(0.5);
        this.hexContainer.addChild(label);
        this.labelTexts.set(cell.id, label);
      }
      label.x = world.x;
      label.y = world.y;
      label.visible = this.camera.zoom > 0.4;
    }

    this.updateTransform();
  }

  resize(width: number, height: number) {
    if (this.initialized) {
      this.app.renderer.resize(width, height);
      this.updateTransform();
    }
  }

  findCellAt(screenX: number, screenY: number): string | null {
    if (!this.initialized) return null;

    // Convert screen coords to canvas coords
    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // Convert to world coords (inverse of updateTransform)
    const { width, height } = this.app.screen;
    const worldX = (canvasX - width / 2 - this.camera.x * this.camera.zoom) / this.camera.zoom;
    const worldY = (canvasY - height / 2 - this.camera.y * this.camera.zoom) / this.camera.zoom;

    // Check each hex
    const hexSize = BASE_HEX_SIZE * 0.9;
    for (const [id, hex] of this.hexGraphics) {
      const dx = worldX - hex.x;
      const dy = worldY - hex.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hexSize) {
        return id;
      }
    }
    return null;
  }

  destroy() {
    this.app.destroy(true);
  }
}
