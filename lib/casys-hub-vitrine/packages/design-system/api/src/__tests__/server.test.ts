import { describe, expect, it } from 'vitest';

import { createApp } from '../app';

describe('API server (app)', () => {
  // enableInfra: true pour que l'app soit complète (middleware infra + application)
  const app = createApp({ enableInfra: true });
  
  it('GET /health -> 200 and payload shape', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('status');
    expect(['partial', 'degraded']).toContain(json.status); // Can be 'partial' or 'degraded'
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('useCases');
    expect(json).toHaveProperty('infrastructure');
  });

  it('GET /__unknown -> 404', async () => {
    const res = await app.request('/__unknown');
    expect(res.status).toBe(404);
  });
});
