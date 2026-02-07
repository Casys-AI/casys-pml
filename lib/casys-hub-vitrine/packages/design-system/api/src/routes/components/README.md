# Routes Components

Sous-domaine de l’API dédié aux composants: génération depuis commentaires, indexation et listing.

## Sommaire
- Génération: `/api/components/generate` (depuis un commentaire)
- Indexation: `/api/components/indexing`
- Listing: `/api/components/list`

## Génération — POST `/api/components/generate`
- Génère un composant à partir d’un commentaire (agent IA côté application).
- DI attendue via `applicationMiddleware`:
  - `generateComponentFromCommentUseCase`
  - `componentGeneratorAgent`

Réponse standard via `shared.dtos.api.createResponse`.

## Indexation — POST `/api/components/indexing`
- Indexe des composants (catalogue/graph/vector store), résilient et fail-fast.
- DI attendue:
  - `indexComponentsUseCase`
  - Stores et catalog via `infrastructureMiddleware`/`coreMiddleware` (`componentStore`, `componentSearch`, `componentCatalog`).

## Listing — GET `/api/components/list`
- Liste des composants indexés (métadonnées utiles pour le front/édition).
- DI attendue:
  - `listComponentsUseCase`

## Conventions
- Fail-fast (pas de fallback silencieux).
- Validation Zod si nécessaire.
- Typage Hono centralisé dans `src/types/hono-context.d.ts` (pas de `declare module` local).
