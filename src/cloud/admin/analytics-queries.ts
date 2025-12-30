/**
 * Admin Analytics SQL Queries
 *
 * SQL query functions for admin analytics dashboard.
 * Cloud-only: excluded from public sync.
 *
 * @module cloud/admin/analytics-queries
 */

import type {
  AlgorithmMetrics,
  CapabilityRegistryMetrics,
  DailyCount,
  ErrorHealthMetrics,
  ErrorTypeCount,
  LatencyPercentiles,
  QueryClient,
  ResourceMetrics,
  SHGATMetrics,
  SystemUsageMetrics,
  TechnicalMetrics,
  TimeRange,
  TopUser,
  UserActivityMetrics,
} from "./types.ts";

/** Get interval string for time range */
function getIntervalString(timeRange: TimeRange): string {
  // These are safe, fixed values - no user input
  switch (timeRange) {
    case "24h":
      return "1 day";
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
  }
}

/**
 * Build a safe WHERE clause for time-based filtering.
 * Uses INTERVAL literals which are safe since timeRange is a union type.
 */
function buildTimeFilter(column: string, timeRange: TimeRange): string {
  const interval = getIntervalString(timeRange);
  // Safe: interval comes from getIntervalString which only returns fixed strings
  return `${column} > NOW() - INTERVAL '${interval}'`;
}

/** Query user activity metrics */
export async function queryUserActivity(
  db: QueryClient,
  timeRange: TimeRange,
  topUsersLimit = 10,
): Promise<UserActivityMetrics> {
  const timeFilter = buildTimeFilter("executed_at", timeRange);
  const userTimeFilter = buildTimeFilter("created_at", timeRange);

  // Active users in time range
  const activeResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM execution_trace
    WHERE ${timeFilter}
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

  // New registrations (users table may not exist in local mode)
  let newUsersResult: { count: number } | null = null;
  try {
    newUsersResult = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM users
      WHERE ${userTimeFilter}
    `);
  } catch {
    // users table doesn't exist in local mode
  }

  // Returning users (had activity before time range AND during)
  const interval = getIntervalString(timeRange);
  const returningResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT et.user_id) as count
    FROM execution_trace et
    WHERE ${timeFilter.replace("executed_at", "et.executed_at")}
    AND EXISTS (
      SELECT 1 FROM execution_trace et2
      WHERE et2.user_id = et.user_id
      AND et2.executed_at <= NOW() - INTERVAL '${interval}'
    )
  `);

  // Top users by execution count
  // Try with users join first, fallback to without users table
  let topUsers: TopUser[] = [];
  try {
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
      WHERE ${timeFilter.replace("executed_at", "et.executed_at")}
      GROUP BY et.user_id, u.username
      ORDER BY execution_count DESC
      LIMIT ${topUsersLimit}
    `);
    topUsers = topUsersRows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      executionCount: Number(row.execution_count),
      lastActive: new Date(row.last_active),
    }));
  } catch {
    // users table doesn't exist - query without join
    const topUsersRows = await db.query<{
      user_id: string;
      execution_count: number;
      last_active: Date;
    }>(`
      SELECT
        user_id,
        COUNT(*) as execution_count,
        MAX(executed_at) as last_active
      FROM execution_trace
      WHERE ${timeFilter}
      GROUP BY user_id
      ORDER BY execution_count DESC
      LIMIT ${topUsersLimit}
    `);
    topUsers = topUsersRows.map((row) => ({
      userId: row.user_id,
      username: row.user_id, // Use user_id as username fallback
      executionCount: Number(row.execution_count),
      lastActive: new Date(row.last_active),
    }));
  }

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
  db: QueryClient,
  timeRange: TimeRange,
): Promise<SystemUsageMetrics> {
  const timeFilter = buildTimeFilter("executed_at", timeRange);

  // Total executions
  const totalResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM execution_trace
    WHERE ${timeFilter}
  `);

  // Capability executions (with capability_id)
  const capabilityResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM execution_trace
    WHERE ${timeFilter}
    AND capability_id IS NOT NULL
  `);

  // Unique capabilities used
  const uniqueCapResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT capability_id) as count
    FROM execution_trace
    WHERE ${timeFilter}
    AND capability_id IS NOT NULL
  `);

  // DAG/workflow executions (multi-step executions with parent trace)
  const dagResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM execution_trace
    WHERE ${timeFilter}
    AND parent_trace_id IS NOT NULL
  `);

  // Active users for avg calculation
  const activeUsersResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM execution_trace
    WHERE ${timeFilter}
  `);

  const totalExecutions = Number(totalResult?.count || 0);
  const activeUsers = Number(activeUsersResult?.count || 0);

  // Executions by day (for chart)
  const dailyRows = await db.query<{ date: string; count: number }>(`
    SELECT
      DATE(executed_at) as date,
      COUNT(*) as count
    FROM execution_trace
    WHERE ${timeFilter}
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
    dagExecutions: Number(dagResult?.count || 0),
    uniqueCapabilities: Number(uniqueCapResult?.count || 0),
    avgExecutionsPerUser: activeUsers > 0
      ? Math.round(totalExecutions / activeUsers)
      : 0,
    executionsByDay,
  };
}

/** Query error and health metrics */
export async function queryErrorHealth(
  db: QueryClient,
  timeRange: TimeRange,
): Promise<ErrorHealthMetrics> {
  const timeFilter = buildTimeFilter("executed_at", timeRange);

  // Total and failed executions
  const execResult = await db.queryOne<{
    total: number;
    failed: number;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE success = false) as failed
    FROM execution_trace
    WHERE ${timeFilter}
  `);

  const total = Number(execResult?.total || 0);
  const failed = Number(execResult?.failed || 0);

  // Errors by type (using error_message patterns)
  // Note: GROUP BY 1 refers to the first SELECT column (the CASE expression)
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
    WHERE ${timeFilter}
    AND success = false
    AND error_message IS NOT NULL
    GROUP BY 1
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
    WHERE ${timeFilter}
    AND duration_ms > 0
  `);

  const latencyPercentiles: LatencyPercentiles = {
    p50: Math.round(Number(latencyResult?.p50 || 0)),
    p95: Math.round(Number(latencyResult?.p95 || 0)),
    p99: Math.round(Number(latencyResult?.p99 || 0)),
    avg: Math.round(Number(latencyResult?.avg || 0)),
  };

  // Rate limit hits (count errors with rate_limit pattern)
  const rateLimitResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM execution_trace
    WHERE ${timeFilter}
    AND success = false
    AND error_message ILIKE '%rate%limit%'
  `);
  const rateLimitHits = Number(rateLimitResult?.count || 0);

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
export async function queryResources(db: QueryClient): Promise<ResourceMetrics> {
  // Total users (users table may not exist in local mode)
  let usersResult: { count: number } | null = null;
  try {
    usersResult = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM users
    `);
  } catch {
    // users table doesn't exist in local mode
  }

  // Total capabilities (workflow_pattern)
  let capResult: { count: number } | null = null;
  try {
    capResult = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM workflow_pattern
    `);
  } catch {
    // workflow_pattern table may not exist
  }

  // Total traces
  let tracesResult: { count: number } | null = null;
  try {
    tracesResult = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM execution_trace
    `);
  } catch {
    // execution_trace table may not exist
  }

  // Graph nodes (mcp_tool count)
  let nodesResult: { count: number } | null = null;
  try {
    nodesResult = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM mcp_tool
    `);
  } catch {
    // mcp_tool table may not exist (not migrated)
  }

  // Graph edges (tool_edge count)
  let edgesResult: { count: number } | null = null;
  try {
    edgesResult = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM tool_edge
    `);
  } catch {
    // tool_edge table may not exist (not migrated)
  }

  return {
    totalUsers: Number(usersResult?.count || 0),
    totalCapabilities: Number(capResult?.count || 0),
    totalTraces: Number(tracesResult?.count || 0),
    graphNodes: Number(nodesResult?.count || 0),
    graphEdges: Number(edgesResult?.count || 0),
  };
}

/** Query technical/ML metrics */
export async function queryTechnical(
  db: QueryClient,
  timeRange: TimeRange,
): Promise<TechnicalMetrics> {
  const timeFilter = buildTimeFilter("timestamp", timeRange);

  // Run SHGAT, Algorithm, and Capability queries in parallel
  const [shgat, algorithms, capabilities] = await Promise.all([
    querySHGATMetrics(db),
    queryAlgorithmMetrics(db, timeFilter),
    queryCapabilityRegistryMetrics(db),
  ]);

  return { shgat, algorithms, capabilities };
}

/** Query SHGAT model metrics */
async function querySHGATMetrics(db: QueryClient): Promise<SHGATMetrics> {
  // Check if shgat_params table exists and has data
  try {
    const result = await db.queryOne<{
      count: number;
      last_updated: Date | null;
    }>(`
      SELECT
        COUNT(*) as count,
        MAX(updated_at) as last_updated
      FROM shgat_params
    `);

    return {
      hasParams: Number(result?.count || 0) > 0,
      usersWithParams: Number(result?.count || 0),
      lastUpdated: result?.last_updated ? new Date(result.last_updated) : null,
    };
  } catch {
    // Table might not exist yet
    return {
      hasParams: false,
      usersWithParams: 0,
      lastUpdated: null,
    };
  }
}

/** Query algorithm decision metrics */
async function queryAlgorithmMetrics(
  db: QueryClient,
  timeFilter: string,
): Promise<AlgorithmMetrics> {
  try {
    // Total traces
    const totalResult = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM algorithm_traces
      WHERE ${timeFilter}
    `);

    // By mode (active_search, passive_suggestion)
    const modeRows = await db.query<{ mode: string; count: number }>(`
      SELECT algorithm_mode as mode, COUNT(*) as count
      FROM algorithm_traces
      WHERE ${timeFilter}
      GROUP BY algorithm_mode
      ORDER BY count DESC
    `);

    // By target type (tool, capability)
    const targetRows = await db.query<{ target_type: string; count: number }>(`
      SELECT target_type, COUNT(*) as count
      FROM algorithm_traces
      WHERE ${timeFilter}
      GROUP BY target_type
      ORDER BY count DESC
    `);

    // By decision (accept, reject, defer)
    const decisionRows = await db.query<{ decision: string; count: number }>(`
      SELECT decision, COUNT(*) as count
      FROM algorithm_traces
      WHERE ${timeFilter}
      GROUP BY decision
      ORDER BY count DESC
    `);

    // Average scores
    const scoresResult = await db.queryOne<{
      avg_score: number;
      avg_threshold: number;
    }>(`
      SELECT
        AVG(final_score) as avg_score,
        AVG(threshold_used) as avg_threshold
      FROM algorithm_traces
      WHERE ${timeFilter}
    `);

    return {
      totalTraces: Number(totalResult?.count || 0),
      byMode: modeRows.map((r) => ({ mode: r.mode, count: Number(r.count) })),
      byTargetType: targetRows.map((r) => ({
        targetType: r.target_type,
        count: Number(r.count),
      })),
      byDecision: decisionRows.map((r) => ({
        decision: r.decision,
        count: Number(r.count),
      })),
      avgFinalScore: Number(scoresResult?.avg_score || 0),
      avgThreshold: Number(scoresResult?.avg_threshold || 0),
    };
  } catch {
    // Table might not exist yet
    return {
      totalTraces: 0,
      byMode: [],
      byTargetType: [],
      byDecision: [],
      avgFinalScore: 0,
      avgThreshold: 0,
    };
  }
}

/** Query capability registry metrics */
async function queryCapabilityRegistryMetrics(
  db: QueryClient,
): Promise<CapabilityRegistryMetrics> {
  try {
    // Total and verified counts
    const countsResult = await db.queryOne<{
      total: number;
      verified: number;
      usage: number;
      success: number;
    }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE verified = true) as verified,
        SUM(usage_count) as usage,
        SUM(success_count) as success
      FROM capability_records
    `);

    // By visibility
    const visibilityRows = await db.query<{
      visibility: string;
      count: number;
    }>(`
      SELECT visibility, COUNT(*) as count
      FROM capability_records
      GROUP BY visibility
      ORDER BY count DESC
    `);

    // By routing
    const routingRows = await db.query<{ routing: string; count: number }>(`
      SELECT routing, COUNT(*) as count
      FROM capability_records
      GROUP BY routing
      ORDER BY count DESC
    `);

    const totalUsage = Number(countsResult?.usage || 0);
    const totalSuccess = Number(countsResult?.success || 0);

    return {
      totalRecords: Number(countsResult?.total || 0),
      verifiedCount: Number(countsResult?.verified || 0),
      byVisibility: visibilityRows.map((r) => ({
        visibility: r.visibility,
        count: Number(r.count),
      })),
      byRouting: routingRows.map((r) => ({
        routing: r.routing,
        count: Number(r.count),
      })),
      totalUsageCount: totalUsage,
      totalSuccessCount: totalSuccess,
      successRate: totalUsage > 0 ? totalSuccess / totalUsage : 0,
    };
  } catch {
    // Table might not exist yet
    return {
      totalRecords: 0,
      verifiedCount: 0,
      byVisibility: [],
      byRouting: [],
      totalUsageCount: 0,
      totalSuccessCount: 0,
      successRate: 0,
    };
  }
}
