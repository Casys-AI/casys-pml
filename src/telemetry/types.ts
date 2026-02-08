/**
 * Telemetry Type Definitions
 *
 * Defines interfaces and types for logging and telemetry system.
 *
 * @module telemetry/types
 */

/**
 * Log levels supported by the logging system
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Telemetry metric data
 */
export interface TelemetryMetric {
  metric_name: string;
  value: number;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  enabled: boolean;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  level?: LogLevel;
  logFilePath?: string;
  consoleOutput?: boolean;
  fileOutput?: boolean;
}

/**
 * Named loggers available in the application
 */
export type LoggerName =
  | "default"
  | "mcp"
  | "vector"
  | "event-stream"
  | "command-queue"
  | "controlled-executor"
  | "dag-optimizer"
  | "trace-generator";

/**
 * Histogram bucket for latency distribution
 */
export interface HistogramBucket {
  le: number;
  count: number;
}

/**
 * Latency histogram with predefined buckets
 */
export interface LatencyHistogram {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

/**
 * Sentry tag fields for filtering in Sentry UI
 */
export const SENTRY_TAG_FIELDS = [
  "server_id",
  "tool",
  "operation",
  "environment",
  "cache_hit",
  "pii_detected",
] as const;

export type SentryTagField = (typeof SENTRY_TAG_FIELDS)[number];
