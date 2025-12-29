/**
 * Admin Analytics Types
 *
 * Type definitions for the admin analytics dashboard.
 * Cloud-only: excluded from public sync.
 *
 * @module cloud/admin/types
 */

/** Time range for analytics queries */
export type TimeRange = "24h" | "7d" | "30d";

/** User activity metrics */
export interface UserActivityMetrics {
  /** Active users in the time range */
  activeUsers: number;
  /** Daily active users (DAU) */
  dailyActiveUsers: number;
  /** Weekly active users (WAU) */
  weeklyActiveUsers: number;
  /** Monthly active users (MAU) */
  monthlyActiveUsers: number;
  /** New registrations in time range */
  newRegistrations: number;
  /** Returning users (seen before time range) */
  returningUsers: number;
  /** Top users by execution count */
  topUsers: TopUser[];
}

/** Top user by activity */
export interface TopUser {
  userId: string;
  username: string;
  executionCount: number;
  lastActive: Date;
}

/** System usage metrics */
export interface SystemUsageMetrics {
  /** Total executions in time range */
  totalExecutions: number;
  /** Capability executions */
  capabilityExecutions: number;
  /** Unique capabilities used */
  uniqueCapabilities: number;
  /** Average executions per user */
  avgExecutionsPerUser: number;
  /** Executions by day (for chart) */
  executionsByDay: DailyCount[];
}

/** Daily count for trend charts */
export interface DailyCount {
  date: string;
  count: number;
}

/** Error and health metrics */
export interface ErrorHealthMetrics {
  /** Total executions */
  totalExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Errors grouped by type */
  errorsByType: ErrorTypeCount[];
  /** Latency percentiles in ms */
  latencyPercentiles: LatencyPercentiles;
  /** Rate limit hits (if tracked) */
  rateLimitHits: number;
}

/** Error count by type */
export interface ErrorTypeCount {
  errorType: string;
  count: number;
}

/** Latency percentiles */
export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
}

/** Resource metrics */
export interface ResourceMetrics {
  /** Total users in system */
  totalUsers: number;
  /** Total capabilities registered */
  totalCapabilities: number;
  /** Total traces stored */
  totalTraces: number;
  /** Graph node count */
  graphNodes: number;
  /** Graph edge count */
  graphEdges: number;
}

/** Complete analytics response */
export interface AdminAnalytics {
  /** Time range used for queries */
  timeRange: TimeRange;
  /** Query timestamp */
  generatedAt: Date;
  /** User activity metrics */
  userActivity: UserActivityMetrics;
  /** System usage metrics */
  systemUsage: SystemUsageMetrics;
  /** Error and health metrics */
  errorHealth: ErrorHealthMetrics;
  /** Resource metrics */
  resources: ResourceMetrics;
}

/** Analytics request options */
export interface AnalyticsOptions {
  timeRange?: TimeRange;
  includeTopUsers?: boolean;
  topUsersLimit?: number;
}
