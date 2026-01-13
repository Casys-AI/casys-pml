/**
 * ExecutionCaptureService
 *
 * Captures successful executions as capabilities (workflow_pattern + pml_registry).
 *
 * Factorized from workflow-execution-handler.ts:685-779 to be reusable by:
 * - HIL flow (after per-layer validation completes)
 * - Client-routed flow (after client sends execution trace)
 *
 * @module application/services/execution-capture
 */

import * as log from "@std/log";
import type { LearningContext } from "../../cache/types.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import type { TraceTaskResult } from "../../capabilities/types/mod.ts";
import { getUserScope } from "../../lib/user.ts";

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Input for capturing an execution as a capability
 */
export interface ExecutionCaptureInput {
  /** Learning context with code, intent, staticStructure */
  learningContext: LearningContext;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Task results from execution */
  taskResults: TraceTaskResult[];
  /** User ID for multi-tenant isolation (overrides learningContext.userId) */
  userId?: string;
}

/**
 * Dependencies for ExecutionCaptureService
 */
export interface ExecutionCaptureDeps {
  /** Capability store for saving to workflow_pattern */
  capabilityStore: CapabilityStore;
  /** Optional registry for creating FQDN in pml_registry */
  capabilityRegistry?: CapabilityRegistry;
}

/**
 * Result of capturing an execution
 */
export interface ExecutionCaptureResult {
  /** Created/updated capability */
  capability: {
    id: string;
    codeHash: string;
  };
  /** FQDN if registered in pml_registry */
  fqdn?: string;
  /** True if newly created, false if already existed (via hash) */
  created: boolean;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * ExecutionCaptureService
 *
 * Captures successful code executions as reusable capabilities.
 *
 * Two-step process:
 * 1. Save to workflow_pattern (UPSERT via code hash)
 * 2. Register in pml_registry if not already registered
 */
export class ExecutionCaptureService {
  constructor(private readonly deps: ExecutionCaptureDeps) {}

  /**
   * Capture an execution as a capability
   *
   * @param input - Execution data to capture
   * @returns Capture result or null if capture failed
   */
  async capture(input: ExecutionCaptureInput): Promise<ExecutionCaptureResult | null> {
    const { learningContext: ctx, durationMs, taskResults, userId } = input;
    const effectiveUserId = userId ?? ctx.userId;

    try {
      // Extract executed tools from task results
      const executedPath = taskResults
        .filter((t) => t.success)
        .map((t) => t.tool)
        .filter((tool): tool is string => !!tool);

      const toolsUsed = ctx.toolsUsed ?? executedPath;

      // 1. Save to workflow_pattern (UPSERT via code hash)
      const { capability } = await this.deps.capabilityStore.saveCapability({
        code: ctx.code,
        intent: ctx.intent,
        durationMs: Math.round(durationMs),
        success: true,
        toolsUsed,
        traceData: {
          executedPath,
          taskResults,
          decisions: [],
          initialContext: { intent: ctx.intent },
          intentEmbedding: ctx.intentEmbedding,
          userId: effectiveUserId,
        },
        staticStructure: ctx.staticStructure,
      });

      log.debug("[ExecutionCaptureService] Capability saved to workflow_pattern", {
        capabilityId: capability.id,
        codeHash: capability.codeHash,
        toolsUsed,
      });

      let fqdn: string | undefined;
      let created = true;

      // 2. Register in pml_registry if not already registered
      if (this.deps.capabilityRegistry) {
        const scope = await getUserScope(effectiveUserId ?? null);
        const codeHash = capability.codeHash;

        // Check if already registered (by code hash within scope)
        const existingRecord = await this.deps.capabilityRegistry.getByCodeHash(
          codeHash,
          scope,
        );

        if (!existingRecord) {
          // Infer namespace from first tool (e.g., "std:echo" -> "std")
          const firstTool = toolsUsed[0] ?? "misc";
          const namespace = firstTool.includes(":") ? firstTool.split(":")[0] : "code";
          const action = `exec_${codeHash.substring(0, 8)}`;
          const hash = codeHash.substring(0, 4);

          const record = await this.deps.capabilityRegistry.create({
            org: scope.org,
            project: scope.project,
            namespace,
            action,
            workflowPatternId: capability.id,
            hash,
            userId: effectiveUserId,
            toolsUsed,
          });

          fqdn = record.id;

          log.info("[ExecutionCaptureService] Capability registered in pml_registry", {
            fqdn,
            namespace,
            action,
          });
        } else {
          fqdn = existingRecord.id;
          created = false;

          log.debug("[ExecutionCaptureService] Capability already registered", {
            fqdn: existingRecord.id,
          });
        }
      }

      return {
        capability: {
          id: capability.id,
          codeHash: capability.codeHash,
        },
        fqdn,
        created,
      };
    } catch (error) {
      log.error("[ExecutionCaptureService] Failed to capture execution", {
        intent: ctx.intent.substring(0, 50),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
