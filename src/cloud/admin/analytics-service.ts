/**
 * Admin Analytics Service
 *
 * Service layer for admin analytics with caching.
 * Cloud-only: excluded from public sync.
 *
 * @module cloud/admin/analytics-service
 */

import type { DbClient } from "../../db/types.ts";
import type {
  AdminAnalytics,
  AnalyticsOptions,
  TimeRange,
} from "./types.ts";
import {
  queryErrorHealth,
  queryResources,
  querySystemUsage,
  queryUserActivity,
} from "./analytics-queries.ts";
import * as log from "@std/log";

/** Cache entry with TTL */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** In-memory cache for analytics data */
const cache = new Map<string, CacheEntry<AdminAnalytics>>();

/** Default cache TTL in milliseconds (2 minutes) */
const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;

/** Generate cache key for options */
function getCacheKey(options: AnalyticsOptions): string {
  return `analytics:${options.timeRange || "24h"}:${options.topUsersLimit || 10}`;
}

/** Check if user is admin */
export async function isAdminUser(
  db: DbClient,
  userId: string,
): Promise<boolean> {
  // Local mode: everyone is admin
  if (userId === "local") {
    return true;
  }

  // Check admin role in users table
  const result = await db.queryOne<{ role: string }>(`
    SELECT role FROM users
    WHERE id::text = $1 OR username = $1
  `, [userId]);

  return result?.role === "admin";
}

/** Get admin analytics with caching */
export async function getAdminAnalytics(
  db: DbClient,
  options: AnalyticsOptions = {},
): Promise<AdminAnalytics> {
  const timeRange: TimeRange = options.timeRange || "24h";
  const topUsersLimit = options.topUsersLimit || 10;

  // Check cache
  const cacheKey = getCacheKey({ timeRange, topUsersLimit });
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    log.debug(`[AdminAnalytics] Cache hit for ${cacheKey}`);
    return cached.data;
  }

  log.info(`[AdminAnalytics] Fetching analytics for timeRange=${timeRange}`);
  const startTime = performance.now();

  // Run queries in parallel for performance
  const [userActivity, systemUsage, errorHealth, resources] = await Promise.all(
    [
      queryUserActivity(db, timeRange, topUsersLimit),
      querySystemUsage(db, timeRange),
      queryErrorHealth(db, timeRange),
      queryResources(db),
    ],
  );

  const analytics: AdminAnalytics = {
    timeRange,
    generatedAt: new Date(),
    userActivity,
    systemUsage,
    errorHealth,
    resources,
  };

  // Update cache
  cache.set(cacheKey, {
    data: analytics,
    expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
  });

  const duration = Math.round(performance.now() - startTime);
  log.info(`[AdminAnalytics] Generated in ${duration}ms`);

  return analytics;
}

/** Clear analytics cache (useful for testing) */
export function clearAnalyticsCache(): void {
  cache.clear();
  log.debug("[AdminAnalytics] Cache cleared");
}

/** Get cache statistics */
export function getCacheStats(): {
  entries: number;
  keys: string[];
} {
  return {
    entries: cache.size,
    keys: Array.from(cache.keys()),
  };
}
