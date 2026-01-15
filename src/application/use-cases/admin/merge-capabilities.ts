/**
 * Merge Capabilities Use Case
 *
 * Merges duplicate capabilities into a canonical one.
 * Extracted from cap-handler.ts handleMerge() method.
 *
 * @module application/use-cases/admin/merge-capabilities
 */

import * as log from "@std/log";
import { z } from "zod";
import type { UseCaseResult } from "../shared/types.ts";
import type { MergeCapabilitiesRequest, MergeCapabilitiesResult, OnCapabilityMerged } from "./types.ts";
import type { CapabilityRegistry } from "../../../capabilities/capability-registry.ts";
import type { DbClient } from "../../../db/types.ts";
import { getCapabilityDisplayName, getCapabilityFqdn } from "../../../capabilities/types/fqdn.ts";

// ============================================================================
// Validation Schema
// ============================================================================

const MergeRequestSchema = z.object({
  source: z.string().min(1, "source is required"),
  target: z.string().min(1, "target is required"),
  preferSourceCode: z.boolean().optional(),
});

// ============================================================================
// Use Case
// ============================================================================

/**
 * Dependencies for MergeCapabilitiesUseCase
 */
export interface MergeCapabilitiesDeps {
  capabilityRegistry: CapabilityRegistry;
  db: DbClient;
  onMergedCallback?: OnCapabilityMerged;
}

/**
 * Merge Capabilities Use Case
 *
 * Combines usage stats, keeps newest code (or source if preferSourceCode=true).
 * Requires identical tools_used. Redirects graph edges.
 * Multi-tenant: only allows mutations on user's own capabilities.
 */
export class MergeCapabilitiesUseCase {
  constructor(private readonly deps: MergeCapabilitiesDeps) {}

  /**
   * Execute capability merge
   */
  async execute(request: MergeCapabilitiesRequest): Promise<UseCaseResult<MergeCapabilitiesResult>> {
    const { source, target, scope, userId, preferSourceCode } = request;

    // Validate with Zod
    const parsed = MergeRequestSchema.safeParse({ source, target, preferSourceCode });
    if (!parsed.success) {
      return {
        success: false,
        error: { code: "INVALID_REQUEST", message: parsed.error.errors[0].message },
      };
    }

    // Prevent self-merge
    if (source === target) {
      return {
        success: false,
        error: { code: "SELF_MERGE", message: "Cannot merge capability into itself" },
      };
    }

    try {
      const { capabilityRegistry, db, onMergedCallback } = this.deps;

      // Resolve source capability
      let sourceRecord = await capabilityRegistry.resolveByName(source, scope);
      if (!sourceRecord) {
        sourceRecord = await capabilityRegistry.getById(source);
      }
      if (!sourceRecord) {
        return {
          success: false,
          error: { code: "SOURCE_NOT_FOUND", message: `Source capability not found: ${source}` },
        };
      }

      // Resolve target capability
      let targetRecord = await capabilityRegistry.resolveByName(target, scope);
      if (!targetRecord) {
        targetRecord = await capabilityRegistry.getById(target);
      }
      if (!targetRecord) {
        return {
          success: false,
          error: { code: "TARGET_NOT_FOUND", message: `Target capability not found: ${target}` },
        };
      }

      // Multi-tenant check: only allow mutations on user's own capabilities
      if (userId) {
        if (sourceRecord.userId && sourceRecord.userId !== userId) {
          return {
            success: false,
            error: { code: "SOURCE_NOT_FOUND", message: `Source capability not found: ${source}` },
          };
        }
        if (targetRecord.userId && targetRecord.userId !== userId) {
          return {
            success: false,
            error: { code: "TARGET_NOT_FOUND", message: `Target capability not found: ${target}` },
          };
        }
      }

      // Get tools_used from workflow_pattern.dag_structure and code_snippet
      interface CapRow {
        tools_used: string[] | null;
        code_snippet: string | null;
        updated_at: Date | null;
      }
      const sourceRows = (await db.query(
        `SELECT
           wp.dag_structure->'tools_used' as tools_used,
           wp.code_snippet,
           cr.updated_at
         FROM capability_records cr
         LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
         WHERE cr.id = $1`,
        [sourceRecord.id],
      )) as unknown as CapRow[];
      const targetRows = (await db.query(
        `SELECT
           wp.dag_structure->'tools_used' as tools_used,
           wp.code_snippet,
           cr.updated_at
         FROM capability_records cr
         LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
         WHERE cr.id = $1`,
        [targetRecord.id],
      )) as unknown as CapRow[];

      if (sourceRows.length === 0 || targetRows.length === 0) {
        return {
          success: false,
          error: { code: "DETAILS_FAILED", message: "Failed to fetch capability details" },
        };
      }

      const sourceData = sourceRows[0];
      const targetData = targetRows[0];

      // Validate tools_used match (set comparison)
      const sourceTools = new Set(sourceData.tools_used || []);
      const targetTools = new Set(targetData.tools_used || []);
      const toolsMatch =
        sourceTools.size === targetTools.size &&
        [...sourceTools].every((t) => targetTools.has(t));

      if (!toolsMatch) {
        return {
          success: false,
          error: {
            code: "TOOLS_MISMATCH",
            message: `Cannot merge: tools_used mismatch. Source: [${[...sourceTools].join(", ")}], Target: [${[...targetTools].join(", ")}]`,
          },
        };
      }

      // Calculate merged stats
      const mergedUsageCount = sourceRecord.usageCount + targetRecord.usageCount;
      const mergedSuccessCount = sourceRecord.successCount + targetRecord.successCount;
      const mergedLatencyMs = (sourceRecord.totalLatencyMs ?? 0) + (targetRecord.totalLatencyMs ?? 0);
      const mergedCreatedAt =
        sourceRecord.createdAt < targetRecord.createdAt
          ? sourceRecord.createdAt
          : targetRecord.createdAt;

      // Determine code_snippet winner
      let useSourceCode = preferSourceCode ?? false;
      if (preferSourceCode === undefined) {
        // Default: use newest (by updated_at, fallback to created_at)
        const sourceTime = sourceData.updated_at ?? sourceRecord.createdAt;
        const targetTime = targetData.updated_at ?? targetRecord.createdAt;
        useSourceCode = sourceTime > targetTime;
      }
      const finalCodeSnippet = useSourceCode
        ? sourceData.code_snippet
        : targetData.code_snippet;

      // Execute merge in transaction
      await db.transaction(async (tx) => {
        // Update target workflow_pattern with merged stats
        if (targetRecord.workflowPatternId) {
          await tx.exec(
            `UPDATE workflow_pattern SET
              usage_count = $1,
              success_count = $2,
              success_rate = CASE WHEN $1 > 0 THEN $2::real / $1::real ELSE 0 END,
              created_at = LEAST(created_at, $3),
              code_snippet = COALESCE($4, code_snippet)
            WHERE pattern_id = $5`,
            [
              mergedUsageCount,
              mergedSuccessCount,
              mergedCreatedAt,
              finalCodeSnippet,
              targetRecord.workflowPatternId,
            ],
          );
        }

        // Update capability_records metadata
        await tx.exec(
          `UPDATE capability_records SET updated_at = NOW() WHERE id = $1`,
          [targetRecord.id],
        );

        // Redirect capability_dependency edges from source to target
        if (sourceRecord.workflowPatternId && targetRecord.workflowPatternId) {
          // Redirect outgoing edges
          await tx.exec(
            `UPDATE capability_dependency SET from_capability_id = $1::uuid
             WHERE from_capability_id = $2::uuid
             AND NOT EXISTS (
               SELECT 1 FROM capability_dependency cd2
               WHERE cd2.from_capability_id = $1::uuid AND cd2.to_capability_id = capability_dependency.to_capability_id
             )`,
            [targetRecord.workflowPatternId, sourceRecord.workflowPatternId],
          );

          // Redirect incoming edges
          await tx.exec(
            `UPDATE capability_dependency SET to_capability_id = $1::uuid
             WHERE to_capability_id = $2::uuid
             AND NOT EXISTS (
               SELECT 1 FROM capability_dependency cd2
               WHERE cd2.from_capability_id = capability_dependency.from_capability_id AND cd2.to_capability_id = $1::uuid
             )`,
            [targetRecord.workflowPatternId, sourceRecord.workflowPatternId],
          );

          // Delete remaining edges to/from source
          await tx.exec(
            `DELETE FROM capability_dependency
             WHERE from_capability_id = $1::uuid OR to_capability_id = $1::uuid`,
            [sourceRecord.workflowPatternId],
          );

          // Delete source workflow_pattern
          await tx.exec(
            `DELETE FROM workflow_pattern WHERE pattern_id = $1::uuid`,
            [sourceRecord.workflowPatternId],
          );
        }

        // Delete source capability_records
        await tx.exec(`DELETE FROM capability_records WHERE id = $1`, [
          sourceRecord.id,
        ]);
      });

      const result: MergeCapabilitiesResult = {
        success: true,
        targetId: targetRecord.id,
        targetFqdn: getCapabilityFqdn(targetRecord),
        targetDisplayName: getCapabilityDisplayName(targetRecord),
        deletedSourceId: sourceRecord.id,
        deletedSourceName: getCapabilityDisplayName(sourceRecord),
        deletedSourcePatternId: sourceRecord.workflowPatternId ?? null,
        targetPatternId: targetRecord.workflowPatternId ?? null,
        mergedStats: {
          usageCount: mergedUsageCount,
          successCount: mergedSuccessCount,
          totalLatencyMs: mergedLatencyMs,
        },
        codeSource: useSourceCode ? "source" : "target",
      };

      log.info(
        `[MergeCapabilities] ${getCapabilityDisplayName(sourceRecord)} -> ${getCapabilityDisplayName(targetRecord)} (usage: ${mergedUsageCount})`,
      );

      // Call merge callback for graph cache invalidation
      if (onMergedCallback) {
        try {
          await onMergedCallback(result);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          log.warn(`[MergeCapabilities] onMerged callback failed: ${msg}`);
        }
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      log.error(`[MergeCapabilities] Failed: ${error}`);
      return {
        success: false,
        error: { code: "MERGE_FAILED", message: (error as Error).message },
      };
    }
  }
}
