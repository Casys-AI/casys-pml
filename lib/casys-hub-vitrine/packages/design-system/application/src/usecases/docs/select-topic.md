# SelectTopicUseCase

**Source :** `packages/application/src/usecases/select-topic.usecase.ts`

## Objectif

Sélection IA de sujets pertinents depuis articles/tags candidats avec angle éditorial et synthèse SEO.

## Signature (types domaine)

```ts
import type { TopicCandidate, KeywordTag, SeoBriefData, Topic } from '@casys/core';

interface SelectTopicCommand {
  tenantId: string;
  projectId: string;
  language: string;
  articles: TopicCandidate[];  // candidats à évaluer
  tags: KeywordTag[];          // tags KeywordPlan (source de vérité)
  seoBriefData?: SeoBriefData; // synthèse SEO projetée
}

interface SelectTopicResult {
  topics: Topic[];
  angle: string;
  seoSummary: SeoBriefData;
}

execute(input: SelectTopicCommand): Promise<SelectTopicResult>
```

## Ports requis

- `UserProjectConfigPort` - configuration projet (template, maxTopics)
- `PromptTemplatePort` - rendu POML
- `AITextModelPort` - modèle de texte IA

## Configuration requise

```yaml
generation:
  topicSelector:
    template: 'path/to/topic-selector.poml'
    maxTopics: 3 # nombre max de topics à sélectionner
```

## Étapes détaillées

1. **Validation entrées** : fail-fast sur `tenantId`, `projectId`, `language`
2. **Chargement config** : récupération `template` et `maxTopics` depuis `ProjectConfig`
3. **Délégation workflow** : exécution du workflow LangGraph Topic Selector (template POML, IA, parsing)
4. **Validation réponse** : JSON valide + schéma conforme
5. **Validation métier** : fail-fast si aucun topic retourné
6. **Respect maxTopics** : troncature stricte selon config
7. **Angle** : validation via `EditorialAngle` VO
8. **SeoSummary** : validation via `SeoBrief` VO
9. **Note ID** : la réconciliation stricte des IDs pour liens graphe est finalisée en aval dans `GenerateArticleLinearUseCase` (unification `topics[i].id = candidate.id` au moment du fetching)

## Validation fail-fast

- `tenantId`/`projectId` manquants
- `project.language` absent dans ProjectConfig
- `generation.topicSelector.template` manquant
- `generation.topicSelector.maxTopics` invalide (≤ 0)
- Réponse IA invalide (JSON malformé)
- Aucun topic retourné par l'IA
- Topic sélectionné avec ID temporaire non réconciliable
  

## Réconciliation d'identité

La réconciliation stricte pour les liens graphe est finalisée au niveau application dans `GenerateArticleLinearUseCase` lors de la phase de fetching (unification `topics[i].id = candidate.id`). Le matching se fait par `sourceUrl` (prioritaire) ou `id` quand c’est déjà cohérent.

## Exemple d'utilisation

```ts
const useCase = new SelectTopicUseCase(
  configReader,
  promptTemplate,
  aiTextModel
);

const result = await useCase.execute({
  tenantId: 'tenant1',
  projectId: 'blog-tech',
  language: 'fr',
  articles: [
    { id: 'topic-1', title: 'IA et automation', sourceUrl: 'https://...' },
  ],
  tags: [{ label: 'intelligence artificielle', slug: 'ia', source: 'trend' }],
  seoInsights: {
    competitors: ['Concurrent A', 'Concurrent B'],
    contentGaps: ['manque analyse technique'],
    searchIntent: 'informational',
    competitionScore: 0.7,
    trendScore: 0.8,
  },
});

console.log('Topics sélectionnés:', result.topics.length);
console.log('Angle éditorial:', result.angle);
```

## Notes d'architecture

- **Config-driven** : template et limites depuis ProjectConfig
- **Fail-fast métier** : "IA a retourné aucun topic" géré au niveau use case (pas de `.min(1)` côté schéma)
- **Réconciliation stricte** : IDs canoniques obligatoires
- **VO normalization** : `EditorialAngle` et `SeoBrief` pour validation domaine
