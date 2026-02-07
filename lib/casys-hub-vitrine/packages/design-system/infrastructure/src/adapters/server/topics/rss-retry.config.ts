/**
 * RSS Polling Retry Configuration (Epic 1.1 AC5)
 * Implements exponential backoff: 1s, 5s, 15s
 */

export const RSS_RETRY_CONFIG = {
  maxAttempts: 3,
  backoffDelays: [1000, 5000, 15000], // 1s, 5s, 15s (from PRD FR006)
  circuitBreakerThreshold: 5, // Disable feed after 5 failures
  circuitBreakerResetTime: 60 * 60 * 1000, // 1 hour
} as const;

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = RSS_RETRY_CONFIG.maxAttempts
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < attempts - 1) {
        await delay(RSS_RETRY_CONFIG.backoffDelays[i]);
      }
    }
  }

  throw lastError!;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
