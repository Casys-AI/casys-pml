import type { RendererContext, HexCell, CameraState } from '../types';
import { HexPipeline } from './HexPipeline';

/** Base hex size in pixels */
const BASE_HEX_SIZE = 40;
const HEX_SPACING = 1.02;

const QUAD_VERTICES = new Float32Array([
  -1, -1,  1, -1,  1, 1,
  -1, -1,  1, 1,  -1, 1,
]);

export class HexRenderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private canvas: HTMLCanvasElement;
  private pipeline: HexPipeline;
  private quadBuffer: GPUBuffer;
  private hexInstanceBuffer: GPUBuffer | null = null;
  private pendingBufferDestructions: GPUBuffer[] = [];
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private hexCount = 0;

  constructor(ctx: RendererContext, canvas: HTMLCanvasElement) {
    this.device = ctx.device;
    this.context = ctx.context;
    this.canvas = canvas;
    this.pipeline = new HexPipeline(ctx);

    this.quadBuffer = this.device.createBuffer({
      size: QUAD_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.quadBuffer, 0, QUAD_VERTICES);
  }

  setCamera(camera: CameraState) {
    this.camera = camera;
  }

  getVisibleLevel(): number {
    return Math.max(0, Math.floor(Math.log2(this.camera.zoom)));
  }

  private updateHexBuffer(cells: HexCell[]) {
    if (cells.length === 0) {
      this.hexCount = 0;
      return;
    }

    const halfWidth = this.canvas.width / 2;
    const halfHeight = this.canvas.height / 2;

    // Hex spacing for tight grid
    const hexSize = BASE_HEX_SIZE;
    const horizSpacing = hexSize * 1.5 * HEX_SPACING;
    const vertSpacing = hexSize * Math.sqrt(3) * HEX_SPACING;

    // Instance data: center(2) + size(1) + level(1) + color(4) = 8 floats
    const instanceData = new Float32Array(cells.length * 8);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const offset = i * 8;

      // Axial to world position (flat-top hex)
      const worldX = horizSpacing * cell.q;
      const worldY = vertSpacing * (cell.r + cell.q * 0.5);

      // Normalize to clip space
      instanceData[offset + 0] = worldX / halfWidth;
      instanceData[offset + 1] = -worldY / halfHeight;
      instanceData[offset + 2] = hexSize / halfWidth;
      instanceData[offset + 3] = cell.level;

      const color = cell.color || [0.4, 0.5, 0.6, 1.0];
      instanceData[offset + 4] = color[0];
      instanceData[offset + 5] = color[1];
      instanceData[offset + 6] = color[2];
      instanceData[offset + 7] = color[3];
    }

    if (!this.hexInstanceBuffer || this.hexCount !== cells.length) {
      if (this.hexInstanceBuffer) {
        this.pendingBufferDestructions.push(this.hexInstanceBuffer);
      }
      this.hexInstanceBuffer = this.device.createBuffer({
        size: instanceData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    this.device.queue.writeBuffer(this.hexInstanceBuffer, 0, instanceData);
    this.hexCount = cells.length;
  }

  render(cells: HexCell[]) {
    const aspect = this.canvas.width / this.canvas.height;
    this.pipeline.updateCamera(this.camera, aspect, this.canvas.width, this.canvas.height);
    this.updateHexBuffer(cells);

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.06, g: 0.06, b: 0.1, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    const hexPipeline = this.pipeline.getHexPipeline();
    const cameraBindGroup = this.pipeline.getCameraBindGroup();

    if (hexPipeline && this.hexInstanceBuffer && this.hexCount > 0 && cameraBindGroup) {
      renderPass.setPipeline(hexPipeline);
      renderPass.setBindGroup(0, cameraBindGroup);
      renderPass.setVertexBuffer(0, this.quadBuffer);
      renderPass.setVertexBuffer(1, this.hexInstanceBuffer);
      renderPass.draw(6, this.hexCount);
    }

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);

    this.device.queue.onSubmittedWorkDone().then(() => {
      for (const buffer of this.pendingBufferDestructions) {
        buffer.destroy();
      }
      this.pendingBufferDestructions = [];
    });
  }

  destroy() {
    this.quadBuffer.destroy();
    this.hexInstanceBuffer?.destroy();
    this.pipeline.destroy();
    for (const buffer of this.pendingBufferDestructions) {
      buffer.destroy();
    }
  }
}
