/**
 * OpenTelemetry Integration for @casys/mcp-server
 *
 * Provides tracing for tool calls, auth, and middleware pipeline.
 * Uses Deno's built-in OTEL support (Deno 2.2+).
 * Enable with: OTEL_DENO=true deno run --unstable-otel ...
 *
 * @module lib/server/observability/otel
 */

import { type Span, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";

let serverTracer: Tracer | null = null;

/**
 * Get or create the MCP server tracer
 */
export function getServerTracer(): Tracer {
  if (!serverTracer) {
    serverTracer = trace.getTracer("mcp.server", "0.6.0");
  }
  return serverTracer;
}

/**
 * Span attributes for MCP tool calls
 */
export interface ToolCallSpanAttributes {
  "mcp.tool.name": string;
  "mcp.server.name"?: string;
  "mcp.transport"?: string;
  "mcp.session.id"?: string;
  "mcp.auth.subject"?: string;
  "mcp.auth.client_id"?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Start a span for a tool call.
 * Caller MUST call span.end() when done.
 */
export function startToolCallSpan(
  toolName: string,
  attributes: ToolCallSpanAttributes,
): Span {
  const tracer = getServerTracer();
  return tracer.startSpan(`mcp.tool.call ${toolName}`, { attributes });
}

/**
 * Record a tool call result on a span and end it.
 */
export function endToolCallSpan(
  span: Span,
  success: boolean,
  durationMs: number,
  error?: string,
): void {
  span.setAttribute("mcp.tool.duration_ms", durationMs);
  span.setAttribute("mcp.tool.success", success);

  if (error) {
    span.setAttribute("mcp.tool.error", error);
    span.recordException(new Error(error));
  }

  span.setStatus({
    code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    message: error,
  });
  span.end();
}

/**
 * Record an auth event as a fire-and-forget span
 */
export function recordAuthEvent(
  event: "verify" | "reject" | "cache_hit",
  attributes: Record<string, string | number | boolean | undefined>,
): void {
  const tracer = getServerTracer();
  tracer.startActiveSpan(`mcp.auth.${event}`, { attributes }, (span) => {
    span.setStatus({ code: event === "reject" ? SpanStatusCode.ERROR : SpanStatusCode.OK });
    span.end();
  });
}

/**
 * Check if OTEL is enabled (via OTEL_DENO env var)
 */
export function isOtelEnabled(): boolean {
  try {
    return Deno.env.get("OTEL_DENO") === "true";
  } catch {
    return false;
  }
}
