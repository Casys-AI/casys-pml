---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
inputDocuments:
  - _bmad-output/planning-artifacts/spikes/2026-01-28-spike-transition-learning-drdsp.md
  - _bmad-output/planning-artifacts/epics/epic-12-speculative-execution-arguments.md
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'GRU-based TransitionModel for workflow path building'
research_goals: 'Implement a GRU model to replace DR-DSP for predicting next tools and detecting goal termination'
user_name: 'Ubuntu'
date: '2026-01-28'
web_research_enabled: true
source_verification: true
---

# Research Report: Technical - GRU TransitionModel

**Date:** 2026-01-28
**Author:** Ubuntu
**Research Type:** Technical

---

## Research Overview

Investigation technique pour implémenter un modèle de transition basé sur GRU qui remplacera DR-DSP pour la construction de chemins de workflow dans PML.

**Contexte:**
- SHGAT score le premier outil (pertinence à l'intent)
- TransitionModel prédit les outils suivants step-by-step
- Détection de goal/terminaison intégrée
- Doit s'intégrer avec les embeddings hyperedges existants de SHGAT

**Contraintes:**
- Implémentation TypeScript/Deno (pas de PyTorch)
- Utilise les embeddings 768-dim existants
- Séquences courtes (2-5 outils typiquement)

---

## Technical Research Scope Confirmation

**Research Topic:** GRU-based TransitionModel for workflow path building
**Research Goals:** Implement a GRU model to replace DR-DSP for predicting next tools and detecting goal termination

**Technical Research Scope:**

- Architecture Analysis - GRU structure (gates, hidden state), variantes (GRU vs LSTM vs minimal)
- Implementation Approaches - From scratch TypeScript, backpropagation patterns
- Technology Stack - Math libs pour Deno, **Deno FFI pour deps externes (Rust/C)**
- Integration Patterns - Combinaison GRU + intent, connection avec SHGAT embeddings
- Performance Considerations - Complexité O(n), optimisations séquences courtes

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Additional Context (from user):**
- Deno FFI disponible pour dépendances externes en Rust/C/C++
- Possibilité d'utiliser des libs optimisées pour le calcul matriciel

**Scope Confirmed:** 2026-01-28

---

## Technology Stack Analysis

### Programming Languages & Runtime

**TypeScript/Deno (Primary)**
- Deno runtime avec support natif TypeScript
- Deno FFI avec overhead ~1ns sur M1 - performance quasi-native
- [deno_bindgen](https://github.com/denoland/deno_bindgen) simplifie la génération de code FFI pour Rust
_Source: [Deno FFI Documentation](https://docs.deno.com/runtime/fundamentals/ffi/)_

**Rust (via FFI)**
- Option pour les calculs matriciels intensifs
- Bibliothèques disponibles : neuronika (tenseurs pure Rust), tract (ONNX inference)
_Source: [Awesome Rust Machine Learning](https://github.com/vaaaaanquish/Awesome-Rust-MachineLearning)_

### Neural Network Libraries JavaScript/TypeScript

**Option 1: TensorFlow.js** ⭐ Recommandé
- Support natif RNN via `tf.layers.rnn()` avec LSTM et GRU
- Paramètres clés : `returnSequences`, `returnState`, `stateful`, `unroll`
- Fonctionne dans Deno via npm specifiers
- GPU acceleration disponible (WebGL)
_Source: [TensorFlow.js RNN](https://www.geeksforgeeks.org/tensorflow-js-tf-layers-rnn-function/)_

**Option 2: Implémentation From Scratch**
- [Micrograd-TS](https://itnext.io/micrograd-ts-269413aa7caa) : ~200 lignes TypeScript, autograd
- [Neural Net TypeScript](https://github.com/YadaYuki/neural_net_typescript) : CNN/DNN from scratch
- Avantage : Contrôle total, pas de dépendances lourdes
_Source: [Micrograd TS](https://itnext.io/micrograd-ts-269413aa7caa)_

**Option 3: Brain.js**
- GPU accelerated Neural Networks en JavaScript
- Support browser et Node.js
- Plus simple mais moins flexible que TensorFlow.js
_Source: [Brain.js](https://brain.js.org/)_

**Option 4: ONNX.js (pour modèles pré-entraînés)**
- Charge des modèles ONNX exportés de PyTorch/TensorFlow
- Backends : CPU, WebAssembly, WebGL
- Utile si on veut entraîner en Python puis déployer en JS
_Source: [ONNX.js](https://github.com/microsoft/onnxjs)_

### Deno FFI + Rust ML Libraries

**Bibliothèques Rust pour ML :**
| Library | Description | BLAS Support |
|---------|-------------|--------------|
| **neuronika** | Tenseurs et neural networks pure Rust | Non |
| **tract** | Inference ONNX/TF, no-nonsense | Optionnel |
| **tch-rs** | Bindings PyTorch C++ API | Via libtorch |
| **candle** | ML framework by Hugging Face | Oui |

**deno_bindgen** permet de créer des bindings Rust↔Deno avec :
- Génération automatique de types TypeScript
- JIT compiled bindings pour performance optimale
- Support des types complexes (structs, vecteurs)
_Source: [deno_bindgen](https://github.com/denoland/deno_bindgen), [Calling Rust from Deno](https://medium.com/deno-the-complete-reference/foreign-function-interface-calling-rust-functions-from-deno-8abd7e3cf06)_

### GRU Architecture - Rappel Technique

**Formules GRU :**
```
Reset Gate:    R_t = σ(X_t·W_xr + H_{t-1}·W_hr + b_r)
Update Gate:   Z_t = σ(X_t·W_xz + H_{t-1}·W_hz + b_z)
Candidate:     H̃_t = tanh(X_t·W_xh + (R_t ⊙ H_{t-1})·W_hh + b_h)
Hidden State:  H_t = Z_t ⊙ H_{t-1} + (1 - Z_t) ⊙ H̃_t
```

**Paramètres pour embedding 768-dim, hidden 256-dim :**
- W_xz, W_xr, W_xh : [768, 256] = 589,824 params (×3)
- W_hz, W_hr, W_hh : [256, 256] = 196,608 params (×3)
- Biais : 256 × 3 = 768 params
- **Total GRU : ~2.4M paramètres**

_Source: [Dive into Deep Learning - GRU](https://d2l.ai/chapter_recurrent-modern/gru.html)_

### Goal/Termination Detection Approaches

**Approche 1: Token EOS (End-of-Sequence)**
- Ajouter un token spécial `<EOS>` dans le vocabulaire des outils
- Le modèle apprend à prédire EOS quand la séquence doit s'arrêter
- Standard dans seq2seq (machine translation, etc.)
_Source: [Seq2Seq Learning](https://d2l.ai/chapter_recurrent-modern/seq2seq.html)_

**Approche 2: Sortie binaire séparée (Recommandée pour notre cas)**
- GRU produit hidden state H_t
- Deux têtes de sortie :
  - `nextToolScores = softmax(W_tool · H_t)` → distribution sur les outils
  - `terminationProb = sigmoid(W_term · H_t)` → probabilité de fin
- Avantage : Pas besoin de modifier le vocabulaire d'outils

**Approche 3: Critère externe**
- Max length (safety)
- Entropy-based : haute entropie = incertitude = peut-être s'arrêter
- Timeout ou budget de compute

_Source: [Stop Sequences in LLMs](https://systems-analysis.ru/eng/Stop_sequences_(language_models))_

### Technology Adoption Recommendation

**Pour notre TransitionModel, je recommande :**

1. **Implémentation from scratch en TypeScript** (comme Micrograd-TS)
   - Contrôle total sur l'architecture
   - Pas de dépendance lourde (TensorFlow.js = ~3MB)
   - S'intègre naturellement avec SHGAT existant
   - ~500 lignes de code estimées

2. **Deno FFI + Rust** pour les opérations matricielles si performance critique
   - BLAS via candle ou ndarray-rust
   - Seulement si le pur TypeScript est trop lent

3. **Terminaison via sortie binaire séparée**
   - Plus flexible que EOS token
   - Permet de scorer simultanément le next tool ET la probabilité de fin

---

## Migration SHGAT vers TensorFlow.js

### Analyse de l'existant

**SHGAT actuel : ~14K LOC**
| Module | LOC | Rôle |
|--------|-----|------|
| training/* | 3100 | Backward passes manuels |
| message-passing/* | 2500 | V→E, E→V, orchestration |
| utils/math.ts | 388 | matmul, softmax, activations |
| utils/blas-ffi.ts | 511 | BLAS via Deno FFI |
| core/* | 3500 | Types, orchestration, serialization |
| attention/* | 1000 | K-head scoring |

### Ce qui change avec TensorFlow.js

**Disparaît complètement :**
- `utils/math.ts` → `tf.matMul()`, `tf.softmax()`, `tf.sigmoid()`
- `utils/blas-ffi.ts` → GPU via WebGL backend
- `training/*` backward passes → `tf.variableGrads()` autograd

**Réécrit avec TF.js ops :**
- `message-passing/*` → Exprimé avec `tf.matMul()`, `tf.gather()`, attention
- `attention/*` → `tf.layers.multiHeadAttention()` ou custom

**Garde (adapte) :**
- `core/types.ts` → Types inchangés
- `core/shgat.ts` → Orchestration, adapte les appels
- `graph/*` → Structure graphe (incidence matrix → tenseurs)

### TensorFlow GNN (Python) - Référence

Google a publié [TF-GNN 1.0](https://blog.tensorflow.org/2024/02/graph-neural-networks-in-tensorflow.html) en février 2024 pour Python. Pas de version JS, mais montre l'approche :

> "GNNs leverage both the graph's connectivity and the input features on nodes and edges."

Le message passing GAT s'exprime avec des ops primitives :
1. **Projection** : `H_proj = tf.matMul(H, W)`
2. **Attention scores** : `scores = tf.matMul(Q, K.T) / sqrt(d)`
3. **Softmax par voisinage** : `weights = sparseSegmentSoftmax(scores)`
4. **Aggregation** : `output = tf.gather() + weighted sum`

_Source: [TensorFlow GNN GitHub](https://github.com/tensorflow/gnn), [GAT Keras example](https://keras.io/examples/graph/gat_node_classification/)_

### Stratégie de migration

**Phase 1 : Fondations TF.js (1-2 jours)**
```typescript
// Nouveau fichier : lib/shgat/src/tf/backend.ts
import * as tf from "npm:@tensorflow/tfjs";

// Initialiser le backend (WebGL si disponible)
await tf.ready();
console.log("TF.js backend:", tf.getBackend()); // 'webgl' ou 'cpu'
```

**Phase 2 : Remplacer math.ts (2-3 jours)**
```typescript
// Avant (math.ts)
export function matmul(A: number[][], B: number[][]): number[][] {
  // 50 lignes de code JS...
}

// Après (tf-ops.ts)
export function matmul(A: tf.Tensor2D, B: tf.Tensor2D): tf.Tensor2D {
  return tf.matMul(A, B);
}
```

**Phase 3 : Message Passing en TF.js (3-4 jours)**
```typescript
// V→E phase avec TF.js
function vertexToEdge(
  H: tf.Tensor2D,      // [numTools, embDim]
  incidence: tf.Tensor2D, // [numTools, numCaps] sparse
  W: tf.Variable       // [embDim, hiddenDim]
): tf.Tensor2D {
  const H_proj = tf.matMul(H, W);
  // Attention et aggregation...
  return E_new;
}
```

**Phase 4 : Training avec autograd (2-3 jours)**
```typescript
// Avant : 3000+ lignes de backward passes manuels
// Après :
const optimizer = tf.train.adam(0.001);

function trainStep(examples: TrainingExample[]) {
  const { grads, value: loss } = tf.variableGrads(() => {
    const scores = model.forward(examples);
    return tf.losses.softmaxCrossEntropy(labels, scores);
  });
  optimizer.applyGradients(grads);
  return loss;
}
```

**Phase 5 : Ajouter GRU TransitionModel (2 jours)**
```typescript
// Nouveau module : lib/shgat/src/transition/gru-model.ts
const gru = tf.layers.gru({
  units: 256,
  returnState: true,
  recurrentActivation: 'sigmoid'
});

const denseNext = tf.layers.dense({ units: numTools, activation: 'softmax' });
const denseTerm = tf.layers.dense({ units: 1, activation: 'sigmoid' });
```

### Estimation effort total

| Phase | Description | Jours |
|-------|-------------|-------|
| 1 | Setup TF.js + Deno | 1-2 |
| 2 | Remplacer math.ts | 2-3 |
| 3 | Message passing TF.js | 3-4 |
| 4 | Training autograd | 2-3 |
| 5 | GRU TransitionModel | 2 |
| 6 | Tests + validation | 2-3 |
| **Total** | | **12-17 jours** |

### Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| Performance WebGL vs BLAS | Benchmark avant/après, fallback CPU |
| Régression SHGAT | Tests de non-régression sur accuracy |
| Memory leaks TF.js | `tf.tidy()` pour cleanup tenseurs |
| Deno + TF.js edge cases | POC rapide avant migration complète |

### Recommandation

**Faire un POC (1-2 jours) d'abord :**
1. Importer TF.js dans Deno
2. Implémenter un forward pass simple
3. Vérifier GPU fonctionne
4. Benchmark vs BLAS actuel

Si le POC est positif → migration complète.

---

## Integration Patterns Analysis

### Data Flow : SHGAT → TransitionModel

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW COMPLET                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Intent ──┬──▶ SHGAT.forward()                                          │
│           │        │                                                     │
│           │        ▼                                                     │
│           │    H_enriched (tools)    ← Message Passing V→E→V            │
│           │    E_enriched (caps)                                         │
│           │        │                                                     │
│           │        ▼                                                     │
│           │    K-Head Attention                                          │
│           │        │                                                     │
│           │        ▼                                                     │
│           │    firstTool = argmax(scores)  ← Top-1 SHGAT                │
│           │                                                              │
│           └──▶ TransitionModel.predict(intent, [firstTool])             │
│                    │                                                     │
│                    ▼                                                     │
│                ┌─────────────────────────────────────────┐              │
│                │  LOOP until terminationProb > 0.7       │              │
│                │    │                                    │              │
│                │    ▼                                    │              │
│                │  GRU.forward(toolEmbeddings)           │              │
│                │    │                                    │              │
│                │    ▼                                    │              │
│                │  hiddenState = GRU output              │              │
│                │    │                                    │              │
│                │    ▼                                    │              │
│                │  combined = concat(intent, hiddenState)│              │
│                │    │                                    │              │
│                │    ├──▶ nextToolScores (softmax)       │              │
│                │    └──▶ terminationProb (sigmoid)       │              │
│                │         │                               │              │
│                │         ▼                               │              │
│                │    path.push(argmax(nextToolScores))   │              │
│                └─────────────────────────────────────────┘              │
│                    │                                                     │
│                    ▼                                                     │
│                DAG = path                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tensor ↔ Array Conversion API

**Création tenseurs depuis arrays JS :**
```typescript
// Array JS → Tensor
const H_array: number[][] = [[0.1, 0.2], [0.3, 0.4]];  // embeddings
const H_tensor = tf.tensor2d(H_array);

// Ou avec TypedArray (plus performant)
const data = new Float32Array([0.1, 0.2, 0.3, 0.4]);
const H_tensor = tf.tensor2d(data, [2, 2]);
```

**Récupération arrays depuis tenseurs :**
```typescript
// Async (recommandé pour prod)
const result_array = await tensor.array();  // number[][]

// Sync (éviter en prod - bloque le thread)
const result_array = tensor.arraySync();
```

_Source: [TensorFlow.js Tensors Guide](https://www.tensorflow.org/js/guide/tensors_operations)_

### Memory Management Pattern

**CRITIQUE** : TF.js n'a pas de garbage collection automatique pour les tenseurs GPU.

**Pattern 1 : tf.tidy() pour opérations synchrones**
```typescript
const result = tf.tidy(() => {
  const a = tf.tensor2d([[1, 2], [3, 4]]);
  const b = tf.tensor2d([[5, 6], [7, 8]]);
  const c = tf.matMul(a, b);  // Tenseur intermédiaire
  return c;  // Seul c survit, a et b sont disposés
});
```

**Pattern 2 : tf.dispose() pour opérations async**
```typescript
async function trainStep() {
  const tensorsToDispose: tf.Tensor[] = [];

  const input = tf.tensor2d(data);
  tensorsToDispose.push(input);

  const output = await model.predict(input);
  tensorsToDispose.push(output);

  // Cleanup explicite
  tensorsToDispose.forEach(t => t.dispose());
}
```

**Pattern 3 : Monitoring mémoire**
```typescript
console.log('Tensors:', tf.memory().numTensors);
console.log('Bytes:', tf.memory().numBytes);
```

_Source: [TF.js Memory Management](https://saturncloud.io/blog/how-to-optimize-memory-management-in-tensorflowjs-for-tfmodel/)_

### Interface SHGAT ↔ TensorFlow.js

**Avant (SHGAT actuel) :**
```typescript
// Types existants
interface ForwardResult {
  H: number[][];  // Tool embeddings [numTools, embDim]
  E: number[][];  // Cap embeddings [numCaps, embDim]
  cache: ForwardCache;
}

// Appels dans shgat.ts
const H_proj = math.matmulTranspose(H, W);  // Custom
```

**Après (SHGAT + TF.js) :**
```typescript
// Nouveaux types
interface ForwardResultTF {
  H: tf.Tensor2D;  // Tool embeddings
  E: tf.Tensor2D;  // Cap embeddings
  cache: ForwardCacheTF;
}

// Variables persistantes (poids du modèle)
const W_source = tf.variable(tf.randomNormal([embDim, hiddenDim]));
const W_target = tf.variable(tf.randomNormal([embDim, hiddenDim]));

// Forward avec tf.tidy()
function forward(): ForwardResultTF {
  return tf.tidy(() => {
    const H_proj = tf.matMul(H, W_source);
    // ... message passing ...
    return { H: H_new, E: E_new, cache };
  });
}
```

### Interface TransitionModel

```typescript
// lib/shgat/src/transition/types.ts
interface TransitionModelConfig {
  embeddingDim: number;     // 768 (même que SHGAT)
  hiddenDim: number;        // 256
  numTools: number;         // Dynamique
  terminationThreshold: number; // 0.7
  maxPathLength: number;    // 10 (safety)
}

interface TransitionPrediction {
  nextToolScores: tf.Tensor1D;  // [numTools] probabilities
  terminationProb: tf.Scalar;   // 0-1
  hiddenState: tf.Tensor1D;     // [hiddenDim] for next step
}

// lib/shgat/src/transition/gru-model.ts
class TransitionModel {
  private gru: tf.LayersModel;
  private denseNext: tf.layers.Layer;
  private denseTerm: tf.layers.Layer;

  predict(
    intentEmb: tf.Tensor1D,
    contextToolIds: string[],
    toolEmbeddings: Map<string, tf.Tensor1D>
  ): TransitionPrediction;

  train(examples: TransitionExample[]): { loss: number };
}
```

### Shared Embedding Layer

SHGAT et TransitionModel partagent les mêmes embeddings d'outils :

```typescript
// Singleton pour les embeddings
class EmbeddingStore {
  private toolEmbs: Map<string, tf.Variable>;  // Apprenables
  private capEmbs: Map<string, tf.Variable>;

  getToolEmbedding(toolId: string): tf.Tensor1D;
  getCapEmbedding(capId: string): tf.Tensor1D;

  // Batch pour efficacité
  getToolEmbeddingsBatch(toolIds: string[]): tf.Tensor2D;
}

// Utilisé par SHGAT pour message passing
// Utilisé par TransitionModel pour GRU input
```

### Training Integration

```typescript
// Training unifié SHGAT + TransitionModel
async function trainBatch(
  shgatExamples: TrainingExample[],
  transitionExamples: TransitionExample[]
) {
  const optimizer = tf.train.adam(0.001);

  const { grads, value: totalLoss } = tf.variableGrads(() => {
    // Loss SHGAT (relevance scoring)
    const shgatLoss = computeShgatLoss(shgatExamples);

    // Loss Transition (sequence prediction + termination)
    const transitionLoss = computeTransitionLoss(transitionExamples);

    // Pondération
    return tf.add(
      tf.mul(shgatLoss, 0.5),
      tf.mul(transitionLoss, 0.5)
    );
  });

  optimizer.applyGradients(grads);
  return totalLoss.arraySync();
}
```

### Serialization Pattern

```typescript
// Sauvegarde modèle
async function saveModel(path: string) {
  // SHGAT params
  const shgatWeights = {
    W_source: W_source.arraySync(),
    W_target: W_target.arraySync(),
    // ...
  };

  // TransitionModel (utilise l'API TF.js native)
  await transitionModel.gru.save(`file://${path}/gru`);

  // Embeddings
  const embeddings = embeddingStore.serialize();

  await Deno.writeTextFile(
    `${path}/shgat-params.json`,
    JSON.stringify({ shgatWeights, embeddings })
  );
}

// Chargement
async function loadModel(path: string) {
  const gruModel = await tf.loadLayersModel(`file://${path}/gru/model.json`);
  // ...
}
```

---

## Architectural Patterns Analysis

### Pattern FTI : Feature / Training / Inference

L'architecture ML moderne sépare trois pipelines distincts :

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FTI ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │   FEATURE       │    │   TRAINING      │    │   INFERENCE     │     │
│  │   PIPELINE      │    │   PIPELINE      │    │   PIPELINE      │     │
│  ├─────────────────┤    ├─────────────────┤    ├─────────────────┤     │
│  │ • Embeddings    │    │ • Batch loader  │    │ • Model loader  │     │
│  │ • Normalization │───▶│ • Autograd      │───▶│ • Real-time     │     │
│  │ • Feature store │    │ • Checkpoints   │    │ • Low latency   │     │
│  │ • Validation    │    │ • Metrics       │    │ • Batching      │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Application à notre système :**

| Pipeline | Notre implémentation |
|----------|---------------------|
| Feature | `EmbeddingStore` - tool/cap embeddings préchargés |
| Training | `SHGATTrainer` + `TransitionTrainer` avec `tf.variableGrads()` |
| Inference | `SHGAT.forward()` + `TransitionModel.predict()` optimisés |

_Source: [ML System Architecture](https://www.hopsworks.ai/post/ml-system-architecture-design-patterns)_

### TensorFlow.js Model Patterns

**Pattern 1: Sequential API (Simple, linéaire)**
```typescript
const model = tf.sequential({
  layers: [
    tf.layers.dense({ inputShape: [768], units: 256, activation: 'relu' }),
    tf.layers.dense({ units: 128, activation: 'relu' }),
    tf.layers.dense({ units: numTools, activation: 'softmax' })
  ]
});
```
**Usage**: MLP simples, feedforward uniquement.

**Pattern 2: Functional API (Flexible, multi-input/output)** ⭐ Recommandé
```typescript
const intentInput = tf.input({ shape: [768], name: 'intent' });
const contextInput = tf.input({ shape: [null, 768], name: 'context' });

// Branch GRU pour context
const gruOutput = tf.layers.gru({ units: 256, returnState: true })
  .apply(contextInput);

// Combine intent + GRU hidden state
const combined = tf.layers.concatenate().apply([intentInput, gruOutput[1]]);

// Deux sorties
const nextTool = tf.layers.dense({ units: numTools, activation: 'softmax', name: 'next' })
  .apply(combined);
const termination = tf.layers.dense({ units: 1, activation: 'sigmoid', name: 'term' })
  .apply(combined);

const model = tf.model({
  inputs: [intentInput, contextInput],
  outputs: [nextTool, termination]
});
```
**Usage**: Notre TransitionModel (multi-input, multi-output).

**Pattern 3: Model Subclassing (Contrôle total)**
```typescript
class TransitionModel extends tf.LayersModel {
  private gru: tf.layers.Layer;
  private denseNext: tf.layers.Layer;
  private denseTerm: tf.layers.Layer;

  constructor() {
    super({});
    this.gru = tf.layers.gru({ units: 256, returnState: true });
    this.denseNext = tf.layers.dense({ units: numTools, activation: 'softmax' });
    this.denseTerm = tf.layers.dense({ units: 1, activation: 'sigmoid' });
  }

  call(inputs: tf.Tensor[], training?: boolean): tf.Tensor[] {
    // Custom forward logic
  }
}
```
**Usage**: Quand le Functional API ne suffit pas (rarement nécessaire).

_Source: [TensorFlow.js Guide](https://www.tensorflow.org/js/guide/models_and_layers)_

### Pattern: Modular Layer Composition

Pour SHGAT, on compose des modules réutilisables :

```typescript
// lib/shgat/src/tf/layers/
├── attention-layer.ts      // Multi-head attention
├── message-passing-v2e.ts  // Vertex → Edge
├── message-passing-e2v.ts  // Edge → Vertex
├── k-head-scorer.ts        // K-head scoring
└── gru-transition.ts       // GRU + heads

// Chaque module est un tf.layers.Layer custom
class MultiLevelMessagePassing extends tf.layers.Layer {
  static className = 'MultiLevelMessagePassing';

  constructor(config: MessagePassingConfig) {
    super(config);
    this.v2e = new VertexToEdgeLayer(config);
    this.e2v = new EdgeToVertexLayer(config);
  }

  call(inputs: tf.Tensor[]): tf.Tensor[] {
    const [H, E, incidence] = inputs;
    const E_new = this.v2e.call([H, incidence]);
    const H_new = this.e2v.call([E_new, incidence]);
    return [H_new, E_new];
  }

  getConfig() {
    return { ...super.getConfig(), /* custom config */ };
  }
}

// Enregistrement pour sérialisation
tf.serialization.registerClass(MultiLevelMessagePassing);
```

### Pattern: Dependency Injection pour TF.js

```typescript
// Injection du backend TF.js
interface TFBackend {
  matMul(a: tf.Tensor2D, b: tf.Tensor2D): tf.Tensor2D;
  softmax(x: tf.Tensor): tf.Tensor;
  // ...
}

class TFJSBackend implements TFBackend {
  matMul(a: tf.Tensor2D, b: tf.Tensor2D): tf.Tensor2D {
    return tf.matMul(a, b);
  }
  softmax(x: tf.Tensor): tf.Tensor {
    return tf.softmax(x);
  }
}

// Permet de mocker pour les tests
class MockBackend implements TFBackend {
  matMul(a: tf.Tensor2D, b: tf.Tensor2D): tf.Tensor2D {
    return tf.zeros([a.shape[0], b.shape[1]]);
  }
  // ...
}

// Usage
class SHGAT {
  constructor(private backend: TFBackend = new TFJSBackend()) {}

  forward(H: tf.Tensor2D): tf.Tensor2D {
    return this.backend.matMul(H, this.W);
  }
}
```

### Pattern: Training vs Inference Mode

```typescript
class TransitionModel {
  private training = false;

  setTraining(mode: boolean) {
    this.training = mode;
  }

  predict(intent: tf.Tensor1D, context: tf.Tensor2D): TransitionPrediction {
    return tf.tidy(() => {
      // Dropout seulement en training
      let h = this.gru.call(context, { training: this.training });

      if (this.training) {
        h = tf.dropout(h, 0.1);  // 10% dropout
      }

      return {
        nextToolScores: this.denseNext.call(h),
        terminationProb: this.denseTerm.call(h)
      };
    });
  }
}
```

### Pattern: Incremental State (GRU Stateful)

Pour l'inférence step-by-step sans recalculer toute la séquence :

```typescript
class StatefulTransitionModel {
  private hiddenState: tf.Tensor2D | null = null;

  reset() {
    this.hiddenState?.dispose();
    this.hiddenState = null;
  }

  // Step-by-step inference
  step(toolEmbedding: tf.Tensor1D): TransitionPrediction {
    return tf.tidy(() => {
      const input = toolEmbedding.expandDims(0).expandDims(0);  // [1, 1, embDim]

      const [output, newState] = this.gru.call(input, {
        initialState: this.hiddenState ? [this.hiddenState] : undefined
      }) as [tf.Tensor, tf.Tensor];

      // Update state (hors tidy pour persistance)
      this.hiddenState?.dispose();
      this.hiddenState = newState.clone();

      return {
        nextToolScores: this.denseNext.call(output.squeeze()),
        terminationProb: this.denseTerm.call(output.squeeze())
      };
    });
  }
}

// Usage pour inférence
const model = new StatefulTransitionModel();
model.reset();

const path: string[] = [firstTool];
while (true) {
  const emb = embeddingStore.getToolEmbedding(path[path.length - 1]);
  const pred = model.step(emb);

  if (pred.terminationProb.arraySync() > 0.7) break;
  path.push(argmax(pred.nextToolScores));
}
model.reset();  // Cleanup
```

### Pattern: Batched Inference

Pour scorer plusieurs candidats en parallèle :

```typescript
// Au lieu de boucler sur les candidats
// ❌ Lent
for (const candidate of candidates) {
  scores.push(model.score(intent, candidate));
}

// ✅ Batch
function batchScore(
  intent: tf.Tensor1D,
  candidates: tf.Tensor2D  // [numCandidates, embDim]
): tf.Tensor1D {
  return tf.tidy(() => {
    // Broadcast intent
    const intentBroadcast = intent.expandDims(0).tile([candidates.shape[0], 1]);

    // Concat et forward en une passe
    const combined = tf.concat([intentBroadcast, candidates], 1);
    return this.scoreLayer.call(combined);
  });
}
```

### Architecture Finale Proposée

```
lib/shgat/src/
├── tf/
│   ├── backend.ts           # Initialisation TF.js
│   ├── ops.ts               # Wrappers ops communs
│   └── memory.ts            # Utilities tf.tidy/dispose
│
├── layers/
│   ├── attention.ts         # Multi-head attention
│   ├── message-passing.ts   # V→E, E→V
│   └── k-head-scorer.ts     # Scoring
│
├── transition/
│   ├── gru-model.ts         # TransitionModel
│   ├── stateful-model.ts    # Version step-by-step
│   └── types.ts             # Interfaces
│
├── core/
│   ├── shgat.ts             # Orchestration (adapté)
│   └── types.ts             # Types existants
│
├── training/
│   ├── unified-trainer.ts   # SHGAT + Transition
│   ├── losses.ts            # Loss functions
│   └── metrics.ts           # Accuracy, F1, etc.
│
└── embeddings/
    └── store.ts             # EmbeddingStore partagé
```

### Checklist Migration

- [ ] Setup TF.js Deno (`npm:@tensorflow/tfjs`)
- [ ] POC: forward pass simple avec GPU
- [ ] Créer `tf/backend.ts` et `tf/ops.ts`
- [ ] Migrer `math.ts` → ops TF.js
- [ ] Créer `layers/message-passing.ts`
- [ ] Migrer SHGAT.forward()
- [ ] Créer `transition/gru-model.ts`
- [ ] Créer `training/unified-trainer.ts` avec autograd
- [ ] Tests de non-régression
- [ ] Benchmark performance

---

## Implementation Research (POC)

### Setup TensorFlow.js dans Deno

**Import via npm specifier :**
```typescript
// lib/shgat/src/tf/backend.ts
import * as tf from "npm:@tensorflow/tfjs";

// Optionnel: Backend WebGPU pour GPU (Deno supporte WebGPU nativement)
import "npm:@tensorflow/tfjs-backend-webgpu";

export async function initTensorFlow(): Promise<string> {
  await tf.ready();

  // Essayer WebGPU d'abord, sinon CPU
  try {
    await tf.setBackend("webgpu");
  } catch {
    console.warn("WebGPU not available, falling back to CPU");
    await tf.setBackend("cpu");
  }

  return tf.getBackend();
}

export { tf };
```

_Source: [Deno npm Compatibility](https://docs.deno.com/runtime/fundamentals/node/), [TensorFlow.js Platform Guide](https://www.tensorflow.org/js/guide/platform_environment)_

### Backends disponibles

| Backend | Disponibilité | Performance | Notes |
|---------|--------------|-------------|-------|
| `cpu` | Partout | 1x (baseline) | Toujours disponible |
| `wasm` | Partout | 2-10x | Bon compromis, pas de GPU |
| `webgl` | Browser only | 10-100x | **Pas dispo en Deno server** |
| `webgpu` | Deno, Chrome 113+ | 10-100x | Recommandé pour Deno |
| `node` | Node.js | CUDA | Nécessite libtensorflow |

**Pour notre cas (Deno serveur) :**
- **Production avec GPU** : `webgpu` backend
- **CI/Tests** : `cpu` ou `wasm` backend
- **Fallback** : `wasm` (2-10x plus rapide que CPU vanilla)

_Source: [TensorFlow.js WebGPU](https://www.npmjs.com/package/@tensorflow/tfjs-backend-webgpu), [Deno 1.8 WebGPU](https://deno.com/blog/v1.8)_

### POC Script Complet

```typescript
// poc/tfjs-deno-poc.ts
// Run: deno run --unstable-webgpu --allow-read poc/tfjs-deno-poc.ts

import * as tf from "npm:@tensorflow/tfjs";

// Configuration
const EMBEDDING_DIM = 768;
const HIDDEN_DIM = 256;
const NUM_TOOLS = 100;
const BATCH_SIZE = 32;

async function main() {
  console.log("=== TensorFlow.js + Deno POC ===\n");

  // 1. Init backend
  await tf.ready();
  console.log("Backend:", tf.getBackend());
  console.log("Memory:", tf.memory());

  // 2. Test basic ops
  console.log("\n--- Basic Ops ---");
  const a = tf.randomNormal([BATCH_SIZE, EMBEDDING_DIM]);
  const b = tf.randomNormal([EMBEDDING_DIM, HIDDEN_DIM]);

  const startMatmul = performance.now();
  const c = tf.matMul(a, b);
  await c.data();  // Force sync
  console.log(`matMul [${BATCH_SIZE}, ${EMBEDDING_DIM}] x [${EMBEDDING_DIM}, ${HIDDEN_DIM}]: ${(performance.now() - startMatmul).toFixed(2)}ms`);

  // 3. Test GRU layer
  console.log("\n--- GRU Layer ---");
  const gru = tf.layers.gru({
    units: HIDDEN_DIM,
    returnState: true,
    returnSequences: false,
    recurrentActivation: "sigmoid",
    activation: "tanh"
  });

  const seqInput = tf.randomNormal([BATCH_SIZE, 5, EMBEDDING_DIM]);  // [batch, seq_len, features]

  const startGRU = performance.now();
  const gruOutput = gru.apply(seqInput) as tf.Tensor[];
  await gruOutput[0].data();
  console.log(`GRU forward [${BATCH_SIZE}, 5, ${EMBEDDING_DIM}] → [${BATCH_SIZE}, ${HIDDEN_DIM}]: ${(performance.now() - startGRU).toFixed(2)}ms`);
  console.log("GRU output shape:", gruOutput[0].shape);
  console.log("GRU state shape:", gruOutput[1].shape);

  // 4. Test autograd
  console.log("\n--- Autograd ---");
  const W = tf.variable(tf.randomNormal([EMBEDDING_DIM, NUM_TOOLS]));
  const x = tf.randomNormal([BATCH_SIZE, EMBEDDING_DIM]);
  const yTrue = tf.oneHot(tf.randomUniform([BATCH_SIZE], 0, NUM_TOOLS, "int32"), NUM_TOOLS);

  const startGrad = performance.now();
  const { grads, value: loss } = tf.variableGrads(() => {
    const logits = tf.matMul(x, W);
    return tf.losses.softmaxCrossEntropy(yTrue, logits);
  });
  await loss.data();
  console.log(`Autograd (forward + backward): ${(performance.now() - startGrad).toFixed(2)}ms`);
  console.log("Loss:", (await loss.data())[0].toFixed(4));
  console.log("Gradient shape:", grads.W.shape);

  // 5. Test optimizer step
  console.log("\n--- Optimizer ---");
  const optimizer = tf.train.adam(0.001);

  const startOptim = performance.now();
  optimizer.applyGradients(grads);
  console.log(`Apply gradients: ${(performance.now() - startOptim).toFixed(2)}ms`);

  // 6. Memory management
  console.log("\n--- Memory ---");
  console.log("Before dispose:", tf.memory().numTensors, "tensors");

  tf.dispose([a, b, c, seqInput, ...gruOutput, x, yTrue, loss]);
  Object.values(grads).forEach(g => g.dispose());

  console.log("After dispose:", tf.memory().numTensors, "tensors");

  // 7. Full TransitionModel mock
  console.log("\n--- TransitionModel Mock ---");
  await testTransitionModel();

  console.log("\n=== POC Complete ===");
}

async function testTransitionModel() {
  // Simule notre TransitionModel
  const gruLayer = tf.layers.gru({
    units: HIDDEN_DIM,
    returnState: true
  });
  const denseNext = tf.layers.dense({ units: NUM_TOOLS, activation: "softmax" });
  const denseTerm = tf.layers.dense({ units: 1, activation: "sigmoid" });

  // Simulate intent + context
  const intent = tf.randomNormal([1, EMBEDDING_DIM]);
  const contextEmbeddings = tf.randomNormal([1, 3, EMBEDDING_DIM]);  // 3 tools in context

  const start = performance.now();

  const result = tf.tidy(() => {
    // GRU sur context
    const [gruOut, gruState] = gruLayer.apply(contextEmbeddings) as tf.Tensor[];

    // Combine intent + state
    const combined = tf.concat([intent, gruState], 1);  // [1, embDim + hiddenDim]

    // Project to hidden
    const hidden = tf.layers.dense({ units: HIDDEN_DIM, activation: "relu" })
      .apply(combined) as tf.Tensor;

    // Two heads
    const nextScores = denseNext.apply(hidden) as tf.Tensor;
    const termProb = denseTerm.apply(hidden) as tf.Tensor;

    return { nextScores, termProb };
  });

  await result.nextScores.data();
  console.log(`TransitionModel inference: ${(performance.now() - start).toFixed(2)}ms`);
  console.log("Next tool scores shape:", result.nextScores.shape);
  console.log("Termination prob:", (await result.termProb.data())[0].toFixed(4));

  tf.dispose([intent, contextEmbeddings, result.nextScores, result.termProb]);
}

main().catch(console.error);
```

### Commande d'exécution

```bash
# Avec WebGPU (GPU)
deno run --unstable-webgpu --allow-read poc/tfjs-deno-poc.ts

# Sans WebGPU (CPU only)
deno run --allow-read poc/tfjs-deno-poc.ts
```

### Benchmarks attendus

Basé sur les données TensorFlow.js :

| Opération | CPU | WASM | WebGPU |
|-----------|-----|------|--------|
| matMul [32, 768] x [768, 256] | ~5ms | ~1ms | ~0.1ms |
| GRU forward [32, 5, 768] | ~50ms | ~10ms | ~1ms |
| Full backward pass | ~100ms | ~20ms | ~2ms |

_Note: Valeurs estimées, le POC confirmera._

### Integration avec SHGAT existant

**Fichier de migration progressif :**
```typescript
// lib/shgat/src/utils/math-tf.ts
import { tf } from "../tf/backend.ts";

/**
 * Drop-in replacement pour math.ts avec TF.js
 * Permet migration progressive: importer math-tf au lieu de math
 */

export function matmul(A: number[][], B: number[][]): number[][] {
  return tf.tidy(() => {
    const tA = tf.tensor2d(A);
    const tB = tf.tensor2d(B);
    const result = tf.matMul(tA, tB);
    return result.arraySync() as number[][];
  });
}

export function softmax(x: number[]): number[] {
  return tf.tidy(() => {
    const tensor = tf.tensor1d(x);
    return tf.softmax(tensor).arraySync() as number[];
  });
}

export function sigmoid(x: number[]): number[] {
  return tf.tidy(() => {
    const tensor = tf.tensor1d(x);
    return tf.sigmoid(tensor).arraySync() as number[];
  });
}

// ... autres fonctions
```

**Migration dans SHGAT :**
```typescript
// lib/shgat/src/core/shgat.ts

// Avant:
// import * as math from "../utils/math.ts";

// Après (migration progressive):
import * as math from "../utils/math-tf.ts";

// Le reste du code reste identique grâce au drop-in replacement
```

### Test de non-régression

```typescript
// tests/shgat-tfjs-regression.test.ts
import { assertEquals } from "jsr:@std/assert";
import * as mathOld from "../lib/shgat/src/utils/math.ts";
import * as mathNew from "../lib/shgat/src/utils/math-tf.ts";

Deno.test("matmul regression", () => {
  const A = [[1, 2], [3, 4]];
  const B = [[5, 6], [7, 8]];

  const oldResult = mathOld.matmul(A, B);
  const newResult = mathNew.matmul(A, B);

  // Tolérance pour floating point
  for (let i = 0; i < oldResult.length; i++) {
    for (let j = 0; j < oldResult[0].length; j++) {
      const diff = Math.abs(oldResult[i][j] - newResult[i][j]);
      assertEquals(diff < 1e-5, true, `Mismatch at [${i}][${j}]`);
    }
  }
});
```

### deno.json updates

```json
{
  "imports": {
    "@tensorflow/tfjs": "npm:@tensorflow/tfjs@4.22.0",
    "@tensorflow/tfjs-backend-webgpu": "npm:@tensorflow/tfjs-backend-webgpu@4.22.0"
  },
  "tasks": {
    "poc:tfjs": "deno run --unstable-webgpu --allow-read poc/tfjs-deno-poc.ts",
    "test:tfjs-regression": "deno test --allow-read tests/shgat-tfjs-regression.test.ts"
  }
}
```

### Risques identifiés pour le POC

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| WebGPU pas dispo en CI | Haute | Moyen | Fallback WASM dans CI |
| Différences numériques float32 vs float64 | Moyenne | Faible | Tests de tolérance |
| Memory leaks en training loop | Moyenne | Haut | tf.tidy() strict |
| TF.js version incompatibility Deno | Faible | Haut | Pin version dans deno.json |

---

## Risks & Recommendations

### Risk Matrix

| # | Risque | Probabilité | Impact | Score | Mitigation |
|---|--------|-------------|--------|-------|------------|
| R1 | **Performance WebGPU < BLAS FFI** | Moyenne | Haut | 🟠 | POC benchmark obligatoire avant migration |
| R2 | **Memory leaks TF.js** | Haute | Moyen | 🟠 | `tf.tidy()` strict, monitoring `tf.memory()` |
| R3 | **Régression accuracy SHGAT** | Faible | Critique | 🟡 | Tests non-régression, métriques avant/après |
| R4 | **WebGPU indisponible en CI** | Haute | Faible | 🟢 | Fallback WASM, tests CPU acceptables |
| R5 | **Breaking changes TF.js** | Faible | Moyen | 🟢 | Pin version, dépendances lock |
| R6 | **Complexité migration > estimée** | Moyenne | Moyen | 🟠 | Migration progressive, phases claires |
| R7 | **GRU insuffisant pour séquences complexes** | Faible | Haut | 🟡 | Évaluer sur dataset réel avant engagement |

### Recommendations

#### 1. POC OBLIGATOIRE (1-2 jours)

**Avant tout engagement de migration :**

```bash
# Créer poc/tfjs-deno-poc.ts avec le script documenté
# Valider:
# - TF.js s'importe correctement dans Deno
# - WebGPU backend fonctionne
# - Performance acceptable vs BLAS actuel
# - Pas de memory leaks sur 1000 iterations

deno run --unstable-webgpu poc/tfjs-deno-poc.ts
```

**Critères GO/NO-GO :**
| Critère | Seuil GO |
|---------|----------|
| matMul perf | ≤ 2x BLAS actuel |
| GRU forward | < 10ms pour batch=32 |
| Memory stable | ≤ 5% croissance sur 1000 iter |
| Import time | < 3s |

#### 2. Migration Progressive

**Ne PAS tout migrer d'un coup.**

```
Phase 1: math.ts → math-tf.ts (drop-in)
         ↓ Valider
Phase 2: SHGAT forward (sans training)
         ↓ Valider
Phase 3: Training avec autograd
         ↓ Valider
Phase 4: TransitionModel GRU
         ↓ Valider
Phase 5: Cleanup ancien code
```

Chaque phase a ses propres tests de non-régression.

#### 3. Garder le Fallback BLAS

```typescript
// lib/shgat/src/utils/math.ts
const USE_TFJS = Deno.env.get("SHGAT_BACKEND") === "tfjs";

export function matmul(A: number[][], B: number[][]): number[][] {
  if (USE_TFJS) {
    return matmulTF(A, B);
  }
  return matmulBLAS(A, B);  // Ancien code
}
```

Permet rollback instantané si problème en prod.

#### 4. Métriques de Validation

**Avant migration, capturer baseline :**
```typescript
// scripts/capture-baseline.ts
const baseline = {
  shgatAccuracy: await measureAccuracy(testSet),
  shgatLatencyP50: await measureLatency(1000),
  shgatLatencyP99: await measureLatency(1000, 0.99),
  memoryPeak: Deno.memoryUsage().heapUsed
};
await Deno.writeTextFile("baseline.json", JSON.stringify(baseline));
```

**Après chaque phase, comparer :**
```typescript
// Acceptation:
// - Accuracy: ≥ baseline - 0.5%
// - Latency P50: ≤ baseline × 1.2
// - Memory: ≤ baseline × 1.5
```

#### 5. GRU vs Alternatives

Si le POC montre que GRU est insuffisant :

| Alternative | Quand utiliser |
|-------------|----------------|
| **LSTM** | Séquences > 10 outils, dépendances longue distance |
| **Transformer** | Si dataset très large (>100k traces) |
| **MLP + Attention** | Si séquences toujours courtes (<5) |

**Recommandation : Commencer avec GRU**, évaluer sur dataset réel, upgrader si nécessaire.

#### 6. Structure de Fichiers Recommandée

```
lib/shgat/src/
├── tf/
│   ├── backend.ts         # Init TF.js, backend selection
│   ├── ops.ts             # Wrappers matmul, softmax, etc.
│   └── memory.ts          # tf.tidy helpers
├── transition/
│   ├── gru-model.ts       # TransitionModel class
│   ├── trainer.ts         # Training loop
│   └── types.ts           # Interfaces
├── utils/
│   ├── math.ts            # GARDE - fallback BLAS
│   └── math-tf.ts         # NOUVEAU - TF.js ops
└── training/
    └── unified-trainer.ts # SHGAT + Transition joint training
```

---

## Summary & Conclusions

### Objectif Atteint

Cette recherche technique a validé la faisabilité de :

1. **TransitionModel avec GRU** pour remplacer DR-DSP
2. **Migration SHGAT vers TensorFlow.js** pour unifier le stack

### Décisions Clés

| Décision | Choix | Justification |
|----------|-------|---------------|
| Architecture TransitionModel | GRU + dual heads | Suffisant pour séquences courtes (2-5 outils), simple |
| Framework ML | TensorFlow.js | Autograd natif, GPU via WebGPU, élimine 3000+ LOC backward |
| Backend Deno | WebGPU (prod) / WASM (CI) | Performance GPU sans dépendances natives |
| Migration | Progressive avec fallback | Réduit risque, permet rollback |
| Terminaison | Sortie sigmoid séparée | Plus flexible que EOS token |

### Architecture Finale

```
┌──────────────────────────────────────────────────────────────────┐
│                        INFERENCE FLOW                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Intent ──▶ SHGAT.forward()                                      │
│                 │                                                 │
│                 ▼                                                 │
│            firstTool = argmax(scores)                            │
│                 │                                                 │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │            TransitionModel (GRU-based)                       │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  LOOP:                                                   │ │ │
│  │  │    contextEmbs = getEmbeddings(path)                    │ │ │
│  │  │    gruState = GRU(contextEmbs)                          │ │ │
│  │  │    combined = concat(intent, gruState)                  │ │ │
│  │  │    nextScores = softmax(dense(combined))                │ │ │
│  │  │    termProb = sigmoid(dense(combined))                  │ │ │
│  │  │                                                          │ │ │
│  │  │    if termProb > 0.7: STOP                              │ │ │
│  │  │    path.push(argmax(nextScores))                        │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                 │                                                 │
│                 ▼                                                 │
│            DAG = path                                             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Effort Estimé

| Phase | Description | Jours |
|-------|-------------|-------|
| 0 | **POC TF.js + Deno** | 1-2 |
| 1 | Setup TF.js, math-tf.ts | 1-2 |
| 2 | SHGAT forward migration | 3-4 |
| 3 | Training avec autograd | 2-3 |
| 4 | TransitionModel GRU | 2-3 |
| 5 | Tests, validation, cleanup | 2-3 |
| **Total** | | **11-17 jours** |

### Prochaines Étapes Immédiates

1. **[ ] Créer `poc/tfjs-deno-poc.ts`** - Script POC documenté ci-dessus
2. **[ ] Exécuter POC** - Valider critères GO/NO-GO
3. **[ ] Si GO : Créer Story dans Epic 12** - "Migration SHGAT + TransitionModel vers TensorFlow.js"
4. **[ ] Si NO-GO : Évaluer alternatives** - WASM-only, ou garder BLAS avec TransitionModel minimal

### Références

- Spike initial : `_bmad-output/planning-artifacts/spikes/2026-01-28-spike-transition-learning-drdsp.md`
- Epic 12 : `_bmad-output/planning-artifacts/epics/epic-12-speculative-execution-arguments.md`
- SHGAT actuel : `lib/shgat/src/`
- TensorFlow.js : https://www.tensorflow.org/js
- Deno WebGPU : https://deno.com/blog/v1.8

---

**Research Status: COMPLETE**
**Recommendation: Proceed to POC phase**
