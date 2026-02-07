import { describe, expect, it } from 'vitest';

import { createApp } from '../app';

describe('API /health (smoke)', () => {
  // enableInfra: true pour tester l'app complète
  const app = createApp({ enableInfra: true });
  
  it('GET /health -> 200 + payload minimal', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    // Status can be 'partial' or 'degraded' depending on infrastructure availability
    expect(['partial', 'degraded']).toContain(json.status);
    expect(json.timestamp).toBeTypeOf('string');
    expect(json).toHaveProperty('useCases');
    expect(json).toHaveProperty('infrastructure');
  });
});
