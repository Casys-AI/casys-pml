// @ts-nocheck
export function GraphRAGIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="node-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 150) rotate(90) scale(120)">
          <stop stop-color="#FFB86F" stop-opacity="0.2"/>
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0"/>
        </radialGradient>
        <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4"/>
        </filter>
      </defs>

      {/* Background Glow */}
      <circle cx="200" cy="150" r="100" fill="url(#node-glow)" />

      {/* Network Connections */}
      <g stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3">
        {/* Central Hub Connections */}
        <line x1="200" y1="150" x2="100" y2="80" />
        <line x1="200" y1="150" x2="300" y2="80" />
        <line x1="200" y1="150" x2="100" y2="220" />
        <line x1="200" y1="150" x2="300" y2="220" />
        <line x1="200" y1="150" x2="50" y2="150" />
        <line x1="200" y1="150" x2="350" y2="150" />
        
        {/* Secondary Connections */}
        <line x1="100" y1="80" x2="150" y2="40" />
        <line x1="300" y1="80" x2="250" y2="40" />
        <line x1="100" y1="220" x2="150" y2="260" />
        <line x1="300" y1="220" x2="250" y2="260" />
        <line x1="100" y1="80" x2="50" y2="150" />
        <line x1="300" y1="80" x2="350" y2="150" />
      </g>

      {/* Active Data Packets */}
      <circle cx="150" cy="115" r="3" fill="#FFB86F">
        <animate attributeName="cx" values="200;100" dur="2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="150;80" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="250" cy="185" r="3" fill="#FFB86F">
        <animate attributeName="cx" values="200;300" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="cy" values="150;220" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0" dur="2.5s" repeatCount="indefinite" />
      </circle>

      {/* Nodes */}
      <g fill="#0a0908" stroke="#FFB86F" stroke-width="2">
        {/* Center Node */}
        <circle cx="200" cy="150" r="20" stroke-width="4" />
        
        {/* Surrounding Nodes */}
        <circle cx="100" cy="80" r="10" />
        <circle cx="300" cy="80" r="10" />
        <circle cx="100" cy="220" r="10" />
        <circle cx="300" cy="220" r="10" />
        <circle cx="50" cy="150" r="8" />
        <circle cx="350" cy="150" r="8" />
        <circle cx="150" cy="40" r="6" />
        <circle cx="250" cy="40" r="6" />
        <circle cx="150" cy="260" r="6" />
        <circle cx="250" cy="260" r="6" />
      </g>

      {/* Node Centers */}
      <circle cx="200" cy="150" r="8" fill="#FFB86F" />
      <circle cx="100" cy="80" r="4" fill="#FFB86F" fill-opacity="0.6" />
      <circle cx="300" cy="80" r="4" fill="#FFB86F" fill-opacity="0.6" />
      <circle cx="100" cy="220" r="4" fill="#FFB86F" fill-opacity="0.6" />
      <circle cx="300" cy="220" r="4" fill="#FFB86F" fill-opacity="0.6" />
    </svg>
  );
}

export function DAGIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dag-flow" x1="0" y1="150" x2="400" y2="150" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFB86F" stop-opacity="0.1"/>
          <stop offset="0.5" stop-color="#FFB86F" stop-opacity="0.6"/>
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0.1"/>
        </linearGradient>
      </defs>

      {/* Pipelines */}
      <path d="M50 150 C 100 150, 100 80, 150 80 L 250 80 C 300 80, 300 150, 350 150" 
            stroke="url(#dag-flow)" stroke-width="4" fill="none" />
      <path d="M50 150 C 100 150, 100 220, 150 220 L 250 220 C 300 220, 300 150, 350 150" 
            stroke="url(#dag-flow)" stroke-width="4" fill="none" />
      <path d="M50 150 L 350 150" 
            stroke="url(#dag-flow)" stroke-width="2" stroke-dasharray="8 8" fill="none" opacity="0.3" />

      {/* Processing Blocks */}
      <g fill="#0a0908" stroke="#FFB86F" stroke-width="2">
        <rect x="130" y="60" width="40" height="40" rx="8" />
        <rect x="230" y="60" width="40" height="40" rx="8" />
        
        <rect x="130" y="200" width="40" height="40" rx="8" />
        <rect x="230" y="200" width="40" height="40" rx="8" />
        
        <rect x="30" y="130" width="40" height="40" rx="8" />
        <rect x="330" y="130" width="40" height="40" rx="8" />
      </g>

      {/* Status Indicators */}
      <circle cx="150" cy="80" r="6" fill="#FFB86F" />
      <circle cx="250" cy="80" r="6" fill="#FFB86F" />
      <circle cx="150" cy="220" r="6" fill="#FFB86F" />
      <circle cx="250" cy="220" r="6" fill="#FFB86F" />
      
      {/* Moving Data Particles */}
      <circle r="4" fill="#FFB86F">
        {/* @ts-ignore - path is valid SVG attribute */}
        <animateMotion dur="3s" repeatCount="indefinite"
          path="M50 150 C 100 150, 100 80, 150 80 L 250 80 C 300 80, 300 150, 350 150" />
      </circle>
      <circle r="4" fill="#FFB86F">
        {/* @ts-ignore - path is valid SVG attribute */}
        <animateMotion dur="3s" begin="1.5s" repeatCount="indefinite"
          path="M50 150 C 100 150, 100 220, 150 220 L 250 220 C 300 220, 300 150, 350 150" />
      </circle>
    </svg>
  );
}

export function SandboxIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Isometric Cube/Container */}
      <g transform="translate(200 150)">
        {/* Back Faces */}
        <path d="M-80 -40 L 0 -80 L 80 -40 L 80 60 L 0 100 L -80 60 Z" 
              fill="#FFB86F" fill-opacity="0.03" stroke="#FFB86F" stroke-width="1" stroke-dasharray="4 4"/>
        
        {/* Inner Shield */}
        <path d="M0 -30 L 40 -10 V 30 L 0 50 L -40 30 V -10 Z" 
              fill="#0a0908" stroke="#FFB86F" stroke-width="3" />
        
        {/* Code Symbol inside Shield */}
        <path d="M-15 10 L -25 20 L -15 30 M 15 10 L 25 20 L 15 30 M -5 35 L 5 5"
              stroke="#FFB86F" stroke-width="2" stroke-linecap="round" />

        {/* Outer Frame (Front) */}
        <path d="M-90 -45 L 0 -90 L 90 -45 L 90 65 L 0 110 L -90 65 Z" 
              stroke="#FFB86F" stroke-width="2" fill="none" />
              
        {/* Scanning Effect */}
        <path d="M-90 0 L 0 -45 L 90 0 L 0 45 Z" fill="#FFB86F" fill-opacity="0.1">
          {/* @ts-ignore - valid SVG animation */}
          <animateTransform attributeName="transform" type="translate"
            values="0 -40; 0 60; 0 -40" dur="4s" repeatCount="indefinite" />
           {/* @ts-ignore - valid SVG animation */}
          <animate attributeName="opacity" values="0;0.5;0" dur="4s" repeatCount="indefinite" />
        </path>

        {/* Corner Accents */}
        <circle cx="-90" cy="-45" r="3" fill="#FFB86F" />
        <circle cx="0" cy="-90" r="3" fill="#FFB86F" />
        <circle cx="90" cy="-45" r="3" fill="#FFB86F" />
        <circle cx="90" cy="65" r="3" fill="#FFB86F" />
        <circle cx="0" cy="110" r="3" fill="#FFB86F" />
        <circle cx="-90" cy="65" r="3" fill="#FFB86F" />
      </g>
    </svg>
  );
}

export function SearchIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="search-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#FFB86F" stop-opacity="0.2"/>
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0"/>
        </linearGradient>
      </defs>

      {/* Central Search Node */}
      <g transform="translate(200, 150)">
        <circle r="40" fill="url(#search-gradient)" stroke="#FFB86F" stroke-width="2" />
        <circle r="20" fill="#FFB86F" fill-opacity="0.2">
          {/* @ts-ignore */}
          <animate attributeName="r" values="20;25;20" dur="2s" repeatCount="indefinite" />
          {/* @ts-ignore */}
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Search Icon / Magnifying Glass motif */}
        <path d="M-10 -10 L 10 10 M 5 -5 L 15 -15" stroke="#FFB86F" stroke-width="3" stroke-linecap="round" />
      </g>

      {/* Orbiting Result Nodes */}
      <g>
        <circle r="6" fill="#FFB86F">
          {/* @ts-ignore */}
          <animateMotion dur="4s" repeatCount="indefinite" path="M200 150 m-80 0 a 80 80 0 1 0 160 0 a 80 80 0 1 0 -160 0" />
        </circle>
        <circle r="4" fill="#FFB86F" fill-opacity="0.6">
          {/* @ts-ignore */}
          <animateMotion dur="6s" repeatCount="indefinite" path="M200 150 m-60 40 a 70 50 0 1 0 120 -80 a 70 50 0 1 0 -120 80" />
        </circle>
      </g>

      {/* Connecting Lines (Semantic Links) */}
      <path d="M120 150 L 280 150 M 200 70 L 200 230" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.2" stroke-dasharray="4 4" />
    </svg>
  );
}

export function HILIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hil-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 150) scale(100)">
          <stop stop-color="#FFB86F" stop-opacity="0.15"/>
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0"/>
        </linearGradient>
      </defs>

      {/* Background glow */}
      <circle cx="200" cy="150" r="100" fill="url(#hil-glow)" />

      {/* Workflow line - paused */}
      <path d="M50 150 L 150 150" stroke="#FFB86F" stroke-width="3" stroke-opacity="0.4" />
      <path d="M250 150 L 350 150" stroke="#FFB86F" stroke-width="3" stroke-opacity="0.4" stroke-dasharray="8 4" />

      {/* Central Checkpoint Hexagon */}
      <g transform="translate(200, 150)">
        <polygon points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25"
                 fill="#0a0908" stroke="#FFB86F" stroke-width="3" />

        {/* Pulsing inner */}
        <polygon points="0,-35 30,-17 30,17 0,35 -30,17 -30,-17"
                 fill="#FFB86F" fill-opacity="0.1">
          <animate attributeName="fill-opacity" values="0.1;0.3;0.1" dur="2s" repeatCount="indefinite" />
        </polygon>

        {/* Human icon */}
        <circle cx="0" cy="-8" r="8" fill="#FFB86F" />
        <path d="M-12 20 L 0 8 L 12 20" stroke="#FFB86F" stroke-width="3" fill="none" stroke-linecap="round" />
      </g>

      {/* Approve button */}
      <g transform="translate(130, 220)">
        <rect x="-30" y="-15" width="60" height="30" rx="6" fill="#0a0908" stroke="#4ade80" stroke-width="2" />
        <text x="0" y="5" text-anchor="middle" fill="#4ade80" font-family="sans-serif" font-size="12" font-weight="bold">✓ OK</text>
        <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
      </g>

      {/* Reject button */}
      <g transform="translate(270, 220)">
        <rect x="-30" y="-15" width="60" height="30" rx="6" fill="#0a0908" stroke="#f87171" stroke-width="2" />
        <text x="0" y="5" text-anchor="middle" fill="#f87171" font-family="sans-serif" font-size="12" font-weight="bold">✗ NO</text>
      </g>

      {/* Waiting indicator */}
      <g transform="translate(200, 80)">
        <circle r="4" fill="#FFB86F">
          <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <text x="0" y="-15" text-anchor="middle" fill="#d5c3b5" font-family="sans-serif" font-size="10">AWAITING</text>
      </g>
    </svg>
  );
}

export function ThreeLoopIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="loop1-grad" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#FFB86F" stop-opacity="0.8"/>
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0.2"/>
        </linearGradient>
        <linearGradient id="loop2-grad" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#a78bfa" stop-opacity="0.8"/>
          <stop offset="1" stop-color="#a78bfa" stop-opacity="0.2"/>
        </linearGradient>
        <linearGradient id="loop3-grad" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#34d399" stop-opacity="0.8"/>
          <stop offset="1" stop-color="#34d399" stop-opacity="0.2"/>
        </linearGradient>
      </defs>

      {/* Loop 3 - Outer (Meta-Learning) */}
      <ellipse cx="200" cy="150" rx="150" ry="100" fill="none" stroke="url(#loop3-grad)" stroke-width="2" stroke-dasharray="12 6" />
      <circle r="5" fill="#34d399">
        <animateMotion dur="8s" repeatCount="indefinite" path="M200 150 m-150 0 a 150 100 0 1 0 300 0 a 150 100 0 1 0 -300 0" />
      </circle>

      {/* Loop 2 - Middle (Adaptation) */}
      <ellipse cx="200" cy="150" rx="100" ry="65" fill="none" stroke="url(#loop2-grad)" stroke-width="2" />
      <circle r="5" fill="#a78bfa">
        <animateMotion dur="5s" repeatCount="indefinite" path="M200 150 m-100 0 a 100 65 0 1 0 200 0 a 100 65 0 1 0 -200 0" />
      </circle>

      {/* Loop 1 - Inner (Execution) */}
      <ellipse cx="200" cy="150" rx="50" ry="35" fill="none" stroke="url(#loop1-grad)" stroke-width="3" />
      <circle r="5" fill="#FFB86F">
        <animateMotion dur="2s" repeatCount="indefinite" path="M200 150 m-50 0 a 50 35 0 1 0 100 0 a 50 35 0 1 0 -100 0" />
      </circle>

      {/* Center Core */}
      <circle cx="200" cy="150" r="15" fill="#0a0908" stroke="#FFB86F" stroke-width="2" />
      <circle cx="200" cy="150" r="6" fill="#FFB86F">
        <animate attributeName="r" values="5;7;5" dur="1.5s" repeatCount="indefinite" />
      </circle>

      {/* Labels */}
      <text x="200" y="45" text-anchor="middle" fill="#34d399" font-family="sans-serif" font-size="11" font-weight="bold">META-LEARNING</text>
      <text x="200" y="75" text-anchor="middle" fill="#a78bfa" font-family="sans-serif" font-size="11" font-weight="bold">ADAPTATION</text>
      <text x="200" y="105" text-anchor="middle" fill="#FFB86F" font-family="sans-serif" font-size="11" font-weight="bold">EXECUTION</text>

      {/* Arrows showing flow */}
      <path d="M355 150 L 365 145 L 365 155 Z" fill="#34d399" fill-opacity="0.6" />
      <path d="M305 150 L 315 145 L 315 155 Z" fill="#a78bfa" fill-opacity="0.8" />
      <path d="M255 150 L 265 145 L 265 155 Z" fill="#FFB86F" />
    </svg>
  );
}

export function CapabilitiesIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="crystal-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#FFB86F" stop-opacity="0.4"/>
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0.1"/>
        </linearGradient>
        <filter id="crystal-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4"/>
        </filter>
      </defs>

      {/* Code snippets floating (before crystallization) */}
      <g opacity="0.4">
        <text x="80" y="80" fill="#d5c3b5" font-family="monospace" font-size="10">await mcp.read()</text>
        <text x="250" y="60" fill="#d5c3b5" font-family="monospace" font-size="10">json.parse()</text>
        <text x="60" y="220" fill="#d5c3b5" font-family="monospace" font-size="10">github.issue()</text>
        <text x="280" y="240" fill="#d5c3b5" font-family="monospace" font-size="10">memory.store()</text>
      </g>

      {/* Animated particles moving toward center */}
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="3s" repeatCount="indefinite" path="M80 80 Q 140 120 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="3.5s" repeatCount="indefinite" path="M280 60 Q 240 100 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="3.5s" repeatCount="indefinite" />
      </circle>
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="4s" repeatCount="indefinite" path="M60 220 Q 130 180 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="3.8s" repeatCount="indefinite" path="M300 240 Q 250 190 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="3.8s" repeatCount="indefinite" />
      </circle>

      {/* Central Crystal (Capability) */}
      <g transform="translate(200, 150)">
        {/* Glow behind */}
        <polygon points="0,-50 30,-20 30,20 0,50 -30,20 -30,-20"
                 fill="#FFB86F" fill-opacity="0.2" filter="url(#crystal-glow)" />

        {/* Crystal shape */}
        <polygon points="0,-50 30,-20 30,20 0,50 -30,20 -30,-20"
                 fill="url(#crystal-gradient)" stroke="#FFB86F" stroke-width="2" />

        {/* Inner facets */}
        <line x1="0" y1="-50" x2="0" y2="50" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
        <line x1="-30" y1="-20" x2="30" y2="20" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
        <line x1="-30" y1="20" x2="30" y2="-20" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />

        {/* Sparkle */}
        <circle cx="10" cy="-25" r="3" fill="#fff" fill-opacity="0.8">
          <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Pulsing core */}
        <circle cx="0" cy="0" r="8" fill="#FFB86F">
          <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Label */}
      <text x="200" y="225" text-anchor="middle" fill="#FFB86F" font-family="sans-serif" font-size="12" font-weight="bold">CAPABILITY</text>
      <text x="200" y="240" text-anchor="middle" fill="#d5c3b5" font-family="sans-serif" font-size="10">Crystallized from execution</text>
    </svg>
  );
}

export function HypergraphIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hyperedge-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#8b5cf6" stop-opacity="0.3"/>
          <stop offset="1" stop-color="#8b5cf6" stop-opacity="0.1"/>
        </linearGradient>
      </defs>

      {/* Hyperedge 1 - Capability container (violet) */}
      <g transform="translate(120, 120)">
        <ellipse cx="0" cy="0" rx="80" ry="50" fill="url(#hyperedge-gradient)" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4 2" />

        {/* Tools inside hyperedge */}
        <circle cx="-40" cy="-10" r="15" fill="#0a0908" stroke="#FFB86F" stroke-width="2" />
        <text x="-40" y="-6" text-anchor="middle" fill="#FFB86F" font-family="monospace" font-size="8">fs</text>

        <circle cx="10" cy="15" r="15" fill="#0a0908" stroke="#FFB86F" stroke-width="2" />
        <text x="10" y="19" text-anchor="middle" fill="#FFB86F" font-family="monospace" font-size="8">json</text>

        <circle cx="40" cy="-15" r="15" fill="#0a0908" stroke="#FFB86F" stroke-width="2" />
        <text x="40" y="-11" text-anchor="middle" fill="#FFB86F" font-family="monospace" font-size="8">gh</text>

        {/* Label */}
        <text x="0" y="60" text-anchor="middle" fill="#8b5cf6" font-family="sans-serif" font-size="10" font-weight="bold">Cap: Create Issue</text>
      </g>

      {/* Hyperedge 2 */}
      <g transform="translate(280, 180)">
        <ellipse cx="0" cy="0" rx="60" ry="40" fill="url(#hyperedge-gradient)" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4 2" />

        <circle cx="-25" cy="0" r="12" fill="#0a0908" stroke="#FFB86F" stroke-width="2" />
        <text x="-25" y="4" text-anchor="middle" fill="#FFB86F" font-family="monospace" font-size="7">fs</text>

        <circle cx="25" cy="0" r="12" fill="#0a0908" stroke="#FFB86F" stroke-width="2" />
        <text x="25" y="4" text-anchor="middle" fill="#FFB86F" font-family="monospace" font-size="7">yaml</text>

        <text x="0" y="50" text-anchor="middle" fill="#8b5cf6" font-family="sans-serif" font-size="10" font-weight="bold">Cap: Parse Config</text>
      </g>

      {/* Shared tool connection (fs is in both) */}
      <path d="M80 110 Q 180 140 220 180" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.4" stroke-dasharray="4 4" />

      {/* Legend */}
      <g transform="translate(30, 250)">
        <circle cx="0" cy="0" r="6" fill="#0a0908" stroke="#FFB86F" stroke-width="1" />
        <text x="15" y="4" fill="#d5c3b5" font-family="sans-serif" font-size="9">= Tool</text>

        <ellipse cx="100" cy="0" rx="20" ry="10" fill="none" stroke="#8b5cf6" stroke-width="1" stroke-dasharray="2 1" />
        <text x="130" y="4" fill="#d5c3b5" font-family="sans-serif" font-size="9">= Capability (Hyperedge)</text>
      </g>

      {/* Title */}
      <text x="200" y="30" text-anchor="middle" fill="#8b5cf6" font-family="sans-serif" font-size="12" font-weight="bold">N-ary Relationships</text>
    </svg>
  );
}

export function OrchestratorIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="brain-glow" cx="0.5" cy="0.5" r="0.5">
          <stop stop-color="#FFB86F" stop-opacity="0.2"/>
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0"/>
        </radialGradient>
      </defs>

      {/* Claude Brain (top) */}
      <g transform="translate(200, 70)">
        <circle r="40" fill="url(#brain-glow)" />
        <circle r="30" fill="#0a0908" stroke="#FFB86F" stroke-width="3" />

        {/* Brain pattern */}
        <path d="M-15 -10 Q -5 -20 5 -10 Q 15 0 5 10 Q -5 20 -15 10" stroke="#FFB86F" stroke-width="2" fill="none" stroke-opacity="0.6" />
        <path d="M5 -15 Q 15 -5 5 5 Q -5 15 5 20" stroke="#FFB86F" stroke-width="2" fill="none" stroke-opacity="0.6" />

        {/* Crown hint */}
        <path d="M-20 -35 L -10 -25 L 0 -35 L 10 -25 L 20 -35" stroke="#FFB86F" stroke-width="2" fill="none" />

        <text x="0" y="55" text-anchor="middle" fill="#FFB86F" font-family="sans-serif" font-size="11" font-weight="bold">CLAUDE</text>
        <text x="0" y="68" text-anchor="middle" fill="#d5c3b5" font-family="sans-serif" font-size="9">Strategic Orchestrator</text>
      </g>

      {/* Delegation arrow */}
      <path d="M200 110 L 200 160" stroke="#FFB86F" stroke-width="2" stroke-dasharray="6 4" />
      <polygon points="200,170 195,160 205,160" fill="#FFB86F" />
      <text x="230" y="145" fill="#d5c3b5" font-family="sans-serif" font-size="9">delegate</text>

      {/* Gateway (middle) */}
      <g transform="translate(200, 200)">
        <rect x="-70" y="-25" width="140" height="50" rx="8" fill="#12110f" stroke="#FFB86F" stroke-width="2" />
        <text x="0" y="5" text-anchor="middle" fill="#FFB86F" font-family="sans-serif" font-size="12" font-weight="bold">CAI GATEWAY</text>

        {/* Processing indicator */}
        <rect x="-55" y="12" width="110" height="4" rx="2" fill="#FFB86F" fill-opacity="0.2" />
        <rect x="-55" y="12" width="60" height="4" rx="2" fill="#FFB86F">
          <animate attributeName="width" values="20;110;20" dur="2s" repeatCount="indefinite" />
        </rect>
      </g>

      {/* Return arrow */}
      <path d="M270 200 Q 320 200 320 145 Q 320 90 270 90" stroke="#34d399" stroke-width="2" fill="none" />
      <polygon points="270,85 280,90 270,95" fill="#34d399" />
      <text x="335" y="150" fill="#34d399" font-family="sans-serif" font-size="9">summary</text>
      <text x="335" y="162" fill="#d5c3b5" font-family="sans-serif" font-size="8">~100 tokens</text>

      {/* MCP Servers (bottom) */}
      <g transform="translate(200, 270)">
        <rect x="-90" y="-12" width="50" height="24" rx="4" fill="#0a0908" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.5" />
        <text x="-65" y="4" text-anchor="middle" fill="#d5c3b5" font-family="sans-serif" font-size="8">fs</text>

        <rect x="-25" y="-12" width="50" height="24" rx="4" fill="#0a0908" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.5" />
        <text x="0" y="4" text-anchor="middle" fill="#d5c3b5" font-family="sans-serif" font-size="8">github</text>

        <rect x="40" y="-12" width="50" height="24" rx="4" fill="#0a0908" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.5" />
        <text x="65" y="4" text-anchor="middle" fill="#d5c3b5" font-family="sans-serif" font-size="8">db</text>
      </g>

      {/* Connections to MCP */}
      <path d="M200 225 L 135 258" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
      <path d="M200 225 L 200 258" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
      <path d="M200 225 L 265 258" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
    </svg>
  );
}
