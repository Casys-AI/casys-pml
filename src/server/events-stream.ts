/**
 * Server-Sent Events (SSE) Stream Manager for Graph Events
 * Story 6.1: Real-time Events Stream (SSE)
 *
 * Manages long-lived SSE connections for real-time graph monitoring.
 * Broadcasts graph events to all connected clients with heartbeat support.
 */

import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type { GraphEvent } from "../graphrag/events.ts";
import * as log from "@std/log";

/**
 * Configuration for EventsStreamManager
 */
export interface EventsStreamConfig {
  /** Maximum concurrent client connections (default: 100) */
  maxClients: number;
  /** Heartbeat interval in milliseconds (default: 30000 = 30s) */
  heartbeatIntervalMs: number;
  /** Allowed CORS origins (supports wildcards) */
  corsOrigins: string[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: EventsStreamConfig = {
  maxClients: 100,
  heartbeatIntervalMs: 30_000,
  corsOrigins: [
    "http://localhost:*", // Allow any localhost port (dev)
    "http://127.0.0.1:*",
  ],
};

/**
 * Manages SSE connections for graph events
 */
export class EventsStreamManager {
  private clients: Set<WritableStreamDefaultWriter<Uint8Array>> = new Set();
  private startTime = Date.now();
  private heartbeatInterval?: number;
  private encoder = new TextEncoder();
  private graphEventListener: (event: GraphEvent) => void;

  constructor(
    private graphEngine: GraphRAGEngine,
    private config: EventsStreamConfig = DEFAULT_CONFIG,
  ) {
    // Bind event listener
    this.graphEventListener = this.broadcastEvent.bind(this);

    // Subscribe to graph events
    this.graphEngine.on("graph_event", this.graphEventListener);

    // Start heartbeat
    this.startHeartbeat();

    log.info(
      `EventsStreamManager initialized (max clients: ${config.maxClients}, heartbeat: ${config.heartbeatIntervalMs}ms)`,
    );
  }

  /**
   * Handle incoming SSE connection request
   *
   * @param request - HTTP request
   * @returns SSE response stream or 503 if too many clients
   */
  handleRequest(request: Request): Response {
    // Check client limit
    if (this.clients.size >= this.config.maxClients) {
      log.warn(
        `SSE connection rejected: max clients reached (${this.config.maxClients})`,
      );
      return new Response(
        JSON.stringify({
          error: "Too many clients",
          max: this.config.maxClients,
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Create transform stream for SSE
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const writer = writable.getWriter();

    // Register client
    this.clients.add(writer);
    log.info(
      `SSE client connected (${this.clients.size}/${this.config.maxClients})`,
    );

    // Remove client on connection close/abort
    request.signal.addEventListener("abort", () => {
      this.clients.delete(writer);
      writer.close().catch(() => {});
      log.info(
        `SSE client disconnected (${this.clients.size}/${this.config.maxClients})`,
      );
    });

    // Send initial connected event
    this.sendToClient(writer, {
      type: "connected" as const,
      data: {
        client_id: crypto.randomUUID(),
        connected_clients: this.clients.size,
        timestamp: new Date().toISOString(),
      },
    } as unknown as GraphEvent).catch((err) => {
      log.error(`Failed to send connected event: ${err}`);
    });

    // Get CORS headers
    const origin = request.headers.get("Origin") || "*";
    const corsHeaders = this.getCorsHeaders(origin);

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
        ...corsHeaders,
      },
    });
  }

  /**
   * Broadcast event to all connected clients
   *
   * @param event - Graph event to broadcast
   */
  private async broadcastEvent(event: GraphEvent): Promise<void> {
    const deadClients: WritableStreamDefaultWriter<Uint8Array>[] = [];

    // Send to all clients
    for (const client of this.clients) {
      try {
        await this.sendToClient(client, event);
      } catch (error) {
        log.debug(`Client send failed, marking for removal: ${error}`);
        deadClients.push(client);
      }
    }

    // Clean up dead clients
    for (const client of deadClients) {
      this.clients.delete(client);
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }

    if (deadClients.length > 0) {
      log.info(
        `Removed ${deadClients.length} dead clients (${this.clients.size} remaining)`,
      );
    }
  }

  /**
   * Send event to a single client
   *
   * @param writer - Stream writer for the client
   * @param event - Event to send
   */
  private async sendToClient(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    event: GraphEvent,
  ): Promise<void> {
    // SSE format: event: {type}\ndata: {JSON}\n\n
    const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    await writer.write(this.encoder.encode(sseData));
  }

  /**
   * Start heartbeat interval to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const heartbeatEvent: GraphEvent = {
        type: "heartbeat",
        data: {
          connected_clients: this.clients.size,
          uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
          timestamp: new Date().toISOString(),
        },
      };

      this.broadcastEvent(heartbeatEvent).catch((err) => {
        log.error(`Heartbeat broadcast failed: ${err}`);
      });
    }, this.config.heartbeatIntervalMs);

    log.debug(
      `Heartbeat started (interval: ${this.config.heartbeatIntervalMs}ms)`,
    );
  }

  /**
   * Get CORS headers based on origin
   *
   * @param origin - Request origin
   * @returns CORS headers object
   */
  private getCorsHeaders(origin: string): Record<string, string> {
    const isAllowed = this.config.corsOrigins.some((pattern) => {
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        return regex.test(origin);
      }
      return pattern === origin;
    });

    if (isAllowed || origin === "*") {
      return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
    }

    return {};
  }

  /**
   * Get current stream stats
   *
   * @returns Stats object with client count and uptime
   */
  getStats(): { connectedClients: number; uptimeSeconds: number } {
    return {
      connectedClients: this.clients.size,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Cleanup on shutdown
   * Closes all client connections and stops heartbeat
   */
  close(): void {
    log.info("Shutting down EventsStreamManager...");

    // Stop heartbeat
    if (this.heartbeatInterval !== undefined) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    // Unsubscribe from graph events
    this.graphEngine.off("graph_event", this.graphEventListener);

    // Close all client connections
    for (const client of this.clients) {
      client.close().catch(() => {});
    }
    this.clients.clear();

    log.info("EventsStreamManager shutdown complete");
  }
}
