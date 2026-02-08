/**
 * Shared Deno KV singleton for all application modules
 *
 * Uses a lazy singleton pattern to avoid connection leaks.
 * All modules needing KV (auth, workflow state, cache) should use getKv().
 *
 * Story 11.0: Moved from src/server/auth/kv.ts for shared access.
 *
 * @module cache/kv
 */

let _kv: Deno.Kv | null = null;

/**
 * Get shared Deno KV instance (singleton)
 * Lazily initialized on first call.
 *
 * @returns Shared Deno KV instance
 */
export async function getKv(): Promise<Deno.Kv> {
  if (!_kv) {
    _kv = await Deno.openKv();
  }
  return _kv;
}

/**
 * Close KV connection (for graceful shutdown/tests)
 */
export function closeKv(): void {
  if (_kv) {
    _kv.close();
    _kv = null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSS-PROCESS EVENT SIGNALING (Story 7.6+)
// ══════════════════════════════════════════════════════════════════════════════

/** KV key for cross-process event signals */
const EVENT_SIGNAL_KEY = ["pml", "events", "signal"];

/** Event signal structure for cross-process communication */
export interface EventSignal {
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

/**
 * Signal an event across processes via KV.
 * Called by algorithm-tracer when new traces are logged.
 */
export async function signalEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const kv = await getKv();
  const signal: EventSignal = {
    type: eventType,
    timestamp: Date.now(),
    payload,
  };
  await kv.set(EVENT_SIGNAL_KEY, signal);
}

/**
 * Watch for cross-process event signals.
 * Returns an async iterator that yields events when they occur.
 */
export async function* watchEvents(): AsyncGenerator<EventSignal> {
  const kv = await getKv();
  const stream = kv.watch([EVENT_SIGNAL_KEY]);

  for await (const entries of stream) {
    const entry = entries[0];
    if (entry.value && entry.versionstamp) {
      yield entry.value as EventSignal;
    }
  }
}
