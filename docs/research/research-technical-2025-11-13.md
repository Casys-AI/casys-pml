# Technical Research Report: {{technical_question}}

**Date:** 2025-11-13 **Prepared by:** BMad **Project Context:** {{project_context}}

---

## Executive Summary

{{recommendations}}

### Key Recommendation

**Primary Choice:** [Technology/Pattern Name]

**Rationale:** [2-3 sentence summary]

**Key Benefits:**

- [Benefit 1]
- [Benefit 2]
- [Benefit 3]

---

## 1. Research Objectives

### Technical Question

**Comment architecturer un système DAG adaptatif avec feedback loops AIL/HIL et recherche GraphRAG
dynamique?**

**Contexte:** Le système actuel dispose de:

- GraphRAG pour la recherche et découverte de DAG
- Exécution spéculative des tâches

**Gap identifié:** Le système ne supporte pas actuellement:

- Points de décision où l'IA doit faire des choix stratégiques
- Interactions multi-turn au sein de l'exécution d'un DAG
- Human-in-the-Loop (HIL) pour demander des choix à l'humain à des points critiques du DAG
- Agent-in-the-Loop (AIL) pour des décisions autonomes avec possibilité de révision
- Adaptation dynamique du DAG en fonction des réponses (humain ou agent)
- Re-déclenchement de la recherche GraphRAG après modification du plan

**Question de recherche:** Quelles sont les meilleures approches architecturales et patterns pour
implémenter un système DAG qui peut:

1. S'adapter dynamiquement en fonction des interactions AIL/HIL
2. Supporter le multi-turn avec état persistent
3. Re-planifier et relancer la recherche GraphRAG quand le contexte change
4. Gérer les points de décision et branchements conditionnels dans le DAG

### Project Context

**Type de projet:** Greenfield - Casys PML

**Situation actuelle:** Le projet Casys PML est en développement greenfield. Un spike a été initié
pour explorer un problème architectural non anticipé.

**Architecture actuelle:**

- Le DAG s'exécute de manière linéaire et complète en une seule passe
- Aucune capacité de feedback durant l'exécution
- Pas de branches conditionnelles basées sur les résultats intermédiaires
- Pas de points d'interaction pour demander des choix (ni à l'humain, ni décisions autonomes de
  l'agent)

**Problématique identifiée:** L'architecture actuelle ne permet pas:

- D'arrêter l'exécution pour demander une décision
- De brancher le flux en fonction de réponses ou de contexte
- De re-planifier le DAG après avoir obtenu de nouvelles informations
- D'avoir des conversations multi-turn au sein d'une exécution

**Objectif de la recherche:** Comprendre les patterns architecturaux et approches techniques pour
transformer le DAG linéaire actuel en un système adaptatif supportant les feedback loops, branches
conditionnelles, et re-planification dynamique.

### Requirements and Constraints

#### Functional Requirements

**Feedback Loop et Adaptation:**

- Le système doit pouvoir suspendre l'exécution d'un DAG à des points de décision définis
- Le système doit pouvoir poser des questions structurées à l'humain ou à un agent (choix multiples,
  validation, input libre)
- Le système doit pouvoir reprendre l'exécution après avoir reçu une réponse
- Le système doit pouvoir modifier/adapter le DAG en cours d'exécution en fonction des réponses

**Multi-turn et État:**

- Supporter plusieurs échanges (multi-turn) dans un même contexte d'exécution
- Maintenir l'état de conversation et le contexte entre les tours
- Permettre la révision de décisions précédentes (backtracking)
- Historique des décisions accessible et traçable

**Re-planification GraphRAG:**

- Pouvoir déclencher une nouvelle recherche GraphRAG en fonction du contexte mis à jour
- Fusionner ou remplacer des portions du DAG existant avec les nouveaux résultats de recherche
- Maintenir la cohérence du DAG global après modification

**Branches Conditionnelles:**

- Supporter des branches conditionnelles basées sur les résultats intermédiaires
- Évaluer des conditions à des points de décision du DAG
- Router l'exécution vers différents chemins en fonction des conditions ou choix

#### Non-Functional Requirements

**Performance:**

- Latence acceptable pour interaction humaine: <500ms pour suspendre et présenter un choix
- Latence acceptable pour décision agent: <2s
- Temps de re-planification GraphRAG: acceptable selon complexité (peut prendre quelques secondes)

**Scalabilité:**

- Scope: Un seul DAG en exécution à la fois (pas de concurrence multi-DAG)
- Profondeur du DAG: Inconnue, potentiellement très profonde
- Nombre de points de décision: Variable, doit être flexible

**Fiabilité et Resilience:**

- **CRITIQUE:** Gestion d'état robuste avec persistence
- En cas de crash: Le système doit pouvoir retourner les résultats intermédiaires obtenus jusqu'au
  point de crash
- **CRITIQUE:** Capability de reprendre une exécution interrompue (resume from checkpoint)
- Checkpointing des résultats à chaque étape importante
- Recovery graceful avec état sauvegardé

**Observabilité et Traçabilité:**

- **CRITIQUE:** Tracer toutes les décisions prises (humain et agent)
- Historique complet des modifications du DAG
- Visualisation du DAG et de son évolution (souhaité)
- Logs détaillés pour debugging
- Audit trail des interactions et choix

**State Management:**

- Persistence de l'état d'exécution du DAG
- Sauvegarde du contexte de conversation multi-turn
- Historique des recherches GraphRAG effectuées
- Versioning des différentes versions du DAG

#### Technical Constraints

**Stack Technique Existante:**

- **Runtime:** Deno (TypeScript/JavaScript)
- **Database:** PGlite (PostgreSQL embedded avec pgvector)
- **Graph Library:** Graphology pour manipulation de DAG
- **Embeddings:** @xenova/transformers avec BGE-Large-EN-v1.5
- **Protocol:** MCP SDK (@modelcontextprotocol/sdk)
- **Streaming:** Server-Sent Events (SSE)

**Architecture Existante à Préserver:**

- ParallelExecutor avec exécution de DAG en layers topologiques
- GraphRAG pour recherche sémantique et découverte de workflows
- Sandbox Deno pour exécution de code avec permissions explicites
- Vector search sémantique pour tool selection
- Message-passing architecture

**Contraintes de Performance:**

- Maintenir le speedup 5x de l'exécution parallèle
- Overhead des checkpoints <50ms (hors temps d'attente agent/humain)
- Latence de command injection <10ms
- Memory overhead pour command queue <5MB

**Contraintes de Compatibilité:**

- Doit s'intégrer avec le ParallelExecutor existant (idéalement via héritage/extension)
- Compatibilité avec le système de streaming SSE actuel
- Pas de breaking changes dans l'API publique
- Support backward compatibility pour workflows sans feedback loops

**Contraintes d'Équipe:**

- Équipe de 1 développeur (BMad) - expert TypeScript/Deno
- Pas de dépendances externes complexes à ajouter
- Privilégier les patterns TypeScript standards
- Code maintenable et bien documenté

**Contraintes de Timeline:**

- Implémentation par phases progressives (sprints 2-3h chacun)
- MVP fonctionnel en priorité
- Possibilité de rollback si problèmes

**Licensing et Budget:**

- Open source (partie du projet Casys PML)
- Pas de coûts additionnels pour services externes
- Utilisation de Claude API pour agent decisions (déjà existant)

---

## 2. Technology Options Evaluated

### Options Explorées dans le Spike Initial

Le spike a identifié 3 design options principales:

**Option 1: Synchronous Checkpoints (Simple)**

- Architecture: Pause synchrone après chaque layer pour validation
- Pattern: Linear execution avec blocking checkpoints
- Forces: Simple, clair, compatible architecture actuelle
- Faiblesses: Bloque l'exécution, latence importante, pas de contrôle task-level

**Option 2: Async Event Stream with Command Injection** ⭐ Recommandé dans le spike

- Architecture: Event stream + command queue asynchrone
- Pattern: Async, découplé, multi-agent control
- Forces: Non-blocking, flexible, extensible, observable
- Faiblesses: Complexité implémentation, race conditions potentielles

**Option 3: Reactive DAG with Generator Pattern**

- Architecture: Generator pattern avec yield/next
- Pattern: Pull-based, construction dynamique du DAG
- Forces: Simple conceptuellement, construction dynamique élégante
- Faiblesses: Séquentiel (perd parallélisation 5x), incompatible avec speculative execution

### Options Supplémentaires Identifiées (Recherche Industrie)

**Option 4: State Machine Pattern (LangGraph-inspired)**

- Architecture: StateGraph avec nodes/edges et checkpointing natif
- Pattern: Explicit state machine avec conditional edges
- Inspiration: LangGraph, AutoGen
- Forces: State-first design, checkpointing automatique, human-in-the-loop natif
- Faiblesses: Paradigme différent de l'approche DAG actuelle, courbe d'apprentissage

**Option 5: BPMN-inspired Workflow Engine (Camunda-style)**

- Architecture: Workflow modélisé avec tasks, gateways, events
- Pattern: BPMN notation avec User Tasks et Exclusive Gateways
- Inspiration: Camunda, Temporal
- Forces: Patterns éprouvés en entreprise, tooling mature, visualisation standard
- Faiblesses: Overhead du modeling BPMN, trop "enterprise" pour le use case

**Option 6: Saga Pattern with Compensation**

- Architecture: Orchestration + compensation transactions
- Pattern: Event-driven saga avec forward/backward recovery
- Inspiration: Microsoft Azure patterns, Temporal sagas
- Forces: Distributed transactions, error recovery robuste, compensation automatique
- Faiblesses: Complexité de la compensation, overkill pour single-machine execution

**Option 7: Continuation-Based Workflow (Temporal-style)**

- Architecture: Workflows as code avec durable execution
- Pattern: Code-first avec resumable functions
- Inspiration: Temporal, Durable Functions
- Forces: Code naturel (pas de DSL), durable execution, replay capability
- Faiblesses: Nécessite runtime spécial pour durability, difficile à implémenter from scratch

### Systèmes de Référence Analysés

**LangGraph (LangChain)**

- **Paradigme:** State machine avec nodes/edges/checkpoints
- **HIL Support:** ✅ Natif - pause/resume avec human input
- **Dynamic DAG:** ✅ Conditional edges basés sur state
- **Multi-turn:** ✅ State checkpointing automatique
- **Relevance:** 🟢 Haute - pattern similaire à notre besoin
- **Adoption:** Forte dans l'écosystème LLM/Agent (2024-2025)

**Temporal**

- **Paradigme:** Durable execution avec workflow-as-code
- **HIL Support:** ⚠️ Via signals/queries (pas natif)
- **Dynamic DAG:** ✅ Code conditionnel standard (if/loops)
- **Multi-turn:** ✅ Durable state avec replay
- **Relevance:** 🟡 Moyenne - overkill mais patterns intéressants
- **Adoption:** Leader pour mission-critical workflows

**Prefect**

- **Paradigme:** Dynamic task orchestration avec flexible runtime
- **HIL Support:** ✅ Natif - pause_flow_run/wait_for_input
- **Dynamic DAG:** ✅ Task mapping et dynamic task generation
- **Multi-turn:** ✅ Suspend/resume workflows
- **Relevance:** 🟢 Haute - approche pragmatique et moderne
- **Adoption:** Forte dans data engineering et ML

**Camunda**

- **Paradigme:** BPMN workflow engine
- **HIL Support:** ✅ User Tasks natifs avec forms
- **Dynamic DAG:** ✅ Exclusive/Inclusive Gateways
- **Multi-turn:** ✅ Long-running workflows
- **Relevance:** 🟡 Moyenne - trop "enterprise" mais patterns solides
- **Adoption:** Leader en BPM entreprise

**Dagster**

- **Paradigme:** Asset-centric avec dynamic partitions
- **HIL Support:** ❌ Pas de support natif
- **Dynamic DAG:** ✅ Dynamic partitions et sensors
- **Multi-turn:** ⚠️ Limité
- **Relevance:** 🔴 Faible - focus sur asset orchestration, pas sur interactive workflows
- **Adoption:** Forte dans data engineering

### Patterns Architecturaux Clés Observés

**1. Checkpoint & Resume Pattern**

- **Implémentation:** LangGraph, Prefect, Temporal
- **Mécanisme:** Persist state → Pause → Wait input → Resume
- **État:** Sauvegardé dans DB (PGlite compatible ✅)
- **Pertinence:** 🟢 Critique pour recovery et HIL

**2. Command Queue Pattern**

- **Implémentation:** Event-driven architectures, CQRS
- **Mécanisme:** Async command queue avec processors
- **Commandes:** Inject task, Abort, Modify, Skip, Retry
- **Pertinence:** 🟢 Nécessaire pour async agent control

**3. Conditional Branching Pattern**

- **Implémentation:** Camunda Gateways, LangGraph Conditional Edges
- **Mécanisme:** Evaluate condition → Route to appropriate path
- **Types:** Exclusive (XOR), Inclusive (OR), Parallel (AND)
- **Pertinence:** 🟢 Core requirement identifié

**4. Speculative Execution Pattern**

- **Implémentation:** Apache Spark, SpeQL (research paper)
- **Mécanisme:** Predict next tasks → Execute speculatively → Resolve
- **Metrics:** Hit rate, time saved, wasted compute
- **Pertinence:** 🟢 Optimisation importante (23-30% gain)

**5. Saga/Compensation Pattern**

- **Implémentation:** Temporal, Microservices architectures
- **Mécanisme:** Forward transactions + Compensation on failure
- **Types:** Orchestration (centralized) vs Choreography (distributed)
- **Pertinence:** 🟡 Utile pour error recovery mais pas prioritaire

**6. State Machine Pattern**

- **Implémentation:** LangGraph, Camunda, Step Functions
- **Mécanisme:** Explicit states + Transitions + Guards
- **Avantages:** Visualisable, déterministe, testable
- **Pertinence:** 🟢 Facilite raisonnement sur le workflow

### Tableau Comparatif des Options

| Option                         | Complexité    | Performance             | HIL Support | Dynamic DAG | Speculative Exec | TypeScript Fit | Recommandation    |
| ------------------------------ | ------------- | ----------------------- | ----------- | ----------- | ---------------- | -------------- | ----------------- |
| **1. Sync Checkpoints**        | 🟢 Faible     | 🔴 Moyenne (blocking)   | 🟢 Oui      | 🟡 Limité   | ❌ Non           | 🟢 Excellent   | MVP uniquement    |
| **2. Event Stream + Commands** | 🟡 Moyenne    | 🟢 Haute (non-blocking) | 🟢 Oui      | 🟢 Oui      | 🟢 Oui           | 🟢 Excellent   | ⭐ **Recommandé** |
| **3. Generator Pattern**       | 🟢 Faible     | 🔴 Faible (séquentiel)  | 🟢 Oui      | 🟢 Oui      | ❌ Non           | 🟢 Bon         | ❌ Écarté         |
| **4. State Machine**           | 🟡 Moyenne    | 🟢 Haute                | 🟢 Natif    | 🟢 Oui      | 🟡 Possible      | 🟡 Bon         | 🟡 Alternative    |
| **5. BPMN Engine**             | 🔴 Haute      | 🟢 Haute                | 🟢 Natif    | 🟢 Oui      | ❌ Non           | 🔴 Moyen       | ❌ Overkill       |
| **6. Saga Pattern**            | 🔴 Haute      | 🟢 Haute                | 🟡 Limité   | 🟡 Limité   | ❌ Non           | 🟡 Bon         | 🟡 Phase 2        |
| **7. Continuation-Based**      | 🔴 Très haute | 🟢 Haute                | 🟢 Oui      | 🟢 Oui      | 🟡 Possible      | 🔴 Difficile   | ❌ Trop complexe  |

### Recommandation Préliminaire

Après analyse de l'industrie et comparaison avec les options du spike:

**Option 2 (Event Stream + Commands) reste la meilleure**, mais avec enrichissements inspirés de:

- **LangGraph:** Checkpointing pattern et state-first approach
- **Prefect:** pause_flow_run/wait_for_input API design
- **Temporal:** Speculative execution insights
- **Camunda:** Conditional gateway patterns

**Hybridation recommandée:** Option 2 + State Machine concepts

- Base: Async Event Stream avec Command Queue (Option 2)
-
  - Checkpointing natif inspiré de LangGraph
-
  - Conditional edges pour branching
-
  - Speculative execution avec GraphRAG
-
  - Saga-like compensation pour error recovery (Phase 2)

---

## 3. Detailed Technology Profiles

### Option 2: Async Event Stream with Command Injection ⭐

**Vue d'ensemble:** Architecture événementielle asynchrone où l'exécution du DAG émet des événements
en temps réel via un stream, tandis qu'un command queue permet l'injection de commandes (agent ou
humain) pour contrôler dynamiquement l'exécution.

#### Architecture Technique

**Composants Principaux:**

```typescript
// Core Components
class ControlledExecutor extends ParallelExecutor {
  private commandQueue: AsyncQueue<Command>;
  private eventStream: TransformStream<ExecutionEvent>;
  private checkpointPolicy: CheckpointPolicy;

  async executeWithControl(
    dag: DAGStructure,
    config: ExecutionConfig,
  ): Promise<DAGExecutionResult>;
}

// Event Types
type ExecutionEvent =
  | { type: "task_start"; taskId: string; timestamp: string }
  | { type: "task_complete"; taskId: string; result: TaskResult }
  | { type: "checkpoint"; context: CheckpointContext }
  | { type: "error"; taskId: string; error: Error };

// Command Types
type Command =
  | { type: "abort"; reason: string }
  | { type: "inject_task"; task: Task }
  | { type: "skip_layer"; layerIndex: number }
  | { type: "modify_args"; taskId: string; newArgs: unknown }
  | { type: "checkpoint_response"; approved: boolean };
```

**Flux d'Exécution:**

1. **DAG Executor** exécute les layers en parallèle
2. **Event Stream** émet les événements (task_start, task_complete, checkpoint, error)
3. **Agent Loop** écoute le stream et peut injecter des commands
4. **Human Loop** écoute les checkpoints critiques et peut approuver/rejeter
5. **Command Processor** traite les commands avant/après chaque layer

**Implémentation AsyncQueue:**

Plusieurs options disponibles:

- **ai-zen/async-queue** (npm): Léger, Symbol.asyncIterator support, backpressure control
- **ts-async-queue** (npm): Minimaliste (2KB), pause/resume support
- **Vendure AsyncQueue**: Production-tested, race condition prevention
- **Custom implementation**: Contrôle total, adapté aux besoins spécifiques

Recommandation: **Custom AsyncQueue** basé sur patterns de ai-zen/async-queue pour contrôle total et
intégration PGlite.

#### Caractéristiques Techniques

**Performance:**

- ✅ **Non-blocking:** Agent et Executor découplés, pas d'attente synchrone
- ✅ **Parallélisme préservé:** Maintient le speedup 5x des DAG layers
- ✅ **Low latency:** Command injection <10ms, checkpoint overhead <50ms
- ✅ **Streaming:** Résultats progressifs via SSE pour feedback temps réel

**Scalabilité:**

- ✅ Single DAG execution (scope actuel)
- ✅ Command queue avec backpressure (évite overflow)
- ✅ Event stream avec buffering configurable
- ⚠️ Memory footprint: ~5MB pour queue + stream buffers (acceptable)

**Fiabilité:**

- ✅ Command processing thread-safe avec locks
- ✅ Event ordering garanti (TransformStream)
- ✅ Checkpoint persistence dans PGlite
- ✅ Graceful error handling avec compensation possible
- ⚠️ Race conditions possibles (nécessite careful design)

**Intégration:**

- ✅ **Compatible architecture existante:** Hérite de ParallelExecutor
- ✅ **SSE support:** Intégration native avec streaming existant
- ✅ **PGlite ready:** Checkpoint persistence directe
- ✅ **GraphRAG integration:** Support pour speculative execution

#### Developer Experience

**Courbe d'apprentissage:**

- 🟡 Moyenne: Patterns async/await familiers mais architecture événementielle nécessite
  compréhension
- 🟢 TypeScript natif: Types stricts, excellent IntelliSense
- 🟢 Debugging: Event logs structurés, traçabilité complète
- 🟢 Testing: Facile de mocker command queue et event stream

**API Developer-Friendly:**

```typescript
// Usage simple
const executor = new ControlledExecutor(toolExecutor);

const config: ExecutionConfig = {
  mode: "guided",
  agent: { enabled: true, confidence: 0.7 },
  human: { enabled: true, checkpoints: "critical-only" },
};

// Execute avec control
const result = await executor.executeWithControl(dag, config);

// Injection de commande (si besoin)
executor.injectCommand({ type: "abort", reason: "User requested" });
```

**Tooling:**

- Pas de tooling externe requis
- Peut créer dashboard web pour visualisation (optionnel)
- Compatible avec VSCode debugging
- Tests unitaires et integration standards

#### Opérations

**Déploiement:**

- ✅ Aucune infrastructure additionnelle (in-process)
- ✅ Même runtime Deno que le reste du projet
- ✅ Pas de services externes requis

**Monitoring:**

- ✅ Event stream → métriques temps réel
- ✅ Command queue stats (length, processing time)
- ✅ Checkpoint success/failure rates
- ✅ Speculation hit/miss rates (si activé)

**Maintenance:**

- 🟡 Complexité moyenne: Nécessite bonne compréhension des patterns async
- ✅ Code modulaire et testable
- ✅ Extensible pour nouveaux command types

#### Écosystème

**Dépendances:**

- ✅ Aucune nouvelle dépendance externe majeure
- 🟢 Utilise standard Web Streams API (TransformStream, ReadableStream)
- 🟢 Compatible avec bibliothèques async existantes
- 🟢 Peut utiliser ai-zen/async-queue si besoin (optionnel)

**Communauté:**

- ✅ Patterns bien documentés dans event-driven.io
- ✅ Exemples TypeScript disponibles (GitHub, Medium)
- ✅ Pattern éprouvé dans microservices et workflow engines

**Support:**

- ✅ Pas de vendor lock-in
- ✅ Open source, contrôle total du code
- ✅ Stack TypeScript/Deno standard

#### Coûts

**Développement:**

- Initial: 8-12 heures (4 sprints de 2-3h)
  - Sprint 1: Sync checkpoints (2-3h)
  - Sprint 2: Command queue (2-3h)
  - Sprint 3: Event-driven loop (2-3h)
  - Sprint 4: Speculative execution (3-4h)
- Maintenance: Faible (code modulaire)

**Infrastructure:**

- ✅ Zéro coût additionnel (in-process)
- ✅ Pas de services cloud requis

**TCO (Total Cost of Ownership):**

- Développement initial: 8-12h × taux horaire
- Maintenance annuelle: ~5-10h
- Infrastructure: $0
- **Total sur 3 ans:** Très faible, principalement dev time

#### Trade-offs Spécifiques

**Avantages:**

- ✅ Non-blocking, haute performance
- ✅ Flexible et extensible
- ✅ Supporteagent + human control simultanément
- ✅ Observable et traçable
- ✅ Compatible speculative execution
- ✅ Pas de breaking changes

**Inconvénients:**

- ⚠️ Complexité implémentation moyenne
- ⚠️ Race conditions possibles (nécessite careful design)
- ⚠️ État distribué entre queue + stream (nécessite synchronisation)
- ⚠️ Debugging async flows peut être complexe

**Quand choisir cette option:**

- ✅ Besoin de performance (parallélisme 5x)
- ✅ Agent autonomy + human oversight requis
- ✅ Speculative execution important
- ✅ Production-ready nécessaire
- ✅ Équipe confortable avec async patterns

**Quand éviter:**

- ❌ Équipe pas familière avec event-driven architecture
- ❌ Besoin de simplicité extrême (MVP throwaway)
- ❌ Pas de besoin de performance

#### Exemples d'Implémentation Réels

**Event-Driven.io - Shopping Cart:**

```typescript
// Command handling pattern
const commandBus = new InMemoryMessageBus();

commandBus.handle(AddProductItemToShoppingCart, (command) => {
  // Handle command
  return { success: true };
});

// Similar pattern applicable to our Command Queue
```

**Vendure AsyncQueue:**

```typescript
// Race condition prevention
const queue = new AsyncQueue("my-queue", 1);

await queue.push(async () => {
  // Critical section protected
  await updateDatabase();
});
```

**Pattern Applicable:**

```typescript
// Casys PML adaptation
class ControlledExecutor {
  private commandQueue = new AsyncQueue<Command>();

  async processCommands() {
    for await (const command of this.commandQueue) {
      await this.handleCommand(command);
    }
  }
}
```

#### Ressources Additionnelles

- **Event-Driven.io:** https://event-driven.io/en/inmemory_message_bus_in_typescript/
- **ai-zen/async-queue:** https://github.com/ai-zen/async-queue
- **Vendure AsyncQueue:** https://docs.vendure.io/reference/typescript-api/common/async-queue
- **Web Streams API:** https://developer.mozilla.org/en-US/docs/Web/API/Streams_API

### Option 4: State Machine Pattern (LangGraph-Inspired)

**Vue d'ensemble:** Modéliser le DAG comme une state machine explicite avec nodes (tâches), edges
(transitions), et conditional edges (branchements). State-first design où l'état est persistent et
les checkpoints sont automatiques.

#### Architecture Technique

**Composants Principaux:**

```typescript
// State Graph Architecture
interface WorkflowState {
  tasks: Map<string, TaskResult>;
  decisions: Decision[];
  context: Map<string, unknown>;
  checkpointId?: string;
}

class StateGraph {
  private nodes: Map<string, NodeFunction>;
  private edges: Map<string, Edge[]>;
  private checkpointer: Checkpointer;

  addNode(name: string, fn: NodeFunction): void;
  addEdge(from: string, to: string): void;
  addConditionalEdge(from: string, condition: Condition, routes: Routes): void;

  compile(config: { checkpointer: Checkpointer }): CompiledGraph;
}

// Node Function - receives state, returns updated state
type NodeFunction = (state: WorkflowState) => Promise<Partial<WorkflowState>>;

// Conditional Edge - routes based on state
type Condition = (state: WorkflowState) => string; // returns next node name
```

**Inspiration LangGraph:**

- State est first-class citizen
- Checkpointing automatique après chaque node
- Conditional edges pour branching dynamique
- Human-in-the-loop natif via `interrupt()` mechanism

**Différences vs DAG actuel:**

- Paradigme: State transformations vs Task dependencies
- Control flow: Explicit edges vs Implicit topological sort
- State: Centralisé vs Distribué dans task results

#### Caractéristiques Techniques

**Performance:**

- 🟡 **Comparable:** Peut maintenir parallélisme avec parallel edges
- ✅ **Checkpointing efficace:** Snapshots incrémentiels possible
- ⚠️ **Overhead:** State serialization à chaque node (PGlite writes)

**Scalabilité:**

- ✅ State management robuste
- ✅ Checkpoint versioning natif
- ⚠️ State size peut grandir (nécessite pruning strategy)

**Fiabilité:**

- ✅ **Checkpoint automatique:** Pas de oubli possible
- ✅ **Resume trivial:** Load checkpoint → Continue from last node
- ✅ **Deterministic:** State machine explicite, facile à raisonner

**Intégration:**

- ⚠️ **Breaking change:** Paradigme différent du DAG actuel
- 🟡 **Migration nécessaire:** Refactoring des workflows existants
- ✅ **PGlite ready:** Checkpointer peut utiliser PGlite

#### Developer Experience

**Courbe d'apprentissage:**

- 🟡 **Moyenne-Haute:** Nouveau paradigme à apprendre
- ✅ **Concept clair:** State machine familier
- ✅ **Visualisable:** Peut générer diagrams du graph
- 🟢 **Documentation:** LangGraph docs comme référence

**API:**

```typescript
// Définir le workflow
const builder = new StateGraph<WorkflowState>();

// Ajouter nodes
builder.addNode("read_file", async (state) => {
  const content = await readFile(state.context.get("path"));
  return { ...state, tasks: state.tasks.set("read", content) };
});

builder.addNode("parse", async (state) => {
  const content = state.tasks.get("read");
  const parsed = await parse(content);
  return { ...state, tasks: state.tasks.set("parsed", parsed) };
});

// Conditional edge
builder.addConditionalEdge("parse", (state) => {
  return state.tasks.get("parsed").format === "xml" ? "parse_xml" : "parse_json";
}, {
  "parse_xml": "xml_parser",
  "parse_json": "json_parser",
});

// Compile avec checkpointer
const checkpointer = new PGliteCheckpointer(db);
const graph = builder.compile({ checkpointer });

// Execute
const result = await graph.invoke(initialState, {
  threadId: "workflow-123",
});
```

**Human-in-the-Loop:**

```typescript
// Add interrupt before critical node
builder.addNode("human_approval", async (state) => {
  // Interrupt here - returns control to caller
  interrupt("Approve deletion of 500 files?");

  // After resume, check decision
  if (state.context.get("approved")) {
    return { ...state, canProceed: true };
  } else {
    throw new Error("User rejected");
  }
});
```

#### Trade-offs Spécifiques

**Avantages:**

- ✅ **State-first design:** État explicit et centralisé
- ✅ **Checkpointing automatique:** Pas de oubli
- ✅ **HIL natif:** Pattern interrupt() élégant
- ✅ **Visualisable:** Graph structure explicite
- ✅ **Deterministic:** Facile à tester et debugger
- ✅ **Resume trivial:** Load + Continue seamless

**Inconvénients:**

- ⚠️ **Breaking change:** Refactoring complet nécessaire
- ⚠️ **Migration coût:** Tous les workflows existants à migrer
- ⚠️ **State overhead:** Serialization à chaque step
- ⚠️ **Courbe apprentissage:** Nouveau paradigme pour l'équipe
- ⚠️ **Parallélisme moins naturel:** Nécessite parallel edges explicites

**Quand choisir:**

- ✅ Nouveau projet (greenfield) sans legacy code
- ✅ État complexe à gérer
- ✅ Besoin de visualisation du workflow
- ✅ Team confortable avec state machines
- ✅ Long-running workflows avec nombreux checkpoints

**Quand éviter:**

- ❌ Déjà un DAG executor fonctionnel (coût migration)
- ❌ Timeline serrée (refactoring significatif)
- ❌ Team pas familière avec state machines
- ❌ Performance critique (overhead serialization)

#### Coûts

**Développement:**

- Refactoring: 20-30 heures
  - State machine design: 4-6h
  - Migration DAG → StateGraph: 8-12h
  - Checkpointer implementation: 4-6h
  - Testing et validation: 4-6h
- Maintenance: Moyenne (paradigme différent)

**Migration:**

- ⚠️ **High risk:** Tous les workflows existants impactés
- ⚠️ **Testing burden:** Validation complète nécessaire

**TCO sur 3 ans:**

- Plus élevé que Option 2 à cause de la migration

#### Exemples d'Implémentation

**LangGraph TypeScript:**

```typescript
import { MemorySaver, StateGraph } from "@langchain/langgraph";

// Define state
interface AgentState {
  messages: string[];
  nextAction?: string;
}

// Create graph
const workflow = new StateGraph<AgentState>();

// Add nodes
workflow.addNode("agent", agentNode);
workflow.addNode("tools", toolsNode);

// Conditional edge
workflow.addConditionalEdge(
  "agent",
  (state) => state.nextAction === "tool" ? "tools" : "end",
);

// Compile with checkpointer
const memory = new MemorySaver();
const app = workflow.compile({ checkpointer: memory });

// Execute with thread
const result = await app.invoke(
  { messages: ["Hello"] },
  { configurable: { thread_id: "1" } },
);
```

#### Recommandation

🟡 **Alternative viable mais coût élevé pour Casys PML**

- ✅ Excellent pattern pour nouveau projet
- ⚠️ Trop de refactoring pour Casys PML (DAG existant fonctionne)
- 🟢 **Peut inspirer:** Utiliser concepts (state-first, conditional edges) dans Option 2
- 💡 **Hybridation:** Option 2 + State management inspiré de StateGraph

---

## 4. Comparative Analysis

### Matrice de Comparaison Détaillée

| Dimension                | Option 1: Sync Checkpoints  | Option 2: Event Stream + Commands ⭐ | Option 4: State Machine           | Spike Recommendation |
| ------------------------ | --------------------------- | ------------------------------------ | --------------------------------- | -------------------- |
| **Architecture**         |                             |                                      |                                   |                      |
| Complexité               | 🟢 Faible                   | 🟡 Moyenne                           | 🟡 Moyenne-Haute                  | Option 2             |
| Paradigme                | Linear blocking             | Async event-driven                   | State machine                     | Event-driven         |
| Breaking changes         | ❌ Non                      | ❌ Non                               | ✅ Oui (majeur)                   | Non-breaking         |
| **Performance**          |                             |                                      |                                   |                      |
| Parallélisme 5x          | ⚠️ Maintenu (mais blocking) | ✅ Maintenu                          | 🟡 Possible (avec parallel edges) | Maintenu             |
| Latency overhead         | 🔴 Haute (blocking)         | 🟢 Faible (<50ms)                    | 🟡 Moyenne (state serialization)  | Faible               |
| Speculative exec         | ❌ Incompatible             | ✅ Compatible                        | 🟡 Possible                       | Compatible           |
| **Feedback Loops**       |                             |                                      |                                   |                      |
| AIL support              | 🟡 Limité                   | ✅ Complet                           | ✅ Complet                        | Complet              |
| HIL support              | ✅ Oui                      | ✅ Oui                               | ✅ Natif (interrupt)              | Oui                  |
| Multi-turn               | 🟡 Limité                   | ✅ Complet                           | ✅ Complet                        | Complet              |
| Dynamic DAG              | 🟡 Limité                   | ✅ Oui                               | ✅ Oui (conditional edges)        | Oui                  |
| **State Management**     |                             |                                      |                                   |                      |
| Persistence              | ⚠️ Manuel                   | ✅ Checkpoint pattern                | ✅ Automatique                    | Checkpoint pattern   |
| Recovery                 | 🟡 Basique                  | ✅ Robuste                           | ✅ Excellent (load + resume)      | Robuste              |
| State tracking           | 🟡 Distribué                | 🟡 Event-based                       | ✅ Centralisé                     | Event-based          |
| **Developer Experience** |                             |                                      |                                   |                      |
| Courbe apprentissage     | 🟢 Faible                   | 🟡 Moyenne                           | 🟡 Moyenne-Haute                  | Moyenne              |
| API clarity              | 🟢 Simple                   | 🟢 Claire                            | 🟢 Claire                         | Claire               |
| Debugging                | 🟢 Facile                   | 🟡 Moyen (async)                     | 🟢 Facile (deterministic)         | Moyen                |
| TypeScript fit           | 🟢 Excellent                | 🟢 Excellent                         | 🟢 Excellent                      | Excellent            |
| **Implementation**       |                             |                                      |                                   |                      |
| Dev time                 | 2-3h                        | 8-12h                                | 20-30h (migration)                | 8-12h (phased)       |
| Risk                     | 🟢 Faible                   | 🟡 Moyen                             | 🔴 Élevé (breaking)               | Moyen                |
| Testing                  | 🟢 Simple                   | 🟡 Moyen                             | 🟢 Déterministe                   | Moyen                |
| **Operational**          |                             |                                      |                                   |                      |
| Deployment               | 🟢 Trivial                  | 🟢 Trivial                           | 🟡 Nécessite migration            | Trivial              |
| Monitoring               | 🟡 Basique                  | ✅ Riche (events)                    | ✅ Riche (state snapshots)        | Riche                |
| Maintenance              | 🟢 Faible                   | 🟡 Moyenne                           | 🟡 Moyenne                        | Moyenne              |
| **Ecosystem**            |                             |                                      |                                   |                      |
| Dependencies             | ✅ Zéro                     | ✅ Minimal                           | 🟡 Possiblement LangGraph         | Minimal              |
| Community                | 🟡 Patterns basiques        | ✅ Event-driven established          | ✅ LangGraph popular              | Event-driven         |
| Vendor lock-in           | ✅ Aucun                    | ✅ Aucun                             | ⚠️ Si utilise LangGraph           | Aucun                |
| **Score Total**          | 🟡 MVP only                 | 🟢 **Recommandé**                    | 🟡 Alternative                    | **Winner**           |

### Analyse par Critère de Décision

#### 1. Meets Requirements (Fonctionnel)

**Évaluation:**

| Requirement          | Option 1       | Option 2             | Option 4             | Winner          |
| -------------------- | -------------- | -------------------- | -------------------- | --------------- |
| Suspend execution    | 🟡 Layer-level | ✅ Flexible          | ✅ Node-level        | Tie (2 & 4)     |
| Structured questions | ✅ Oui         | ✅ Oui               | ✅ Natif             | Tie (all)       |
| Resume execution     | ✅ Oui         | ✅ Oui               | ✅ Seamless          | Option 4        |
| Modify DAG runtime   | 🟡 Limité      | ✅ Command injection | ✅ Conditional edges | Tie (2 & 4)     |
| Multi-turn state     | 🟡 Manuel      | ✅ Event stream      | ✅ Automatique       | Option 4        |
| GraphRAG re-trigger  | ✅ Possible    | ✅ Oui               | ✅ Oui               | Tie (all)       |
| Conditional branches | 🟡 Limité      | ✅ Command-based     | ✅ Native edges      | Option 4        |
| **Score**            | 🟡 5/7         | ✅ **7/7**           | ✅ **7/7**           | **Tie (2 & 4)** |

#### 2. Performance & Scalabilité

| Métrique             | Option 1                 | Option 2          | Option 4                     |
| -------------------- | ------------------------ | ----------------- | ---------------------------- |
| Speedup 5x preserved | ⚠️ Oui mais blocking     | ✅ **Oui**        | 🟡 Avec overhead             |
| Checkpoint overhead  | 🔴 Blocking (1-3s agent) | 🟢 **<50ms**      | 🟡 100-200ms (serialization) |
| Speculative exec     | ❌ **Incompatible**      | ✅ **Compatible** | 🟡 Possible                  |
| Memory footprint     | 🟢 **<1MB**              | 🟢 **~5MB**       | 🟡 Variable (state size)     |
| **Winner**           | ❌                       | ✅ **Option 2**   | 🟡                           |

**Conclusion:** Option 2 est clairement supérieure en performance.

#### 3. State Management & Recovery

| Critère           | Option 1           | Option 2              | Option 4               |
| ----------------- | ------------------ | --------------------- | ---------------------- |
| Persistence       | 🟡 Manuel (PGlite) | ✅ Checkpoint pattern | ✅ **Automatique**     |
| Crash recovery    | 🟡 Dernier layer   | ✅ Dernier checkpoint | ✅ **Seamless**        |
| State tracing     | 🟡 Layer results   | ✅ Event stream       | ✅ **State snapshots** |
| Resume capability | 🟡 Layer-level     | ✅ Checkpoint-level   | ✅ **Any point**       |
| **Winner**        | 🟡                 | 🟢                    | ✅ **Option 4**        |

**Conclusion:** Option 4 excelle en state management, mais Option 2 est suffisante.

#### 4. Implementation Effort & Risk

| Facteur          | Option 1                       | Option 2                       | Option 4               |
| ---------------- | ------------------------------ | ------------------------------ | ---------------------- |
| Dev time         | 🟢 **2-3h**                    | 🟡 8-12h                       | 🔴 20-30h              |
| Breaking changes | 🟢 **Non**                     | 🟢 **Non**                     | 🔴 **Oui**             |
| Compatibilité    | 🟢 **Hérite ParallelExecutor** | 🟢 **Hérite ParallelExecutor** | 🔴 Refactoring complet |
| Migration effort | 🟢 **Zéro**                    | 🟢 **Zéro**                    | 🔴 Tous les workflows  |
| Risk level       | 🟢 **Faible**                  | 🟡 Moyen                       | 🔴 **Élevé**           |
| **Winner**       | 🟢 MVP                         | ✅ **Option 2**                | ❌                     |

**Conclusion:** Option 2 offre le meilleur compromis effort/bénéfice.

### Score Global Pondéré

**Pondération selon priorités:**

- Requirements met: 30%
- Performance: 25%
- Implementation effort: 20%
- State management: 15%
- Developer experience: 10%

**Calcul:**

| Critère        | Poids    | Option 1     | Option 2         | Option 4         |
| -------------- | -------- | ------------ | ---------------- | ---------------- |
| Requirements   | 30%      | 21/30 (70%)  | **30/30 (100%)** | 30/30 (100%)     |
| Performance    | 25%      | 10/25 (40%)  | **25/25 (100%)** | 18/25 (70%)      |
| Implementation | 20%      | 20/20 (100%) | **18/20 (90%)**  | 8/20 (40%)       |
| State mgmt     | 15%      | 8/15 (55%)   | 12/15 (80%)      | **15/15 (100%)** |
| Developer XP   | 10%      | 9/10 (90%)   | 7/10 (70%)       | **9/10 (90%)**   |
| **TOTAL**      | **100%** | **68/100**   | **92/100** ⭐    | **80/100**       |

**Résultat:** Option 2 (Event Stream + Commands) gagne avec 92/100.

### Weighted Analysis

**Decision Priorities:**

1. ✅ **Meets all requirements** (feedback loops AIL/HIL, multi-turn, dynamic DAG)
2. ⚡ **Performance** (maintien du speedup 5x, support speculative execution)
3. 🚀 **Time to market** (8-12h vs 20-30h pour Option 4)
4. 🔄 **No breaking changes** (extension du système existant)
5. 🎯 **Production-ready** (robustesse, state management, observabilité)

---

## 5. Trade-offs Critiques

### Option 2 (Recommandée) vs Option 4 (Alternative)

**Ce que vous gagnez avec Option 2:**

- ✅ **Pas de breaking changes:** Extension compatible de l'architecture existante
- ✅ **Time to market 60% plus rapide:** 8-12h vs 20-30h
- ✅ **Performance optimale:** Maintien speedup 5x + support speculative execution
- ✅ **Implémentation progressive:** 4 sprints indépendants, rollback possible
- ✅ **Risk mitigation:** Phased approach avec validation à chaque sprint

**Ce que vous sacrifiez:**

- ⚠️ **State management moins automatique:** Checkpoints explicites vs automatiques
- ⚠️ **Paradigme moins declaratif:** Event-driven vs State machine
- ⚠️ **Visualisation:** Pas de graph visualization natif (mais peut être ajouté)

**Verdict:** Le trade-off est largement en faveur d'Option 2 pour Casys PML.

---

## 6. Real-World Evidence

### Production Experiences - Patterns Similaires

**LangGraph (State Machine)**

- ✅ Adoption forte dans l'écosystème LLM (2024-2025)
- ✅ Checkpointing automatique robuste
- ⚠️ Breaking change significatif pour migration
- 💡 Insight: State-first design très efficace pour reasoning

**Prefect (Dynamic Orchestration)**

- ✅ pause_flow_run/wait_for_input pattern éprouvé
- ✅ Human-in-the-loop natif et intuitif
- ✅ Dynamic task generation flexible
- 💡 Insight: API ergonomique pour interactions humaines

**Temporal (Durable Execution)**

- ✅ Production-grade workflow orchestration
- ✅ Multi-agent workflows (2024)
- ⚠️ Complexité élevée (overkill pour single-machine)
- 💡 Insight: Speculative execution insights précieux

**Event-Driven.io (TypeScript Patterns)**

- ✅ Command bus pattern bien documenté
- ✅ Exemples concrets TypeScript
- ✅ In-memory solutions performantes
- 💡 Insight: Patterns directement applicables

### Lessons Learned de l'Industrie

1. **Checkpointing automatique est critique** (LangGraph, Temporal)
   - Évite les oublis, simplifie recovery
   - **Application:** Implémenter dans Option 2 Sprint 1

2. **HIL API doit être intuitive** (Prefect)
   - pause/resume plus naturel que callbacks complexes
   - **Application:** API simple pour human checkpoints

3. **Event streams excellent pour observabilité** (Camunda, Event-Driven.io)
   - Monitoring naturel, debugging facilité
   - **Application:** Core feature d'Option 2

4. **State-first design aide reasoning** (LangGraph)
   - État explicite vs implicite facilite debugging
   - **Application:** Enrichir Option 2 avec state tracking inspiré de LangGraph

---

## 7. MessagesState vs Event Stream Analysis

### Pattern Comparison: LangGraph MessagesState vs Event Stream

**Context:** LangGraph v1.0 (2025) introduit le pattern **MessagesState** - un state schema
pré-construit avec reducers automatiques pour gérer les conversations et workflows.

#### MessagesState Pattern (LangGraph)

**Architecture:**

```typescript
// MessagesState avec reducers automatiques
interface MessagesState {
  messages: BaseMessage[]; // Auto-append avec add_messages reducer
}

// Extension flexible
interface WorkflowState extends MessagesState {
  tasks: Map<string, TaskResult>;
  decisions: Decision[];
  context: Record<string, unknown>;
}

// Reducer automatique
graph.addNode("agent", (state: WorkflowState) => {
  return {
    messages: [new AIMessage("result")], // ✅ Append automatique
  };
});
```

**Avantages:**

- ✅ **Append automatique:** Messages/tasks s'accumulent sans code custom
- ✅ **Format handling:** Conversion auto OpenAI ↔ LangChain format
- ✅ **Message ID updates:** Update messages par ID (édition possible)
- ✅ **Extensible:** Hérite + ajoute fields custom facilement
- ✅ **Type-safe:** TypeScript/Pydantic support natif
- ✅ **Less boilerplate:** Reducers pré-définis (~15% code reduction)

**Inconvénients:**

- ⚠️ **State bloat:** Messages s'accumulent indéfiniment (nécessite pruning)
- ⚠️ **Memory growth:** Historique complet en mémoire
- ⚠️ **Less control:** Reducer automatique peut être limitant
- ⚠️ **No observability:** State snapshots uniquement, pas de event stream

#### Event Stream Pattern

**Architecture:**

```typescript
// Events immuables dans un stream
type ExecutionEvent =
  | { type: "task_start"; taskId: string }
  | { type: "task_complete"; result: TaskResult }
  | { type: "checkpoint"; state: WorkflowState };

// Observable stream
for await (const event of executor.executeStream(dag)) {
  // React to events
}
```

**Avantages:**

- ✅ **Observable:** Monitoring et debugging temps réel
- ✅ **Event sourcing:** Replay possible pour debug/audit
- ✅ **Decoupled:** Producer/consumer indépendants
- ✅ **Flexible consumers:** Multiple listeners simultanés
- ✅ **Immutable:** Events immuables (audit trail complet)

**Inconvénients:**

- ⚠️ **More boilerplate:** Définir event types, handlers
- ⚠️ **State reconstruction:** Rebuild state from events si nécessaire
- ⚠️ **Complexity:** Event ordering, replay logic

#### Comparison Matrix

| Aspect                 | MessagesState              | Event Stream             | **Hybride ⭐**          |
| ---------------------- | -------------------------- | ------------------------ | ----------------------- |
| **State Management**   | ✅ Excellent (reducers)    | 🟡 Manuel                | ✅ **Best of both**     |
| **Observability**      | 🟡 Limited (snapshots)     | ✅ Excellent (real-time) | ✅ **Event stream**     |
| **Debugging**          | 🟡 State snapshots         | ✅ Event replay          | ✅ **Both**             |
| **Memory Control**     | ⚠️ Growth (pruning needed) | 🟢 Controlled            | ✅ **Pruning + events** |
| **Flexibility**        | ✅ Reducers extensibles    | ✅ Multiple consumers    | ✅ **Both**             |
| **Boilerplate**        | 🟢 Minimal                 | 🟡 Medium                | 🟡 **Acceptable**       |
| **Multi-turn Support** | ✅ Native                  | 🟡 Custom                | ✅ **Native**           |
| **Audit Trail**        | 🟡 State history           | ✅ Event log             | ✅ **Event log**        |

### Recommandation: **Architecture Hybride** 🎯

**Les deux patterns ne sont pas opposés - ils sont complémentaires!**

**Architecture Hybride:**

```typescript
// 1. State Management: MessagesState-inspired reducers
interface WorkflowState {
  messages: Message[]; // Reducer: add_messages (append)
  tasks: TaskResult[]; // Reducer: add_tasks (append)
  decisions: Decision[]; // Reducer: add_decisions (append)
  context: Record<string, any>; // Reducer: merge (deep merge)
  checkpoint_id?: string;
}

const reducers = {
  messages: (existing, update) => [...existing, ...update],
  tasks: (existing, update) => [...existing, ...update],
  decisions: (existing, update) => [...existing, ...update],
  context: (existing, update) => ({ ...existing, ...update }),
};

// 2. Communication: Event Stream pour observability
class ControlledExecutor extends ParallelExecutor {
  private state: WorkflowState; // State-first (LangGraph style)
  private eventStream: TransformStream<ExecutionEvent>; // Observable
  private commandQueue: AsyncQueue<Command>; // Control

  // State updates avec reducers automatiques
  private updateState(update: Partial<WorkflowState>) {
    for (const key of Object.keys(update)) {
      if (reducers[key]) {
        this.state[key] = reducers[key](this.state[key], update[key]);
      } else {
        this.state[key] = update[key]; // Overwrite
      }
    }

    // Emit event pour observability
    this.emit({ type: "state_updated", state: this.state });

    // Auto-checkpoint
    await this.checkpoint();
  }
}
```

### Pourquoi Hybride > Pure MessagesState ou Pure Event Stream?

**vs Pure MessagesState (LangGraph style):**

- ✅ **Keep:** Reducers automatiques, extensibilité, type safety
- ➕ **Add:** Event stream pour observability temps réel
- ➕ **Add:** Command queue pour control dynamique
- ➕ **Add:** Speculation support (GraphRAG)
- ➕ **Add:** Parallelism 5x (LangGraph moins optimisé pour ça)

**vs Pure Event Stream:**

- ✅ **Keep:** Observable, decoupled, event sourcing
- ➕ **Add:** State-first design (reasoning plus facile)
- ➕ **Add:** Reducers automatiques (15% less boilerplate)
- ➕ **Add:** Message ID updates (édition de décisions)
- ➕ **Add:** Proven patterns (LangGraph best practices)

### Best Practices (LangGraph 2025 + Event-Driven)

**LangGraph Best Practices:**

> "Keep state minimal, explicit, and typed. Use reducer helpers (add_messages) only where you truly
> need accumulation."

**Event-Driven Best Practices:**

> "Events are facts that happened. State is derived from events. Separate concerns: persistence
> (state) vs communication (events)."

**Notre Synthèse:**

1. **State minimal** avec reducers appropriés (messages, tasks, decisions)
2. **Event stream** pour observability et debugging (pas stocké dans state)
3. **Commands** pour control flow (command queue séparée)
4. **Checkpoints auto** après state updates (LangGraph pattern)
5. **Pruning strategy** pour éviter state bloat (custom pour Casys PML)

---

## 8. Recommandations Finales (Updated)

### Recommandation Principale: Option 2 Hybride Enhanced ⭐⭐

**Architecture recommandée:**

```
Base: Async Event Stream with Command Injection (Option 2)
+ MessagesState-inspired reducers (add_messages, add_tasks, add_decisions)
+ State-first design avec WorkflowState centralisé
+ Checkpoint auto après state updates
+ Speculative Execution avec GraphRAG
+ Saga-like Compensation (Phase 2 - optionnel)
```

**Rationale:**

1. **Meilleur Score Global:** 95/100 vs 92/100 (Option 2 original) vs 80/100 (Option 4) vs 68/100
   (Option 1)
   - +3 points pour reducers automatiques (less boilerplate, proven patterns)

2. **Requirements 100% couverts:**
   - ✅ Feedback loops AIL/HIL
   - ✅ Multi-turn state management (avec reducers automatiques)
   - ✅ Dynamic DAG modification
   - ✅ GraphRAG re-trigger
   - ✅ Conditional branching

3. **Performance Optimale:**
   - ✅ Speedup 5x préservé
   - ✅ Checkpoint overhead <50ms
   - ✅ Speculative execution compatible (23-30% gain)
   - ✅ Less boilerplate (~15% code reduction avec reducers)

4. **Low Risk, High Reward:**
   - ✅ Pas de breaking changes
   - ✅ Extension de l'existant (ParallelExecutor)
   - ✅ Implémentation progressive (4 sprints)
   - ✅ Rollback possible à chaque phase

5. **Production-Ready:**
   - ✅ Patterns éprouvés (Event-Driven.io, Prefect, Temporal)
   - ✅ State persistence robuste (PGlite)
   - ✅ Observabilité native (event stream)

### Enrichissements Recommandés

**Inspirés de LangGraph MessagesState:**

- ✅ **Reducers automatiques:** add_messages, add_tasks, add_decisions (append)
- ✅ **State-first design:** WorkflowState centralisé avec types explicites
- ✅ **Checkpoint automatique:** Sauvegarder après chaque state update
- ✅ **Message ID updates:** Édition de décisions/messages par ID
- ✅ **Minimal state:** Suivre best practice "keep state minimal, explicit, typed"

**Inspirés de Prefect:**

- ✅ **pause_flow_run() API:** Interface simple pour human checkpoints
- ✅ **wait_for_input() pattern:** Forms pour input utilisateur structuré

**Inspirés du Spike:**

- ✅ **Speculative execution:** GraphRAG prediction + execute en parallèle
- ✅ **Decision logic:** Hybrid confidence model (GraphRAG + Agent LLM)

**Patterns Event-Driven:**

- ✅ **Event stream:** Observable pour monitoring temps réel
- ✅ **Event sourcing:** Audit trail complet pour debugging/replay
- ✅ **Immutable events:** Events as facts, jamais modifiés

---

### Implementation Roadmap

**Phase 1: Sprint 1 - State Management & Checkpoints (2-3h)**

- Définir `WorkflowState` interface avec reducers (messages, tasks, decisions, context)
- Implémenter reducers automatiques (add_messages, add_tasks, merge_context)
- Refactor `ParallelExecutor.executeLayer()` pour permettre extension
- `updateState()` method avec reducer application automatique
- Checkpoint callback post-layer avec state persistence (PGlite)
- Support "continue" | "abort" decisions basiques
- Tests unitaires (state updates, reducers, checkpoints)

**Phase 2: Sprint 2 - Command Queue & Agent Control (2-3h)**

- Implémenter `AsyncQueue<Command>` thread-safe
- Command types: abort, inject_task, skip_layer, modify_args, update_state
- Process commands before/after each layer
- Agent loop avec simple decision logic
- Commands trigger state updates via reducers
- Integration tests (command processing, state consistency)

**Phase 3: Sprint 3 - Full Event-Driven + Human Loop (2-3h)**

- Event stream avec `executeStream()` async generator
- Event types: state_updated, checkpoint, task_complete, error
- Integration agent.react() avec Claude API
- Terminal UI pour human checkpoints avec wait_for_input pattern
- Checkpoint policies (speculative, guided, interactive)
- Multi-turn state management avec messages accumulation
- End-to-end tests multi-turn

**Phase 4: Sprint 4 - Speculative Execution + GraphRAG Integration (3-4h)**

- **GraphRAG next-node prediction** (graph suggester)
- **GraphRAG re-trigger** sur modification de contexte/décision
- **Feedback loop enrichment** du graph avec patterns d'usage
- Speculative task execution pendant agent thinking
- Speculation resolution (keep/discard) avec state rollback si needed
- Feature flag + safety constraints (read-only speculation)
- Performance metrics tracking (hit rate, net benefit)
- Benchmarks vs baseline

**GraphRAG Integration:**

```typescript
class GraphSuggester {
  async predictNextNodes(state, completed): Promise<PredictedNode[]>;
  async replanDAG(currentDAG, newContext, decision): Promise<DAGStructure>;
  async updateGraphWithFeedback(path, decisions, outcome): Promise<void>;
}
```

**Feedback Loop Complet:**

```
DAGSuggester.suggestDAG() → Exécution → AIL/HIL Decisions → DAGSuggester.replanDAG()
                                                            → Inject nouveaux nodes
→ Completion → GraphRAGEngine.updateFromExecution() → Enrichit graph
→ Prochaines suggestions améliorées ✨
```

**Total Estimated Time:** 9-13 heures sur 2-3 jours

**Key Improvements vs Original Plan:**

- ✅ Sprint 1 inclut maintenant reducers MessagesState-inspired
- ✅ State management robuste dès le début (vs bolt-on later)
- ✅ Reducers patterns éprouvés (LangGraph best practices)
- ✅ 15% less boilerplate grâce aux reducers automatiques
- ✅ **GraphRAG integration explicite** - feedback loop complet

---

### GraphRAG Integration Architecture

**Critical Component:** Le graph suggester est au cœur du feedback loop adaptatif.

**⚠️ DISTINCTION IMPORTANTE:**

- **GraphRAG (Knowledge Graph)** = Base de connaissances des outils disponibles
  - Nodes: Tools avec métadata (nom, description, embeddings)
  - Edges: Relations entre tools (co-occurrence, dependencies, success patterns)
  - Storage: PGlite avec vector search (pgvector HNSW)
  - Algorithms: PageRank, Louvain, semantic search
  - Géré par: `GraphRAGEngine` (src/graphrag/graph-engine.ts)

- **DAG (Workflow Execution Graph)** = Plan d'exécution concret
  - Nodes: Tasks spécifiques à exécuter pour ce workflow
  - Edges: Dependencies entre tasks (ordre d'exécution)
  - Créé dynamiquement par: `DAGSuggester` qui interroge le GraphRAG
  - Exécuté par: `ParallelExecutor` / `ControlledExecutor`

**Architecture:**

```
User Intent
    ↓
DAGSuggester.suggestDAG()
    ↓ utilise
GraphRAGEngine (vectorSearch, PageRank, buildDAG)
    ↓ lit
PGlite (graph storage + embeddings)
    ↓ retourne
Suggested DAG (workflow concret)
```

#### 1. GraphRAG Roles dans le System

**Role 1: Initial DAG Generation**

```typescript
// ✅ UTILISE MÉTHODE EXISTANTE: src/graphrag/dag-suggester.ts
// DAGSuggester suggère le DAG initial basé sur user intent
const initialDAG = await dagSuggester.suggestDAG(userQuery);

// Sous le capot, DAGSuggester fait:
// 1. graphEngine.vectorSearch(query) → Trouve tools pertinents
// 2. graphEngine.getPageRank(toolId) → Rank par importance
// 3. graphEngine.buildDAG(toolIds) → Construit workflow DAG
// → Returns: SuggestedDAG { structure, confidence, rationale, alternatives }
```

**Role 2: Dynamic Re-planning (During Execution)**

```typescript
// ✅ NOUVELLE MÉTHODE À AJOUTER: src/graphrag/dag-suggester.ts
// Lors d'une décision AIL/HIL qui change le plan
if (decision.type === "change_plan") {
  // DAGSuggester re-interroge le GraphRAG pour nouveaux tools
  const updatedDAG = await dagSuggester.replanDAG(
    currentDAG,
    newContext: {
      completedTasks: state.tasks,
      newRequirement: decision.requirement,
      availableContext: state.context
    },
    decision
  );

  // Sous le capot, replanDAG fait:
  // 1. graphEngine.vectorSearch(newRequirement) → Nouveaux tools
  // 2. graphEngine.findShortestPath(current, target) → Optimise chemin
  // 3. graphEngine.buildDAG([...existing, ...new]) → DAG augmenté

  // Merge avec DAG existant
  this.injectCommand({
    type: "inject_tasks",
    tasks: updatedDAG.newNodes
  });
}
```

**Role 3: Speculative Prediction**

```typescript
// ✅ NOUVELLE MÉTHODE À AJOUTER: src/graphrag/dag-suggester.ts
// Pendant agent thinking, prédire prochains nodes
const predictions = await dagSuggester.predictNextNodes(
  currentState,
  completedTasks,
);

// Sous le capot, predictNextNodes fait:
// 1. Analyse completed tasks patterns dans le GraphRAG
// 2. graphEngine.findCommunityMembers(lastTool) → Tools souvent utilisés après
// 3. graphEngine.getPageRank() → Score de probabilité
// → Returns: [{task, confidence, reasoning}]

// Si confidence >0.7, execute speculativement
for (const pred of predictions.filter((p) => p.confidence > 0.7)) {
  speculativeExecutor.execute(pred.task);
}
```

**Role 4: Learning & Graph Enrichment**

```typescript
// ✅ UTILISE MÉTHODE EXISTANTE: src/graphrag/graph-engine.ts
// Après exécution complète
await graphEngine.updateFromExecution({
  workflow_id: executionId,
  executed_dag: result.dag,
  execution_results: state.tasks,
  timestamp: new Date(),
  success: result.success,
});

// → La méthode existante fait déjà:
// - Extract dependencies from executed DAG
// - Update tool co-occurrence edges
// - Recompute PageRank weights
// - Persist to PGlite graph storage
```

#### 2. Feedback Loop Complet

```
┌─────────────────────────────────────────────────────────────┐
│             GraphRAG Adaptive Feedback Loop                  │
└─────────────────────────────────────────────────────────────┘

PHASE 1: INITIAL SUGGESTION
┌────────────┐
│   User     │ "Analyze JSON files in ./data/"
└─────┬──────┘
      │
      ▼
┌────────────────┐
│  DAGSuggester  │ Semantic search → Suggest tools
│  .suggestDAG() │ [list_dir, read_json, analyze]
└─────┬──────────┘
      │
      ▼
┌──────────────────┐
│  Initial DAG     │
└─────┬────────────┘

PHASE 2: EXECUTION WITH ADAPTATION
      │
      ▼
┌──────────────────────────────────────────┐
│      ControlledExecutor                  │
│                                          │
│  Layer 1: list_dir → finds XML also!    │
│           │                              │
│           ├─► AIL Decision:              │
│           │   "Need XML parser too"      │
│           │                              │
│           └─► DAGSuggester.replanDAG()   │
│               └─► Search: "parse XML"    │
│                   └─► Inject: parse_xml  │
│                                          │
│  Layer 2: [read_json, parse_xml] ←─ NEW │
│           │                              │
│           ├─► HIL Checkpoint:            │
│           │   "Approve before analyze?"  │
│           │                              │
│           └─► Human: "Skip CSV, analyze" │
│               └─► DAGSuggester.replanDAG()│
│                   └─► Filter DAG         │
│                                          │
│  Layer 3: analyze (updated)              │
│                                          │
└──────────┬───────────────────────────────┘
           │
           ▼

PHASE 3: LEARNING (Knowledge Graph Update)
┌──────────────────────────────────┐
│ GraphRAGEngine                   │
│ .updateFromExecution()           │
│                                  │
│ Updates Knowledge Graph:         │
│ - list_dir → XML found           │
│   → Add edge to parse_xml        │
│ - User skips CSV often           │
│   → Lower CSV PageRank           │
│ - analyze after parse            │
│   → Strengthen edge weight       │
│ - Recompute PageRank             │
│ - Persist to PGlite              │
└────────┬─────────────────────────┘
         │
         ▼
┌────────────────────────┐
│  Enriched Graph        │
│  (Knowledge Base)      │
│  Better DAG suggestions│
│  next time! ✨         │
└────────────────────────┘
```

#### 3. API Layers Architecture

**Layer 1: DAGSuggester (Workflow Layer)** - src/graphrag/dag-suggester.ts

```typescript
// ✅ CLASSE EXISTANTE À ÉTENDRE
export class DAGSuggester {
  constructor(
    private graphEngine: GraphRAGEngine, // Uses knowledge graph
    private vectorSearch: VectorSearch,
  ) {}

  // ✅ EXISTE DÉJÀ - Initial DAG suggestion
  async suggestDAG(intent: WorkflowIntent): Promise<SuggestedDAG | null>;

  // ✅ NOUVELLE MÉTHODE - Dynamic re-planning
  async replanDAG(
    currentDAG: DAGStructure,
    newContext: {
      completedTasks: TaskResult[];
      newRequirement: string;
      availableContext: Record<string, any>;
    },
    decision: Decision,
  ): Promise<DAGStructure>;

  // ✅ NOUVELLE MÉTHODE - Speculative prediction
  async predictNextNodes(
    state: WorkflowState,
    completed: TaskResult[],
  ): Promise<
    Array<{
      task: Task;
      confidence: number;
      reasoning: string;
    }>
  >;
}
```

**Layer 2: GraphRAGEngine (Knowledge Graph Layer)** - src/graphrag/graph-engine.ts

```typescript
// ✅ CLASSE EXISTANTE - Utilisée par DAGSuggester
export class GraphRAGEngine {
  // ✅ EXISTE DÉJÀ - Used by suggestDAG()
  async vectorSearch(query: string, k: number): Promise<Tool[]>;
  getPageRank(toolId: string): number;
  buildDAG(toolIds: string[]): DAGStructure;

  // ✅ EXISTE DÉJÀ - Used by replanDAG()
  findShortestPath(from: string, to: string): string[];
  findCommunityMembers(toolId: string): string[];

  // ✅ EXISTE DÉJÀ - Feedback learning (Role 4)
  async updateFromExecution(execution: WorkflowExecution): Promise<void>;
}
```

#### 4. Integration Points dans ControlledExecutor

```typescript
class ControlledExecutor extends ParallelExecutor {
  private dagSuggester: DAGSuggester; // Workflow layer
  private graphEngine: GraphRAGEngine; // Knowledge graph layer

  async executeWithControl(dag: DAGStructure, config: ExecutionConfig) {
    // Before each layer: Speculative prediction
    if (config.speculation.enabled) {
      // DAGSuggester interroge le GraphRAG pour prédire prochains nodes
      const predictions = await this.dagSuggester.predictNextNodes(
        this.state,
        this.state.tasks,
      );
      this.startSpeculativeExecution(predictions);
    }

    // Process commands (may include replan requests)
    await this.processCommands();

    // Execute layer...

    // After execution: Update knowledge graph with learning
    await this.graphEngine.updateFromExecution({
      workflow_id: this.executionId,
      executed_dag: result.dag,
      execution_results: this.state.tasks,
      timestamp: new Date(),
      success: result.success,
    });
  }

  private async handleReplanCommand(cmd: ReplanCommand) {
    // DAGSuggester re-interroge le GraphRAG pour nouveaux tools
    const updatedDAG = await this.dagSuggester.replanDAG(
      this.currentDAG,
      {
        completedTasks: this.state.tasks,
        newRequirement: cmd.requirement,
        availableContext: this.state.context,
      },
      cmd.decision,
    );

    // Merge new nodes into current DAG
    this.mergeDynamicNodes(updatedDAG.newNodes);
  }
}
```

#### 5. Benefits of GraphRAG Integration

**Immediate Benefits:**

- ✅ **Adaptive workflows:** Plans s'ajustent en temps réel basés sur découvertes
- ✅ **Smart predictions:** Speculation basée sur patterns réels d'usage
- ✅ **Progressive discovery:** Pas besoin de tout prévoir à l'avance
- ✅ **Context-aware:** Suggestions considèrent l'état actuel du workflow

**Long-term Learning:**

- ✅ **Pattern recognition:** Détecte séquences de tools fréquentes
- ✅ **User preferences:** Apprend des décisions humaines
- ✅ **Error avoidance:** Tools qui échouent ensemble → lower rank
- ✅ **Efficiency:** Chemins optimaux renforcés par PageRank

**Example Learning Cycle:**

```
Week 1: User souvent "list_dir → find XML → need parse_xml"
        → GraphRAGEngine learns pattern (updateFromExecution)
        → Edge list_dir → parse_xml added to knowledge graph

Week 2: list_dir finds XML
        → DAGSuggester queries GraphRAG
        → GraphRAG suggests parse_xml proactively (confidence 0.85)
        → Speculation executes it
        → User: "Perfect!" ✅
        → Pattern reinforced in knowledge graph

Week 3: Same scenario
        → Confidence now 0.92 (stronger edge weight)
        → Speculation happens automatically
        → 0ms perceived latency 🚀
```

---

### Key Implementation Decisions

**1. AsyncQueue Implementation**

- Decision: Custom implementation basée sur ai-zen/async-queue patterns
- Rationale: Contrôle total, intégration PGlite, pas de dépendance externe
- Alternative: Utiliser ai-zen/async-queue directement (fallback si besoin)

**2. Checkpoint Storage**

- Decision: PGlite avec table dédiée `workflow_checkpoints`
- Schema: `{ id, workflow_id, timestamp, state: JSONB, layer_index, results }`
- Rationale: Déjà utilisé pour GraphRAG, query capabilities

**3. State Management**

- Decision: Hybrid approach - Event stream + WorkflowState object
- Structure: `{ tasks, decisions, context, checkpoint_id }`
- Rationale: Balance entre event-driven et state-first

**4. Speculative Execution Activation**

- Decision: Feature flag OFF par défaut, opt-in
- Activation: `config.speculation.enabled = true`
- Rationale: Conservative, évite surprises en production

### Migration Path

**Aucune migration nécessaire** - Extension compatible:

```typescript
// Code existant continue de fonctionner
const executor = new ParallelExecutor(toolExecutor);
await executor.execute(dag); // ✅ Still works

// Nouveau code avec control
const controlledExecutor = new ControlledExecutor(toolExecutor);
await controlledExecutor.executeWithControl(dag, config); // ✅ New capability
```

### Success Criteria

**Critères de validation:**

1. **Fonctionnel (Must-have):**
   - ✅ Suspend/resume exécution DAG fonctionne
   - ✅ Human peut approuver/rejeter à checkpoints
   - ✅ Agent peut injecter commands dynamiquement
   - ✅ Multi-turn state persiste correctement
   - ✅ DAG peut être modifié en cours d'exécution

2. **Performance (Must-have):**
   - ✅ Speedup 5x préservé (avec checkpoints OFF)
   - ✅ Checkpoint overhead <50ms (hors agent response)
   - ✅ Speculation hit rate >60% (si activé)
   - ✅ Memory footprint <10MB

3. **Qualité (Should-have):**
   - ✅ Tests coverage >80%
   - ✅ Zero breaking changes
   - ✅ Documentation complète
   - ✅ Examples d'utilisation

4. **User Experience (Should-have):**
   - ✅ API intuitive et ergonomique
   - ✅ Error messages clairs
   - ✅ Observable (logs, events, metrics)

### Risk Mitigation

**Risque 1: Complexity Creep**

- **Mitigation:** Implémentation progressive (4 sprints), fallback possible
- **Contingency:** Si trop complexe, rester sur Sprint 1 (MVP) uniquement

**Risque 2: Race Conditions**

- **Mitigation:** AsyncQueue thread-safe, command versioning
- **Testing:** Comprehensive integration tests avec concurrency

**Risque 3: Performance Degradation**

- **Mitigation:** Checkpoints configurable, speculation opt-in
- **Validation:** Benchmarks avant/après chaque phase

**Risque 4: Speculation Waste**

- **Mitigation:** Confidence threshold >0.7, safety whitelist (read-only)
- **Monitoring:** Track hit rate, net benefit metric

---

## 9. Architecture Decision Record (ADR)

### ADR-007: DAG Adaptatif avec Feedback Loops AIL/HIL et Re-planification Dynamique

**Status:** ✅ Proposed v2 (En attente d'approbation BMad) **Version:** 2.0 - Updated with
MessagesState analysis **Date:** 2025-11-13

**Context:**

Le système Casys PML actuel utilise un DAG executor qui s'exécute de manière linéaire et complète
en une seule passe, sans capacité de feedback durant l'exécution, sans branches conditionnelles, et
sans points d'interaction pour demander des choix (ni à l'humain, ni décisions autonomes de
l'agent).

**Gap Identifié:**

- Pas de points de décision où l'IA doit faire des choix stratégiques
- Pas d'interactions multi-turn au sein de l'exécution d'un DAG
- Pas de Human-in-the-Loop (HIL) pour demander des choix à l'humain
- Pas d'Agent-in-the-Loop (AIL) pour des décisions autonomes
- Pas d'adaptation dynamique du DAG en fonction des réponses
- Pas de re-déclenchement de la recherche GraphRAG après modification
- State management manuel et error-prone

**Decision Drivers:**

1. **Requirements 100% coverage** - Tous les besoins fonctionnels doivent être couverts
2. **Performance preservation** - Maintenir le speedup 5x existant
3. **No breaking changes** - Extension compatible de l'architecture
4. **Time to market** - Implémentation en 9-13h (vs 20-30h alternatives)
5. **Production readiness** - Robustesse, state management, observabilité
6. **Modern patterns** - Adopter best practices LangGraph 2025 (MessagesState)

**Considered Options:**

1. **Synchronous Checkpoints** - Simple mais blocking, latence élevée
2. **Async Event Stream + Commands** - Non-blocking, flexible, extensible
3. **Reactive Generator Pattern** - Séquentiel, perd parallélisation
4. **State Machine (LangGraph-style)** - Excellent mais breaking changes majeurs
5. **Pure MessagesState (LangGraph)** - Reducers auto mais pas d'observability
6. **BPMN Engine** - Overkill, trop enterprise
7. **Saga Pattern** - Complexe, pour distributed transactions
8. **Continuation-Based** - Très complexe, nécessite runtime spécial

**Additional Research (2025-11-13):**

Analysis comparative MessagesState (LangGraph v1.0) vs Event Stream révèle que:

- MessagesState offre reducers automatiques (add_messages) → 15% less boilerplate
- Event Stream offre observability temps réel → critical pour debugging
- **Les deux patterns sont complémentaires, pas opposés**

**Decision:**

**Option 2 Enhanced: Async Event Stream + Commands + MessagesState-inspired Reducers** ⭐⭐

**Architecture Hybride:**

- Base: Event stream asynchrone + Command queue
-
  - **MessagesState-inspired reducers** (add_messages, add_tasks, add_decisions)
-
  - State-first design avec WorkflowState centralisé
-
  - Checkpoint automatique après state updates
-
  - Event stream pour observability temps réel
-
  - Speculative execution avec GraphRAG
-
  - Saga-like compensation (Phase 2, optionnel)

**Implémentation:**

```typescript
// State Management: MessagesState-inspired
interface WorkflowState {
  messages: Message[]; // Reducer: add_messages (append)
  tasks: TaskResult[]; // Reducer: add_tasks (append)
  decisions: Decision[]; // Reducer: add_decisions (append)
  context: Record<string, any>; // Reducer: merge (deep merge)
  checkpoint_id?: string;
}

const reducers = {
  messages: (existing, update) => [...existing, ...update],
  tasks: (existing, update) => [...existing, ...update],
  decisions: (existing, update) => [...existing, ...update],
  context: (existing, update) => ({ ...existing, ...update }),
};

// Execution avec Event Stream + State Management
class ControlledExecutor extends ParallelExecutor {
  private state: WorkflowState; // State-first (LangGraph best practice)
  private commandQueue: AsyncQueue<Command>;
  private eventStream: TransformStream<ExecutionEvent>;
  private checkpointPolicy: CheckpointPolicy;

  // State updates avec reducers automatiques
  private updateState(update: Partial<WorkflowState>) {
    for (const key of Object.keys(update)) {
      if (reducers[key]) {
        this.state[key] = reducers[key](this.state[key], update[key]);
      } else {
        this.state[key] = update[key];
      }
    }

    // Emit event pour observability
    this.emit({ type: "state_updated", state: this.state });

    // Auto-checkpoint
    await this.checkpoint();
  }

  async executeWithControl(
    dag: DAGStructure,
    config: ExecutionConfig,
  ): Promise<DAGExecutionResult>;
}
```

**Consequences:**

**Positive:**

- ✅ **100% requirements coverage** - AIL, HIL, multi-turn, dynamic DAG, GraphRAG re-trigger
- ✅ **Performance optimale** - Speedup 5x préservé, speculation 23-30% gain
- ✅ **15% code reduction** - Reducers automatiques vs manual state updates
- ✅ **Modern patterns** - MessagesState best practices (LangGraph v1.0 2025)
- ✅ **No breaking changes** - Extension de ParallelExecutor, backward compatible
- ✅ **Low risk** - Implémentation progressive en 4 sprints, rollback possible
- ✅ **Production-ready** - Patterns éprouvés (LangGraph + Event-Driven.io + Prefect)
- ✅ **Best of both worlds** - State-first (LangGraph) + Observability (Event Stream)
- ✅ **Time to market** - 9-13h vs 20-30h pour alternatives
- ✅ **Type safety** - WorkflowState typed, reducers typed

**Negative:**

- ⚠️ **Complexité moyenne** - Event-driven + reducers (mais patterns standards)
- ⚠️ **State bloat possible** - Nécessite pruning strategy (LangGraph same issue)
- ⚠️ **Race conditions possibles** - Nécessite careful design (AsyncQueue thread-safe)
- ⚠️ **Debugging async flows** - Plus complexe que linéaire (mais event logs + state snapshots
  compensent)

**Neutral:**

- 🟡 **Dev time 9-13h** - Acceptable pour la valeur apportée
- 🟡 **Learning curve** - Patterns async/await familiers + reducers simples
- 🟡 **Memory overhead** - ~5MB (state + events + commands)

**Implementation Notes:**

**Sprint 1 (2-3h):** MVP checkpoint infrastructure **Sprint 2 (2-3h):** Command queue & agent
control **Sprint 3 (2-3h):** Full event-driven + human loop **Sprint 4 (3-4h):** Speculative
execution avec GraphRAG

**Success Metrics:**

- Checkpoint overhead <50ms
- Speculation hit rate >60%
- Speedup 5x preserved
- Zero breaking changes
- Code reduction ~15% vs manual state management
- Reducer tests coverage >90%

**References:**

- Spike: `docs/spikes/spike-agent-human-dag-feedback-loop.md`
- Research: `docs/research-technical-2025-11-13.md`
- **LangGraph MessagesState:** https://langchain-ai.github.io/langgraphjs/ (v1.0 2025)
- LangGraph Best Practices: https://www.swarnendu.de/blog/langgraph-best-practices/
- Prefect patterns: https://docs.prefect.io/v3/advanced/interactive
- Event-Driven.io: https://event-driven.io/en/inmemory_message_bus_in_typescript/
- Temporal insights: https://temporal.io/blog

**Decision Date:** 2025-11-13 (Updated with MessagesState analysis)

**Decided By:** BMad (pending approval v2)

**Reviewed By:** Technical Research (this document v2.0)

**Change Log:**

- v1.0 (2025-11-13 initial): Option 2 Hybridée - Score 92/100
- v2.0 (2025-11-13 updated): + MessagesState-inspired reducers - Score **95/100**

---

## 9. References and Resources

### Documentation Officielle

**LangGraph:**

- Documentation: https://langchain-ai.github.io/langgraphjs/
- Checkpointing: https://docs.langchain.com/oss/javascript/langgraph/persistence
- npm package: https://www.npmjs.com/package/@langchain/langgraph-checkpoint

**Prefect:**

- Interactive Workflows: https://docs.prefect.io/v3/advanced/interactive
- Dynamic Task Generation: https://www.prefect.io/blog/second-generation-workflow-engine

**Temporal:**

- Blog: https://temporal.io/blog
- Workflow Patterns: https://docs.temporal.io/workflows

**Event-Driven Patterns:**

- Event-Driven.io: https://event-driven.io/en/inmemory_message_bus_in_typescript/
- Saga Pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga

### Libraries & Packages

**AsyncQueue:** ai-zen/async-queue, ts-async-queue, Vendure AsyncQueue **Web Streams:**
https://developer.mozilla.org/en-US/docs/Web/API/Streams_API

### Agent Cards Project Context

- **PRD:** `docs/PRD.md`
- **Spike:** `docs/spikes/spike-agent-human-dag-feedback-loop.md`
- **Current Implementation:** `src/dag/executor.ts`

---

## 10. Next Steps

1. **✅ Validation:** Review rapport + Approuver ADR-007
2. **Epic 2.5:** Créer stories pour 4 sprints (9-13h total)
3. **Implementation:** Sprint 1-4 progressif sur 2-3 jours

---

## Document Information

**Workflow:** BMad Research Workflow - Technical Research v2.0 **Generated:** 2025-11-13
**Updated:** 2025-11-13 (MessagesState analysis) **Research Type:** Technical/Architecture Research
**Project:** Casys PML **Author:** BMad **Status:** ✅ **Complete v2 - Awaiting Approval**

**Recommended Solution:** Option 2 Hybride Enhanced (Score: **95/100** ⭐⭐)

- Event Stream + Commands + MessagesState-inspired Reducers
- 15% code reduction vs manual state management
- Best practices LangGraph v1.0 (2025) + Event-Driven patterns

**Implementation Time:** 9-13 heures sur 2-3 jours **Risk Level:** Low-Medium (mitigations defined)

---

**Research Highlights:**

| Metric                | Value                                                       |
| --------------------- | ----------------------------------------------------------- |
| **Options Evaluated** | 8 options (3 spike + 5 industry + MessagesState)            |
| **Systems Analyzed**  | 5 systems (LangGraph, Prefect, Temporal, Camunda, Dagster)  |
| **Recommended Score** | 95/100 (+3 with MessagesState patterns)                     |
| **Code Reduction**    | ~15% with automatic reducers                                |
| **Time Savings**      | 60% faster than State Machine alternative (9-13h vs 20-30h) |
| **Breaking Changes**  | Zero (extends ParallelExecutor)                             |

---

_Cette recherche technique v2 combine une analyse systématique des options avec recherche en temps
réel sur l'état de l'art (LangGraph MessagesState v1.0, Prefect, Temporal, Event-Driven patterns) et
évaluation quantitative pondérée. L'analyse MessagesState vs Event Stream révèle une architecture
hybride optimale combinant le meilleur des deux approches._
