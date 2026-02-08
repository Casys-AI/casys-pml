/**
 * UI Cache Service
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Manages caching of MCP Apps UI HTML resources using S3-compatible storage (Garage).
 * Provides TTL-based caching with fallback to cached version when MCP disconnected.
 *
 * ADR: 2026-02-03-adr-garage-object-storage.md
 *
 * @module services/ui-cache-service
 */

import * as log from "@std/log";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "npm:@aws-sdk/client-s3@3.700.0";

/**
 * Cached UI resource metadata
 */
export interface CachedUiResource {
  /** HTML content */
  content: string;
  /** MIME type, typically "text/html;profile=mcp-app" */
  mimeType: string;
  /** Timestamp when cached (Date.now()) */
  cachedAt: number;
  /** Source MCP server ID */
  serverId: string;
}

/**
 * Options for UiCacheService
 */
export interface UiCacheServiceOptions {
  /** S3 endpoint URL (default: from env GARAGE_S3_ENDPOINT) */
  endpoint?: string;
  /** S3 bucket name (default: from env GARAGE_S3_BUCKET) */
  bucket?: string;
  /** S3 access key (default: from env GARAGE_S3_ACCESS_KEY) */
  accessKey?: string;
  /** S3 secret key (default: from env GARAGE_S3_SECRET_KEY) */
  secretKey?: string;
  /** S3 region (default: from env GARAGE_S3_REGION) */
  region?: string;
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs?: number;
  /** @internal Injected S3-compatible client for testing */
  _testClient?: { send(command: unknown): Promise<unknown>; destroy(): void };
}

/**
 * Resource fetcher interface for dependency injection
 */
export interface ResourceFetcher {
  fetch(resourceUri: string): Promise<{ content: string; mimeType: string } | null>;
  isConnected(serverId: string): boolean;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Convert resource URI to S3 key
 * ui://mcp-std/table-viewer -> ui/mcp-std/table-viewer.json
 */
function uriToKey(resourceUri: string): string {
  return resourceUri.replace("://", "/") + ".json";
}

/**
 * Convert S3 key back to resource URI
 */
function keyToUri(key: string): string {
  return key.replace("/", "://").replace(/\.json$/, "");
}

/**
 * Service for caching and retrieving MCP Apps UI resources using S3
 */
export class UiCacheService {
  private client: S3Client | null = null;
  private readonly endpoint: string;
  private readonly bucketName: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly region: string;
  private readonly ttlMs: number;
  private readonly _injectedClient: UiCacheServiceOptions["_testClient"] | null;

  constructor(options: UiCacheServiceOptions = {}) {
    this._injectedClient = options._testClient ?? null;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

    // Skip env reads when test client is injected (avoids Deno permission errors)
    if (this._injectedClient) {
      this.endpoint = "";
      this.bucketName = "";
      this.accessKey = "";
      this.secretKey = "";
      this.region = "";
      return;
    }

    this.endpoint = options.endpoint ?? Deno.env.get("GARAGE_S3_ENDPOINT") ?? "http://127.0.0.1:3900";
    this.bucketName = options.bucket ?? Deno.env.get("GARAGE_S3_BUCKET") ?? "ui-cache";
    this.accessKey = options.accessKey ?? Deno.env.get("GARAGE_S3_ACCESS_KEY") ?? "";
    this.secretKey = options.secretKey ?? Deno.env.get("GARAGE_S3_SECRET_KEY") ?? "";
    this.region = options.region ?? Deno.env.get("GARAGE_S3_REGION") ?? "garage";
  }

  /**
   * Initialize the S3 connection
   */
  async init(): Promise<void> {
    if (this.client) return;

    // Allow injected client for testing
    if (this._injectedClient) {
      this.client = this._injectedClient as unknown as S3Client;
      return;
    }

    if (!this.accessKey || !this.secretKey) {
      throw new Error("[UiCacheService] Missing S3 credentials. Set GARAGE_S3_ACCESS_KEY and GARAGE_S3_SECRET_KEY.");
    }

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: this.region,
      credentials: {
        accessKeyId: this.accessKey,
        secretAccessKey: this.secretKey,
      },
      forcePathStyle: true, // Required for Garage
    });

    log.info(`[UiCacheService] Connected to S3: ${this.endpoint}/${this.bucketName}`);
  }

  /**
   * Close the S3 connection
   */
  close(): void {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }

  /**
   * Get cached UI resource
   */
  async get(resourceUri: string): Promise<CachedUiResource | null> {
    if (!this.client) {
      throw new Error("[UiCacheService] S3 not initialized. Call init() first.");
    }

    const key = uriToKey(resourceUri);

    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));

      if (!response.Body) {
        return null;
      }

      const bodyStr = await response.Body.transformToString();
      const wrapper = JSON.parse(bodyStr) as CachedUiResource;
      return wrapper;
    } catch (error) {
      // NoSuchKey is expected when object doesn't exist
      if (error instanceof Error && error.name === "NoSuchKey") {
        return null;
      }
      log.warn(`[UiCacheService] Failed to get ${resourceUri}: ${error}`);
      return null;
    }
  }

  /**
   * Check if cached resource is fresh (within TTL)
   */
  isFresh(cached: CachedUiResource): boolean {
    return Date.now() - cached.cachedAt < this.ttlMs;
  }

  /**
   * Store UI resource in cache
   */
  async set(
    resourceUri: string,
    content: string,
    mimeType: string,
    serverId: string,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("[UiCacheService] S3 not initialized. Call init() first.");
    }

    const key = uriToKey(resourceUri);

    // Store as JSON wrapper with metadata
    const wrapper: CachedUiResource = {
      content,
      mimeType,
      cachedAt: Date.now(),
      serverId,
    };

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(wrapper),
      ContentType: "application/json",
    }));

    log.info(`[UiCacheService] Cached UI: ${resourceUri} (${content.length} bytes)`);
  }

  /**
   * Delete cached UI resource
   */
  async delete(resourceUri: string): Promise<void> {
    if (!this.client) {
      throw new Error("[UiCacheService] S3 not initialized. Call init() first.");
    }

    const key = uriToKey(resourceUri);
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    }));
    log.debug(`[UiCacheService] Deleted UI resource: ${resourceUri}`);
  }

  /**
   * Get or fetch UI resource with TTL-based caching
   */
  async getOrFetch(
    resourceUri: string,
    serverId: string,
    fetcher: ResourceFetcher,
  ): Promise<{ content: string; mimeType: string } | null> {
    if (!this.client) {
      throw new Error("[UiCacheService] S3 not initialized. Call init() first.");
    }

    const cached = await this.get(resourceUri);
    const isConnected = fetcher.isConnected(serverId);

    // Case 1: Cached and fresh
    if (cached && this.isFresh(cached)) {
      log.debug(`[UiCacheService] Cache hit (fresh): ${resourceUri}`);
      return { content: cached.content, mimeType: cached.mimeType };
    }

    // Case 2 & 3: Cached but stale
    if (cached) {
      if (isConnected) {
        const fetched = await fetcher.fetch(resourceUri);
        if (fetched) {
          await this.set(resourceUri, fetched.content, fetched.mimeType, serverId);
          log.debug(`[UiCacheService] Cache refreshed: ${resourceUri}`);
          return fetched;
        }
        log.warn(`[UiCacheService] Refresh failed, returning stale cache: ${resourceUri}`);
        return { content: cached.content, mimeType: cached.mimeType };
      } else {
        log.debug(`[UiCacheService] MCP disconnected, returning stale cache: ${resourceUri}`);
        return { content: cached.content, mimeType: cached.mimeType };
      }
    }

    // Case 4 & 5: Not cached
    if (isConnected) {
      const fetched = await fetcher.fetch(resourceUri);
      if (fetched) {
        await this.set(resourceUri, fetched.content, fetched.mimeType, serverId);
        log.debug(`[UiCacheService] Fetched and cached: ${resourceUri}`);
        return fetched;
      }
    }

    log.warn(`[UiCacheService] Resource unavailable: ${resourceUri}`);
    return null;
  }

  /**
   * List all cached UI resources
   */
  async listAll(): Promise<string[]> {
    if (!this.client) {
      throw new Error("[UiCacheService] S3 not initialized. Call init() first.");
    }

    const uris: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: "ui/",
        ContinuationToken: continuationToken,
      }));

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            uris.push(keyToUri(obj.Key));
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return uris;
  }

  /**
   * Clear all cached UI resources.
   * Continues on individual delete failures and reports errors.
   */
  async clearAll(): Promise<{ deleted: number; failed: number }> {
    const uris = await this.listAll();
    let deleted = 0;
    let failed = 0;

    for (const uri of uris) {
      try {
        await this.delete(uri);
        deleted++;
      } catch (error) {
        failed++;
        log.warn(`[UiCacheService] Failed to delete ${uri} during clearAll: ${error}`);
      }
    }

    if (failed > 0) {
      log.warn(`[UiCacheService] clearAll completed with errors: ${deleted} deleted, ${failed} failed out of ${uris.length}`);
    } else {
      log.info(`[UiCacheService] Cleared ${deleted} cached UI resources`);
    }

    return { deleted, failed };
  }

  /**
   * Get cache statistics.
   * Uses parallel fetches to avoid N+1 sequential S3 calls.
   */
  async getStats(): Promise<{ totalCached: number; fresh: number; stale: number }> {
    const uris = await this.listAll();
    const totalCached = uris.length;

    if (totalCached === 0) {
      return { totalCached: 0, fresh: 0, stale: 0 };
    }

    // Fetch all in parallel instead of sequential N+1
    const results = await Promise.all(uris.map((uri) => this.get(uri)));

    let fresh = 0;
    let stale = 0;
    for (const cached of results) {
      if (cached && this.isFresh(cached)) {
        fresh++;
      } else {
        stale++;
      }
    }

    return { totalCached, fresh, stale };
  }
}

// Singleton
let _instance: UiCacheService | null = null;

export function getUiCacheService(options?: UiCacheServiceOptions): UiCacheService {
  if (!_instance) {
    _instance = new UiCacheService(options);
  }
  return _instance;
}

export function resetUiCacheService(): void {
  if (_instance) {
    _instance.close();
    _instance = null;
  }
}

/**
 * Get the singleton UiCacheService and ensure it's initialized.
 * Replaces the repetitive `getUiCacheService() + await init()` pattern.
 */
export async function ensureUiCacheReady(options?: UiCacheServiceOptions): Promise<UiCacheService> {
  const service = getUiCacheService(options);
  await service.init();
  return service;
}
