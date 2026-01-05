/**
 * useSSE - Robust SSE hook with auto-reconnection
 *
 * Features:
 * - Exponential backoff (1s → 2s → 4s → ... → 30s max)
 * - Visibility-aware (closes on tab hide, reconnects on show)
 * - Network-aware (pauses when offline, resumes when online)
 * - Heartbeat timeout detection (zombie connection detection)
 * - onReconnected callback for data refresh after reconnection
 * - Max retry limit with callback
 * - Proper cleanup on unmount
 *
 * Extracted from GraphExplorer robust SSE logic.
 */

import { useEffect, useRef } from "preact/hooks";

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 30;
const HEARTBEAT_TIMEOUT = 45_000; // 45s (server sends every 15s, 3x margin)

export interface UseSSEOptions {
  /** SSE endpoint URL */
  url: string;
  /** Event handlers: { "event.type": (data) => void } */
  events: Record<string, (data: unknown) => void>;
  /** Called when connection opens (first time) */
  onOpen?: () => void;
  /** Called after successful reconnection (not first connect) - use to refresh data */
  onReconnected?: () => void;
  /** Called when max retries reached */
  onMaxRetries?: () => void;
  /** Called on each reconnect attempt */
  onReconnect?: (attempt: number) => void;
  /** Disable SSE (e.g., when panel is collapsed) */
  disabled?: boolean;
  /** Heartbeat timeout in ms (default: 45000). Set to 0 to disable. */
  heartbeatTimeout?: number;
}

export function useSSE(options: UseSSEOptions): void {
  const {
    url,
    events,
    onOpen,
    onReconnected,
    onMaxRetries,
    onReconnect,
    disabled = false,
    heartbeatTimeout = HEARTBEAT_TIMEOUT,
  } = options;

  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const isVisibleRef = useRef(true);
  const isOnlineRef = useRef(true);
  const hasConnectedOnceRef = useRef(false); // Track if we've connected before

  useEffect(() => {
    if (typeof window === "undefined" || disabled) return;

    // Initialize refs
    isVisibleRef.current = !document.hidden;
    isOnlineRef.current = navigator.onLine;
    intentionalCloseRef.current = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const clearHeartbeatTimer = () => {
      if (heartbeatTimerRef.current !== null) {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    const resetHeartbeatTimer = () => {
      if (heartbeatTimeout <= 0) return; // Disabled
      clearHeartbeatTimer();
      heartbeatTimerRef.current = setTimeout(() => {
        console.warn("[useSSE] Heartbeat timeout - connection may be dead, reconnecting...");
        closeConnection();
        scheduleReconnect();
      }, heartbeatTimeout) as unknown as number;
    };

    const closeConnection = () => {
      clearHeartbeatTimer();
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (intentionalCloseRef.current) return;
      if (!isVisibleRef.current) return;
      if (!isOnlineRef.current) return;
      if (reconnectTimerRef.current !== null) return;

      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`[useSSE] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
        onMaxRetries?.();
        return;
      }

      reconnectAttemptsRef.current++;
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
        MAX_RECONNECT_DELAY,
      );

      console.log(`[useSSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
      onReconnect?.(reconnectAttemptsRef.current);

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay) as unknown as number;
    };

    const connect = () => {
      if (intentionalCloseRef.current) return;
      if (!isVisibleRef.current) return;
      if (!isOnlineRef.current) return;

      closeConnection();

      try {
        const eventSource = new EventSource(url);
        sseRef.current = eventSource;

        eventSource.onopen = () => {
          const isReconnection = hasConnectedOnceRef.current;
          hasConnectedOnceRef.current = true;
          reconnectAttemptsRef.current = 0;
          resetHeartbeatTimer();

          if (isReconnection) {
            console.log("[useSSE] Reconnected - triggering data refresh");
            onReconnected?.();
          } else {
            console.log("[useSSE] Connected");
            onOpen?.();
          }
        };

        // Register event handlers
        for (const [eventType, handler] of Object.entries(events)) {
          eventSource.addEventListener(eventType, (e: MessageEvent) => {
            // Reset heartbeat timer on any event (proves connection is alive)
            resetHeartbeatTimer();
            try {
              const data = e.data ? JSON.parse(e.data) : undefined;
              handler(data);
            } catch {
              handler(e.data);
            }
          });
        }

        // Also listen for heartbeat events to reset timer
        eventSource.addEventListener("heartbeat", () => {
          resetHeartbeatTimer();
        });

        eventSource.onerror = () => {
          console.warn("[useSSE] Connection error");
          closeConnection();
          scheduleReconnect();
        };
      } catch (err) {
        console.error("[useSSE] Failed to connect:", err);
        scheduleReconnect();
      }
    };

    // Visibility handler
    const handleVisibility = () => {
      const wasVisible = isVisibleRef.current;
      isVisibleRef.current = !document.hidden;

      if (!wasVisible && isVisibleRef.current) {
        // Tab became visible - reconnect
        console.log("[useSSE] Tab visible, reconnecting...");
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
        connect();
      } else if (wasVisible && !isVisibleRef.current) {
        // Tab became hidden - close to save resources
        console.log("[useSSE] Tab hidden, closing connection");
        clearReconnectTimer();
        closeConnection();
      }
    };

    // Network handlers
    const handleOnline = () => {
      console.log("[useSSE] Network online, reconnecting...");
      isOnlineRef.current = true;
      reconnectAttemptsRef.current = 0;
      connect();
    };

    const handleOffline = () => {
      console.log("[useSSE] Network offline, closing connection");
      isOnlineRef.current = false;
      clearReconnectTimer();
      closeConnection();
    };

    // Register listeners
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial connection
    connect();

    // Cleanup
    return () => {
      intentionalCloseRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearReconnectTimer();
      clearHeartbeatTimer();
      closeConnection();
    };
  }, [url, disabled, heartbeatTimeout]); // Re-connect if URL or config changes
}
