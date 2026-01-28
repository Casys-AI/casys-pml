/**
 * useFetch - Robust fetch hook with AbortController and automatic retry
 *
 * Features:
 * - AbortController automatically cancels previous fetches (prevents race conditions)
 * - Properly manages isLoading state (always false after success, even during refresh)
 * - Configurable retry with exponential backoff
 * - Ignores AbortError (voluntary cancellation)
 * - isRefreshing state for distinguishing initial load vs refresh
 *
 * Created to fix reconnection issues where:
 * 1. Concurrent fetches could race and override each other
 * 2. silent=true mode never reset isLoading to false
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY = 1000;

export interface UseFetchOptions<T> {
  /** Fetch function that receives AbortSignal and returns data */
  fetcher: (signal: AbortSignal) => Promise<T>;
  /** Dependencies that trigger refetch when changed */
  deps?: unknown[];
  /** Maximum retry attempts (default: 5) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelay?: number;
  /** Called on successful fetch */
  onSuccess?: (data: T) => void;
  /** Called on fetch error (after all retries exhausted) */
  onError?: (error: Error) => void;
  /** Disable automatic fetching */
  disabled?: boolean;
}

export interface UseFetchResult<T> {
  /** Fetched data (null until first successful fetch) */
  data: T | null;
  /** Error from last failed fetch attempt (null if successful) */
  error: Error | null;
  /** True during first load (when data is null) */
  isLoading: boolean;
  /** True during refresh (when data already exists) */
  isRefreshing: boolean;
  /** Manually trigger a refetch */
  refetch: () => void;
}

export function useFetch<T>(options: UseFetchOptions<T>): UseFetchResult<T> {
  const {
    fetcher,
    deps = [],
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelay = DEFAULT_BASE_DELAY,
    onSuccess,
    onError,
    disabled = false,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!disabled);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Ref to track if we've loaded data at least once
  const hasDataRef = useRef(false);
  // Ref to current abort controller
  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to track retry timeout
  const retryTimeoutRef = useRef<number | null>(null);
  // Ref to track if component is mounted
  const isMountedRef = useRef(true);

  const doFetch = useCallback(async (retryCount = 0) => {
    // Cancel any previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Clear any pending retry
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Create new abort controller for this fetch
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Set loading state
    if (hasDataRef.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    if (retryCount === 0) {
      setError(null);
    }

    try {
      const result = await fetcher(controller.signal);

      // Check if this fetch was aborted (another fetch started)
      if (controller.signal.aborted) {
        return;
      }

      // Check if component is still mounted
      if (!isMountedRef.current) {
        return;
      }

      hasDataRef.current = true;
      setData(result);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      onSuccess?.(result);
    } catch (err) {
      // Ignore AbortError (voluntary cancellation)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      // Check if component is still mounted
      if (!isMountedRef.current) {
        return;
      }

      console.warn(`[useFetch] Fetch error (attempt ${retryCount + 1}/${maxRetries + 1}):`, err);

      // Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`[useFetch] Retrying in ${delay}ms...`);
        retryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            doFetch(retryCount + 1);
          }
        }, delay) as unknown as number;
        return;
      }

      // All retries exhausted
      const fetchError = err instanceof Error ? err : new Error(String(err));
      setError(fetchError);
      setIsLoading(false);
      setIsRefreshing(false);
      onError?.(fetchError);
    }
  }, [fetcher, maxRetries, baseDelay, onSuccess, onError]);

  // Effect to fetch on mount and when deps change
  useEffect(() => {
    isMountedRef.current = true;

    if (!disabled) {
      doFetch();
    }

    return () => {
      isMountedRef.current = false;
      // Abort any in-flight fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear any pending retry
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [disabled, ...deps]);

  // Manual refetch function
  const refetch = useCallback(() => {
    if (!disabled) {
      doFetch();
    }
  }, [disabled, doFetch]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refetch,
  };
}
