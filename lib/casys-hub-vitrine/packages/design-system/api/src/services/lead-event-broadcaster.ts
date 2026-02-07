import { EventEmitter } from 'node:events';

import { createLogger } from '../utils/logger';

const logger = createLogger('LeadEventBroadcaster');

interface LeadEvent {
  event: string;
  data: string;
  timestamp: number;
}

/**
 * In-memory event broadcaster for Lead Analysis streaming.
 * Allows fire-and-forget analysis launch from Hero, with EventSource replay on /lead page.
 */
export class LeadEventBroadcaster {
  private emitters = new Map<string, EventEmitter>();
  private eventCache = new Map<string, LeadEvent[]>();
  private readonly maxCacheSize = 500; // Max events to cache per domain
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Emit an event for a specific domain
   */
  emit(domain: string, event: string, data: unknown): void {
    const normalizedDomain = domain.toLowerCase();
    const eventData: LeadEvent = {
      event,
      data: JSON.stringify(data),
      timestamp: Date.now(),
    };

    // Add to cache
    if (!this.eventCache.has(normalizedDomain)) {
      this.eventCache.set(normalizedDomain, []);
    }
    const cache = this.eventCache.get(normalizedDomain)!;
    cache.push(eventData);

    // Trim cache if too large
    if (cache.length > this.maxCacheSize) {
      cache.shift();
    }

    // Emit to all listeners
    const emitter = this.emitters.get(normalizedDomain);
    if (emitter) {
      emitter.emit('event', eventData);
      logger.debug('[emit]', {
        domain: normalizedDomain,
        event,
        listenerCount: emitter.listenerCount('event'),
      });
    }
  }

  /**
   * Subscribe to events for a domain.
   * Replays cached events first, then streams new ones.
   */
  subscribe(
    domain: string,
    onEvent: (event: LeadEvent) => void,
    onComplete?: () => void
  ): () => void {
    const normalizedDomain = domain.toLowerCase();

    // Create emitter if doesn't exist
    if (!this.emitters.has(normalizedDomain)) {
      this.emitters.set(normalizedDomain, new EventEmitter());
      this.emitters.get(normalizedDomain)!.setMaxListeners(100);
    }

    const emitter = this.emitters.get(normalizedDomain)!;

    // Replay cached events
    const cache = this.eventCache.get(normalizedDomain) || [];
    const recentCache = cache.filter(e => Date.now() - e.timestamp < this.cacheTTL);

    logger.debug('[subscribe]', {
      domain: normalizedDomain,
      cachedEvents: cache.length,
      recentEvents: recentCache.length,
    });

    // Send cached events
    for (const evt of recentCache) {
      onEvent(evt);
    }

    // Listen for new events
    const listener = (evt: LeadEvent) => {
      onEvent(evt);

      // If 'done' event, call onComplete
      if (evt.event === 'done' && onComplete) {
        onComplete();
      }
    };

    emitter.on('event', listener);

    // Return unsubscribe function
    return () => {
      emitter.off('event', listener);
      logger.debug('[unsubscribe]', {
        domain: normalizedDomain,
        remainingListeners: emitter.listenerCount('event'),
      });

      // Cleanup if no more listeners
      if (emitter.listenerCount('event') === 0) {
        this.emitters.delete(normalizedDomain);

        // Clear cache after delay
        setTimeout(() => {
          if (!this.emitters.has(normalizedDomain)) {
            this.eventCache.delete(normalizedDomain);
            logger.debug('[cleanup]', { domain: normalizedDomain });
          }
        }, this.cacheTTL);
      }
    };
  }

  /**
   * Check if an analysis is currently running for a domain
   */
  isRunning(domain: string): boolean {
    const normalizedDomain = domain.toLowerCase();
    return (
      this.emitters.has(normalizedDomain) &&
      this.emitters.get(normalizedDomain)!.listenerCount('event') > 0
    );
  }

  /**
   * Clear all data for a domain
   */
  clear(domain: string): void {
    const normalizedDomain = domain.toLowerCase();
    this.emitters.delete(normalizedDomain);
    this.eventCache.delete(normalizedDomain);
    logger.debug('[clear]', { domain: normalizedDomain });
  }
}

// Singleton instance
export const leadEventBroadcaster = new LeadEventBroadcaster();
