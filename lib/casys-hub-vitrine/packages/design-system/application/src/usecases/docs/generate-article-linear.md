# GenerateArticleLinearUseCase

**Source :** `packages/application/src/usecases/generate-article-linear.usecase.ts`

## Objectif

Orchestrer une génération d'article complète et déterministe de bout en bout.

## Pipeline

SEO → discovery → sélection de sujets → fetching multi-sources → outline → sections → cover → tags → liens graphe → publication.

## Signature

```ts
interface GenerateArticleInput {
  articles: ArticleSearchResult[];
  keywords: string[];
  tenantId?: string;
  projectId?: string;
}

interface GenerateArticleOptions {
  onEvent?: ApplicationEventHandler;
  onPostSeoEvaluate?: (input: {
    article: ArticleStructure['article'];
    sections: SectionNode[];
    language: string;
  }) => Promise<void> | void;
}

execute(input: GenerateArticleInput, options?: GenerateArticleOptions): Promise<ArticleStructure>
```

## Ports requis

- `OutlineWriterGenerateOutlinePort` - génération d'outline
- `SectionWriterWriteSectionPort` - rédaction des sections
- `StructureSearchByGraphNeighborhoodPort` - recherche contextuelle
- `TopicDiscoveryPort` - découverte de sujets
- `SelectTopicExecutePort` - sélection IA de topics
- `SeoAnalysisExecutePort` - analyse SEO préalable
- `ArticleContentFetcherPort` - récupération de contenu
- `UserProjectConfigPort` - configuration projet
- `ArticleIndexingUpsertPort` (optionnel) - indexation progressive
- `ArticlePublicationPublishPort` (optionnel) - publication
- `CoverImageGenerateForArticlePort` (optionnel) - génération cover
- `UpsertArticleTagsUseCase` (optionnel) - gestion tags
- `TopicRelationsPort` (optionnel) - relations graphe
- `BuildTopicsFromFetchResultsUseCase` (optionnel) - linking `Topic→KeywordPlan` via `keywordTags`
- `EditorialBriefStorePort` (optionnel) - persistance brief éditorial

## Étapes détaillées

1. **Validation entrées** : fail-fast sur `keywords`, `tenantId`, `projectId`
2. **Config projet** : récupération `language` depuis `ProjectConfig`
3. **Analyse SEO** : enrichissement keywords avec recherche web contextuelle
4. **Discovery topics** : découverte candidats via sources (RSS/NewsAPI)
5. **Sélection IA** : TopicSelector choisit topics + angle + seoSummary
6. **Fetching contenu** :
   - Réconciliation & unification d'identité: pour chaque topic sélectionné, on mappe au `TopicCandidate` d'origine (match `sourceUrl` prioritaire).
   - Unification d'ID en mémoire: `topics[i].id = candidate.id` (ID persistant)
   - Récupération du contenu complet des articles shortlistés
7. **Génération outline** : OutlineWriter avec multi-sources + angle + SEO
8. **Validation outline** : fail-fast JSON + schema + IDs uniques + niveaux 1-6
9. **Indexation outline** : upsert immédiat titre/description pour navigation
10. **Rédaction sections** : WriteSections avec contexte graphe + indexation progressive
11. **Assemblage structure** : ArticleStructure complète
12. **Génération cover** : image alignée angle/outline (optionnel)
13. **Upsert tags** : traçabilité SEO (optionnel)
14. **Relations graphe** :
    - `Topic→KeywordPlan` effectué via `BuildTopicsFromFetchResultsUseCase` en passant des `keywordTags: KeywordTag[]` alignés (slugs requis)
    - `Section→Topic` géré dans `WriteSectionsUseCase` (l’agent SectionWriter doit renvoyer `usedSources[].topicId = candidate.id`)
15. **Publication** : orchestrée FS + GitHub (fail-fast si service absent)

## Événements émis

- `ApplicationEventTypes.OutlineIndexed`
- `ApplicationEventTypes.SectionStarted`
- `ApplicationEventTypes.SectionCompleted`
- `ApplicationEventTypes.SectionIndexed`
- `ApplicationEventTypes.ArticlePublished`
- `ApplicationEventTypes.SeoPostEvalTodo`

## Erreurs fail-fast

- `keywords` vide ou absent
- `tenantId`/`projectId` manquants
- `ProjectConfig.language` absent
- Aucun topic candidat découvert
- Aucun topic sélectionné par l'IA
- `seoSummary` manquant ou vide
- `angle` éditorial manquant
- Outline JSON invalide ou sections vides
- IDs de sections dupliqués
- Niveaux de sections invalides (hors 1-6)
- `ArticlePublicationService` absent

## Exemple d'utilisation

```ts
const useCase = new GenerateArticleLinearUseCase(
  outlineWriter,
  sectionWriter,
  structureSearch
  // ... autres ports
);

const result = await useCase.execute(
  {
    articles: [],
    keywords: ['intelligence artificielle', 'automation'],
    tenantId: 'tenant1',
    projectId: 'blog-tech',
  },
  {
    onEvent: event => console.log('Event:', event.type),
  }
);

console.log('Article généré:', result.article.title);
```

## Notes d'architecture

- **Orchestration pure** : pas de logique métier, délègue aux services/ports
- **Config-driven** : langue et paramètres depuis `ProjectConfig`
- **Fail-fast** : aucun fallback silencieux, erreurs explicites
- **Événements** : SSE/traces pour suivi temps réel
- **Indexation progressive** : outline puis sections pour navigation immédiate
