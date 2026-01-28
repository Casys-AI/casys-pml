import type { RendererContext, GraphNode, GraphEdge, CameraState } from '../types';
import { Pipeline } from './Pipeline';

/** Quad vertices for instanced node rendering */
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
   1,  1,
  -1, -1,
   1,  1,
  -1,  1,
]);

export class GraphRenderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private canvas: HTMLCanvasElement;
  private pipeline: Pipeline;

  // Buffers
  private quadBuffer: GPUBuffer;
  private nodeInstanceBuffer: GPUBuffer | null = null;
  private edgeVertexBuffer: GPUBuffer | null = null;

  // F1 Fix: Deferred buffer destruction to avoid race conditions
  private pendingBufferDestructions: GPUBuffer[] = [];

  // State
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private nodeCount = 0;
  private edgeVertexCount = 0;

  constructor(ctx: RendererContext, canvas: HTMLCanvasElement) {
    this.device = ctx.device;
    this.context = ctx.context;
    this.canvas = canvas;
    this.pipeline = new Pipeline(ctx);

    // Create quad vertex buffer
    this.quadBuffer = this.device.createBuffer({
      size: QUAD_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.quadBuffer, 0, QUAD_VERTICES);
  }

  setCamera(camera: CameraState) {
    this.camera = camera;
  }

  private updateNodeBuffer(nodes: GraphNode[]) {
    if (nodes.length === 0) {
      this.nodeCount = 0;
      return;
    }

    // F6 Fix: Use actual canvas dimensions
    const halfWidth = this.canvas.width / 2;
    const halfHeight = this.canvas.height / 2;

    // Instance data: center(2) + size(1) + color(4) = 7 floats per node
    const instanceData = new Float32Array(nodes.length * 7);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const offset = i * 7;

      // Normalize position to clip space (-1 to 1)
      instanceData[offset + 0] = (node.x - halfWidth) / halfWidth;
      instanceData[offset + 1] = (halfHeight - node.y) / halfHeight; // Flip Y

      // Size (normalized)
      instanceData[offset + 2] = (node.size ?? 20) / halfWidth;

      // Color (default blue)
      const color = node.color ?? [0.3, 0.5, 0.9, 1.0];
      instanceData[offset + 3] = color[0];
      instanceData[offset + 4] = color[1];
      instanceData[offset + 5] = color[2];
      instanceData[offset + 6] = color[3];
    }

    // F1 Fix: Defer old buffer destruction
    if (!this.nodeInstanceBuffer || this.nodeCount !== nodes.length) {
      if (this.nodeInstanceBuffer) {
        this.pendingBufferDestructions.push(this.nodeInstanceBuffer);
      }
      this.nodeInstanceBuffer = this.device.createBuffer({
        size: instanceData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    this.device.queue.writeBuffer(this.nodeInstanceBuffer, 0, instanceData);
    this.nodeCount = nodes.length;
  }

  private updateEdgeBuffer(edges: GraphEdge[], nodes: GraphNode[]) {
    if (edges.length === 0) {
      this.edgeVertexCount = 0;
      return;
    }

    // F6 Fix: Use actual canvas dimensions
    const halfWidth = this.canvas.width / 2;
    const halfHeight = this.canvas.height / 2;

    // Build node lookup
    const nodeMap = new Map<string, GraphNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // 6 vertices per edge (2 triangles for thick line)
    // Each vertex: position(2) + direction(2) + side(1) + color(4) = 9 floats
    const vertexData = new Float32Array(edges.length * 6 * 9);
    let vertexCount = 0;

    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (!sourceNode || !targetNode) continue;

      // Normalize positions
      const x1 = (sourceNode.x - halfWidth) / halfWidth;
      const y1 = (halfHeight - sourceNode.y) / halfHeight;
      const x2 = (targetNode.x - halfWidth) / halfWidth;
      const y2 = (halfHeight - targetNode.y) / halfHeight;

      // Direction vector
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const dirX = len > 0 ? dx / len : 0;
      const dirY = len > 0 ? dy / len : 0;

      const color = edge.color ?? [0.5, 0.5, 0.5, 0.8];

      // Create 6 vertices (2 triangles)
      const writeVertex = (x: number, y: number, side: number) => {
        const offset = vertexCount * 9;
        vertexData[offset + 0] = x;
        vertexData[offset + 1] = y;
        vertexData[offset + 2] = dirX;
        vertexData[offset + 3] = dirY;
        vertexData[offset + 4] = side;
        vertexData[offset + 5] = color[0];
        vertexData[offset + 6] = color[1];
        vertexData[offset + 7] = color[2];
        vertexData[offset + 8] = color[3];
        vertexCount++;
      };

      // Triangle 1: start-bottom, start-top, end-top
      writeVertex(x1, y1, -1);
      writeVertex(x1, y1, 1);
      writeVertex(x2, y2, 1);

      // Triangle 2: start-bottom, end-top, end-bottom
      writeVertex(x1, y1, -1);
      writeVertex(x2, y2, 1);
      writeVertex(x2, y2, -1);
    }

    // F1 Fix: Defer old buffer destruction
    const bufferSize = vertexCount * 9 * 4;
    if (!this.edgeVertexBuffer || this.edgeVertexCount !== vertexCount) {
      if (this.edgeVertexBuffer) {
        this.pendingBufferDestructions.push(this.edgeVertexBuffer);
      }
      this.edgeVertexBuffer = this.device.createBuffer({
        size: Math.max(bufferSize, 36), // Minimum size
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    if (vertexCount > 0) {
      this.device.queue.writeBuffer(
        this.edgeVertexBuffer,
        0,
        vertexData.subarray(0, vertexCount * 9)
      );
    }
    this.edgeVertexCount = vertexCount;
  }

  render(nodes: GraphNode[], edges: GraphEdge[]) {
    const aspect = this.canvas.width / this.canvas.height;
    this.pipeline.updateCamera(this.camera, aspect, this.canvas.width, this.canvas.height);

    this.updateNodeBuffer(nodes);
    this.updateEdgeBuffer(edges, nodes);

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    const cameraBindGroup = this.pipeline.getCameraBindGroup();

    // Render edges first (behind nodes)
    const edgePipeline = this.pipeline.getEdgePipeline();
    if (edgePipeline && this.edgeVertexBuffer && this.edgeVertexCount > 0 && cameraBindGroup) {
      renderPass.setPipeline(edgePipeline);
      renderPass.setBindGroup(0, cameraBindGroup);
      renderPass.setVertexBuffer(0, this.edgeVertexBuffer);
      renderPass.draw(this.edgeVertexCount);
    }

    // Render nodes
    const nodePipeline = this.pipeline.getNodePipeline();
    if (nodePipeline && this.nodeInstanceBuffer && this.nodeCount > 0 && cameraBindGroup) {
      renderPass.setPipeline(nodePipeline);
      renderPass.setBindGroup(0, cameraBindGroup);
      renderPass.setVertexBuffer(0, this.quadBuffer);
      renderPass.setVertexBuffer(1, this.nodeInstanceBuffer);
      renderPass.draw(6, this.nodeCount); // 6 vertices per quad, N instances
    }

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);

    // F1 Fix: Destroy old buffers after GPU work is submitted
    this.device.queue.onSubmittedWorkDone().then(() => {
      for (const buffer of this.pendingBufferDestructions) {
        buffer.destroy();
      }
      this.pendingBufferDestructions = [];
    });
  }

  destroy() {
    this.quadBuffer.destroy();
    this.nodeInstanceBuffer?.destroy();
    this.edgeVertexBuffer?.destroy();
    this.pipeline.destroy();
    // Destroy any pending buffers
    for (const buffer of this.pendingBufferDestructions) {
      buffer.destroy();
    }
  }
}
