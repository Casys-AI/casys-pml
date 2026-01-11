/**
 * Timeout Handler
 *
 * Wraps promises with timeout functionality for sandbox execution.
 *
 * @module sandbox/execution/timeout-handler
 */

/**
 * Timeout error thrown when operation exceeds time limit.
 */
export class TimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Timeout handler for wrapping async operations.
 *
 * @example
 * ```ts
 * const handler = new TimeoutHandler();
 *
 * // Will reject if promise doesn't resolve in 5 seconds
 * const result = await handler.wrap(
 *   someAsyncOperation(),
 *   5000,
 *   "Database query"
 * );
 * ```
 */
export class TimeoutHandler {
  /**
   * Wrap a promise with a timeout.
   *
   * @param promise - The promise to wrap
   * @param timeoutMs - Timeout in milliseconds
   * @param operation - Description of the operation (for error messages)
   * @returns The promise result if it completes in time
   * @throws TimeoutError if timeout is exceeded
   */
  wrap<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation = "Operation",
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new TimeoutError(operation, timeoutMs));
        }
      }, timeoutMs);

      promise
        .then((result) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        });
    });
  }

  /**
   * Create a race between a promise and a timeout.
   *
   * Unlike wrap(), this does NOT clear the timer when the promise resolves.
   * Use this when you want to enforce a hard deadline.
   *
   * @param promise - The promise to race
   * @param timeoutMs - Timeout in milliseconds
   * @param operation - Description of the operation (for error messages)
   * @returns The promise result if it completes in time
   * @throws TimeoutError if timeout is exceeded
   */
  race<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation = "Operation",
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(operation, timeoutMs));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }
}

/**
 * Default timeout handler instance.
 */
export const timeoutHandler = new TimeoutHandler();
