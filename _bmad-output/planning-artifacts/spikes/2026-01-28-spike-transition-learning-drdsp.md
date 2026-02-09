# Spike: Transition Learning pour DR-DSP

**Date:** 2026-01-28
**Contexte:** Discussion sur Epic 12, limitations actuelles de SHGAT/DR-DSP
**Status:** Investigation

## Problème

L'architecture actuelle a une limitation fondamentale :

```
Intent → SHGAT (score une fois) → Top-K outils → DR-DSP (shortest path) → DAG
```

**Limitations identifiées :**

1. **SHGAT est statique** : Score basé uniquement sur `intent`, pas sur `contextTools` évolutif
2. **DR-DSP est un algorithme, pas un modèle** : `findShortestPath(source, target)` utilise les poids des edges existants, mais ne peut pas *apprendre* de nouvelles transitions
3. **Pas de goal detection** : DR-DSP reçoit `startTool` et `endTool` explicitement depuis SHGAT, il ne détecte pas lui-même quand s'arrêter

## Structure existante inexploitée

Les exemples d'entraînement ont déjà la structure pour apprendre les transitions :

```typescript
// Trace: fs:read → json:parse → slack:send
// Génère 3 exemples:
{
  intentEmbedding: [...],
  contextTools: [],                          // étape 0
  candidateId: "fs:read",                    // → choisi
  outcome: 1.0
}
{
  intentEmbedding: [...],
  contextTools: ["fs:read"],                 // étape 1
  candidateId: "json:parse",                 // → choisi
  outcome: 1.0
}
{
  intentEmbedding: [...],
  contextTools: ["fs:read", "json:parse"],   // étape 2 (terminal)
  candidateId: "slack:send",                 // → choisi
  outcome: 1.0
}
```

**Ce qu'on pourrait apprendre :**

1. **Transitions** : P(json:parse | intent, [fs:read]) - quel outil après fs:read pour cet intent
2. **Terminaison** : Si contextTools = ["fs:read", "json:parse", "slack:send"] et aucun exemple avec candidateId suivant, c'est un terminal state

## Options architecturales

### Option A : Enrichir SHGAT (re-scoring dynamique)

SHGAT re-score à chaque étape avec le contexte mis à jour.

```typescript
// Actuellement
const scores = shgat.score(intent, allTools);  // Une seule fois

// Proposé
let contextTools = [];
while (!isTerminal(contextTools)) {
  const scores = shgat.score(intent, allTools, contextTools);  // À chaque étape
  const nextTool = selectBest(scores);
  contextTools.push(nextTool);
}
```

**Avantages :**
- Utilise l'infrastructure SHGAT existante
- Les exemples d'entraînement ont déjà la structure

**Inconvénients :**
- SHGAT doit encoder `contextTools` - modification significative
- Plus lent (score à chaque étape au lieu d'une fois)
- Pas clair comment SHGAT apprend la terminaison

### Option B : Modèle de transition séparé (World Model)

Créer un modèle dédié pour apprendre les transitions P(next | current, intent).

```typescript
interface TransitionModel {
  // Prédit le prochain outil
  predictNext(intent: Embedding, contextTools: string[]): ToolPrediction[];

  // Prédit si on a atteint le goal
  isTerminal(intent: Embedding, contextTools: string[]): number; // 0-1

  // Entraîne sur les traces
  train(examples: TrainingExample[]): void;
}
```

**Avantages :**
- Séparation des responsabilités (SHGAT = relevance, TransitionModel = séquence)
- Peut apprendre explicitement les patterns de terminaison
- Architecture proche des world models (simulation interne)

**Inconvénients :**
- Nouveau modèle à créer et entraîner
- Plus de complexité
- Besoin de définir l'architecture (MLP? Transformer? GNN?)

### Option C : Enrichir DR-DSP avec apprentissage

DR-DSP apprend des poids sur les edges basés sur les traces.

```typescript
// Actuellement : edges ont des poids statiques (semantic similarity)
// Proposé : edges ont des poids appris

interface LearnedEdge {
  from: string;
  to: string;
  baseWeight: number;        // semantic similarity
  learnedBoost: number;      // appris des traces
  intentConditions: Map<IntentCluster, number>;  // poids par type d'intent
}
```

**Avantages :**
- Modifie l'existant plutôt que créer du nouveau
- DR-DSP reste un algorithme de graphe, mais avec meilleurs poids

**Inconvénients :**
- Ne résout pas vraiment la goal detection
- Les "conditions" sont difficiles à représenter dans un graphe

### Option D : Beam Search avec SHGAT (le plus simple)

Au lieu de prendre les top-2 SHGAT et faire shortest path, explorer plusieurs chemins en parallèle.

```typescript
// Beam search K=3
const beams = [
  { path: [], score: 1.0 },
  // ... K beams
];

while (!allTerminated(beams)) {
  for (const beam of beams) {
    // Score les outils candidats pour ce beam
    const candidates = shgat.score(intent, allTools);
    // Étendre le beam avec les meilleurs candidats
    beam.extend(topK(candidates));
  }
  // Garder les K meilleurs beams globalement
  beams = selectTopK(beams, K);
}
```

**Avantages :**
- Pas de nouveau modèle
- SHGAT reste inchangé (score relevance)
- Explore plusieurs chemins en parallèle

**Inconvénients :**
- Ne résout pas goal detection (comment savoir quand un beam est "terminé"?)
- Coût computationnel x K

## Relation avec Epic 12

L'Epic 12 Story 12.8 (Exploratory Dry-Run) mentionne :

> "DR-DSP = planning, Hybrid execution = simulation"
> "World Model analogy"

Mais le spike actuel (2026-01-26-spike-mock-registry-exploration-learning.md) ne couvre pas l'apprentissage des transitions, seulement la qualité des mocks.

## Décision : Option B - Transition Model séparé

Après analyse, l'Option B est la plus propre :

- **SHGAT reste ce qu'il est** : scoring de relevance intent → tool
- **Nouveau modèle dédié** : apprend les transitions et la terminaison

### Architecture proposée

```typescript
interface TransitionModel {
  /**
   * Prédit les prochains outils probables ET la probabilité de terminaison
   *
   * @param intentEmbedding - L'intent initial
   * @param contextTools - Les outils déjà exécutés dans l'ordre
   * @returns Scores pour chaque outil candidat + prob de fin
   */
  predict(
    intentEmbedding: number[],
    contextToolIds: string[]
  ): {
    nextToolScores: Map<string, number>;  // P(tool_i | context, intent)
    terminationProb: number;               // P(END | context, intent)
  };

  /**
   * Entraîne sur les exemples existants (contextTools → candidateId)
   */
  train(examples: TrainingExample[]): void;
}
```

### Implémentation : MLP simple sur embeddings agrégés

```typescript
class TransitionMLP implements TransitionModel {
  // Entrée: concat(intentEmb, meanPool(contextToolEmbs))
  // Couches: Linear → ReLU → Linear → ReLU → Linear
  // Sortie: scores pour chaque tool + score terminaison

  private readonly inputDim: number;   // intentDim + toolEmbDim
  private readonly hiddenDim: number;  // 256
  private readonly outputDim: number;  // numTools + 1 (terminaison)

  predict(intentEmbedding: number[], contextToolIds: string[]): TransitionPrediction {
    // 1. Récupérer embeddings des contextTools
    const contextEmbs = contextToolIds.map(id => this.getToolEmbedding(id));

    // 2. Agréger (mean pooling, ou zéro si vide)
    const contextAgg = contextEmbs.length > 0
      ? meanPool(contextEmbs)
      : zeros(this.toolEmbDim);

    // 3. Concat avec intent
    const input = concat(intentEmbedding, contextAgg);

    // 4. Forward pass
    const logits = this.forward(input);

    // 5. Softmax sur tools, sigmoid sur terminaison
    return {
      nextToolScores: softmax(logits.slice(0, -1)),
      terminationProb: sigmoid(logits[logits.length - 1])
    };
  }
}
```

### Données d'entraînement

Les exemples existants dans `per-training.ts` sont déjà parfaits :

```typescript
// Pour chaque trace, on a N exemples :
// Exemple intermédiaire → label = candidateId, terminaison = 0
// Exemple final → label = candidateId, terminaison = 1

function prepareTransitionData(examples: TrainingExample[]): TransitionTrainingData[] {
  return examples.map((ex, idx, arr) => {
    // Détecter si c'est le dernier exemple de la trace
    const isLastInTrace = idx === arr.length - 1 ||
      arr[idx + 1].contextTools.length === 0;  // Nouvelle trace commence

    return {
      intentEmbedding: ex.intentEmbedding,
      contextToolIds: ex.contextTools,
      targetToolId: ex.candidateId,
      isTerminal: isLastInTrace ? 1 : 0
    };
  });
}
```

### Intégration avec DR-DSP

DR-DSP utilise le TransitionModel au lieu de prendre bêtement top-2 SHGAT :

```typescript
// AVANT (dag-suggester-adapter.ts)
const startTool = relevantTools[0].toolId;
const endTool = relevantTools[1].toolId;
const pathResult = this.deps.drdsp.findShortestHyperpath(startTool, endTool);

// APRÈS
function buildPath(intent: number[], transitionModel: TransitionModel): string[] {
  const path: string[] = [];

  while (true) {
    const { nextToolScores, terminationProb } = transitionModel.predict(intent, path);

    // Si terminaison probable > seuil, on s'arrête
    if (terminationProb > 0.7) break;

    // Sinon on prend le meilleur next tool
    const nextTool = argmax(nextToolScores);
    path.push(nextTool);

    // Sécurité: max 10 étapes
    if (path.length >= 10) break;
  }

  return path;
}
```

### Relation avec SHGAT

SHGAT et TransitionModel sont complémentaires :

| Modèle | Question | Input | Output |
|--------|----------|-------|--------|
| SHGAT | "Quels outils sont pertinents pour cet intent?" | intent | scores de relevance |
| TransitionModel | "Quel outil vient après, sachant le contexte?" | intent + contextTools | next tool + terminaison |

**Flow combiné :**

1. SHGAT filtre les outils pertinents (top-K)
2. TransitionModel construit le chemin parmi ces outils
3. DR-DSP peut valider/optimiser le chemin sur le graphe

### Questions à résoudre

1. **Architecture du MLP** : Combien de couches? Quelle dim cachée?
2. **Agrégation contextTools** : Mean pooling suffisant ou attention?
3. **Seuil de terminaison** : 0.7 ou appris/adaptatif?
4. **Intégration SHGAT** : TransitionModel score parmi top-K SHGAT ou tous les outils?

## Impact sur Epic 12

Cette approche devrait être intégrée dans l'Epic 12, probablement comme :

- **Story 12.11 : Transition Model** - Nouveau modèle pour apprendre les transitions et la terminaison
  - Dépend de : Story 12.7 (exemples d'entraînement avec args)
  - Utilisé par : Story 12.8 (Exploratory Dry-Run) pour savoir quand s'arrêter

Ou modifier Story 12.8 pour inclure le TransitionModel comme pré-requis.

## Prochaines étapes

1. Valider l'approche avec l'équipe
2. Si OK, créer Story 12.11 ou modifier 12.8
3. Implémenter TransitionMLP dans `lib/shgat/src/transition/` ou `src/graphrag/transition/`
4. Adapter `dag-suggester-adapter.ts` pour utiliser le nouveau modèle

## Références

- Epic 12: `_bmad-output/planning-artifacts/epics/epic-12-speculative-execution-arguments.md`
- Training examples: `src/graphrag/learning/per-training.ts`
- DR-DSP usage: `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts`
- SHGAT: `lib/shgat/src/core/shgat.ts`
