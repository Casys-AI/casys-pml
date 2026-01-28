// Edge shader for line segment rendering
// Uses line width expansion for thick lines

struct Camera {
  offset: vec2<f32>,
  zoom: f32,
  aspect: f32,
}

struct VertexInput {
  @location(0) position: vec2<f32>,   // Line endpoint position
  @location(1) direction: vec2<f32>,  // Perpendicular direction for width
  @location(2) side: f32,             // -1 or 1 for line expansion
  @location(3) color: vec4<f32>,      // Edge RGBA color
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> camera: Camera;

const LINE_WIDTH: f32 = 0.003;  // Base line width in clip space

@vertex
fn vs_main(vertex: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  // Apply camera transform
  let viewPos = (vertex.position + camera.offset) * camera.zoom;
  let clipPos = vec2<f32>(viewPos.x / camera.aspect, viewPos.y);

  // Expand line perpendicular to direction
  let perpendicular = vec2<f32>(-vertex.direction.y, vertex.direction.x);
  let expandedPos = clipPos + perpendicular * vertex.side * LINE_WIDTH;

  out.position = vec4<f32>(expandedPos, 0.0, 1.0);
  out.color = vertex.color;

  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return in.color;
}
