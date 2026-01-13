/**
 * PML Session Client
 *
 * Manages session lifecycle with the PML server:
 * - Register at startup
 * - Heartbeat to keep alive
 * - Unregister at shutdown
 *
 * @module session/client
 */


/**
 * Package capabilities to declare at registration.
 */
export interface PackageCapabilities {
  sandbox: boolean;
  clientTools: boolean;
  hybridRouting: boolean;
}

/**
 * User scope for FQDN generation (multi-tenant)
 */
export interface UserScope {
  org: string;
  project: string;
}

/**
 * Registration response from server.
 *
 * Note: routingConfig is NOT included - package syncs it separately
 * via syncRoutingConfig() at startup (Story 14.3).
 */
export interface RegisterResponse {
  sessionId: string;
  expiresAt: string;
  heartbeatIntervalMs: number;
  features: {
    hybridRouting: boolean;
    tracing: boolean;
  };
  /** User scope for FQDN generation */
  scope: UserScope;
}

/**
 * Session client options.
 */
export interface SessionClientOptions {
  /** Cloud URL */
  cloudUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Package version */
  version: string;
  /** Workspace path */
  workspace?: string;
}

/**
 * Persistent client ID storage path.
 * Stored in .pml/ folder alongside lockfile and deps.
 */
const CLIENT_ID_FILE = ".pml/client-id";

/**
 * Default fetch timeout in milliseconds.
 */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Create an AbortSignal that times out after the specified milliseconds.
 */
function createTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Generate or load persistent client ID.
 */
async function getOrCreateClientId(workspace: string): Promise<string> {
  const { join } = await import("@std/path");
  const { ensureDir } = await import("@std/fs");
  const clientIdPath = join(workspace, CLIENT_ID_FILE);

  try {
    const existing = await Deno.readTextFile(clientIdPath);
    if (existing.trim()) {
      return existing.trim();
    }
  } catch {
    // File doesn't exist, create new
  }

  const newId = crypto.randomUUID();
  try {
    // Ensure .pml directory exists
    await ensureDir(join(workspace, ".pml"));
    await Deno.writeTextFile(clientIdPath, newId);
  } catch {
    // Couldn't persist, that's OK
  }
  return newId;
}

/**
 * Log debug message for session operations.
 */
function logDebug(message: string): void {
  if (Deno.env.get("PML_DEBUG") === "1") {
    console.error(`[pml:session] ${message}`);
  }
}

/**
 * Session client for package-server handshake.
 *
 * @example
 * ```ts
 * const session = new SessionClient({
 *   cloudUrl: "https://pml.casys.ai",
 *   apiKey: "your-key",
 *   version: "0.1.0",
 *   workspace: "/path/to/workspace",
 * });
 *
 * await session.register();
 * // ... use session.sessionId in requests
 * await session.shutdown();
 * ```
 */
export class SessionClient {
  private readonly cloudUrl: string;
  private readonly apiKey: string;
  private readonly version: string;
  private readonly workspace: string;

  /** Current session ID (set after register) */
  private _sessionId: string | null = null;

  /** User scope for FQDN generation (set after register) */
  private _scope: UserScope | null = null;

  /** Heartbeat interval timer */
  private heartbeatTimer: number | null = null;

  /** Whether client is registered */
  private _isRegistered = false;

  /** Lock to prevent concurrent re-registration attempts */
  private _isReregistering = false;

  constructor(options: SessionClientOptions) {
    this.cloudUrl = options.cloudUrl;
    this.apiKey = options.apiKey;
    this.version = options.version;
    this.workspace = options.workspace ?? Deno.cwd();
  }

  /**
   * Get current session ID.
   */
  get sessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Get user scope for FQDN generation.
   * Returns null if not registered yet.
   */
  get scope(): UserScope | null {
    return this._scope;
  }

  /**
   * Check if registered.
   */
  get isRegistered(): boolean {
    return this._isRegistered;
  }

  /**
   * Register with the server.
   *
   * @returns Registration response with session info
   */
  async register(): Promise<RegisterResponse> {
    const clientId = await getOrCreateClientId(this.workspace);

    logDebug(`Registering with server: ${clientId.slice(0, 8)}`);

    const response = await fetch(`${this.cloudUrl}/pml/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        clientId,
        version: this.version,
        capabilities: {
          sandbox: true,
          clientTools: true,
          hybridRouting: true,
        },
        workspace: this.workspace,
      }),
      signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${response.status} - ${error}`);
    }

    const result = await response.json() as RegisterResponse;

    this._sessionId = result.sessionId;
    this._scope = result.scope;
    this._isRegistered = true;

    logDebug(`Registered: session=${result.sessionId.slice(0, 8)}, scope=${result.scope.org}.${result.scope.project}, heartbeat=${result.heartbeatIntervalMs}ms`);

    // Start heartbeat
    this.startHeartbeat(result.heartbeatIntervalMs);

    return result;
  }

  /**
   * Send heartbeat to keep session alive.
   */
  async heartbeat(): Promise<boolean> {
    if (!this._sessionId) {
      return false;
    }

    try {
      const response = await fetch(`${this.cloudUrl}/pml/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          sessionId: this._sessionId,
        }),
        signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        logDebug(`Heartbeat failed: ${response.status}`);
        return false;
      }

      const result = await response.json() as { valid: boolean; expiresAt: string };
      logDebug(`Heartbeat: valid=${result.valid}, expires=${result.expiresAt}`);

      if (!result.valid) {
        // Session expired, try to re-register
        this._isRegistered = false;
        this._sessionId = null;
        return false;
      }

      return true;
    } catch (error) {
      logDebug(`Heartbeat error: ${error}`);
      return false;
    }
  }

  /**
   * Unregister from server (graceful shutdown).
   */
  async unregister(): Promise<void> {
    this.stopHeartbeat();

    if (!this._sessionId) {
      return;
    }

    try {
      await fetch(`${this.cloudUrl}/pml/unregister`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          sessionId: this._sessionId,
        }),
        signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
      });

      logDebug(`Unregistered: ${this._sessionId.slice(0, 8)}`);
    } catch (error) {
      logDebug(`Unregister error: ${error}`);
    } finally {
      this._sessionId = null;
      this._scope = null;
      this._isRegistered = false;
    }
  }

  /**
   * Shutdown client (alias for unregister).
   */
  async shutdown(): Promise<void> {
    await this.unregister();
  }

  /**
   * Get headers to include in MCP requests.
   */
  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
    };

    if (this._sessionId) {
      headers["X-PML-Session"] = this._sessionId;
    }

    return headers;
  }

  /**
   * Start periodic heartbeat.
   */
  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(async () => {
      const valid = await this.heartbeat();
      if (!valid && this._isRegistered && !this._isReregistering) {
        // Try to re-register with lock to prevent concurrent attempts
        this._isReregistering = true;
        logDebug("Session expired, re-registering...");
        try {
          await this.register();
        } catch (error) {
          logDebug(`Re-registration failed: ${error}`);
        } finally {
          this._isReregistering = false;
        }
      }
    }, intervalMs);

    logDebug(`Heartbeat started: every ${intervalMs}ms`);
  }

  /**
   * Stop heartbeat timer.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
