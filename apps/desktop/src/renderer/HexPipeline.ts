import type { RendererContext, CameraState } from '../types';
import hexShaderSource from '../shaders/hex.wgsl?raw';

/**
 * HexPipeline - WebGPU pipeline for hexagonal cell rendering
 *
 * Camera uniform buffer layout (16-byte aligned):
 * - offset: vec2<f32> (8 bytes)
 * - zoom: f32 (4 bytes)
 * - aspect: f32 (4 bytes)
 * Total: 16 bytes
 */
export class HexPipeline {
  private device: GPUDevice;
  private format: GPUTextureFormat;

  // Hex pipeline
  private hexPipeline: GPURenderPipeline | null = null;
  private hexBindGroupLayout: GPUBindGroupLayout | null = null;

  // Camera
  private cameraBuffer: GPUBuffer | null = null;
  private cameraBindGroup: GPUBindGroup | null = null;

  constructor(ctx: RendererContext) {
    this.device = ctx.device;
    this.format = ctx.format;
    this.init();
  }

  private init() {
    this.createCameraBuffer();
    this.createHexPipeline();
  }

  private createCameraBuffer() {
    this.cameraBuffer = this.device.createBuffer({
      size: 16, // 2 floats offset + 1 float zoom + 1 float aspect = 16 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createHexPipeline() {
    const shaderModule = this.device.createShaderModule({
      label: 'Hex Shader',
      code: hexShaderSource,
    });

    this.hexBindGroupLayout = this.device.createBindGroupLayout({
      label: 'Hex Bind Group Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.hexBindGroupLayout],
    });

    this.hexPipeline = this.device.createRenderPipeline({
      label: 'Hex Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          // Vertex buffer (quad)
          {
            arrayStride: 8, // 2 floats
            stepMode: 'vertex',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
            ],
          },
          // Instance buffer: center(2) + size(1) + level(1) + color(4) = 8 floats
          {
            arrayStride: 32, // 8 * 4 bytes
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' },  // center
              { shaderLocation: 2, offset: 8, format: 'float32' },    // size
              { shaderLocation: 3, offset: 12, format: 'float32' },   // level
              { shaderLocation: 4, offset: 16, format: 'float32x4' }, // color
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.cameraBindGroup = this.device.createBindGroup({
      layout: this.hexBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer! } },
      ],
    });
  }

  updateCamera(camera: CameraState, aspect: number, canvasWidth: number, canvasHeight: number) {
    if (!this.cameraBuffer) return;

    const halfWidth = canvasWidth / 2;
    const halfHeight = canvasHeight / 2;

    const data = new Float32Array([
      camera.x / halfWidth,  // Normalize offset to clip space
      camera.y / halfHeight,
      camera.zoom,
      aspect,
    ]);

    this.device.queue.writeBuffer(this.cameraBuffer, 0, data);
  }

  getHexPipeline(): GPURenderPipeline | null {
    return this.hexPipeline;
  }

  getCameraBindGroup(): GPUBindGroup | null {
    return this.cameraBindGroup;
  }

  destroy() {
    this.cameraBuffer?.destroy();
  }
}
