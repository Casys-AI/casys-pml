/**
 * List Capabilities Use Case
 *
 * Lists capabilities with pattern filtering and pagination.
 * Extracted from cap-handler.ts handleList() method.
 *
 * @module application/use-cases/discover/list-capabilities
 */

import * as log from "@std/log";
import type { UseCaseResult } from "../shared/types.ts";
import type {
  ListCapabilitiesRequest,
  ListCapabilitiesResult,
  ListCapabilityItem,
} from "./types.ts";
import type { DbClient } from "../../../db/types.ts";

/** Default pagination limit */
const DEFAULT_LIMIT = 50;

/** Maximum pagination limit */
const MAX_LIMIT = 500;

/**
 * Convert glob pattern to SQL LIKE pattern
 *
 * @example
 * globToSqlLike("fs:*") // "fs:%"
 * globToSqlLike("read_?") // "read\__"
 */
export function globToSqlLike(pattern: string): string {
  return pattern
    .replace(/%/g, "\\%") // Escape existing %
    .replace(/_/g, "\\_") // Escape existing _
    .replace(/\*/g, "%") // Glob * → SQL %
    .replace(/\?/g, "_"); // Glob ? → SQL _
}

/**
 * Dependencies for ListCapabilitiesUseCase
 */
export interface ListCapabilitiesDeps {
  db: DbClient;
}

/**
 * List Capabilities Use Case
 *
 * Lists capabilities matching a glob pattern with multi-tenant scoping.
 * Returns capabilities in the user's scope OR public capabilities.
 */
export class ListCapabilitiesUseCase {
  constructor(private readonly deps: ListCapabilitiesDeps) {}

  /**
   * Execute capability listing
   */
  async execute(request: ListCapabilitiesRequest): Promise<UseCaseResult<ListCapabilitiesResult>> {
    const { pattern, scope, limit: requestedLimit, offset: requestedOffset } = request;

    // Validate pattern
    if (!pattern || pattern.trim().length === 0) {
      return {
        success: false,
        error: { code: "MISSING_PATTERN", message: "Pattern is required for capability listing" },
      };
    }

    const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = requestedOffset ?? 0;

    try {
      // Build WHERE clauses for multi-tenant scoping
      // Return capabilities that are:
      // - In user's scope (org + project match)
      // - OR public (visibility = 'public')
      const conditions: string[] = [
        "((cr.org = $1 AND cr.project = $2) OR cr.visibility = 'public')",
      ];
      const params: (string | number)[] = [scope.org, scope.project];

      // Pattern filter (matches namespace:action)
      const sqlPattern = globToSqlLike(pattern);
      params.push(sqlPattern);
      conditions.push(`(cr.namespace || ':' || cr.action) LIKE $${params.length} ESCAPE '\\'`);

      const whereClause = conditions.join(" AND ");

      // Query with total count using window function
      // NOTE: Read usage/success from workflow_pattern (where updateUsage writes)
      const query = `
        SELECT
          cr.id,
          cr.org,
          cr.project,
          cr.namespace,
          cr.action,
          cr.hash,
          COALESCE(wp.usage_count, 0) as usage_count,
          COALESCE(wp.success_count, 0) as success_count,
          wp.description,
          COUNT(*) OVER() as total
        FROM capability_records cr
        LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
        WHERE ${whereClause}
        ORDER BY COALESCE(wp.usage_count, 0) DESC, cr.namespace ASC, cr.action ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      params.push(limit, offset);

      interface ListRow {
        id: string;
        org: string;
        project: string;
        namespace: string;
        action: string;
        hash: string;
        usage_count: number;
        success_count: number;
        description: string | null;
        total: string; // PostgreSQL returns bigint as string
      }

      const rows = (await this.deps.db.query(query, params)) as unknown as ListRow[];

      // Extract total from first row (or 0 if empty)
      const total = rows.length > 0 ? parseInt(rows[0].total, 10) : 0;

      // Map to response format
      const items: ListCapabilityItem[] = rows.map((row) => ({
        id: row.id,
        fqdn: `${row.org}.${row.project}.${row.namespace}.${row.action}.${row.hash}`,
        name: `${row.namespace}:${row.action}`,
        description: row.description,
        namespace: row.namespace,
        action: row.action,
        usageCount: row.usage_count,
        successRate: row.usage_count > 0 ? row.success_count / row.usage_count : 0,
      }));

      log.info(`[ListCapabilities] pattern="${pattern}" returned ${items.length} items (total: ${total})`);

      return {
        success: true,
        data: {
          items,
          total,
          limit,
          offset,
        },
      };
    } catch (error) {
      log.error(`[ListCapabilities] Failed: ${error}`);
      return {
        success: false,
        error: { code: "LIST_FAILED", message: (error as Error).message },
      };
    }
  }
}
