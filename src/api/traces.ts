/**
 * Traces API Handler
 *
 * Story 14.5b: REST endpoint for receiving execution traces from packages/pml clients.
 *
 * Receives batch traces from TraceSyncer and stores them via ExecutionTraceStore.
 * Learning happens automatically via existing TD-Error + PER infrastructure (Story 11.3).
 *
 * @module api/traces
 */

import type { RouteContext } from "../mcp/routing/types.ts";
import { errorResponse, jsonResponse } from "../mcp/routing/types.ts";
import { ExecutionTraceStore } from "../capabilities/execution-trace-store.ts";
import type { SaveTraceInput } from "../capabilities/execution-trace-store.ts";
import type { BranchDecision, JsonValue, TraceTaskResult } from "../capabilities/types.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";
import { isValidFQDN, parseFQDN } from "../capabilities/fqdn.ts";
import type { DbClient } from "../db/types.ts";
import { getLogger } from "../telemetry/logger.ts";
import { deleteWorkflowState, getWorkflowStateRecord } from "../cache/workflow-state-cache.ts";
import { ExecutionCaptureService } from "../application/services/execution-capture.service.ts";
import { DAGConverterAdapter } from "../infrastructure/di/adapters/execute/dag-converter-adapter.ts";
import { McpRegistryService } from "../mcp/registry/mcp-registry.service.ts";
import {
  type IncomingTrace,
  type TracesRequest,
  type TracesResponse,
  UUID_REGEX,
} from "./types.ts";

const logger = getLogger("default");

/**
 * Check if a string is a valid UUID.
 */
function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Resolve a capability identifier (FQDN or UUID) to workflowPatternId.
 *
 * The client sends capabilityId as FQDN (e.g., "local.default.fs.read_file.a7f3").
 * We need to resolve this to the workflow_pattern.pattern_id (UUID) for FK storage.
 *
 * Resolution order:
 * 1. If already a UUID → return as-is
 * 2. If valid FQDN (5 parts) → lookup by components
 * 3. Otherwise → return null (standalone trace)
 *
 * @param capabilityId - FQDN or UUID from client
 * @param db - Database client
 * @returns workflowPatternId (UUID) or null if not found
 */
async function resolveCapabilityId(
  capabilityId: string,
  db: DbClient,
): Promise<string | null> {
  // 1. If it's already a UUID, return as-is
  if (isUUID(capabilityId)) {
    return capabilityId;
  }

  // 2. If it's a valid FQDN (5 parts), lookup by components
  if (isValidFQDN(capabilityId)) {
    try {
      const { org, project, namespace, action, hash } = parseFQDN(capabilityId);
      const registry = new CapabilityRegistry(db);
      const record = await registry.getByFqdnComponents(org, project, namespace, action, hash);

      if (record?.workflowPatternId) {
        logger.debug("Resolved FQDN to workflowPatternId", {
          fqdn: capabilityId,
          workflowPatternId: record.workflowPatternId,
        });
        return record.workflowPatternId;
      }
    } catch (error) {
      logger.warn("Failed to resolve FQDN", {
        fqdn: capabilityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 3. Not found or invalid format → standalone trace
  logger.debug("Capability not resolved, storing as standalone trace", {
    capabilityId,
  });
  return null;
}

/**
 * Map incoming trace to SaveTraceInput format.
 *
 * Handles the field name mapping from packages/pml format to server format.
 *
 * @param incoming - Trace from client
 * @param resolvedCapabilityId - Resolved workflowPatternId (UUID) or null for standalone
 * @param userId - User ID from context
 */
async function mapIncomingToSaveInput(
  incoming: IncomingTrace,
  resolvedCapabilityId: string | null,
  userId: string | undefined,
  db: DbClient,
): Promise<SaveTraceInput> {
  // Map task results (align field names)
  const taskResults: TraceTaskResult[] = incoming.taskResults.map((tr) => ({
    taskId: tr.taskId,
    tool: tr.tool,
    args: tr.args as Record<string, JsonValue>,
    result: tr.result as JsonValue,
    success: tr.success,
    durationMs: tr.durationMs,
    layerIndex: tr.layerIndex, // Story 11.4: Include layerIndex for TraceTimeline
  }));

  // Map decisions (already aligned)
  const decisions: BranchDecision[] = incoming.decisions.map((d) => ({
    nodeId: d.nodeId,
    outcome: d.outcome,
    condition: d.condition,
  }));

  // Parse timestamp to Date, fallback to now
  let executedAt: Date;
  try {
    executedAt = incoming.timestamp ? new Date(incoming.timestamp) : new Date();
  } catch {
    executedAt = new Date();
  }

  // Issue 6 fix: Derive executedPath from taskResults and resolve FQDNs to UUIDs
  // PML CLI now sends FQDNs (e.g., "local.default.meta.personWithAddress.xxxx") for capabilities
  // We resolve these to UUIDs so flattenExecutedPath() can match child traces
  const executedPath: string[] = [];
  for (const tr of taskResults) {
    const resolved = await resolveCapabilityId(tr.tool, db);
    executedPath.push(resolved ?? tr.tool); // UUID if resolved, original tool ID otherwise
  }

  return {
    // ADR-041: Use package-generated traceId as the trace's ID for parent-child linking
    // Validate UUID format - if invalid, let DB generate one
    id: incoming.traceId && isUUID(incoming.traceId) ? incoming.traceId : undefined,
    // Use resolved UUID, or undefined for standalone traces
    capabilityId: resolvedCapabilityId ?? undefined,
    success: incoming.success,
    errorMessage: incoming.error,
    durationMs: incoming.durationMs,
    taskResults,
    decisions,
    executedPath,
    priority: 0.5, // Default priority - TD-Error will update later
    // Migration 039: createdBy removed, use userId (UUID FK or null)
    // Note: "local" is not a valid UUID, treat as undefined
    userId: (userId && userId !== "local") ? userId : (incoming.userId && incoming.userId !== "local") ? incoming.userId : undefined,
    executedAt,
    // ADR-041: Parent trace ID for nested capability calls
    // Validate UUID format to prevent FK issues with malformed IDs
    parentTraceId: incoming.parentTraceId && isUUID(incoming.parentTraceId)
      ? incoming.parentTraceId
      : undefined,
  };
}

/**
 * POST /api/traces
 *
 * Receives batch of execution traces from packages/pml clients.
 *
 * Request body:
 * ```json
 * {
 *   "traces": [
 *     {
 *       "capabilityId": "casys.tools.example:run",
 *       "success": true,
 *       "durationMs": 500,
 *       "taskResults": [...],
 *       "decisions": [],
 *       "timestamp": "2024-01-01T00:00:00Z"
 *     }
 *   ]
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "received": 5,
 *   "stored": 5,
 *   "errors": []
 * }
 * ```
 */
export async function handleTracesPost(
  req: Request,
  _url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Require database access
  if (!ctx.db) {
    logger.error("Database client not available in route context");
    return errorResponse("Database unavailable", 503, corsHeaders);
  }

  // Parse request body
  let body: TracesRequest;
  try {
    body = await req.json() as TracesRequest;
  } catch (error) {
    logger.warn("Invalid JSON in traces request", { error });
    return errorResponse("Invalid JSON body", 400, corsHeaders);
  }

  // Validate request
  if (!body.traces || !Array.isArray(body.traces)) {
    return errorResponse("Missing or invalid 'traces' array", 400, corsHeaders);
  }

  if (body.traces.length === 0) {
    return jsonResponse({
      received: 0,
      stored: 0,
    } as TracesResponse, 200, corsHeaders);
  }

  // Rate limit: max 100 traces per request
  if (body.traces.length > 100) {
    return errorResponse("Too many traces (max 100 per request)", 400, corsHeaders);
  }

  // Create trace store
  const traceStore = new ExecutionTraceStore(ctx.db);

  // Process traces
  let stored = 0;
  const errors: string[] = [];

  for (const incoming of body.traces) {
    try {
      // Handle client-routed capability finalization via workflowId
      if (incoming.workflowId && incoming.success) {
        const workflowRecord = await getWorkflowStateRecord(incoming.workflowId);

        if (workflowRecord?.learningContext) {
          // Create capability from stored learning context + client execution trace
          // Use context's capabilityStore if available (avoids re-creating embedding model)
          if (!ctx.capabilityStore) {
            logger.error("CapabilityStore not available in context for workflow finalization");
            errors.push(`CapabilityStore not available for workflowId: ${incoming.workflowId}`);
            continue;
          }
          const capabilityRegistry = new CapabilityRegistry(ctx.db);

          const mcpRegistry = new McpRegistryService(ctx.db);
          const captureService = new ExecutionCaptureService({
            capabilityStore: ctx.capabilityStore,
            capabilityRegistry,
            dagConverter: new DAGConverterAdapter(),
            mcpRegistry,
          });

          // Map incoming taskResults to TraceTaskResult format
          const taskResults: TraceTaskResult[] = incoming.taskResults.map((tr) => ({
            taskId: tr.taskId,
            tool: tr.tool,
            args: tr.args as Record<string, JsonValue>,
            result: tr.result as JsonValue,
            success: tr.success,
            durationMs: tr.durationMs,
            layerIndex: tr.layerIndex, // Story 11.4: Include layerIndex for TraceTimeline
          }));

          const captureResult = await captureService.capture({
            learningContext: workflowRecord.learningContext,
            durationMs: incoming.durationMs,
            taskResults,
            userId: workflowRecord.learningContext.userId,
          });

          // Cleanup from KV
          await deleteWorkflowState(incoming.workflowId);

          if (captureResult) {
            logger.info("Capability captured from client execution", {
              workflowId: incoming.workflowId,
              capabilityId: captureResult.capability.id,
              fqdn: captureResult.fqdn,
              created: captureResult.created,
            });
            stored++;
          }
        } else {
          logger.warn("Learning context not found for workflowId", {
            workflowId: incoming.workflowId,
          });
          errors.push(`Learning context not found for workflowId: ${incoming.workflowId}`);
        }
        continue; // Skip normal trace processing for workflow finalization
      }

      // Validate required fields for normal traces
      // capabilityId is optional when workflowId is present (capability created server-side)
      if (typeof incoming.success !== "boolean") {
        errors.push(`Invalid trace: missing success field`);
        continue;
      }
      if (!incoming.workflowId && !incoming.capabilityId) {
        errors.push(`Invalid trace: missing capabilityId (required when no workflowId)`);
        continue;
      }
      // Validate required array fields (must exist and be arrays)
      if (!Array.isArray(incoming.taskResults)) {
        errors.push(`Invalid trace ${incoming.capabilityId}: missing or invalid taskResults array`);
        continue;
      }
      if (!Array.isArray(incoming.decisions)) {
        errors.push(`Invalid trace ${incoming.capabilityId}: missing or invalid decisions array`);
        continue;
      }

      // Resolve FQDN → workflowPatternId (UUID)
      // Client sends FQDN like "local.default.fs.read_file.a7f3"
      // Server stores trace with FK to workflow_pattern.pattern_id
      const resolvedCapabilityId = await resolveCapabilityId(incoming.capabilityId, ctx.db);

      // Map to server format with resolved UUID
      // Issue 6 fix: Pass db for FQDN → UUID resolution in executedPath
      const saveInput = await mapIncomingToSaveInput(incoming, resolvedCapabilityId, ctx.userId, ctx.db);

      // Save trace (triggers existing TD-Error + PER via eventBus)
      await traceStore.saveTrace(saveInput);
      stored++;

      if (resolvedCapabilityId) {
        logger.debug("Trace saved with capability link", {
          fqdn: incoming.capabilityId,
          workflowPatternId: resolvedCapabilityId,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to save trace", { capabilityId: incoming.capabilityId, error: msg });
      errors.push(`Failed to save trace ${incoming.capabilityId}: ${msg}`);
    }
  }

  logger.info("Traces batch processed", {
    received: body.traces.length,
    stored,
    errors: errors.length,
  });

  const response: TracesResponse = {
    received: body.traces.length,
    stored,
  };

  if (errors.length > 0) {
    response.errors = errors;
  }

  return jsonResponse(response, 200, corsHeaders);
}

/**
 * GET /api/traces/:id
 *
 * Retrieve a single execution trace by ID (= workflowId per ADR-065).
 * Used by MCP Apps (e.g., TraceViewer) to fetch real execution traces.
 */
export async function handleTracesGet(
  _req: Request,
  _url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
  traceId: string,
): Promise<Response> {
  if (!ctx.db) {
    return errorResponse("Database unavailable", 503, corsHeaders);
  }

  if (!isUUID(traceId)) {
    return errorResponse("Invalid trace ID format", 400, corsHeaders);
  }

  const traceStore = new ExecutionTraceStore(ctx.db);
  const trace = await traceStore.getTraceById(traceId);

  if (!trace) {
    return errorResponse("Trace not found", 404, corsHeaders);
  }

  return jsonResponse(trace, 200, corsHeaders);
}

/**
 * Route traces-related requests.
 */
export function handleTracesRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> | null {
  if (url.pathname === "/api/traces" && req.method === "POST") {
    return handleTracesPost(req, url, ctx, corsHeaders);
  }

  // GET /api/traces/:id
  const traceMatch = url.pathname.match(/^\/api\/traces\/([^/]+)$/);
  if (traceMatch && req.method === "GET") {
    return handleTracesGet(req, url, ctx, corsHeaders, traceMatch[1]);
  }

  return null;
}
