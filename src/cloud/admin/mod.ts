/**
 * Admin Analytics Module
 *
 * Cloud-only admin dashboard for platform analytics.
 * Excluded from public sync via src/cloud/.
 *
 * @module cloud/admin
 */

// Types
export type {
  AdminAnalytics,
  AnalyticsOptions,
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

// Service
export {
  clearAnalyticsCache,
  getAdminAnalytics,
  getCacheStats,
  isAdminUser,
} from "./analytics-service.ts";

// Queries (for testing)
export {
  queryErrorHealth,
  queryResources,
  querySystemUsage,
  queryUserActivity,
} from "./analytics-queries.ts";
