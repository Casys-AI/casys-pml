/**
 * Telemetry Module
 *
 * Exports logging and telemetry functionality.
 *
 * @module telemetry
 */

export { setupLogger, getLogger, logger } from "./logger.ts";
export { TelemetryService } from "./telemetry.ts";
export type { LogLevel, TelemetryMetric, TelemetryConfig, LoggerConfig } from "./types.ts";
