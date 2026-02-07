# Middlewares (DI Hono)

Ces middlewares injectent les dépendances dans le contexte Hono via `ctxSet(...)` (règle ESLint: `c.set` interdit en middleware) et sont consommés dans les routes via `c.get()`.

## Ordre de composition
1. `shared.middleware.ts` — logger + services partagés
2. `infrastructure.middleware.ts` — adapteurs techniques (DB/FS/API/etc.)
3. `core.middleware.ts` — services métier composés
4. `application.middleware.ts` — use cases / agents prêts à l’emploi

> Le typage des clés de contexte est centralisé dans `src/types/hono-context.d.ts`. Utiliser `ctxSet` pour l’écriture côté middlewares et `ctxSetUnsafe` côté tests. Aucun `declare module 'hono'` local ne doit être redéclaré dans les middlewares.

Exemple d’usage (dans une route):

```ts
// Récupère un use case typé via le .d.ts
const listArticlesUseCase = c.get('listArticlesUseCase');
const shared = c.get('shared');
const result = await listArticlesUseCase.listAllArticles();
return c.json(shared.dtos.api.createResponse(true, result));
```

## Détails

### shared.middleware.ts
- Expose `shared` (helpers globaux) et `logger`.
- Clés:
  - `shared`: `ReturnType<typeof createSharedServices>`
  - `logger`: Logger simple (utilisé par les autres middlewares)

### infrastructure.middleware.ts
- Prépare les adapteurs: Kùzu (graph), FS, GitHub, frontmatter, parsers, providers (SEO/Google) etc.
- Clés (exemples):
  - `graphDb`, `componentRepository`, `articleRepository`
  - `frontmatter`, `mdxParser`, `imageAdapter`, `seoAdapters`
  - `googleScraping`, `googleTrends` (refactor SEO confirmé)

### core.middleware.ts
- Compose les services métier au-dessus des ports core:
  - `ArticleStructureSearchService`
  - `ComponentUsageService`
  - `ComponentVectorSearchService`

### application.middleware.ts
- Construit les services applicatifs, agents et use cases depuis l’infra/core.
- Clés (exemples):
  - `generateArticleLinearUseCase`
  - `ComponentGeneratorAgent`, `SectionWriterAgent`, `CommentAgent`

### Helpers & tests
- En middlewares, toujours utiliser `ctxSet(c, key, value)` pour écrire dans le contexte.
- En tests, utiliser `ctxSetUnsafe(c, key, value)` pour injecter des mocks Hono.
- Les routes continuent de lire via `c.get('key')` (lecture typée par `ContextVariableMap`).

## Bonnes pratiques
- Fail-fast: si une clé manquante est indispensable, renvoyer 500 avec un message explicite.
- Ne jamais importer Application depuis Core (respect hexa). Application orchestre, Core contient le métier.
- Centraliser/maintenir la déclaration des clés dans `src/types/hono-context.d.ts` (source de vérité).
- Qualité: voir `packages/api/README.md` (section « Qualité (gates API) ») pour les commandes `lint`/`test`/`build`/`knip`. Pas de duplication ici.
