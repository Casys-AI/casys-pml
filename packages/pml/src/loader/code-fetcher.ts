/**
 * Capability Code Fetcher
 *
 * Fetches raw capability code from registry for sandboxed execution.
 * Unlike deno-loader.ts which uses import(), this fetches text for Worker execution.
 *
 * @module loader/code-fetcher
 */

import { LoaderError } from "./types.ts";
import * as log from "@std/log";

/**
 * Log debug message for fetcher operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:code-fetcher] ${message}`);
}

/**
 * Result of fetching capability code.
 */
export interface CodeFetchResult {
  /** Raw capability code as text */
  code: string;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Fetch timestamp */
  fetchedAt: Date;
}

/**
 * In-memory code cache.
 *
 * Caches raw code strings to avoid re-fetching.
 */
const codeCache = new Map<string, string>();

/**
 * Fetch raw capability code from URL.
 *
 * Retrieves the code as text for execution in sandbox Worker.
 * Caches results in memory.
 *
 * @param codeUrl - URL to fetch code from
 * @returns Raw code string with cache info
 */
export async function fetchCapabilityCode(
  codeUrl: string,
): Promise<CodeFetchResult> {
  // Check cache first
  const cached = codeCache.get(codeUrl);
  if (cached) {
    logDebug(`Code cache hit: ${codeUrl}`);
    return {
      code: cached,
      fromCache: true,
      fetchedAt: new Date(),
    };
  }

  logDebug(`Fetching code: ${codeUrl}`);

  try {
    const response = await fetch(codeUrl);

    if (!response.ok) {
      throw new LoaderError(
        "MODULE_IMPORT_FAILED",
        `Failed to fetch code: ${response.status} ${response.statusText}`,
        { codeUrl, status: response.status },
      );
    }

    const code = await response.text();

    // Validate we got something
    if (!code || code.trim().length === 0) {
      throw new LoaderError(
        "MODULE_IMPORT_FAILED",
        `Empty code received from ${codeUrl}`,
        { codeUrl },
      );
    }

    // Cache the code
    codeCache.set(codeUrl, code);

    logDebug(`Code fetched: ${codeUrl} (${code.length} bytes)`);

    return {
      code,
      fromCache: false,
      fetchedAt: new Date(),
    };
  } catch (error) {
    // Re-throw LoaderErrors
    if (error instanceof LoaderError) {
      throw error;
    }

    // Handle network errors
    const message = error instanceof Error ? error.message : String(error);

    throw new LoaderError(
      "MODULE_IMPORT_FAILED",
      `Failed to fetch capability code: ${message}`,
      { codeUrl, error: message },
    );
  }
}

/**
 * Check if code is cached.
 */
export function isCodeCached(codeUrl: string): boolean {
  return codeCache.has(codeUrl);
}

/**
 * Get cached code if available.
 */
export function getCachedCode(codeUrl: string): string | undefined {
  return codeCache.get(codeUrl);
}

/**
 * Clear the code cache.
 */
export function clearCodeCache(): void {
  codeCache.clear();
}
