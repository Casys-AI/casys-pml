# WriteSectionsUseCase

**Source :** `packages/application/src/usecases/write-sections.usecase.ts`

## Objectif

Générer le contenu de toutes les sections d'un article à partir d'un outline, avec contexte graphe et indexation progressive.

## Signature

```ts
interface WriteSectionsParams {
  articleId: string;
  outline: ArticleOutline;
  language: string;
  tenantId: string;
  projectId: string;
  sources?: string[];
  onEvent?: ApplicationEventHandler;
}

execute(params: WriteSectionsParams): Promise<SectionNode[]>
```

## Ports requis

- `SectionWriterWriteSectionPort` - agent IA de rédaction de section
- `StructureSearchByGraphNeighborhoodPort` - recherche de contexte graphe
- `GraphContextBuilder` - construction du contexte enrichi
- `ArticleIndexingUpsertPort` (optionnel) - indexation progressive
- `IndexArticleProgressivelyUseCase` (optionnel) - orchestration indexation

## Étapes détaillées

### 1. Matérialisation de l'outline

- Conversion `ArticleOutline` → `SectionNode[]` vides
- Génération d'IDs déterministes : `${articleId}::${index}`
- Calcul des relations parent/enfant selon les niveaux
- Construction de l'arbre hiérarchique

### 2. Indexation outline (optionnelle)

- Upsert immédiat titre + description pour navigation
- Indexation structure sections (sans contenu)
- Émission événement `OutlineIndexed`

### 3. Boucle de génération sections

Pour chaque section dans l'ordre :

#### 3.1 Événement section started

- Émission `SectionStarted` avec métadonnées

#### 3.2 Recherche contexte graphe

- **Neighborhood search** : sections similaires dans le graphe
- Paramètres : `window=1`, `limit=2` (sections voisines)
- Scope : `tenantId`, `projectId` du contexte

#### 3.3 Construction contexte enrichi

```ts
GraphContextBuilder.build({
  outline: { ...outline, sources },
  currentIndex: i,
  generatedSections: sectionsDejaGenerees,
  current: sectionCourante,
  neighbors: resultatsGraphe,
});
```

#### 3.4 Invocation agent IA

- Appel `SectionWriterAgent` avec contexte JSON
- Input : `{ topic: section.title, context: enrichedContext }`
- Parsing et validation via `SectionWriteResultSchema`

#### 3.5 Validation contenu

- Fail-fast si JSON invalide ou contenu vide
- Assemblage `SectionNode` finale avec contenu

#### 3.6 Indexation incrémentale

- Upsert contenu section pour recherche immédiate
- Émission événement `SectionIndexed`

#### 3.7 Événement section completed

- Émission `SectionCompleted` avec résultats

#### 3.8 Relations Graphe Section→Topic

- La réponse de l’agent inclut `usedSources: { topicId: string; reason?: string }[]`.
- `topicId` DOIT être l’ID persistant du Topic (`candidate.id`) — jamais une URL.
- Le lien est créé via `TopicRelationsPort.linkSectionToTopic({ tenantId, projectId, sectionId, topicId, articleId })`.
- Référence: `config/blueprints/prompts/section-writer.poml` (output-format impose un ID de topic).

Exemple:

```ts
for (const source of writeResult.usedSources) {
  await topicRelations.linkSectionToTopic({
    tenantId,
    projectId,
    sectionId: section.id,
    topicId: source.topicId, // ID persistant du Topic
    articleId,
  });
}
```

## Matérialisation outline → SectionNode

```ts
// Exemple outline avec niveaux hiérarchiques
outline.sections = [
  { title: "Introduction", level: 1 },           // → parent: undefined
  { title: "Concepts de base", level: 2 },       // → parent: Introduction
  { title: "Définitions", level: 3 },            // → parent: Concepts de base
  { title: "Exemples", level: 3 },               // → parent: Concepts de base
  { title: "Applications", level: 2 },           // → parent: Introduction
  { title: "Conclusion", level: 1 }              // → parent: undefined
];

// Génération IDs et relations
materializeOutlineSections(outline, "article123") {
  const lastAtLevel = [];
  return outline.sections.map((s, idx) => {
    const id = `article123::${idx}`;              // IDs déterministes
    const level = s.level;
    const parentSectionId = level > 1 ? lastAtLevel[level - 1] : undefined;

    lastAtLevel[level] = id;                      // Mémoriser pour enfants
    // Reset niveaux plus profonds
    for (let l = level + 1; l < lastAtLevel.length; l++) {
      lastAtLevel[l] = undefined;
    }

    return {
      id,
      title: s.title,
      level,
      content: '',                                // Vide initialement
      position: idx,
      articleId: "article123",
      parentSectionId
    };
  });
}
```

## Contexte graphe enrichi

Le `GraphContextBuilder` assemble :

- **Outline complet** : structure + sources
- **Index courant** : position dans la boucle
- **Sections générées** : contenu des sections précédentes
- **Section courante** : métadonnées
- **Voisins graphe** : sections similaires d'autres articles

## Événements émis

1. `OutlineIndexed` - après indexation structure
2. `SectionStarted` - début génération section
3. `SectionIndexed` - après indexation contenu section
4. `SectionCompleted` - fin génération section

## Indexation progressive

**Avantages** :

- Navigation immédiate dans l'article en cours de génération
- Recherche contextuelle pour sections suivantes
- Feedback temps réel pour l'utilisateur

**Deux modes** :

- **IndexArticleProgressivelyUseCase** : orchestration métier
- **ArticleIndexingUpsertPort** : accès direct au port

## Validation fail-fast

- Agent IA retourne JSON invalide → `Error: SectionWriterAgent returned invalid JSON`
- Contenu généré vide → `Error: Empty content generated for section ${id}`
- Parsing schema échoue → propagation erreur Zod

## Exemple d'utilisation

```ts
const useCase = new WriteSectionsUseCase(
  sectionWriter,
  structureSearch,
  contextBuilder,
  indexingService // optionnel
);

const sections = await useCase.execute({
  articleId: 'ai-guide-123',
  outline: {
    title: 'Guide IA',
    summary: 'Introduction complète',
    tags: ['ia', 'guide'],
    sections: [
      { title: 'Introduction', level: 1 },
      { title: 'Concepts', level: 2 },
      { title: 'Applications', level: 2 },
      { title: 'Conclusion', level: 1 },
    ],
  },
  language: 'fr',
  tenantId: 'tenant1',
  projectId: 'blog-tech',
  sources: ['https://source1.com', 'https://source2.com'],
  onEvent: event => console.log('📅', event.type, event.payload),
});

console.log(`${sections.length} sections générées`);
sections.forEach(s => console.log(`- ${s.title}: ${s.content.length} chars`));
```

## Architecture

### Orchestration pure

- Délègue la rédaction à `SectionWriterAgent`
- Délègue la recherche à `StructureSearchPort`
- Assemble le contexte via `GraphContextBuilder`

### Boucle séquentielle

- Génération section par section (pas de parallélisation)
- Chaque section enrichit le contexte des suivantes
- Indexation immédiate pour feedback

### Gestion des dépendances optionnelles

- Graceful degradation si indexation indisponible
- Services d'indexation injectés via constructeur

## Notes de performance

- **1 appel IA par section** (coûteux)
- **Recherche graphe** par section (optimisable avec cache)
- **Indexation progressive** : balance entre UX et overhead
- **Contexte enrichi** : limite mémoire avec sections générées précédentes
