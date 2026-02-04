/**
 * Waterfall Viewer UI - HTTP timing visualization
 *
 * Chrome DevTools Network-style waterfall chart showing:
 * - DNS lookup
 * - TCP connect
 * - TLS handshake
 * - Time to first byte (TTFB)
 * - Content download
 *
 * @module lib/std/src/ui/waterfall-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useRef } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack } from "../../styled-system/jsx";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface TimingPhases {
  dns?: number;      // DNS lookup (ms)
  connect?: number;  // TCP connect (ms)
  tls?: number;      // TLS handshake (ms)
  ttfb?: number;     // Time to first byte (ms)
  download?: number; // Content download (ms)
}

interface TimingData {
  url: string;
  method: string;
  status: number;
  totalTime: number;
  phases: TimingPhases;
}

interface WaterfallData {
  requests: TimingData[];
  title?: string;
}

// Phase configuration with colors matching Chrome DevTools
const PHASE_CONFIG = {
  dns: { label: "DNS", color: "#7BC47F", description: "DNS Lookup" },
  connect: { label: "Connect", color: "#F5A623", description: "TCP Connection" },
  tls: { label: "TLS", color: "#9B59B6", description: "TLS Handshake" },
  ttfb: { label: "TTFB", color: "#4CAF50", description: "Time to First Byte" },
  download: { label: "Download", color: "#4A90D9", description: "Content Download" },
} as const;

type PhaseKey = keyof typeof PHASE_CONFIG;

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "WaterfallViewer", version: "1.0.0" });

// ============================================================================
// Utility Functions
// ============================================================================

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "var(--colors-green-600)";
  if (status >= 300 && status < 400) return "var(--colors-blue-600)";
  if (status >= 400 && status < 500) return "var(--colors-yellow-600)";
  if (status >= 500) return "var(--colors-red-600)";
  return "var(--colors-fg-muted)";
}

function truncateUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url;
  const parsed = new URL(url);
  const path = parsed.pathname + parsed.search;
  if (path.length > maxLength - 3) {
    return "..." + path.slice(-(maxLength - 3));
  }
  return url.slice(0, maxLength - 3) + "...";
}

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: "var(--colors-green-600)",
    POST: "var(--colors-blue-600)",
    PUT: "var(--colors-yellow-600)",
    PATCH: "var(--colors-purple-600)",
    DELETE: "var(--colors-red-600)",
    HEAD: "var(--colors-fg-muted)",
    OPTIONS: "var(--colors-fg-muted)",
  };
  return colors[method.toUpperCase()] || "var(--colors-fg-default)";
}

// ============================================================================
// Components
// ============================================================================

function TimeScale({ maxTime, width }: { maxTime: number; width: number }) {
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (maxTime / tickCount) * i);

  return (
    <Box w="100%">
      <svg width={width} height={20} style={{ display: "block" }}>
        {ticks.map((tick, i) => {
          const x = (tick / maxTime) * width;
          return (
            <g key={i}>
              <line x1={x} y1={15} x2={x} y2={20} stroke="var(--colors-border-default)" strokeWidth="1" />
              <text
                x={x}
                y={12}
                fill="var(--colors-fg-muted)"
                fontSize="10"
                textAnchor={i === 0 ? "start" : i === tickCount ? "end" : "middle"}
              >
                {formatTime(tick)}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={20} x2={width} y2={20} stroke="var(--colors-border-default)" strokeWidth="1" />
      </svg>
    </Box>
  );
}

function WaterfallBar({
  phases,
  totalTime,
  maxTime,
  width,
}: {
  phases: TimingPhases;
  totalTime: number;
  maxTime: number;
  width: number;
}) {
  const [hoveredPhase, setHoveredPhase] = useState<PhaseKey | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const phaseOrder: PhaseKey[] = ["dns", "connect", "tls", "ttfb", "download"];
  let currentX = 0;
  const barHeight = 16;

  const bars = phaseOrder
    .filter((key) => phases[key] !== undefined && phases[key]! > 0)
    .map((key) => {
      const duration = phases[key]!;
      const barWidth = (duration / maxTime) * width;
      const x = currentX;
      currentX += barWidth;
      return { key, x, width: barWidth, duration, config: PHASE_CONFIG[key] };
    });

  const handleMouseEnter = (phase: PhaseKey, event: MouseEvent) => {
    setHoveredPhase(phase);
    const rect = (event.target as SVGElement).getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleMouseLeave = () => {
    setHoveredPhase(null);
  };

  return (
    <Box position="relative">
      <svg width={width} height={barHeight + 4} style={{ display: "block", width: "100%" }}>
        {/* Background track */}
        <rect x={0} y={2} width={width} height={barHeight} fill="var(--colors-bg-subtle)" rx={2} />
        {/* Phase bars */}
        {bars.map(({ key, x, width: barWidth, config }) => (
          <rect
            key={key}
            x={x}
            y={2}
            width={Math.max(barWidth, 1)}
            height={barHeight}
            fill={config.color}
            rx={x === 0 ? 2 : 0}
            className={css({ cursor: "pointer", transition: "opacity 0.15s ease", _hover: { opacity: 0.8 } })}
            onMouseEnter={(e) => handleMouseEnter(key, e as unknown as MouseEvent)}
            onMouseLeave={handleMouseLeave}
          />
        ))}
      </svg>
      {hoveredPhase && (
        <Box
          position="fixed"
          bg="bg.default"
          border="1px solid"
          borderColor="border.default"
          rounded="md"
          px="2"
          py="1"
          fontSize="xs"
          color="fg.default"
          boxShadow="lg"
          zIndex={1000}
          pointerEvents="none"
          whiteSpace="nowrap"
          style={{
            top: `${tooltipPos.y - 40}px`,
            left: `${Math.min(tooltipPos.x, window.innerWidth - 320)}px`,
            transform: "translateX(-50%)",
          }}
        >
          <strong>{PHASE_CONFIG[hoveredPhase].description}</strong>
          <br />
          {formatTime(phases[hoveredPhase]!)}
        </Box>
      )}
    </Box>
  );
}

function RequestRow({
  request,
  maxTime,
  barWidth,
  index,
}: {
  request: TimingData;
  maxTime: number;
  barWidth: number;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Flex
      flexWrap="wrap"
      align="center"
      py="2"
      borderBottom="1px solid"
      borderColor="border.subtle"
      _hover={{ bg: "bg.subtle" }}
      data-index={index}
    >
      <Flex w="200px" flexShrink={0} align="center" gap="2" cursor="pointer" pr="2" onClick={() => setExpanded(!expanded)}>
        <span className={css({ fontSize: "xs", fontWeight: "bold", fontFamily: "mono", flexShrink: 0 })} style={{ color: getMethodColor(request.method) }}>
          {request.method}
        </span>
        <span className={css({ fontSize: "xs", fontFamily: "mono", flexShrink: 0 })} style={{ color: getStatusColor(request.status) }}>
          {request.status}
        </span>
        <span className={css({ fontSize: "sm", color: "fg.default", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={request.url}>
          {truncateUrl(request.url)}
        </span>
      </Flex>
      <Box flex="1" minW="200px" position="relative">
        <WaterfallBar phases={request.phases} totalTime={request.totalTime} maxTime={maxTime} width={barWidth} />
      </Box>
      <Box w="80px" flexShrink={0} textAlign="right" fontSize="sm" fontFamily="mono" color="fg.muted">
        {formatTime(request.totalTime)}
      </Box>
      {expanded && (
        <Box w="100%" mt="2" pl="4" pr="4">
          <PhaseDetails phases={request.phases} totalTime={request.totalTime} />
        </Box>
      )}
    </Flex>
  );
}

function PhaseDetails({ phases, totalTime }: { phases: TimingPhases; totalTime: number }) {
  const phaseOrder: PhaseKey[] = ["dns", "connect", "tls", "ttfb", "download"];

  return (
    <Stack gap="1" bg="bg.subtle" rounded="md" p="3">
      {phaseOrder.map((key) => {
        const duration = phases[key];
        if (duration === undefined || duration <= 0) return null;
        const config = PHASE_CONFIG[key];
        const percentage = ((duration / totalTime) * 100).toFixed(1);
        return (
          <Flex align="center" gap="2" key={key}>
            <Box w="8px" h="8px" rounded="sm" flexShrink={0} style={{ backgroundColor: config.color }} />
            <Box flex="1" fontSize="sm" color="fg.default">{config.description}</Box>
            <Box fontSize="sm" fontFamily="mono" color="fg.default" fontWeight="medium">{formatTime(duration)}</Box>
            <Box fontSize="xs" color="fg.muted" w="50px" textAlign="right">({percentage}%)</Box>
          </Flex>
        );
      })}
    </Stack>
  );
}

function Legend() {
  const phases: PhaseKey[] = ["dns", "connect", "tls", "ttfb", "download"];
  return (
    <Flex flexWrap="wrap" gap="3" mb="3" pb="3" borderBottom="1px solid" borderColor="border.default">
      {phases.map((key) => (
        <Flex align="center" gap="1.5" key={key}>
          <Box w="12px" h="12px" rounded="sm" flexShrink={0} style={{ backgroundColor: PHASE_CONFIG[key].color }} />
          <Box fontSize="xs" color="fg.muted">{PHASE_CONFIG[key].label}</Box>
        </Flex>
      ))}
    </Flex>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function WaterfallViewer() {
  const [data, setData] = useState<WaterfallData | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          // Support both single request and array of requests
          if (Array.isArray(parsed)) {
            setData({ requests: parsed });
          } else if (parsed.requests) {
            setData(parsed);
          } else {
            setData({ requests: [parsed] });
          }
        }
      } catch (e) {
        console.error("Failed to parse waterfall data", e);
      }
    };

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const { maxTime, barWidth } = useMemo(() => {
    if (!data || data.requests.length === 0) {
      return { maxTime: 1000, barWidth: 300 };
    }
    const maxTime = Math.max(...data.requests.map((r) => r.totalTime));
    // Reserve space for info column (200px) and total time column (80px)
    const barWidth = Math.max(200, containerWidth - 300);
    return { maxTime: maxTime * 1.1, barWidth }; // Add 10% padding to max
  }, [data, containerWidth]);

  if (loading) {
    return (
      <Box p="4" fontFamily="sans" color="fg.default" bg="bg.canvas" minW="500px" maxW="100%" ref={containerRef}>
        <Box p="4" color="fg.muted" textAlign="center">Loading...</Box>
      </Box>
    );
  }

  if (!data || data.requests.length === 0) {
    return (
      <Box p="4" fontFamily="sans" color="fg.default" bg="bg.canvas" minW="500px" maxW="100%" ref={containerRef}>
        <Box p="4" color="fg.muted" textAlign="center">No timing data available</Box>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="sans" color="fg.default" bg="bg.canvas" minW="500px" maxW="100%" ref={containerRef}>
      {data.title && <Box as="h2" fontSize="lg" fontWeight="semibold" mb="3" color="fg.default">{data.title}</Box>}
      <Legend />
      <Flex align="flex-end" borderBottom="1px solid" borderColor="border.default" pb="1" mb="1">
        <Box w="200px" flexShrink={0} fontSize="xs" fontWeight="medium" color="fg.muted" textTransform="uppercase" letterSpacing="wider">
          Request
        </Box>
        <Box flex="1" minW="200px">
          <TimeScale maxTime={maxTime} width={barWidth} />
        </Box>
        <Box w="80px" flexShrink={0} textAlign="right" fontSize="xs" fontWeight="medium" color="fg.muted" textTransform="uppercase" letterSpacing="wider">
          Time
        </Box>
      </Flex>
      <Stack gap="0">
        {data.requests.map((request, index) => (
          <RequestRow key={index} request={request} maxTime={maxTime} barWidth={barWidth} index={index} />
        ))}
      </Stack>
      <Flex gap="4" mt="3" pt="3" borderTop="1px solid" borderColor="border.default">
        <Box fontSize="sm" color="fg.muted">
          <strong>{data.requests.length}</strong> request{data.requests.length !== 1 ? "s" : ""}
        </Box>
        <Box fontSize="sm" color="fg.muted">
          Total: <strong>{formatTime(data.requests.reduce((sum, r) => sum + r.totalTime, 0))}</strong>
        </Box>
      </Flex>
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<WaterfallViewer />);
