/**
 * Sparkline - Mini execution history chart
 *
 * Shows a tiny line chart for execution times or success rates.
 *
 * @module web/components/landing/atoms/Sparkline
 */

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDot?: boolean;
}

export function Sparkline({
  data,
  width = 60,
  height = 20,
  color = "#4ade80",
  showDot = true
}: SparklineProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  // Normalize data to fit within the height
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  const lastPoint = data[data.length - 1];
  const lastX = width;
  const lastY = height - ((lastPoint - min) / range) * (height - 4) - 2;

  return (
    <div class="sparkline">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          class="sparkline__line"
        />
        {showDot && (
          <circle
            cx={lastX}
            cy={lastY}
            r="2.5"
            fill={color}
            class="sparkline__dot"
          />
        )}
      </svg>

      <style>
        {`
        .sparkline {
          display: inline-flex;
          align-items: center;
        }
        .sparkline__line {
          opacity: 0.8;
        }
        .sparkline__dot {
          animation: sparklinePulse 2s ease-in-out infinite;
        }
        @keyframes sparklinePulse {
          0%, 100% { opacity: 0.6; r: 2; }
          50% { opacity: 1; r: 3; }
        }
        `}
      </style>
    </div>
  );
}
