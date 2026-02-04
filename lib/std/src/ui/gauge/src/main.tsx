/**
 * Gauge UI - Metric display with thresholds
 *
 * Circular or linear gauge showing a value with:
 * - Min/max range
 * - Color thresholds (green/yellow/red)
 * - Optional label and unit
 * - Smooth animations and loading states
 *
 * @module lib/std/src/ui/gauge
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { Box, Flex, VStack, HStack, Center } from "../../styled-system/jsx";
import { css, cx } from "../../styled-system/css";
import * as Progress from "../../components/ui/progress";
import { Tooltip } from "../../components/ui/tooltip";
import {
  GaugeSkeleton,
  StatusBadge,
  typography,
  valueTransition,
  containers,
  interactive,
} from "../../shared";
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

type ThresholdStatus = "normal" | "warning" | "critical";

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Gauge", version: "1.0.0" });
let appConnected = false;

// ============================================================================
// Styles
// ============================================================================

const colorMap: Record<ThresholdStatus, string> = {
  normal: "var(--colors-green-500)",
  warning: "var(--colors-yellow-500)",
  critical: "var(--colors-red-500)",
};

const statusMap: Record<ThresholdStatus, "success" | "warning" | "error"> = {
  normal: "success",
  warning: "warning",
  critical: "error",
};

// ============================================================================
// Components
// ============================================================================

interface GaugeProps {
  value: number;
  min: number;
  max: number;
  status: ThresholdStatus;
  label?: string;
  unit?: string;
  displayValue: string;
}

function CircularGauge({ value, min, max, status, label, unit, displayValue }: GaugeProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const radius = 45;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * percentage) / 100;
  const color = colorMap[status];

  return (
    <Tooltip content={`${displayValue}${unit ? ` ${unit}` : ""} (${percentage.toFixed(0)}%)`}>
      <VStack gap="0" alignItems="center" position="relative" w="120px">
        <svg
          viewBox="0 0 120 120"
          className={cx(css({ w: "100%", h: "auto" }), interactive.scaleOnHover)}
        >
          {/* Background arc */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--colors-border-default)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            transform="rotate(135 60 60)"
          />
          {/* Value arc with animation */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            transform="rotate(135 60 60)"
            className={valueTransition}
          />
        </svg>
        <Center position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)">
          <VStack gap="0" alignItems="center">
            <Box className={cx(typography.value, valueTransition)}>{displayValue}</Box>
            {unit && <Box className={typography.muted}>{unit}</Box>}
          </VStack>
        </Center>
        {label && (
          <Box className={typography.muted} mt="1" textAlign="center">
            {label}
          </Box>
        )}
      </VStack>
    </Tooltip>
  );
}

function LinearGauge({ value, min, max, status, label, unit, displayValue }: GaugeProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const color = colorMap[status];

  return (
    <Box w="200px">
      <Flex justify="space-between" align="baseline" mb="1">
        {label && <Box className={typography.label}>{label}</Box>}
        <Tooltip content={`${percentage.toFixed(1)}% of max`}>
          <HStack gap="0.5" className={interactive.scaleOnHover}>
            <Box className={cx(typography.valueSmall, valueTransition)}>{displayValue}</Box>
            {unit && <Box className={typography.muted}>{unit}</Box>}
          </HStack>
        </Tooltip>
      </Flex>

      {/* Progress bar using Park UI */}
      <Progress.Root value={percentage} className={css({ "--progress-color": color })}>
        <Progress.Track
          className={css({
            h: "8px",
            bg: "bg.subtle",
            rounded: "full",
            overflow: "hidden",
          })}
        >
          <Progress.Range
            className={cx(
              css({
                h: "100%",
                rounded: "full",
                bg: "var(--progress-color)",
              }),
              valueTransition
            )}
          />
        </Progress.Track>
      </Progress.Root>

      <Flex justify="space-between" mt="1">
        <Box className={typography.muted}>{min}</Box>
        <Box className={typography.muted}>{max}</Box>
      </Flex>
    </Box>
  );
}

function CompactGauge({ status, label, unit, displayValue }: GaugeProps) {
  const color = colorMap[status];

  return (
    <HStack gap="2" alignItems="center" className={interactive.scaleOnHover}>
      <Box
        w="12px"
        h="12px"
        rounded="full"
        flexShrink={0}
        className={valueTransition}
        style={{ backgroundColor: color }}
      />
      <VStack gap="0" alignItems="flex-start">
        {label && <Box className={typography.muted}>{label}</Box>}
        <HStack gap="0.5">
          <Box className={cx(typography.valueSmall, valueTransition)}>{displayValue}</Box>
          {unit && <Box className={typography.muted}>{unit}</Box>}
        </HStack>
      </VStack>
      <StatusBadge status={statusMap[status]} size="sm">
        {status === "normal" ? "OK" : status === "warning" ? "Warn" : "Crit"}
      </StatusBadge>
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
    app
      .connect()
      .then(() => {
        appConnected = true;
      })
      .catch(() => {});

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

  const { status, displayValue } = useMemo(() => {
    if (!data) return { status: "normal" as ThresholdStatus, displayValue: "-" };

    const { value, thresholds } = data;
    let status: ThresholdStatus = "normal";

    if (thresholds) {
      if (thresholds.critical !== undefined && value >= thresholds.critical) {
        status = "critical";
      } else if (thresholds.warning !== undefined && value >= thresholds.warning) {
        status = "warning";
      }
    }

    const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);

    return { status, displayValue };
  }, [data]);

  // Loading state with skeleton
  if (loading) {
    const format = data?.format ?? "circular";
    return <GaugeSkeleton variant={format === "linear" ? "linear" : "circular"} />;
  }

  // No data state
  if (!data) {
    return (
      <Box className={containers.root} display="inline-flex">
        <Box className={containers.centered}>No data</Box>
      </Box>
    );
  }

  const { value, min = 0, max = 100, label, unit, format = "circular" } = data;
  const props: GaugeProps = { value, min, max, status, label, unit, displayValue };

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
