/**
 * Metrics Panel UI - Grafana-style dashboard
 *
 * Grid of metrics with:
 * - Multiple visualization types (gauge, sparkline, stat, bar)
 * - Thresholds with color coding
 * - Time range display
 * - Auto-refresh indicator
 * - Responsive grid layout
 *
 * @module lib/std/src/ui/metrics-panel
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Grid, VStack, HStack, Center } from "../../styled-system/jsx";
import { Badge } from "../../components/ui/badge";
import { Spinner } from "../../components/ui/spinner";
import * as Card from "../../components/ui/card";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface MetricData {
  id: string;
  label: string;
  value: number;
  unit?: string;
  history?: number[];
  min?: number;
  max?: number;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  type?: "gauge" | "sparkline" | "stat" | "bar";
  description?: string;
}

interface PanelData {
  title?: string;
  metrics: MetricData[];
  columns?: number;
  refreshInterval?: number;
  timestamp?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Metrics Panel", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function getColor(value: number, thresholds?: { warning?: number; critical?: number }): string {
  if (!thresholds) return "var(--colors-blue-500)";
  if (thresholds.critical !== undefined && value >= thresholds.critical) return "var(--colors-red-500)";
  if (thresholds.warning !== undefined && value >= thresholds.warning) return "var(--colors-yellow-500)";
  return "var(--colors-green-500)";
}

function formatValue(value: number, unit?: string): string {
  let formatted: string;
  if (value >= 1000000000) {
    formatted = (value / 1000000000).toFixed(1) + "G";
  } else if (value >= 1000000) {
    formatted = (value / 1000000).toFixed(1) + "M";
  } else if (value >= 1000) {
    formatted = (value / 1000).toFixed(1) + "K";
  } else if (Number.isInteger(value)) {
    formatted = String(value);
  } else {
    formatted = value.toFixed(1);
  }
  return unit ? `${formatted}${unit}` : formatted;
}

// ============================================================================
// Metric Components
// ============================================================================

function GaugeMetric({ metric }: { metric: MetricData }) {
  const { value, min = 0, max = 100, thresholds, label, unit } = metric;
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const color = getColor(value, thresholds);

  const radius = 40;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * percentage) / 100;

  return (
    <VStack gap="0" align="center" position="relative">
      <svg viewBox="0 0 100 100" className={css({ w: "80px", h: "80px" })}>
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--colors-border-default)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          transform="rotate(135 50 50)"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform="rotate(135 50 50)"
          className={css({ transition: "stroke-dashoffset 0.5s ease" })}
        />
      </svg>
      <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -40%)" textAlign="center">
        <Box fontSize="xl" fontWeight="bold" fontFamily="mono">
          {formatValue(value, unit)}
        </Box>
      </Box>
      <Box fontSize="xs" color="fg.muted" fontWeight="medium" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Box>
    </VStack>
  );
}

function SparklineMetric({ metric }: { metric: MetricData }) {
  const { value, history = [], thresholds, label, unit, min, max } = metric;
  const color = getColor(value, thresholds);

  const values = history.length ? history : [value];
  const dataMin = min ?? Math.min(...values);
  const dataMax = max ?? Math.max(...values);
  const range = dataMax - dataMin || 1;

  const width = 120;
  const height = 40;
  const padding = 2;

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1 || 1)) * (width - padding * 2),
    y: padding + (height - padding * 2) - ((v - dataMin) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <VStack gap="1" align="stretch">
      <Flex justify="space-between" align="baseline">
        <Box fontSize="xs" color="fg.muted" fontWeight="medium" textTransform="uppercase" letterSpacing="wide">
          {label}
        </Box>
        <Box fontSize="lg" fontWeight="bold" fontFamily="mono" style={{ color }}>
          {formatValue(value, unit)}
        </Box>
      </Flex>
      <svg width={width} height={height} className={css({ display: "block", w: "100%" })}>
        <path d={areaPath} fill={color} opacity={0.15} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3} fill={color} />
      </svg>
    </VStack>
  );
}

function StatMetric({ metric }: { metric: MetricData }) {
  const { value, thresholds, label, unit, description } = metric;
  const color = getColor(value, thresholds);

  return (
    <VStack gap="0" textAlign="center">
      <Box fontSize="xs" color="fg.muted" fontWeight="medium" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Box>
      <Box fontSize="2xl" fontWeight="bold" fontFamily="mono" my="1" style={{ color }}>
        {formatValue(value, unit)}
      </Box>
      {description && (
        <Box fontSize="xs" color="fg.muted">
          {description}
        </Box>
      )}
    </VStack>
  );
}

function BarMetric({ metric }: { metric: MetricData }) {
  const { value, min = 0, max = 100, thresholds, label, unit } = metric;
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const color = getColor(value, thresholds);

  return (
    <VStack gap="1" align="stretch">
      <Flex justify="space-between" align="baseline">
        <Box fontSize="xs" color="fg.muted" fontWeight="medium" textTransform="uppercase" letterSpacing="wide">
          {label}
        </Box>
        <Box fontWeight="semibold" fontFamily="mono">
          {formatValue(value, unit)}
        </Box>
      </Flex>
      <Box position="relative" h="8px" bg="bg.muted" rounded="full" overflow="hidden">
        <Box
          h="100%"
          rounded="full"
          style={{ width: `${percentage}%`, backgroundColor: color }}
          className={css({ transition: "width 0.5s ease" })}
        />
        {thresholds?.warning && (
          <Box
            position="absolute"
            top="0"
            bottom="0"
            w="2px"
            bg="yellow.500"
            style={{ left: `${((thresholds.warning - min) / (max - min)) * 100}%` }}
          />
        )}
        {thresholds?.critical && (
          <Box
            position="absolute"
            top="0"
            bottom="0"
            w="2px"
            bg="red.500"
            style={{ left: `${((thresholds.critical - min) / (max - min)) * 100}%` }}
          />
        )}
      </Box>
    </VStack>
  );
}

function MetricCard({ metric }: { metric: MetricData }) {
  const type = metric.type || (metric.history?.length ? "sparkline" : "stat");

  return (
    <Card.Root
      cursor="pointer"
      className={css({ transition: "all 0.15s", _hover: { borderColor: "border.emphasized", shadow: "sm" } })}
      onClick={() => notifyModel("selectMetric", { id: metric.id, metric })}
    >
      <Card.Body p="3">
        {type === "gauge" && <GaugeMetric metric={metric} />}
        {type === "sparkline" && <SparklineMetric metric={metric} />}
        {type === "stat" && <StatMetric metric={metric} />}
        {type === "bar" && <BarMetric metric={metric} />}
      </Card.Body>
    </Card.Root>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MetricsPanel() {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          // Handle array of metrics or full panel data
          if (Array.isArray(parsed)) {
            setData({ metrics: parsed });
          } else if (parsed.metrics) {
            setData(parsed);
          } else {
            // Single metric object - convert to array
            setData({ metrics: [{ id: "metric", label: "Value", ...parsed }] });
          }
        }
      } catch (e) {
        console.error("Failed to parse metrics data", e);
      }
    };
  }, []);

  if (loading) {
    return (
      <Box fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" p="3">
        <Center p="6" flexDirection="column" gap="2">
          <Spinner size="md" />
          <Box color="fg.muted">Loading metrics...</Box>
        </Center>
      </Box>
    );
  }

  if (!data?.metrics?.length) {
    return (
      <Box fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" p="3">
        <Center p="6" color="fg.muted">No metrics</Center>
      </Box>
    );
  }

  const columns = data.columns || Math.min(4, Math.max(2, data.metrics.length));

  return (
    <Box fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" p="3">
      {/* Header */}
      {(data.title || data.timestamp) && (
        <Flex justify="space-between" align="center" mb="3" pb="2" borderBottom="1px solid" borderColor="border.subtle">
          {data.title && (
            <Box as="h2" fontSize="lg" fontWeight="semibold" m="0">
              {data.title}
            </Box>
          )}
          <HStack gap="3">
            {data.refreshInterval && (
              <Badge variant="outline" size="sm">
                ↻ {data.refreshInterval}s
              </Badge>
            )}
            {data.timestamp && (
              <Box fontSize="xs" color="fg.muted">
                {data.timestamp}
              </Box>
            )}
          </HStack>
        </Flex>
      )}

      {/* Metrics Grid */}
      <Grid gap="3" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {data.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </Grid>
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<MetricsPanel />);
