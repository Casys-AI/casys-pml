/**
 * Admin Analytics SQL Queries
 *
 * SQL query functions for admin analytics dashboard.
 * Cloud-only: excluded from public sync.
 *
 * @module cloud/admin/analytics-queries
 */

import type { DbClient } from "../../db/types.ts";
import type {
  DailyCount,
  ErrorHealthMetrics,
  ErrorTypeCount,
  LatencyPercentiles,
  ResourceMetrics,
  SystemUsageMetrics,
  TimeRange,
  TopUser,
  UserActivityMetrics,
} from "./types.ts";

/** Get interval string for time range */
function getIntervalString(timeRange: TimeRange): string {
  switch (timeRange) {
    case "24h":
      return "1 day";
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
  }
}

/** Query user activity metrics */
export async function queryUserActivity(
  db: DbClient,
  timeRange: TimeRange,
  topUsersLimit = 10,
): Promise<UserActivityMetrics> {
  const interval = getIntervalString(timeRange);

  // Active users in time range
  const activeResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
  `);

  // DAU (last 24h)
  const dauResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '1 day'
  `);

  // WAU (last 7 days)
  const wauResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '7 days'
  `);

  // MAU (last 30 days)
  const mauResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '30 days'
  `);

  // New registrations
  const newUsersResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM users
    WHERE created_at > NOW() - INTERVAL '${interval}'
  `);

  // Returning users (had activity before time range AND during)
  const returningResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT et.user_id) as count
    FROM execution_trace et
    WHERE et.executed_at > NOW() - INTERVAL '${interval}'
    AND EXISTS (
      SELECT 1 FROM execution_trace et2
      WHERE et2.user_id = et.user_id
      AND et2.executed_at <= NOW() - INTERVAL '${interval}'
    )
  `);

  // Top users by execution count
  const topUsersRows = await db.query<{
    user_id: string;
    username: string;
    execution_count: number;
    last_active: Date;
  }>(`
    SELECT
      et.user_id,
      COALESCE(u.username, et.user_id) as username,
      COUNT(*) as execution_count,
      MAX(et.executed_at) as last_active
    FROM execution_trace et
    LEFT JOIN users u ON u.id::text = et.user_id OR u.username = et.user_id
    WHERE et.executed_at > NOW() - INTERVAL '${interval}'
    GROUP BY et.user_id, u.username
    ORDER BY execution_count DESC
    LIMIT ${topUsersLimit}
  `);

  const topUsers: TopUser[] = topUsersRows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    executionCount: Number(row.execution_count),
    lastActive: new Date(row.last_active),
  }));

  return {
    activeUsers: Number(activeResult?.count || 0),
    dailyActiveUsers: Number(dauResult?.count || 0),
    weeklyActiveUsers: Number(wauResult?.count || 0),
    monthlyActiveUsers: Number(mauResult?.count || 0),
    newRegistrations: Number(newUsersResult?.count || 0),
    returningUsers: Number(returningResult?.count || 0),
    topUsers,
  };
}

/** Query system usage metrics */
export async function querySystemUsage(
  db: DbClient,
  timeRange: TimeRange,
): Promise<SystemUsageMetrics> {
  const interval = getIntervalString(timeRange);

  // Total executions
  const totalResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
  `);

  // Capability executions (with capability_id)
  const capabilityResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
    AND capability_id IS NOT NULL
  `);

  // Unique capabilities used
  const uniqueCapResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT capability_id) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
    AND capability_id IS NOT NULL
  `);

  // Active users for avg calculation
  const activeUsersResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
  `);

  const totalExecutions = Number(totalResult?.count || 0);
  const activeUsers = Number(activeUsersResult?.count || 0);

  // Executions by day (for chart)
  const dailyRows = await db.query<{ date: string; count: number }>(`
    SELECT
      DATE(executed_at) as date,
      COUNT(*) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
    GROUP BY DATE(executed_at)
    ORDER BY date ASC
  `);

  const executionsByDay: DailyCount[] = dailyRows.map((row) => ({
    date: String(row.date),
    count: Number(row.count),
  }));

  return {
    totalExecutions,
    capabilityExecutions: Number(capabilityResult?.count || 0),
    uniqueCapabilities: Number(uniqueCapResult?.count || 0),
    avgExecutionsPerUser: activeUsers > 0
      ? Math.round(totalExecutions / activeUsers)
      : 0,
    executionsByDay,
  };
}

/** Query error and health metrics */
export async function queryErrorHealth(
  db: DbClient,
  timeRange: TimeRange,
): Promise<ErrorHealthMetrics> {
  const interval = getIntervalString(timeRange);

  // Total and failed executions
  const execResult = await db.queryOne<{
    total: number;
    failed: number;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE success = false) as failed
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
  `);

  const total = Number(execResult?.total || 0);
  const failed = Number(execResult?.failed || 0);

  // Errors by type (using error_message patterns)
  const errorRows = await db.query<{ error_type: string; count: number }>(`
    SELECT
      CASE
        WHEN error_message ILIKE '%timeout%' THEN 'timeout'
        WHEN error_message ILIKE '%permission%' OR error_message ILIKE '%denied%' THEN 'permission'
        WHEN error_message ILIKE '%rate%limit%' THEN 'rate_limit'
        WHEN error_message ILIKE '%not found%' THEN 'not_found'
        ELSE 'runtime'
      END as error_type,
      COUNT(*) as count
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
    AND success = false
    AND error_message IS NOT NULL
    GROUP BY error_type
    ORDER BY count DESC
  `);

  const errorsByType: ErrorTypeCount[] = errorRows.map((row) => ({
    errorType: row.error_type,
    count: Number(row.count),
  }));

  // Latency percentiles
  const latencyResult = await db.queryOne<{
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  }>(`
    SELECT
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms) as p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
      AVG(duration_ms) as avg
    FROM execution_trace
    WHERE executed_at > NOW() - INTERVAL '${interval}'
    AND duration_ms > 0
  `);

  const latencyPercentiles: LatencyPercentiles = {
    p50: Math.round(Number(latencyResult?.p50 || 0)),
    p95: Math.round(Number(latencyResult?.p95 || 0)),
    p99: Math.round(Number(latencyResult?.p99 || 0)),
    avg: Math.round(Number(latencyResult?.avg || 0)),
  };

  // Rate limit hits (placeholder - needs rate_limit tracking table)
  const rateLimitHits = 0;

  return {
    totalExecutions: total,
    failedExecutions: failed,
    errorRate: total > 0 ? failed / total : 0,
    errorsByType,
    latencyPercentiles,
    rateLimitHits,
  };
}

/** Query resource metrics */
export async function queryResources(db: DbClient): Promise<ResourceMetrics> {
  // Total users
  const usersResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM users
  `);

  // Total capabilities (workflow_pattern)
  const capResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM workflow_pattern
  `);

  // Total traces
  const tracesResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM execution_trace
  `);

  // Graph nodes (mcp_tool count)
  const nodesResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM mcp_tool
  `);

  // Graph edges (tool_edge count)
  const edgesResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM tool_edge
  `);

  return {
    totalUsers: Number(usersResult?.count || 0),
    totalCapabilities: Number(capResult?.count || 0),
    totalTraces: Number(tracesResult?.count || 0),
    graphNodes: Number(nodesResult?.count || 0),
    graphEdges: Number(edgesResult?.count || 0),
  };
}
