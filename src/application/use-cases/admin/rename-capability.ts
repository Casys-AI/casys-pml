/**
 * Rename Capability Use Case
 *
 * Updates a capability's namespace, action, description, tags, or visibility.
 * Extracted from cap-handler.ts handleRename() method.
 *
 * @module application/use-cases/admin/rename-capability
 */

import * as log from "@std/log";
import { z } from "zod";
import type { UseCaseResult } from "../shared/types.ts";
import type { RenameCapabilityRequest, RenameCapabilityResult } from "./types.ts";
import type { CapabilityRegistry } from "../../../capabilities/capability-registry.ts";
import type { DbClient } from "../../../db/types.ts";
import type { EmbeddingModelInterface } from "../../../vector/embeddings.ts";
import { eventBus } from "../../../events/mod.ts";
import { getCapabilityDisplayName } from "../../../capabilities/types/fqdn.ts";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Namespace must be lowercase letters/numbers, start with letter.
 */
const NamespaceSchema = z
  .string()
  .min(1, "Namespace cannot be empty")
  .max(20, "Namespace too long (max 20 chars)")
  .regex(/^[a-z][a-z0-9]*$/, "Namespace must be lowercase letters/numbers, start with letter")
  .refine((s) => !s.includes("_") && !s.includes(":"), "No underscores or colons allowed");

/**
 * Action must be camelCase or snake_case, no auto-generated prefixes.
 */
const ActionSchema = z
  .string()
  .min(1, "Action cannot be empty")
  .max(50, "Action too long (max 50 chars)")
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Action must be alphanumeric (camelCase/snake_case), start with letter")
  .refine((s) => !s.includes(":"), "No colons allowed in action")
  .refine(
    (s) => !s.startsWith("exec_") && !s.match(/^exec[0-9a-f]{6,}/i),
    "Auto-generated names like 'exec_...' not allowed. Use a descriptive name.",
  );

// ============================================================================
// Helper
// ============================================================================

/**
 * Build text for embedding generation
 */
function buildEmbeddingText(name: string, description?: string | null): string {
  if (description) {
    return `${name}: ${description}`;
  }
  return name;
}

// ============================================================================
// Use Case
// ============================================================================

/**
 * Dependencies for RenameCapabilityUseCase
 */
export interface RenameCapabilityDeps {
  capabilityRegistry: CapabilityRegistry;
  db: DbClient;
  embeddingModel?: EmbeddingModelInterface;
}

/**
 * Rename Capability Use Case
 *
 * Updates capability metadata with validation and embedding regeneration.
 * Multi-tenant: only allows mutations on user's own capabilities.
 */
export class RenameCapabilityUseCase {
  constructor(private readonly deps: RenameCapabilityDeps) {}

  /**
   * Execute capability rename
   */
  async execute(request: RenameCapabilityRequest): Promise<UseCaseResult<RenameCapabilityResult>> {
    const { target, scope, userId, namespace, actionName, description, tags, visibility } = request;

    // Validate target
    if (!target || target.trim().length === 0) {
      return {
        success: false,
        error: { code: "MISSING_TARGET", message: "Target capability is required" },
      };
    }

    // Validate namespace with Zod
    if (namespace !== undefined) {
      const nsResult = NamespaceSchema.safeParse(namespace);
      if (!nsResult.success) {
        return {
          success: false,
          error: { code: "INVALID_NAMESPACE", message: nsResult.error.errors[0].message },
        };
      }
    }

    // Validate action with Zod
    if (actionName !== undefined) {
      const actionResult = ActionSchema.safeParse(actionName);
      if (!actionResult.success) {
        return {
          success: false,
          error: { code: "INVALID_ACTION", message: actionResult.error.errors[0].message },
        };
      }
    }

    try {
      const { capabilityRegistry, db, embeddingModel } = this.deps;

      // Resolve the capability by name (namespace:action) or UUID
      let record = await capabilityRegistry.resolveByName(target, scope);
      if (!record) {
        // Try by UUID
        record = await capabilityRegistry.getById(target);
      }
      if (!record) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: `Capability not found: ${target}` },
        };
      }

      // Multi-tenant check: only allow mutations on user's own capabilities
      // Note: We inline this check instead of using canUserMutateCapability() because
      // we already have the record loaded - avoids an extra DB query.
      // Rules:
      // - userId=null in request: local mode, allow if record.userId is null (legacy/system)
      // - userId set: cloud mode, allow if record.userId is null OR matches request userId
      if (userId && record.userId && record.userId !== userId) {
        // Return same error as "not found" to avoid information leakage
        return {
          success: false,
          error: { code: "NOT_FOUND", message: `Capability not found: ${target}` },
        };
      }

      const oldDisplayName = getCapabilityDisplayName(record);

      // Build dynamic UPDATE for capability_records
      const updates: string[] = [];
      const params: (string | string[] | number)[] = [];
      let paramIndex = 1;

      if (namespace !== undefined) {
        updates.push(`namespace = $${paramIndex++}`);
        params.push(namespace);
      }
      if (actionName !== undefined) {
        updates.push(`action = $${paramIndex++}`);
        params.push(actionName);
      }
      if (tags !== undefined) {
        updates.push(`tags = $${paramIndex++}`);
        params.push(tags);
      }
      if (visibility !== undefined) {
        updates.push(`visibility = $${paramIndex++}`);
        params.push(visibility);
      }

      // Always update updated_at
      updates.push(`updated_at = NOW()`);

      // Execute capability_records update if we have fields to update
      if (updates.length > 1) {
        params.push(record.id);
        await db.query(
          `UPDATE capability_records
           SET ${updates.join(", ")}
           WHERE id = $${paramIndex}`,
          params,
        );
        log.info(`[RenameCapability] Updated capability_records for ${record.id}`);
      }

      // Check if name or description changed - need to update embedding
      const nameChanged = namespace !== undefined || actionName !== undefined;
      const descriptionChanged = description !== undefined;

      if ((nameChanged || descriptionChanged) && record.workflowPatternId) {
        // Update description in workflow_pattern if provided
        if (descriptionChanged) {
          await db.query(
            `UPDATE workflow_pattern
             SET description = $2
             WHERE pattern_id = $1`,
            [record.workflowPatternId, description],
          );
        }

        // Recalculate embedding with new name and/or description
        const newNamespace = namespace ?? record.namespace;
        const newAction = actionName ?? record.action;
        const newDisplayName = `${newNamespace}:${newAction}`;

        // Get current description if not changing it
        let finalDescription = description;
        if (!descriptionChanged) {
          const wpRows = (await db.query(
            `SELECT description FROM workflow_pattern WHERE pattern_id = $1`,
            [record.workflowPatternId],
          )) as unknown as { description: string | null }[];
          finalDescription = wpRows[0]?.description ?? undefined;
        }

        if (embeddingModel) {
          try {
            const embeddingText = buildEmbeddingText(newDisplayName, finalDescription);
            const newEmbedding = await embeddingModel.encode(embeddingText);
            const embeddingStr = `[${newEmbedding.join(",")}]`;

            await db.query(
              `UPDATE workflow_pattern
               SET intent_embedding = $1::vector
               WHERE pattern_id = $2`,
              [embeddingStr, record.workflowPatternId],
            );
            log.info(`[RenameCapability] Embedding updated for ${newDisplayName}`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.warn(`[RenameCapability] Failed to update embedding: ${msg}`);
          }
        }
      }

      // Compute final values
      const finalNamespace = namespace ?? record.namespace;
      const finalAction = actionName ?? record.action;
      const newFqdn = `${record.org}.${record.project}.${finalNamespace}.${finalAction}.${record.hash}`;
      const newDisplayName = `${finalNamespace}:${finalAction}`;

      // Emit SSE event for dashboard refresh
      eventBus.emit({
        type: "capability.zone.updated",
        source: "admin-use-case",
        payload: {
          capabilityId: record.id,
          label: newDisplayName,
          toolIds: [],
          successRate: record.successCount / Math.max(record.usageCount, 1),
          usageCount: record.usageCount,
        },
      });

      log.info(`[RenameCapability] ${oldDisplayName} -> ${newDisplayName}`);

      return {
        success: true,
        data: {
          success: true,
          id: record.id,
          fqdn: newFqdn,
          displayName: newDisplayName,
        },
      };
    } catch (error) {
      log.error(`[RenameCapability] Failed: ${error}`);
      return {
        success: false,
        error: { code: "RENAME_FAILED", message: (error as Error).message },
      };
    }
  }
}
