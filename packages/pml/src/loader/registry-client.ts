/**
 * Registry Client
 *
 * Fetches capability metadata from PML registry (pml.casys.ai/mcp/{fqdn}).
 * Supports in-memory caching and offline mode.
 *
 * @module loader/registry-client
 */

import type {
  CapabilityMetadata,
  RegistryClientOptions,
  RegistryFetchResult,
} from "./types.ts";
import { LoaderError } from "./types.ts";

/**
 * Default timeout for registry requests (10 seconds).
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Default max cache entries (LRU-like eviction when exceeded).
 */
const DEFAULT_MAX_CACHE_SIZE = 100;

/**
 * Cache entry with access tracking for LRU.
 */
interface CacheEntry {
  metadata: CapabilityMetadata;
  fetchedAt: Date;
  lastAccessed: Date;
}

/**
 * Convert tool name to FQDN format.
 *
 * Tool names use colon (e.g., "filesystem:read_file")
 * FQDNs use dots (e.g., "casys.pml.filesystem.read_file")
 *
 * @param toolName - Tool name in colon format
 * @returns FQDN in dot format
 */
export function toolNameToFqdn(toolName: string): string {
  // Already a FQDN (has multiple dots)
  if (toolName.split(".").length > 2) {
    return toolName;
  }

  // Convert colon to dot and prefix with casys.pml
  const normalized = toolName.replace(/:/g, ".");
  return `casys.pml.${normalized}`;
}

/**
 * Validate capability metadata schema.
 *
 * @param data - Raw data to validate
 * @returns Validated metadata
 * @throws LoaderError if validation fails
 */
function validateMetadata(data: unknown): CapabilityMetadata {
  if (!data || typeof data !== "object") {
    throw new LoaderError(
      "METADATA_PARSE_ERROR",
      "Metadata must be an object",
      { data },
    );
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  if (typeof obj.fqdn !== "string" || !obj.fqdn) {
    throw new LoaderError(
      "METADATA_PARSE_ERROR",
      "Missing required field: fqdn",
      { data },
    );
  }

  if (obj.type !== "deno") {
    throw new LoaderError(
      "METADATA_PARSE_ERROR",
      `Invalid type: expected "deno", got "${obj.type}"`,
      { data },
    );
  }

  if (typeof obj.codeUrl !== "string" || !obj.codeUrl) {
    throw new LoaderError(
      "METADATA_PARSE_ERROR",
      "Missing required field: codeUrl",
      { data },
    );
  }

  if (!Array.isArray(obj.tools)) {
    throw new LoaderError(
      "METADATA_PARSE_ERROR",
      "Missing required field: tools (array)",
      { data },
    );
  }

  if (obj.routing !== "client" && obj.routing !== "server") {
    throw new LoaderError(
      "METADATA_PARSE_ERROR",
      `Invalid routing: expected "client" or "server", got "${obj.routing}"`,
      { data },
    );
  }

  // Validate mcpDeps if present
  if (obj.mcpDeps !== undefined) {
    if (!Array.isArray(obj.mcpDeps)) {
      throw new LoaderError(
        "METADATA_PARSE_ERROR",
        "mcpDeps must be an array",
        { data },
      );
    }

    for (const dep of obj.mcpDeps) {
      if (!dep || typeof dep !== "object") {
        throw new LoaderError(
          "METADATA_PARSE_ERROR",
          "Each mcpDep must be an object",
          { dep },
        );
      }

      const d = dep as Record<string, unknown>;
      if (typeof d.name !== "string" || !d.name) {
        throw new LoaderError(
          "METADATA_PARSE_ERROR",
          "mcpDep missing required field: name",
          { dep },
        );
      }

      if (d.type !== "stdio") {
        throw new LoaderError(
          "METADATA_PARSE_ERROR",
          `mcpDep invalid type: expected "stdio", got "${d.type}"`,
          { dep },
        );
      }

      if (typeof d.install !== "string" || !d.install) {
        throw new LoaderError(
          "METADATA_PARSE_ERROR",
          "mcpDep missing required field: install",
          { dep },
        );
      }

      if (typeof d.version !== "string" || !d.version) {
        throw new LoaderError(
          "METADATA_PARSE_ERROR",
          "mcpDep missing required field: version",
          { dep },
        );
      }

      if (typeof d.integrity !== "string" || !d.integrity) {
        throw new LoaderError(
          "METADATA_PARSE_ERROR",
          "mcpDep missing required field: integrity",
          { dep },
        );
      }
    }
  }

  return {
    fqdn: obj.fqdn,
    type: "deno",
    codeUrl: obj.codeUrl,
    description: typeof obj.description === "string"
      ? obj.description
      : undefined,
    tools: obj.tools as string[],
    routing: obj.routing,
    mcpDeps: obj.mcpDeps as CapabilityMetadata["mcpDeps"],
  };
}

/**
 * Registry client for fetching capability metadata.
 *
 * Uses instance-based cache for test isolation and LRU eviction.
 */
export class RegistryClient {
  private readonly cloudUrl: string;
  private readonly timeout: number;
  private readonly maxCacheSize: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: RegistryClientOptions & { maxCacheSize?: number }) {
    this.cloudUrl = options.cloudUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
  }

  /**
   * Evict least recently accessed entry if cache is full.
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxCacheSize) {
      return;
    }

    // Find LRU entry
    let lruKey: string | null = null;
    let lruTime = new Date();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * Fetch capability metadata from registry.
   *
   * @param namespace - Tool namespace (e.g., "filesystem:read_file" or FQDN)
   * @returns Metadata with cache info
   */
  async fetch(namespace: string): Promise<RegistryFetchResult> {
    const fqdn = toolNameToFqdn(namespace);

    // Check cache first
    const cached = this.cache.get(fqdn);
    if (cached) {
      // Update last accessed for LRU
      cached.lastAccessed = new Date();
      return {
        metadata: cached.metadata,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }

    // Fetch from registry
    const url = `${this.cloudUrl}/mcp/${fqdn}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        throw new LoaderError(
          "METADATA_FETCH_FAILED",
          `Capability not found: ${fqdn}`,
          { url, status: 404 },
        );
      }

      if (!response.ok) {
        throw new LoaderError(
          "METADATA_FETCH_FAILED",
          `Registry error: ${response.status} ${response.statusText}`,
          { url, status: response.status },
        );
      }

      const data = await response.json();
      const metadata = validateMetadata(data);
      const now = new Date();

      // Evict LRU entry if cache is full
      this.evictIfNeeded();

      // Cache the result
      this.cache.set(fqdn, { metadata, fetchedAt: now, lastAccessed: now });

      return {
        metadata,
        fromCache: false,
        fetchedAt: now,
      };
    } catch (error) {
      // Re-throw LoaderErrors
      if (error instanceof LoaderError) {
        throw error;
      }

      // Handle abort (timeout)
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new LoaderError(
          "METADATA_FETCH_FAILED",
          `Registry request timed out after ${this.timeout}ms`,
          { url, timeout: this.timeout },
        );
      }

      // Handle network errors
      throw new LoaderError(
        "METADATA_FETCH_FAILED",
        `Network error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { url, error: String(error) },
      );
    }
  }

  /**
   * Get cached metadata if available (for offline mode).
   *
   * @param namespace - Tool namespace
   * @returns Cached metadata or undefined
   */
  getCached(namespace: string): CapabilityMetadata | undefined {
    const fqdn = toolNameToFqdn(namespace);
    const cached = this.cache.get(fqdn);
    if (cached) {
      // Update last accessed for LRU
      cached.lastAccessed = new Date();
      return cached.metadata;
    }
    return undefined;
  }

  /**
   * Clear the metadata cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all cached FQDNs.
   */
  getCachedFqdns(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics for debugging.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }
}
