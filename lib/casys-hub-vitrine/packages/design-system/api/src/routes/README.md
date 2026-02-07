# Routes API

Conventions et structure des routes, organisées par domaine.

## Conventions
- Préfixe global API: `/api/*`
- Injection de dépendances via middlewares Hono (`c.set()`, `c.get()`). Typage centralisé dans `src/types/hono-context.d.ts`.
- Ordre de montage des sous-routeurs important: routes spécifiques avant les patterns génériques.
- Fail-fast: remonter 400 (validation) / 500 (service indisponible) de manière explicite.

## Sous-domaines
- `content/` — génération (SSE), indexation, listing
- `components/` — génération de composants depuis commentaires, indexation, listing
- `config/` — accès et édition de configuration utilisateur/projet
- `projects.ts` — lecture de projets disponibles

## Tests
- Tests SSE: `src/routes/__tests__/content-generate.sse.test.ts`
- Tests API unitaires/integ présents sous `src/routes/__tests__/`

## Legacy
- Les flux WebSocket et l’ancienne route `articles-streaming` sont deprecated/remplacés par SSE (`/api/content/generate`).
