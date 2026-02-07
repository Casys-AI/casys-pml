# @casys/application · Use Cases & Orchestration (Hexa Clean)

Couche Application du monorepo CaSys. Elle orchestre les cas d’usage (Use Cases) en DDD sur la base des Ports In/Out et des entités du domaine `@casys/core`. L’Application ne contient aucune logique d’infrastructure; elle pilote des ports et applique du fail-fast métier.

## 🌟 Principes

- **Hexa Clean & DDD**: orchestration dans l’application, règles métiers dans `@casys/core`, I/O via ports.
- **Fail fast**: validations précises, erreurs explicites, pas de fallback implicite.
- **Config driven**: lecture de la configuration projet/utilisateur via ports (ex: `UserProjectConfigPort`).
- **XP / YAGNI**: surface API minimale, tests Vitest, code clair.

## 🔌 Ports (Out) consommés par l’Application

Exportés depuis `src/ports/out` (ré-export via `src/ports/out/index.ts`):

- **Contenu & Publication**
  - `ArticleContentFetcherPort`
  - `ArticlePublicationPublishPort`
  - `ArticleIndexingUpsertPort`
- **IA & Génération**
  - `AITextModelPort`
  - `OutlineWriterGenerateOutlinePort`
  - `SectionWriterWriteSectionPort`
  - `CoverImageGenerateForArticlePort`
- **SEO & Découverte**
  - `GoogleScrapingPort`, `GoogleTrendsPort`
  - `TopicDiscoveryPort`
  - `TopicRelationsPort`
- **Configuration**
  - `UserProjectConfigPort`
- **Tags & Keywords**
  - `TagRepositoryPort`
  - `SeoKeywordRepositoryPort`

Ces ports sont implémentés en infrastructure (adapters) et injectés dans les use cases via le container d’application.

## 🧠 Use Cases principaux

- **GenerateArticleLinearUseCase**
  - Orchestration complète de génération linéaire: SEO -> sélection de sujets -> fetching contenu -> outline -> sections -> publication.
  - Ports requis: outline/section writers, content fetcher, topic discovery, select topic, SEO, config reader, (optionnel) indexing, publication, cover image, tag upsert, topic relations.

- **SelectTopicUseCase**
  - Sélectionne les sujets pertinents (via agent/IA) à partir d’articles et tags candidats.

- **SeoAnalysisUseCase**
  - Analyse SEO (enrichissement mots-clés, intentions de recherche, gaps, concurrents) en amont de la découverte de sujets.

- **IndexComponentsUseCaseImpl** / **ListComponentsUseCaseImpl**
  - Indexation et listing des composants via `ComponentVectorStore` (ports core in) exposés au niveau application.

- **IndexArticlesUseCaseImpl** / **ListArticlesUseCaseImpl**
  - Indexation rapide (titre/summary) et listing d’articles.

- **GenerateCoverImageUseCase**
  - Génère une image de couverture cohérente avec l’angle éditorial et l’outline.

- **UpsertArticleTagsUseCase**
  - Upsert des tags au niveau article, avec _fail-fast_ sur params et rapport matched/unmatched vs. keyword plan.

Voir `src/usecases/*.ts` pour le détail et la signature de chaque exécution.

## 📦 Container d’Application

Le container construit des services typés à partir de dépendances optionnelles. C’est l’entrée privilégiée depuis l’API/Infra.

```ts
import { createApplicationServices } from '@casys/application';
import type { ApplicationDependencies } from '@casys/application';

const deps: ApplicationDependencies = {
  // Repos / Stores / Ports fournis par l’infra
  articleStructureStore: /* ... */, // core in
  articleStructureRepository: /* ... */, // core in
  componentStore: /* ... */, // core in
  componentSearch: /* ... */, // core in

  // Ports out (application)
  outlineWriter: /* OutlineWriterGenerateOutlinePort */,
  sectionWriter: /* SectionWriterWriteSectionPort */,
  aiTextModel: /* AITextModelPort */,
  topicDiscovery: /* TopicDiscoveryPort */,
  configReader: /* UserProjectConfigPort */,
  googleScraping: /* GoogleScrapingPort */,
  googleTrends: /* GoogleTrendsPort */,
  articleContentFetcher: /* ArticleContentFetcherPort */,
  articlePublicationService: /* ArticlePublicationPublishPort */,
  seoKeywordRepo: /* SeoKeywordRepositoryPort */,
  tagRepository: /* TagRepositoryPort */,
  topicRelations: /* TopicRelationsPort */,
};

const services = createApplicationServices(deps);
// ex: services.generateArticleLinearUseCase?.execute({ ... })
```

Services disponibles (cf. type `ApplicationServiceMap`):

- `indexComponentsUseCase?`
- `indexArticlesUseCase?`
- `listArticlesUseCase?`
- `listComponentsUseCase?`
- `generateComponentFromCommentUseCase?`
- `generateCoverImageUseCase?`
- `selectTopicUseCase?`
- `seoAnalysisUseCase?`
- `generateArticleLinearUseCase?`

Les services non construits apparaissent comme `undefined` si les dépendances requises sont absentes (fail-fast à l’exécution).

## 🧪 Tests

- **Vitest**
  - `pnpm --filter @casys/application test`
  - Tests unitaires sur use cases et mappers clés (ex: `SelectTopicUseCase`, `topic-selector.mapper`, `buildTopicSelectorPoml`).

## 🧩 Mappers

- `topic-selector.mapper.ts`
  - `mapCommandToTopicSelectorPromptDTO` (commande -> prompt DTO pour l’agent)
  - `mapTopicCandidatesToInputDTOs` (domain candidates -> DTO articles)
  - `mapSelectedTopicsDTOToDomain` (DTO IA -> entités `Topic` – vérification fail-fast en use case)

Note: Le mapping de DTO “transport” (HTTP, fichiers) vers entités domaine se fait aux frontières (API/Infra). L’application évite d’embarquer des mappers de transport (YAGNI).

## ⚙️ Scripts utiles

Dans le package `@casys/application`:

```bash
pnpm build       # build tsup
pnpm dev         # watch
pnpm lint        # lint + type-check
pnpm test        # tests unitaires
```

## 🔗 Dépendances

- **Node**: 22+
- **TypeScript**: 5.8+
- **Vitest** pour les tests
- Liens forts avec `@casys/core` (entités/ports in) et `@casys/shared` (DTO transverses).

## ✅ Bonnes pratiques d’intégration

- **Injecter seulement les ports nécessaires** au service visé.
- **Gérer explicitement les erreurs** (aucun fallback silencieux).
- **Conserver le mapping transport↔domaine** côté API/Infra.

## 📚 Exemples d’exécution (extraits)

- Génération article linéaire

```ts
await services.generateArticleLinearUseCase?.execute({
  articles: /* résultats de recherche */ [],
  keywords: ['ai ethics', 'governance'],
  tenantId: 't1',
  projectId: 'p1',
});
```

- Sélection de sujet

```ts
const selection = await services.selectTopicUseCase?.execute({
  tenantId: 't1',
  projectId: 'p1',
  language: 'en',
  articles: /* TopicArticleInputDTO[] */ [],
  tags: /* KeywordTagDTO[] */ [],
});
```

- Upsert tags d’article

```ts
await services.generateArticleLinearUseCase?.execute({
  /* ... */
});
// ou directement via UpsertArticleTagsUseCase si exposé dans ton flux
```
