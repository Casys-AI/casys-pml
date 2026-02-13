/**
 * Exposed Capability Handler
 *
 * Handles execution of exposed capabilities (--expose flag).
 * Translates named tool calls into pml_execute-equivalent requests
 * through the existing forwardToCloud → executeLocalCode pipeline.
 *
 * @module cli/shared/exposed-handler
 */

import type { ExposedCapability } from "./capability-resolver.ts";
import type { Logger } from "./types.ts";
import type { CapabilityLoader } from "../../loader/mod.ts";
import type { SessionClient } from "../../session/mod.ts";
import type { PendingWorkflowStore } from "../../workflow/mod.ts";
import { forwardToCloud } from "./cloud-client.ts";
import { parseExecuteLocallyResponse } from "./workflow-utils.ts";
import { executeLocalCode } from "./local-executor.ts";
import { buildMcpLocalResult } from "./response-builder.ts";
import AjvModule from "ajv";

// Singleton AJV instance with compiled schema cache
// deno-lint-ignore no-explicit-any
const Ajv = (AjvModule as any).default ?? AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });
const schemaCache = new Map<string, ReturnType<typeof ajv.compile>>();

/**
 * Result of handling an exposed capability call.
 */
export interface ExposedCallResult {
  /** Whether the call was handled (tool name matched an exposed capability) */
  handled: boolean;
  /** MCP response to return to the client (only set if handled=true) */
  response?: {
    jsonrpc: "2.0";
    id: string | number;
    result?: unknown;
    error?: { code: number; message: string };
  };
}

/**
 * Context needed to handle an exposed capability call.
 */
export interface ExposedCallContext {
  id: string | number;
  args: Record<string, unknown> | undefined;
  exposedCapabilities: ExposedCapability[];
  loader: CapabilityLoader | null;
  cloudUrl: string;
  sessionClient: SessionClient | null;
  pendingWorkflowStore: PendingWorkflowStore;
  logger: Logger;
}

/**
 * Find an exposed capability by tool name.
 */
export function findExposedCapability(
  toolName: string,
  capabilities: ExposedCapability[],
): ExposedCapability | undefined {
  return capabilities.find((c) => c.name === toolName);
}

/**
 * Handle an exposed capability tool call.
 *
 * Translates the named tool call into a pml_execute-equivalent request:
 *   weather_forecast({ city: "Paris" })
 *   → pml_execute({ capabilityFqdn: "alice.default.weather.forecast.abc1", args: { city: "Paris" } })
 *
 * Then routes through forwardToCloud → executeLocalCode (same pipeline as regular execute).
 *
 * @returns ExposedCallResult with handled=true if the tool matched, handled=false otherwise
 */
export async function handleExposedCall(
  toolName: string,
  ctx: ExposedCallContext,
): Promise<ExposedCallResult> {
  const cap = findExposedCapability(toolName, ctx.exposedCapabilities);
  if (!cap) {
    return { handled: false };
  }

  ctx.logger.debug?.(`Exposed tool call: ${toolName} → ${cap.fqdn}`);

  // Validate args against inputSchema before sending to cloud
  if (cap.inputSchema && Object.keys(cap.inputSchema).length > 0) {
    let validate = schemaCache.get(cap.fqdn);
    if (!validate) {
      validate = ajv.compile(cap.inputSchema);
      schemaCache.set(cap.fqdn, validate);
    }
    if (!validate(ctx.args ?? {})) {
      const errors = (validate.errors ?? [])
        .map((e: { instancePath: string; message?: string }) =>
          `${e.instancePath || "/"}: ${e.message}`
        )
        .join("; ");
      return {
        handled: true,
        response: {
          jsonrpc: "2.0",
          id: ctx.id,
          error: {
            code: -32602,
            message: `Invalid arguments for ${toolName}: ${errors}`,
          },
        },
      };
    }
  }

  // Build pml_execute-equivalent request with the capability's FQDN
  const executeArgs: Record<string, unknown> = {
    capabilityFqdn: cap.fqdn,
    args: ctx.args ?? {},
  };

  // Forward to cloud (same as normal pml_execute flow)
  const cloudResult = await forwardToCloud(
    ctx.id,
    "execute",
    executeArgs,
    ctx.cloudUrl,
    ctx.sessionClient,
  );

  if (!cloudResult.ok) {
    return {
      handled: true,
      response: {
        jsonrpc: "2.0",
        id: ctx.id,
        error: { code: -32603, message: cloudResult.error ?? "Cloud call failed" },
      },
    };
  }

  // Check for execute_locally response (same as normal execute flow)
  const response = cloudResult.response as {
    result?: { content?: Array<{ type: string; text: string }> };
  };
  const content = response?.result?.content?.[0]?.text;

  if (content) {
    const execLocally = parseExecuteLocallyResponse(content);

    if (execLocally) {
      ctx.logger.debug?.(
        `Exposed ${toolName}: execute_locally — client tools: ${execLocally.client_tools.join(", ")}`,
      );

      // Create FQDN map from server-resolved tools
      const fqdnMap = new Map<string, string>();
      for (const tool of execLocally.tools_used) {
        fqdnMap.set(tool.id, tool.fqdn);
      }

      const localResult = await executeLocalCode(
        execLocally.code,
        ctx.loader,
        ctx.cloudUrl,
        fqdnMap,
        undefined, // No continueWorkflow for initial call
        ctx.logger,
        execLocally.workflowId,
        execLocally.dag?.tasks,
      );

      return {
        handled: true,
        response: {
          jsonrpc: "2.0",
          id: ctx.id,
          result: buildMcpLocalResult(localResult, {
            code: execLocally.code,
            fqdnMap: Object.fromEntries(fqdnMap),
            pendingWorkflowStore: ctx.pendingWorkflowStore,
            dagTasks: execLocally.dag?.tasks,
          }, true, execLocally.ui_orchestration, execLocally.workflowId),
        },
      };
    }
  }

  // Not execute_locally — return cloud response as-is
  return {
    handled: true,
    response: cloudResult.response as ExposedCallResult["response"],
  };
}
