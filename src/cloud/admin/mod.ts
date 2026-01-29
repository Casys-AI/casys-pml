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
  AlgorithmMetrics,
  AnalyticsOptions,
  CapabilityRegistryMetrics,
  DailyCount,
  ErrorHealthMetrics,
  ErrorTypeCount,
  LatencyPercentiles,
  ResourceMetrics,
  SHGATMetrics,
  SystemUsageMetrics,
  TechnicalMetrics,
  TimeRange,
  TopUser,
  UserActivityMetrics,
} from "./types.ts";

// Service
export type { CacheStats } from "./analytics-service.ts";
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
  queryTechnical,
  queryUserActivity,
} from "./analytics-queries.ts";
