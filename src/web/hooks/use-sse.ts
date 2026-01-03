/**
 * useSSE - Robust SSE hook with auto-reconnection
 *
 * Features:
 * - Exponential backoff (1s → 2s → 4s → ... → 30s max)
 * - Visibility-aware (closes on tab hide, reconnects on show)
 * - Network-aware (pauses when offline, resumes when online)
 * - Max retry limit with callback
 * - Proper cleanup on unmount
 *
 * Extracted from GraphExplorer robust SSE logic.
 */

import { useEffect, useRef } from "preact/hooks";

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 30;

export interface UseSSEOptions {
  /** SSE endpoint URL */
  url: string;
  /** Event handlers: { "event.type": (data) => void } */
  events: Record<string, (data: unknown) => void>;
  /** Called when connection opens */
  onOpen?: () => void;
  /** Called when max retries reached */
  onMaxRetries?: () => void;
  /** Called on each reconnect attempt */
  onReconnect?: (attempt: number) => void;
  /** Disable SSE (e.g., when panel is collapsed) */
  disabled?: boolean;
}

export function useSSE(options: UseSSEOptions): void {
  const { url, events, onOpen, onMaxRetries, onReconnect, disabled = false } = options;

  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const isVisibleRef = useRef(true);
  const isOnlineRef = useRef(true);

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

    const closeConnection = () => {
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
          console.log("[useSSE] Connected");
          reconnectAttemptsRef.current = 0;
          onOpen?.();
        };

        // Register event handlers
        for (const [eventType, handler] of Object.entries(events)) {
          eventSource.addEventListener(eventType, (e: MessageEvent) => {
            try {
              const data = e.data ? JSON.parse(e.data) : undefined;
              handler(data);
            } catch {
              handler(e.data);
            }
          });
        }

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
      closeConnection();
    };
  }, [url, disabled]); // Re-connect if URL changes or disabled toggles
}
