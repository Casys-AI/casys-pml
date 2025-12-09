/**
 * Telemetry Module
 *
 * Exports logging and telemetry functionality.
 *
 * @module telemetry
 */

export { getLogger, logger, setupLogger } from "./logger.ts";
export { TelemetryService } from "./telemetry.ts";
export type { LoggerConfig, LogLevel, TelemetryConfig, TelemetryMetric } from "./types.ts";
// Story 6.5: MetricsCollector for EventBus-based metrics (ADR-036)
export { MetricsCollector } from "./metrics-collector.ts";
