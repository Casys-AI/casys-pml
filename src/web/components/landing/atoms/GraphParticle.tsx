/**
 * GraphParticle - Animated particle for path visualization
 *
 * A glowing dot that follows a path through the graph,
 * representing intelligent pathfinding/discovery.
 *
 * @module web/components/landing/atoms/GraphParticle
 */

export interface GraphParticleProps {
  path: string; // SVG path string
  color: string;
  size?: number;
  duration?: number;
  delay?: number;
}

export function GraphParticle({
  path,
  color,
  size = 4,
  duration = 4,
  delay = 0,
}: GraphParticleProps) {
  return (
    <g class="gp" filter="url(#particleGlow)">
      {/* Trail effect */}
      <circle r={size * 0.6} fill={color} opacity="0.3">
        <animateMotion
          dur={`${duration}s`}
          repeatCount="indefinite"
          begin={`${delay - 0.1}s`}
          path={path}
        />
      </circle>

      {/* Main particle */}
      <circle r={size} fill={color} opacity="0.9">
        <animateMotion
          dur={`${duration}s`}
          repeatCount="indefinite"
          begin={`${delay}s`}
          path={path}
        />
      </circle>

      {/* Core glow */}
      <circle r={size * 0.5} fill="#fff" opacity="0.6">
        <animateMotion
          dur={`${duration}s`}
          repeatCount="indefinite"
          begin={`${delay}s`}
          path={path}
        />
      </circle>
    </g>
  );
}
