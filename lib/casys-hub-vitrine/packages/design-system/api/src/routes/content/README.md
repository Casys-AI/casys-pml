# Routes Content

Sous-domaine de l’API dédié aux articles: génération (SSE), indexation et listing.

## Sommaire
- SSE: `/api/content/generate`
- Indexation: `/api/content/articles*`
- Listing: `/api/content/articles*`

## SSE — POST `/api/content/generate`
- Flux Server-Sent Events relayant les événements applicatifs (fail-fast, pas de fallback).
- Événements:
  - `progress` (status/heartbeat)
  - `outline_indexed` → émet aussi `sections_total { total }`
  - `section_started`, `section_indexed`, `section_completed`
  - `article_published`, `seo_post_eval_todo`
  - `result`, `done`, `error`

Exemple cURL (connexion SSE):

```bash
curl -N -H 'Content-Type: application/json' \
  -X POST http://localhost:3001/api/content/generate \
  -d '{
    "articles": [{ "articleId":"a1", "articleTitle":"Titre", "relevanceScore":0.8 }],
    "keywords": ["kia"],
    "language": "fr",
    "tenantId": "t1",
    "projectId": "p1"
  }'
```

## Indexation Articles
- POST `/api/content/articles` → payload: `{ articles: [...], tenantId?, projectId? }`
- POST `/api/content/articles/global` → indexation du catalogue global
- POST `/api/content/articles/tenant/:tenantId`
- POST `/api/content/articles/project/:tenantId/:projectId`
- POST `/api/content/articles/:articleId`

Réponses standard via `shared.dtos.api.createResponse(success, data, message)`.

## Listing Articles
- GET `/api/content/articles` (global)
- GET `/api/content/articles/with-meta`
- GET `/api/content/articles/tenant/:tenantId`
- GET `/api/content/articles/project/:tenantId/:projectId`
- GET `/api/content/articles/:articleId`
- GET `/api/content/articles/details/:articleId`

## Conventions
- Validation: Zod via `@hono/zod-validator` ou parse explicite.
- DI: services injectés via middlewares; utiliser `c.get('listArticlesUseCase')`, `c.get('indexArticlesUseCase')`, etc.
- Typage Hono: centralisé dans `src/types/hono-context.d.ts`.
