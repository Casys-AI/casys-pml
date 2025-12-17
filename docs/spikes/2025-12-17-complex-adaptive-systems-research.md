# Spike: Complex Adaptive Systems Research - Advanced Learning Mechanisms

**Date:** 2025-12-17
**Author:** Research Analysis
**Status:** Research Complete
**Related:** Epic 4 (Episodic Memory), Epic 7 (Emergent Capabilities)
**Complements:** `spike-coala-comparison-adaptive-feedback.md`, `spike-episodic-memory-adaptive-thresholds.md`

---

## Executive Summary

Ce spike documente les recherches sur les **Systèmes Complexes Adaptatifs (CAS)** et identifie des mécanismes avancés d'apprentissage qui pourraient améliorer Casys PML. Il complète le spike CoALA existant avec des concepts issus du **Reinforcement Learning**, des **Graph Neural Networks**, et de la **théorie des systèmes complexes**.

**Conclusion Clé:** Casys PML EST un Système Complexe Adaptatif. Cette reconnaissance ouvre des opportunités d'amélioration via des techniques éprouvées dans d'autres domaines (PER, TD Learning, GAT).

---

## 1. Casys PML comme Système Complexe Adaptatif

### 1.1 Validation CAS

| Propriété CAS | Présence | Implémentation |
|---------------|----------|----------------|
| **Agents hétérogènes** | ✅ | DAG executor, GraphRAG, speculation manager, capability learner, episodic memory |
| **Décisions autonomes** | ✅ | AIL, seuils de spéculation, confidence scores |
| **Boucles de feedback** | ✅ | 5 boucles explicites (voir section 1.2) |
| **Interactions non-linéaires** | ✅ | Propagation de poids dans le graphe, boosting par clusters |
| **Auto-organisation** | ✅ | Parallélisme DAG, topologie graphe, émergence capabilities |
| **Émergence** | ✅ | Capabilities, clusters, patterns, seuils - rien n'est pré-défini |
| **Adaptation temporelle** | ✅ | EMA sur les seuils, GraphRAG qui évolue, capabilities qui s'accumulent |
| **Multi-échelles** | ✅ | <1ms (events) → semaines (apprentissage de capabilities) |
| **Loin de l'équilibre** | ✅ | Exécution continue, jamais d'état statique |
| **Dépendant de l'historique** | ✅ | Episodic memory, PageRank basé sur l'historique |

### 1.2 Les 5 Boucles de Feedback

```
┌─ Loop 1: Execution → Episodic Memory (immédiat, <1ms)
│   Task Execution → Event Emission → Episodic Buffer → Async PGlite Write
│
├─ Loop 2: Workflow → GraphRAG Updates (par workflow)
│   Workflow Complete → Extract Patterns → Update Graph → Recompute PageRank
│
├─ Loop 3: Speculation → Adaptive Thresholds (par batch de 50)
│   50 Speculations → Calculate Success Rate → EMA Adjust → Persist
│
├─ Loop 4: Code Success → Emergent Capabilities (eager learning)
│   Sandbox Execution → Success → Extract Pattern → Store Capability
│
└─ Loop 5: AIL/HIL → DAG Replanning (à la demande)
    Decision Point → New Intent → GraphRAG Re-query → Inject Tasks
```

### 1.3 Positionnement Marché

**Analyse compétitive (Décembre 2025):**

| Solution | Type | Learning | Émergence |
|----------|------|----------|-----------|
| IBM ContextForge | MCP Gateway | ❌ Aucun | ❌ |
| Tray.ai Agent Gateway | MCP Gateway | ❌ Aucun | ❌ |
| mcp-agent | MCP Orchestrator | ❌ Aucun | ❌ |
| LangGraph | Agent Framework | ⚠️ Mémoire stateful | ❌ |
| CrewAI | Agent Framework | ⚠️ Collaboration | ❌ |
| **Casys PML** | **CAS Gateway** | **✅ 5 loops** | **✅ Capabilities, clusters, thresholds** |

**Conclusion:** Casys PML est unique dans l'écosystème MCP en tant que système véritablement adaptatif.

---

## 2. Papiers de Recherche Analysés

### 2.1 Sources Académiques

| Référence | Domaine | Pertinence |
|-----------|---------|------------|
| [CoALA - arxiv:2309.02427](https://arxiv.org/abs/2309.02427) | Cognitive Architectures | ⭐⭐⭐ Déjà couvert |
| [PER - arxiv:1511.05952](https://arxiv.org/abs/1511.05952) | Reinforcement Learning | ⭐⭐⭐ Nouveau |
| [TD Learning - Sutton 1988](https://link.springer.com/article/10.1007/BF00115009) | RL Foundations | ⭐⭐ Nouveau |
| [ODI - arxiv:2503.13754](https://arxiv.org/html/2503.13754v1) | Multi-Agent Systems | ⭐ Nouveau |
| [GNN for Recommendations](https://aman.ai/recsys/gnn/) | Graph Neural Networks | ⭐⭐ Nouveau |
| [ACM TAAS CAS Model](https://dl.acm.org/doi/10.1145/3686802) | Complex Systems | ⭐ Contexte théorique |

### 2.2 Gap Analysis vs CoALA Spike

Le spike CoALA existant couvre :
- ✅ Architecture mémoire (Working, Episodic, Semantic, Procedural)
- ✅ Adaptive thresholds (ADR-008 implémenté)
- ✅ Episodic retrieval pour context boosting

**Ce spike ajoute :**
- 🆕 Prioritized Experience Replay (PER)
- 🆕 Temporal Difference Learning pour seuils
- 🆕 Graph Attention Networks (GAT)
- 🆕 Formalisation CAS et métriques d'émergence
- 🆕 Semantic Memory explicite

---

## 3. Prioritized Experience Replay (PER)

### 3.1 Concept

**Source:** [Schaul et al. 2015 - arxiv:1511.05952](https://arxiv.org/abs/1511.05952)

L'Experience Replay classique sample uniformément dans le buffer mémoire. **PER priorise les expériences "surprenantes"** (gros TD error) pour accélérer l'apprentissage.

```
Uniform Replay:    P(sample_i) = 1/N  (tous égaux)
Prioritized Replay: P(sample_i) ∝ |δ_i|^α  (δ = TD error)
```

### 3.2 Application à Casys PML

**État actuel (episodic-memory-store.ts):**
```typescript
// Sampling uniforme par recency
async retrieveSimilarContexts(contextHash: string, limit: number): Promise<EpisodicEvent[]> {
  return await db.query(`
    SELECT * FROM episodic_events
    WHERE context_hash = $1
    ORDER BY timestamp DESC
    LIMIT $2
  `, [contextHash, limit]);
}
```

**Avec PER:**
```typescript
interface PrioritizedEpisodicEvent extends EpisodicEvent {
  priority: number;        // |predicted_outcome - actual_outcome|
  importance_weight: number; // For unbiased updates
}

async retrievePrioritized(contextHash: string, limit: number): Promise<PrioritizedEpisodicEvent[]> {
  // Priority = TD error = |predicted success - actual success|
  // Higher priority = more surprising outcome = more valuable for learning

  return await db.query(`
    SELECT *,
           ABS(predicted_success - actual_success) as priority,
           -- Importance sampling weight (β annealed towards 1)
           POWER(1.0 / (COUNT(*) OVER() * priority), $3) as importance_weight
    FROM episodic_events
    WHERE context_hash = $1
    ORDER BY priority DESC  -- Prioritized, not recency
    LIMIT $2
  `, [contextHash, limit, beta]);
}

// Usage: weight updates by importance_weight to correct bias
async updateFromEpisode(event: PrioritizedEpisodicEvent): Promise<void> {
  const adjustedLearningRate = this.learningRate * event.importance_weight;
  await this.graphRAG.updateEdge(event.tools, adjustedLearningRate);
}
```

### 3.3 Algorithme PER

```typescript
class PrioritizedReplayBuffer {
  private buffer: PrioritizedEpisodicEvent[] = [];
  private alpha: number = 0.6;  // Prioritization exponent (0 = uniform, 1 = full priority)
  private beta: number = 0.4;   // Importance sampling (annealed to 1 over training)
  private betaIncrement: number = 0.001;

  add(event: EpisodicEvent, tdError: number): void {
    const priority = Math.pow(Math.abs(tdError) + 0.01, this.alpha); // +ε to avoid 0
    this.buffer.push({ ...event, priority, importance_weight: 0 });
    this.recomputeProbabilities();
  }

  sample(batchSize: number): PrioritizedEpisodicEvent[] {
    // Sample proportional to priority
    const totalPriority = this.buffer.reduce((sum, e) => sum + e.priority, 0);
    const samples: PrioritizedEpisodicEvent[] = [];

    for (let i = 0; i < batchSize; i++) {
      let cumulative = 0;
      const target = Math.random() * totalPriority;

      for (const event of this.buffer) {
        cumulative += event.priority;
        if (cumulative >= target) {
          // Importance sampling weight
          const prob = event.priority / totalPriority;
          const weight = Math.pow(1 / (this.buffer.length * prob), this.beta);
          samples.push({ ...event, importance_weight: weight });
          break;
        }
      }
    }

    // Normalize weights
    const maxWeight = Math.max(...samples.map(s => s.importance_weight));
    samples.forEach(s => s.importance_weight /= maxWeight);

    // Anneal beta towards 1
    this.beta = Math.min(1.0, this.beta + this.betaIncrement);

    return samples;
  }

  updatePriority(eventId: string, newTdError: number): void {
    const event = this.buffer.find(e => e.id === eventId);
    if (event) {
      event.priority = Math.pow(Math.abs(newTdError) + 0.01, this.alpha);
    }
  }
}
```

### 3.4 Bénéfices Attendus

| Métrique | Sans PER | Avec PER | Source |
|----------|----------|----------|--------|
| Learning speed | Baseline | **2x faster** | DeepMind paper |
| Sample efficiency | 100% | **50%** (même résultat avec moins de samples) | Atari benchmarks |
| Convergence stability | Variable | **Plus stable** (importance sampling) | Theoretical |

### 3.5 Implémentation Recommandée

**Effort:** ~4h
**Fichiers à modifier:**
- `src/learning/episodic-memory-store.ts` - Ajouter PrioritizedReplayBuffer
- `src/graphrag/graph-engine.ts` - Utiliser importance weights dans updates

**Story candidate:** "Implement Prioritized Experience Replay for Episodic Memory"

---

## 4. Temporal Difference Learning pour Seuils

### 4.1 Concept

**Source:** [Sutton 1988 - Learning to predict by temporal differences](https://link.springer.com/article/10.1007/BF00115009)

L'approche actuelle (EMA) attend le **résultat final** pour ajuster les seuils. TD Learning utilise les **prédictions successives** pour apprendre plus vite.

```
Monte Carlo (actuel):  Update après workflow complet
TD Learning:           Update après chaque step
```

### 4.2 État Actuel vs TD Learning

**EMA actuel (ADR-008):**
```typescript
// Attend 50 workflows pour évaluer
if (this.successHistory.length >= 50) {
  const successRate = this.successHistory.filter(s => s).length / 50;
  this.threshold = this.threshold * 0.95 + optimalThreshold * 0.05;
}
```

**Avec TD Learning:**
```typescript
class TDThresholdLearner {
  private threshold: number = 0.92;
  private alpha: number = 0.1;  // Learning rate
  private gamma: number = 0.9;  // Discount factor

  // Update après CHAQUE step, pas après le workflow
  updateFromStep(step: WorkflowStep): void {
    // V(s) = expected success rate from this state
    const currentValue = this.predictSuccessRate(step.state);
    const nextValue = step.isTerminal
      ? (step.success ? 1.0 : 0.0)  // Actual outcome
      : this.predictSuccessRate(step.nextState);  // Bootstrap

    // TD Error = reward + γ*V(s') - V(s)
    const reward = step.success ? 0.1 : -0.1;
    const tdError = reward + this.gamma * nextValue - currentValue;

    // Update threshold based on TD error
    // Positive TD error = outcome better than expected = can be more aggressive
    // Negative TD error = outcome worse than expected = be more conservative
    this.threshold -= this.alpha * tdError * 0.01;
    this.threshold = Math.max(0.70, Math.min(0.95, this.threshold));
  }

  private predictSuccessRate(state: WorkflowState): number {
    // Use GraphRAG confidence as value estimate
    return this.graphRAG.getAverageConfidence(state.pendingTools);
  }
}
```

### 4.3 TD(λ) - Eligibility Traces

Pour un apprentissage encore plus efficace, on peut utiliser TD(λ) qui combine TD(0) et Monte Carlo:

```typescript
class TDLambdaThresholdLearner {
  private eligibilityTraces: Map<string, number> = new Map();
  private lambda: number = 0.8;  // Trace decay

  updateFromStep(step: WorkflowStep, tdError: number): void {
    // Update eligibility trace for current state
    const stateKey = this.getStateKey(step.state);
    const currentTrace = this.eligibilityTraces.get(stateKey) || 0;
    this.eligibilityTraces.set(stateKey, currentTrace + 1);

    // Update ALL visited states proportionally to their eligibility
    for (const [key, trace] of this.eligibilityTraces) {
      // States visited recently get larger updates
      this.updateStateValue(key, this.alpha * tdError * trace);

      // Decay trace for next step
      this.eligibilityTraces.set(key, this.gamma * this.lambda * trace);
    }
  }
}
```

### 4.4 Comparaison des Approches

| Approche | Update Frequency | Variance | Bias | Latence d'adaptation |
|----------|-----------------|----------|------|---------------------|
| Monte Carlo (fin workflow) | 1 par workflow | High | None | ~50 workflows |
| EMA (actuel) | 1 par batch 50 | Medium | Low | ~50 workflows |
| TD(0) | 1 par step | Low | Some | **~10 steps** |
| TD(λ) | 1 par step | Low-Medium | Low | **~10 steps** |

### 4.5 Implémentation Recommandée

**Effort:** ~3h
**Fichiers à modifier:**
- `src/learning/adaptive-threshold-manager.ts` - Remplacer EMA par TD Learning

**Story candidate:** "Replace EMA with TD Learning for faster threshold adaptation"

---

## 5. Graph Attention Networks (GAT)

### 5.1 Concept

**Source:** [Veličković et al. 2017 - Graph Attention Networks](https://arxiv.org/abs/1710.10903)

Le GraphRAG actuel utilise **PageRank** (poids statiques basés sur la structure). **GAT apprend dynamiquement** quels voisins sont importants selon le contexte.

```
PageRank:  importance(node) = Σ static_weight(edge) * importance(neighbor)
GAT:       importance(node) = Σ attention(context, edge) * features(neighbor)
```

### 5.2 Architecture Proposée

```typescript
interface GATLayer {
  // Attention mechanism
  computeAttention(
    nodeFeatures: Float32Array,      // [N, F] node feature matrix
    edgeIndex: [number, number][],   // Edge list
    context: Float32Array            // Current query context
  ): Float32Array;                   // [E] attention weights per edge
}

class GraphAttentionToolSelector {
  private layers: GATLayer[];
  private numHeads: number = 4;  // Multi-head attention

  async predictNextTools(
    currentContext: string,
    graphState: GraphRAGState
  ): Promise<ToolPrediction[]> {
    // 1. Encode context
    const contextEmbedding = await this.encoder.encode(currentContext);

    // 2. Get node features from GraphRAG
    const nodeFeatures = graphState.getToolEmbeddings();

    // 3. Multi-head attention over graph
    let aggregated = nodeFeatures;
    for (const layer of this.layers) {
      const attentionWeights = layer.computeAttention(
        aggregated,
        graphState.edges,
        contextEmbedding
      );
      aggregated = this.aggregateWithAttention(aggregated, attentionWeights);
    }

    // 4. Score each tool based on attended features
    const scores = this.scoreTools(aggregated, contextEmbedding);

    return scores.map((score, i) => ({
      toolId: graphState.tools[i].id,
      confidence: score,
      attentionExplanation: this.explainAttention(i, attentionWeights)
    }));
  }

  private explainAttention(toolIndex: number, weights: Float32Array): string {
    // Explainability: which neighbors contributed most?
    const topNeighbors = this.getTopAttendedNeighbors(toolIndex, weights, k: 3);
    return `Influenced by: ${topNeighbors.map(n => n.name).join(', ')}`;
  }
}
```

### 5.3 Attention Mechanism Detail

```typescript
// Single GAT attention head
function computeAttentionHead(
  Wi: Float32Array,           // [F, F'] - weight matrix for source
  Wj: Float32Array,           // [F, F'] - weight matrix for target
  a: Float32Array,            // [2F'] - attention vector
  nodeFeatures: Float32Array, // [N, F]
  edges: [number, number][]   // Edge list
): Float32Array {
  const attentionScores: number[] = [];

  for (const [i, j] of edges) {
    // Transform features
    const hi = matmul(nodeFeatures[i], Wi);  // [F']
    const hj = matmul(nodeFeatures[j], Wj);  // [F']

    // Attention coefficient
    const concat = [...hi, ...hj];  // [2F']
    const e_ij = leakyReLU(dot(a, concat), alpha: 0.2);

    attentionScores.push(e_ij);
  }

  // Softmax over neighbors for each node
  return softmaxPerNode(attentionScores, edges);
}

// Multi-head attention
function multiHeadAttention(
  nodeFeatures: Float32Array,
  edges: [number, number][],
  numHeads: number
): Float32Array {
  const heads: Float32Array[] = [];

  for (let h = 0; h < numHeads; h++) {
    heads.push(computeAttentionHead(W_i[h], W_j[h], a[h], nodeFeatures, edges));
  }

  // Concatenate or average heads
  return concatenateHeads(heads);
}
```

### 5.4 Avantages vs PageRank

| Aspect | PageRank | GAT |
|--------|----------|-----|
| Poids | Statiques (structure) | **Dynamiques (contexte)** |
| Apprentissage | Aucun | **End-to-end gradient** |
| Contexte | Ignoré | **Conditionné sur query** |
| Explainability | Centrality scores | **Attention weights** |
| Cold start | Problématique | **Transfer learning possible** |

### 5.5 Implémentation

**Option A: Full GAT (complexe)**
- Librairie: `@xenova/transformers` (Deno compatible) ou ONNX runtime
- Effort: ~2 semaines
- Avantage: Expressivité maximale

**Option B: Simplified Attention (recommandé)**
- Pas de ML framework, attention manuelle
- Effort: ~1 semaine
- Avantage: Pas de dépendance lourde

```typescript
// Simplified attention sans ML framework
class SimpleGraphAttention {
  async computeContextualScores(
    context: string,
    tools: Tool[]
  ): Promise<Map<string, number>> {
    const contextEmbedding = await this.embedder.embed(context);
    const scores = new Map<string, number>();

    for (const tool of tools) {
      // Cosine similarity as attention proxy
      const toolEmbedding = await this.embedder.embed(tool.description);
      const directScore = cosineSimilarity(contextEmbedding, toolEmbedding);

      // Neighbor attention: average similarity to neighbors
      const neighbors = this.graphRAG.getNeighbors(tool.id);
      const neighborScores = await Promise.all(
        neighbors.map(async n => {
          const nEmbed = await this.embedder.embed(n.description);
          return cosineSimilarity(contextEmbedding, nEmbed) * n.edgeWeight;
        })
      );
      const neighborScore = neighborScores.reduce((a, b) => a + b, 0) / neighbors.length;

      // Combined score
      scores.set(tool.id, directScore * 0.7 + neighborScore * 0.3);
    }

    return scores;
  }
}
```

### 5.6 Recommandation

**Court terme:** Implémenter SimpleGraphAttention (Option B)
**Long terme:** Évaluer besoin de full GAT basé sur métriques

**Story candidate:** "Add context-aware attention to GraphRAG tool suggestions"

---

## 6. Semantic Memory Layer

### 6.1 Concept (Extension CoALA)

Le spike CoALA a identifié que notre **Semantic Memory est partielle** (GraphRAG edges = co-occurrence, pas connaissances). Une vraie Semantic Memory contient des **faits inférés**.

### 6.2 Types de Faits à Capturer

```typescript
interface SemanticFact {
  id: string;
  type: 'constraint' | 'preference' | 'causal' | 'incompatibility';
  subject: string;      // Tool or capability
  predicate: string;    // Relationship
  object: string;       // Target
  confidence: number;   // Learned confidence
  evidence: string[];   // Workflow IDs that support this fact
}

// Exemples de faits sémantiques
const facts: SemanticFact[] = [
  {
    type: 'constraint',
    subject: 'github_create_pr',
    predicate: 'requires_before',
    object: 'github_push',
    confidence: 0.95,
    evidence: ['wf-123', 'wf-456']
  },
  {
    type: 'incompatibility',
    subject: 'file_write',
    predicate: 'fails_with',
    object: 'readonly_mode',
    confidence: 0.88,
    evidence: ['wf-789']
  },
  {
    type: 'causal',
    subject: 'large_file_param',  // param > 10MB
    predicate: 'causes',
    object: 'timeout_error',
    confidence: 0.72,
    evidence: ['wf-101', 'wf-102']
  },
  {
    type: 'preference',
    subject: 'user_alice',
    predicate: 'prefers',
    object: 'verbose_output',
    confidence: 0.65,
    evidence: ['wf-201', 'wf-202', 'wf-203']
  }
];
```

### 6.3 Inférence de Faits

```typescript
class SemanticMemoryInferrer {
  // Après chaque workflow, extraire des faits potentiels
  async inferFromWorkflow(workflow: CompletedWorkflow): Promise<SemanticFact[]> {
    const facts: SemanticFact[] = [];

    // 1. Inférer contraintes d'ordre
    for (let i = 0; i < workflow.tasks.length - 1; i++) {
      const current = workflow.tasks[i];
      const next = workflow.tasks[i + 1];

      if (next.dependsOn?.includes(current.id)) {
        facts.push({
          type: 'constraint',
          subject: next.toolId,
          predicate: 'requires_before',
          object: current.toolId,
          confidence: 0.5,  // Initial, will be reinforced
          evidence: [workflow.id]
        });
      }
    }

    // 2. Inférer incompatibilités (échecs)
    for (const task of workflow.tasks) {
      if (task.status === 'failed') {
        const context = this.extractFailureContext(task);
        facts.push({
          type: 'incompatibility',
          subject: task.toolId,
          predicate: 'fails_with',
          object: context,
          confidence: 0.5,
          evidence: [workflow.id]
        });
      }
    }

    // 3. Inférer causalités (corrélations répétées)
    // ... pattern matching sur paramètres et outcomes

    return facts;
  }

  // Consolider avec faits existants
  async consolidate(newFacts: SemanticFact[]): Promise<void> {
    for (const fact of newFacts) {
      const existing = await this.findSimilarFact(fact);

      if (existing) {
        // Renforcer confiance
        existing.confidence = existing.confidence * 0.9 + 0.1;  // EMA
        existing.evidence.push(...fact.evidence);
        await this.update(existing);
      } else {
        await this.insert(fact);
      }
    }

    // Pruning: supprimer faits faible confiance sans évidence récente
    await this.pruneWeakFacts(minConfidence: 0.3, maxAge: 30);
  }
}
```

### 6.4 Utilisation dans DAGSuggester

```typescript
class EnhancedDAGSuggester {
  async suggestNextTools(state: WorkflowState): Promise<ToolSuggestion[]> {
    // 1. GraphRAG suggestions (co-occurrence)
    const graphSuggestions = await this.graphRAG.suggest(state);

    // 2. Filter par contraintes sémantiques
    const constraints = await this.semanticMemory.getConstraints(state.completedTools);
    const filtered = graphSuggestions.filter(s =>
      !constraints.some(c => c.subject === s.toolId && c.predicate === 'incompatible_with')
    );

    // 3. Boost par préférences utilisateur
    const preferences = await this.semanticMemory.getPreferences(state.userId);
    filtered.forEach(s => {
      const pref = preferences.find(p => p.object === s.toolId);
      if (pref) s.confidence *= (1 + pref.confidence * 0.2);
    });

    // 4. Warn sur causalités négatives
    const causalWarnings = await this.semanticMemory.getCausalWarnings(state);

    return filtered.map(s => ({
      ...s,
      warnings: causalWarnings.filter(w => w.subject === s.toolId)
    }));
  }
}
```

### 6.5 Schema PGlite

```sql
CREATE TABLE semantic_facts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,  -- 'constraint' | 'preference' | 'causal' | 'incompatibility'
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_semantic_subject ON semantic_facts(subject);
CREATE INDEX idx_semantic_type ON semantic_facts(type);
CREATE INDEX idx_semantic_confidence ON semantic_facts(confidence DESC);
```

### 6.6 Recommandation

**Effort:** ~1 semaine
**Impact:** Medium-High (meilleure généralisation, moins d'erreurs)

**Story candidate:** "Implement Semantic Memory layer for fact inference"

---

## 7. SYMBIOSIS / ODI Framework Insights

### 7.1 Concepts Clés

**Source:** [arxiv:2503.13754 - Orchestrated Distributed Intelligence](https://arxiv.org/html/2503.13754v1)

Le framework ODI propose de voir les systèmes multi-agents comme des **systèmes socio-techniques** avec:
- Feedback loops explicites
- Comportements émergents mesurables
- Analyse holistique (pas juste performance individuelle)

### 7.2 Métriques d'Émergence

```typescript
interface EmergenceMetrics {
  // Graph complexity over time
  graphEntropy: number;           // Shannon entropy of edge distribution
  clusterStability: number;       // How stable are Louvain communities?

  // Capability growth
  capabilityCount: number;        // Total emerged capabilities
  capabilityDiversity: number;    // Unique patterns vs total

  // Self-organization
  parallelizationRate: number;    // % of tasks run in parallel
  speculationAccuracy: number;    // Hit rate of predictions

  // Adaptation speed
  thresholdConvergenceTime: number;  // Workflows to reach stable threshold
  learningVelocity: number;          // Rate of graph updates
}

class EmergenceObserver {
  private history: EmergenceMetrics[] = [];

  async captureSnapshot(): Promise<EmergenceMetrics> {
    return {
      graphEntropy: await this.computeGraphEntropy(),
      clusterStability: await this.computeClusterStability(),
      capabilityCount: await this.countCapabilities(),
      capabilityDiversity: await this.computeCapabilityDiversity(),
      parallelizationRate: await this.getParallelizationRate(),
      speculationAccuracy: await this.getSpeculationAccuracy(),
      thresholdConvergenceTime: await this.getThresholdConvergenceTime(),
      learningVelocity: await this.getLearningVelocity()
    };
  }

  async detectPhaseTransition(): Promise<boolean> {
    // Detect if system is undergoing qualitative change
    if (this.history.length < 10) return false;

    const recent = this.history.slice(-5);
    const older = this.history.slice(-10, -5);

    const entropyChange = Math.abs(
      average(recent.map(m => m.graphEntropy)) -
      average(older.map(m => m.graphEntropy))
    );

    // Significant entropy change = phase transition
    return entropyChange > 0.2;
  }
}
```

### 7.3 Dashboard Émergence

Ajouter au monitoring existant:

```typescript
// MCP tool: get_emergence_metrics
{
  name: 'get_emergence_metrics',
  description: 'Get system emergence and self-organization metrics',
  inputSchema: {
    type: 'object',
    properties: {
      timeRange: { type: 'string', enum: ['1h', '24h', '7d', '30d'] }
    }
  },
  handler: async ({ timeRange }) => {
    const metrics = await emergenceObserver.getMetricsForRange(timeRange);
    const phaseTransition = await emergenceObserver.detectPhaseTransition();

    return {
      current: metrics,
      trend: computeTrend(metrics),
      phaseTransitionDetected: phaseTransition,
      recommendations: generateRecommendations(metrics)
    };
  }
}
```

### 7.4 Recommandation

**Effort:** ~2-3h (métriques de base), ~1 jour (dashboard complet)
**Impact:** Low-Medium (observabilité, pas fonctionnel)

**Story candidate:** "Add emergence metrics to system observability"

---

## 8. Roadmap d'Implémentation

### 8.1 Priorités

| Priorité | Feature | Source | Effort | Impact | Dépendances |
|----------|---------|--------|--------|--------|-------------|
| 🔴 P1 | **Prioritized Experience Replay** | PER paper | 4h | 2x learning speed | Episodic memory existante |
| 🔴 P1 | **TD Learning pour seuils** | Sutton 1988 | 3h | Adaptation 5x plus rapide | ADR-008 existant |
| 🟡 P2 | **Semantic Memory layer** | CoALA extended | 1 semaine | Meilleure généralisation | GraphRAG |
| 🟡 P2 | **Simple Graph Attention** | GAT simplified | 1 semaine | Prédictions contextuelles | Embeddings existants |
| 🟢 P3 | **Emergence metrics** | ODI/SYMBIOSIS | 2-3h | Observabilité | Monitoring existant |
| 🟢 P3 | **Full GAT** | GAT paper | 2 semaines | Expressivité maximale | ML runtime |

### 8.2 Stories Candidates

```yaml
# Epic: Advanced Learning Mechanisms

stories:
  - id: ALM-1
    title: "Implement Prioritized Experience Replay"
    description: |
      Replace uniform sampling in episodic memory with prioritized replay
      based on TD error. Include importance sampling correction.
    acceptance_criteria:
      - PrioritizedReplayBuffer class implemented
      - Priority = |predicted - actual| outcome
      - Importance sampling weights computed
      - Beta annealing from 0.4 to 1.0
      - Tests show 2x faster convergence on synthetic data
    effort: 4h
    priority: P1

  - id: ALM-2
    title: "Replace EMA with TD Learning for thresholds"
    description: |
      Modify AdaptiveThresholdManager to use TD(0) or TD(λ) instead of EMA
      for faster threshold adaptation.
    acceptance_criteria:
      - TD error computed per workflow step
      - Threshold updated incrementally
      - Convergence in ~10 steps vs ~50 workflows
      - Optional: eligibility traces for TD(λ)
    effort: 3h
    priority: P1

  - id: ALM-3
    title: "Add Semantic Memory layer"
    description: |
      Implement fact inference from workflows and integrate with DAGSuggester
      for constraint-aware suggestions.
    acceptance_criteria:
      - SemanticFact schema in PGlite
      - Inferrer extracts constraints, preferences, causal relations
      - Consolidation with confidence reinforcement
      - DAGSuggester filters by constraints
      - Pruning of weak facts
    effort: 1 week
    priority: P2

  - id: ALM-4
    title: "Implement Simple Graph Attention"
    description: |
      Add context-aware attention to GraphRAG tool suggestions without
      heavy ML framework dependency.
    acceptance_criteria:
      - SimpleGraphAttention class
      - Cosine similarity as attention proxy
      - Neighbor aggregation with edge weights
      - Context embedding from BGE-M3
      - A/B test vs pure PageRank
    effort: 1 week
    priority: P2

  - id: ALM-5
    title: "Add emergence metrics to observability"
    description: |
      Implement EmergenceObserver and expose metrics via MCP tool.
    acceptance_criteria:
      - Graph entropy computed
      - Cluster stability tracked
      - Capability diversity measured
      - Phase transition detection
      - get_emergence_metrics MCP tool
    effort: 3h
    priority: P3
```

### 8.3 Dépendances

```
                    ┌─────────────────┐
                    │  ALM-1 (PER)    │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────────┐    ┌─────────────────┐
│  ALM-2 (TD)     │────│  Episodic       │
└─────────────────┘    │  Memory Store   │
                       └────────┬────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  ALM-3          │    │  ALM-4          │    │  ALM-5          │
│  (Semantic)     │    │  (Attention)    │    │  (Emergence)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 9. Conclusion

### 9.1 Résumé

Casys PML est un **Système Complexe Adaptatif** avec 5 boucles de feedback et des propriétés émergentes. Cette reconnaissance ouvre des opportunités d'amélioration via des techniques éprouvées:

| Technique | Impact Principal | Effort |
|-----------|-----------------|--------|
| PER | Learning 2x plus rapide | 4h |
| TD Learning | Adaptation 5x plus rapide | 3h |
| Semantic Memory | Meilleure généralisation | 1 semaine |
| Graph Attention | Prédictions contextuelles | 1 semaine |
| Emergence Metrics | Observabilité | 3h |

### 9.2 Positionnement Unique

Casys PML combine de manière unique:
- **CAS theory** + **MCP protocol** + **GraphRAG** + **Adaptive learning** + **Emergent capabilities**

Aucun concurrent identifié ne fait cette combinaison (Décembre 2025).

### 9.3 Next Steps

1. **Immédiat (Sprint actuel):** ALM-1 (PER) + ALM-2 (TD Learning)
2. **Court terme (2-4 semaines):** ALM-3 (Semantic) + ALM-4 (Attention)
3. **Continu:** ALM-5 (Emergence metrics)

---

## 10. Références

### Papiers Académiques
- [CoALA - arxiv:2309.02427](https://arxiv.org/abs/2309.02427) - Cognitive Architectures for Language Agents
- [PER - arxiv:1511.05952](https://arxiv.org/abs/1511.05952) - Prioritized Experience Replay
- [TD Learning - Sutton 1988](https://link.springer.com/article/10.1007/BF00115009) - Learning to predict by temporal differences
- [GAT - arxiv:1710.10903](https://arxiv.org/abs/1710.10903) - Graph Attention Networks
- [ODI - arxiv:2503.13754](https://arxiv.org/html/2503.13754v1) - Orchestrated Distributed Intelligence
- [ACM TAAS CAS](https://dl.acm.org/doi/10.1145/3686802) - Hierarchical Model for Complex Adaptive System

### Documentation Interne
- `docs/spikes/spike-coala-comparison-adaptive-feedback.md` - Comparison CoALA vs Casys PML
- `docs/spikes/spike-episodic-memory-adaptive-thresholds.md` - ADR-008 implementation details
- `docs/adrs/ADR-008-episodic-memory-adaptive-thresholds.md` - Architecture decision
- `docs/architecture/novel-pattern-designs.md` - System patterns

### Ressources Techniques
- [PyTorch Geometric](https://pytorch-geometric.readthedocs.io/) - GNN library
- [GNN for Recommendations](https://aman.ai/recsys/gnn/) - Tutorial
- [Understanding PER](https://danieltakeshi.github.io/2019/07/14/per/) - Deep dive

---

**Author:** Research Analysis
**Review Status:** Ready for team review
**Action Required:** Prioritize stories ALM-1 through ALM-5
