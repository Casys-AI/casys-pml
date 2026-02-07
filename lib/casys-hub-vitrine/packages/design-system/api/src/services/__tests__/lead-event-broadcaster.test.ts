import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeadEventBroadcaster } from '../lead-event-broadcaster';

describe('LeadEventBroadcaster', () => {
  let broadcaster: LeadEventBroadcaster;

  beforeEach(() => {
    broadcaster = new LeadEventBroadcaster();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('emit', () => {
    it('should emit events to subscribed listeners', () => {
      const domain = 'example.com';
      const mockCallback = vi.fn();

      broadcaster.subscribe(domain, mockCallback);
      broadcaster.emit(domain, 'test-event', { message: 'hello' });

      // Should receive the event (plus any cached replays)
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test-event',
          data: JSON.stringify({ message: 'hello' }),
        })
      );
    });

    it('should normalize domain names to lowercase', () => {
      const mockCallback = vi.fn();

      broadcaster.subscribe('Example.COM', mockCallback);
      broadcaster.emit('EXAMPLE.com', 'test-event', { data: 'test' });

      expect(mockCallback).toHaveBeenCalled();
    });

    it('should cache emitted events', () => {
      const domain = 'example.com';

      broadcaster.emit(domain, 'event1', { id: 1 });
      broadcaster.emit(domain, 'event2', { id: 2 });

      const mockCallback = vi.fn();
      broadcaster.subscribe(domain, mockCallback);

      // Should replay both cached events
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ event: 'event1' })
      );
      expect(mockCallback).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ event: 'event2' })
      );
    });

    it('should limit cache size to maxCacheSize', () => {
      const domain = 'example.com';
      const maxSize = 500;

      // Emit more events than cache limit
      for (let i = 0; i < maxSize + 50; i++) {
        broadcaster.emit(domain, `event-${i}`, { index: i });
      }

      const mockCallback = vi.fn();
      broadcaster.subscribe(domain, mockCallback);

      // Should only replay last 500 events
      expect(mockCallback).toHaveBeenCalledTimes(maxSize);
    });

    it('should not fail when emitting to domain with no subscribers', () => {
      expect(() => {
        broadcaster.emit('no-subscribers.com', 'test', { data: 'test' });
      }).not.toThrow();
    });
  });

  describe('subscribe', () => {
    it('should replay cached events on subscription', () => {
      const domain = 'example.com';

      broadcaster.emit(domain, 'cached-event-1', { id: 1 });
      broadcaster.emit(domain, 'cached-event-2', { id: 2 });

      const mockCallback = vi.fn();
      broadcaster.subscribe(domain, mockCallback);

      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should filter out expired events based on TTL', () => {
      const domain = 'example.com';
      const now = 1000000000000; // Fixed timestamp
      const sixMinutesAgo = now - 6 * 60 * 1000; // 6 minutes ago (cache TTL is 5 minutes)

      vi.setSystemTime(sixMinutesAgo);
      broadcaster.emit(domain, 'old-event', { id: 1 });

      vi.setSystemTime(now); // Move to current time
      broadcaster.emit(domain, 'recent-event', { id: 2 });

      const mockCallback = vi.fn();
      broadcaster.subscribe(domain, mockCallback);

      // Should only replay recent event (within 5-minute TTL)
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'recent-event' })
      );
    });

    it('should receive new events after subscription', () => {
      const domain = 'example.com';
      const mockCallback = vi.fn();

      broadcaster.subscribe(domain, mockCallback);
      mockCallback.mockClear(); // Clear initial cached events

      broadcaster.emit(domain, 'new-event', { id: 1 });

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'new-event' })
      );
    });

    it('should call onComplete when done event is received', () => {
      const domain = 'example.com';
      const mockCallback = vi.fn();
      const mockComplete = vi.fn();

      broadcaster.subscribe(domain, mockCallback, mockComplete);
      mockCallback.mockClear();

      broadcaster.emit(domain, 'progress', { step: 1 });
      expect(mockComplete).not.toHaveBeenCalled();

      broadcaster.emit(domain, 'done', { result: 'success' });
      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function', () => {
      const domain = 'example.com';
      const mockCallback = vi.fn();

      const unsubscribe = broadcaster.subscribe(domain, mockCallback);
      mockCallback.mockClear();

      broadcaster.emit(domain, 'before-unsub', { id: 1 });
      expect(mockCallback).toHaveBeenCalled();

      unsubscribe();
      mockCallback.mockClear();

      broadcaster.emit(domain, 'after-unsub', { id: 2 });
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle multiple subscribers for same domain', () => {
      const domain = 'example.com';
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      broadcaster.subscribe(domain, callback1);
      broadcaster.subscribe(domain, callback2);

      callback1.mockClear();
      callback2.mockClear();

      broadcaster.emit(domain, 'multi-sub-event', { id: 1 });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should create separate event streams for different domains', () => {
      const domain1 = 'example1.com';
      const domain2 = 'example2.com';
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      broadcaster.subscribe(domain1, callback1);
      broadcaster.subscribe(domain2, callback2);

      callback1.mockClear();
      callback2.mockClear();

      broadcaster.emit(domain1, 'event-1', { id: 1 });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribe', () => {
      const domain = 'example.com';
      const mockCallback = vi.fn();

      const unsubscribe = broadcaster.subscribe(domain, mockCallback);
      mockCallback.mockClear();

      unsubscribe();

      broadcaster.emit(domain, 'after-unsub', { id: 1 });
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should not affect other subscribers when one unsubscribes', () => {
      const domain = 'example.com';
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = broadcaster.subscribe(domain, callback1);
      broadcaster.subscribe(domain, callback2);

      callback1.mockClear();
      callback2.mockClear();

      unsubscribe1();

      broadcaster.emit(domain, 'test-event', { id: 1 });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should include timestamp in cached events', () => {
      const domain = 'example.com';
      const now = Date.now();
      vi.setSystemTime(now);

      broadcaster.emit(domain, 'timestamped-event', { id: 1 });

      const mockCallback = vi.fn();
      broadcaster.subscribe(domain, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'timestamped-event',
          timestamp: now,
        })
      );
    });

    it('should serialize event data as JSON', () => {
      const domain = 'example.com';
      const complexData = {
        nested: { value: 42 },
        array: [1, 2, 3],
        string: 'test',
      };

      broadcaster.emit(domain, 'complex-event', complexData);

      const mockCallback = vi.fn();
      broadcaster.subscribe(domain, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: JSON.stringify(complexData),
        })
      );
    });

    it('should maintain separate caches for different domains', () => {
      const domain1 = 'example1.com';
      const domain2 = 'example2.com';

      broadcaster.emit(domain1, 'event-1', { domain: 1 });
      broadcaster.emit(domain2, 'event-2', { domain: 2 });

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      broadcaster.subscribe(domain1, callback1);
      broadcaster.subscribe(domain2, callback2);

      // Each domain should only receive its own cached events
      expect(callback1).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'event-1' })
      );
      expect(callback2).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'event-2' })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle subscribing to domain with no previous events', () => {
      const domain = 'new-domain.com';
      const mockCallback = vi.fn();

      expect(() => {
        broadcaster.subscribe(domain, mockCallback);
      }).not.toThrow();

      // Should not receive any cached events
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle empty event data', () => {
      const domain = 'example.com';
      const mockCallback = vi.fn();

      broadcaster.subscribe(domain, mockCallback);
      mockCallback.mockClear();

      expect(() => {
        broadcaster.emit(domain, 'empty-event', {});
      }).not.toThrow();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'empty-event',
          data: '{}',
        })
      );
    });

    it('should handle special characters in domain names', () => {
      const domain = 'ex-ample_123.com';
      const mockCallback = vi.fn();

      broadcaster.subscribe(domain, mockCallback);
      mockCallback.mockClear();

      broadcaster.emit(domain, 'test', { id: 1 });
      expect(mockCallback).toHaveBeenCalled();
    });
  });
});
