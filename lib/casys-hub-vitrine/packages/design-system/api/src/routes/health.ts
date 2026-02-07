import { Hono } from 'hono';

const app = new Hono();

/**
 * GET /health - Health check endpoint
 * Affiche l'état de tous les use cases et leurs dépendances
 */
app.get('/', async c => {
  const useCases = c.get('useCases');
  const infraServices = c.get('infraServices');

  // Analyser chaque use case
  const ucStatus = Object.entries(useCases || {}).map(([name, useCase]) => {
    const isEnabled = useCase && typeof useCase === 'object' && useCase.constructor.name !== 'Object';
    
    return {
      name,
      enabled: isEnabled,
      className: isEnabled ? (useCase as { constructor: { name: string } }).constructor.name : 'undefined',
    };
  });

  // Analyser les services infra disponibles
  const infraStatus = {
    total: Object.keys(infraServices || {}).length,
    services: Object.keys(infraServices || {}),
  };

  const enabledCount = ucStatus.filter(uc => uc.enabled).length;
  const disabledCount = ucStatus.filter(uc => !uc.enabled).length;

  return c.json({
    status: enabledCount > 0 ? 'partial' : 'degraded',
    timestamp: new Date().toISOString(),
    useCases: {
      total: ucStatus.length,
      enabled: enabledCount,
      disabled: disabledCount,
      details: ucStatus,
    },
    infrastructure: infraStatus,
  });
});

export default app;
