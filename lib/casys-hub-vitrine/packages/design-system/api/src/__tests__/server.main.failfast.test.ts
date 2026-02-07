import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks
vi.mock('../app', () => ({ createApp: () => ({ fetch: vi.fn() }) }));

const bootLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@casys/infrastructure', () => ({
  resolveLogConfig: () => ({ driver: 'console', level: 'log', filePath: undefined }),
  createLogAdapter: () => bootLogger,
}));

const serveSpy = vi.fn();
vi.mock('@hono/node-server', () => ({ serve: (...args: unknown[]) => serveSpy(...args) }));

beforeEach(() => {
  serveSpy.mockReset();
  bootLogger.error.mockReset();
});

describe('server.main fail-fast', () => {
  it('throw si CASYS_PROJECT_ROOT manquant (fail-fast) et logge une erreur', async () => {
    const prev = process.env.CASYS_PROJECT_ROOT;
    delete process.env.CASYS_PROJECT_ROOT;

    let threw = false;
    try {
      await import('../server.main');
    } catch {
      threw = true;
    } finally {
      if (prev) process.env.CASYS_PROJECT_ROOT = prev;
    }

    expect(threw).toBe(true);
    expect(serveSpy).not.toHaveBeenCalled();
    expect(bootLogger.error).toHaveBeenCalled();
  });
});
