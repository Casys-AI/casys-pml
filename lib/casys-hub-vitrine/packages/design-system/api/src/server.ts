// Charger les variables d'environnement: root d'abord, puis local API (override)
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 1) Mode dev strip-types (exécuté depuis src/): CWD = packages/api → racine = ../../
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
// 2) Mode dist (exécuté depuis dist/): packages/api/dist → racine = ../../../
dotenv.config({ path: resolve(__dirname, '../../../.env') });
// 3) .env local du cwd en dernier pour override local
dotenv.config();

// Bootstrap uniquement: charge .env puis démarre le serveur réel via import dynamique

// Handlers d'erreurs runtime pour éviter les exits silencieux en dev (tsx)
process.on('uncaughtException', err => {
  try {
    // eslint-disable-next-line no-console
    console.error('[API][uncaughtException]', err);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[API][uncaughtException][fallback]', e);
  }
});
process.on('unhandledRejection', reason => {
  try {
    // eslint-disable-next-line no-console
    console.error('[API][unhandledRejection]', reason);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[API][unhandledRejection][fallback]', e);
  }
});

// Avertissements Node (deprecations, etc.) utiles en dev
process.on('warning', warning => {
  try {
    // eslint-disable-next-line no-console
    console.warn('[API][warning]', warning.name, warning.message, warning.stack);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[API][warning][fallback]', e);
  }
});

// Log explicite à la sortie du process (utile quand tsx affiche seulement "Failed running")
process.on('exit', code => {
  try {
    // eslint-disable-next-line no-console
    console.error('[API][exit] code=', code);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[API][exit][fallback]', e);
  }
});

// Graceful shutdown - Awilix container dispose is handled automatically
const shutdownOnce = (() => {
  let called = false;
  return async (signal: string) => {
    if (called) return;
    called = true;
    try {
      // eslint-disable-next-line no-console
      console.error(`[API] ${signal} received, shutting down...`);
      // Awilix container cleanup happens automatically via disposers
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[API] shutdown error', e);
    } finally {
      // Allow tsx to exit promptly
      process.exit(0);
    }
  };
})();

process.on('SIGINT', () => void shutdownOnce('SIGINT'));
process.on('SIGTERM', () => void shutdownOnce('SIGTERM'));

// Démarrer le serveur réel après chargement des ENV
await import('./server.main');
