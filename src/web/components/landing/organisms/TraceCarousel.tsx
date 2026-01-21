/**
 * TraceCarousel - Vertical scrolling trace visualization
 *
 * Continuous vertical scroll showing workflow execution.
 * Gradient masks at top (appear) and bottom (disappear).
 *
 * @module web/components/landing/organisms/TraceCarousel
 */

import { TraceRow, type TraceRowData } from "../atoms/TraceRow.tsx";

interface TraceCarouselProps {
  rows: TraceRowData[];
  height?: number;
  speed?: number;
}

export function TraceCarousel({
  rows,
  height = 320,
  speed = 25
}: TraceCarouselProps) {
  // Duplicate rows for seamless loop
  const allRows = [...rows, ...rows];

  // Count unique models
  const models = new Set(rows.filter(r => r.model).map(r => r.model));

  // Calculate total cost
  const totalCost = rows.reduce((sum, r) => sum + (r.cost || 0), 0);

  // Count errors
  const errorCount = rows.filter(r => r.success === false).length;

  return (
    <div class="carousel" style={{ "--h": `${height}px`, "--speed": `${speed}s` } as any}>
      {/* Header */}
      <div class="carousel__header">
        <div class="carousel__title">
          <span class="carousel__dot" />
          <span class="carousel__name">workflow:ci-deploy</span>
        </div>
        <span class="carousel__live">
          <span class="carousel__live-dot" />
          live
        </span>
      </div>

      {/* Scrolling area */}
      <div class="carousel__viewport">
        <div class="carousel__track">
          {allRows.map((row, i) => (
            <TraceRow key={`${row.name}-${i}`} data={row} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div class="carousel__footer">
        <div class="carousel__stats">
          <span class="carousel__stat">
            <span class="carousel__num">{rows.length}</span>
            <span class="carousel__label">calls</span>
          </span>
          <span class="carousel__divider" />
          <span class="carousel__stat">
            <span class="carousel__num">{models.size}</span>
            <span class="carousel__label">models</span>
          </span>
          <span class="carousel__divider" />
          <span class="carousel__stat">
            <span class="carousel__num carousel__num--cost">${totalCost.toFixed(3)}</span>
            <span class="carousel__label">cost</span>
          </span>
          {errorCount > 0 && (
            <>
              <span class="carousel__divider" />
              <span class="carousel__stat">
                <span class="carousel__num carousel__num--err">{errorCount}</span>
                <span class="carousel__label">retry</span>
              </span>
            </>
          )}
        </div>
        <div class="carousel__badges">
          <span class="carousel__badge carousel__badge--cost">cost tracked</span>
        </div>
      </div>

      <style>
        {`
        .carousel {
          width: 100%;
          max-width: 460px;
          opacity: 0;
          animation: fadeIn 0.6s ease 0.3s forwards;
        }

        @keyframes fadeIn {
          to { opacity: 1; }
        }

        .carousel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .carousel__title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .carousel__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #FFB86F;
          box-shadow: 0 0 12px rgba(255, 184, 111, 0.5);
        }

        .carousel__name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          font-weight: 600;
          color: #f5f5f5;
          letter-spacing: -0.01em;
        }

        .carousel__live {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'Geist Mono', monospace;
          font-size: 0.6rem;
          font-weight: 500;
          color: #FFB86F;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 4px 10px;
          background: rgba(255, 184, 111, 0.1);
          border: 1px solid rgba(255, 184, 111, 0.2);
          border-radius: 6px;
        }

        .carousel__live-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #FFB86F;
          animation: blink 1.5s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .carousel__viewport {
          position: relative;
          height: var(--h);
          overflow: hidden;
          margin: 8px 0;
        }

        /* Gradient masks */
        .carousel__viewport::before,
        .carousel__viewport::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          height: 60px;
          z-index: 2;
          pointer-events: none;
        }

        .carousel__viewport::before {
          top: 0;
          background: linear-gradient(to bottom, #08080a 0%, transparent 100%);
        }

        .carousel__viewport::after {
          bottom: 0;
          background: linear-gradient(to top, #08080a 0%, transparent 100%);
        }

        .carousel__track {
          animation: scroll var(--speed) linear infinite;
        }

        @keyframes scroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }

        .carousel__track:hover {
          animation-play-state: paused;
        }

        .carousel__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 4px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .carousel__stats {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .carousel__stat {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .carousel__num {
          font-family: 'Geist Mono', monospace;
          font-size: 0.85rem;
          font-weight: 700;
          color: #FFB86F;
        }

        .carousel__num--cost {
          color: #34d399;
        }

        .carousel__num--err {
          color: #f87171;
        }

        .carousel__label {
          font-family: 'Geist Mono', monospace;
          font-size: 0.55rem;
          color: #525252;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .carousel__divider {
          width: 1px;
          height: 12px;
          background: #333;
        }

        .carousel__badges {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .carousel__badge {
          font-family: 'Geist Mono', monospace;
          font-size: 0.5rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .carousel__badge--args {
          color: #6b7280;
          background: rgba(107, 114, 128, 0.1);
        }

        .carousel__badge--results {
          color: #34d399;
          background: rgba(52, 211, 153, 0.1);
        }

        .carousel__badge--cost {
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.1);
        }

        @media (max-width: 768px) {
          .carousel {
            max-width: 100%;
          }

          .carousel__badges {
            display: none;
          }
        }
        `}
      </style>
    </div>
  );
}
