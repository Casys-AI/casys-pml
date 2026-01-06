/**
 * Deno Module Loader
 *
 * Dynamically imports capability modules from URLs.
 * Leverages Deno's native HTTP caching for offline support.
 *
 * @module loader/deno-loader
 */

import type { CapabilityModule } from "./types.ts";
import { LoaderError } from "./types.ts";
import * as log from "@std/log";

/**
 * Cache status for debugging.
 */
export type CacheStatus = "hit" | "miss" | "unknown";

/**
 * Result of loading a module.
 */
export interface LoadResult {
  /** Loaded module */
  module: CapabilityModule;
  /** Whether result came from Deno's HTTP cache */
  cacheStatus: CacheStatus;
  /** Load timestamp */
  loadedAt: Date;
}

/**
 * In-memory module cache (for already-loaded modules).
 * Deno's import cache handles HTTP caching; this is for avoiding re-imports.
 */
const moduleCache = new Map<string, CapabilityModule>();

/**
 * Log debug message for loader operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:deno-loader] ${message}`);
}

/**
 * Load a capability module from URL.
 *
 * Uses Deno's native dynamic import which:
 * - Caches HTTP modules in DENO_DIR
 * - Supports offline mode from cache
 * - Handles TypeScript compilation automatically
 *
 * @param codeUrl - URL to load module from
 * @returns Loaded module with cache info
 */
export async function loadCapabilityModule(
  codeUrl: string,
): Promise<LoadResult> {
  // Check in-memory cache first
  const cached = moduleCache.get(codeUrl);
  if (cached) {
    logDebug(`Module cache hit: ${codeUrl}`);
    return {
      module: cached,
      cacheStatus: "hit",
      loadedAt: new Date(),
    };
  }

  logDebug(`Loading module: ${codeUrl}`);

  try {
    // Dynamic import - Deno handles HTTP caching automatically
    const module = await import(codeUrl);

    // Validate module structure
    if (!module || typeof module !== "object") {
      throw new LoaderError(
        "MODULE_IMPORT_FAILED",
        `Invalid module: expected object, got ${typeof module}`,
        { codeUrl },
      );
    }

    // Cast to CapabilityModule
    const capModule = module as CapabilityModule;

    // Cache in memory
    moduleCache.set(codeUrl, capModule);

    // We can't easily detect if this was a cache hit at the HTTP level
    // without lower-level access, so we report "unknown"
    logDebug(`Module loaded: ${codeUrl}`);

    return {
      module: capModule,
      cacheStatus: "unknown",
      loadedAt: new Date(),
    };
  } catch (error) {
    // Re-throw LoaderErrors
    if (error instanceof LoaderError) {
      throw error;
    }

    // Handle import errors
    const message = error instanceof Error ? error.message : String(error);

    // Check if this is a network error (might work offline from cache)
    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("ENOTFOUND")
    ) {
      throw new LoaderError(
        "MODULE_IMPORT_FAILED",
        `Network error loading module. If offline, module may not be cached.`,
        { codeUrl, error: message },
      );
    }

    throw new LoaderError(
      "MODULE_IMPORT_FAILED",
      `Failed to import module: ${message}`,
      { codeUrl, error: message },
    );
  }
}

/**
 * Check if a module is in the in-memory cache.
 */
export function isModuleCached(codeUrl: string): boolean {
  return moduleCache.has(codeUrl);
}

/**
 * Get a cached module if available.
 */
export function getCachedModule(codeUrl: string): CapabilityModule | undefined {
  return moduleCache.get(codeUrl);
}

/**
 * Clear the in-memory module cache.
 *
 * Note: This does NOT clear Deno's HTTP cache in DENO_DIR.
 */
export function clearModuleCache(): void {
  moduleCache.clear();
}

/**
 * Get all cached module URLs.
 */
export function getCachedUrls(): string[] {
  return Array.from(moduleCache.keys());
}
