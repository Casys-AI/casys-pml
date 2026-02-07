# BuildTopicsFromFetchResultsUseCase

**Source :** `packages/application/src/usecases/build-topics-from-fetch-results.usecase.ts`

## Objectif

Upserter des `Topic` à partir de `TopicCandidate[]` shortlistés et créer les relations `Topic → KeywordPlan` à partir d’un sous-ensemble aligné de `KeywordTag[]` (slugs requis). Idempotent et fail-fast.

## Signature

```ts
interface BuildTopicsFromFetchResultsCommand {
  tenantId: string;
  projectId: string;
  candidates: TopicCandidate[];      // shortlist des candidats retenus
  keywordTags: KeywordTag[];         // tags alignés (slug requis)
  linkKeywords?: boolean;            // défaut: true
}

interface BuildTopicsFromFetchResultsReport {
  upsertedCount: number;             // nb de Topics upsertés
  linkedKeywordTags: number;         // nb de relations Topic→KeywordPlan créées
}

execute(cmd: BuildTopicsFromFetchResultsCommand): Promise<BuildTopicsFromFetchResultsReport>
```

## Ports requis

- **TopicRepositoryPort** (`upsertTopics`) — upsert idempotent des Topics
- **TopicRelationsPort** (`linkTopicToKeywordPlan`) — création de relation vers `KeywordPlan`

## Étapes détaillées

1. **Validation entrées (fail-fast)**
   - `tenantId`, `projectId` non vides
   - `candidates.length > 0`
   - `keywordTags.length > 0`
2. **Mapping candidats → Topics**
   - `id = candidate.id` (ID persistant de référence)
   - `title`, `createdAt` (ISO), `language`, `sourceUrl`, `imageUrls`, `sourceContent`
3. **Upsert topics** via `repo.upsertTopics({ tenantId, projectId, topics })`
4. **Préparation des slugs KeywordPlan**
   - `keywordTags[].slug` requis (fail-fast si manquant)
   - `keywordNormalized = tag.slug`
5. **Linking graphe (optionnel)**
   - Si `linkKeywords !== false`, pour chaque Topic et chaque slug:
     - `relations.linkTopicToKeywordPlan({ tenantId, projectId, topicId: topic.id, keywordNormalized: slug })`
6. **Rapport**
   - `upsertedCount = topics.length`
   - `linkedKeywordTags = nb de liens tentés`

## Erreurs fail-fast

- Paramètres manquants: `tenantId`, `projectId`
- `candidates` vide
- `keywordTags` vide
- `keywordTags[].slug` manquant

## Exemple d’utilisation

```ts
import { BuildTopicsFromFetchResultsUseCase } from '@casys/application';

const usecase = new BuildTopicsFromFetchResultsUseCase(topicRepo, topicRelations);

const report = await usecase.execute({
  tenantId: 't1',
  projectId: 'p1',
  candidates: shortlistedCandidates,        // issus de GenerateArticleLinearUseCase
  keywordTags: alignedKeywordTags,          // sous-ensemble de seoStrategy.keywordPlan.tags
  linkKeywords: true,
});

console.log(report); // { upsertedCount, linkedKeywordTags }
```

## Notes d’architecture

- **Source unique du linking**: ce use case est l’unique point pour `Topic→KeywordPlan`.
- **IDs unifiés**: les `Topic` sont persistés avec `candidate.id`. La couche d’orchestration doit aligner `topics[i].id = candidate.id` en amont.
- **Zéro fallback**: le `slug` est la vérité pour `keywordNormalized` (pas de normalisation implicite ici).
- **Idempotence**: garantis côté repo et MERGE dans l’adaptateur graphe.
