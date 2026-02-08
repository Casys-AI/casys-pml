/**
 * Shared Handler Utilities
 *
 * Common patterns extracted from handler facades to reduce duplication.
 *
 * @module mcp/handlers/shared/handler-utils
 */

import * as log from "@std/log";
import { addBreadcrumb, captureError, startTransaction } from "../../../telemetry/sentry.ts";
import { formatMCPSuccess } from "../../server/responses.ts";
import type { MCPToolResponse, MCPErrorResponse } from "../../server/types.ts";

/**
 * Transaction context for telemetry tracking
 */
export interface TransactionContext {
  finish: () => void;
  setData: (key: string, value: unknown) => void;
  setTag: (key: string, value: string) => void;
}

/**
 * Handler execution context with telemetry
 */
export interface HandlerContext {
  transaction: TransactionContext;
  startTime: number;
}

/**
 * Create a handler execution context with telemetry
 *
 * @param operation - Operation name for telemetry (e.g., "mcp.discover")
 * @param category - Telemetry category (default: "mcp")
 */
export function createHandlerContext(operation: string, category = "mcp"): HandlerContext {
  return {
    transaction: startTransaction(operation, category),
    startTime: performance.now(),
  };
}

/**
 * Format error response with consistent structure
 *
 * @param message - Error message
 * @param transaction - Transaction to finish
 */
export function formatErrorResponse(
  message: string,
  transaction: TransactionContext,
): MCPErrorResponse {
  transaction.finish();
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: message }),
    }],
  } as unknown as MCPErrorResponse;
}

/**
 * Handle errors consistently across handlers
 *
 * @param error - Caught error
 * @param operation - Operation name for logging
 * @param handler - Handler name for context
 * @param transaction - Transaction to finish
 */
export function handleError(
  error: unknown,
  operation: string,
  handler: string,
  transaction: TransactionContext,
): MCPErrorResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);
  log.error(`${operation} error: ${error}`);
  captureError(error as Error, { operation, handler });
  transaction.finish();
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: `${operation.replace("mcp.", "").replace(".", " ")} failed: ${errorMessage}` }),
    }],
  } as unknown as MCPErrorResponse;
}

/**
 * Log and format successful handler response
 *
 * @param data - Response data
 * @param context - Handler context for timing
 * @param logMessage - Log message template (use {elapsed} for timing)
 */
export function formatSuccessResponse<T>(
  data: T,
  context: HandlerContext,
  logMessage?: string,
): MCPToolResponse {
  const elapsedMs = performance.now() - context.startTime;

  if (logMessage) {
    log.info(logMessage.replace("{elapsed}", elapsedMs.toFixed(1)));
  }

  context.transaction.finish();
  return formatMCPSuccess(data);
}

/**
 * Validate required parameters and return error response if missing
 *
 * @param params - Parameters to validate
 * @param required - Map of parameter names to their values
 * @param transaction - Transaction to finish on error
 * @returns Error response if validation fails, undefined otherwise
 */
export function validateRequiredParams(
  required: Record<string, unknown>,
  transaction: TransactionContext,
): MCPErrorResponse | undefined {
  for (const [name, value] of Object.entries(required)) {
    if (value === undefined || value === null) {
      return formatErrorResponse(`Missing required parameter: '${name}'`, transaction);
    }
  }
  return undefined;
}

/**
 * Add telemetry breadcrumb for handler operations
 *
 * @param category - Breadcrumb category
 * @param message - Breadcrumb message
 * @param data - Additional data
 */
export function addHandlerBreadcrumb(
  category: string,
  message: string,
  data: Record<string, unknown>,
): void {
  addBreadcrumb(category, message, data);
}
