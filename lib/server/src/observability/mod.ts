/**
 * Observability module for @casys/mcp-server
 *
 * - OTel tracing (spans on tool calls, auth events)
 * - Metrics collection (counters, histograms, gauges)
 * - Prometheus text format export
 *
 * @module lib/server/observability
 */

export {
  getServerTracer,
  startToolCallSpan,
  endToolCallSpan,
  recordAuthEvent,
  isOtelEnabled,
  type ToolCallSpanAttributes,
} from "./otel.ts";

export {
  ServerMetrics,
  type ServerMetricsSnapshot,
} from "./metrics.ts";
