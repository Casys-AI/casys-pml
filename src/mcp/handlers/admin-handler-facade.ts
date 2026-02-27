/**
 * Admin Handler Facade
 *
 * Routes pml:admin tool calls to appropriate use cases for capability management.
 *
 * MCP Tools Consolidation: New handler for rename, merge operations.
 *
 * @module mcp/handlers/admin-handler-facade
 */

import type { MCPToolResponse, MCPErrorResponse } from "../server/types.ts";
import {
  addHandlerBreadcrumb,
  createHandlerContext,
  formatErrorResponse,
  formatSuccessResponse,
  handleError,
  type HandlerContext,
} from "./shared/mod.ts";
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
  new_namespace?: string;
  new_action?: string;
  description?: string;
  tags?: string[];
  visibility?: "private" | "project" | "org" | "public";

  // Legacy aliases (backwards compat)
  namespace?: string;
  action_name?: string;

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
    const context = createHandlerContext("mcp.admin");

    try {
      // Note: MCP protocol validates args against inputSchema (JSON Schema) before
      // calling the handler, so basic type safety is guaranteed. We cast here for
      // TypeScript inference, then do semantic validation (required fields, business rules).
      const params = args as AdminArgs;

      // Validate action parameter (defensive - should be caught by JSON Schema)
      if (!params.action) {
        return formatErrorResponse("Missing required parameter: 'action'", context.transaction);
      }

      // Get user scope for multi-tenant filtering
      const getScopeFn = this.deps.getUserScope ?? getUserScope;
      const scope = await getScopeFn(userId ?? null);

      // Action routing
      switch (params.action) {
        case "rename":
          return await this.handleRename(params, scope, userId ?? null, context);
        case "merge":
          return await this.handleMerge(params, scope, userId ?? null, context);
        default:
          return formatErrorResponse(
            `Unknown action: ${params.action}. Valid actions: rename, merge`,
            context.transaction,
          );
      }
    } catch (error) {
      return handleError(error, "admin", "AdminHandlerFacade", context.transaction);
    }
  }

  /**
   * Handle rename action
   */
  private async handleRename(
    params: AdminArgs,
    scope: Scope,
    userId: string | null,
    context: HandlerContext,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    // Validate target
    if (!params.target) {
      return formatErrorResponse(
        "Missing required parameter for rename: 'target'",
        context.transaction,
      );
    }

    context.transaction.setData("action", "rename");
    context.transaction.setData("target", params.target);
    addHandlerBreadcrumb("mcp", "Processing rename request", { target: params.target });

    const result = await this.deps.renameCapabilityUseCase.execute({
      target: params.target,
      scope,
      userId,
      namespace: params.new_namespace ?? params.namespace,
      actionName: params.new_action ?? params.action_name,
      description: params.description,
      tags: params.tags,
      visibility: params.visibility,
    });

    if (!result.success) {
      return formatErrorResponse(result.error?.message ?? "Rename failed", context.transaction);
    }

    return formatSuccessResponse(
      result.data,
      context,
      `admin (rename): target="${params.target}" in {elapsed}ms`,
    );
  }

  /**
   * Handle merge action
   */
  private async handleMerge(
    params: AdminArgs,
    scope: Scope,
    userId: string | null,
    context: HandlerContext,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    // Validate source and target
    if (!params.source) {
      return formatErrorResponse(
        "Missing required parameter for merge: 'source'",
        context.transaction,
      );
    }
    if (!params.target) {
      return formatErrorResponse(
        "Missing required parameter for merge: 'target'",
        context.transaction,
      );
    }

    context.transaction.setData("action", "merge");
    context.transaction.setData("source", params.source);
    context.transaction.setData("target", params.target);
    addHandlerBreadcrumb("mcp", "Processing merge request", { source: params.source, target: params.target });

    const result = await this.deps.mergeCapabilitiesUseCase.execute({
      source: params.source,
      target: params.target,
      scope,
      userId,
      preferSourceCode: params.prefer_source_code,
    });

    if (!result.success) {
      return formatErrorResponse(result.error?.message ?? "Merge failed", context.transaction);
    }

    return formatSuccessResponse(
      result.data,
      context,
      `admin (merge): source="${params.source}" -> target="${params.target}" in {elapsed}ms`,
    );
  }
}
