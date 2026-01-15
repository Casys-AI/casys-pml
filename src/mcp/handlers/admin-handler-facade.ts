/**
 * Admin Handler Facade
 *
 * Routes pml:admin tool calls to appropriate use cases for capability management.
 *
 * MCP Tools Consolidation: New handler for rename, merge operations.
 *
 * @module mcp/handlers/admin-handler-facade
 */

import * as log from "@std/log";
import { addBreadcrumb, captureError, startTransaction } from "../../telemetry/sentry.ts";
import { formatMCPSuccess } from "../server/responses.ts";
import type { MCPToolResponse, MCPErrorResponse } from "../server/types.ts";
import {
  RenameCapabilityUseCase,
  MergeCapabilitiesUseCase,
  type Scope,
} from "../../application/use-cases/admin/mod.ts";
import { getUserScope } from "../../lib/user.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Admin request arguments
 */
export interface AdminArgs {
  // Action selection (required)
  action: "rename" | "merge";

  // For rename
  target?: string;
  namespace?: string;
  action_name?: string;
  description?: string;
  tags?: string[];
  visibility?: "private" | "project" | "org" | "public";

  // For merge
  source?: string;
  prefer_source_code?: boolean;
}

/**
 * Get user scope function type
 */
export type GetUserScopeFn = (userId: string | null) => Promise<Scope>;

/**
 * Dependencies for AdminHandlerFacade
 */
export interface AdminHandlerFacadeDeps {
  renameCapabilityUseCase: RenameCapabilityUseCase;
  mergeCapabilitiesUseCase: MergeCapabilitiesUseCase;
  getUserScope?: GetUserScopeFn;
}

// ============================================================================
// Facade Implementation
// ============================================================================

/**
 * Admin Handler Facade
 *
 * Routes admin requests to appropriate use cases:
 * - rename: Update capability namespace, action, description, tags, visibility
 * - merge: Combine duplicate capabilities
 */
export class AdminHandlerFacade {
  constructor(private readonly deps: AdminHandlerFacadeDeps) {}

  /**
   * Handle pml:admin request
   *
   * @param args - Admin arguments
   * @param userId - Authenticated user ID (null for local mode)
   */
  async handle(args: unknown, userId?: string | null): Promise<MCPToolResponse | MCPErrorResponse> {
    const transaction = startTransaction("mcp.admin", "mcp");
    const startTime = performance.now();

    try {
      // Note: MCP protocol validates args against inputSchema (JSON Schema) before
      // calling the handler, so basic type safety is guaranteed. We cast here for
      // TypeScript inference, then do semantic validation (required fields, business rules).
      const params = args as AdminArgs;

      // Validate action parameter (defensive - should be caught by JSON Schema)
      if (!params.action) {
        transaction.finish();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Missing required parameter: 'action'" }),
          }],
        };
      }

      // Get user scope for multi-tenant filtering
      const getScopeFn = this.deps.getUserScope ?? getUserScope;
      const scope = await getScopeFn(userId ?? null);

      // Action routing
      switch (params.action) {
        case "rename":
          return await this.handleRename(params, scope, userId ?? null, transaction, startTime);
        case "merge":
          return await this.handleMerge(params, scope, userId ?? null, transaction, startTime);
        default:
          transaction.finish();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: `Unknown action: ${params.action}. Valid actions: rename, merge` }),
            }],
          };
      }
    } catch (error) {
      log.error(`admin error: ${error}`);
      captureError(error as Error, { operation: "admin", handler: "AdminHandlerFacade" });
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Admin failed: ${(error as Error).message}` }),
        }],
      };
    }
  }

  /**
   * Handle rename action
   */
  private async handleRename(
    params: AdminArgs,
    scope: Scope,
    userId: string | null,
    transaction: { finish: () => void; setData: (k: string, v: unknown) => void },
    startTime: number,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    // Validate target
    if (!params.target) {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Missing required parameter for rename: 'target'" }),
        }],
      };
    }

    transaction.setData("action", "rename");
    transaction.setData("target", params.target);
    addBreadcrumb("mcp", "Processing rename request", { target: params.target });

    const result = await this.deps.renameCapabilityUseCase.execute({
      target: params.target,
      scope,
      userId,
      namespace: params.namespace,
      actionName: params.action_name,
      description: params.description,
      tags: params.tags,
      visibility: params.visibility,
    });

    const elapsedMs = performance.now() - startTime;
    log.info(`admin (rename): target="${params.target}" in ${elapsedMs.toFixed(1)}ms`);

    transaction.finish();

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: result.error?.message ?? "Rename failed" }),
        }],
      };
    }

    return formatMCPSuccess(result.data);
  }

  /**
   * Handle merge action
   */
  private async handleMerge(
    params: AdminArgs,
    scope: Scope,
    userId: string | null,
    transaction: { finish: () => void; setData: (k: string, v: unknown) => void },
    startTime: number,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    // Validate source and target
    if (!params.source) {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Missing required parameter for merge: 'source'" }),
        }],
      };
    }
    if (!params.target) {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Missing required parameter for merge: 'target'" }),
        }],
      };
    }

    transaction.setData("action", "merge");
    transaction.setData("source", params.source);
    transaction.setData("target", params.target);
    addBreadcrumb("mcp", "Processing merge request", { source: params.source, target: params.target });

    const result = await this.deps.mergeCapabilitiesUseCase.execute({
      source: params.source,
      target: params.target,
      scope,
      userId,
      preferSourceCode: params.prefer_source_code,
    });

    const elapsedMs = performance.now() - startTime;
    log.info(`admin (merge): source="${params.source}" -> target="${params.target}" in ${elapsedMs.toFixed(1)}ms`);

    transaction.finish();

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: result.error?.message ?? "Merge failed" }),
        }],
      };
    }

    return formatMCPSuccess(result.data);
  }
}
