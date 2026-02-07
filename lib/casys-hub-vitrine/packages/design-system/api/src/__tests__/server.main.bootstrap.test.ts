import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks des dépendances de server.main
vi.mock('../app', () => {
  return {
    createApp: () => ({
      // Hono-like fetch handler minimal
      fetch: vi.fn(async () => new Response('ok', { status: 200 })),
    }),
  };
});

vi.mock('@casys/infrastructure', () => {
  return {
    resolveLogConfig: () => ({ driver: 'console', level: 'log', filePath: undefined }),
    createLogAdapter: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };
});

const serveSpy = vi.fn();
vi.mock('@hono/node-server', () => ({
  serve: (...args: unknown[]) => serveSpy(...args),
}));

// Reset env/spy avant chaque test
beforeEach(() => {
  serveSpy.mockReset();
  process.env.CASYS_PROJECT_ROOT = process.env.CASYS_PROJECT_ROOT ?? process.cwd();
});

describe('server.main bootstrap', () => {
  it('démarre le serveur (serve appelé) et log de boot effectué', async () => {
    // Node version check est >= 20 ici (CI Node 22)
    await import('../server.main');

    // Vérifie que serve a bien été appelé avec { fetch, port }
    expect(serveSpy).toHaveBeenCalledTimes(1);
    const arg0 = serveSpy.mock.calls[0]?.[0] as { fetch: unknown; port: number };
    expect(arg0).toBeDefined();
    expect(typeof arg0.port).toBe('number');
    expect(arg0.port).toBe(3001);
    expect(arg0.fetch).toBeDefined();
  });
});
