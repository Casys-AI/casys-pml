# Logging Adapter

## Objet

Implémente `LoggerPort` et expose un logger config-driven (console/pino, sinks).

## Fichiers clés

- `log.adapter.ts` — adaptation du logger
- `__tests__/log.adapter.test.ts` — tests unitaires

## Intégration

- L’API crée le logger via une fabrique Infrastructure et l’injecte (middlewares Hono) vers Application.
- Application reste indépendante de l’implémentation (Hexa/DDD).

## Bonnes pratiques

- Contexte injecté (composant/service) dans les logs
- Pas d’effets globaux; tout est DI-friendly
