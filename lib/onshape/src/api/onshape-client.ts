/**
 * Onshape REST API Client
 *
 * Zero-dependency HTTP client for the Onshape REST API.
 * Supports both Basic Auth (dev/test) and HMAC-SHA256 (production).
 *
 * API Reference:
 *   Base URL: https://cad.onshape.com/api/v10
 *   Auth: Basic (dev) or HMAC-SHA256 (production)
 *   Methods: GET, POST, DELETE only (no PUT/PATCH)
 *   IDs: 24-char hex strings (document, workspace, version, element)
 *
 * @module lib/onshape/api/onshape-client
 */

export interface OnshapeClientConfig {
  /** Onshape base URL, default: https://cad.onshape.com */
  baseUrl?: string;
  /** API Access Key from Onshape Developer portal */
  accessKey: string;
  /** API Secret Key from Onshape Developer portal */
  secretKey: string;
  /** Auth method: "basic" (dev/test) or "hmac" (production). Default: "basic" */
  authMethod?: "basic" | "hmac";
  /** API version. Default: "v10" */
  apiVersion?: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

export class OnshapeAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`[OnshapeClient] ${message} (HTTP ${status})`);
    this.name = "OnshapeAPIError";
  }
}

/**
 * Onshape REST API client.
 * Follows no-silent-fallbacks policy — throws OnshapeAPIError on any HTTP error.
 */
export class OnshapeClient {
  private baseUrl: string;
  private accessKey: string;
  private secretKey: string;
  private authMethod: "basic" | "hmac";
  private apiVersion: string;
  private timeoutMs: number;
  private _cryptoKey: CryptoKey | null = null;

  constructor(config: OnshapeClientConfig) {
    this.baseUrl = (config.baseUrl ?? "https://cad.onshape.com").replace(
      /\/$/,
      "",
    );
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.authMethod = config.authMethod ?? "basic";
    this.apiVersion = config.apiVersion ?? "v10";
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /** API base path, e.g. /api/v10 */
  get apiBase(): string {
    return `/api/${this.apiVersion}`;
  }

  // ── Auth helpers ──────────────────────────────────────────────────────────

  /** Generate a random nonce (25 alphanumeric chars) */
  private generateNonce(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(25));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  }

  /** Get or create the HMAC CryptoKey (cached) */
  private async getCryptoKey(): Promise<CryptoKey> {
    if (this._cryptoKey) return this._cryptoKey;
    this._cryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return this._cryptoKey;
  }

  /** Build auth headers for a request */
  private async buildAuthHeaders(
    method: string,
    url: URL,
    contentType: string,
  ): Promise<Record<string, string>> {
    if (this.authMethod === "basic") {
      const encoded = btoa(`${this.accessKey}:${this.secretKey}`);
      return { Authorization: `Basic ${encoded}` };
    }

    // HMAC-SHA256 auth
    const nonce = this.generateNonce();
    const date = new Date().toUTCString();
    const pathname = url.pathname;
    const query = url.search.replace(/^\?/, "");

    const signingString = [
      method,
      nonce,
      date,
      contentType,
      pathname,
      query,
      "",
    ]
      .join("\n")
      .toLowerCase();

    const key = await this.getCryptoKey();
    const sigBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signingString),
    );
    const signature = btoa(
      String.fromCharCode(...new Uint8Array(sigBytes)),
    );

    return {
      Authorization: `On ${this.accessKey}:HmacSHA256:${signature}`,
      Date: date,
      "On-Nonce": nonce,
    };
  }

  // ── HTTP methods ──────────────────────────────────────────────────────────

  /**
   * Generic HTTP request with auth.
   * All Onshape API calls go through this method.
   */
  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      rawResponse?: boolean;
    },
  ): Promise<T> {
    // Build URL with query params
    const fullPath = path.startsWith("/api/")
      ? path
      : `${this.apiBase}${path}`;
    const url = new URL(`${this.baseUrl}${fullPath}`);

    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const hasBody = options?.body !== undefined;
    const contentType = hasBody ? "application/json" : "";

    // Build headers
    const authHeaders = await this.buildAuthHeaders(
      method,
      url,
      contentType,
    );
    const headers: Record<string, string> = {
      ...authHeaders,
      Accept: "application/json",
    };
    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }

    // Execute request
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: hasBody ? JSON.stringify(options!.body) : undefined,
        signal: controller.signal,
        redirect: "follow",
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new OnshapeAPIError(
          `Request timed out after ${this.timeoutMs}ms: ${method} ${fullPath}`,
          408,
          null,
        );
      }
      throw new OnshapeAPIError(
        `Network error on ${method} ${fullPath}: ${(err as Error).message}`,
        0,
        null,
      );
    }
    clearTimeout(timer);

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new OnshapeAPIError(
        `Rate limited. Retry after ${retryAfter ?? "unknown"} seconds`,
        429,
        null,
      );
    }

    // Parse response
    let responseBody: unknown;
    const respContentType = response.headers.get("content-type") ?? "";
    if (respContentType.includes("application/json")) {
      responseBody = await response.json();
    } else if (respContentType.includes("image/") || respContentType.includes("application/octet-stream")) {
      // Binary response (thumbnails, exports)
      if (options?.rawResponse) {
        responseBody = await response.arrayBuffer();
      } else {
        responseBody = {
          contentType: respContentType,
          size: response.headers.get("content-length"),
          message: "Binary response — use rawResponse option to get data",
        };
        await response.body?.cancel();
      }
    } else {
      responseBody = await response.text();
    }

    if (!response.ok) {
      const msg =
        typeof responseBody === "object" && responseBody !== null
          ? ((responseBody as Record<string, unknown>).message as string) ??
            ((responseBody as Record<string, unknown>).error as string) ??
            response.statusText
          : response.statusText;
      throw new OnshapeAPIError(
        `${method} ${fullPath} failed: ${msg}`,
        response.status,
        responseBody,
      );
    }

    return responseBody as T;
  }

  /** GET request */
  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  /** POST request */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  /** DELETE request */
  async del<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _client: OnshapeClient | null = null;

/**
 * Get (or lazily create) the singleton OnshapeClient.
 * Reads config from environment variables.
 *
 * Follows no-silent-fallbacks: throws if env vars are not set.
 */
export function getOnshapeClient(): OnshapeClient {
  if (_client) return _client;

  const accessKey =
    Deno.env.get("ONSHAPE_ACCESS_KEY") ?? Deno.env.get("ONSHAPE_API_KEY");
  const secretKey =
    Deno.env.get("ONSHAPE_SECRET_KEY") ?? Deno.env.get("ONSHAPE_API_SECRET");
  const baseUrl = Deno.env.get("ONSHAPE_URL");
  const authMethod =
    (Deno.env.get("ONSHAPE_AUTH_METHOD") as "basic" | "hmac") ?? "basic";

  if (!accessKey || !secretKey) {
    throw new Error(
      "[lib/onshape] ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY are required. " +
        "Generate them at: My Account → Developer → API keys on cad.onshape.com",
    );
  }

  _client = new OnshapeClient({
    baseUrl,
    accessKey,
    secretKey,
    authMethod,
  });
  return _client;
}

/** Override the singleton (useful for tests or dependency injection) */
export function setOnshapeClient(client: OnshapeClient): void {
  _client = client;
}
