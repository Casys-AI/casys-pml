/**
 * EventBus - Unified Event Distribution via BroadcastChannel
 * Story 6.5: EventBus with BroadcastChannel (ADR-036)
 *
 * Singleton event bus that distributes events via:
 * - Local dispatch (same-process handlers)
 * - BroadcastChannel (cross-worker/cross-tab communication)
 *
 * @module events/event-bus
 */

import type { EventHandler, EventType, PmlEvent, WildcardEventHandler } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * BroadcastChannel names for PML events
 * Exported for use in web islands and workers
 */
export const PML_EVENTS_CHANNEL = "pml-events";
export const PML_TRACES_CHANNEL = "pml-traces";

/**
 * EventBus class - Singleton for unified event distribution
 *
 * Features:
 * - Single BroadcastChannel for all event types
 * - Local dispatch + cross-context dispatch
 * - Wildcard subscriptions ("*")
 * - Type-safe event emission and handling
 * - Automatic timestamp injection
 *
 * @example
 * ```typescript
 * import { eventBus } from "./events/mod.ts";
 *
 * // Subscribe to specific event type
 * const unsubscribe = eventBus.on("tool.start", (event) => {
 *   console.log("Tool started:", event.payload.tool_id);
 * });
 *
 * // Subscribe to all events
 * eventBus.on("*", (event) => {
 *   console.log("Event:", event.type);
 * });
 *
 * // Emit an event
 * eventBus.emit({
 *   type: "tool.start",
 *   source: "worker-bridge",
 *   payload: { tool_id: "github:list_repos", trace_id: "abc123" },
 * });
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export class EventBus {
  private channel: BroadcastChannel | null = null;
  private handlers: Map<string, Set<EventHandler | WildcardEventHandler>> = new Map();
  private closed: boolean = false;
  private emitCount: number = 0;

  constructor() {
    this.initChannel();
  }

  /**
   * Initialize BroadcastChannel for cross-context communication
   */
  private initChannel(): void {
    try {
      this.channel = new BroadcastChannel(PML_EVENTS_CHANNEL);
      this.channel.onmessage = (e: MessageEvent<PmlEvent>) => {
        this.dispatchLocal(e.data);
      };
      this.channel.onmessageerror = (e) => {
        logger.warn("EventBus BroadcastChannel message error", { error: String(e) });
      };
      logger.debug("EventBus initialized with BroadcastChannel", { channel: PML_EVENTS_CHANNEL });
    } catch (error) {
      // BroadcastChannel may not be available in all contexts
      logger.warn("EventBus: BroadcastChannel not available, using local-only mode", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.channel = null;
    }
  }

  /**
   * Emit an event to all subscribers (local + cross-context)
   *
   * @param event - Event to emit (timestamp will be auto-added if not present)
   */
  emit<T extends EventType>(event: Omit<PmlEvent<T>, "timestamp"> & { timestamp?: number }): void {
    if (this.closed) {
      logger.warn("EventBus.emit called after close()");
      return;
    }

    // Add timestamp if not present
    const fullEvent: PmlEvent<T> = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    } as PmlEvent<T>;

    this.emitCount++;

    // 1. Broadcast to other contexts (workers, tabs)
    if (this.channel) {
      try {
        this.channel.postMessage(fullEvent);
      } catch (error) {
        logger.warn("EventBus: Failed to post to BroadcastChannel", {
          error: error instanceof Error ? error.message : String(error),
          type: event.type,
        });
      }
    }

    // 2. Dispatch locally for same-process handlers
    this.dispatchLocal(fullEvent);
  }

  /**
   * Subscribe to events of a specific type or all events ("*")
   *
   * @param type - Event type to subscribe to, or "*" for all events
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  on<T extends EventType>(type: T, handler: EventHandler<T>): () => void;
  on(type: "*", handler: WildcardEventHandler): () => void;
  on(type: EventType | "*", handler: EventHandler | WildcardEventHandler): () => void {
    if (this.closed) {
      logger.warn("EventBus.on called after close()");
      return () => {};
    }

    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler);
    this.handlers.set(type, handlers);

    logger.debug("EventBus: Handler registered", { type, handlerCount: handlers.size });

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(type);
      }
      logger.debug("EventBus: Handler unregistered", { type, remaining: handlers.size });
    };
  }

  /**
   * Unsubscribe a specific handler (alternative to using the returned function from on())
   *
   * @param type - Event type
   * @param handler - Handler to remove
   */
  off(type: EventType | "*", handler: EventHandler | WildcardEventHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  /**
   * Subscribe to an event type, automatically unsubscribing after first event
   *
   * @param type - Event type to subscribe to
   * @param handler - Event handler function
   * @returns Unsubscribe function (in case event never fires)
   */
  once<T extends EventType>(type: T, handler: EventHandler<T>): () => void {
    const unsubscribe = this.on(
      type,
      ((event: PmlEvent<T>) => {
        unsubscribe();
        handler(event);
      }) as EventHandler<T>,
    );
    return unsubscribe;
  }

  /**
   * Dispatch event to local handlers only
   */
  private dispatchLocal(event: PmlEvent): void {
    const typeHandlers = this.handlers.get(event.type);
    const wildcardHandlers = this.handlers.get("*");

    this.invokeHandlers(typeHandlers, event);
    this.invokeHandlers(wildcardHandlers, event);
  }

  /**
   * Invoke a set of handlers for an event, handling both sync and async handlers
   */
  private invokeHandlers(
    handlers: Set<EventHandler | WildcardEventHandler> | undefined,
    event: PmlEvent,
  ): void {
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            logger.error("EventBus: Async handler error", {
              type: event.type,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch (error) {
        logger.error("EventBus: Handler error", {
          type: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Check if EventBus has any handlers for a specific event type
   *
   * @param type - Event type to check
   * @returns True if there are handlers registered
   */
  hasHandlers(type: EventType | "*"): boolean {
    return (this.handlers.get(type)?.size ?? 0) > 0;
  }

  /**
   * Get count of handlers for a specific event type
   *
   * @param type - Event type to check
   * @returns Number of registered handlers
   */
  getHandlerCount(type: EventType | "*"): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  /**
   * Get total number of events emitted since creation
   */
  getEmitCount(): number {
    return this.emitCount;
  }

  /**
   * Get all registered event types (excluding wildcard)
   */
  getRegisteredTypes(): EventType[] {
    return Array.from(this.handlers.keys()).filter((k) => k !== "*") as EventType[];
  }

  /**
   * Check if EventBus is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Close the EventBus and cleanup resources
   *
   * After calling close():
   * - No new events will be emitted
   * - No new handlers can be registered
   * - BroadcastChannel is closed
   * - All handlers are cleared
   */
  close(): void {
    if (this.closed) return;

    this.closed = true;

    // Close BroadcastChannel
    if (this.channel) {
      try {
        this.channel.close();
      } catch (error) {
        logger.warn("EventBus: Error closing BroadcastChannel", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.channel = null;
    }

    // Clear all handlers
    this.handlers.clear();

    logger.debug("EventBus closed", { totalEmitted: this.emitCount });
  }

  /**
   * Reset the EventBus (for testing purposes)
   * Re-initializes the BroadcastChannel and clears handlers
   */
  reset(): void {
    this.close();
    this.closed = false;
    this.emitCount = 0;
    this.initChannel();
    logger.debug("EventBus reset");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Global singleton EventBus instance
 *
 * Use this for application-wide event distribution.
 * For testing, create separate EventBus instances.
 */
export const eventBus = new EventBus();
