import type { RendererContext, CameraState } from '../types';
import nodeShaderSource from '../shaders/node.wgsl?raw';
import edgeShaderSource from '../shaders/edge.wgsl?raw';

/** Camera uniform buffer layout (16-byte aligned):
 * - offset: vec2<f32> (8 bytes)
 * - zoom: f32 (4 bytes)
 * - aspect: f32 (4 bytes)
 * Total: 16 bytes
 */

export class Pipeline {
  private device: GPUDevice;
  private format: GPUTextureFormat;

  // Node pipeline
  private nodePipeline: GPURenderPipeline | null = null;
  private nodeBindGroupLayout: GPUBindGroupLayout | null = null;

  // Edge pipeline
  private edgePipeline: GPURenderPipeline | null = null;
  private edgeBindGroupLayout: GPUBindGroupLayout | null = null;

  // Shared
  private cameraBuffer: GPUBuffer | null = null;
  private cameraBindGroup: GPUBindGroup | null = null;

  constructor(ctx: RendererContext) {
    this.device = ctx.device;
    this.format = ctx.format;
    this.init();
  }

  private init() {
    this.createCameraBuffer();
    this.createNodePipeline();
    this.createEdgePipeline();
  }

  private createCameraBuffer() {
    this.cameraBuffer = this.device.createBuffer({
      size: 16, // 2 floats offset + 1 float zoom + 1 float aspect = 16 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createNodePipeline() {
    const shaderModule = this.device.createShaderModule({
      label: 'Node Shader',
      code: nodeShaderSource,
    });

    this.nodeBindGroupLayout = this.device.createBindGroupLayout({
      label: 'Node Bind Group Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.nodeBindGroupLayout],
    });

    this.nodePipeline = this.device.createRenderPipeline({
      label: 'Node Pipeline',
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
          // Instance buffer
          {
            arrayStride: 28, // 2 + 1 + 4 floats = 7 * 4 bytes
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' },  // center
              { shaderLocation: 2, offset: 8, format: 'float32' },    // size
              { shaderLocation: 3, offset: 12, format: 'float32x4' }, // color
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
      layout: this.nodeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer! } },
      ],
    });
  }

  private createEdgePipeline() {
    const shaderModule = this.device.createShaderModule({
      label: 'Edge Shader',
      code: edgeShaderSource,
    });

    this.edgeBindGroupLayout = this.device.createBindGroupLayout({
      label: 'Edge Bind Group Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.edgeBindGroupLayout],
    });

    this.edgePipeline = this.device.createRenderPipeline({
      label: 'Edge Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 36, // 2 + 2 + 1 + 4 floats = 9 * 4 = 36 bytes
            stepMode: 'vertex',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },  // position (8 bytes)
              { shaderLocation: 1, offset: 8, format: 'float32x2' },  // direction (8 bytes)
              { shaderLocation: 2, offset: 16, format: 'float32' },   // side (4 bytes)
              { shaderLocation: 3, offset: 20, format: 'float32x4' }, // color (16 bytes) = 36 total
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

  getNodePipeline(): GPURenderPipeline | null {
    return this.nodePipeline;
  }

  getEdgePipeline(): GPURenderPipeline | null {
    return this.edgePipeline;
  }

  getCameraBindGroup(): GPUBindGroup | null {
    return this.cameraBindGroup;
  }

  destroy() {
    this.cameraBuffer?.destroy();
  }
}
