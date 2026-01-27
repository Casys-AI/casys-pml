// Node shader for instanced circle rendering
// Uses SDF (signed distance field) for smooth circles

struct Camera {
  offset: vec2<f32>,
  zoom: f32,
  aspect: f32,
}

struct VertexInput {
  @location(0) position: vec2<f32>,  // Quad vertex position (-1 to 1)
}

struct InstanceInput {
  @location(1) center: vec2<f32>,    // Node center position
  @location(2) size: f32,            // Node radius
  @location(3) color: vec4<f32>,     // Node RGBA color
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,        // For SDF circle
  @location(1) color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> camera: Camera;

@vertex
fn vs_main(vertex: VertexInput, instance: InstanceInput) -> VertexOutput {
  var out: VertexOutput;

  // Scale vertex by node size and position at node center
  let worldPos = instance.center + vertex.position * instance.size;

  // Apply camera transform: offset then zoom
  let viewPos = (worldPos + camera.offset) * camera.zoom;

  // Apply aspect ratio correction
  let clipPos = vec2<f32>(viewPos.x / camera.aspect, viewPos.y);

  out.position = vec4<f32>(clipPos, 0.0, 1.0);
  out.uv = vertex.position;  // -1 to 1 for SDF
  out.color = instance.color;

  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // SDF circle: distance from center
  let dist = length(in.uv);

  // Smooth circle edge with anti-aliasing
  let edge = fwidth(dist) * 1.5;
  let alpha = 1.0 - smoothstep(1.0 - edge, 1.0, dist);

  // Discard pixels outside circle
  if (alpha < 0.01) {
    discard;
  }

  // Apply alpha to color
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
