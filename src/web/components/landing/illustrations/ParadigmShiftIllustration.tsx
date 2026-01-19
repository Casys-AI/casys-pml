/**
 * ParadigmShiftIllustration - Memory vs Forgetting
 *
 * Left side: Agent that forgets (every session from scratch)
 * Right side: Agent with procedural memory (learns once, executes forever)
 *
 * @module web/components/landing/illustrations/ParadigmShiftIllustration
 */

export function ParadigmShiftIllustration() {
  return (
    <div class="paradigm-illustration">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 600 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="forget-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f87171" stop-opacity="0.08" />
            <stop offset="100%" stop-color="#f87171" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="memory-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#4ade80" stop-opacity="0.08" />
            <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
          </linearGradient>
        </defs>

        {/* ====== LEFT SIDE: WITHOUT MEMORY ====== */}
        <g transform="translate(140, 140)">
          {/* Background */}
          <circle r="110" fill="url(#forget-grad)" />

          {/* Session boxes stacked - all thinking */}
          <g transform="translate(0, -55)">
            <rect x="-65" y="-16" width="130" height="32" rx="6" fill="#141418" stroke="#a8a29e" stroke-width="1" opacity="0.5" />
            <text x="-50" y="0" fill="#666" font-family="'Geist Mono', monospace" font-size="9">Session 1:</text>
            <g transform="translate(35, 0)">
              <circle r="3" fill="#f87171" opacity="0.4">
                <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.2s" repeatCount="indefinite" />
              </circle>
              <circle cx="10" r="3" fill="#f87171" opacity="0.4">
                <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
              </circle>
              <circle cx="20" r="3" fill="#f87171" opacity="0.4">
                <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>

          <g transform="translate(0, -10)">
            <rect x="-65" y="-16" width="130" height="32" rx="6" fill="#141418" stroke="#a8a29e" stroke-width="1" opacity="0.7" />
            <text x="-50" y="0" fill="#888" font-family="'Geist Mono', monospace" font-size="9">Session 2:</text>
            <g transform="translate(35, 0)">
              <circle r="3" fill="#f87171" opacity="0.5">
                <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.2s" begin="0.1s" repeatCount="indefinite" />
              </circle>
              <circle cx="10" r="3" fill="#f87171" opacity="0.5">
                <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.2s" begin="0.3s" repeatCount="indefinite" />
              </circle>
              <circle cx="20" r="3" fill="#f87171" opacity="0.5">
                <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.2s" begin="0.5s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>

          <g transform="translate(0, 35)">
            <rect x="-65" y="-16" width="130" height="32" rx="6" fill="#141418" stroke="#f87171" stroke-width="1.5" />
            <text x="-50" y="0" fill="#a8a29e" font-family="'Geist Mono', monospace" font-size="9">Session 100:</text>
            <g transform="translate(45, 0)">
              <circle r="3" fill="#f87171">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" repeatCount="indefinite" />
              </circle>
              <circle cx="10" r="3" fill="#f87171">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
              </circle>
              <circle cx="20" r="3" fill="#f87171">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>

          {/* Label */}
          <text
            x="0"
            y="95"
            text-anchor="middle"
            fill="#f87171"
            font-family="'Geist Mono', monospace"
            font-size="11"
            font-weight="500"
            opacity="0.8"
          >
            Still thinking...
          </text>
        </g>

        {/* ====== CENTER: TRANSFORMATION ====== */}
        <g transform="translate(300, 140)">
          {/* Arrow */}
          <path
            d="M-25 0 L 15 0"
            stroke="#FFB86F"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <polygon points="25,0 12,-6 12,6" fill="#FFB86F" />

          {/* PML badge */}
          <g transform="translate(0, -28)">
            <rect x="-22" y="-11" width="44" height="22" rx="4" fill="#FFB86F" />
            <text
              x="0"
              y="4"
              text-anchor="middle"
              fill="#0a0908"
              font-family="'Geist Mono', monospace"
              font-size="11"
              font-weight="700"
            >
              PML
            </text>
          </g>
        </g>

        {/* ====== RIGHT SIDE: WITH MEMORY ====== */}
        <g transform="translate(460, 140)">
          {/* Background */}
          <circle r="110" fill="url(#memory-grad)" />

          {/* Session 1: Learns */}
          <g transform="translate(0, -55)">
            <rect x="-65" y="-16" width="130" height="32" rx="6" fill="#141418" stroke="#FFB86F" stroke-width="1.5" />
            <text x="-50" y="0" fill="#FFB86F" font-family="'Geist Mono', monospace" font-size="9">Session 1:</text>
            <text x="30" y="0" fill="#a8a29e" font-family="'Geist', sans-serif" font-size="9" font-style="italic">learns</text>
            <circle cx="55" r="6" fill="none" stroke="#FFB86F" stroke-width="1.5">
              <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* Arrow down */}
          <path d="M0 -30 L0 -15" stroke="#4ade80" stroke-width="1.5" stroke-dasharray="3 2" />
          <polygon points="0,-8 -4,-16 4,-16" fill="#4ade80" />

          {/* Capability crystallizes */}
          <g transform="translate(0, 10)">
            <rect x="-50" y="-14" width="100" height="28" rx="6" fill="#141418" stroke="#4ade80" stroke-width="2" />
            <text x="0" y="5" text-anchor="middle" fill="#4ade80" font-family="'Geist Mono', monospace" font-size="11" font-weight="600">db:query ✓</text>
          </g>

          {/* Arrow down */}
          <path d="M0 32 L0 47" stroke="#4ade80" stroke-width="1.5" stroke-dasharray="3 2" />
          <polygon points="0,54 -4,46 4,46" fill="#4ade80" />

          {/* Session 2+: Just executes */}
          <g transform="translate(0, 75)">
            <rect x="-65" y="-16" width="130" height="32" rx="6" fill="#141418" stroke="#4ade80" stroke-width="1.5" />
            <text x="-50" y="0" fill="#4ade80" font-family="'Geist Mono', monospace" font-size="9">Session 2+:</text>
            <text x="30" y="0" fill="#f0ede8" font-family="'Geist', sans-serif" font-size="9" font-weight="500">Done</text>
          </g>

          {/* Label */}
          <text
            x="0"
            y="130"
            text-anchor="middle"
            fill="#4ade80"
            font-family="'Geist Mono', monospace"
            font-size="11"
            font-weight="500"
          >
            Remembers forever
          </text>
        </g>
      </svg>

      <style>
        {`
        .paradigm-illustration {
          width: 100%;
          max-width: 700px;
          aspect-ratio: 600 / 280;
        }
        `}
      </style>
    </div>
  );
}
