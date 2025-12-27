# Recherche Technique: Agent comme Orchestrateur de Haut Niveau

**Date:** 2025-12-03 **Auteur:** BMad **Projet:** Casys PML - Dynamic MCP Composition & Emergent
Capabilities

---

## Executive Summary

Cette recherche explore comment transformer Casys PML en un système où l'agent LLM devient un
**orchestrateur de haut niveau** qui génère, compose et apprend du code exécutable - créant un
nouveau paradigme où les **"capabilities" émergent de l'usage** plutôt que d'être pré-définies.

### Recommandation Principale

**Casys PML possède déjà la fondation la plus avancée du marché** pour ce paradigme. Les gaps
identifiés sont mineurs (~70 lignes de code pour le "Quick Win") et débloqueraient un apprentissage
réel des patterns d'exécution.

**Différenciateur clé proposé:**

> "Casys PML apprend de chaque exécution et suggère des capabilities optimisées - comme un
> pair-programmer qui se souvient de tout."

### Bénéfices Clés

| Bénéfice                   | Impact                                 |
| -------------------------- | -------------------------------------- |
| **Code Reuse**             | Skip génération Claude (~2-5 secondes) |
| **Execution Reuse**        | Cache hit (~200-500ms → instant)       |
| **Suggestions Proactives** | UX différenciante, réduction cognitive |
| **Learning Continu**       | Le système s'améliore avec l'usage     |

---

## 1. Objectifs de Recherche

### Question Technique

> Comment concevoir un système où l'agent LLM devient un orchestrateur de haut niveau qui génère,
> compose et apprend du code exécutable - créant un nouveau paradigme où les "capabilities" émergent
> de l'usage plutôt que d'être pré-définies?

### Contexte Projet

- **Type:** Évolution architecturale majeure (brownfield)
- **Codebase existante:** GraphRAG, Sandbox Deno, Cache LRU, Hybrid Search
- **Trigger:** Article Docker "Dynamic MCPs" + Réflexion ADR-027

### Exigences Fonctionnelles

1. Gestion intelligente de l'exécution de code avec dépendances
2. Système de snippets réutilisables avec recherche sémantique
3. Suggestions proactives basées sur les patterns appris
4. IPC pour streaming de progression sur longues tâches
5. Sécurité maintenue (sandbox isolation, pas de discovery runtime)

### Exigences Non-Fonctionnelles

- Performance: <20ms overhead pour hybrid search
- Latence: <200ms cold start sandbox
- Scalabilité: Support 1000+ tools, 10000+ edges
- Fiabilité: Graceful degradation si graph vide

### Contraintes Techniques

- Stack: Deno, TypeScript, PGlite, pgvector
- Isolation: Subprocess Deno (pas de Workers partagés)
- Embeddings: BGE-M3 (1024 dimensions)
- Graph: Graphology (in-memory) + PGlite (persistence)

---

## 2. Options Technologiques Évaluées

### Option 1: Docker Dynamic MCPs (mcp-find/mcp-add)

**Approche:** Discovery PENDANT l'exécution - l'agent peut demander des MCPs au runtime.

**Source:**
[Docker Blog - Dynamic MCPs](https://www.docker.com/blog/dynamic-mcps-stop-hardcoding-your-agents-world/)

### Option 2: Anthropic Programmatic Tool Calling

**Approche:** Claude génère du code Python qui orchestre les tools, seul le résultat final entre
dans le contexte.

**Source:**
[Anthropic Engineering - Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)

### Option 3: Casys PML Intent-Based + Graph-Augmented (Actuel)

**Approche:** Discovery AVANT exécution via semantic search + GraphRAG, scope fixe dans sandbox.

### Option 4: Casys PML + Emergent Capabilities (Proposé)

**Approche:** Extension de l'Option 3 avec tracking, capabilities cristallisées, et suggestions
proactives.

---

## 3. Profils Technologiques Détaillés

### Option 1: Docker Dynamic MCPs

#### Overview

- **Maturité:** Experimental (beta, décembre 2025)
- **Philosophie:** "Agent discovers at runtime"
- **Composants:** mcp-find, mcp-add, MCP Gateway, Catalog

#### Caractéristiques Techniques

```
Agent ──"I need GitHub"──► mcp-find(GitHub)
                               │
                               ▼
                          Catalog search
                               │
                               ▼
                          mcp-add(github)
                               │
                               ▼
                   Tools maintenant disponibles
```

#### Points Forts

- Flexibilité maximale pour l'agent
- 270+ serveurs dans le catalog Docker
- Isolation container (gVisor)
- Session-scoped (sécurité)

#### Points Faibles

- **Récursion possible:** Code peut demander des tools indéfiniment
- **Pas de learning:** Aucune persistence entre sessions
- **Tracking complexe:** Events mid-run difficiles à suivre
- **Cold start:** ~500ms par nouveau MCP

#### Coûts

- Docker Desktop requis
- Compute pour containers

---

### Option 2: Anthropic Programmatic Tool Calling

#### Overview

- **Maturité:** Production (disponible via API)
- **Philosophie:** "Code orchestrates tools"
- **Bénéfice principal:** 37% réduction tokens

#### Caractéristiques Techniques

```python
# Claude génère ce code
commits = await github.list_commits()
for c in commits:
    await memory.store(c)
return {"count": len(commits)}  # SEUL CECI entre dans le context
```

#### Points Forts

- Réduction drastique des tokens (37%)
- Logique explicite (loops, conditionals)
- Latence réduite (moins de round-trips)
- Accuracy améliorée (code vs natural language)

#### Points Faibles

- **Pas de learning:** Aucun pattern stocké
- **Tools pré-définis:** Pas de discovery
- **Python only:** Sandbox limité

#### Métriques Officielles

| Métrique                     | Avant | Après |
| ---------------------------- | ----- | ----- |
| Token usage                  | 100%  | 63%   |
| Internal knowledge retrieval | 25.6% | 28.5% |
| GIA benchmark                | 46.5% | 51.2% |

**Source:** [Anthropic Engineering Blog](https://www.anthropic.com/engineering/advanced-tool-use)

---

### Option 3: Casys PML Actuel

#### Overview

- **Maturité:** Production (implémenté)
- **Philosophie:** "Intent-based discovery BEFORE execution"

#### Architecture Actuelle

```
execute_code(intent, code)
       ↓
   VectorSearch → finds relevant tools (BGE-M3, top-k)
       ↓
   Hybrid Search → α×semantic + (1-α)×graph
       ↓
   ContextBuilder → injects tools into sandbox
       ↓
   DenoSandboxExecutor → runs code
       ↓
   Return result ← NO GRAPH UPDATE (Gap!)
```

#### Composants Implémentés

| Composant        | Fichier              | Lignes | Status        |
| ---------------- | -------------------- | ------ | ------------- |
| GraphRAG Engine  | `graph-engine.ts`    | 1339   | ✅ Production |
| Context Builder  | `context-builder.ts` | 555    | ✅ Production |
| Code Cache       | `cache.ts`           | 552    | ✅ Production |
| Vector Search    | `search.ts`          | ~400   | ✅ Production |
| Sandbox Executor | `executor.ts`        | ~300   | ✅ Production |

#### Algorithmes Graph Implémentés

| Algorithme             | Usage                | Ligne                 |
| ---------------------- | -------------------- | --------------------- |
| **PageRank**           | Importance des tools | `graph-engine.ts:176` |
| **Louvain**            | Community detection  | `graph-engine.ts:182` |
| **Adamic-Adar**        | Similarité 2-hop     | `graph-engine.ts:588` |
| **Bidirectional Path** | Dépendances DAG      | `graph-engine.ts:241` |

#### Points Forts Existants

- Semantic search avant exécution (pas de récursion)
- GraphRAG avec 4 algorithmes
- Hybrid search avec α adaptatif
- Cache LRU + TTL
- Sécurité: validation noms, no prototype pollution

#### Gaps Identifiés

- Pas de tracking des tools RÉELLEMENT appelés
- `workflow_pattern` table existe mais inutilisée
- Pas de capability matching
- Pas de suggestions proactives

---

### Option 4: Casys PML + Emergent Capabilities (Proposé)

#### Vision

Les capabilities ne sont pas pré-définies, elles **ÉMERGENT de l'usage**.

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: Cold Start (0-100 exécutions)                         │
│  • Semantic search pure (α = 1.0)                               │
│  • Chaque exécution track les tools                             │
│  • Edges créés dans GraphRAG                                    │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 2: Pattern Detection (100-500 exécutions)                │
│  • Louvain détecte des CLUSTERS de tools                        │
│  • Patterns récurrents identifiés (3+ succès)                   │
│  • α diminue (graph gagne en influence)                         │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 3: Capability Crystallization (500+ exécutions)          │
│  • Patterns validés → Capabilities explicites                   │
│  • Code + intent + tools stockés ensemble                       │
│  • Cache de résultats avec invalidation intelligente            │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 4: Emergent Intelligence (1000+ exécutions)              │
│  • Casys PML SUGGÈRE des capabilities combinées                │
│  • Auto-composition: "Pour X, combiner A + B + C"               │
│  • Claude devient orchestrateur pur                             │
└─────────────────────────────────────────────────────────────────┘
```

#### Architecture 3 Couches

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 1: ORCHESTRATION (Claude)                               │
│  • Reçoit intent utilisateur                                    │
│  • Query Casys PML: "Qu'est-ce que je peux faire?"             │
│  • Décide: capability existante OU génère nouveau code          │
│  • Reçoit SEULEMENT le résultat final + metadata                │
└─────────────────────────────────────────────────────────────────┘
                         ▲ IPC: progress, result
                         │
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 2: CAPABILITY ENGINE (Casys PML)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Capability  │  │   Snippet   │  │ Suggestion  │              │
│  │   Matcher   │  │   Library   │  │   Engine    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                          │                                      │
│                          ▼                                      │
│         GraphRAG (PageRank, Louvain, Adamic-Adar)               │
└─────────────────────────────────────────────────────────────────┘
                         ▲ traces, learning
                         │
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 3: EXECUTION (Deno Sandbox)                             │
│  • Code injecté avec wrappers tracés                            │
│  • Émission events: tool_start, tool_end, progress              │
│  • Isolation complète (pas de discovery runtime)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Analyse Comparative

### Matrice de Comparaison

| Critère         | Docker MCP | Anthropic PTC | Casys PML Actuel | Casys PML Proposé     |
| --------------- | ---------- | ------------- | ---------------- | --------------------- |
| **Discovery**   | Runtime    | Pre-config    | Pre-exec         | Pre-exec + Capability |
| **Learning**    | ❌         | ❌            | Partiel (edges)  | ✅ Complet            |
| **Suggestions** | ❌         | ❌            | Related tools    | ✅ Proactives         |
| **Code Reuse**  | ❌         | ❌            | ❌               | ✅ Capabilities       |
| **Cache**       | Session    | ❌            | ✅ LRU           | ✅ LRU + Capability   |
| **Sécurité**    | Container  | Sandbox       | Sandbox          | Sandbox               |
| **Récursion**   | Possible   | N/A           | Impossible       | Impossible            |
| **Complexité**  | Haute      | Moyenne       | Moyenne          | Moyenne+              |

### Scores Pondérés

| Critère (Poids)       | Docker  | Anthropic | Casys PML Proposé |
| --------------------- | ------- | --------- | ----------------- |
| Learning (25%)        | 0       | 0         | **10**            |
| Performance (20%)     | 6       | 8         | **9**             |
| Sécurité (20%)        | 8       | 7         | **9**             |
| Flexibilité (15%)     | 9       | 5         | **7**             |
| Simplicité (10%)      | 5       | 8         | **7**             |
| Différenciation (10%) | 6       | 4         | **10**            |
| **TOTAL**             | **5.3** | **5.2**   | **8.7**           |

---

## 5. Trade-offs et Facteurs de Décision

### Casys PML Proposé vs Docker Dynamic MCPs

| Gain avec Casys PML    | Sacrifice                    |
| ---------------------- | ---------------------------- |
| Learning persistant    | Pas de discovery runtime     |
| Pas de récursion       | Moins flexible mid-session   |
| Suggestions proactives | Scope fixé à l'avance        |
| Performance (cache)    | Complexité code légèrement + |

**Quand choisir Docker:** Agent autonome qui doit explorer un espace inconnu. **Quand choisir Casys
PML:** Tâches répétitives où l'apprentissage apporte de la valeur.

### Casys PML Proposé vs Anthropic PTC

| Gain avec Casys PML   | Sacrifice            |
| --------------------- | -------------------- |
| Learning des patterns | N/A (complémentaire) |
| Suggestions           | N/A                  |
| Capability reuse      | N/A                  |

**Note:** Anthropic PTC et Casys PML sont **complémentaires**. Casys PML pourrait utiliser PTC comme
mécanisme d'exécution tout en ajoutant le learning layer.

---

## 6. Preuves du Monde Réel

### Anthropic Multi-Agent Research System

> "The system employs an orchestrator-worker pattern where a lead agent (Claude Opus 4) coordinates
> multiple specialized subagents (Claude Sonnet 4) working in parallel."

**Source:**
[Anthropic Engineering - Multi-Agent Research](https://www.anthropic.com/engineering/multi-agent-research-system)

**Relevance:** Valide le pattern orchestrateur + workers spécialisés.

### E2B Sandbox Performance

> "E2B Sandbox is a small isolated VM that can be started very quickly (~150ms)."

**Source:** [E2B Documentation](https://e2b.dev/docs)

**Relevance:** Casys PML Deno sandbox comparable (~100-200ms).

### Emergent Capabilities in LLMs

> "When memory and context converge, AI undergoes a phase transition into persistent, emergent
> intelligence."

**Source:**
[Towards Data Science - Emergent Capabilities](https://towardsdatascience.com/understanding-emergent-capabilities-in-llms-lessons-from-biological-systems-d59b67ea0379/)

**Relevance:** Justifie le concept de "capabilities émergentes" - le système devient plus
intelligent avec l'accumulation de données.

### MCP Security Concerns

> "In April 2025, security researchers released analysis that there are multiple outstanding
> security issues with MCP, including prompt injection, tool permissions where combining tools can
> exfiltrate files."

**Source:**
[Wikipedia - Model Context Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol)

**Relevance:** Valide l'approche Casys PML de ne PAS permettre discovery runtime.

---

## 7. Analyse des Patterns Architecturaux

### Pattern: Intent-Based Tool Composition

```
┌─────────────────────────────────────────────────────────────────┐
│  AVANT: Tool-Centric (Docker)                                   │
│  ─────────────────────────────────────────────────────────────  │
│  Agent pense en termes de TOOLS:                                │
│  "J'ai besoin de github, puis memory, puis filesystem"          │
│  → Charge chaque tool individuellement                          │
│  → Compose manuellement                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  APRÈS: Intent-Centric (Casys PML)                             │
│  ─────────────────────────────────────────────────────────────  │
│  Agent pense en termes d'INTENT:                                │
│  "Je veux analyser les commits de cette semaine"                │
│  → Casys PML trouve les tools pertinents                       │
│  → Suggère une capability existante si disponible               │
│  → Ou compose automatiquement                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Pattern: Capability Crystallization

```
Exécutions répétées ──► Pattern détecté ──► Capability explicite
        │                      │                    │
        │                      │                    │
   (GraphRAG edges)      (Louvain cluster)    (workflow_pattern)
        │                      │                    │
        ▼                      ▼                    ▼
   Implicit learning    Community formed      Code + Intent stored
```

### Anti-Pattern Évité: Runtime Discovery

```
❌ ANTI-PATTERN (Docker):
   Code s'exécute → demande tool → reçoit tool → demande autre tool
   → Récursion possible
   → Tracking complexe
   → Sécurité compromise

✅ PATTERN AGENTCARDS:
   Intent → Discovery → Scope FIXÉ → Exécution → Learning
   → Pas de récursion
   → Tracking simple
   → Sécurité maintenue
```

---

## 8. Recommandations

### Recommandation Principale

**Implémenter le paradigme "Emergent Capabilities" en 3 phases:**

### Phase 1: Quick Win - Activer le Learning Réel

**Durée estimée:** 1-2 jours **Complexité:** ~70 lignes de code **Impact:** Débloque tout le
learning

#### Gap 1: Tracking dans wrappers (context-builder.ts)

```typescript
// Ligne ~381, dans wrapMCPClient()
wrapped[methodName] = async (args: Record<string, unknown>): Promise<unknown> => {
  const traceId = crypto.randomUUID();
  const startTs = Date.now();

  // Emit start event
  console.log(`__TRACE__${
    JSON.stringify({
      type: "tool_start",
      tool: `${client.serverId}:${toolName}`,
      trace_id: traceId,
      ts: startTs,
    })
  }`);

  try {
    const result = await client.callTool(toolName, args);

    // Emit end event
    console.log(`__TRACE__${
      JSON.stringify({
        type: "tool_end",
        tool: `${client.serverId}:${toolName}`,
        trace_id: traceId,
        success: true,
        duration_ms: Date.now() - startTs,
      })
    }`);

    return result;
  } catch (error) {
    console.log(`__TRACE__${
      JSON.stringify({
        type: "tool_end",
        tool: `${client.serverId}:${toolName}`,
        trace_id: traceId,
        success: false,
        duration_ms: Date.now() - startTs,
      })
    }`);
    throw error;
  }
};
```

#### Gap 2-3: Parser et appeler GraphRAG (gateway-server.ts)

```typescript
// Après exécution sandbox, parser stdout
function parseTraces(stdout: string): string[] {
  const traces = stdout.split("\n")
    .filter((l) => l.startsWith("__TRACE__"))
    .map((l) => JSON.parse(l.slice(9)));

  return traces
    .filter((t) => t.type === "tool_end" && t.success)
    .map((t) => t.tool);
}

// Dans handleExecuteCode, après succès
const toolsUsed = parseTraces(result.stdout || "");

if (result.success && request.intent && toolsUsed.length > 0) {
  await this.graphEngine.updateFromExecution({
    execution_id: crypto.randomUUID(),
    executed_at: new Date(),
    intent_text: request.intent,
    dag_structure: {
      tasks: toolsUsed.map((tool, i) => ({
        id: `code_task_${i}`,
        tool,
        arguments: {},
        depends_on: [],
      })),
    },
    success: true,
    execution_time_ms: executionTimeMs,
  });
}
```

### Phase 2: Capabilities Émergentes

**Durée estimée:** 1 semaine **Dépendance:** Phase 1 complétée

#### Migration: Activer workflow_pattern

```sql
-- Migration 011: Extend workflow_pattern for capabilities
ALTER TABLE workflow_pattern ADD COLUMN IF NOT EXISTS code_snippet TEXT;
ALTER TABLE workflow_pattern ADD COLUMN IF NOT EXISTS parameters JSONB;
ALTER TABLE workflow_pattern ADD COLUMN IF NOT EXISTS cache_config JSONB;
ALTER TABLE workflow_pattern ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE workflow_pattern ADD COLUMN IF NOT EXISTS success_rate REAL DEFAULT 0;

-- Index pour recherche par intent
CREATE INDEX IF NOT EXISTS idx_workflow_pattern_intent
ON workflow_pattern USING hnsw (intent_embedding vector_cosine_ops);
```

#### Capability Matcher

```typescript
// Nouveau fichier: src/capabilities/matcher.ts
export class CapabilityMatcher {
  constructor(private db: PGliteClient, private embedder: BGE_M3) {}

  async findMatch(intent: string, threshold = 0.85): Promise<Capability | null> {
    const embedding = await this.embedder.embed(intent);

    const result = await this.db.query(
      `
      SELECT
        pattern_id as id,
        name,
        code_snippet as code,
        dag_structure,
        parameters,
        1 - (intent_embedding <=> $1::vector) AS score
      FROM workflow_pattern
      WHERE 1 - (intent_embedding <=> $1::vector) > $2
        AND success_rate > 0.7
      ORDER BY score DESC, usage_count DESC
      LIMIT 1
    `,
      [JSON.stringify(embedding), threshold],
    );

    return result[0] || null;
  }

  async promoteToCapability(
    intent: string,
    code: string,
    toolsUsed: string[],
    executionId: string,
  ): Promise<void> {
    const embedding = await this.embedder.embed(intent);
    const hash = this.hashCode(code);

    await this.db.query(
      `
      INSERT INTO workflow_pattern
        (pattern_hash, intent_embedding, dag_structure, code_snippet, usage_count, success_count)
      VALUES ($1, $2, $3, $4, 1, 1)
      ON CONFLICT (pattern_hash) DO UPDATE SET
        usage_count = workflow_pattern.usage_count + 1,
        success_count = workflow_pattern.success_count + 1,
        last_used = NOW()
    `,
      [hash, JSON.stringify(embedding), JSON.stringify({ tasks: toolsUsed }), code],
    );
  }
}
```

### Phase 3: Suggestion Engine

**Durée estimée:** 1 semaine **Dépendance:** Phase 2 complétée

```typescript
// Nouveau fichier: src/capabilities/suggestions.ts
export class SuggestionEngine {
  constructor(
    private graph: GraphRAGEngine,
    private capabilityMatcher: CapabilityMatcher,
  ) {}

  async suggest(contextTools: string[]): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // 1. Capabilities de la même community (Louvain)
    const communities = contextTools.map((t) => this.graph.getCommunity(t));
    const dominantCommunity = this.mode(communities);

    if (dominantCommunity) {
      const communityCapabilities = await this.getCapabilitiesForCommunity(dominantCommunity);
      for (const cap of communityCapabilities.slice(0, 3)) {
        suggestions.push({
          type: "capability",
          id: cap.id,
          name: cap.name,
          reason: `Souvent utilisé avec ${contextTools[0]}`,
          confidence: cap.success_rate,
        });
      }
    }

    // 2. Tools related (Adamic-Adar)
    for (const tool of contextTools) {
      const related = this.graph.computeAdamicAdar(tool, 3);
      for (const r of related) {
        if (!contextTools.includes(r.toolId)) {
          suggestions.push({
            type: "tool",
            toolId: r.toolId,
            reason: `Souvent utilisé avec ${tool}`,
            confidence: Math.min(r.score / 2, 1),
          });
        }
      }
    }

    // 3. Next likely tool (PageRank + out-neighbors)
    const lastTool = contextTools[contextTools.length - 1];
    const outNeighbors = this.graph.getNeighbors(lastTool, "out");
    for (const neighbor of outNeighbors.slice(0, 2)) {
      suggestions.push({
        type: "next_tool",
        toolId: neighbor,
        reason: `Souvent appelé après ${lastTool}`,
        confidence: this.graph.getPageRank(neighbor),
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }
}
```

---

## 9. Architecture Decision Record (ADR)

```markdown
# ADR-028: Emergent Capabilities System

## Status

Proposed

## Context

Casys PML dispose d'un GraphRAG fonctionnel avec PageRank, Louvain, et Adamic-Adar. Cependant, les
patterns d'exécution de code ne sont pas appris car:

1. Les tools RÉELLEMENT appelés ne sont pas trackés
2. La table workflow_pattern existe mais n'est pas utilisée
3. Aucun système de suggestion proactive n'existe

## Decision Drivers

- Différenciation vs Docker Dynamic MCPs et Anthropic PTC
- Valeur ajoutée par l'apprentissage continu
- Réutilisation de code pour réduire latence et tokens
- UX améliorée via suggestions proactives

## Considered Options

1. **Docker-style:** Runtime discovery avec mcp-find/mcp-add
2. **Status quo:** Garder l'architecture actuelle
3. **Emergent Capabilities:** Tracking + Capabilities + Suggestions

## Decision

Option 3: Implémenter le système de Capabilities Émergentes en 3 phases.

## Consequences

### Positive

- Learning réel des patterns d'exécution
- Réutilisation de code (skip génération Claude)
- Suggestions proactives basées sur usage
- Différenciation marché unique

### Negative

- Complexité code légèrement accrue
- Stockage supplémentaire (code snippets)
- Maintenance table capabilities

### Neutral

- Pas de changement au modèle de sécurité (scope fixe maintenu)
- Compatible avec architecture existante

## Implementation Notes

- Phase 1 (Quick Win): ~70 lignes, 1-2 jours
- Phase 2 (Capabilities): ~200 lignes, 1 semaine
- Phase 3 (Suggestions): ~150 lignes, 1 semaine

## References

- ADR-027: Execute Code Graph Learning
- Spike: 2025-12-03-dynamic-mcp-composition.md
- Docker Blog: Dynamic MCPs
- Anthropic: Programmatic Tool Calling
```

---

## 10. Références et Ressources

### Documentation Officielle

- [Anthropic - Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic - Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic - Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Docker - Dynamic MCPs](https://www.docker.com/blog/dynamic-mcps-stop-hardcoding-your-agents-world/)
- [Docker - MCP Toolkit](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/)
- [MCP Specification - Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

### Benchmarks et Case Studies

- [E2B - Sandbox Performance](https://e2b.dev/docs)
- [Koyeb - Top Sandbox Platforms 2025](https://www.koyeb.com/blog/top-sandbox-code-execution-platforms-for-ai-code-execution-2025)
- [Cased - Universal Sandbox API](https://cased.com/blog/2025-10-05-sandboxes)

### Ressources Communautaires

- [Spring AI - Dynamic Tool Updates](https://spring.io/blog/2025/05/04/spring-ai-dynamic-tool-updates-with-mcp/)
- [Keywords AI - MCP Guide 2025](https://www.keywordsai.co/blog/introduction-to-mcp)
- [DEV.to - Multi-Agent Orchestration](https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da)

### Lectures Additionnelles

- [Quanta Magazine - Emergent Abilities in LLMs](https://www.quantamagazine.org/the-unpredictable-abilities-emerging-from-large-ai-models-20230316/)
- [Towards Data Science - Emergent Capabilities](https://towardsdatascience.com/understanding-emergent-capabilities-in-llms-lessons-from-biological-systems-d59b67ea0379/)
- [Atlassian - AI Agentic Workflows](https://www.atlassian.com/blog/artificial-intelligence/ai-agentic-workflows)

### Code Interne Référencé

- `src/graphrag/graph-engine.ts` - GraphRAG avec Graphology
- `src/sandbox/context-builder.ts` - Injection tools
- `src/sandbox/cache.ts` - Cache LRU
- `src/sandbox/executor.ts` - Deno sandbox
- `docs/spikes/2025-12-03-dynamic-mcp-composition.md` - Spike original
- `docs/adrs/ADR-027-execute-code-graph-learning.md` - ADR related

---

## Appendices

### Appendix A: Matrice de Comparaison Complète

| Fonctionnalité  | Docker MCP | Anthropic PTC | Casys PML Actuel | Casys PML Proposé  |
| --------------- | ---------- | ------------- | ---------------- | ------------------ |
| **DISCOVERY**   |            |               |                  |                    |
| Timing          | Runtime    | Pre-config    | Pre-exec         | Pre-exec + Match   |
| Method          | Catalog    | Static        | Semantic+Graph   | Semantic+Graph+Cap |
| Dynamic add     | ✅         | ❌            | ❌               | ❌                 |
| **EXECUTION**   |            |               |                  |                    |
| Sandbox         | Container  | Python        | Deno             | Deno               |
| Cold start      | ~500ms     | ~200ms        | ~150ms           | ~150ms             |
| IPC             | stdio      | API           | stdout           | stdout+events      |
| **LEARNING**    |            |               |                  |                    |
| Edges           | ❌         | ❌            | ✅               | ✅                 |
| Patterns        | ❌         | ❌            | ⚠️               | ✅                 |
| Capabilities    | ❌         | ❌            | ❌               | ✅                 |
| **ALGORITHMS**  |            |               |                  |                    |
| PageRank        | ❌         | ❌            | ✅               | ✅                 |
| Louvain         | ❌         | ❌            | ✅               | ✅                 |
| Adamic-Adar     | ❌         | ❌            | ✅               | ✅                 |
| **CACHE**       |            |               |                  |                    |
| Code results    | ❌         | ❌            | ✅               | ✅                 |
| Capabilities    | ❌         | ❌            | ❌               | ✅                 |
| **SUGGESTIONS** |            |               |                  |                    |
| Related tools   | ❌         | ❌            | ✅               | ✅                 |
| Proactive       | ❌         | ❌            | ❌               | ✅                 |

### Appendix B: Diagramme de Flux Complet

```
┌─────────────────────────────────────────────────────────────────┐
│  USER REQUEST                                                    │
│  "Analyze commits this week and create a summary"               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAPABILITY CHECK                                                │
│  CapabilityMatcher.findMatch(intent)                            │
│  → Vector search sur workflow_pattern.intent_embedding          │
│  → Score > 0.85 && success_rate > 0.7?                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        MATCH FOUND                 NO MATCH
              │                           │
              ▼                           ▼
┌─────────────────────────┐  ┌─────────────────────────────────────┐
│  EXECUTE CAPABILITY     │  │  GENERATE NEW CODE                  │
│  • Load code_snippet    │  │  • VectorSearch.searchTools(intent) │
│  • Check result cache   │  │  • GraphRAG.searchToolsHybrid()     │
│  • Execute if miss      │  │  • Claude generates code            │
│  • Update stats         │  │  • ContextBuilder.buildContext()    │
└───────────┬─────────────┘  └───────────────┬─────────────────────┘
            │                                │
            └────────────┬───────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  SANDBOX EXECUTION                                               │
│  DenoSandboxExecutor.execute(code, context)                     │
│  • Wrappers emit __TRACE__ events                               │
│  • Tools called via MCPClient                                   │
│  • Result collected                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST-EXECUTION LEARNING                                         │
│  • Parse __TRACE__ → toolsUsed[]                                │
│  • GraphRAG.updateFromExecution(toolsUsed)                      │
│  • Pattern récurrent? → CapabilityMatcher.promote()             │
│  • Cache result if cacheable                                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  RETURN TO CLAUDE                                                │
│  {                                                               │
│    success: true,                                                │
│    data: { summary: "...", topContributors: [...] },            │
│    suggestions: [                                                │
│      { type: "capability", name: "weekly-report", ... },        │
│      { type: "tool", toolId: "slack:post_message", ... }        │
│    ]                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Appendix C: Estimation des Coûts

| Composant        | Stockage        | Compute         | Notes                  |
| ---------------- | --------------- | --------------- | ---------------------- |
| workflow_pattern | ~1KB/capability | N/A             | ~1000 caps = 1MB       |
| Code snippets    | ~2KB/snippet    | N/A             | ~1000 = 2MB            |
| Embeddings       | 4KB/embedding   | ~50ms/embed     | BGE-M3 1024 dims       |
| Cache results    | ~10KB/entry     | N/A             | LRU max 100 = 1MB      |
| **Total**        | **~5MB**        | **Négligeable** | Pour 1000 capabilities |

---

## Document Information

**Workflow:** BMad Research Workflow - Technical Research v2.0 **Generated:** 2025-12-03 **Research
Type:** Technical/Architecture Research **Next Review:** Après implémentation Phase 1

---

_Ce rapport de recherche technique a été généré en utilisant le BMad Method Research Workflow,
combinant une évaluation systématique des technologies avec une recherche en temps réel et une
analyse du code existant._
