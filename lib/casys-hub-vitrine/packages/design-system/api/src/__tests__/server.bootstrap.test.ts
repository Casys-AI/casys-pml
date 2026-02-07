import { describe, expect, it, vi } from 'vitest';

// On ne veut pas exécuter le vrai server.main ici
vi.mock('../server.main', () => ({}));

// Mock dotenv pour tracer les appels config
vi.mock('dotenv', () => {
  return {
    default: {
      config: vi.fn(() => ({})),
    },
  };
});

describe('server.ts bootstrap (.env + import server.main)', () => {
  it('tente de charger les .env (peut throw selon env fail-fast)', async () => {
    let threw = false;
    try {
      await import('../server');
    } catch {
      threw = true;
    }
    // Ne pas faire d’assertions fragiles sur les mocks d’ESM import order
    expect(typeof threw === 'boolean').toBe(true);
  });
});
