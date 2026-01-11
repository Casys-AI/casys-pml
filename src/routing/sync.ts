/**
 * Routing Sync Module
 *
 * Syncs routing configuration with cloud at startup.
 * Uses ETag/version for efficient change detection.
 *
 * @module routing/sync
 */

import type { RoutingCache, RoutingConfig, RoutingSyncResult } from "../types.ts";
import {
  createCacheEntry,
  DEFAULT_ROUTING_CONFIG,
  loadRoutingCache,
  saveRoutingCache,
} from "./cache.ts";

/**
 * Default cloud endpoint for routing config
 */
const DEFAULT_ROUTING_ENDPOINT = "/api/v1/routing";

/**
 * Sync timeout in milliseconds
 */
const SYNC_TIMEOUT_MS = 5000;

/**
 * Logger interface for sync operations
 */
export interface SyncLogger {
  info(message: string): void;
  warn(message: string): void;
  debug?(message: string): void;
}

/**
 * Default console logger
 */
const defaultLogger: SyncLogger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
};

/**
 * Fetch routing config from cloud.
 *
 * @param cloudUrl Cloud base URL (e.g., "https://pml.casys.ai")
 * @param currentVersion Current cached version for If-None-Match
 * @param apiKey API key for authentication
 * @returns Routing config or null if not modified/error
 */
async function fetchRoutingConfig(
  cloudUrl: string,
  currentVersion?: string,
  apiKey?: string,
): Promise<{ config: RoutingConfig; notModified: boolean } | null> {
  const url = `${cloudUrl}${DEFAULT_ROUTING_ENDPOINT}`;

  const headers: HeadersInit = {
    Accept: "application/json",
  };

  // Auth header
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  // Use version for conditional fetch
  if (currentVersion) {
    headers["If-None-Match"] = `"${currentVersion}"`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Not modified - cache is current
    if (response.status === 304) {
      return { config: null as unknown as RoutingConfig, notModified: true };
    }

    if (!response.ok) {
      return null;
    }

    const config: RoutingConfig = await response.json();

    // Validate response structure
    if (
      !config.version ||
      !Array.isArray(config.clientTools) ||
      !Array.isArray(config.serverTools)
    ) {
      return null;
    }

    return { config, notModified: false };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sync routing configuration with cloud.
 *
 * Flow:
 * 1. Load local cache
 * 2. Fetch from cloud with current version
 * 3. If changed, update cache
 * 4. If offline, use existing cache or fallback
 *
 * @param cloudUrl Cloud base URL
 * @param logger Optional logger
 * @param cachePath Optional cache file path (for testing)
 * @param apiKey Optional API key for authentication
 * @returns Sync result with current config
 */
export async function syncRoutingConfig(
  cloudUrl: string,
  logger: SyncLogger = defaultLogger,
  cachePath?: string,
  apiKey?: string,
): Promise<{ result: RoutingSyncResult; config: RoutingConfig }> {
  // Step 1: Load existing cache
  const existingCache = await loadRoutingCache(cachePath);

  // Step 2: Try to fetch from cloud (with auth)
  const fetchResult = await fetchRoutingConfig(
    cloudUrl,
    existingCache?.config.version,
    apiKey ?? Deno.env.get("PML_API_KEY"),
  );

  // Step 3: Handle fetch result
  if (fetchResult === null) {
    // Offline or error
    if (existingCache) {
      logger.warn(`⚠ Cloud sync failed, using cached routing (v${existingCache.config.version})`);
      return {
        result: {
          success: false,
          updated: false,
          version: existingCache.config.version,
          error: "Cloud unreachable, using cache",
          fromCache: true,
        },
        config: existingCache.config,
      };
    }

    // No cache, NO FALLBACK - fail
    logger.warn("✗ Cloud sync failed, no cache available - ROUTING UNAVAILABLE");
    return {
      result: {
        success: false,
        updated: false,
        version: "none",
        error: "Cloud unreachable and no cache. Run 'pml init' or check network.",
        fromCache: false,
      },
      config: DEFAULT_ROUTING_CONFIG, // Empty config - will fail on tool calls
    };
  }

  // Step 4: Handle successful fetch
  if (fetchResult.notModified) {
    // Cache is current
    logger.info(`✓ Routing config up-to-date (v${existingCache!.config.version})`);
    return {
      result: {
        success: true,
        updated: false,
        version: existingCache!.config.version,
        fromCache: true,
      },
      config: existingCache!.config,
    };
  }

  // Step 5: New config received, save to cache
  const newCache: RoutingCache = createCacheEntry(fetchResult.config, cloudUrl);
  await saveRoutingCache(newCache, cachePath);

  const wasUpdate = existingCache !== null;
  if (wasUpdate) {
    logger.info(
      `✓ Routing config updated: v${existingCache.config.version} → v${fetchResult.config.version}`,
    );
  } else {
    logger.info(`✓ Routing config synced (v${fetchResult.config.version})`);
  }

  return {
    result: {
      success: true,
      updated: true,
      version: fetchResult.config.version,
      fromCache: false,
    },
    config: fetchResult.config,
  };
}

/**
 * Get current routing config (from cache or sync).
 *
 * Use this for quick access without forcing a sync.
 *
 * @param cloudUrl Cloud base URL (for fallback if no cache)
 * @param cachePath Optional cache path
 * @returns Current routing config
 */
export async function getRoutingConfig(
  cloudUrl?: string,
  cachePath?: string,
): Promise<RoutingConfig> {
  const cache = await loadRoutingCache(cachePath);

  if (cache) {
    return cache.config;
  }

  // No cache - try sync if cloudUrl provided
  if (cloudUrl) {
    const { config } = await syncRoutingConfig(cloudUrl, defaultLogger, cachePath);
    return config;
  }

  // Fallback
  return DEFAULT_ROUTING_CONFIG;
}
