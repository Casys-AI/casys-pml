// Hexagonal shader for instanced hex cell rendering
// Uses SDF (signed distance field) for smooth hexagons

struct Camera {
  offset: vec2<f32>,
  zoom: f32,
  aspect: f32,
}

struct VertexInput {
  @location(0) position: vec2<f32>,  // Quad vertex position (-1 to 1)
}

struct InstanceInput {
  @location(1) center: vec2<f32>,    // Hex center position (clip space)
  @location(2) size: f32,            // Hex radius
  @location(3) level: f32,           // Hierarchy level (for visual effects)
  @location(4) color: vec4<f32>,     // Hex RGBA color
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,        // For SDF hexagon
  @location(1) color: vec4<f32>,
  @location(2) level: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;

// Hexagon SDF - flat-top orientation
fn hexSDF(p: vec2f) -> f32 {
    // Constants for hexagon
    let k = vec3f(-0.866025404, 0.5, 0.577350269); // cos(60°), sin(60°), tan(30°)
    var q = abs(p);
    q = q - 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
    q = q - vec2f(clamp(q.x, -k.z, k.z), 1.0);
    return length(q) * sign(q.y);
}

@vertex
fn vs_main(vertex: VertexInput, instance: InstanceInput) -> VertexOutput {
  var out: VertexOutput;

  // Scale vertex by hex size (expand quad to cover hexagon)
  // Hexagon inscribed in circle of radius 1, so we need 1.15x to cover
  let worldPos = instance.center + vertex.position * instance.size * 1.15;

  // Apply camera transform: offset then zoom
  let viewPos = (worldPos + camera.offset) * camera.zoom;

  // Apply aspect ratio correction
  let clipPos = vec2<f32>(viewPos.x / camera.aspect, viewPos.y);

  out.position = vec4<f32>(clipPos, 0.0, 1.0);
  out.uv = vertex.position * 1.15;  // -1.15 to 1.15 for SDF
  out.color = instance.color;
  out.level = instance.level;

  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // SDF hexagon: distance from center
  let dist = hexSDF(in.uv);

  // Smooth edge with anti-aliasing
  let edge = fwidth(dist) * 1.5;
  let alpha = 1.0 - smoothstep(-edge, edge, dist);

  // Discard pixels outside hexagon
  if (alpha < 0.01) {
    discard;
  }

  // Inner glow based on distance (closer to center = brighter)
  let innerGlow = smoothstep(0.8, 0.0, abs(dist));
  let glowColor = mix(in.color.rgb, in.color.rgb * 1.3, innerGlow * 0.3);

  // Subtle border
  let borderDist = abs(dist);
  let borderAlpha = 1.0 - smoothstep(0.0, 0.08, borderDist);
  let borderColor = mix(glowColor, vec3f(1.0), borderAlpha * 0.4);

  // Level-based dimming for parent hexagons (shown as outlines)
  let levelDim = select(1.0, 0.4, in.level < 0.0);

  return vec4<f32>(borderColor * levelDim, in.color.a * alpha * levelDim);
}
