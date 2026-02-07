# @casys/api

API Hono (Node 22, TS 5.x) exposant des endpoints REST/SSE au-dessus des use cases et services de l’application. DI via middlewares Hono, respect strict de l’architecture hexagonale.

## Sommaire
- Middlewares de DI (shared → infrastructure → core → application)
- Routes stables
- Streaming SSE (supporté)
- Helpers Hono (ctxSet/ctxGet)
- Tests et run

## Middlewares

Les middlewares composent l’injection de dépendances. Ils stockent/consomment les services dans le contexte via les helpers Hono:

- `ctxSet(c, key, value)` et `ctxGet(c, key)` (typage strict sur `ContextVariableMap`)
- `ctxSetUnsafe(c, key: string, value: unknown)` pour les injections dynamiques de tests

- `src/middleware/infrastructure.middleware.ts`
  - Expose les adapteurs techniques (DB Kùzu, FS, GitHub, frontmatter, image, etc.).
  - SEO providers: DataForSEO seulement (SERP et Trends) via `googleScraping` et `googleTrends`.
- `src/middleware/application.middleware.ts`
  - Récupère les services d’infra (`c.get`) et les passe au container applicatif (`createApplicationServices`).
  - Injecte les use cases et agents (`generateArticleLinearUseCase`, `ComponentGeneratorAgent`, `SectionWriterAgent`, etc.).
- `src/middleware/core.middleware.ts`
  - Compose les services métiers (ex: `ArticleStructureSearchService`, `ComponentUsageService`, `ComponentVectorSearchService`).
- `src/middleware/shared.middleware.ts`
  - Utilitaires partagés (logger, DTOs, etc.).

Typage Hono Context: `src/types/hono-context.d.ts` étend `ContextVariableMap` pour typer `ctxSet/ctxGet` (et `c.get/c.set` si utilisé). Uniques sources de vérité, aucun `declare module 'hono'` local.

## Routes

- `src/routes/config/index.ts` (prefix `/api/config`)
  - GET `/users` → liste des users
  - GET `/users/:userId` → UserConfig
  - PUT `/users/:userId` → enregistre UserConfig
  - GET `/users/:userId/projects` → liste des projets d’un user
  - GET `/users/:userId/projects/:projectId` → ProjectConfig
  - PUT `/users/:userId/projects/:projectId` → enregistre ProjectConfig

- `src/routes/content/list.ts` (prefix `/api/content`)
  - GET `/list` → liste des contenus/articles indexés

- Indexation
  - `src/routes/content/indexing.ts` (prefix `/api/content`)
    - POST `/indexing` → indexer un article/structure
  - `src/routes/components/indexing.ts` (prefix `/api/components`)
    - POST `/indexing` → indexer des composants

- `src/routes/components/list.ts` (prefix `/api/components`)
  - GET `/list` → lister les composants indexés

- `src/routes/projects.ts` (prefix `/api/projects`)
  - GET `/` → liste des projets
  - GET `/:projectId` → infos projet

- Génération de contenu (SSE)
  - `src/routes/content/generate.ts` (prefix `/api/content`)
    - POST `/generate` → Streaming SSE d’un flux de génération. Événements `progress`, `outline_indexed`, `section_started`, `section_indexed`, `section_completed`, `article_published`, `seo_post_eval_todo`, `result`, `done`, `error`.
    - Note: un événement dérivé `sections_total` est émis au `outline_indexed` pour initialiser la progression.

### Événements SSE

- `progress` → messages d’état (init, topic-selection, outline-generation, content-generation) + `heartbeat`
- `outline_indexed` → plan indexé; déclenche aussi un event dérivé `sections_total` `{ total }`
- `sections_total` → nombre total de sections estimé (émis par le serveur lors de `outline_indexed`)
- `section_started` → section en cours (payload: index/titre)
- `section_indexed` → section indexée (payload: id/position)
- `section_completed` → section terminée (payload: index)
- `article_published` → publication réalisée (payload: results[] avec url/path/success)
- `seo_post_eval_todo` → informations post-évaluation SEO (payload: language/wordCount)
- `result` → résultat final consolidé
- `done` → fin de flux
- `error` → erreur lors du flux (message)

## Clés de contexte Hono (extrait)

Ces clés sont injectées via les middlewares et typées par `src/types/hono-context.d.ts`.

- **shared** → `ReturnType<typeof createSharedServices>`
- **configReader** → `UserProjectConfigPort`
- **promptTemplate** → `PromptTemplatePort`
- **aiTextModel** → `AITextModelPort`
- **articleFetcher** → `ArticleContentFetcherPort`
- **articleStructureRepository** → `ArticleStructureRepositoryPort`
- **articleStructureStore** → `ArticleStructureStore`
- **articleStructureSearch** → `ArticleStructureSearchPort`
- **componentStore** → `ComponentVectorStore`
- **componentSearch** → `ComponentSearchPort`
- **componentCatalog** → `ComponentCatalogPort`
- **topicRepository** → `TopicRepositoryPort`
- **topicDiscovery** → `TopicDiscoveryPort`
- **generateArticleLinearUseCase** → `ApplicationServiceMap['generateArticleLinearUseCase']`
- **indexArticlesUseCase**, **listArticlesUseCase** → use cases applicatifs

Remarque: cette liste n’est pas exhaustive; référez‑vous au `.d.ts` pour la source de vérité complète.

## Helpers Hono (ctxSet/ctxGet)

- `src/utils/hono-context.ts` exporte `ctxSet`, `ctxGet`, `ctxSetUnsafe`.
- À utiliser dans les middlewares et les points d’injection pour éviter les `any` et garantir le typage.

## Tests & Run

- Dev API: `pnpm --filter @casys/api dev`
- Tests: `pnpm --filter @casys/api test`
- Smoke SSE: `src/routes/__tests__/content-generate.sse.test.ts`

## Qualité (gates API)

Tout changement doit respecter ces gates (local/CI):

- Lint (strict, 0 warning):
  ```bash
  pnpm --filter @casys/api lint
  ```
- Tests (100% verts):
  ```bash
  pnpm --filter @casys/api test
  ```
- Build:
  ```bash
  pnpm --filter @casys/api build
  ```
- Knip (unused deps/exports/files):
  ```bash
  pnpm knip --workspace packages/api
  ```

## Conventions

- Fail-fast, pas de fallback implicite.
- Config-driven (ex: `ProjectConfig` pour certaines limites/flags, respect DDD/TDD/XP).
- Ne jamais importer Application depuis Core; l’orchestration reste dans Application; les services métier restent dans Core.
