# ADR-028: Emergent Capabilities System

## Status

Proposed

## Context

Avec ADR-027 (Execute Code Graph Learning), AgentCards peut apprendre des patterns d'exécution de code. Cependant, cette connaissance reste **implicite** dans le graphe (edges entre tools).

L'objectif de cet ADR est de définir comment faire **émerger des capabilities explicites** de l'usage - créant un nouveau paradigme où Claude devient un orchestrateur de haut niveau qui délègue l'exécution à AgentCards.

### État Actuel vs Vision

```
┌─────────────────────────────────────────────────────────────────┐
│  AUJOURD'HUI: Implicit Learning                                  │
│                                                                  │
│  Intent → VectorSearch → Tools → Execute → Learn edges          │
│                                                                  │
│  ❌ Pas de réutilisation de code                                 │
│  ❌ Pas de suggestions proactives                                │
│  ❌ Claude génère le code à chaque fois                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  VISION: Emergent Capabilities                                   │
│                                                                  │
│  Intent → CapabilityMatch? → YES → Execute cached code          │
│                            → NO  → Generate → Execute → Promote │
│                                                                  │
│  ✅ Réutilisation de code prouvé                                 │
│  ✅ Suggestions basées sur communities Louvain                   │
│  ✅ Claude orchestre, AgentCards exécute                         │
└─────────────────────────────────────────────────────────────────┘
```

### Comparaison Marché

| Approche | Learning | Suggestions | Code Reuse | Sécurité |
|----------|----------|-------------|------------|----------|
| Docker Dynamic MCP | ❌ | ❌ | ❌ | Container |
| Anthropic PTC | ❌ | ❌ | ❌ | Sandbox |
| **AgentCards** | ✅ GraphRAG | ✅ Louvain/AA | ✅ Capabilities | Sandbox |

### Triggers

- Research technique 2025-12-03 (comparaison Docker, Anthropic)
- ADR-027 implémentation IPC pour tracking
- Table `workflow_pattern` existante mais inutilisée
- Demande d'un paradigme "Agent comme Orchestrateur"

## Decision Drivers

1. **Différenciation marché** - Unique selling point vs concurrents
2. **Performance** - Skip génération Claude (~2-5s) si capability existe
3. **Apprentissage continu** - Le système s'améliore avec l'usage
4. **UX** - Suggestions proactives réduisent la charge cognitive

## Considered Options

### Option A: Status Quo
Garder le learning implicite (edges GraphRAG seulement).

**Pros:** Simple, déjà implémenté
**Cons:** Pas de réutilisation, pas de suggestions

### Option B: Capability Store Simple
Stocker code + intent sans détection automatique.

**Pros:** Plus simple que C
**Cons:** Manuel, pas d'émergence

### Option C: Emergent Capabilities (Recommandé)
Système complet avec détection automatique, promotion, suggestions.

**Pros:** Différenciateur fort, autonome
**Cons:** Plus complexe

## Decision

**Option C: Emergent Capabilities System**

Implémenter un système où les capabilities émergent automatiquement de l'usage répété.

## Architecture

### Couches du Système

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: ORCHESTRATION (Claude)                                 │
│                                                                  │
│  • Reçoit l'intent utilisateur                                   │
│  • Appelle `search_capabilities` ou `execute_code`              │
│  • Reçoit résultat + suggestions                                │
│  • NE VOIT PAS: données brutes, traces, détails exécution       │
└─────────────────────────────────────────────────────────────────┘
                          ▲
                          │ IPC: result + suggestions
                          │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: CAPABILITY ENGINE                                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Capability   │  │   Snippet    │  │  Suggestion  │           │
│  │   Matcher    │  │   Library    │  │    Engine    │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         └─────────────────┼─────────────────┘                    │
│                           │                                      │
│              ┌────────────▼────────────┐                         │
│              │       GraphRAG          │                         │
│              │  PageRank │ Louvain │   │                         │
│              │  Adamic-Adar │ Paths    │                         │
│              └─────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                          ▲
                          │ __TRACE__ events
                          │
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: EXECUTION (Deno Sandbox)                               │
│                                                                  │
│  • Code injecté avec wrappers tracés (ADR-027)                  │
│  • Appels MCP via client sécurisé                               │
│  • Émission traces: tool_start, tool_end, progress              │
│  • Isolation complète (no runtime discovery)                    │
└─────────────────────────────────────────────────────────────────┘
```

### IPC: Communication Sandbox ↔ Parent

**Décision (voir ADR-027):** stdout avec préfixe `__TRACE__`

```
┌─────────────────────────────────────────────────────────────────┐
│  SANDBOX → PARENT: Event Stream                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  __TRACE__{"type":"tool_start","tool":"github:list_commits"...} │
│  __TRACE__{"type":"tool_end","tool":"github:list_commits",...}  │
│  __TRACE__{"type":"progress","message":"Processing","done":50}  │
│  Regular console.log output (non-trace)                         │
│  __TRACE__{"type":"tool_start","tool":"memory:store",...}       │
│  __TRACE__{"type":"tool_end","tool":"memory:store",...}         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼ Parsed by Gateway
┌─────────────────────────────────────────────────────────────────┐
│  EXTRACTED TRACE DATA                                            │
├─────────────────────────────────────────────────────────────────┤
│  tools_called: ["github:list_commits", "memory:store"]          │
│  total_duration: 2340ms                                          │
│  tool_stats: [                                                   │
│    { tool: "github:list_commits", success: true, ms: 1850 },    │
│    { tool: "memory:store", success: true, ms: 420 }             │
│  ]                                                               │
└─────────────────────────────────────────────────────────────────┘
```

#### Pourquoi stdout et pas stderr/pipe/socket?

| Option | Pour | Contre |
|--------|------|--------|
| **stdout + prefix** | Deno-native, simple, streamable | Mélangé avec output |
| stderr | Séparé de stdout | Convention = erreurs |
| Named pipe | Propre | Plomberie OS, pas portable |
| Unix socket | Bidirectionnel | Overkill, complexe |
| File temporaire | Simple | Pas de streaming, I/O |

**Verdict:** `__TRACE__` prefix sur stdout avec parsing côté Gateway.

#### Event Types Complets

```typescript
// Fichier: src/sandbox/ipc-types.ts

/**
 * IPC Event Types for Sandbox → Parent communication
 */
export type IPCEvent =
  // Tool lifecycle
  | {
      type: "tool_start";
      tool: string;          // "server:tool_name"
      trace_id: string;      // UUID for correlation
      ts: number;            // Unix timestamp ms
    }
  | {
      type: "tool_end";
      tool: string;
      trace_id: string;
      success: boolean;
      duration_ms: number;
      error?: string;        // Only if success=false
    }
  // Progress for long tasks (Future)
  | {
      type: "progress";
      message: string;
      done?: number;
      total?: number;
      percent?: number;
    }
  // Debug logging (opt-in)
  | {
      type: "log";
      level: "debug" | "info" | "warn";
      message: string;
      data?: Record<string, unknown>;
    }
  // Capability hint (code can suggest capabilities)
  | {
      type: "capability_hint";
      name: string;
      description: string;
      tools_used: string[];
    };

/**
 * Serialization helper
 */
export function emitTrace(event: IPCEvent): void {
  console.log(`__TRACE__${JSON.stringify(event)}`);
}

/**
 * Parse traces from stdout
 */
export function parseTraces(stdout: string): IPCEvent[] {
  const events: IPCEvent[] = [];

  for (const line of stdout.split('\n')) {
    if (line.startsWith('__TRACE__')) {
      try {
        events.push(JSON.parse(line.slice(9)));
      } catch {
        // Ignore malformed
      }
    }
  }

  return events;
}
```

### Capability Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: COLD START (0-3 exécutions d'un pattern)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Intent: "analyze commits"                                       │
│       │                                                          │
│       ▼                                                          │
│  VectorSearch + Hybrid → [github:list_commits, memory:store]    │
│       │                                                          │
│       ▼                                                          │
│  Claude génère code → Execute → Track tools via IPC             │
│       │                                                          │
│       ▼                                                          │
│  GraphRAG: updateFromExecution() → edges créés                  │
│       │                                                          │
│       ▼                                                          │
│  Store in workflow_execution (not yet a capability)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: PATTERN DETECTION (3+ exécutions similaires)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Background job (ou trigger):                                    │
│       │                                                          │
│       ▼                                                          │
│  Query workflow_execution:                                       │
│    - Group by tools_used (set comparison)                       │
│    - Filter: count >= 3 AND success_rate > 0.7                  │
│       │                                                          │
│       ▼                                                          │
│  Pattern candidat détecté:                                       │
│    tools: [github:list_commits, memory:store]                   │
│    count: 5, success_rate: 0.8                                  │
│       │                                                          │
│       ▼                                                          │
│  Extract best code snippet:                                      │
│    - Fastest successful execution                               │
│    - Most complete (all tools called)                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: CAPABILITY PROMOTION                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INSERT INTO workflow_pattern:                                   │
│    - pattern_hash: hash(sorted tools)                           │
│    - intent_embedding: embed(representative intent)             │
│    - dag_structure: { tasks: [...] }                            │
│    - code_snippet: best code from phase 2                       │
│    - name: auto-generated or null                               │
│    - usage_count: N                                             │
│    - success_rate: 0.8                                          │
│       │                                                          │
│       ▼                                                          │
│  Capability now discoverable via:                               │
│    - Intent similarity (vector search)                          │
│    - Community membership (Louvain)                             │
│    - Explicit search_capabilities tool                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: CAPABILITY USAGE                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Intent: "analyze commits from last week"                        │
│       │                                                          │
│       ▼                                                          │
│  CapabilityMatcher.findMatch(intent, threshold=0.85)            │
│       │                                                          │
│       ▼                                                          │
│  MATCH: capability "analyze-commits" (score=0.92)               │
│       │                                                          │
│       ├── Cache hit? → Return cached result                     │
│       │                                                          │
│       └── Cache miss → Execute code_snippet                     │
│              │                                                   │
│              ▼                                                   │
│           Update stats: usage_count++, recalc success_rate      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema

#### Migration: Extend workflow_pattern

```sql
-- Migration 011: Emergent Capabilities (ADR-028)

-- Extend workflow_pattern for capability storage
ALTER TABLE workflow_pattern
  ADD COLUMN IF NOT EXISTS code_snippet TEXT,
  ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cache_config JSONB DEFAULT '{"ttl_seconds": 300, "cacheable": true}',
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS success_rate REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'emergent'; -- 'emergent' | 'manual'

-- Index for capability matching by intent similarity
CREATE INDEX IF NOT EXISTS idx_workflow_pattern_intent_hnsw
ON workflow_pattern USING hnsw (intent_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for finding patterns by tools used
CREATE INDEX IF NOT EXISTS idx_workflow_pattern_hash
ON workflow_pattern (pattern_hash);

-- Store execution code for learning
ALTER TABLE workflow_execution
  ADD COLUMN IF NOT EXISTS code_snippet TEXT,
  ADD COLUMN IF NOT EXISTS code_hash TEXT;

-- Index for grouping similar executions
CREATE INDEX IF NOT EXISTS idx_workflow_execution_code_hash
ON workflow_execution (code_hash);
```

### Suggestion Engine

```typescript
// Fichier: src/capabilities/suggestion-engine.ts

export interface Suggestion {
  type: "capability" | "tool" | "next_tool";
  id?: string;           // Capability ID
  toolId?: string;       // Tool ID
  name?: string;
  reason: string;
  confidence: number;    // 0-1
}

export class SuggestionEngine {
  constructor(
    private graph: GraphRAGEngine,
    private db: PGliteClient
  ) {}

  /**
   * Generate suggestions based on current context
   *
   * Uses:
   * - Louvain communities for related capabilities
   * - Adamic-Adar for related tools
   * - Out-neighbors for next likely tools
   */
  async suggest(contextTools: string[]): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    if (contextTools.length === 0) return suggestions;

    // 1. Find dominant community (Louvain)
    const communities = contextTools
      .map(t => this.graph.getCommunity(t))
      .filter(Boolean);

    const dominantCommunity = this.mode(communities);

    // 2. Suggest capabilities from same community
    if (dominantCommunity) {
      const caps = await this.getCapabilitiesForCommunity(dominantCommunity);
      for (const cap of caps.slice(0, 3)) {
        suggestions.push({
          type: "capability",
          id: cap.pattern_id,
          name: cap.name || `Pattern ${cap.pattern_id.slice(0, 8)}`,
          reason: `Often used with ${contextTools[0]}`,
          confidence: cap.success_rate,
        });
      }
    }

    // 3. Related tools via Adamic-Adar
    for (const tool of contextTools.slice(0, 2)) {
      const related = this.graph.computeAdamicAdar(tool, 3);
      for (const r of related) {
        if (!contextTools.includes(r.toolId)) {
          suggestions.push({
            type: "tool",
            toolId: r.toolId,
            reason: `Related to ${tool}`,
            confidence: Math.min(r.score / 2, 1),
          });
        }
      }
    }

    // 4. Next likely tool (out-neighbors of last tool)
    const lastTool = contextTools[contextTools.length - 1];
    const outNeighbors = this.graph.getNeighbors(lastTool, "out");

    for (const neighbor of outNeighbors.slice(0, 2)) {
      if (!contextTools.includes(neighbor)) {
        const edge = this.graph.getEdgeData(lastTool, neighbor);
        suggestions.push({
          type: "next_tool",
          toolId: neighbor,
          reason: `Often follows ${lastTool}`,
          confidence: edge?.weight || 0.5,
        });
      }
    }

    // Sort by confidence and dedupe
    return this.dedupeAndSort(suggestions).slice(0, 5);
  }

  private async getCapabilitiesForCommunity(
    community: string
  ): Promise<Array<{ pattern_id: string; name: string; success_rate: number }>> {
    // Query capabilities whose tools are in this community
    const result = await this.db.query(`
      SELECT DISTINCT wp.pattern_id, wp.name, wp.success_rate
      FROM workflow_pattern wp
      WHERE wp.success_rate > 0.6
        AND wp.promoted_at IS NOT NULL
      ORDER BY wp.usage_count DESC, wp.success_rate DESC
      LIMIT 10
    `);

    // Filter by community membership
    return result.filter((cap: any) => {
      const tools = cap.dag_structure?.tasks?.map((t: any) => t.tool) || [];
      return tools.some((t: string) => this.graph.getCommunity(t) === community);
    });
  }

  private mode(arr: (string | undefined)[]): string | undefined {
    const counts = new Map<string, number>();
    for (const item of arr) {
      if (item) counts.set(item, (counts.get(item) || 0) + 1);
    }
    let max = 0;
    let result: string | undefined;
    for (const [k, v] of counts) {
      if (v > max) { max = v; result = k; }
    }
    return result;
  }

  private dedupeAndSort(suggestions: Suggestion[]): Suggestion[] {
    const seen = new Set<string>();
    return suggestions
      .filter(s => {
        const key = s.id || s.toolId || s.name || "";
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }
}
```

### New MCP Tool: search_capabilities

```typescript
// Dans gateway-server.ts, nouveau tool

{
  name: "search_capabilities",
  description: "Search for reusable capabilities (learned patterns of tool usage). Returns capabilities matching the intent that can be executed directly.",
  inputSchema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        description: "What you want to accomplish (e.g., 'analyze git commits')"
      },
      threshold: {
        type: "number",
        description: "Minimum similarity score (0-1). Default: 0.8"
      },
      include_suggestions: {
        type: "boolean",
        description: "Include related capability suggestions. Default: true"
      }
    },
    required: ["intent"]
  }
}

// Handler
async handleSearchCapabilities(request: {
  intent: string;
  threshold?: number;
  include_suggestions?: boolean;
}): Promise<{
  capabilities: Capability[];
  suggestions?: Suggestion[];
}> {
  const threshold = request.threshold ?? 0.8;

  // 1. Search capabilities by intent
  const capabilities = await this.capabilityMatcher.search(
    request.intent,
    threshold,
    5
  );

  // 2. Get suggestions if requested
  let suggestions: Suggestion[] | undefined;
  if (request.include_suggestions !== false) {
    const contextTools = capabilities
      .flatMap(c => c.dag_structure.tasks.map(t => t.tool));
    suggestions = await this.suggestionEngine.suggest(contextTools);
  }

  return { capabilities, suggestions };
}
```

## Implementation Plan

### Phase 1: IPC Tracking (ADR-027)
**Status:** Ready to implement
**Effort:** 1-2 jours
**Files:** `context-builder.ts`, `gateway-server.ts`

### Phase 2: Capability Storage
**Effort:** 2-3 jours
**Tasks:**
1. Migration 011 (schema)
2. `CapabilityMatcher` class
3. Store code_snippet in workflow_execution
4. Pattern detection query

### Phase 3: Capability Matching
**Effort:** 2-3 jours
**Tasks:**
1. `search_capabilities` tool
2. Intent → capability matching
3. Execute capability code
4. Stats update

### Phase 4: Suggestion Engine
**Effort:** 2-3 jours
**Tasks:**
1. `SuggestionEngine` class
2. Louvain-based suggestions
3. Adamic-Adar related tools
4. Include in execute_code response

### Phase 5: Auto-promotion (Background)
**Effort:** 2-3 jours
**Tasks:**
1. Pattern detection job
2. Code snippet selection
3. Auto-naming (optional)
4. Promotion threshold tuning

## Cache Strategy

### État Actuel vs Cible

| Feature | Actuel | Cible | Notes |
|---------|--------|-------|-------|
| Cache par code exact | ✅ `cache.ts` | ✅ Garder | LRU + TTL, hash(code + context) |
| Cache par intent | ❌ | ✅ Phase 3 | Réutiliser result si même intent |
| Cache par capability ID | ❌ | ✅ Phase 3 | Capability → cached result |
| Invalidation triggers | ❌ | ✅ Phase 4 | Tool change → invalide capabilities |

### Architecture Cache Multi-niveaux

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 1: Execution Cache (Existant - cache.ts)                │
├─────────────────────────────────────────────────────────────────┤
│  Key: hash(code + context + tool_versions)                      │
│  TTL: 5 minutes (configurable)                                  │
│  Hit: ~10ms (in-memory LRU)                                     │
│  Use: Même code exact, mêmes args → même résultat               │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Miss
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 2: Capability Cache (Nouveau)                           │
├─────────────────────────────────────────────────────────────────┤
│  Key: capability_id + hash(parameters)                          │
│  TTL: Configurable par capability (default 30 min)              │
│  Storage: PGlite (persist across sessions)                      │
│  Use: Capability connue, params similaires → result caché       │
│                                                                  │
│  Table: capability_cache                                         │
│    - capability_id: UUID (FK workflow_pattern)                  │
│    - params_hash: TEXT                                          │
│    - result: JSONB                                              │
│    - created_at: TIMESTAMPTZ                                    │
│    - expires_at: TIMESTAMPTZ                                    │
│    - hit_count: INTEGER                                         │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Miss
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 3: Intent Similarity Cache (Nouveau)                    │
├─────────────────────────────────────────────────────────────────┤
│  Key: Intent embedding similarity > 0.95                        │
│  TTL: 1 heure                                                   │
│  Use: Intent quasi-identique → suggérer cached result           │
│                                                                  │
│  Note: Plus agressif, optionnel (peut être désactivé)           │
└─────────────────────────────────────────────────────────────────┘
```

### Invalidation Strategy

```typescript
// Fichier: src/capabilities/cache-invalidation.ts

interface InvalidationTrigger {
  type: "tool_schema_change" | "tool_removed" | "manual" | "ttl_expired";
  toolId?: string;
  capabilityId?: string;
  timestamp: Date;
}

/**
 * Invalidation Rules:
 *
 * 1. Tool Schema Change
 *    - MCP server reports tool update
 *    - Invalidate ALL capabilities using this tool
 *    - Reason: Tool behavior may have changed
 *
 * 2. Tool Removed
 *    - MCP server disconnected or tool removed
 *    - Invalidate capabilities, mark as "degraded"
 *    - Reason: Capability can't execute
 *
 * 3. Capability Failure
 *    - Capability execution fails 3+ times
 *    - Invalidate cache, decrease success_rate
 *    - Reason: Stale capability
 *
 * 4. Manual Invalidation
 *    - User/admin explicitly invalidates
 *    - Use case: Known bad data
 */

class CacheInvalidationService {
  constructor(
    private db: PGliteClient,
    private executionCache: CodeExecutionCache
  ) {}

  /**
   * Invalidate caches when tool schema changes
   */
  async onToolSchemaChange(toolId: string): Promise<number> {
    let invalidated = 0;

    // 1. Find capabilities using this tool
    const capabilities = await this.db.query(`
      SELECT pattern_id
      FROM workflow_pattern
      WHERE dag_structure::text LIKE $1
    `, [`%${toolId}%`]);

    // 2. Delete their cached results
    for (const cap of capabilities) {
      const deleted = await this.db.query(`
        DELETE FROM capability_cache
        WHERE capability_id = $1
        RETURNING 1
      `, [cap.pattern_id]);
      invalidated += deleted.length;
    }

    // 3. Invalidate execution cache
    invalidated += this.executionCache.invalidate(toolId);

    // 4. Log event
    await this.logInvalidation({
      type: "tool_schema_change",
      toolId,
      timestamp: new Date(),
    });

    return invalidated;
  }

  /**
   * Invalidate specific capability
   */
  async invalidateCapability(capabilityId: string, reason: string): Promise<void> {
    await this.db.query(`
      DELETE FROM capability_cache
      WHERE capability_id = $1
    `, [capabilityId]);

    await this.logInvalidation({
      type: "manual",
      capabilityId,
      timestamp: new Date(),
    });
  }

  /**
   * Handle capability execution failure
   */
  async onCapabilityFailure(capabilityId: string): Promise<void> {
    // Update failure count
    const result = await this.db.query(`
      UPDATE workflow_pattern
      SET
        failure_count = COALESCE(failure_count, 0) + 1,
        success_rate = success_count::float / (success_count + COALESCE(failure_count, 0) + 1)
      WHERE pattern_id = $1
      RETURNING failure_count
    `, [capabilityId]);

    // If 3+ failures, invalidate cache
    if (result[0]?.failure_count >= 3) {
      await this.invalidateCapability(capabilityId, "repeated_failures");
    }
  }

  private async logInvalidation(trigger: InvalidationTrigger): Promise<void> {
    await this.db.query(`
      INSERT INTO cache_invalidation_log (trigger_type, tool_id, capability_id, timestamp)
      VALUES ($1, $2, $3, $4)
    `, [trigger.type, trigger.toolId, trigger.capabilityId, trigger.timestamp]);
  }
}
```

### Schema Additions for Cache

```sql
-- Migration 011b: Capability Cache Tables

-- Capability result cache
CREATE TABLE IF NOT EXISTS capability_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id UUID NOT NULL REFERENCES workflow_pattern(pattern_id) ON DELETE CASCADE,
  params_hash TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0,

  UNIQUE(capability_id, params_hash)
);

CREATE INDEX idx_capability_cache_lookup
ON capability_cache (capability_id, params_hash)
WHERE expires_at > NOW();

-- Invalidation log (for debugging/audit)
CREATE TABLE IF NOT EXISTS cache_invalidation_log (
  id SERIAL PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  tool_id TEXT,
  capability_id UUID,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  entries_invalidated INTEGER
);

-- Add failure tracking to workflow_pattern
ALTER TABLE workflow_pattern
  ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;
```

### Cache Configuration par Capability

```typescript
// Dans workflow_pattern.cache_config (JSONB)
interface CapabilityCacheConfig {
  // Whether this capability's results can be cached
  cacheable: boolean;  // default: true

  // TTL in seconds (0 = no cache)
  ttl_seconds: number;  // default: 1800 (30 min)

  // Cache key strategy
  key_strategy: "params_hash" | "intent_similarity" | "none";

  // Invalidation triggers
  invalidate_on: Array<
    | "tool_schema_change"  // Any tool in capability changes
    | "daily"               // Invalidate daily (for time-sensitive data)
    | "manual_only"         // Only manual invalidation
  >;

  // Max cached entries per capability
  max_entries: number;  // default: 10
}

// Example configurations:
const CACHE_CONFIGS = {
  // Highly cacheable: static data analysis
  "analyze-codebase": {
    cacheable: true,
    ttl_seconds: 3600,  // 1 hour
    key_strategy: "params_hash",
    invalidate_on: ["tool_schema_change"],
    max_entries: 5,
  },

  // Short cache: real-time data
  "check-github-status": {
    cacheable: true,
    ttl_seconds: 60,  // 1 minute
    key_strategy: "params_hash",
    invalidate_on: ["tool_schema_change", "daily"],
    max_entries: 3,
  },

  // No cache: write operations
  "create-github-issue": {
    cacheable: false,
    ttl_seconds: 0,
    key_strategy: "none",
    invalidate_on: [],
    max_entries: 0,
  },
};
```

### Integration avec Existing Cache

```typescript
// Modification de handleExecuteCode pour cache multi-niveau

async handleExecuteCode(request: ExecuteCodeRequest): Promise<ExecuteCodeResult> {
  // LEVEL 1: Check execution cache (existing)
  const execCacheKey = generateCacheKey(request.code, context, toolVersions);
  const cachedExec = this.executionCache.get(execCacheKey);
  if (cachedExec) {
    return { ...cachedExec.result, cache_hit: "execution" };
  }

  // LEVEL 2: Check capability cache (NEW)
  if (request.capability_id) {
    const paramsHash = hashParams(request.parameters);
    const cachedCap = await this.capabilityCache.get(request.capability_id, paramsHash);
    if (cachedCap) {
      return { ...cachedCap, cache_hit: "capability" };
    }
  }

  // LEVEL 3: Check intent similarity cache (NEW, optional)
  if (request.intent && this.config.intentCacheEnabled) {
    const similar = await this.intentCache.findSimilar(request.intent, 0.95);
    if (similar) {
      return { ...similar.result, cache_hit: "intent_similar", similarity: similar.score };
    }
  }

  // No cache hit: execute
  const result = await this.execute(request);

  // Store in appropriate caches
  if (result.success) {
    this.executionCache.set(execCacheKey, result);

    if (request.capability_id) {
      await this.capabilityCache.set(request.capability_id, paramsHash, result);
    }
  }

  return result;
}
```

## Consequences

### Positive

- **Différenciation unique** - Aucun concurrent n'offre l'apprentissage de capabilities
- **Performance** - Skip génération Claude si capability existe (~2-5s saved)
- **UX** - Suggestions proactives réduisent friction
- **Amélioration continue** - Système apprend de chaque exécution

### Negative

- **Complexité** - Nouveau sous-système à maintenir
- **Stockage** - Code snippets consomment espace
- **Cold start** - Besoin de 3+ exécutions pour promotion

### Neutral

- **Sécurité** - Pas de changement (sandbox isolation maintenue)
- **API** - Nouveau tool optionnel, backward compatible

## Metrics

```typescript
// Métriques à tracker

// Capability discovery
capabilities_searched_total
capabilities_matched_total
capabilities_match_rate // matched / searched

// Capability execution
capabilities_executed_total
capabilities_cache_hits
capabilities_success_rate

// Suggestions
suggestions_generated_total
suggestions_accepted_total // if we track user acceptance

// Promotion
patterns_detected_total
capabilities_promoted_total
promotion_rate // promoted / detected
```

## Future Work

### IPC Streaming Progress
Pour les longues tâches, streamer les events `progress` en temps réel via SSE.

### Manual Capability Creation
Permettre à l'utilisateur de créer des capabilities manuellement:
```typescript
await agentcards.create_capability({
  name: "weekly-report",
  intent: "Generate weekly activity report",
  code: `const commits = await github.listCommits(...); ...`
});
```

### Capability Versioning
Track versions quand le code évolue, permettre rollback.

### Capability Sharing
Export/import de capabilities entre instances AgentCards.

## References

- ADR-027: Execute Code Graph Learning (IPC mechanism)
- Research: `docs/research-technical-2025-12-03.md`
- Spike: `docs/spikes/2025-12-03-dynamic-mcp-composition.md`
- Docker: [Dynamic MCPs Blog](https://www.docker.com/blog/dynamic-mcps-stop-hardcoding-your-agents-world/)
- Anthropic: [Programmatic Tool Calling](https://www.anthropic.com/engineering/advanced-tool-use)
