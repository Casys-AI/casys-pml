/**
 * Gauge UI - Metric display with thresholds
 *
 * Circular or linear gauge showing a value with:
 * - Min/max range
 * - Color thresholds (green/yellow/red)
 * - Optional label and unit
 *
 * @module lib/std/src/ui/gauge
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { Box, Flex, VStack, HStack, Center } from "../../styled-system/jsx";
import { css } from "../../styled-system/css";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface GaugeData {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  format?: "circular" | "linear" | "compact";
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Gauge", version: "1.0.0" });
let appConnected = false;

// ============================================================================
// Components
// ============================================================================

function CircularGauge({ value, min, max, color, label, unit, displayValue }: {
  value: number;
  min: number;
  max: number;
  color: string;
  label?: string;
  unit?: string;
  displayValue: string;
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  const radius = 45;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * percentage) / 100;

  return (
    <VStack gap="0" alignItems="center" position="relative" w="120px">
      <svg viewBox="0 0 120 120" className={css({ w: "100%", h: "auto" })}>
        {/* Background arc */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--colors-border-default)"
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          transform="rotate(135 60 60)"
        />
        {/* Value arc */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          stroke-dashoffset={offset}
          transform="rotate(135 60 60)"
          className={css({ transition: "stroke-dashoffset 0.5s ease" })}
        />
      </svg>
      <Center position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)">
        <VStack gap="0" alignItems="center">
          <Box fontSize="2xl" fontWeight="bold" fontFamily="mono">{displayValue}</Box>
          {unit && <Box fontSize="xs" color="fg.muted">{unit}</Box>}
        </VStack>
      </Center>
      {label && <Box fontSize="sm" color="fg.muted" mt="1" textAlign="center">{label}</Box>}
    </VStack>
  );
}

function LinearGauge({ value, min, max, color, label, unit, displayValue }: {
  value: number;
  min: number;
  max: number;
  color: string;
  label?: string;
  unit?: string;
  displayValue: string;
}) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <Box w="200px">
      <Flex justify="space-between" align="baseline" mb="1">
        {label && <Box fontSize="sm" color="fg.muted">{label}</Box>}
        <HStack gap="0.5">
          <Box fontSize="lg" fontWeight="bold" fontFamily="mono">{displayValue}</Box>
          {unit && <Box fontSize="xs" color="fg.muted">{unit}</Box>}
        </HStack>
      </Flex>
      <Box h="8px" bg="bg.subtle" rounded="full" overflow="hidden">
        <Box
          h="100%"
          rounded="full"
          style={{ width: `${percentage}%`, backgroundColor: color, transition: "width 0.5s ease" }}
        />
      </Box>
      <Flex justify="space-between" fontSize="xs" color="fg.muted" mt="1">
        <span>{min}</span>
        <span>{max}</span>
      </Flex>
    </Box>
  );
}

function CompactGauge({ color, label, unit, displayValue }: {
  value: number;
  color: string;
  label?: string;
  unit?: string;
  displayValue: string;
}) {
  return (
    <HStack gap="2" alignItems="center">
      <Box w="12px" h="12px" rounded="full" flexShrink={0} style={{ backgroundColor: color }} />
      <VStack gap="0" alignItems="flex-start">
        {label && <Box fontSize="xs" color="fg.muted">{label}</Box>}
        <HStack gap="0.5">
          <Box fontSize="lg" fontWeight="bold" fontFamily="mono">{displayValue}</Box>
          {unit && <Box fontSize="xs" color="fg.muted">{unit}</Box>}
        </HStack>
      </VStack>
    </HStack>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function Gauge() {
  const [data, setData] = useState<GaugeData | null>(null);
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
          setData(parsed);
        }
      } catch (e) {
        console.error("Failed to parse gauge data", e);
      }
    };
  }, []);

  const { color, displayValue } = useMemo(() => {
    if (!data) return { color: "var(--colors-fg-muted)", displayValue: "-" };

    const { value, thresholds } = data;
    let color = "var(--colors-green-500)";

    if (thresholds) {
      if (thresholds.critical !== undefined && value >= thresholds.critical) {
        color = "var(--colors-red-500)";
      } else if (thresholds.warning !== undefined && value >= thresholds.warning) {
        color = "var(--colors-yellow-500)";
      }
    }

    const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);

    return { color, displayValue };
  }, [data]);

  if (loading) {
    return (
      <Box p="3" fontFamily="sans" color="fg.default" bg="bg.canvas" display="inline-flex">
        <Box p="4" color="fg.muted">Loading...</Box>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p="3" fontFamily="sans" color="fg.default" bg="bg.canvas" display="inline-flex">
        <Box p="4" color="fg.muted">No data</Box>
      </Box>
    );
  }

  const { value, min = 0, max = 100, label, unit, format = "circular" } = data;

  const props = { value, min, max, color, label, unit, displayValue };

  return (
    <Box p="3" fontFamily="sans" color="fg.default" bg="bg.canvas" display="inline-flex">
      {format === "circular" && <CircularGauge {...props} />}
      {format === "linear" && <LinearGauge {...props} />}
      {format === "compact" && <CompactGauge {...props} />}
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<Gauge />);
