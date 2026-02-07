import { serve } from '@hono/node-server';

import { createLogAdapter,resolveLogConfig } from '@casys/infrastructure';

import { appLogger } from './utils/logger';
import { createApp } from './app';

const port = 3001;

// Log de bootstrap: vérifie que l’écriture fichier fonctionne dès le démarrage
const bootLogCfg = resolveLogConfig(process.env);
const bootLogger = createLogAdapter(bootLogCfg, 'Boot');
bootLogger.log('Logging configuration', {
  driver: bootLogCfg.driver,
  level: bootLogCfg.level,
  filePath: bootLogCfg.filePath ?? null,
});

// Audit LangSmith/LangChain (sans secrets) pour diagnostiquer les 403 d'ingestion
try {
  const tracingV2 =
    String(process.env.LANGCHAIN_TRACING_V2 ?? '').toLowerCase() === 'true' ||
    String(process.env.LANGSMITH_TRACING ?? '').toLowerCase() === 'true';
  const endpoint = process.env.LANGCHAIN_ENDPOINT ?? process.env.LANGSMITH_ENDPOINT ?? null;
  const project = process.env.LANGCHAIN_PROJECT ?? process.env.LANGSMITH_PROJECT ?? null;
  const apiKeyPresent = Boolean(process.env.LANGCHAIN_API_KEY ?? process.env.LANGSMITH_API_KEY);
  const regionHint = endpoint?.includes('eu') ? 'eu' : endpoint ? 'us_or_custom' : 'unset';

  bootLogger.log('LangSmith/LangChain tracing audit', {
    tracingV2,
    endpoint: endpoint ?? 'unset',
    project: project ?? 'unset',
    apiKeyPresent,
    regionHint,
  });
} catch (e) {
  bootLogger.warn('LangSmith audit failed', e);
}

try {
  const app = createApp();

  // Garde runtime Node >= 20 (fail-fast)
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
    throw new Error(`[Server] Node.js >= 20 requis. Version détectée: ${process.versions.node}`);
  }

  // Fail-fast si variable critique absente
  if (!process.env.CASYS_PROJECT_ROOT) {
    throw new Error('[Server] CASYS_PROJECT_ROOT manquant. Définissez-la dans le .env racine.');
  }

  serve({
    fetch: app.fetch,
    port,
  });
  appLogger.log(`HTTP server listening on http://localhost:${port}`);
} catch (err) {
  try {
    bootLogger.error('[Server] Startup failure', {
      name: (err as Error)?.name,
      message: (err as Error)?.message,
      stack: (err as Error)?.stack,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Server] Startup failure (logging failed)', e);
  }
  throw err;
}
