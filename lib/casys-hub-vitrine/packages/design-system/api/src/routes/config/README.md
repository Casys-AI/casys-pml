# Routes Config

Gestion de la configuration utilisateur/projet exposée via l’API.

## Préfixe
- `/api/config`

## Endpoints
- GET `/users` → liste des utilisateurs configurés
- GET `/users/:userId` → `UserConfig`
- PUT `/users/:userId` → enregistre une `UserConfig`
- GET `/users/:userId/projects` → liste des projets d’un utilisateur
- GET `/users/:userId/projects/:projectId` → `ProjectConfig`
- PUT `/users/:userId/projects/:projectId` → enregistre une `ProjectConfig`

## Conventions
- Fail-fast: si `configReader` indisponible → 500 explicite
- Mappage d’erreurs → codes:
  - 404 (not found/missing)
  - 400 (invalid/format/schema)
  - 500 (autres)
- Typage Hono via `src/types/hono-context.d.ts` (clé: `configReader`)

## Notes
- La lecture/écriture est orchestrée par l’adapteur `configReader` injecté par `infrastructure.middleware.ts` puis relayé par `application.middleware.ts`.
- Les schémas précis des configs sont fournis par `@casys/shared`.
