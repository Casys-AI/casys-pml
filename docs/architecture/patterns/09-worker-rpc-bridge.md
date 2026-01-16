# Pattern 6: Worker RPC Bridge & Emergent Capabilities (Epic 7)

> **Note:** This document describes the **server-side** `WorkerBridge` (`src/sandbox/`).
> For the **client-side** `SandboxWorker` (`@casys/pml`), see [packages/pml/docs/ARCHITECTURE.md](../../../packages/pml/docs/ARCHITECTURE.md).

**Status:** 🟡 IN PROGRESS (Story 7.1 done, Story 7.1b planned)

**Problem:** MCP client functions cannot be serialized to subprocess
(`JSON.stringify(function) → undefined`). The original `wrapMCPClient()` approach silently failed.
Additionally, stdout-based tracing (`__TRACE__`) is fragile and collides with user console.log.

**Solution Architecture (ADR-032):**

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: ORCHESTRATION (Claude)                                 │
│  • Reçoit l'intent utilisateur                                   │
│  • Query: "Capability existante?" → YES: execute cached          │
│  • NO: génère code → execute → learn                             │
│  • NE VOIT PAS: données brutes, traces, détails exécution        │
└─────────────────────────────────────────────────────────────────┘
                          ▲ IPC: result + suggestions
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: CAPABILITY ENGINE + RPC BRIDGE                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Capability   │  │   Worker     │  │  Suggestion  │           │
│  │   Matcher    │  │   Bridge     │  │    Engine    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│         │                 │                  │                   │
│         │     Native Tracing (ALL calls)     │                   │
│         └─────────────────┼──────────────────┘                   │
│              GraphRAG (PageRank, Louvain, Adamic-Adar)          │
└─────────────────────────────────────────────────────────────────┘
                          ▲ postMessage RPC (tool calls)
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: EXECUTION (Deno Worker, permissions: "none")           │
│  • Tool proxies: mcp.server.tool() → RPC to bridge               │
│  • Capabilities: inline functions (Option B - no RPC overhead)   │
│  • Isolation complète, pas de discovery runtime                  │
└─────────────────────────────────────────────────────────────────┘
```

**Worker RPC Bridge Components:**

```typescript
// Main Process → Worker communication
Main Process                          Worker (permissions: "none")
┌─────────────────┐                  ┌─────────────────────────────┐
│ MCPClients      │                  │ const mcp = {               │
│ WorkerBridge    │◄─── postMessage ─│   fs: { read: (a) =>        │
│   - traces[]    │                  │     __rpcCall("fs","read",a)│
│   - callTool()  │─── postMessage ──►│   }                        │
│                 │                  │ };                          │
└─────────────────┘                  │ // User code runs here      │
                                     └─────────────────────────────┘
```

**RPC Message Types:**

```typescript
interface RPCCallMessage {
  type: "rpc_call";
  id: string;
  server: string;
  tool: string;
  args: unknown;
}

interface RPCResultMessage {
  type: "rpc_result";
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}
```

**Capability Lifecycle (Eager Learning):**

```
PHASE 1: EXECUTE & LEARN (Eager - dès exec 1)
  Intent → VectorSearch → Tools → Execute → Track via IPC
  → Success? UPSERT workflow_pattern immédiatement
  → ON CONFLICT: usage_count++, update success_rate
  → Capability discoverable IMMÉDIATEMENT

PHASE 2: CAPABILITY MATCHING
  Intent → CapabilityMatcher.findMatch() → MATCH (score > adaptive threshold)
  → Filter: success_rate > 0.7 (quality gate)
  → Cache hit? Return cached result
  → Cache miss? Execute code_snippet → cache result

PHASE 3: LAZY SUGGESTIONS
  SuggestionEngine.suggest(context) avec filtres adaptatifs:
  → usage_count >= 2 (validé par répétition)
  → OU success_rate > 0.9 (validé par qualité)
  → Évite de suggérer les one-shots non validés
```

**Key Components (Epic 7):**

| Component               | File                                    | Purpose                       |
| ----------------------- | --------------------------------------- | ----------------------------- |
| WorkerBridge            | `src/sandbox/worker-bridge.ts`          | RPC bridge, native tracing    |
| SandboxWorker           | `src/sandbox/sandbox-worker.ts`         | Isolated execution context    |
| CapabilityMatcher       | `src/capabilities/matcher.ts`           | Intent → capability matching  |
| SchemaInferrer          | `src/capabilities/schema-inferrer.ts`   | SWC-based parameter inference |
| SuggestionEngine        | `src/capabilities/suggestion-engine.ts` | Proactive recommendations     |
| CapabilityCodeGenerator | `src/capabilities/code-generator.ts`    | Inline function generation    |

**Database Extensions (Migration 011):**

```sql
-- Extend workflow_pattern for capabilities
ALTER TABLE workflow_pattern ADD COLUMN code_snippet TEXT;
ALTER TABLE workflow_pattern ADD COLUMN parameters_schema JSONB;
ALTER TABLE workflow_pattern ADD COLUMN cache_config JSONB;
ALTER TABLE workflow_pattern ADD COLUMN success_rate REAL DEFAULT 1.0;
ALTER TABLE workflow_pattern ADD COLUMN avg_duration_ms INTEGER;
ALTER TABLE workflow_pattern ADD COLUMN source TEXT DEFAULT 'emergent';

-- Extend workflow_execution for tracing
ALTER TABLE workflow_execution ADD COLUMN code_snippet TEXT;
ALTER TABLE workflow_execution ADD COLUMN code_hash TEXT;

-- Capability result cache
CREATE TABLE capability_cache (
  capability_id UUID REFERENCES workflow_pattern(id),
  params_hash TEXT,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (capability_id, params_hash)
);
```

**Performance Targets:**

- RPC overhead: <10ms per call
- Capability matching: <200ms
- Schema inference (SWC): <50ms
- Suggestion generation: <100ms

---

## Capability Data Model Extensions

### Hierarchical Tracing (ADR-041)

Les traces d'exécution supportent une hiérarchie parent/child pour le debugging :

```typescript
interface TraceEntry {
  trace_id: string;
  parent_trace_id?: string; // NEW - Lien vers trace parente
  tool_id: string;
  started_at: Date;
  completed_at: Date;
  success: boolean;
}

// Permet de reconstruire l'arbre d'exécution
// Capability → Tool 1 → SubTool A
//            → Tool 2 → SubTool B
```

### Tool Sequence vs Deduplication (ADR-047)

Deux représentations complémentaires dans `dag_structure` :

```typescript
interface DAGStructure {
  // Pour les algorithmes (scoring, matching) - DÉDUPLIQUÉ
  tools_used: string[]; // ["read_file", "list_directory"]

  // Pour la visualisation et replay - SÉQUENCE COMPLÈTE
  tool_invocations: ToolInvocation[]; // Avec timestamps et ordre
}

interface ToolInvocation {
  id: string; // "read_file#0", "read_file#1"
  tool: string; // "read_file"
  ts: number; // Timestamp
  sequenceIndex: number; // 0, 1, 2...
}
```

### All Tools Must Succeed (ADR-043)

Condition de sauvegarde d'une capability :

```typescript
// Une capability n'est sauvegardée QUE si tous les tools ont réussi
const canSaveCapability = execution.traces.every((t) => t.success);

if (!canSaveCapability) {
  // Log mais ne pas sauvegarder - évite les capabilities cassées
  logger.warn("Capability not saved: partial failure");
}
```

### Capability-to-Capability Dependencies (ADR-045)

Table dédiée pour les relations entre capabilities :

```sql
CREATE TABLE capability_dependency (
  from_capability_id UUID REFERENCES workflow_pattern(id),
  to_capability_id UUID REFERENCES workflow_pattern(id),
  edge_type TEXT CHECK (edge_type IN ('dependency', 'sequence', 'alternative')),
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (from_capability_id, to_capability_id)
);
```

**Edge Types:**

- `dependency`: A requiert B pour fonctionner
- `sequence`: A est généralement suivi de B
- `alternative`: A et B sont interchangeables

---

**Affects Epics:** Epic 7 (Stories 7.1b-7.5)

**References:**

- ADR-027: Execute Code Graph Learning
- ADR-028: Emergent Capabilities System
- ADR-032: Sandbox Worker RPC Bridge
- ADR-041: Hierarchical Trace Tracking
- ADR-043: All Tools Must Succeed
- ADR-045: Capability-to-Capability Dependencies
- ADR-047: Tool Sequence vs Deduplication
- Research: `docs/research/research-technical-2025-12-03.md`

**Design Philosophy:** Capabilities emerge from usage rather than being pre-defined. The system
learns continuously from execution patterns to crystallize reusable capabilities, offering unique
differentiation versus competitors.

---
