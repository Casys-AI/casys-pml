/**
 * IsolationIllustration - Sandbox → Checkpoint → Protected Resources
 *
 * Shows how AI actions run in isolation, passing through controlled
 * checkpoints before accessing tools and data.
 *
 * Layout: 650x280 viewBox divided into 3 zones:
 * - Left (x=120): Sandbox box with AI action circles
 * - Center (x=325): Checkpoint gate with shield/lock
 * - Right (x=530): Protected resources (files, db, api, shell)
 *
 * Colors: Violet (#a78bfa) for sandbox/checkpoint, Green (#4ade80) for protected
 *
 * @module web/components/landing/illustrations/IsolationIllustration
 */

export function IsolationIllustration() {
  return (
    <div class="isolation-illustration">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 650 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Illustration showing AI actions in a sandbox passing through a security checkpoint before accessing protected tools and data"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="iso-flow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.1" />
            <stop offset="50%" stop-color="#a78bfa" stop-opacity="0.2" />
            <stop offset="100%" stop-color="#4ade80" stop-opacity="0.15" />
          </linearGradient>
          <radialGradient id="sandbox-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.15" />
            <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="checkpoint-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.4" />
            <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="protected-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#4ade80" stop-opacity="0.2" />
            <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
          </radialGradient>
          <filter id="iso-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
        </defs>

        {/* Background flow line */}
        <rect x="60" y="120" width="530" height="40" rx="20" fill="url(#iso-flow)" opacity="0.5" />

        {/* ====== SANDBOX BOX (LEFT) ====== */}
        <g transform="translate(120, 140)">
          {/* Glow */}
          <ellipse cx="0" cy="0" rx="80" ry="70" fill="url(#sandbox-glow)" />

          {/* Sandbox container */}
          <rect
            x="-70"
            y="-60"
            width="140"
            height="120"
            rx="12"
            fill="#141418"
            stroke="#a78bfa"
            stroke-width="2"
            stroke-dasharray="8 4"
          />

          {/* Label */}
          <text
            x="0"
            y="-70"
            text-anchor="middle"
            fill="#a78bfa"
            font-family="'Geist Mono', monospace"
            font-size="10"
            font-weight="500"
          >
            SANDBOX
          </text>

          {/* AI Action circles inside sandbox */}
          <g transform="translate(-30, -20)">
            <circle r="18" fill="#0a0908" stroke="#a78bfa" stroke-width="1.5" opacity="0.9" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#a78bfa"
              font-family="'Geist Mono', monospace"
              font-size="9"
            >
              fetch
            </text>
          </g>

          <g transform="translate(25, -15)">
            <circle r="16" fill="#0a0908" stroke="#a78bfa" stroke-width="1.5" opacity="0.7" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#a78bfa"
              font-family="'Geist Mono', monospace"
              font-size="8"
            >
              parse
            </text>
          </g>

          <g transform="translate(-10, 30)">
            <circle r="15" fill="#0a0908" stroke="#a78bfa" stroke-width="1.5" opacity="0.6" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#a78bfa"
              font-family="'Geist Mono', monospace"
              font-size="8"
            >
              llm
            </text>
          </g>

          <g transform="translate(35, 25)">
            <circle r="12" fill="#0a0908" stroke="#a78bfa" stroke-width="1" opacity="0.5" />
            <text
              x="0"
              y="3"
              text-anchor="middle"
              fill="#a78bfa"
              font-family="'Geist Mono', monospace"
              font-size="7"
            >
              run
            </text>
          </g>

          {/* Label underneath */}
          <text
            x="0"
            y="85"
            text-anchor="middle"
            fill="#888888"
            font-family="'Geist Mono', monospace"
            font-size="10"
          >
            AI ACTIONS
          </text>
        </g>

        {/* ====== ARROW TO CHECKPOINT ====== */}
        <g stroke="#a78bfa" stroke-width="1.5" opacity="0.6">
          <path d="M195 140 Q 240 140 280 140" fill="none" />
          <polygon points="285,140 275,135 275,145" fill="#a78bfa" opacity="0.6" />
        </g>

        {/* ====== CHECKPOINT GATE (CENTER) ====== */}
        <g transform="translate(325, 140)">
          {/* Glow */}
          <circle r="55" fill="url(#checkpoint-glow)" />

          {/* Shield shape */}
          <path
            d="M0 -40 L30 -25 L30 10 Q30 35 0 45 Q-30 35 -30 10 L-30 -25 Z"
            fill="#141418"
            stroke="#a78bfa"
            stroke-width="2.5"
          />

          {/* Lock icon inside shield */}
          <g transform="translate(0, -5)">
            {/* Lock body */}
            <rect x="-10" y="-2" width="20" height="16" rx="3" fill="#a78bfa" />
            {/* Lock shackle */}
            <path
              d="M-6 -2 L-6 -8 Q-6 -14 0 -14 Q6 -14 6 -8 L6 -2"
              stroke="#a78bfa"
              stroke-width="3"
              fill="none"
            />
            {/* Keyhole */}
            <circle cx="0" cy="6" r="3" fill="#141418" />
          </g>

          {/* Pulsing ring */}
          <circle r="42" fill="none" stroke="#a78bfa" stroke-width="1" opacity="0.4" class="iso-pulse">
            <animate attributeName="r" values="42;48;42" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* Label */}
          <text
            x="0"
            y="70"
            text-anchor="middle"
            fill="#a78bfa"
            font-family="'Geist Mono', monospace"
            font-size="11"
            font-weight="500"
          >
            CHECKPOINT
          </text>

          {/* "Approval" badge */}
          <g transform="translate(0, -60)">
            <rect x="-30" y="-9" width="60" height="18" rx="9" fill="#a78bfa" opacity="0.2" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#a78bfa"
              font-family="'Geist Mono', monospace"
              font-size="9"
            >
              APPROVE?
            </text>
          </g>
        </g>

        {/* ====== ARROW TO PROTECTED ====== */}
        <g transform="translate(375, 140)">
          <path d="M0 0 L 50 0" stroke="#4ade80" stroke-width="2" />
          <polygon points="58,0 48,-5 48,5" fill="#4ade80" />

          {/* Check mark sparkle */}
          <g transform="translate(30, -15)" class="iso-checkmark">
            <circle r="10" fill="#4ade80" opacity="0.2" />
            <path
              d="M-4 0 L-1 3 L5 -3"
              stroke="#4ade80"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
            >
              <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
            </path>
          </g>
        </g>

        {/* ====== PROTECTED RESOURCES (RIGHT) ====== */}
        <g transform="translate(530, 140)">
          {/* Glow */}
          <ellipse cx="0" cy="0" rx="75" ry="65" fill="url(#protected-glow)" />

          {/* Protected zone container */}
          <rect
            x="-65"
            y="-55"
            width="130"
            height="110"
            rx="10"
            fill="#141418"
            stroke="#4ade80"
            stroke-width="1.5"
            opacity="0.8"
          />

          {/* Label */}
          <text
            x="0"
            y="-65"
            text-anchor="middle"
            fill="#4ade80"
            font-family="'Geist Mono', monospace"
            font-size="10"
            font-weight="500"
          >
            PROTECTED
          </text>

          {/* Resource icons */}
          {/* Filesystem icon */}
          <g transform="translate(-35, -15)">
            <rect x="-12" y="-14" width="24" height="28" rx="3" fill="#0a0908" stroke="#4ade80" stroke-width="1.2" />
            <line x1="-6" y1="-6" x2="6" y2="-6" stroke="#4ade80" stroke-width="1" opacity="0.6" />
            <line x1="-6" y1="0" x2="6" y2="0" stroke="#4ade80" stroke-width="1" opacity="0.6" />
            <line x1="-6" y1="6" x2="3" y2="6" stroke="#4ade80" stroke-width="1" opacity="0.6" />
            <text x="0" y="25" text-anchor="middle" fill="#4ade80" font-size="7" font-family="'Geist Mono', monospace" opacity="0.8">
              files
            </text>
          </g>

          {/* Database icon */}
          <g transform="translate(0, -15)">
            <ellipse cx="0" cy="-10" rx="12" ry="5" fill="#0a0908" stroke="#4ade80" stroke-width="1.2" />
            <path d="M-12 -10 L-12 10 Q-12 15 0 15 Q12 15 12 10 L12 -10" fill="none" stroke="#4ade80" stroke-width="1.2" />
            <ellipse cx="0" cy="0" rx="12" ry="5" fill="none" stroke="#4ade80" stroke-width="1" opacity="0.5" />
            <text x="0" y="28" text-anchor="middle" fill="#4ade80" font-size="7" font-family="'Geist Mono', monospace" opacity="0.8">
              db
            </text>
          </g>

          {/* API icon */}
          <g transform="translate(35, -15)">
            <rect x="-12" y="-14" width="24" height="28" rx="3" fill="#0a0908" stroke="#4ade80" stroke-width="1.2" />
            <circle cx="-4" cy="-4" r="3" fill="#4ade80" opacity="0.6" />
            <circle cx="4" cy="4" r="3" fill="#4ade80" opacity="0.6" />
            <line x1="-2" y1="-2" x2="2" y2="2" stroke="#4ade80" stroke-width="1" opacity="0.6" />
            <text x="0" y="25" text-anchor="middle" fill="#4ade80" font-size="7" font-family="'Geist Mono', monospace" opacity="0.8">
              api
            </text>
          </g>

          {/* Shell icon */}
          <g transform="translate(0, 35)">
            <rect x="-14" y="-10" width="28" height="20" rx="2" fill="#0a0908" stroke="#4ade80" stroke-width="1.2" />
            <text x="-6" y="4" fill="#4ade80" font-size="9" font-family="'Geist Mono', monospace" opacity="0.8">
              {"$_"}
            </text>
          </g>

          {/* Label underneath */}
          <text
            x="0"
            y="75"
            text-anchor="middle"
            fill="#888888"
            font-family="'Geist Mono', monospace"
            font-size="10"
          >
            TOOLS & DATA
          </text>
        </g>

        {/* ====== ANIMATED PARTICLE ====== */}
        {/* Particle traveling from sandbox through checkpoint to protected */}
        {/* Note: {...{ path }} syntax is a workaround for JSX not supporting path attribute directly */}
        <circle r="5" fill="#a78bfa" filter="url(#iso-blur)" class="iso-particle">
          <animateMotion
            dur="4s"
            repeatCount="indefinite"
            {...{ path: "M120 140 Q 200 140 325 140 Q 400 140 530 140" }}
          />
          <animate
            attributeName="fill"
            values="#a78bfa;#a78bfa;#4ade80;#4ade80"
            keyTimes="0;0.4;0.6;1"
            dur="4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="5;7;5;5"
            keyTimes="0;0.5;0.6;1"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Flash at checkpoint */}
        <circle cx="325" cy="140" r="15" fill="#a78bfa" opacity="0" class="iso-flash">
          <animate
            attributeName="opacity"
            values="0;0.5;0;0"
            keyTimes="0;0.45;0.55;1"
            dur="4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="15;25;15"
            keyTimes="0;0.5;1"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Approval flash (green) */}
        <circle cx="430" cy="140" r="10" fill="#4ade80" opacity="0" class="iso-flash">
          <animate
            attributeName="opacity"
            values="0;0;0.6;0"
            keyTimes="0;0.55;0.65;1"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>

      <style>
        {`
        .isolation-illustration {
          width: 100%;
          max-width: 800px;
          aspect-ratio: 13 / 5.6;
        }

        /* Respect reduced motion preferences (WCAG 2.3.3) */
        @media (prefers-reduced-motion: reduce) {
          .isolation-illustration svg * {
            animation: none !important;
            transition: none !important;
          }
          .iso-particle,
          .iso-pulse,
          .iso-flash,
          .iso-checkmark path {
            opacity: 0.6;
          }
          .iso-particle animate,
          .iso-particle animateMotion,
          .iso-pulse animate,
          .iso-flash animate,
          .iso-checkmark animate {
            display: none;
          }
        }
        `}
      </style>
    </div>
  );
}
