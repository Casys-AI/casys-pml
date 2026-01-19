/**
 * WorkflowCrystallizationIllustration - Tools → Workflow → Capability
 *
 * Shows how individual tools combine into a workflow,
 * which then crystallizes into a reusable capability.
 *
 * @module web/components/landing/illustrations/WorkflowCrystallizationIllustration
 */

export function WorkflowCrystallizationIllustration() {
  return (
    <div class="workflow-crystal-illustration">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 700 250"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="wf-flow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#FFB86F" stop-opacity="0.1" />
            <stop offset="50%" stop-color="#FFB86F" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#4ade80" stop-opacity="0.2" />
          </linearGradient>
          <radialGradient id="tool-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#FFB86F" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#FFB86F" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="crystal-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#4ade80" stop-opacity="0.4" />
            <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
          </radialGradient>
          <filter id="wf-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
        </defs>

        {/* Background flow */}
        <rect x="50" y="100" width="600" height="50" rx="25" fill="url(#wf-flow)" opacity="0.5" />

        {/* ====== INDIVIDUAL TOOLS (LEFT) ====== */}
        <g transform="translate(100, 125)">
          {/* Tool 1 */}
          <g transform="translate(0, -40)">
            <circle r="28" fill="url(#tool-glow)" />
            <circle r="23" fill="#141418" stroke="#FFB86F" stroke-width="1.5" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#FFB86F"
              font-family="'Geist Mono', monospace"
              font-size="11"
            >
              http
            </text>
          </g>

          {/* Tool 2 */}
          <g transform="translate(0, 40)">
            <circle r="28" fill="url(#tool-glow)" />
            <circle r="23" fill="#141418" stroke="#FFB86F" stroke-width="1.5" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#FFB86F"
              font-family="'Geist Mono', monospace"
              font-size="11"
            >
              json
            </text>
          </g>

          {/* Tool 3 - floating in */}
          <g transform="translate(-50, 0)">
            <circle r="20" fill="#141418" stroke="#FFB86F" stroke-width="1" opacity="0.6" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#FFB86F"
              font-family="'Geist Mono', monospace"
              font-size="10"
              opacity="0.6"
            >
              llm
            </text>
          </g>

          {/* Label */}
          <text
            x="0"
            y="90"
            text-anchor="middle"
            fill="#888888"
            font-family="'Geist Mono', monospace"
            font-size="11"
          >
            TOOLS
          </text>
        </g>

        {/* ====== CONVERGENCE ARROWS ====== */}
        <g stroke="#FFB86F" stroke-width="1.5" opacity="0.6">
          <path d="M130 85 Q 180 100 220 125" fill="none" />
          <path d="M130 165 Q 180 150 220 125" fill="none" />
          <path d="M60 125 Q 120 125 220 125" fill="none" stroke-dasharray="4 3" opacity="0.4" />
        </g>

        {/* ====== WORKFLOW FORMATION (CENTER) ====== */}
        <g transform="translate(300, 125)">
          {/* Workflow container */}
          <rect
            x="-80"
            y="-40"
            width="160"
            height="80"
            rx="8"
            fill="#141418"
            stroke="#FFB86F"
            stroke-width="2"
            stroke-dasharray="8 4"
          />

          {/* Connected steps inside */}
          <g transform="translate(-50, 0)">
            <circle r="17" fill="#0a0908" stroke="#FFB86F" stroke-width="1.5" />
            <text x="0" y="5" text-anchor="middle" fill="#FFB86F" font-size="12" font-family="monospace" font-weight="600">1</text>
          </g>

          <path d="M-28 0 L -12 0" stroke="#FFB86F" stroke-width="1.5" />

          <g transform="translate(0, 0)">
            <circle r="17" fill="#0a0908" stroke="#FFB86F" stroke-width="1.5" />
            <text x="0" y="5" text-anchor="middle" fill="#FFB86F" font-size="12" font-family="monospace" font-weight="600">2</text>
          </g>

          <path d="M18 0 L 32 0" stroke="#FFB86F" stroke-width="1.5" />

          <g transform="translate(50, 0)">
            <circle r="17" fill="#0a0908" stroke="#FFB86F" stroke-width="1.5" />
            <text x="0" y="5" text-anchor="middle" fill="#FFB86F" font-size="12" font-family="monospace" font-weight="600">3</text>
          </g>

          {/* Orbiting particle showing execution */}
          <circle r="3" fill="#FFB86F">
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              {...{ path: "M-50 0 L 0 0 L 50 0" }}
            />
          </circle>

          {/* Label */}
          <text
            x="0"
            y="60"
            text-anchor="middle"
            fill="#FFB86F"
            font-family="'Geist Mono', monospace"
            font-size="11"
          >
            WORKFLOW
          </text>

          {/* "Discovered" badge */}
          <g transform="translate(0, -55)">
            <rect x="-42" y="-10" width="84" height="20" rx="10" fill="#FFB86F" opacity="0.2" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#FFB86F"
              font-family="'Geist Mono', monospace"
              font-size="10"
            >
              DISCOVERED
            </text>
          </g>
        </g>

        {/* ====== CRYSTALLIZATION ARROW ====== */}
        <g transform="translate(430, 125)">
          <path d="M0 0 L 50 0" stroke="#a78bfa" stroke-width="2" />
          <polygon points="60,0 50,-5 50,5" fill="#a78bfa" />

          {/* Sparkles around arrow */}
          <circle cx="20" cy="-10" r="2" fill="#a78bfa" opacity="0.6">
            <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx="35" cy="8" r="1.5" fill="#a78bfa" opacity="0.4">
            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.5s" repeatCount="indefinite" />
          </circle>

          {/* Label */}
          <text
            x="30"
            y="-20"
            text-anchor="middle"
            fill="#a78bfa"
            font-family="'Geist Mono', monospace"
            font-size="10"
          >
            crystallize
          </text>
        </g>

        {/* ====== CAPABILITY CRYSTAL (RIGHT) ====== */}
        <g transform="translate(550, 125)">
          {/* Glow */}
          <circle r="60" fill="url(#crystal-glow)" />

          {/* Crystal shape */}
          <polygon
            points="0,-45 27,-22 27,22 0,45 -27,22 -27,-22"
            fill="#141418"
            stroke="#4ade80"
            stroke-width="2.5"
          />

          {/* Inner facets */}
          <line x1="0" y1="-45" x2="0" y2="45" stroke="#4ade80" stroke-width="1" opacity="0.3" />
          <line x1="-27" y1="-22" x2="27" y2="22" stroke="#4ade80" stroke-width="1" opacity="0.3" />
          <line x1="-27" y1="22" x2="27" y2="-22" stroke="#4ade80" stroke-width="1" opacity="0.3" />

          {/* Pulsing core */}
          <circle r="12" fill="#4ade80" opacity="0.3">
            <animate attributeName="r" values="10;15;10" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r="6" fill="#4ade80" />

          {/* Sparkle */}
          <circle cx="10" cy="-20" r="3" fill="#fff" opacity="0.8">
            <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.5s" repeatCount="indefinite" />
          </circle>

          {/* Label */}
          <text
            x="0"
            y="70"
            text-anchor="middle"
            fill="#4ade80"
            font-family="'Geist Mono', monospace"
            font-size="12"
            font-weight="600"
          >
            CAPABILITY
          </text>

          {/* Capability name */}
          <text
            x="0"
            y="88"
            text-anchor="middle"
            fill="#4ade80"
            font-family="'Geist Mono', monospace"
            font-size="11"
            opacity="0.8"
          >
            fetch:summarize
          </text>
        </g>

        {/* ====== REUSE INDICATOR ====== */}
        <g transform="translate(550, 30)">
          <path
            d="M30 0 Q 60 0 60 30 Q 60 60 30 60"
            stroke="#4ade80"
            stroke-width="2"
            stroke-dasharray="4 3"
            fill="none"
            opacity="0.6"
          />
          <polygon points="25,60 35,55 35,65" fill="#4ade80" opacity="0.6" />
          <text
            x="80"
            y="35"
            fill="#4ade80"
            font-family="'Geist Mono', monospace"
            font-size="10"
            opacity="0.8"
          >
            reuse
          </text>
        </g>

        {/* Particle animation from tools through workflow to crystal */}
        <circle r="4" fill="#FFB86F" filter="url(#wf-blur)">
          <animateMotion
            dur="4s"
            repeatCount="indefinite"
            {...{ path: "M100 85 Q 200 125 300 125 Q 400 125 550 125" }}
          />
          <animate attributeName="fill" values="#FFB86F;#a78bfa;#4ade80" dur="4s" repeatCount="indefinite" />
        </circle>
      </svg>

      <style>
        {`
        .workflow-crystal-illustration {
          width: 100%;
          max-width: 900px;
          aspect-ratio: 14 / 5;
        }
        `}
      </style>
    </div>
  );
}
