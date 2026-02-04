/**
 * LoadingSkeleton - Pre-configured skeleton loading states
 *
 * Provides common loading patterns for MCP Apps UIs
 * using Park UI Skeleton component.
 *
 * @module lib/std/src/ui/shared/LoadingSkeleton
 */

import { type ComponentProps } from "react";
import { Skeleton, SkeletonText } from "../components/ui/skeleton";
import { Box, Flex, VStack, HStack } from "../styled-system/jsx";
import { containers } from "./interactions";

export type LoadingSkeletonProps = ComponentProps<typeof Skeleton>;

/**
 * Table loading skeleton
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Box className={containers.root}>
      {/* Header */}
      <Flex gap="3" mb="3" align="center">
        <Skeleton height="36px" width="200px" borderRadius="md" />
        <Skeleton height="36px" width="100px" borderRadius="md" />
      </Flex>

      {/* Table header */}
      <HStack gap="4" mb="2" p="2">
        <Skeleton height="16px" width="80px" />
        <Skeleton height="16px" width="120px" />
        <Skeleton height="16px" width="100px" />
        <Skeleton height="16px" width="80px" />
      </HStack>

      {/* Table rows */}
      <VStack gap="2">
        {[...Array(rows)].map((_, i) => (
          <HStack key={i} gap="4" p="2" width="full">
            <Skeleton height="20px" width="80px" />
            <Skeleton height="20px" width="120px" />
            <Skeleton height="20px" width="100px" />
            <Skeleton height="20px" width="80px" />
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}

/**
 * Chart loading skeleton
 */
export function ChartSkeleton() {
  return (
    <Box className={containers.root}>
      {/* Header */}
      <Flex justify="space-between" mb="4">
        <Skeleton height="24px" width="150px" />
        <HStack gap="1">
          <Skeleton height="32px" width="60px" borderRadius="md" />
          <Skeleton height="32px" width="60px" borderRadius="md" />
          <Skeleton height="32px" width="60px" borderRadius="md" />
        </HStack>
      </Flex>

      {/* Chart area */}
      <Skeleton height="250px" width="100%" borderRadius="lg" />

      {/* Legend */}
      <HStack gap="4" mt="3" justify="center">
        <HStack gap="1.5">
          <Skeleton height="12px" width="12px" borderRadius="sm" />
          <Skeleton height="12px" width="60px" />
        </HStack>
        <HStack gap="1.5">
          <Skeleton height="12px" width="12px" borderRadius="sm" />
          <Skeleton height="12px" width="60px" />
        </HStack>
      </HStack>
    </Box>
  );
}

/**
 * Metrics panel loading skeleton
 */
export function MetricsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box className={containers.root}>
      <Flex gap="4" flexWrap="wrap">
        {[...Array(count)].map((_, i) => (
          <Box key={i} p="4" flex="1" minW="150px">
            <Skeleton height="14px" width="80px" mb="2" />
            <Skeleton height="32px" width="100px" mb="1" />
            <Skeleton height="12px" width="60px" />
          </Box>
        ))}
      </Flex>
    </Box>
  );
}

/**
 * Gauge loading skeleton
 */
export function GaugeSkeleton({ variant = "circular" }: { variant?: "circular" | "linear" }) {
  if (variant === "linear") {
    return (
      <Box className={containers.root} width="200px">
        <Flex justify="space-between" mb="1">
          <Skeleton height="14px" width="60px" />
          <Skeleton height="20px" width="50px" />
        </Flex>
        <Skeleton height="8px" width="100%" borderRadius="full" />
        <Flex justify="space-between" mt="1">
          <Skeleton height="12px" width="20px" />
          <Skeleton height="12px" width="20px" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box className={containers.root} display="inline-flex">
      <VStack gap="0" alignItems="center">
        <Skeleton height="120px" width="120px" borderRadius="full" />
        <Skeleton height="14px" width="60px" mt="1" />
      </VStack>
    </Box>
  );
}

/**
 * JSON/Tree viewer loading skeleton
 */
export function TreeSkeleton({ depth = 3 }: { depth?: number }) {
  return (
    <Box className={containers.root}>
      <VStack gap="2" align="start">
        <Skeleton height="16px" width="100px" />
        {[...Array(depth)].map((_, i) => (
          <VStack key={i} gap="1" align="start" pl={`${(i + 1) * 16}px`}>
            <Skeleton height="14px" width={`${150 - i * 20}px`} />
            <Skeleton height="14px" width={`${120 - i * 15}px`} />
          </VStack>
        ))}
      </VStack>
    </Box>
  );
}

/**
 * Generic content loading skeleton with text
 */
export function ContentSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Box className={containers.root}>
      <Skeleton height="20px" width="60%" mb="3" />
      <SkeletonText noOfLines={lines} gap="2" />
    </Box>
  );
}

// Re-export base components for custom usage
export { Skeleton, SkeletonText };
