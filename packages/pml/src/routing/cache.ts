/**
 * Routing Cache Module
 *
 * Manages local cache of routing configuration.
 * Cache is stored in ~/.pml/routing-cache.json
 *
 * @module routing/cache
 */

import { ensureDir } from "@std/fs";
import { dirname, join } from "@std/path";
import type { RoutingCache, RoutingConfig } from "../types.ts";

/**
 * Default cache location
 */
const DEFAULT_CACHE_DIR = ".pml";
const CACHE_FILENAME = "routing-cache.json";

/**
 * Default routing config when no cache exists and cloud is unreachable.
 * Conservative: only well-known safe cloud services.
 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  version: "0.0.0-fallback",
  cloudServers: [
    // Memory & Knowledge
    "memory",
    // Search services
    "tavily",
    "brave_search",
    "exa",
    // External APIs
    "github",
    "slack",
    "api",
    "http",
    "fetch",
    // AI services
    "sequential-thinking",
    "context7",
    "magic",
    // Utility modules (pure functions, no side effects)
    "json",
    "math",
    "datetime",
    "crypto",
    "collections",
    "validation",
    "format",
    "transform",
    "algo",
    "string",
    "color",
    "geo",
    "resilience",
    "schema",
    "diff",
    "state",
    "plots",
    // PML meta-tools
    "pml",
  ],
};

/**
 * Get the cache file path.
 *
 * @param homeDir Home directory (defaults to Deno.env.get("HOME"))
 * @returns Full path to cache file
 */
export function getCachePath(homeDir?: string): string {
  const home = homeDir ?? Deno.env.get("HOME") ?? Deno.cwd();
  return join(home, DEFAULT_CACHE_DIR, CACHE_FILENAME);
}

/**
 * Load routing cache from disk.
 *
 * @param cachePath Path to cache file
 * @returns Cached routing or null if not found/invalid
 */
export async function loadRoutingCache(
  cachePath?: string,
): Promise<RoutingCache | null> {
  const path = cachePath ?? getCachePath();

  try {
    const content = await Deno.readTextFile(path);
    const cache: RoutingCache = JSON.parse(content);

    // Validate structure
    if (!cache.config?.version || !Array.isArray(cache.config?.cloudServers)) {
      return null;
    }

    return cache;
  } catch {
    return null;
  }
}

/**
 * Save routing cache to disk.
 *
 * @param cache Cache to save
 * @param cachePath Path to cache file
 */
export async function saveRoutingCache(
  cache: RoutingCache,
  cachePath?: string,
): Promise<void> {
  const path = cachePath ?? getCachePath();

  // Ensure directory exists
  await ensureDir(dirname(path));

  await Deno.writeTextFile(path, JSON.stringify(cache, null, 2));
}

/**
 * Create a new cache entry from config.
 *
 * @param config Routing config from cloud
 * @param cloudUrl Cloud URL used for sync
 * @returns New cache entry
 */
export function createCacheEntry(
  config: RoutingConfig,
  cloudUrl: string,
): RoutingCache {
  return {
    config,
    lastSync: new Date().toISOString(),
    cloudUrl,
  };
}

/**
 * Check if cache is stale (older than maxAge).
 *
 * @param cache Cache to check
 * @param maxAgeMs Maximum age in milliseconds (default: 24 hours)
 * @returns true if cache is stale
 */
export function isCacheStale(
  cache: RoutingCache,
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): boolean {
  const lastSync = new Date(cache.lastSync).getTime();
  const now = Date.now();
  return now - lastSync > maxAgeMs;
}
